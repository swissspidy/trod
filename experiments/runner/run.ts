/**
 * Runs the experiment: every task × arm × seed as a headless `claude -p` run in its own work directory,
 * with an isolated HOME and config dir. Arms:
 *   baseline  no MCP servers, no trod skill
 *   genesis   the trod server (--mcp-config) and skill (--plugin-dir), with TROD_ALLOW_EXEC=1; the agent decides
 *   nudged    as genesis, plus an appended system prompt telling the agent to build repeated operations as trod tools
 *   toolsmith as genesis (no nudge), after one dedicated session that builds robust, general tools for the task's
 *             environment (promoted to .trod/library; its cost is reported separately)
 *   forged    as genesis (no nudge), starting from a library built once per task by `trod forge` (--forge-model,
 *             shared across seeds and models via --forge-dir); the library is in the instructions as cards
 *   library   as genesis (no nudge), but .trod/library/ starts with the tools a nudged run of the same task built
 *             (--library-from <runs dir>, seed 1): the cross-session reuse that `trod promote` is for
 *
 * Usage: node experiments/runner/run.ts [--tasks a,b] [--arms baseline,genesis,nudged] [--seeds 3]
 *          [--model claude-sonnet-5-5] [--parallel 4] [--timeout 1800] [--budget 3] [--out results/runs/<name>]
 * Needs an API key in ANTHROPIC_API_KEY or TEST_API_KEY.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TASKS } from '../tasks/index.ts';
import { sweTasks } from '../swe/swe.ts';
import { appWorldTasks, datasetIds } from '../appworld/appworld.ts';
import { autobenchIds, autobenchTasks } from '../autobench/autobench.ts';
import { birdTasks, birdTestSample } from '../bird/bird.ts';
import { miniwobTasks, mwSample } from '../miniwob/miniwob.ts';
import { sciworldTasks, swTestSample } from '../sciworld/sciworld.ts';
import type { FixtureState, Task } from '../lib/types.ts';
import { collectMetrics, type RunRecord, type StepOutcome } from './metrics.ts';
import { linkNotes, trodPaths } from '../../packages/server/src/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PLUGIN_DIR = path.join(ROOT, 'plugin');

export type Arm = 'baseline' | 'scripts' | 'genesis' | 'nudged' | 'library' | 'toolsmith' | 'forged';

/** Appended to the system prompt in the nudged arm. */
export const NUDGE =
  'Requirement for this session: whenever you would write a helper script or repeat a multi-step command, ' +
  'write it as a trod tool (.trod/tools/<name>.mjs) instead and call it with trod_run. Bash is fine for one-off inspection.';

const { values } = parseArgs({
  options: {
    tasks: { type: 'string' },
    // swe-django4: SWE-bench Verified Django 4.0/4.1 instances (experiments/swe); --tasks picks instance ids, or
    // --sample <file> a JSON list of ids.
    suite: { type: 'string' },
    sample: { type: 'string' },
    arms: { type: 'string', default: 'baseline,genesis,nudged' },
    seeds: { type: 'string', default: '3' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    parallel: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '1800' },
    budget: { type: 'string', default: '3' },
    out: { type: 'string' },
    'library-from': { type: 'string' },
    // resume: each step is a follow-up prompt in the same session (claude -p --resume).
    // sessions: each step is a fresh session in a fresh checkout, as with ephemeral cloud containers. Only
    // "committed" state carries over: nothing for baseline, the whole work dir for scripts, and .trod/library for
    // the trod arms (the harness promotes every valid session tool between sessions, like `trod promote` + commit).
    mode: { type: 'string', default: 'resume' },
    'forge-model': { type: 'string', default: 'claude-opus-5-5' },
    'forge-dir': { type: 'string' },
    // ENABLE_TOOL_SEARCH for every arm; empty keeps Claude Code's default (on). Turning it off loads every tool
    // schema up front (about 13k more tokens per request) and makes each new trod tool invalidate the prompt cache.
    'tool-search': { type: 'string', default: '' },
    // Run claude (and the forge) as this unprivileged user, e.g. so an agent cannot read benchmark ground truth
    // that lives in a root-only directory. The run directories are chowned to it. Needs root.
    'as-user': { type: 'string' },
  },
});

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY (or TEST_API_KEY).');
  process.exit(1);
}

