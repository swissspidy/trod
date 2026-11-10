import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { NOTES_IMPORT, NOTES_MAX_CHARS, trodPaths, verifyNotes } from '@trod/server';
import { defaultServerPath, forge } from './forge.ts';
import { digestTranscript } from './learn.ts';
import { TROD_SESSION_ENV } from './session-env.ts';

/**
 * `trod tune`: validated notes tuning (results-13 and results-15 as a command). The project defines tasks with checks
 * in .trod/tune.json. Each iteration:
 *   1. Practice: a model (default Haiku) runs the practice tasks, each in a throwaway copy of the project that carries
 *      the current notes, and each task's check decides pass or fail.
 *   2. Propose: a stronger model reads digests of those sessions and rewrites .trod/notes.md (and .trod/wiki/) in a
 *      copy of the project; its notes checks must pass.
 *   3. Validate: the held-out validation tasks run with the current notes and with the candidate. The candidate
 *      replaces the project's notes only if it passes at least --margin more validation runs.
 * Nothing is committed; the project's notes change only when a candidate wins.
 */

export const TUNE_CONFIG = path.join('.trod', 'tune.json');
export const TUNE_DIR = path.join('.trod', 'tune');
/** The notes files a harness consists of: copied into each run's workspace and replaced when a candidate wins. */
const HARNESS_FILES = ['notes.md', 'notes.checks.json', 'wiki', 'library'];

export interface TuneTask {
  id: string;
  /** The prompt the session gets, as a user would write it. */
  prompt: string;
  /** Shell command run in the workspace after the session: exit code 0 means the task was done. */
  check: string;
  /** Shell command run in the workspace before the session (e.g. seed a database). */
  setup?: string;
  /** Which set the task belongs to; unset tasks are split between the two by a stable hash of their id. */
  split?: 'practice' | 'validate';
}

export interface TuneConfig {
  tasks: TuneTask[];
  /** The model the notes are for (default claude-haiku-5-5). */
  model?: string;
  /** The model that rewrites the notes (default claude-opus-5-5). */
  proposer?: string;
  /** Runs per task and set (default 2). */
  runs?: number;
  /** A candidate must pass this many more validation runs than the current notes (default 1). */
  margin?: number;
  iterations?: number;
  parallel?: number;
  /** Per task session (default 15). */
  timeoutMinutes?: number;
  /** Per session (default 2 for tasks, 5 for the proposer). */
  maxBudgetUsd?: string;
}

