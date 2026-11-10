/**
 * ScienceWorld (https://sciworld.apps.allenai.org, Apache-2.0; `pip install scienceworld`) tasks for the runner.
 *
 * 30 task types (boil water, find a living thing, mix paints, measure melting points, …), each with train, dev and
 * test variations. Every run gets its own environment process (sw_server.py) on one test variation; the agent acts
 * through the `sw` command (one action per line). The agent never sees the score or the gold path; the runner reads
 * the final score (0–100; −100 when the agent did something that fails the task) with a token.
 *
 * SW_NOTES=<dir> copies <dir>/<task>.md into the work dir as CLAUDE.md (notes forged from train variations).
 * SW_HOME (default /opt/sciworld) holds venv/ with scienceworld installed; variations.json is cached there.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

export const SW_HOME = path.resolve(process.env.SW_HOME ?? '/opt/sciworld');
const PYTHON = path.join(SW_HOME, 'venv', 'bin', 'python');
const SERVER = path.join(import.meta.dirname, 'sw_server.py');
const BIN = path.join(import.meta.dirname, 'bin');
export const STEP_LIMIT = Number(process.env.SW_STEP_LIMIT ?? 100);

export interface Variations {
  [task: string]: { train: number[]; dev: number[]; test: number[] };
}

/** Task names and their variation splits (computed once with the JVM, then cached). */
export function variations(): Variations {
  const cache = path.join(SW_HOME, 'variations.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as Variations;
  if (!existsSync(PYTHON)) return {};
  const code = `import json
from scienceworld import ScienceWorldEnv
env = ScienceWorldEnv("", envStepLimit=10)
out = {}
for t in env.get_task_names():
    env.load(t, 0)
    out[t] = {"train": env.get_variations_train(), "dev": env.get_variations_dev(), "test": env.get_variations_test()}
print(json.dumps(out))`;
  const res = spawnSync(PYTHON, ['-c', code], { encoding: 'utf8', maxBuffer: 1 << 26 });
  // Cache only a probe that worked: an empty file here would make every later run fail on JSON.parse.
  if (res.status !== 0 || !res.stdout?.trim()) throw new Error(`could not list ScienceWorld variations (exit ${res.status}): ${(res.stderr || res.error?.message || '').slice(-500)}`);
  const line = res.stdout.trim().split('\n').at(-1)!;
  const parsed = JSON.parse(line) as Variations;
  writeFileSync(cache, line);
  return parsed;
}

/** The first `perTask` test variations of every task type. */
export function swTestSample(perTask: number): { task: string; variation: number }[] {
  return Object.entries(variations()).flatMap(([task, v]) => v.test.slice(0, perTask).map((variation) => ({ task, variation })));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

export interface SwEnv {
  baseUrl: string;
  token: string;
  close(): void;
}

export async function startSw(task: string, variation: number): Promise<SwEnv> {
  const port = await freePort();
  const token = randomBytes(16).toString('hex');
  const child = spawn(PYTHON, [SERVER, task, String(variation), String(port), String(STEP_LIMIT)], { env: { PATH: process.env.PATH ?? '', HOME: SW_HOME, SW_SCORE_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`ScienceWorld ${task}/${variation} did not start: ${log.slice(-300)}`));
    }, 120_000);
    const onData = (c: Buffer) => {
      log += c.toString();
      if (log.includes(`ready ${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ScienceWorld ${task}/${variation} could not start: ${err.message}`));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`ScienceWorld ${task}/${variation} exited (${code}): ${log.slice(-300)}`));
    });
  });
  return { baseUrl: `http://127.0.0.1:${port}`, token, close: () => child.kill() };
}

async function score(env: SwEnv): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetch(`${env.baseUrl}/score`, { method: 'POST', headers: { 'x-score-token': env.token } });
  } catch (e) {
    // The environment is gone: not the agent's failure (as miniwob.ts treats it).
    return { pass: false, score: 0, infra: true, details: `infra: score request failed (${(e as Error).message})` };
  }
  if (!res.ok) return { pass: false, score: 0, infra: true, details: `infra: score failed (${res.status})` };
  const r = (await res.json()) as { score: number; done: boolean; moves: number };
  return { pass: r.score >= 100, score: Math.max(0, r.score) / 100, details: `score ${r.score}/100 after ${r.moves} actions${r.done ? '' : ' (not ended)'}` };
}

const PROMPT = (info: { description: string; start: string }) => `You are an agent in ScienceWorld, a text-based science simulation (rooms, objects, substances, devices).

Task: ${info.description}

Act with the \`sw\` command, one action per line (several lines run in order):

    sw <<'EOF'
    look around
    EOF

\`sw --task\` prints the task and the action templates (e.g. "open OBJ", "move OBJ to OBJ", "focus on OBJ", "wait"). Object names must match the observations. You have at most ${STEP_LIMIT} actions in total. "focus on" signals which object your task is about: focusing on the wrong object can fail the task, so only focus when the task tells you to and you have the right object. Nobody can answer questions while you work. When the task is done (or has ended), reply DONE.

You start here:
${info.start}`;

export function sciworldTasks(sample: { task: string; variation: number }[]): Task[] {
  const envs = new Map<string, SwEnv>();
  return sample.map(
    ({ task, variation }): Task => ({
      id: `${task}-v${variation}`,
      title: `ScienceWorld ${task} #${variation}`,
      kind: 'control',
      repetitions: 1,
      forgeKey: `sw-${task}`,
      setup: ({ work }: TaskContext) => {
        const notes = process.env.SW_NOTES ? path.join(process.env.SW_NOTES, `${task}.md`) : '';
        rmSync(path.join(work, 'CLAUDE.md'), { force: true });
        if (notes && existsSync(notes)) cpSync(notes, path.join(work, 'CLAUDE.md'), { dereference: true });
        return { task, variation };
      },
      serve: async ({ work }: TaskContext, forForge?: boolean) => {
        // A forge (the runner's forged arm) must never see a test variation: give it a train one.
        const train = variations()[task]?.train[0];
        if (forForge && train === undefined) throw new Error(`ScienceWorld ${task}: no train variation to forge against`);
        const env = await startSw(task, forForge ? train! : variation);
        envs.set(work, env);
        const info = (await (await fetch(`${env.baseUrl}/task`)).json()) as { description: string; start: string };
        return { baseUrl: env.baseUrl, close: () => env.close(), info };
      },
      env: ({ work }: TaskContext) => ({ PATH: `${BIN}:${process.env.PATH ?? ''}`, SW_WORK: work }),
      steps: [
        {
          prompt: (ctx: TaskContext) => PROMPT(ctx.info),
          check: ({ work }: TaskContext) => {
            const env = envs.get(work);
            return env ? score(env) : { pass: false, score: 0, infra: true, details: 'infra: no environment' };
          },
        },
      ],
    }),
  );
}
