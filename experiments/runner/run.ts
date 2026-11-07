/**
 * Runs the experiment: every task × arm × seed as a headless `claude -p` run in its own work directory,
 * with an isolated HOME and config dir. Arms:
 *   baseline  no MCP servers, no trod skill
 *   genesis   the trod server (--mcp-config) and skill (--plugin-dir), with TROD_ALLOW_EXEC=1; the agent decides
 *   nudged    as genesis, plus an appended system prompt telling the agent to build repeated operations as trod tools
 *   library   as genesis (no nudge), but .trod/library/ starts with the tools a nudged run of the same task built
 *             (--library-from <runs dir>, seed 1): the cross-session reuse that `trod promote` is for
 *
 * Usage: node experiments/runner/run.ts [--tasks a,b] [--arms baseline,genesis,nudged] [--seeds 3]
 *          [--model claude-sonnet-5-5] [--parallel 4] [--timeout 1800] [--budget 3] [--out results/runs/<name>]
 * Needs an API key in ANTHROPIC_API_KEY or TEST_API_KEY.
 */
import { spawn } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TASKS } from '../tasks/index.ts';
import type { FixtureState, Task } from '../lib/types.ts';
import { collectMetrics, type RunRecord, type StepOutcome } from './metrics.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PLUGIN_DIR = path.join(ROOT, 'plugin');

export type Arm = 'baseline' | 'genesis' | 'nudged' | 'library';

/** Appended to the system prompt in the nudged arm. */
export const NUDGE =
  'Requirement for this session: whenever you would write a helper script or repeat a multi-step command, ' +
  'write it as a trod tool (.trod/tools/<name>.mjs) instead and call it with trod_run. Bash is fine for one-off inspection.';

const { values } = parseArgs({
  options: {
    tasks: { type: 'string' },
    arms: { type: 'string', default: 'baseline,genesis,nudged' },
    seeds: { type: 'string', default: '3' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    parallel: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '1800' },
    budget: { type: 'string', default: '3' },
    out: { type: 'string' },
    'library-from': { type: 'string' },
    // ENABLE_TOOL_SEARCH for every arm; empty keeps Claude Code's default (on). Turning it off loads every tool
    // schema up front (about 13k more tokens per request) and makes each new trod tool invalidate the prompt cache.
    'tool-search': { type: 'string', default: '' },
  },
});

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY (or TEST_API_KEY).');
  process.exit(1);
}

const tasks = values.tasks ? TASKS.filter((t) => values.tasks!.split(',').includes(t.id)) : TASKS;
const arms = values.arms!.split(',') as Arm[];
const seeds = Number(values.seeds);
const outDir = path.resolve(values.out ?? path.join(ROOT, 'results/runs', new Date().toISOString().replace(/[:.]/g, '-')));
mkdirSync(outDir, { recursive: true });

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