/** Reads and validates the tune config; throws with a message that says what to fix. */
export function readTuneConfig(file: string): TuneConfig {
  if (!existsSync(file)) throw new Error(`no ${file}: list tasks there as {"tasks": [{"id", "prompt", "check"}]} (see docs/reference.md, "Tuning notes")`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file}: not valid JSON (${(e as Error).message})`);
  }
  const c = raw as TuneConfig;
  if (!c || !Array.isArray(c.tasks) || c.tasks.length < 2) throw new Error(`${file}: needs "tasks" with at least 2 tasks (some to practise on, some to validate with)`);
  const ids = new Set<string>();
  for (const [i, t] of c.tasks.entries()) {
    for (const k of ['id', 'prompt', 'check'] as const) if (typeof t?.[k] !== 'string' || !t[k].trim()) throw new Error(`${file}: tasks[${i}] needs a non-empty "${k}"`);
    if (t.setup !== undefined && typeof t.setup !== 'string') throw new Error(`${file}: tasks[${i}].setup must be a shell command`);
    if (t.split !== undefined && t.split !== 'practice' && t.split !== 'validate') throw new Error(`${file}: tasks[${i}].split must be "practice" or "validate"`);
    if (ids.has(t.id)) throw new Error(`${file}: duplicate task id "${t.id}"`);
    if (!/^[A-Za-z0-9._-]+$/.test(t.id)) throw new Error(`${file}: task id "${t.id}" may only use letters, digits, ".", "_" and "-"`);
    ids.add(t.id);
  }
  for (const k of ['runs', 'margin', 'iterations', 'parallel', 'timeoutMinutes'] as const) {
    const v = c[k];
    if (v !== undefined && (!Number.isInteger(v) || v < (k === 'margin' ? 0 : 1))) throw new Error(`${file}: "${k}" must be a whole number${k === 'margin' ? '' : ' ≥ 1'}`);
  }
  return c;
}

/** Practice and validation sets: explicit splits first, the rest by a stable hash of the id; both end up non-empty. */
export function splitTasks(tasks: TuneTask[]): { practice: TuneTask[]; validate: TuneTask[] } {
  const practice: TuneTask[] = [];
  const validate: TuneTask[] = [];
  const free: TuneTask[] = [];
  for (const t of tasks) (t.split === 'practice' ? practice : t.split === 'validate' ? validate : free).push(t);
  for (const t of free) (parseInt(createHash('sha256').update(t.id).digest('hex').slice(0, 8), 16) % 2 ? validate : practice).push(t);
  // A side left empty takes one free task from the other, so both sets exist.
  const movable = (from: TuneTask[]) => from.findIndex((t) => !t.split);
  if (!practice.length && movable(validate) >= 0) practice.push(...validate.splice(movable(validate), 1));
  if (!validate.length && movable(practice) >= 0) validate.push(...practice.splice(movable(practice), 1));
  if (!practice.length || !validate.length) throw new Error('trod tune needs at least one practice task and one validation task');
  return { practice, validate };
}

/** Copies the harness files of a project's .trod into `dest` (a harness snapshot). */
export function snapshotHarness(trodDir: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const f of HARNESS_FILES) if (existsSync(path.join(trodDir, f))) cpSync(path.join(trodDir, f), path.join(dest, f), { recursive: true });
}

function isGitRepo(dir: string): boolean {
  return spawnSync('git', ['-C', dir, 'rev-parse', '--verify', 'HEAD'], { stdio: 'ignore' }).status === 0;
}

/**
 * A throwaway copy of the project with a harness in .trod. From a git repository: the tree of HEAD (`git archive`) in a
 * fresh repository with a single commit and no history, so uncommitted changes are not part of it and nothing in the
 * history (such as the tune config) can be looked up. Otherwise a plain copy without node_modules. `hide` lists paths
 * (relative to the project) removed from the copy: the tune config, so sessions never see the validation tasks.
 * CLAUDE.md imports the notes either way.
 */
export function makeWorkspace(projectDir: string, harness: string, scratch: string, hide: string[] = [TUNE_CONFIG]): { dir: string; remove: () => void } {
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(path.join(scratch, 'ws-'));
  const remove = () => rmSync(dir, { recursive: true, force: true });
  const git = isGitRepo(projectDir);
  if (git) {
    const r = spawnSync('sh', ['-c', 'git -C "$1" archive HEAD | tar -x -C "$2"', 'sh', projectDir, dir], { stdio: 'ignore' });
    if (r.status !== 0) throw new Error(`could not export HEAD of ${projectDir} (git archive)`);
  } else {
    const skip = new Set(['.git', 'node_modules']);
    cpSync(projectDir, dir, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !src.startsWith(path.join(projectDir, TUNE_DIR)) && !src.startsWith(path.resolve(scratch)) });
  }
  const trodDir = path.join(dir, '.trod');
  for (const f of HARNESS_FILES) rmSync(path.join(trodDir, f), { recursive: true, force: true });
  snapshotHarness(harness, trodDir);
  // After the harness, which could carry a hidden path back in (a config kept under .trod/wiki).
  for (const h of hide) rmSync(path.join(dir, h), { recursive: true, force: true });
  const claudeMd = path.join(dir, 'CLAUDE.md');
  const text = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : '';
  if (existsSync(path.join(trodDir, 'notes.md')) && !text.split('\n').some((l) => l.trim() === NOTES_IMPORT)) writeFileSync(claudeMd, `${text.trimEnd()}${text ? '\n\n' : ''}${NOTES_IMPORT}\n`);
  if (git) {
    const g = (...a: string[]) => spawnSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
    g('init', '-q');
    g('add', '-A');
    g('-c', 'user.name=trod', '-c', 'user.email=trod@localhost', 'commit', '-q', '-m', 'base');
  }
  return { dir, remove };
}

/** Paths removed from every workspace: the tune config, and a custom config file when it lies inside the project. */
export function hiddenPaths(projectDir: string, configFile?: string): string[] {
  const hide = [TUNE_CONFIG];
  if (configFile) {
    const rel = path.relative(projectDir, path.resolve(configFile));
    // Inside means no leading ".." segment (a file named "..tasks.json" is inside).
    if (rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) hide.push(rel);
  }
  return hide;
}

export interface RunResult {
  task: string;
  run: number;
  pass: boolean;
  stream: string;
  costUsd?: number;
  /** The session or check could not run (setup failed, timeout): not a judgment on the notes. */
  error?: string;
}

interface Ctx {
  projectDir: string;
  out: (s: string) => void;
  claudeBin?: string;
  env: NodeJS.ProcessEnv;
  config: Required<Pick<TuneConfig, 'model' | 'runs' | 'parallel' | 'timeoutMinutes'>> & TuneConfig;
  /** Where workspaces go: outside the project, so a plain copy never contains itself. */
  scratch: string;
  /** Paths removed from every workspace (the tune config). */
  hide: string[];
}

function sh(cmd: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): { code: number | null; output: string } {
  const r = spawnSync('sh', ['-c', cmd], { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-2000) };
}

/** One task session in a fresh workspace, then the task's check. */
async function runTask(ctx: Ctx, harness: string, task: TuneTask, run: number, outDir: string): Promise<RunResult> {
  const stream = path.join(outDir, `${task.id}-${run}.jsonl`);
  const ws = makeWorkspace(ctx.projectDir, harness, ctx.scratch, ctx.hide);
  try {
    const env: NodeJS.ProcessEnv = { ...ctx.env, [TROD_SESSION_ENV]: 'tune', TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: ws.dir };
    delete env.CLAUDECODE;
    if (task.setup) {
      const s = sh(task.setup, ws.dir, env, 10 * 60_000);
      if (s.code !== 0) return { task: task.id, run, pass: false, stream, error: `setup exited ${s.code}: ${s.output.trim().split('\n').at(-1) ?? ''}` };
    }
    const mcp = path.join(ws.dir, '.trod', '.tune-mcp.json');
    writeFileSync(mcp, JSON.stringify({ mcpServers: { trod: { command: process.execPath, args: [defaultServerPath()] } } }));
    const args = ['-p', task.prompt, '--output-format', 'stream-json', '--verbose', '--mcp-config', mcp, '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,TodoWrite,mcp__trod__*', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent', '--model', ctx.config.model, '--max-budget-usd', ctx.config.maxBudgetUsd ?? '2'];
    const { code, text, spawnError } = await new Promise<{ code: number | null; text: string; spawnError?: string }>((resolve) => {
      const child = spawn(ctx.claudeBin ?? ctx.env.TROD_CLAUDE_BIN ?? 'claude', args, { cwd: ws.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      child.stdout.on('data', (c: Buffer) => (buf += c.toString('utf8')));
      child.stderr.on('data', () => {});
      const timer = setTimeout(() => child.kill('SIGKILL'), ctx.config.timeoutMinutes * 60_000);
      child.on('close', (c) => {
        clearTimeout(timer);
        resolve({ code: c, text: buf });
      });
      child.on('error', (err) => resolve({ code: null, text: buf, spawnError: err.message }));
    });
    writeFileSync(stream, text);
    const result = text.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) as { total_cost_usd?: number; is_error?: boolean } | undefined;
    if (code === null || !result) return { task: task.id, run, pass: false, stream, costUsd: result?.total_cost_usd, error: spawnError ? `could not start the session: ${spawnError}` : code === null ? 'session killed (timeout)' : 'session ended without a result' };
    const check = sh(task.check, ws.dir, env, 10 * 60_000);
    return { task: task.id, run, pass: check.code === 0, stream, costUsd: result.total_cost_usd };
  } finally {
    ws.remove();
  }
}

/** Every task × run with a harness, a few at a time. */
async function runBatch(ctx: Ctx, harness: string, tasks: TuneTask[], outDir: string, label: string): Promise<RunResult[]> {
  mkdirSync(outDir, { recursive: true });
  const jobs = tasks.flatMap((t) => Array.from({ length: ctx.config.runs }, (_, i) => [t, i + 1] as const));
  const results: RunResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(ctx.config.parallel, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [t, n] = jobs[next++]!;
        // One broken run (a workspace that cannot be made, a check that throws) must not sink the whole batch.
        const r = await runTask(ctx, harness, t, n, outDir).catch((err: Error): RunResult => ({ task: t.id, run: n, pass: false, stream: '', error: err.message.split('\n')[0] }));
        results.push(r);
        ctx.out(`  ${label} ${r.pass ? 'pass' : r.error ? 'ERROR' : 'fail'} ${t.id}#${n}${r.error ? ` (${r.error})` : ''}`);
      }
    }),
  );
  writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  return results;
}