// A mistyped suite, arm or mode must not quietly run something else (the built-in tasks, a trod arm, resume mode).
const SUITES = ['swe-django4', 'bird:test', 'sciworld:test', 'miniwob:test', 'miniwob:dev'];
if (values.suite && !SUITES.includes(values.suite) && !/^(appworld|autobench):/.test(values.suite)) {
  console.error(`unknown --suite ${values.suite}: use one of ${SUITES.join(', ')}, appworld:<split> or autobench:<train|dev|test|pilot> (no --suite runs the built-in tasks)`);
  process.exit(1);
}
const ARMS: Arm[] = ['baseline', 'scripts', 'genesis', 'nudged', 'library', 'toolsmith', 'forged'];
const badArms = values.arms!.split(',').filter((a) => !ARMS.includes(a as Arm));
if (badArms.length) {
  console.error(`unknown --arms ${badArms.join(', ')}: use ${ARMS.join(', ')}`);
  process.exit(1);
}
if (values.mode !== 'resume' && values.mode !== 'sessions') {
  console.error(`unknown --mode ${values.mode}: use resume or sessions`);
  process.exit(1);
}

// appworld:<split>: AppWorld tasks (experiments/appworld); the forge builds tools against a train-split task.
const pool =
  values.suite === 'swe-django4'
    ? sweTasks()
    : values.suite?.startsWith('appworld:')
      ? appWorldTasks(datasetIds(values.suite.slice('appworld:'.length)), path.basename(values.out ?? 'appworld'), process.env.AW_FORGE_TASK ?? '82e2fac_1')
      : // autobench:<train|dev|test|pilot>: AutomationBench workflows, split in experiments/autobench.
        values.suite?.startsWith('autobench:')
        ? autobenchTasks(autobenchIds(values.suite.slice('autobench:'.length)))
        : // bird:test: BIRD dev questions from the test split, BIRD_PER_DB (default 10) per database (experiments/bird).
        values.suite === 'bird:test'
        ? birdTasks(birdTestSample(Number(process.env.BIRD_PER_DB ?? 10)))
        : // sciworld:test: ScienceWorld test variations, SW_PER_TASK (default 2) per task type (experiments/sciworld).
          values.suite === 'sciworld:test'
          ? sciworldTasks(swTestSample(Number(process.env.SW_PER_TASK ?? 2)))
          : // miniwob:<test|dev>: MiniWoB++ episodes, MW_PER_TASK (default 2) seeds per task type (experiments/miniwob).
            values.suite === 'miniwob:test' || values.suite === 'miniwob:dev'
            ? miniwobTasks(mwSample(values.suite.slice('miniwob:'.length) as 'test' | 'dev', Number(process.env.MW_PER_TASK ?? 2)))
            : TASKS;
if (values.suite && !pool.length) {
  console.error(`suite ${values.suite}: no instances (the benchmark is not set up here: see the suite's folder under experiments/ for its setup and home variable)`);
  process.exit(1);
}
const wanted = values.tasks?.split(',') ?? (values.sample ? (JSON.parse(readFileSync(values.sample, 'utf8')) as string[]) : undefined);
const tasks = wanted ? pool.filter((t) => wanted.includes(t.id)) : pool;
const unknown = wanted?.filter((id) => !pool.some((t) => t.id === id)) ?? [];
if (unknown.length) {
  console.error(`unknown task ids: ${unknown.join(', ')}`);
  process.exit(1);
}
const arms = values.arms!.split(',') as Arm[];
const seeds = Number(values.seeds);
const outDir = path.resolve(values.out ?? path.join(ROOT, 'results/runs', new Date().toISOString().replace(/[:.]/g, '-')));
mkdirSync(outDir, { recursive: true });

