/**
 * Forges per-task-type notes for ScienceWorld from train variations: one headless session per task type gets the gold
 * trajectories of two train variations (gold.json) and a live third train variation to try things in (via `sw`), and
 * writes NOTES.md: how this kind of task is done and which commands and objects work. Copied to notes/<task>.md.
 *
 *   node experiments/sciworld/forge-notes.ts [--model claude-opus-5-5] [--out results/runs/sw-forge] [--as-user agent]
 *
 * Only train variations are used; test variations never enter the forge.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startSw, SW_HOME, variations } from './sciworld.ts';

const { values } = parseArgs({ options: { model: { type: 'string', default: 'claude-opus-5-5' }, out: { type: 'string', default: 'results/runs/sw-forge' }, 'as-user': { type: 'string' }, parallel: { type: 'string', default: '4' }, tasks: { type: 'string' } } });
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
const out = path.resolve(values.out!);
const NOTES_DIR = path.join(import.meta.dirname, 'notes');
const BIN = path.join(import.meta.dirname, 'bin');

const PROMPT = (task: string) => `You are preparing notes for future sessions, not solving a task. Future sessions will each get ONE new variation of the ScienceWorld task type "${task}" (different substances, objects, rooms or targets than here), act through the \`sw\` command with a limited number of actions, and be scored on completing it. They will see your notes before they start.

./gold.json holds expert trajectories (actions and observations) for two train variations of this task type. A third train variation is live: try commands with \`sw\` (one action per line; \`sw --task\` shows the task and the action templates). Work out what a newcomer gets wrong: the exact command phrasings that work (e.g. how to refer to a substance in a container, how to "focus on" the right object, how to use devices, how to wait for processes), where things usually are, the general procedure for this task type, what can fail the task, and how to do it in few actions.

Write ./NOTES.md: at most 3000 characters, concrete and general (it must work for other variations: use placeholders like <substance> where the variation decides). Check commands against the live variation. When NOTES.md is written, reply DONE.`;

function env(home: string): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const e: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) e[k] = process.env[k]!;
  e.NO_PROXY = e.no_proxy = [e.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
  return { ...e, PATH: `${BIN}:${e.PATH ?? ''}`, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

async function forge(task: string, train: number[]): Promise<void> {
  const dir = path.join(out, task);
  const work = path.join(dir, 'work');
  const home = path.join(dir, 'home');
  const done = path.join(dir, 'result.json');
  // Skip only task types that already succeeded (an older version also saved failed attempts).
  if (existsSync(done) && (JSON.parse(readFileSync(done, 'utf8')) as { ok?: boolean }).ok) return;
  mkdirSync(path.join(work, '.service'), { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  mkdirSync(path.join(home, 'tmp'), { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  const gold = spawnSync(path.join(SW_HOME, 'venv', 'bin', 'python'), [path.join(import.meta.dirname, 'gold.py'), task, String(train[0]), String(train[1])], { encoding: 'utf8', maxBuffer: 1 << 26 });
  writeFileSync(path.join(work, 'gold.json'), JSON.stringify(JSON.parse(gold.stdout.trim().split('\n').at(-1) ?? '[]'), null, 1));
  rmSync(path.join(work, 'NOTES.md'), { force: true });
  const live = await startSw(task, train[2]!);
  let stream = '';
  let exitCode: number | null = null;
  const t0 = Date.now();
  try {
    writeFileSync(path.join(work, '.service', 'base-url'), live.baseUrl + '\n');
    const user = values['as-user'];
    if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
    const args = ['-p', PROMPT(task), '--model', values.model!, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '5', '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent'];
    const e = env(home);
    const [cmd, cargs] = user ? ['runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(e).map(([k, v]) => `${k}=${v}`), 'claude', ...args]] : ['claude', args];
    [stream, exitCode] = await new Promise<[string, number | null]>((resolve, reject) => {
      const child = spawn(cmd as string, cargs as string[], { cwd: work, env: user ? undefined : e, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let text = '';
      child.stdout.on('data', (c: Buffer) => (text += c));
      child.stderr.on('data', (c: Buffer) => (text += c));
      // The whole process group: with --as-user, killing runuser alone leaves the session running.
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, 1800_000);
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve([text, code]);
      });
    });
  } finally {
    live.close();
  }
  writeFileSync(path.join(dir, 'stream.jsonl'), stream);
  const res = stream.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) ?? {};
  const notes = path.join(work, 'NOTES.md');
  // Publish only notes from a session that finished cleanly; a failed attempt is not cached, so a rerun retries it.
  const ok = exitCode === 0 && res.subtype === 'success' && !res.is_error && existsSync(notes);
  if (ok) copyFileSync(notes, path.join(NOTES_DIR, `${task}.md`));
  const info = { task, ok, exitCode, chars: ok ? statSync(notes).size : 0, costUsd: res.total_cost_usd ?? 0, turns: res.num_turns ?? 0, wallMs: Date.now() - t0, goldVariations: train.slice(0, 2), liveVariation: train[2], model: values.model };
  if (ok) writeFileSync(path.join(dir, 'result.json'), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
}

mkdirSync(NOTES_DIR, { recursive: true });
const v = variations();
const tasks = (values.tasks?.split(',') ?? Object.keys(v)).sort();
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try {
        await forge(task, v[task]!.train);
      } catch (e) {
        console.error(`ERROR ${task}: ${(e as Error).message}`);
      }
    }
  }),
);
const done = tasks.filter((t) => existsSync(path.join(out, t, 'result.json'))).map((t) => JSON.parse(readFileSync(path.join(out, t, 'result.json'), 'utf8')) as { ok: boolean; costUsd: number });
console.log(`forged ${done.filter((d) => d.ok).length}/${tasks.length} notes, $${done.reduce((a, d) => a + d.costUsd, 0).toFixed(2)}`);