const passed = (rs: RunResult[]) => rs.filter((r) => r.pass).length;

export const TUNE_PROMPT = (model: string, sessionsDir: string, failed: number, total: number) => `You are tuning notes. You are not solving a task: you are rewriting the notes that ${model} sessions in this project load (.trod/notes.md, and the pages in .trod/wiki/ it points to), so that they pass tasks like the ones below.

${sessionsDir} holds digests of ${total} practice sessions that ran with the current notes: ${failed} failed the task's check, the rest passed. Each digest has the task prompt, the check, the steps the session took and how it ended.

1. Read the current notes, then every failed digest, then a few passed ones.
2. For each failure, find what the session did not know or did wrong, and what in this project would have told it (look at the files, run commands, try things).
3. Rewrite .trod/notes.md (and .trod/wiki/ pages if they help): general rules about this project that hold for unseen tasks of this kind. Never task-specific answers, file contents or "for task X do Y". Keep every current rule unless the sessions show it is wrong. At most ${NOTES_MAX_CHARS} characters in .trod/notes.md.
4. Keep .trod/notes.checks.json consistent: every check must still pass; add checks for new claims you can verify with a trod tool.
Do not change anything outside .trod/. When the notes are written, reply DONE with one line per rule you added or changed.`;

/** Proposes new notes from practice sessions; returns the candidate harness dir, or undefined with a reason. */
async function propose(ctx: Ctx, harness: string, practice: RunResult[], tasks: TuneTask[], dir: string): Promise<{ candidate?: string; reason?: string; costUsd?: number }> {
  const ws = makeWorkspace(ctx.projectDir, harness, ctx.scratch, ctx.hide);
  try {
    const sessions = path.join(ws.dir, '.trod', 'tune-sessions');
    mkdirSync(sessions, { recursive: true });
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const r of practice) {
      if (r.error) continue;
      const t = byId.get(r.task)!;
      const d = existsSync(r.stream) ? digestTranscript(r.stream, { outcome: r.pass ? 'pass' : 'fail', task: t.prompt, maxChars: 6000 }) : undefined;
      writeFileSync(path.join(sessions, `${r.pass ? 'pass' : 'FAIL'}-${r.task}-${r.run}.md`), `# ${r.pass ? 'PASSED' : 'FAILED'}: ${r.task} (run ${r.run})\n\nCheck: \`${t.check}\`\n\n${d?.text ?? '(no transcript)'}\n`);
    }
    const before = existsSync(path.join(ws.dir, '.trod', 'notes.md')) ? readFileSync(path.join(ws.dir, '.trod', 'notes.md'), 'utf8') : '';
    const scored = practice.filter((r) => !r.error);
    const res = await forge({
      projectDir: ws.dir,
      brief: `Practice session digests: ${path.relative(ws.dir, sessions)}/ (FAIL-*.md failed, pass-*.md passed).`,
      prompt: TUNE_PROMPT(ctx.config.model, path.relative(ws.dir, sessions), scored.filter((r) => !r.pass).length, scored.length),
      model: ctx.config.proposer ?? 'claude-opus-5-5',
      maxBudgetUsd: '5',
      linkNotes: false,
      claudeBin: ctx.claudeBin,
      env: { ...ctx.env, [TROD_SESSION_ENV]: 'tune' },
      streamFile: path.join(dir, 'proposer.jsonl'),
      out: ctx.out,
    });
    rmSync(sessions, { recursive: true, force: true });
    if (res.exitCode !== 0) return { reason: `the proposer session failed (exit ${res.exitCode})`, costUsd: res.costUsd };
    const after = existsSync(path.join(ws.dir, '.trod', 'notes.md')) ? readFileSync(path.join(ws.dir, '.trod', 'notes.md'), 'utf8') : '';
    if (!after.trim() || after === before) return { reason: 'the proposer did not change .trod/notes.md', costUsd: res.costUsd };
    const report = await verifyNotes(trodPaths(ws.dir), { execAllowed: true, env: ctx.env });
    if (report.checks.some((c) => !c.ok) || report.errors.length) return { reason: `the candidate's notes checks fail: ${[...report.checks.filter((c) => !c.ok).map((c) => c.claim), ...report.errors].join('; ')}`, costUsd: res.costUsd };
    const candidate = path.join(dir, 'candidate');
    snapshotHarness(path.join(ws.dir, '.trod'), candidate);
    return { candidate, costUsd: res.costUsd };
  } finally {
    ws.remove();
  }
}

