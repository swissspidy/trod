import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkNotes, NOTES_IMPORT, NOTES_MAX_CHARS, promoteTool, trodPaths, verifyNotes, type NotesReport } from '@trod/server';

/**
 * `trod forge`: a dedicated tool-building session. A headless Claude Code session studies an environment (a brief
 * plus the project's files), builds robust, general trod tools with examples and tests them; then every tool whose
 * examples pass is promoted to .trod/library. Later sessions find the library in their instructions (library cards)
 * and can call it directly or from trod_eval.
 */
export const FORGE_PROMPT = `You are a toolsmith. You are not solving a task: you are building tools that future sessions will rely on.

Future sessions start fresh, with no memory of this one. They will see the tools you build listed in their instructions (name, signature, description, whenToUse, whether the examples pass) and call them, usually several at once from trod_eval as tools.<name>(input). They will not read your source. So:

1. Study the environment described below and in the project's files. Probe it until you understand every quirk: authentication, pagination, rate limits (back off on 429), formats (dates, numbers, units), soft-deleted or reversed records, anything a newcomer would get wrong.
2. Build a few general capability tools as single files in .trod/tools/<name>.mjs (export const meta = { description, whenToUse, inputSchema, examples, timeoutMs }; export default async (input, ctx) => result). A capability returns clean, normalized records with useful filters; it does not compute one particular answer. Encode every quirk inside the tool.
3. Write description and whenToUse so that a newcomer can use the tool correctly without reading code: say what it returns (field names, units, what is excluded) and which quirks it handles. These texts are the only documentation future sessions get.
4. Give every tool at least one example that exercises the real environment and checks something stable (expect.contains or expect.matches). Tools whose examples fail are discarded.
5. Test each tool with trod_run, and test combining them with trod_eval, like a future session would.
6. Write .trod/notes.md: what future sessions need to KNOW about the environment itself (at most 4000 characters, dense and concrete). Write RULES, each saying what to do or not do: "X means Y; do Z", not bare facts. Cover the conventions a newcomer gets wrong: what fields and coded values mean, how derived quantities are defined, which records count (scope: act on exactly the records the task selects, all of them, and nothing else; skip records already in the target state), how domain rules work (money, limits, defaults, side effects), date and unit formats, how results are expected to be shaped, traps. When you name a trap, also name the right action: a warning without one invites improvised fixes that become unrequested side effects. Do NOT spend the notes on how to use your tools or on API reference that the docs already give: tool descriptions carry the former, and the notes must stay useful even when a session works without the tools. These notes are loaded into every future session, so state general rules, not answers to one task, and check each claim against the environment.
7. Back every checkable claim with an entry in .trod/notes.checks.json: a JSON array of {"claim": "<a few words>", "tool": "<one of your tools>", "input": {...}, "expect": {"contains": "..."} or {"matches": "<regex>"}}. The checks are re-run later to detect when the environment changes and a note goes stale; claims whose check fails are reported.

Do not write answer files. When finished, reply with a short list of the tools and DONE.`;

export interface ForgeOptions {
  projectDir: string;
  brief: string;
  model?: string;
  /** Path of the bundled trod server; defaults to the one next to this CLI. */
  server?: string;
  env?: NodeJS.ProcessEnv;
  maxBudgetUsd?: string;
  timeoutMs?: number;
  /** Where to write the session's stream-json output. */
  streamFile?: string;
  out?: (s: string) => void;
  /** Add the `@.trod/notes.md` import to CLAUDE.md when the forge wrote notes (default true). */
  linkNotes?: boolean;
}

export interface ForgeResult {
  exitCode: number | null;
  promoted: string[];
  rejected: { name: string; reason: string }[];
  /** Promoted without examples. */
  unverified: string[];
  /** The notes the forge wrote (.trod/notes.md) and their checks, if any. */
  notes?: NotesReport;
  costUsd?: number;
  turns?: number;
  usage?: Record<string, number>;
}

export function defaultServerPath(): string {
  // Bundled CLI: plugin/bin/trod -> plugin/server/trod-server.mjs.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'trod-server.mjs');
}

