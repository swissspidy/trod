import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANTIGRAVITY_NOTES_RULE, CODEX_NOTES_FILE, linkAntigravityNotes, linkCodexNotes, linkNotes, NOTES_IMPORT, NOTES_MAX_CHARS, promoteTool, trodPaths, verifyNotes, type NotesReport } from '@trod/server';

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

/**
 * Practice (round 9): when the environment can say whether an attempt succeeded, the forge practises before it
 * writes notes. Notes learned from real successes and failures beat notes inferred from reading.
 */
export const PRACTICE_PROMPT = (hasReset: boolean) => `## Practice

You can practise on the environment itself. \`trod-try\` runs the practice check: it exits 0 when the current attempt succeeded, and its output says why when it did not.${hasReset ? ' `trod-reset` starts a fresh attempt (a new instance of the same kind of task).' : ''} Make real attempts until they succeed reliably (at least 3 in a row where you can), and learn from every failure: what ends an attempt, what success needs that nobody says, which actions are reliable, which are traps. Then write into .trod/notes.md the rules you saw hold, each with the action to take, plus a short recipe that worked, with <placeholders> for what differs between attempts. Run checks only through \`trod-try\`: notes from a forge that never passed it are not linked.`;

export interface PracticeOptions {
  /** Shell command that checks the current attempt: exit code 0 means it succeeded. */
  check: string;
  /** Shell command that starts a fresh attempt (optional). */
  reset?: string;
}

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
  /** Let the forge practise against a success check before writing notes. */
  practice?: PracticeOptions;
  /** The Claude Code executable (default: TROD_CLAUDE_BIN or `claude`). */
  claudeBin?: string;
  /** Replaces FORGE_PROMPT (trod learn uses LEARN_PROMPT). */
  prompt?: string;
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
  /** Practice attempts the forge checked with trod-try, and how many passed. */
  practice?: { attempts: number; passed: number; corrupt: number };
}

/** Writes trod-try (and trod-reset) into binDir: each runs its command and logs the outcome to logFile. */
function writePracticeBins(binDir: string, logFile: string, practice: PracticeOptions): void {
  mkdirSync(binDir, { recursive: true });
  // The wrappers use require(): keep them CommonJS even if TMPDIR lies inside a "type": "module" package.
  writeFileSync(path.join(binDir, 'package.json'), '{"type":"commonjs"}\n');
  const bin = (cmd: string, kind: string) => `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const r = spawnSync('sh', ['-c', ${JSON.stringify(cmd)}, 'sh', ...process.argv.slice(2)], { stdio: 'inherit' });
const code = r.status === null ? 1 : r.status;
appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ kind: ${JSON.stringify(kind)}, exit: code, at: new Date().toISOString() }) + '\\n');
process.exit(code);
`;
  for (const [name, cmd, kind] of [['trod-try', practice.check, 'try'], ['trod-reset', practice.reset, 'reset']] as const) {
    if (!cmd) continue;
    writeFileSync(path.join(binDir, name), bin(cmd, kind));
    chmodSync(path.join(binDir, name), 0o755);
  }
}

function readPractice(logFile: string): { attempts: number; passed: number; corrupt: number } {
  const lines = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
  const entries: { kind?: string; exit?: number }[] = [];
  let corrupt = 0;
  for (const l of lines) {
    try {
      entries.push(JSON.parse(l));
    } catch {
      corrupt++; // a torn write: skip it rather than abort the forge (it can only lower the pass count)
    }
  }
  const tries = entries.filter((e) => e.kind === 'try');
  return { attempts: tries.length, passed: tries.filter((e) => e.exit === 0).length, corrupt };
}

export function defaultServerPath(): string {
  // Bundled CLI: plugin/bin/trod -> plugin/server/trod-server.mjs.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'trod-server.mjs');
}

export async function forge(opts: ForgeOptions): Promise<ForgeResult> {
  const out = opts.out ?? (() => {});
  const paths = trodPaths(opts.projectDir);
  const scratch = mkdtempSync(path.join(tmpdir(), 'trod-forge-'));
  const baseEnv = opts.env ?? process.env;
  const practiceLog = path.join(scratch, 'practice.jsonl');
  if (opts.practice) writePracticeBins(path.join(scratch, 'bin'), practiceLog, opts.practice);
  const env: NodeJS.ProcessEnv = { ...baseEnv, TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: opts.projectDir, ...(opts.practice ? { PATH: `${path.join(scratch, 'bin')}${path.delimiter}${baseEnv.PATH ?? ''}` } : {}) };
  // Run from inside a Claude Code session (e.g. the learn skill in a scheduled task), the child inherits
  // CLAUDECODE=1 and refuses to start as a nested session. The forge is a separate headless session, so clear it.
  delete env.CLAUDECODE;
  const mcpConfig = path.join(scratch, 'mcp.json');
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { trod: { command: process.execPath, args: [opts.server ?? defaultServerPath()] } } }));
  const prompt = `${opts.prompt ?? FORGE_PROMPT}\n\n## The environment\n\n${opts.brief}${opts.practice ? `\n\n${PRACTICE_PROMPT(!!opts.practice.reset)}` : ''}`;
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
    const child = spawn(opts.claudeBin ?? baseEnv.TROD_CLAUDE_BIN ?? 'claude', args, { cwd: opts.projectDir, env, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    child.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 30 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(streamFile, buf);
      resolve(code);
    });
  });
  const practice = opts.practice ? readPractice(practiceLog) : undefined;
  if (practice) out(`  practice: ${practice.passed}/${practice.attempts} attempt(s) passed${practice.corrupt ? ` (${practice.corrupt} unreadable log line(s) skipped)` : ''}`);
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
    // Practice notes count as verified only if the forge passed the practice check at least once.
    if (practice && practice.passed === 0) notes.errors.push('the forge never passed the practice check (trod-try), so nothing in these notes was seen to work');
    const failed = notes.checks.some((c) => !c.ok) || notes.errors.length > 0;
    if (failed && notes.linked) out(`  WARNING: CLAUDE.md already imports .trod/notes.md (${NOTES_IMPORT}), so sessions still load these unverified notes: fix the failing claims or remove the import`);
    else if (failed) out('  notes NOT linked into CLAUDE.md: fix or remove the failing claims and their checks, then run `trod notes --link`');
    else if (exitCode !== 0) out(`  notes NOT linked into CLAUDE.md: the session did not finish cleanly (${exitCode === null ? 'killed, e.g. by --timeout' : `exit code ${exitCode}`}), so they may be incomplete; review them, then run \`trod notes --link\``);
    else if (opts.linkNotes !== false) {
      notesLinkedNow = linkNotes(paths);
      if (notesLinkedNow) out(`  linked .trod/notes.md into CLAUDE.md (${NOTES_IMPORT})${notes.checks.length ? '' : ' (no checks: nothing in them is verified)'}`);
      const rule = linkAntigravityNotes(paths);
      if (rule === 'written') out(`  linked .trod/notes.md into Antigravity (${ANTIGRAVITY_NOTES_RULE})`);
      else if (typeof rule === 'object') out(`  ${rule.error}`);
      const codex = linkCodexNotes(paths);
      if (codex === 'written') out(`  linked .trod/notes.md into Codex (${CODEX_NOTES_FILE})`);
      else if (typeof codex === 'object') out(`  ${codex.error}`);
    }
  }
  return { exitCode, promoted, rejected, unverified, notes: notes.exists ? { ...notes, linked: notes.linked || notesLinkedNow } : undefined, costUsd: result?.total_cost_usd, turns: result?.num_turns, usage: result?.usage, practice };
}