/** The toolsmith arm's one-off session. */
export const TOOLSMITH =
  'You are preparing tools for future sessions, not solving a task. Future sessions will start fresh, with no memory of this one, ' +
  'and will be able to call the trod tools you build (they get promoted to .trod/library). Study the environment described below, then ' +
  'build a few robust, general trod tools (.trod/tools/<name>.mjs) that make such tasks fast and reliable: handle authentication, pagination, ' +
  'rate limits (back off on 429), and parse every value into a clean, normalized form. Prefer general capabilities (fetch clean records with ' +
  'filters) over answers to one specific question. Document what each tool handles in its description and whenToUse, include examples ' +
  'that pass, and test each tool with trod_run. Do not write answer files. When finished, reply DONE.';

const BASE_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'ToolSearch', 'TodoWrite'];
const DENIED = ['WebFetch', 'WebSearch', 'Task', 'Agent'];

function cleanEnv(home: string, extra: Record<string, string>): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'TMPDIR', 'NODE_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  // The fixture servers listen on 127.0.0.1; keep them off the proxy.
  env.NO_PROXY = env.no_proxy = [env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
  return {
    ...env,
    HOME: home,
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    ANTHROPIC_API_KEY: apiKey!,
    ...(values['tool-search'] ? { ENABLE_TOOL_SEARCH: values['tool-search'] } : {}),
    DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    ...extra,
  };
}

/** spawn(), as --as-user when set: `runuser -u <user> -- env -i K=V… cmd args` (the env is passed explicitly). */
function spawnAs(cmd: string, args: string[], opts: { cwd?: string; env: Record<string, string> }) {
  const user = values['as-user'];
  // Detached (a process group of its own) either way, so a timeout can kill the whole tree: killing runuser alone
  // leaves the session it started running, and the caller waiting for its pipes to close.
  if (!user) return spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const env = { ...opts.env, TMPDIR: path.join(opts.env.HOME!, 'tmp') };
  mkdirSync(env.TMPDIR, { recursive: true });
  chownTree(opts.env.HOME!);
  const vars = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  return spawn('runuser', ['-u', user, '--', 'env', '-i', ...vars, cmd, ...args], { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
}

/** Gives a directory tree to --as-user (no-op without it). */
function chownTree(dir: string): void {
  if (values['as-user'] && existsSync(dir)) spawnSync('chown', ['-R', `${values['as-user']}:`, dir]);
}

/** The service URL as project config: tools must not hardcode it, because it changes between sessions. */
function writeServiceUrl(work: string, baseUrl: string | undefined): void {
  if (!baseUrl) return;
  mkdirSync(path.join(work, '.service'), { recursive: true });
  writeFileSync(path.join(work, '.service', 'base-url'), baseUrl + '\n');
}

async function startFixture(task: Task, expected: unknown, state: FixtureState, work: string, forForge = false): Promise<{ server?: { close(): void }; baseUrl?: string; info?: unknown }> {
  if (task.serve) {
    const s = await task.serve({ work }, forForge);
    return { server: s, baseUrl: s.baseUrl, info: s.info };
  }
  if (!task.handler) return {};
  const server = createServer(task.handler(expected, state));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function runClaude(args: string[], cwd: string, env: Record<string, string>, streamFile: string, stderrFile: string, timeoutMs: number) {
  const out = createWriteStream(streamFile);
  const err = createWriteStream(stderrFile);
  return new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const child = spawnAs('claude', args, { cwd, env });
    child.stdout.pipe(out);
    child.stderr.pipe(err);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      out.end(() => {
        err.end();
        resolve({ code, timedOut });
      });
    });
  });
}

function readSessionId(streamFile: string): string | undefined {
  for (const line of readFileSync(streamFile, 'utf8').split('\n').reverse()) {
    try {
      const e = JSON.parse(line);
      if (e.session_id) return e.session_id;
    } catch {
      // partial line
    }
  }
  return undefined;
}

/**
 * Session mode: start step `i` in a fresh checkout. Trod arms first promote the previous session's valid tools to
 * .trod/library (examples must pass), which carries over with the trod logs; the scripts arm keeps everything.
 */
