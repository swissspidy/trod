/**
 * MiniWoB++ (https://github.com/Farama-Foundation/miniwob-plusplus, MIT; `pip install miniwob`) tasks for the runner.
 *
 * About 130 small web tasks (book a flight, pick a date, reply to an email, use an autocomplete, ...), each a page
 * whose content is generated from a seed. Every run gets its own episode (mw_server.mjs, headless Chromium); the
 * agent acts through the `mw` command (observe the page's elements, click, type, press keys, take screenshots). The
 * agent never sees the reward; the runner reads the raw reward (−1..1, task solved when > 0) with a token.
 *
 * Splits by seed: test = seeds 0..MW_PER_TASK−1, dev = seeds 500+, train = seeds 1000+ (forges use train only).
 * MW_TASKS=<a,b,...> restricts the task types (default: all, minus real-time tasks and -nodelay duplicates).
 * MW_NOTES=<dir> copies <dir>/<task>.md into the work dir as CLAUDE.md (notes forged from train seeds).
 * MW_HOME (default /opt/miniwob) holds html/ (the package's html directory).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

export const MW_HOME = path.resolve(process.env.MW_HOME ?? '/opt/miniwob');
const SERVER = path.join(import.meta.dirname, 'mw_server.mjs');
const BIN = path.join(import.meta.dirname, 'bin');
export const MAX_ACTIONS = Number(process.env.MW_MAX_ACTIONS ?? 60);
/** Tasks that need sub-second reactions or watching an animation: not a fit for a turn-based agent. */
const REALTIME = new Set(['chase-circle', 'moving-items', 'simon-says']);
export const SEEDS = { test: 0, dev: 500, train: 1000 } as const;

export function taskTypes(): string[] {
  const dir = path.join(MW_HOME, 'html', 'miniwob');
  if (!existsSync(dir)) return [];
  const all = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
  const wanted = process.env.MW_TASKS?.split(',').map((s) => s.trim()).filter(Boolean);
  return (wanted ?? all.filter((t) => !REALTIME.has(t) && !t.endsWith('-nodelay'))).filter((t) => all.includes(t)).sort();
}

export function mwSample(split: keyof typeof SEEDS, perTask: number): { task: string; seed: number }[] {
  return taskTypes().flatMap((task) => Array.from({ length: perTask }, (_, i) => ({ task, seed: SEEDS[split] + i })));
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

export interface MwEnv {
  baseUrl: string;
  token: string;
  close(): void;
}

export async function startMw(task: string, seed: number): Promise<MwEnv> {
  const port = await freePort();
  const token = randomBytes(16).toString('hex');
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '/root', MW_HOME, MW_SCORE_TOKEN: token, MW_MAX_ACTIONS: String(MAX_ACTIONS) };
  const child = spawn(process.execPath, [SERVER, task, String(seed), String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MiniWoB ${task}/${seed} did not start: ${log.slice(-300)}`));
    }, 60_000);
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
      reject(new Error(`MiniWoB ${task}/${seed} could not start: ${err.message}`));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`MiniWoB ${task}/${seed} exited (${code}): ${log.slice(-300)}`));
    });
  });
  return { baseUrl: `http://127.0.0.1:${port}`, token, close: () => child.kill() };
}

async function score(env: MwEnv): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetch(`${env.baseUrl}/score`, { method: 'POST', headers: { 'x-score-token': env.token } });
  } catch (e) {
    return { pass: false, score: 0, infra: true, details: `infra: score request failed (${(e as Error).message})` };
  }
  if (!res.ok) return { pass: false, score: 0, infra: true, details: `infra: score failed (${res.status})` };
  const r = (await res.json()) as { reward: number; done: boolean; reason?: string };
  return { pass: r.reward > 0, score: Math.max(0, r.reward), details: `reward ${r.reward}${r.done ? '' : ' (episode not ended)'}${r.reason ? ` (${r.reason})` : ''}` };
}

const PROMPT = (info: { utterance: string; observation: string }) => `You are operating a small web page in a browser to complete a task.

Task: ${info.utterance}

Act with the \`mw\` command: one action per argument list, or several actions on stdin (one per line, run in order):

    mw click 12
    mw <<'EOF'
    type 3 hello
    press Enter
    EOF

After each call it prints the page's elements again, each as [id] tag "text" attributes @x,y widthxheight. \`mw help\` lists all actions (click, dblclick, hover, type, press, select, clickxy, drag, dragxy, scroll, screenshot). For pictures, shapes and colors, take a screenshot (mw screenshot page.png) and Read the file. You have at most ${MAX_ACTIONS} actions in total. Most tasks end when you submit or make the final choice, and the page then accepts no more actions; a wrong final choice fails the task, so check before you submit. Nobody can answer questions while you work. When the task is done (or has ended), reply DONE.

The page now:
${info.observation}`;

export function miniwobTasks(sample: { task: string; seed: number }[]): Task[] {
  const envs = new Map<string, MwEnv>();
  return sample.map(
    ({ task, seed }): Task => ({
      id: `${task}-s${seed}`,
      title: `MiniWoB ${task} #${seed}`,
      kind: 'control',
      repetitions: 1,
      forgeKey: `mw-${task}`,
      setup: ({ work }: TaskContext) => {
        const notes = process.env.MW_NOTES ? path.join(process.env.MW_NOTES, `${task}.md`) : '';
        rmSync(path.join(work, 'CLAUDE.md'), { force: true });
        if (notes && existsSync(notes)) cpSync(notes, path.join(work, 'CLAUDE.md'), { dereference: true });
        return { task, seed };
      },
      serve: async ({ work }: TaskContext, forForge?: boolean) => {
        // A forge never sees a test or dev seed.
        const env = await startMw(task, forForge ? SEEDS.train : seed);
        envs.set(work, env);
        const info = (await (await fetch(`${env.baseUrl}/task`)).json()) as { utterance: string; observation: string };
        return { baseUrl: env.baseUrl, close: () => env.close(), info };
      },
      env: ({ work }: TaskContext) => ({ PATH: `${BIN}:${process.env.PATH ?? ''}`, MW_WORK: work }),
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
