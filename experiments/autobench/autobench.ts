/**
 * AutomationBench (https://github.com/zapier/AutomationBench) tasks for the experiment runner.
 *
 * 600 business workflows (sales, marketing, operations, support, finance, HR) across 47 simulated apps. Each task
 * runs in its own in-memory world (ab_server.py) started by the runner. The agent reaches it only through the `ab`
 * command: `ab search` (the benchmark's api_search) and `ab fetch` (its api_fetch), the benchmark's own `api`
 * toolset. Grading is the benchmark's rubric: a task passes when every scored assertion on the final world holds.
 *
 * The benchmark has no train/test split, so this folder defines one: per domain, a seeded shuffle of the 100 tasks,
 * 50 for learning (train.json) and 50 held out (test.json). Ids are <domain>-<index in the domain's dataset> at the
 * commit in README.md.
 *
 * AB_HOME (default experiments/autobench/.cache) holds src/ (the benchmark's repository, with .venv from
 * `uv sync --no-dev`). Run the agent as another OS user (runner --as-user) that cannot read AB_HOME: the source
 * holds every task's assertions.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

export const AB_HOME = path.resolve(process.env.AB_HOME ?? path.join(import.meta.dirname, '.cache'));
const SERVER = path.join(import.meta.dirname, 'ab_server.py');
const BIN = path.join(import.meta.dirname, 'bin');

/** The ids of a split (train, test, pilot), or [] when the benchmark is not installed here. */
export function autobenchIds(split: string): string[] {
  const f = path.join(import.meta.dirname, `${split}.json`);
  if (!existsSync(f) || !existsSync(path.join(AB_HOME, 'src', '.venv'))) return [];
  return JSON.parse(readFileSync(f, 'utf8')) as string[];
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

interface Running {
  baseUrl: string;
  token: string;
  close(): void;
}

async function start(id: string): Promise<Running> {
  const port = await freePort();
  const token = randomBytes(16).toString('hex');
  const src = path.join(AB_HOME, 'src');
  const child = spawn(path.join(src, '.venv', 'bin', 'python'), [SERVER, id, String(port)], { cwd: src, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', HF_DATASETS_OFFLINE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(token + '\n');
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`AutomationBench world for ${id} did not start: ${log.slice(-500)}`));
    }, 180_000);
    const onData = (c: Buffer) => {
      log += c.toString();
      if (log.includes(`ready ${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`AutomationBench world for ${id} exited (${code}): ${log.slice(-500)}`));
    });
  });
  return { baseUrl: `http://127.0.0.1:${port}`, token, close: () => child.kill() };
}

async function grade(env: Running, work: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${env.baseUrl}/grade`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: env.token }) });
    if (!res.ok) return { pass: false, score: 0, infra: true, details: `infra: grading failed (${res.status})` };
    const r = (await res.json()) as { score: number; pass: boolean; assertions: { type: string; passed: boolean; excluded: boolean }[]; calls: Record<string, number> };
    writeFileSync(path.join(path.dirname(work), 'evaluation.json'), JSON.stringify(r, null, 2));
    const scored = r.assertions.filter((a) => !a.excluded || !a.passed);
    const failed = scored.filter((a) => !a.passed);
    return { pass: r.pass, score: r.score, details: `${scored.length - failed.length}/${scored.length} assertions hold${failed.length ? `; failed: ${[...new Set(failed.map((a) => a.type))].slice(0, 4).join(', ')}` : ''}` };
  } catch (e) {
    return { pass: false, score: 0, infra: true, details: `infra: grading failed: ${String(e)}` };
  }
}

/** The benchmark's own system prompt and task, then how its two tools are reached from a shell. */
const PROMPT = (info: { system: string; prompt: string }) => `${info.system}

${info.prompt}

Your tools are the connected apps' APIs, reached with the \`ab\` command:

    ab search "send an email" [top_k]         find endpoints: URL, method and parameters (5 results unless you ask for more)
    ab fetch GET <url> [--params '<json>']    call an endpoint by its full URL
    ab fetch POST <url> --body - <<'EOF'      a JSON body from stdin
    {"subject": "Hi"}
    EOF

Use ab search first to discover the URL and parameters of an endpoint. Nothing else on this machine belongs to the task. When the work is finished, reply with a short summary.`;

export function autobenchTasks(ids: string[]): Task[] {
  const envs = new Map<string, Running>();
  return ids.map(
    (id): Task => ({
      id,
      title: `AutomationBench ${id}`,
      kind: 'repetitive',
      repetitions: 1,
      forgeKey: 'autobench',
      setup: ({ work }: TaskContext) => {
        // AB_NOTES: a CLAUDE.md for the work dir (always loaded by Claude Code). Without it, remove notes a reused
        // work dir may still hold, so a no-notes run cannot load them.
        if (process.env.AB_NOTES) cpSync(process.env.AB_NOTES, path.join(work, 'CLAUDE.md'), { dereference: true });
        else rmSync(path.join(work, 'CLAUDE.md'), { force: true });
        return { task_id: id };
      },
      serve: async ({ work }: TaskContext) => {
        const env = await start(id);
        envs.set(work, env);
        const info = (await (await fetch(`${env.baseUrl}/task`)).json()) as { system: string; prompt: string };
        return { baseUrl: env.baseUrl, close: () => env.close(), info };
      },
      env: () => ({ PATH: `${BIN}:${process.env.PATH ?? ''}` }),
      steps: [
        {
          prompt: (ctx: TaskContext) => PROMPT(ctx.info),
          check: ({ work }: TaskContext) => {
            const env = envs.get(work);
            if (!env) return { pass: false, score: 0, infra: true, details: 'infra: no environment' };
            return grade(env, work);
          },
        },
      ],
    }),
  );
}