async function newCheckout(task: Task, arm: Arm, work: string, baseUrl: string | undefined, i: number): Promise<void> {
  if (arm === 'scripts') {
    task.prepareStep?.({ work, baseUrl }, i);
    return;
  }
  const keep = path.join(path.dirname(work), `keep-${i}`);
  rmSync(keep, { recursive: true, force: true });
  if (arm !== 'baseline') {
    for (const entry of listEntries(path.join(work, '.trod', 'tools'))) {
      const name = path.basename(entry, '.mjs');
      // Async: the fixture server runs in this process, and the tool's examples may call it.
      const out = await new Promise<string>((resolve) => {
        const child = spawn(process.execPath, [path.join(PLUGIN_DIR, 'bin', 'trod'), 'promote', name, '--dir', work], {
          env: cleanEnv(process.env.HOME ?? '/tmp', { TROD_ALLOW_EXEC: '1' }),
        });
        let text = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (c: string) => (text += c));
        child.stderr.on('data', (c: string) => (text += c));
        child.on('close', () => resolve(text.trim()));
      });
      appendFileSync(path.join(path.dirname(work), 'promotions.log'), `before session ${i + 1}: ${name}: ${out}\n`);
    }
    // What a team would have committed: the library, and the forge's notes with their checks (plus trod's logs).
    for (const d of ['library', 'logs', 'notes.md', 'notes.checks.json']) {
      const from = path.join(work, '.trod', d);
      if (existsSync(from)) cpSync(from, path.join(keep, d), { recursive: true });
    }
  }
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  task.setup({ work, baseUrl });
  writeServiceUrl(work, baseUrl);
  for (let j = 1; j <= i; j++) task.prepareStep?.({ work, baseUrl }, j);
  if (existsSync(keep)) {
    cpSync(keep, path.join(work, '.trod'), { recursive: true });
    rmSync(keep, { recursive: true, force: true });
    // task.setup may have reset CLAUDE.md: link the notes again, as in the first step.
    if (existsSync(path.join(work, '.trod', 'notes.md'))) linkNotes(trodPaths(work));
  }
  chownTree(work);
}

function listEntries(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => path.join(dir, f)) : [];
}

/** One forge per task, shared by every forged run (and by later runner invocations through --forge-dir). */
const forges = new Map<string, Promise<{ library: string; info: unknown }>>();
function ensureForge(task: Task): Promise<{ library: string; info: unknown }> {
  const key = task.forgeKey ?? task.id;
  if (!forges.has(key)) forges.set(key, doForge(task));
  return forges.get(key)!;
}

async function doForge(task: Task): Promise<{ library: string; info: unknown }> {
  const dir = path.join(path.resolve(values['forge-dir'] ?? path.join(outDir, '_forge')), task.forgeKey ?? task.id);
  const work = path.join(dir, 'work');
  const library = path.join(work, '.trod', 'library');
  const done = path.join(dir, 'forge.json');
  if (existsSync(done)) return { library, info: JSON.parse(readFileSync(done, 'utf8')) };
  mkdirSync(work, { recursive: true });
  const home = path.join(dir, 'home');
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  const expected = task.forgeSetup ? (task.forgeSetup({ work }), null) : task.setup({ work });
  const state = { step: 0 };
  const { server, baseUrl, info: envInfo } = await startFixture(task, expected, state, work, true);
  writeServiceUrl(work, baseUrl);
  const brief = task.toolsmithBrief?.({ work, baseUrl, info: envInfo }) ?? `Future sessions will get tasks like this one (do not solve it):\n\n${task.steps[0]!.prompt({ work, baseUrl, info: envInfo })}`;
  const urlNote = baseUrl ? `\n\nThe service's base URL changes between sessions (today it is ${baseUrl}). Tools must read it from the file .service/base-url in the project directory (ctx.projectDir) instead of hardcoding it or taking it as a required input.` : '';
  writeFileSync(path.join(dir, 'brief.md'), brief + urlNote);
  console.log(`forging ${task.forgeKey ?? task.id} with ${values['forge-model']} …`);
  const t0 = Date.now();
  const output = await new Promise<string>((resolve) => {
    chownTree(dir);
    const child = spawnAs(process.execPath, [path.join(PLUGIN_DIR, 'bin', 'trod'), 'forge', '--dir', work, '--brief', `@${path.join(dir, 'brief.md')}`, '--model', values['forge-model']!, '--stream', path.join(dir, 'forge.jsonl'), '--json'], {
      env: cleanEnv(home, { ...task.env?.({ work }) }),
    });
    let text = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => (text += c));
    child.stderr.on('data', (c: string) => (text += c));
    child.on('close', () => resolve(text));
  });
  server?.close();
  writeFileSync(path.join(dir, 'forge.log'), output);
  const json = output.slice(output.indexOf('{\n'));
  let info: Record<string, unknown> = {};
  let parsed = true;
  try {
    info = JSON.parse(json);
  } catch {
    parsed = false;
    info = { error: 'could not parse forge output; see forge.log' };
  }
  info.wallMs = Date.now() - t0;
  info.model = values['forge-model'];
  // Only a forge that reported its result counts as done; a broken one is retried by the next invocation.
  writeFileSync(parsed ? done : path.join(dir, 'forge.error.json'), JSON.stringify(info, null, 2));
  console.log(`forged ${task.forgeKey ?? task.id}: ${JSON.stringify((info as { promoted?: string[] }).promoted ?? [])}`);
  return { library, info };
}