async function startFixture(task: Task, expected: unknown, state: FixtureState): Promise<{ server?: Server; baseUrl?: string }> {
  if (!task.handler) return {};
  const server = createServer(task.handler(expected, state));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function runClaude(args: string[], cwd: string, env: Record<string, string>, streamFile: string, stderrFile: string, timeoutMs: number) {
  const out = createWriteStream(streamFile);
  const err = createWriteStream(stderrFile);
  return new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const child = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out);
    child.stderr.pipe(err);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
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

async function runOne(task: Task, arm: Arm, seed: number): Promise<RunRecord> {
  const id = `${task.id}/${arm}-s${seed}`;
  const runDir = path.join(outDir, task.id, `${arm}-s${seed}`);
  const work = path.join(runDir, 'work');
  const home = path.join(runDir, 'home');
  mkdirSync(work, { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  // Skip first-run onboarding in the isolated config.
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));

  if (arm === 'library') {
    // Seed the committed library with the tools a nudged run of this task built (as `trod promote` would).
    const from = path.resolve(values['library-from'] ?? '', task.id, 'nudged-s1', 'work', '.trod', 'tools');
    if (existsSync(from)) for (const t of readdirSync(from)) cpSync(path.join(from, t), path.join(work, '.trod', 'library', t), { recursive: true });
  }
  const expected = task.setup({ work });
  writeFileSync(path.join(runDir, 'expected.json'), JSON.stringify(expected, null, 2));
  const state = { step: 0 };
  const { server, baseUrl } = await startFixture(task, expected, state);

  const sessionTag = `${task.id}-${arm}-s${seed}`;
  const common = ['--output-format', 'stream-json', '--verbose', '--model', values.model!, '--max-budget-usd', values.budget!, '--strict-mcp-config', '--disallowedTools', DENIED.join(',')];
  let env: Record<string, string>;
  if (arm !== 'baseline') {
    // --strict-mcp-config also drops plugin MCP servers, so the server is passed explicitly; the plugin
    // still provides the skill.
    const mcpConfig = path.join(runDir, 'mcp.json');
    writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { trod: { command: 'node', args: [path.join(PLUGIN_DIR, 'server/trod-server.mjs')] } } }));
    common.push('--plugin-dir', PLUGIN_DIR, '--mcp-config', mcpConfig, '--allowedTools', [...BASE_TOOLS, 'mcp__trod__*'].join(','));
    if (arm === 'nudged') common.push('--append-system-prompt', NUDGE);
    env = cleanEnv(home, { TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: work, TROD_SESSION_ID: sessionTag });
  } else {
    common.push('--allowedTools', BASE_TOOLS.join(','));
    env = cleanEnv(home, {});
  }

  // Each step is one `claude -p` call; follow-ups resume the same session.
  const started = Date.now();
  const steps: StepOutcome[] = [];
  let sessionId: string | undefined;
  let timedOut = false;
  let exitCode: number | null = 0;
  const deadline = started + Number(values.timeout) * 1000;
  for (const [i, step] of task.steps.entries()) {
    state.step = i;
    if (i > 0) task.prepareStep?.({ work, baseUrl }, i);
    const prompt = step.prompt({ work, baseUrl });
    writeFileSync(path.join(runDir, `prompt-${i + 1}.txt`), prompt);
    const args = ['-p', prompt, ...common, ...(sessionId ? ['--resume', sessionId] : [])];
    const streamFile = path.join(runDir, `stream-${i + 1}.jsonl`);
    const stepStarted = Date.now();
    const exit = await runClaude(args, work, env, streamFile, path.join(runDir, `stderr-${i + 1}.txt`), Math.max(1000, deadline - Date.now()));
    exitCode = exit.code;
    timedOut ||= exit.timedOut;
    sessionId = readSessionId(streamFile) ?? sessionId;
    let check;
    try {
      check = step.check({ work, baseUrl }, expected);
    } catch (e) {
      check = { pass: false, score: 0, details: `checker crashed: ${(e as Error).message}` };
    }
    steps.push({ step: i + 1, wallMs: Date.now() - stepStarted, exitCode: exit.code, timedOut: exit.timedOut, check });
    if (exit.timedOut) break;
  }
  const wallMs = Date.now() - started;
  server?.close();

  // Steps not reached (timeout) count as failed.
  const scores = task.steps.map((_, i) => steps[i]?.check.score ?? 0);
  const check = {
    pass: steps.length === task.steps.length && steps.every((s) => s.check.pass),
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    details: steps.map((s) => `step ${s.step}: ${s.check.pass ? 'ok' : s.check.details}`).join(' | '),
  };
  const record = collectMetrics({ id, task, arm, seed, runDir, work, home, wallMs, exitCode, timedOut, check, steps, model: values.model! });
  writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(record, null, 2));
  console.log(
    `${record.check.pass ? 'PASS' : 'FAIL'} ${id.padEnd(34)} score=${record.check.score.toFixed(2)} turns=${record.turns} tokens=${record.tokens.total} cost=$${record.costUsd.toFixed(3)} wall=${Math.round(wallMs / 1000)}s` +
      (arm !== 'baseline' ? ` tools=${record.trod.toolsCreated} calls=${record.trod.calls}` : '') +
      (record.check.pass ? '' : `  (${record.check.details.slice(0, 140)})`),
  );
  return record;
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