export async function forge(opts: ForgeOptions): Promise<ForgeResult> {
  const out = opts.out ?? (() => {});
  const paths = trodPaths(opts.projectDir);
  const env = { ...(opts.env ?? process.env), TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: opts.projectDir };
  const scratch = mkdtempSync(path.join(tmpdir(), 'trod-forge-'));
  const mcpConfig = path.join(scratch, 'mcp.json');
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { trod: { command: process.execPath, args: [opts.server ?? defaultServerPath()] } } }));
  const prompt = `${FORGE_PROMPT}\n\n## The environment\n\n${opts.brief}`;
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--mcp-config', mcpConfig, '--strict-mcp-config',
    '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,TodoWrite,mcp__trod__*',
    '--disallowedTools', 'WebFetch,WebSearch,Task,Agent',
    ...(opts.model ? ['--model', opts.model] : []),
    ...(opts.maxBudgetUsd ? ['--max-budget-usd', opts.maxBudgetUsd] : []),
  ];
  const streamFile = opts.streamFile ?? path.join(scratch, 'forge.jsonl');
  mkdirSync(path.dirname(streamFile), { recursive: true });
  out(`forging tools in ${opts.projectDir}${opts.model ? ` with ${opts.model}` : ''} …`);
  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn('claude', args, { cwd: opts.projectDir, env, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 30 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(streamFile, buf);
      resolve(code);
    });
  });
  const result = readFileSync(streamFile, 'utf8')
    .split('\n')
    .filter((l) => l.includes('"type":"result"'))
    .map((l) => JSON.parse(l))
    .at(-1);

  const promoted: string[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const unverified: string[] = [];
  const entries = existsSync(paths.toolsDir) ? readdirSync(paths.toolsDir).filter((f) => !f.startsWith('.')) : [];
  for (const entry of entries) {
    const name = entry.replace(/\.mjs$/, '');
    try {
      const res = await promoteTool(paths, name, new Date(), { execAllowed: true, env });
      if (!res.examplesPassed) unverified.push(name);
      promoted.push(name);
      out(`  promoted ${name}${res.examplesPassed ? ` (${res.examplesPassed} example(s) passed)` : ' (no examples)'}`);
    } catch (err) {
      rejected.push({ name, reason: (err as Error).message.split('\n').slice(0, 3).join(' ') });
      out(`  rejected ${name}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  // Notes (ADR 0004): run their checks against the promoted library, then link them into CLAUDE.md.
  const notes = await verifyNotes(paths, { execAllowed: true, env });
  let notesLinkedNow = false;
  if (notes.exists) {
    const passed = notes.checks.filter((c) => c.ok).length;
    out(`  notes: ${notes.chars} chars${notes.tooLong ? ` (over ${NOTES_MAX_CHARS}: trim them, they are in every session's context)` : ''}, ${passed}/${notes.checks.length} check(s) passed`);
    for (const c of notes.checks.filter((c) => !c.ok)) out(`    failed check "${c.claim}" (${c.tool}): ${c.error}`);
    for (const e of notes.errors) out(`    ${e}`);
    const failed = notes.checks.some((c) => !c.ok) || notes.errors.length > 0;
    if (failed && notes.linked) out(`  WARNING: CLAUDE.md already imports .trod/notes.md (${NOTES_IMPORT}), so sessions still load these unverified notes: fix the failing claims or remove the import`);
    else if (failed) out('  notes NOT linked into CLAUDE.md: fix or remove the failing claims and their checks, then run `trod notes --link`');
    else if (opts.linkNotes !== false) {
      notesLinkedNow = linkNotes(paths);
      if (notesLinkedNow) out(`  linked .trod/notes.md into CLAUDE.md (${NOTES_IMPORT})${notes.checks.length ? '' : ' (no checks: nothing in them is verified)'}`);
    }
  }
  return { exitCode, promoted, rejected, unverified, notes: notes.exists ? { ...notes, linked: notes.linked || notesLinkedNow } : undefined, costUsd: result?.total_cost_usd, turns: result?.num_turns, usage: result?.usage };
}
