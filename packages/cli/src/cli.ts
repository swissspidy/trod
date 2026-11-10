import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { defaultServerPath, forge, type ForgeResult } from './forge.ts';
import { acquireLearnLock, checkLedgerHistory, findTranscripts, LEARN_PROMPT, LEDGER_FILE, pickSessions, readLearnState, readLedger, readOutcomes, summarizeLedger, transcriptDir, codexSessionsDir, codexTranscripts, writeDigests, writeLearnState } from './learn.ts';
import { tmpdir } from 'node:os';
import { defaultPackageRoot, init, installClaudeHooks, installedHookCommand, packageVersion } from './init.ts';
import { buildHoldoutReport, buildReport, formatReport, notesSince, sessionMetrics, type SessionMetrics } from './report.ts';
import { notesHook, sessionDelivery } from './delivery.ts';
import { DEFAULT_TUNE_MODEL, DEFAULT_TUNE_PROPOSER, readTuneConfig, splitTasks, tune, TUNE_CONFIG } from './tune.ts';
import { sessionEndHook, setAutoLearn } from './autolearn.ts';
import { doctor, execEnabled, formatDoctor } from './doctor.ts';
import { DETAILS, OVERVIEW, suggestCommand } from './help.ts';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ANTIGRAVITY_NOTES_RULE, codexNotesFile, linkAntigravityNotes, linkCodexNotes, computeStats, formatStats, linkNotes, listToolEntries, loadToolEntry, NOTES_IMPORT, NOTES_MAX_CHARS, promoteTool, readLogs, resolveProjectDir, runToolExamples, trodPaths, verifyNotes, notesPaths, readTrodConfig, writeTrodConfig, type NotesReport, type TrodPaths } from '@trod/server';

