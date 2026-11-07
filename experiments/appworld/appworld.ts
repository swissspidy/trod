/**
 * AppWorld (https://appworld.dev) tasks for the experiment runner.
 *
 * Each task runs in its own AppWorld environment process (aw_server.py) started by the runner. The agent reaches it
 * only through the `aw` command (Python code into the task's REPL with the `apis` object), the same interface
 * AppWorld's own agents get. Grading runs AppWorld's database-state unit tests afterwards, in a separate process
 * (aw_eval.py). Isolation is by OS user: the agent's sessions run as one user (runner --as-user) that cannot read
 * AW_HOME at all, and the environment as another (AW_SERVER_USER) that cannot read the ground truth.
 *
 * AW_HOME (default experiments/appworld/.cache) holds venv/ (appworld installed) and data/ (appworld download data).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

export const AW_HOME = path.resolve(process.env.AW_HOME ?? path.join(import.meta.dirname, '.cache'));
const SERVER = path.join(import.meta.dirname, 'aw_server.py');
const BIN = path.join(import.meta.dirname, 'bin');
const EVAL = path.join(import.meta.dirname, 'aw_eval.py');

export function datasetIds(name: string): string[] {
  const f = path.join(AW_HOME, 'data', 'datasets', `${name}.txt`);
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
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
  taskId: string;
  experiment: string;
  close(): void;
}

const PYTHON = () => path.join(AW_HOME, 'venv', 'bin', 'python');

/**
 * Starts the AppWorld environment for one task; resolves once it serves requests. With AW_SERVER_USER (e.g. awenv)
 * it runs as that user, who must be able to read AW_HOME but not data/tasks/<id>/ground_truth (see aw_server.py).
 */
export async function startEnvironment(taskId: string, experiment: string): Promise<Running> {
  const port = await freePort();
  const env = { PATH: process.env.PATH ?? '', HOME: AW_HOME, APPWORLD_ROOT: AW_HOME };
  const args = [SERVER, taskId, String(port), experiment];
  const user = process.env.AW_SERVER_USER;
  const child = user
    ? spawn('runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), PYTHON(), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(PYTHON(), args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`AppWorld environment for ${taskId} did not start: ${log.slice(-500)}`)), 120_000);
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
      reject(new Error(`AppWorld environment for ${taskId} exited (${code}): ${log.slice(-500)}`));
    });
  });
  return { baseUrl: `http://127.0.0.1:${port}`, taskId, experiment, close: () => child.kill() };
}

async function taskInfo(baseUrl: string): Promise<{ instruction: string; supervisor: Record<string, string>; datetime: string }> {
  return (await fetch(`${baseUrl}/task`)).json() as Promise<{ instruction: string; supervisor: Record<string, string>; datetime: string }>;
}

/** Grades the task from the databases its environment saved, in a separate process (aw_eval.py) as the runner's user. */
export async function evaluate(env: Running, workDir?: string): Promise<CheckResult> {
  const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = spawn(PYTHON(), [EVAL, env.taskId, env.experiment], { env: { PATH: process.env.PATH ?? '', HOME: AW_HOME, APPWORLD_ROOT: AW_HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (c: Buffer) => (text += c));
    child.stderr.on('data', (c: Buffer) => (text += c));
    child.on('close', (code) => resolve({ code, text }));
  });
  const line = out.text.split('\n').reverse().find((l) => l.startsWith('{'));
  if (out.code !== 0 || !line) return { pass: false, score: 0, infra: true, details: `infra: evaluation failed (${out.code}): ${out.text.slice(-300)}` };
  const r = JSON.parse(line) as { success: boolean; difficulty?: number; num_tests: number; passes: unknown[]; failures: { label?: string; requirement?: string; trace?: string }[] };
  const passed = r.passes?.length ?? 0;
  if (workDir) writeFileSync(path.join(path.dirname(workDir), 'evaluation.json'), JSON.stringify(r, null, 2));
  return {
    pass: !!r.success,
    score: r.num_tests ? passed / r.num_tests : 0,
    details: `${passed}/${r.num_tests} tests passed${r.failures?.length ? `; failed: ${r.failures.slice(0, 2).map((f) => (f.requirement ?? f.label ?? '').slice(0, 120)).join(' | ')}` : ''}`,
  };
}

