import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { defaultServerPath, forge, type ForgeResult } from './forge.ts';
import { digestTranscript, findTranscripts, LEARN_PROMPT, readOutcomes, transcriptDir, writeDigests, type SessionDigest } from './learn.ts';
import { tmpdir } from 'node:os';
import { defaultPackageRoot, init, packageVersion } from './init.ts';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ANTIGRAVITY_NOTES_RULE, linkAntigravityNotes, computeStats, formatStats, linkNotes, listToolEntries, loadToolEntry, NOTES_IMPORT, NOTES_MAX_CHARS, promoteTool, readLogs, resolveProjectDir, runToolExamples, trodPaths, verifyNotes, type NotesReport } from '@trod/server';

const USAGE = `trod: self-morphing tools for Claude Code

Usage:
  trod init [--vendor] [--allow-exec] [--antigravity]
                           Set this repository up for trod in every Claude Code session, local or cloud (also
                           sessions started from the mobile app): writes .mcp.json, .claude/settings.json and the
                           skill. --vendor copies the server into .trod/pkg instead of running it through npx;
                           --allow-exec lets tools run (TROD_ALLOW_EXEC=1; meant for ephemeral cloud containers).
                           --antigravity sets the repository up for Antigravity instead (.agents/mcp_config.json,
                           the skill, and a rule that loads the notes)
  trod mcp                 Start the trod MCP server on stdio (for any MCP client)
  trod promote <name>      Move .trod/tools/<name> to .trod/library/<name> (commit the library)
  trod stats [--json]      Summarize tool usage across .trod/logs/*.jsonl
  trod check               Validate every tool folder (static checks, no execution)
  trod list                List session and library tools
  trod hook                PostToolUse hook: report whether a just-written tool is valid (JSON on stdin)
  trod verify [--json]     Re-run every library tool's examples and every note check against the current
                           environment; exit 1 if any tool or note is stale (run it in CI or on a schedule)
  trod notes [--link]      Show .trod/notes.md's status and run its checks; --link adds @.trod/notes.md to CLAUDE.md
  trod forge --brief <text|@file> [--model <id>] [--no-link] [--practice <cmd> [--reset <cmd>]]
                           Run a dedicated tool-building session (headless Claude Code), promote every tool whose
                           examples pass to .trod/library, check the notes it wrote and link them into CLAUDE.md.
                           --practice: a shell command whose exit code 0 means the current attempt succeeded (e.g.
                           a test suite, a grader); the forge practises against it before writing notes, and its
                           notes are linked only if it passed at least once. --reset starts a fresh attempt.
  trod learn [--from <dir|file>]... [--outcomes <file>] [--limit <n>] [--brief <text|@file>] [--model <id>]
                           Distil notes from sessions that already happened: condenses Claude Code's transcripts of
                           this project (default: ~/.claude/projects/<project>/), compares failed with passed
                           sessions in a forge session and writes rules into .trod/notes.md (and .trod/wiki/ pages
                           when there are many kinds of task). --outcomes: JSON mapping session ids to true/false
                           (e.g. from CI); without it the outcome is judged from each transcript. Takes --practice too.

Options:
  --timeout <minutes>      forge and learn: stop the session after this long (default 30)
  --dir <path>             Project directory (default: TROD_PROJECT_DIR, CLAUDE_PROJECT_DIR or cwd)
  --logs <path>            Logs directory for stats (default: <dir>/.trod/logs)
`;

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
      'no-link': { type: 'boolean', default: false },
      practice: { type: 'string' },
      reset: { type: 'string' },
      from: { type: 'string', multiple: true },
      outcomes: { type: 'string' },
      limit: { type: 'string' },
      timeout: { type: 'string' },
      vendor: { type: 'boolean', default: false },
      'allow-exec': { type: 'boolean', default: false },
      antigravity: { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) {
    out(packageVersion(defaultPackageRoot()) ?? 'dev');
    return 0;
  }
  if (values.help || !command) {
    out(USAGE);
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
        res = init({ projectDir: paths.projectDir, vendor: values.vendor, allowExec: values['allow-exec'], antigravity: values.antigravity });
      } catch (err) {
        out((err as Error).message);
        return 1;
      }
      for (const f of res.written) out(`wrote     ${f}`);
      for (const f of res.unchanged) out(`unchanged ${f}`);
      for (const n of res.notes) out(n);
      out(values.antigravity ? 'Commit these files. Antigravity starts trod from .agents/mcp_config.json in this workspace.' : 'Commit these files. Local sessions and cloud sessions (also from the mobile app) start trod from .mcp.json.');
      return 0;
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
    case 'learn': {
      if (values.reset && !values.practice) {
        out('trod learn: --reset needs --practice');
        return 1;
      }
      const sources = values.from?.length ? values.from.map((f) => path.resolve(f)) : [transcriptDir(paths.projectDir)];
      const outcomes = values.outcomes ? readOutcomes(values.outcomes) : undefined;
      const limit = values.limit ? Number(values.limit) : 200;
      if (!Number.isInteger(limit) || limit < 1) {
        out('trod learn: --limit must be a positive integer');
        return 1;
      }
      // Newest first; digest only until the limit is reached, skipping empty transcripts and trod's own sessions.
      const files = findTranscripts(sources);
      const picked: SessionDigest[] = [];
      for (const file of files) {
        if (picked.length >= limit) break;
        const d = digestTranscript(file, { outcome: outcomes?.get(path.basename(file, '.jsonl')) });
        if (d && !/^You are (a toolsmith|distilling experience)/.test(d.task)) picked.push(d);
      }
      if (!picked.length) {
        out(`trod learn: no session transcripts found in ${sources.join(', ')} (pass --from <dir|file>)`);
        return 1;
      }
      const dir = mkdtempSync(path.join(tmpdir(), 'trod-learn-'));
      const counts = writeDigests(path.join(dir, 'sessions'), picked);
      out(`learning from ${picked.length} session(s) (${counts.pass} passed, ${counts.fail} failed, ${counts.unknown} unknown)${files.length > picked.length && picked.length === limit ? `, the ${limit} most recent` : ''}`);
      const brief = values.brief ? (values.brief.startsWith('@') ? readFileSync(values.brief.slice(1), 'utf8') : values.brief) : "No brief: learn from the sessions and the project's files.";
      const practice = values.practice ? { check: values.practice, reset: values.reset } : undefined;
      const before = snapshot(paths.projectDir);
      const res = await forge({ projectDir: paths.projectDir, brief, model: values.model, server: values.server, maxBudgetUsd: values.budget, timeoutMs: values.timeout ? Number(values.timeout) * 60_000 : undefined, streamFile: values.stream, out, linkNotes: !values['no-link'], practice, prompt: LEARN_PROMPT(path.join(dir, 'sessions'), counts) });
      // Notes that were there before do not count as this run's result.
      if (!res.promoted.length && snapshot(paths.projectDir) === before) {
        out('learn: the learner changed nothing in .trod/notes.md or .trod/wiki/');
        forgeExit('learn', res, values.json, out);
        return 1;
      }
      return forgeExit('learn', res, values.json, out);
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
        }
      }
      if (values.json) out(JSON.stringify(notes, null, 2));
      else if (!notes.exists) out('no .trod/notes.md (trod forge writes one)');
      else printNotes(notes, out);
      return failed || (values.link && !notes.exists) ? 1 : 0;
    }
    case 'hook': {
      const msg = await hookMessage(await readStdin());
      if (msg) out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
      return 0;
    }
    default:
      out(`trod: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}

/** The notes and wiki pages as one string, to tell whether a run changed them. */
function snapshot(projectDir: string): string {
  const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const wiki = path.join(projectDir, '.trod', 'wiki');
  const pages = existsSync(wiki) ? readdirSync(wiki).sort().map((f) => `${f}\n${read(path.join(wiki, f))}`) : [];
  return [read(path.join(projectDir, '.trod', 'notes.md')), ...pages].join('\n\0');
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
  return (res.promoted.length || notesVerified) && !notesFailed && res.exitCode === 0 ? 0 : 1;
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
  out(`notes: ${notes.exists ? `${notes.chars} chars` : 'missing'}${notes.tooLong ? ` (over ${NOTES_MAX_CHARS}: they are in every session's context, trim them)` : ''}, ${passed}/${notes.checks.length} check(s) passed, ${notes.linked ? 'linked from CLAUDE.md' : `not linked (trod notes --link adds ${NOTES_IMPORT} to CLAUDE.md)`}`);
  for (const c of notes.checks.filter((c) => !c.ok)) out(`  STALE  "${c.claim}" (${c.tool}): ${c.error}`);
  for (const e of notes.errors) out(`  ${e}`);
}