export async function main(argv: string[], out: (s: string) => void = console.log): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      logs: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      brief: { type: 'string' },
      model: { type: 'string' },
      server: { type: 'string' },
      budget: { type: 'string' },
      stream: { type: 'string' },
      link: { type: 'boolean', default: false },
      delivery: { type: 'string' },
      holdout: { type: 'string' },
      'no-link': { type: 'boolean', default: false },
      practice: { type: 'string' },
      reset: { type: 'string' },
      from: { type: 'string', multiple: true },
      outcomes: { type: 'string' },
      limit: { type: 'string' },
      all: { type: 'boolean', default: false },
      timeout: { type: 'string' },
      vendor: { type: 'boolean', default: false },
      'allow-exec': { type: 'boolean', default: false },
      antigravity: { type: 'boolean', default: false },
      codex: { type: 'boolean', default: false },
      'auto-approve': { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      config: { type: 'string' },
      iterations: { type: 'string' },
      runs: { type: 'string' },
      margin: { type: 'string' },
      proposer: { type: 'string' },
      parallel: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      auto: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    out(packageVersion(defaultPackageRoot()) ?? 'dev');
    return 0;
  }
  // `trod help <command>`, `trod <command> --help`; without a command, the overview.
  if (command === 'help' || values.help || !command) {
    const topic = command === 'help' ? rest[0] : command;
    if (topic && !DETAILS[topic]) {
      const guess = suggestCommand(topic);
      out(`trod: no command "${topic}"${guess ? ` (did you mean "${guess}"?)` : ''}. Run \`trod help\` for the list.`);
      return 1;
    }
    out(topic ? DETAILS[topic]! : OVERVIEW);
    return command || values.help ? 0 : 1;
  }
  if (values.link && values['no-link']) {
    out('trod: --link and --no-link contradict each other');
    return 1;
  }
  if ((values.link && command !== 'notes') || (values['no-link'] && command !== 'forge' && command !== 'learn')) {
    out(`trod ${command}: ${values.link ? '--link only applies to trod notes' : '--no-link only applies to trod forge and trod learn'}`);
    return 1;
  }
  // setTimeout fires at once for delays above 2^31-1 ms (about 24.8 days).
  if (values.timeout !== undefined && !(Number(values.timeout) > 0 && Number(values.timeout) * 60_000 <= 2_147_483_647)) {
    out('trod: --timeout must be a positive number of minutes (at most 35791)');
    return 1;
  }
  const paths = trodPaths(values.dir ? path.resolve(values.dir) : resolveProjectDir());

  switch (command) {
    case 'mcp': {
      // The server runs in this process until its client disconnects (it exits on stdin close or a signal).
      await import(pathToFileURL(values.server ?? defaultServerPath()).href);
      return new Promise<number>(() => {});
    }
    case 'init': {
      let res;
      try {
        res = init({ projectDir: paths.projectDir, vendor: values.vendor, allowExec: values['allow-exec'], antigravity: values.antigravity, codex: values.codex, autoApprove: values['auto-approve'] });
      } catch (err) {
        out((err as Error).message);
        return 1;
      }
      for (const f of res.written) out(`wrote     ${f}`);
      for (const f of res.unchanged) out(`unchanged ${f}`);
      for (const n of res.notes) out(n);
      out(values.antigravity ? 'Commit these files. Antigravity starts trod from .agents/mcp_config.json in this workspace.' : values.codex ? 'Commit these files. Codex starts trod from .codex/config.toml once you trust the project.' : 'Commit these files. Local sessions and cloud sessions (also from the mobile app) start trod from .mcp.json.');
      out('Next: `trod doctor` shows the setup and what to do next (`trod learn` once you have a few sessions, or `trod forge` to study something now).');
      return 0;
    }
    case 'doctor': {
      const report = doctor(paths);
      out(values.json ? JSON.stringify(report, null, 2) : formatDoctor(report, packageVersion(defaultPackageRoot()) ?? 'dev'));
      return report.broken ? 1 : 0;
    }
    case 'promote': {
      const name = rest[0];
      if (!name) {
        out('trod promote: missing tool name');
        return 1;
      }
      const res = await promoteTool(paths, name);
      out(`promoted ${name} -> ${path.relative(paths.projectDir, res.to)}${res.replaced ? ' (replaced the previous library version)' : ''}${res.examplesPassed ? `, ${res.examplesPassed} example(s) passed` : ''}`);
      out('Commit .trod/library/ so later sessions load it.');
      return 0;
    }
    case 'report': {
      // The sessions trod learn reads: Claude Code's transcripts of this project and Codex's sessions in it.
      const sources = values.from?.length ? values.from.map((f) => path.resolve(f)) : [transcriptDir(paths.projectDir), ...codexTranscripts(paths.projectDir)];
      const sessions = findTranscripts(sources).map((f) => sessionMetrics(f)).filter((m): m is SessionMetrics => m !== undefined);
      // Hooks delivery logs a random holdout: compare it with the rest. Otherwise, before vs after the notes were linked.
      // Only the chosen sessions decide the mode: holdouts outside a --from selection do not count.
      const delivery = sessionDelivery(paths);
      const logged = sessions.filter((s) => delivery.has(s.id));
      const report = logged.length && logged.some((s) => delivery.get(s.id)?.holdout) ? buildHoldoutReport(sessions, delivery) : buildReport(sessions, notesSince(paths.projectDir));
      const ledger = readLedger(paths.projectDir);
      if (values.json) out(JSON.stringify({ ...report, evidence: ledger.exists ? ledger.rules : undefined }, null, 2));
      else out(formatReport(report, ledger.exists && ledger.rules.length ? summarizeLedger(ledger.rules) : undefined));
      return 0;
    }
    case 'stats': {
      const stats = computeStats(readLogs(values.logs ? path.resolve(values.logs) : paths.logsDir));
      out(values.json ? JSON.stringify(stats, null, 2) : formatStats(stats));
      return 0;
    }
    case 'check':
    case 'list': {
      let bad = 0;
      const execAllowed = process.env.TROD_ALLOW_EXEC === '1';
      for (const [source, root] of [['library', paths.libraryDir], ['session', paths.toolsDir]] as const) {
        for (const entry of listToolEntries(root)) {
          const t = await loadToolEntry(entry, source, { execAllowed });
          if (!t.ok) bad++;
          out(`${t.ok ? 'ok     ' : 'INVALID'} ${source}/${t.folder}${t.ok || command === 'list' ? '' : '\n  - ' + t.errors.join('\n  - ')}`);
        }
      }
      return command === 'check' && bad ? 1 : 0;
    }
    case 'forge': {
      if (!values.brief) {
        out('trod forge: --brief is required (text, or @path/to/brief.md)');
        return 1;
      }
      const brief = values.brief.startsWith('@') ? readFileSync(values.brief.slice(1), 'utf8') : values.brief;
      if (values.reset && !values.practice) {
        out('trod forge: --reset needs --practice');
        return 1;
      }
      const practice = values.practice ? { check: values.practice, reset: values.reset } : undefined;
      const res = await forge({ projectDir: paths.projectDir, brief, model: values.model, server: values.server, maxBudgetUsd: values.budget, timeoutMs: values.timeout ? Number(values.timeout) * 60_000 : undefined, streamFile: values.stream, out, linkNotes: !values['no-link'], practice });
      return forgeExit('forge', res, values.json, out);
    }
    case 'tune': {
      const file = values.config ? path.resolve(values.config) : path.join(paths.projectDir, TUNE_CONFIG);
      let config;
      try {
        config = readTuneConfig(file);
        for (const k of ['iterations', 'runs', 'margin', 'parallel'] as const) {
          if (values[k] === undefined) continue;
          const n = Number(values[k]);
          if (!Number.isInteger(n) || n < (k === 'margin' ? 0 : 1)) throw new Error(`--${k} must be a whole number${k === 'margin' ? '' : ' ≥ 1'}`);
          config[k] = n;
        }
        if (values.model) config.model = values.model;
        if (values.proposer) config.proposer = values.proposer;
        if (values.budget) config.maxBudgetUsd = values.budget;
        if (values.timeout) config.timeoutMinutes = Math.ceil(Number(values.timeout));
        const { practice, validate } = splitTasks(config.tasks);
        if (values['dry-run']) {
          const runs = config.runs ?? 2;
          out(`practice (${practice.length}): ${practice.map((t) => t.id).join(', ')}`);
          out(`validate (${validate.length}): ${validate.map((t) => t.id).join(', ')}`);
          out(`per iteration: ${practice.length * runs} practice run(s), 1 proposer session, ${2 * validate.length * runs} validation run(s); model ${config.model ?? DEFAULT_TUNE_MODEL}, proposer ${config.proposer ?? DEFAULT_TUNE_PROPOSER}`);
          return 0;
        }
      } catch (e) {
        out(`trod tune: ${(e as Error).message}`);
        return 1;
      }
      const res = await tune({ projectDir: paths.projectDir, config, out, configFile: file });
      if (values.json) out(JSON.stringify(res, null, 2));
      // Success means the loop ran on real evidence: some practice run that did not error.
      return res.iterations.some((it) => it.practice.runs > it.practice.errors) ? 0 : 1;
    }
    case 'learn': {
      if (values.auto !== undefined) {
        const r = setAutoLearn(paths, values.auto);
        out(r.ok ? r.message : `trod learn: ${r.message}`);
        return r.ok ? 0 : 1;
      }
      if (values.reset && !values.practice) {
        out('trod learn: --reset needs --practice');
        return 1;
      }
      // Claude Code's transcripts of this project, and Codex's sessions that ran in it.
      const sources = values.from?.length ? values.from.map((f) => path.resolve(f)) : [transcriptDir(paths.projectDir), ...codexTranscripts(paths.projectDir)];
      const outcomes = values.outcomes ? readOutcomes(values.outcomes) : undefined;
      const limit = values.limit ? Number(values.limit) : 200;
      if (!Number.isInteger(limit) || limit < 1) {
        out('trod learn: --limit must be a positive integer');
        return 1;
      }
      // One run per project at a time: overlapping runs would count the same sessions twice.
      const release = acquireLearnLock(paths.projectDir);
      if (!release) {
        out('learn: another trod learn run is in progress for this project; nothing to do');
        return 0;
      }
      let digestsDir: string | undefined;
      try {
        // Newest first; digest only until the limit is reached, skipping empty transcripts, trod's own forge and
        // learn sessions, and (unless --all) sessions an earlier run learned from.
        const files = findTranscripts(sources);
        const state = readLearnState(paths.projectDir);
        const { picked, skipped } = pickSessions(files, { seen: new Set(values.all ? [] : state.sessions), limit, outcomes });
        if (!picked.length) {
          // An explicit --from that finds no transcript at all is a mistake; anything else is a quiet scheduled run.
          if (!files.length && values.from?.length) {
            out(`trod learn: no session transcripts found in ${sources.join(', ')}`);
            return 1;
          }
          if (values['dry-run']) {
            out(skipped ? `learn: nothing new since the last run (${skipped} session(s) already learned from)` : 'learn: no sessions of this project to learn from yet');
            return 0;
          }
          out(skipped ? `learn: nothing new since the last run (${state.lastRun ?? 'unknown'}; ${skipped} session(s) already learned from). --all learns from them again.` : `learn: nothing to learn from yet (no sessions of this project in ${values.from?.length ? sources.join(', ') : `${transcriptDir(paths.projectDir)} or ${codexSessionsDir()}`})`);
          return 0;
        }
        if (values['dry-run']) {
          // What a run would read, without starting the session that costs money.
          const by = (o: string) => picked.filter((d) => d.outcome === o).length;
          out(`learn would read ${picked.length} session(s)${files.length > picked.length && picked.length === limit ? ` (the ${limit} most recent)` : ''}: ${by('pass')} passed, ${by('fail')} failed, ${by('unknown')} with an outcome to judge from the transcript${skipped ? `; ${skipped} already learned from` : ''}`);
          for (const d of picked.slice(0, 15)) out(`  ${d.outcome.padEnd(7)} ${String(d.toolCalls).padStart(3)} tool calls, ${d.errors} errors  ${(d.task.split('\n').find((l) => /\w/.test(l)) ?? '').trim().slice(0, 90)}`);
          if (picked.length > 15) out(`  … and ${picked.length - 15} more`);
          out('Nothing was started. Run `trod learn` to learn from them (one session; cap its spend with --budget <usd>).');
          return 0;
        }
        // With hooks delivery, say what each session had: the holdout ran without notes, a natural control group.
        const delivery = sessionDelivery(paths);
        for (const d of picked) {
          const had = delivery.get(d.id);
          if (had) d.text = d.text.replace(/^(# Session [^\n]*\n)/, `$1\nNotes: ${had.holdout ? 'HOLDOUT (this session ran without notes or wiki pages)' : `${had.notes ? '.trod/notes.md loaded' : '.trod/notes.md not delivered (none yet)'}${had.pages.length ? `; wiki pages added: ${had.pages.join(', ')}` : ''}`}\n`);
        }
        digestsDir = mkdtempSync(path.join(tmpdir(), 'trod-learn-'));
        const dir = digestsDir;
        const counts = writeDigests(path.join(dir, 'sessions'), picked);
        out(`learning from ${picked.length} session(s) (${counts.pass} passed, ${counts.fail} failed, ${counts.unknown} unknown)${files.length > picked.length && picked.length === limit ? `, the ${limit} most recent` : ''}`);
        let brief = values.brief ? (values.brief.startsWith('@') ? readFileSync(values.brief.slice(1), 'utf8') : values.brief) : "No brief: learn from the sessions and the project's files.";
        // A tool is only worth building where sessions may run it.
        if (!execEnabled(paths.projectDir)) brief += '\n\nSessions in this project cannot run trod tools (execution is off), so do not build tools and do not refer to any in the notes: put everything a session needs into the notes themselves.';
        const practice = values.practice ? { check: values.practice, reset: values.reset } : undefined;
        const before = snapshot(paths.projectDir);
        const ledgerBefore = readLedger(paths.projectDir).rules;
        const res = await forge({ projectDir: paths.projectDir, brief, model: values.model, server: values.server, maxBudgetUsd: values.budget, timeoutMs: values.timeout ? Number(values.timeout) * 60_000 : undefined, streamFile: values.stream, out, linkNotes: !values['no-link'], practice, activity: `learning from ${picked.length} session(s)`, notesBasis: 'they rest on the sessions they were learned from', prompt: LEARN_PROMPT(path.join(dir, 'sessions'), counts, values.all ? undefined : state, values.all) });
        // Notes that were there before do not count as this run's result.
        if (!res.promoted.length && snapshot(paths.projectDir) === before) {
          out('learn: the learner changed nothing in .trod/notes.md, .trod/wiki/ or the evidence ledger');
          forgeExit('learn', res, values.json, out);
          return 1;
        }
        // The ledger is required and only grows; a run that breaks it does not mark its sessions as learned.
        const ledger = readLedger(paths.projectDir);
        const ledgerErrors = ledger.exists ? [...ledger.errors, ...checkLedgerHistory(ledgerBefore, ledger.rules, values.all)] : [`${LEDGER_FILE} is missing: the learner must keep the evidence ledger`];
        if (ledger.exists) out(`  evidence: ${summarizeLedger(ledger.rules)}`);
        for (const e of ledgerErrors) out(`  ${e}`);
        const code = forgeExit('learn', res, values.json, out);
        if (ledgerErrors.length) {
          out('learn: sessions not marked as learned (the evidence ledger needs fixing); the next run retries them');
          return 1;
        }
        // The learner finished and its ledger counted these sessions: mark them as learned even when a note check
        // failed afterwards (that is reported through the exit code), or a retry would count them a second time.
        if (res.exitCode === 0) writeLearnState(paths.projectDir, picked.map((d) => d.id));
        return code;
      } finally {
        // The digests were for the learner session only.
        if (digestsDir) rmSync(digestsDir, { recursive: true, force: true });
        release();
      }
    }
    case 'verify': {
      // Library tools are trusted from promotion and not re-checked at startup (ADR 0003), so environments that drift
      // (an API changes, a dependency moves) need a separate check.
      const report: { tool: string; ok: boolean; examples: number; errors: string[] }[] = [];
      for (const entry of listToolEntries(paths.libraryDir)) {
        const t = await loadToolEntry(entry, 'library', { execAllowed: true });
        if (t.ok) await runToolExamples(t, { projectDir: paths.projectDir, execAllowed: true });
        const examples = t.examples ? t.examples.passed + t.examples.failed : 0;
        report.push({ tool: t.folder, ok: t.ok, examples, errors: t.errors });
        if (!values.json) out(`${t.ok ? (examples ? 'ok     ' : 'ok (no examples)') : 'STALE  '} ${t.folder}${t.ok ? '' : '\n  - ' + t.errors.join('\n  - ')}`);
      }
      const stale = report.filter((r) => !r.ok);
      const verified = report.filter((r) => r.ok && r.examples > 0).length;
      const unverifiable = report.filter((r) => r.ok && r.examples === 0).length;
      const notes = await verifyNotes(paths, { execAllowed: true });
      const staleNotes = notes.checks.filter((c) => !c.ok);
      if (values.json) out(JSON.stringify({ stale: stale.map((r) => r.tool), unverifiable, tools: report, notes }, null, 2));
      else {
        out(`${verified}/${report.length} library tool(s) verified${unverifiable ? `, ${unverifiable} without examples (cannot be verified)` : ''}${stale.length ? `; stale: ${stale.map((r) => r.tool).join(', ')} (re-forge or fix them)` : ''}`);
        if (notes.exists || notes.checks.length) printNotes(notes, out);
      }
      return stale.length || staleNotes.length || notes.errors.length ? 1 : 0;
    }
    case 'notes': {
      if (values.delivery !== undefined) return await setDelivery(paths, values.delivery, values.holdout, out);
      let notes = await verifyNotes(paths, { execAllowed: true });
      const failed = notes.checks.some((c) => !c.ok) || notes.errors.length > 0;
      if (values.link) {
        // Only verified notes are linked: check first.
        if (!notes.exists) out('trod notes --link: no .trod/notes.md to link');
        else if (failed) out('trod notes --link: not linked, some checks fail (fix or remove those claims and their checks first)');
        else {
          if (linkNotes(paths)) {
            out(`linked .trod/notes.md into CLAUDE.md (${NOTES_IMPORT})`);
            notes = { ...notes, linked: true };
          }
          const rule = linkAntigravityNotes(paths);
          if (rule === 'written') out(`linked .trod/notes.md into Antigravity (${ANTIGRAVITY_NOTES_RULE})`);
          else if (typeof rule === 'object') out(rule.error);
          const codex = linkCodexNotes(paths);
          if (codex === 'written') out(`linked .trod/notes.md into Codex (${codexNotesFile(paths)})`);
          else if (typeof codex === 'object') out(codex.error);
        }
      }
      if (values.json) out(JSON.stringify(notes, null, 2));
      else if (!notes.exists) out('no .trod/notes.md (trod forge writes one)');
      else printNotes(notes, out);
      return failed || (values.link && !notes.exists) ? 1 : 0;
    }
    case 'hook': {
      // One command for every hook event trod installs.
      const raw = await readStdin();
      let payload: { hook_event_name?: string; session_id?: string; prompt?: string; cwd?: string } = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        // not JSON: nothing to do
      }
      const event = payload.hook_event_name ?? 'PostToolUse';
      if (event === 'SessionEnd') {
        try {
          sessionEndHook(values.dir ? paths : trodPaths(resolveProjectDir(process.env, payload.cwd ?? process.cwd())), payload as { session_id?: string; transcript_path?: string });
        } catch (err) {
          process.stderr.write(`trod hook: ${(err as Error).message}\n`);
        }
        return 0;
      }
      if (event === 'SessionStart' || event === 'UserPromptSubmit') {
        const hookPaths = values.dir ? paths : trodPaths(resolveProjectDir(process.env, payload.cwd ?? process.cwd()));
        let context: string | undefined;
        try {
          context = notesHook(hookPaths, payload);
        } catch (err) {
          // A hook must never break the session: report and carry on.
          process.stderr.write(`trod hook: ${(err as Error).message}\n`);
        }
        if (context) out(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
        return 0;
      }
      const msg = await hookMessage(raw);
      if (msg) out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
      return 0;
    }
    default: {
      const guess = suggestCommand(command);
      out(`trod: unknown command "${command}"${guess ? ` (did you mean "${guess}"?)` : ''}. Run \`trod help\` for the list.`);
      return 1;
    }
  }
}

/** The notes and wiki pages as one string, to tell whether a run changed them. */
function snapshot(projectDir: string): string {
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const wiki = path.join(projectDir, '.trod', 'wiki');
  const pages = existsSync(wiki) ? readdirSync(wiki).sort().map((f) => `${f}\n${read(path.join(wiki, f))}`) : [];
  return [read(path.join(projectDir, '.trod', 'notes.md')), read(path.join(projectDir, LEDGER_FILE)), ...pages].join('\n\0');
}

/**
 * A forge succeeds when it produced something verified: promoted tools, or notes backed by passing checks or by a
 * passed practice attempt. Notes whose checks fail are not verified: the forge is reported as failed so scripts do not
 * take them as good. For trod learn, notes count without checks: they rest on the sessions they were learned from.
 */
function forgeExit(command: 'forge' | 'learn', res: ForgeResult, json: boolean, out: (s: string) => void): number {
  out(`${command}: ${res.promoted.length} tool(s) promoted${res.unverified.length ? ` (${res.unverified.length} without examples)` : ''}, ${res.rejected.length} rejected${res.notes ? `, notes ${res.notes.linked ? 'linked' : 'not linked'}` : ', no notes'}${res.costUsd !== undefined ? `, $${res.costUsd.toFixed(3)}, ${res.turns} turns` : ''}`);
  if (json) out(JSON.stringify(res, null, 2));
  const notesFailed = !!res.notes && (res.notes.checks.some((c) => !c.ok) || res.notes.errors.length > 0);
  const notesVerified = !!res.notes && !notesFailed && (command === 'learn' || res.notes.checks.length > 0 || (res.practice?.passed ?? 0) > 0);
  const ok = !!(res.promoted.length || notesVerified) && !notesFailed && res.exitCode === 0;
  // What a first-time user needs to hear: nothing is committed for them, and later sessions load what is.
  if (ok && !json) out(`Next: review what changed under .trod/ (and CLAUDE.md) with \`git diff\`, then commit it. Sessions started after that load the notes${res.promoted.length ? ' and the library' : ''}.`);
  return ok ? 0 : 1;
}

/**
 * `trod notes --delivery hooks|import [--holdout <share>]`: switch how Claude Code sessions get the notes. Hooks drop the
 * CLAUDE.md import (trod's SessionStart hook injects the notes instead, except in the holdout) and install the hooks.
 */
async function setDelivery(paths: TrodPaths, delivery: string, holdout: string | undefined, out: (s: string) => void): Promise<number> {
  if (delivery !== 'hooks' && delivery !== 'import') {
    out('trod notes: --delivery must be hooks or import');
    return 1;
  }
  const config = readTrodConfig(paths);
  const share = holdout === undefined ? (config.holdout ?? 0.1) : Number(holdout);
  if (!(share >= 0 && share <= 0.5)) {
    out('trod notes: --holdout must be a share between 0 and 0.5');
    return 1;
  }
  // Either way the notes reach every session: only verified notes are delivered, as with `trod notes --link`.
  const notes = await verifyNotes(paths, { execAllowed: true });
  const failing = notes.exists && (notes.checks.some((c) => !c.ok) || notes.errors.length > 0);
  if (failing && delivery === 'hooks') {
    printNotes(notes, out);
    out('trod notes: delivery not changed, some checks fail (fix or remove those claims and their checks first)');
    return 1;
  }
  const { claudeMd } = notesPaths(paths);
  if (delivery === 'hooks') {
    const hookCommand = deliveryHookCommand(paths.projectDir);
    if ('error' in hookCommand) {
      out(`trod notes: ${hookCommand.error}`);
      return 1;
    }
    // Hooks first: if they cannot be installed, the config and the CLAUDE.md import stay as they were.
    const res = { written: [] as string[], unchanged: [] as string[], notes: [] as string[] };
    try {
      installClaudeHooks(paths.projectDir, hookCommand.command, res);
    } catch (e) {
      out(`trod notes: could not install the hooks in .claude/settings.json (${(e as Error).message}); delivery not changed`);
      return 1;
    }
    for (const f of res.written) out(`wrote     ${f}`);
    writeTrodConfig(paths, { ...config, delivery: 'hooks', holdout: share });
    // The hooks deliver the notes now: drop the import.
    if (removeNotesImport(claudeMd)) out(`removed ${NOTES_IMPORT} from CLAUDE.md`);
    out(`notes now reach Claude Code sessions through trod's hooks; ${Math.round(share * 100)}% of sessions are a holdout without notes (trod report compares the two). Commit .trod/config.json and .claude/settings.json.`);
    return 0;
  }
  const { delivery: _, ...rest } = config;
  writeTrodConfig(paths, rest);
  if (failing) {
    // The way out of hooks delivery for unverified notes: the hooks stop, and nothing links the notes until they pass.
    if (removeNotesImport(claudeMd)) out(`removed ${NOTES_IMPORT} from CLAUDE.md`);
    printNotes(notes, out);
    out('hooks delivery is off; the notes are not linked into CLAUDE.md while checks fail (fix them, then trod notes --link)');
    return 1;
  }
  if (linkNotes(paths)) out(`linked .trod/notes.md into CLAUDE.md (${NOTES_IMPORT})`);
  out('notes reach Claude Code sessions through the CLAUDE.md import again (the hooks stay installed and do nothing).');
  return 0;
}

/** Removes trod's notes import (and the heading trod wrote above it) from CLAUDE.md; true if anything changed. */
function removeNotesImport(claudeMd: string): boolean {
  if (!existsSync(claudeMd)) return false;
  const text = readFileSync(claudeMd, 'utf8');
  const next = text
    .replace(/\n?## Project notes \(trod\)\n\nVerified notes about this project's environment, kept by trod[^\n]*\n\n[ \t]*@\.trod\/notes\.md[ \t]*\n?/, '\n')
    .replace(/^[ \t]*@\.trod\/notes\.md[ \t]*(\r?\n|$)/gm, '');
  if (next === text) return false;
  writeFileSync(claudeMd, next.replace(/\n{3,}/g, '\n\n'));
  return true;
}

/**
 * The hook command for hooks delivery. An installed hook from an older trod would not know SessionStart and
 * UserPromptSubmit, and the notes would silently stop reaching sessions: a pinned npx version is moved to this one,
 * and an outdated vendored copy must be updated first.
 */
export function deliveryHookCommand(dir: string): { command: string } | { error: string } {
  const version = packageVersion(defaultPackageRoot());
  const current = `npx -y ${version ? `trod@${version}` : 'trod'} hook`;
  const installed = installedHookCommand(dir);
  if (!installed) return { command: current };
  if (/^npx -y trod(@\S+)? hook$/.test(installed.trim())) return { command: installed.trim() === 'npx -y trod hook' ? installed.trim() : current };
  if (installed.includes('.trod/pkg/bin/trod')) {
    const vendored = packageVersion(path.join(dir, '.trod', 'pkg'));
    if (version && vendored !== version) return { error: `the vendored trod in .trod/pkg is ${vendored ?? 'unknown'}, older than ${version}: re-run \`trod init --vendor\` first, so its hook handles notes delivery` };
  }
  return { command: installed };
}

async function readStdin(): Promise<string> {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

/**
 * For a Write/Edit under .trod/tools or .trod/library, validates the tool (and runs its examples) so the agent
 * learns in the same turn whether it registered, without a separate trod_status call.
 */
export async function hookMessage(raw: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  let payload: { tool_input?: { file_path?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const file = payload.tool_input?.file_path;
  if (!file) return undefined;
  const m = file.match(/^(.*)[\\/]\.trod[\\/](tools|library)[\\/]([^\\/]+)/);
  if (!m) return undefined;
  const [, projectDir, kind, first] = m as unknown as [string, string, string, string];
  const source = kind === 'library' ? 'library' : 'session';
  const entry = path.join(projectDir, '.trod', kind, first);
  // Only tool entries: <name>.mjs, or a folder. A README or data file written next to them is not a broken tool.
  let isDir = false;
  try {
    isDir = statSync(entry).isDirectory();
  } catch {
    // gone already
  }
  if (first.startsWith('.') || (!isDir && !first.endsWith('.mjs'))) return undefined;
  const execAllowed = env.TROD_ALLOW_EXEC === '1';
  const tool = await loadToolEntry(entry, source, { execAllowed, env });
  if (tool.ok) await runToolExamples(tool, { projectDir, execAllowed, env });
  const name = tool.folder;
  if (!tool.ok) {
    return `trod: tool "${name}" is NOT registered:\n- ${tool.errors.join('\n- ')}\nFix the file; trod re-validates on every change.`;
  }
  const ex = tool.examples && !tool.examples.skipped ? ` Examples: ${tool.examples.passed} passed.` : '';
  const exec = execAllowed ? '' : ' Note: execution is disabled (TROD_ALLOW_EXEC is not 1), so calls will be refused.';
  return `trod: tool "${name}" is valid and live. Call it now with trod_run {"tool": "${name}", "input": {…}}, no loading needed (it is also registered as the MCP tool ${name}); no need to call trod_status.${ex}${exec}`;
}

function printNotes(notes: NotesReport, out: (s: string) => void): void {
  const passed = notes.checks.filter((c) => c.ok).length;
  out(`notes: ${notes.exists ? `${notes.chars} chars` : 'missing'}${notes.tooLong ? ` (over ${NOTES_MAX_CHARS}: they are in every session's context, trim them)` : ''}, ${passed}/${notes.checks.length} check(s) passed, ${notes.linked ? (notes.delivery === 'hooks' ? 'delivered by trod\'s hooks' : 'linked from CLAUDE.md') : `not linked (trod notes --link adds ${NOTES_IMPORT} to CLAUDE.md)`}`);
  for (const c of notes.checks.filter((c) => !c.ok)) out(`  STALE  "${c.claim}" (${c.tool}): ${c.error}`);
  for (const e of notes.errors) out(`  ${e}`);
}
