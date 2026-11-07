import { readFileSync } from 'node:fs';
import { forge } from './forge.ts';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { computeStats, formatStats, linkNotes, listToolEntries, loadToolEntry, NOTES_IMPORT, NOTES_MAX_CHARS, promoteTool, readLogs, resolveProjectDir, runToolExamples, trodPaths, verifyNotes, type NotesReport } from '@trod/server';

const USAGE = `trod: self-morphing tools for Claude Code

Usage:
  trod promote <name>      Move .trod/tools/<name> to .trod/library/<name> (commit the library)
  trod stats [--json]      Summarize tool usage across .trod/logs/*.jsonl
  trod check               Validate every tool folder (static checks, no execution)
  trod list                List session and library tools
  trod hook                PostToolUse hook: report whether a just-written tool is valid (JSON on stdin)
  trod verify [--json]     Re-run every library tool's examples and every note check against the current
                           environment; exit 1 if any tool or note is stale (run it in CI or on a schedule)
  trod notes [--link]      Show .trod/notes.md's status and run its checks; --link adds @.trod/notes.md to CLAUDE.md
  trod forge --brief <text|@file> [--model <id>] [--no-link]
                           Run a dedicated tool-building session (headless Claude Code), promote every tool whose
                           examples pass to .trod/library, check the notes it wrote and link them into CLAUDE.md

Options:
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
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    out(USAGE);
    return command || values.help ? 0 : 1;
  }
  const paths = trodPaths(values.dir ? path.resolve(values.dir) : resolveProjectDir());

  switch (command) {
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
      const res = await forge({ projectDir: paths.projectDir, brief, model: values.model, server: values.server, maxBudgetUsd: values.budget, streamFile: values.stream, out, linkNotes: !values['no-link'] });
      out(`forge: ${res.promoted.length} tool(s) promoted${res.unverified.length ? ` (${res.unverified.length} without examples)` : ''}, ${res.rejected.length} rejected${res.costUsd !== undefined ? `, $${res.costUsd.toFixed(3)}, ${res.turns} turns` : ''}`);
      if (values.json) out(JSON.stringify(res, null, 2));
      return res.promoted.length ? 0 : 1;
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
      if (values.link && linkNotes(paths)) out(`linked .trod/notes.md into CLAUDE.md (${NOTES_IMPORT})`);
      const notes = await verifyNotes(paths, { execAllowed: true });
      if (values.json) out(JSON.stringify(notes, null, 2));
      else if (!notes.exists) out('no .trod/notes.md (trod forge writes one)');
      else printNotes(notes, out);
      return notes.checks.some((c) => !c.ok) || notes.errors.length ? 1 : 0;
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