async function runOne(task: Task, arm: Arm, seed: number): Promise<RunRecord> {
  const id = `${task.id}/${arm}-s${seed}`;
  const runDir = path.join(outDir, task.id, `${arm}-s${seed}`);
  const work = path.join(runDir, 'work');
  const home = path.join(runDir, 'home');
  // A retry (after an infra result or a crash) starts clean: transcripts, streams and logs of the earlier attempt
  // would be counted into this one's metrics.
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  // Skip first-run onboarding in the isolated config.
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));

  if (arm === 'library') {
    // Seed the committed library with the tools a nudged run of this task built (as `trod promote` would).
    const from = path.resolve(values['library-from'] ?? '', task.id, 'nudged-s1', 'work', '.trod', 'tools');
    if (existsSync(from)) for (const t of readdirSync(from)) cpSync(path.join(from, t), path.join(work, '.trod', 'library', t), { recursive: true });
  }
  let forgeInfo: unknown;
  if (arm === 'forged') {
    const f = await ensureForge(task);
    forgeInfo = f.info;
    if (existsSync(f.library)) cpSync(f.library, path.join(work, '.trod', 'library'), { recursive: true });
    // Notes the forge wrote (ADR 0004) travel with the library and are linked into CLAUDE.md, as `trod forge` does.
    const forgeTrod = path.dirname(f.library);
    for (const file of ['notes.md', 'notes.checks.json']) {
      if (existsSync(path.join(forgeTrod, file))) cpSync(path.join(forgeTrod, file), path.join(work, '.trod', file));
    }

  }
  const expected = task.setup({ work });
  // After setup, which may reset CLAUDE.md: link the forge's notes as `trod forge` would.
  if (arm === 'forged' && existsSync(path.join(work, '.trod', 'notes.md'))) linkNotes(trodPaths(work));
  writeFileSync(path.join(runDir, 'expected.json'), JSON.stringify(expected, null, 2));
  const state = { step: 0 };
  const { server, baseUrl, info } = await startFixture(task, expected, state, work);
  writeServiceUrl(work, baseUrl);
  chownTree(runDir);

  const sessionTag = `${task.id}-${arm}-s${seed}`;
  const common = ['--output-format', 'stream-json', '--verbose', '--model', values.model!, '--max-budget-usd', values.budget!, '--strict-mcp-config', '--disallowedTools', DENIED.join(',')];
  let env: Record<string, string>;
  if (arm !== 'baseline' && arm !== 'scripts') {
    // --strict-mcp-config also drops plugin MCP servers, so the server is passed explicitly; the plugin
    // still provides the skill.
    const mcpConfig = path.join(runDir, 'mcp.json');
    writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { trod: { command: 'node', args: [path.join(PLUGIN_DIR, 'server/trod-server.mjs')] } } }));
    common.push('--plugin-dir', PLUGIN_DIR, '--mcp-config', mcpConfig, '--allowedTools', [...BASE_TOOLS, 'mcp__trod__*'].join(','));
    if (arm === 'nudged') common.push('--append-system-prompt', NUDGE);
    env = cleanEnv(home, { ...task.env?.({ work }), TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: work, TROD_SESSION_ID: sessionTag });
  } else {
    common.push('--allowedTools', BASE_TOOLS.join(','));
    env = cleanEnv(home, { ...task.env?.({ work }) });
  }

  // Each step is one `claude -p` call; follow-ups resume the same session.
  let toolsmith: { costUsd: number; turns: number; wallMs: number; usage: unknown; library: string[] } | undefined;
  let started = Date.now();
  const steps: StepOutcome[] = [];
  let sessionId: string | undefined;
  let timedOut = false;
  let exitCode: number | null = 0;
  // The fixture (a server, a browser) must not outlive a run that throws.
  try {
    if (arm === 'toolsmith') {
      const brief = task.toolsmithBrief?.({ work, baseUrl }) ?? `Future sessions will get tasks like this one:\n\n${task.steps[0]!.prompt({ work, baseUrl, info })}`;
      const prompt = `${TOOLSMITH}\n\n${brief}`;
      writeFileSync(path.join(runDir, 'toolsmith-prompt.txt'), prompt);
      const tsHome = path.join(runDir, 'home-toolsmith');
      mkdirSync(path.join(tsHome, '.claude'), { recursive: true });
      const tsEnv = { ...env, HOME: tsHome, CLAUDE_CONFIG_DIR: path.join(tsHome, '.claude') };
      const tsStream = path.join(runDir, 'toolsmith.jsonl');
      const t0 = Date.now();
      await runClaude(['-p', prompt, ...common], work, tsEnv, tsStream, path.join(runDir, 'toolsmith-stderr.txt'), Number(values.timeout) * 1000);
      const res = readFileSync(tsStream, 'utf8').split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1);
      // Promote what it built, then start the measured sessions from a fresh checkout that has only the library.
      await newCheckout(task, 'toolsmith', work, baseUrl, 0);
      toolsmith = { costUsd: res?.total_cost_usd ?? 0, turns: res?.num_turns ?? 0, wallMs: Date.now() - t0, usage: res?.usage ?? {}, library: listEntries(path.join(work, '.trod', 'library')).map((e) => path.basename(e)) };
    }
    started = Date.now();
    const deadline = started + Number(values.timeout) * 1000;
    for (const [i, step] of task.steps.entries()) {
      state.step = i;
      if (i > 0 && values.mode === 'sessions') await newCheckout(task, arm, work, baseUrl, i);
      else if (i > 0 && arm === 'toolsmith') await newCheckout(task, arm, work, baseUrl, i);
      else if (i > 0) task.prepareStep?.({ work, baseUrl }, i);
      const prompt = step.prompt({ work, baseUrl, info });
      writeFileSync(path.join(runDir, `prompt-${i + 1}.txt`), prompt);
      const resume = values.mode === 'sessions' || arm === 'toolsmith' ? [] : sessionId ? ['--resume', sessionId] : [];
      const args = ['-p', prompt, ...common, ...resume];
      const streamFile = path.join(runDir, `stream-${i + 1}.jsonl`);
      const stepStarted = Date.now();
      const exit = await runClaude(args, work, env, streamFile, path.join(runDir, `stderr-${i + 1}.txt`), Math.max(1000, deadline - Date.now()));
      exitCode = exit.code;
      timedOut ||= exit.timedOut;
      sessionId = readSessionId(streamFile) ?? sessionId;
      let check;
      try {
        check = await step.check({ work, baseUrl, info }, expected);
      } catch (e) {
        check = { pass: false, score: 0, details: `checker crashed: ${(e as Error).message}` };
      }
      steps.push({ step: i + 1, wallMs: Date.now() - stepStarted, exitCode: exit.code, timedOut: exit.timedOut, check });
      if (exit.timedOut) break;
    }
  } finally {
    server?.close();
  }
  const wallMs = Date.now() - started;

  // Steps not reached (timeout) count as failed.
  const scores = task.steps.map((_, i) => steps[i]?.check.score ?? 0);
  // A session the API refused (no credit, overload, ...) never tried the task: infra, not a failure.
  const apiError = steps.map((_, i) => apiErrorOf(path.join(runDir, `stream-${i + 1}.jsonl`))).find(Boolean);
  // So is a step whose check could not be completed (the environment or the grader failed, not the agent).
  const infra = !!apiError || steps.some((s) => s.check.infra);
  const check = {
    ...(infra ? { infra: true } : {}),
    pass: !infra && steps.length === task.steps.length && steps.every((s) => s.check.pass),
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    details: apiError ? `infra: API error (${apiError})` : steps.map((s) => `step ${s.step}: ${s.check.pass ? 'ok' : s.check.details}`).join(' | '),
  };
  const record: RunRecord & { toolsmith?: unknown } = collectMetrics({ id, task, arm, seed, runDir, work, home, wallMs, exitCode, timedOut, check, steps, model: values.model! });
  if (toolsmith) record.toolsmith = toolsmith;
  if (forgeInfo) (record as RunRecord & { forge?: unknown }).forge = forgeInfo;
  // An infra run is kept for inspection but not as result.json, so the next invocation retries it.
  writeFileSync(path.join(runDir, infra ? 'result.infra.json' : 'result.json'), JSON.stringify(record, null, 2));
  task.afterRun?.({ work, baseUrl });
  console.log(
    `${infra ? 'INFRA' : record.check.pass ? 'PASS' : 'FAIL'} ${id.padEnd(34)} score=${record.check.score.toFixed(2)} turns=${record.turns} tokens=${record.tokens.total} cost=$${record.costUsd.toFixed(3)} wall=${Math.round(wallMs / 1000)}s` +
      (arm !== 'baseline' ? ` tools=${record.trod.toolsCreated} calls=${record.trod.calls}` : '') +
      (record.check.pass ? '' : `  (${record.check.details.slice(0, 140)})`),
  );
  return record;
}