const PROMPT = (info: { instruction: string; supervisor: Record<string, string>; datetime: string }) => {
  const s = info.supervisor;
  return `I am ${s.first_name} ${s.last_name}. My email is ${s.email} and my phone number is ${s.phone_number}. The current date and time is ${info.datetime}.

Task: ${info.instruction}

You are working in AppWorld, a simulated world of apps (amazon, gmail, spotify, venmo, splitwise, simple_note, todoist, phone, file_system), plus a supervisor app (my profile, my account passwords, task completion) and api_docs. You act on my behalf through their APIs, by running Python with the \`aw\` command:

    aw <<'EOF'
    print(apis.api_docs.show_app_descriptions())
    EOF

The code runs in a persistent Python REPL with an \`apis\` object (apis.<app>.<api>(...)); variables persist between calls. Look up APIs with apis.api_docs.show_api_descriptions(app_name=...) and apis.api_docs.show_api_doc(app_name=..., api_name=...). My account passwords are in apis.supervisor.show_account_passwords(). Do exactly what the task asks, without side effects beyond it. Nobody can answer questions while you work: never stop to ask or to wait for confirmation; make reasonable decisions (as the task's author would want) and finish the task yourself.

When you are done, call apis.supervisor.complete_task(answer=...) through aw, with the answer if the task asks a question (just the value, e.g. a name or a number), or apis.supervisor.complete_task() otherwise. Then reply DONE.`;
};

const BRIEF = `The environment is AppWorld: a simulated world of apps (amazon, gmail, spotify, venmo, splitwise, simple_note, todoist, phone, file_system) with a supervisor app (the user's profile, account passwords, task completion) and api_docs. Everything happens through Python code run in a persistent REPL with an \`apis\` object, via the \`aw\` command (code on stdin; e.g. aw <<'EOF' ... EOF). The REPL's HTTP endpoint is POST <base-url>/execute with JSON {"code": "..."} -> {"output": "..."}; the base URL is in the file .service/base-url (it changes between sessions), and a trod tool can call it with fetch().

Future sessions each start fresh with one task for some user, such as:
- "What is the title of the most-liked song in my Spotify playlists?"
- "Request money on Venmo from my roommates for the electricity bill, split equally"
- "Mark all my overdue Todoist tasks as completed"
- "Send an email to my manager with the list of Amazon orders I placed last month"
They are often run by a smaller, cheaper model. Each needs to log in to apps with the user's credentials, walk paginated APIs, look up people across apps (phone contacts, relationships), and read or change data correctly.

Build trod tools (they run in Node; send Python to the REPL through /execute and parse what comes back) that make such tasks fast and reliable for a model that has never seen AppWorld. Typical capabilities: logging in to any app with the supervisor's credentials and keeping the token in the REPL; fetching ALL pages of any paginated API; finding people (contacts, roommates, family, coworkers) and their emails, phone numbers and app accounts; and searching an app's API docs compactly. Learn the APIs, parameter names, pagination limits and auth patterns by exploring this task's environment. Do NOT call apis.supervisor.complete_task: this session is only for building tools. Tools must work for any user and task: never hardcode this user's names, emails or passwords.`;

export function appWorldTasks(ids: string[], experiment: string, forgeTaskId: string): Task[] {
  const envs = new Map<string, Running>();
  return ids.map(
    (id): Task => ({
      id,
      title: `AppWorld ${id}`,
      kind: 'repetitive',
      repetitions: 1,
      forgeKey: 'appworld',
      setup: () => ({ task_id: id }),
      forgeSetup: () => {},
      serve: async ({ work }: TaskContext, forForge?: boolean) => {
        const env = await startEnvironment(forForge ? forgeTaskId : id, `${experiment}-${forForge ? 'forge' : path.basename(path.dirname(work))}`.replace(/[^a-zA-Z0-9_-]/g, '_'));
        envs.set(work, env);
        const info = await taskInfo(env.baseUrl);
        return { baseUrl: env.baseUrl, close: () => env.close(), info };
      },
      env: () => ({ PATH: `${BIN}:${process.env.PATH ?? ''}` }),
      toolsmithBrief: () => BRIEF,
      steps: [
        {
          prompt: (ctx: TaskContext) => PROMPT(ctx.info),
          check: ({ work }: TaskContext) => {
            const env = envs.get(work);
            if (!env) return { pass: false, score: 0, infra: true, details: 'infra: no environment' };
            return evaluate(env, work);
          },
        },
      ],
    }),
  );
}