export interface TuneIteration {
  iteration: number;
  practice: { passed: number; runs: number; errors: number };
  proposal?: string;
  parent?: { passed: number; runs: number };
  candidate?: { passed: number; runs: number };
  accepted: boolean;
  reason?: string;
}

export interface TuneResult {
  iterations: TuneIteration[];
  accepted: boolean;
  outDir: string;
  costUsd: number;
}

export interface TuneOptions {
  projectDir: string;
  config: TuneConfig;
  out?: (s: string) => void;
  claudeBin?: string;
  env?: NodeJS.ProcessEnv;
  /** Where runs and state go (default .trod/tune/<timestamp>). */
  outDir?: string;
  /** The config file, if not .trod/tune.json: hidden from the workspaces too when it lies inside the project. */
  configFile?: string;
}

export async function tune(opts: TuneOptions): Promise<TuneResult> {
  const out = opts.out ?? (() => {});
  const config = { model: 'claude-haiku-5-5', runs: 2, parallel: 3, timeoutMinutes: 15, ...opts.config };
  const margin = config.margin ?? 1;
  const ctx: Ctx = { projectDir: opts.projectDir, out, claudeBin: opts.claudeBin, env: opts.env ?? process.env, config, scratch: mkdtempSync(path.join(tmpdir(), 'trod-tune-')), hide: hiddenPaths(opts.projectDir, opts.configFile) };
  const { practice, validate } = splitTasks(config.tasks);
  const outDir = opts.outDir ?? path.join(opts.projectDir, TUNE_DIR, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  const ignore = path.join(opts.projectDir, TUNE_DIR, '.gitignore');
  if (existsSync(path.dirname(ignore)) && !existsSync(ignore)) writeFileSync(ignore, '*\n');
  const trodDir = path.join(opts.projectDir, '.trod');
  let harness = path.join(outDir, 'harness-0');
  snapshotHarness(trodDir, harness);
  out(`tuning notes for ${config.model}: ${practice.length} practice task(s), ${validate.length} validation task(s), ${config.runs} run(s) each`);
  const iterations: TuneIteration[] = [];
  let cost = 0;
  let accepted = false;
  const add = (rs: RunResult[]) => rs.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  try {
    for (let it = 1; it <= (config.iterations ?? 1); it++) {
      const dir = path.join(outDir, `iteration-${it}`);
      out(`iteration ${it}: practice`);
      const prac = await runBatch(ctx, harness, practice, path.join(dir, 'practice'), 'practice');
      cost += add(prac);
      const errors = prac.filter((r) => r.error).length;
      const rec: TuneIteration = { iteration: it, practice: { passed: passed(prac), runs: prac.length, errors }, accepted: false };
      iterations.push(rec);
      if (errors === prac.length) {
        rec.reason = 'every practice run errored (setup, timeout or no result): fix the tasks first';
        out(`  ${rec.reason}`);
        break;
      }
      if (passed(prac) === prac.length - errors) {
        rec.reason = 'every practice run passed: nothing to learn from';
        out(`  ${rec.reason}`);
        break;
      }
      out(`iteration ${it}: proposing (${prac.length - errors - passed(prac)} failed run(s) to learn from)`);
      const prop = await propose(ctx, harness, prac, config.tasks, dir);
      cost += prop.costUsd ?? 0;
      if (!prop.candidate) {
        rec.reason = prop.reason;
        out(`  no candidate: ${prop.reason}`);
        continue;
      }
      rec.proposal = prop.candidate;
      out(`iteration ${it}: validating`);
      const parent = await runBatch(ctx, harness, validate, path.join(dir, 'validate-current'), 'current');
      const cand = await runBatch(ctx, prop.candidate, validate, path.join(dir, 'validate-candidate'), 'candidate');
      cost += add(parent) + add(cand);
      // Like with like: runs that errored on either side are left out of both.
      const bad = new Set([...parent, ...cand].filter((r) => r.error).map((r) => `${r.task}#${r.run}`));
      const keep = (rs: RunResult[]) => rs.filter((r) => !bad.has(`${r.task}#${r.run}`));
      rec.parent = { passed: passed(keep(parent)), runs: keep(parent).length };
      rec.candidate = { passed: passed(keep(cand)), runs: keep(cand).length };
      rec.accepted = rec.candidate.runs > 0 && rec.candidate.passed >= rec.parent.passed + margin;
      out(`  ${rec.accepted ? 'ACCEPT' : 'reject'}: current notes ${rec.parent.passed}/${rec.parent.runs}, candidate ${rec.candidate.passed}/${rec.candidate.runs} (needs +${margin})${bad.size ? `; ${bad.size} errored run(s) left out` : ''}`);
      if (rec.accepted) {
        harness = prop.candidate;
        accepted = true;
      }
    }
    if (accepted) {
      for (const f of HARNESS_FILES) rmSync(path.join(trodDir, f), { recursive: true, force: true });
      snapshotHarness(harness, trodDir);
      out(`updated .trod/notes.md${existsSync(path.join(harness, 'wiki')) ? ' and .trod/wiki/' : ''} with the winning candidate; review and commit them`);
    } else out('notes unchanged');
  } finally {
    rmSync(ctx.scratch, { recursive: true, force: true });
  }
  const result = { iterations, accepted, outDir, costUsd: cost };
  writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(result, null, 2));
  out(`runs and digests: ${path.relative(opts.projectDir, outDir)} ($${cost.toFixed(2)})`);
  return result;
}