/** The API error a session's stream reports (its result event's api_error_status), if any. */
function apiErrorOf(streamFile: string): string | undefined {
  if (!existsSync(streamFile)) return undefined;
  for (const line of readFileSync(streamFile, 'utf8').split('\n')) {
    if (!line.includes('"api_error_status"')) continue;
    try {
      const e = JSON.parse(line) as { type?: string; api_error_status?: number | null; result?: string };
      if (e.type === 'result' && e.api_error_status) return `${e.api_error_status}: ${String(e.result ?? '').slice(0, 80)}`;
    } catch {
      // not JSON
    }
  }
  return undefined;
}

const jobs: [Task, Arm, number][] = [];
for (let seed = 1; seed <= seeds; seed++) for (const task of tasks) for (const arm of arms) jobs.push([task, arm, seed]);

console.log(`${jobs.length} runs -> ${path.relative(ROOT, outDir)} (model ${values.model}, parallel ${values.parallel})`);
const records: RunRecord[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(Number(values.parallel), jobs.length) }, async () => {
    while (next < jobs.length) {
      const [task, arm, seed] = jobs[next++]!;
      const resultPath = path.join(outDir, task.id, `${arm}-s${seed}`, 'result.json');
      if (existsSync(resultPath)) {
        console.log(`skip ${task.id}/${arm}-s${seed} (done)`);
        continue;
      }
      try {
        records.push(await runOne(task, arm, seed));
      } catch (e) {
        console.error(`ERROR ${task.id}/${arm}-s${seed}: ${(e as Error).stack}`);
      }
    }
  }),
);
console.log(`done: ${records.length} runs. Aggregate with: node experiments/runner/report.ts ${path.relative(ROOT, outDir)}`);
