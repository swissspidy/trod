/**
 * Forges per-task-type notes for MiniWoB++ from train episodes: one headless session per task type gets a live
 * episode in train mode (seeds 1000+), where `mw reward` says whether an episode was solved and `mw reset` starts the
 * next one. It practises until it solves episodes reliably and writes NOTES.md: rules for this task type (what ends
 * the episode, what counts as success, the traps and the right actions). Copied to notes/<task>.md for MW_NOTES.
 *
 *   node experiments/miniwob/forge-notes.ts --tasks click-menu,form-sequence-2 [--model claude-opus-5-5] [--as-user agent]
 *
 * Only train seeds are used; test (0+) and dev (500+) seeds never enter the forge, and test sessions get no train mode.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SEEDS, startMw, taskTypes } from './miniwob.ts';

const { values } = parseArgs({ options: { model: { type: 'string', default: 'claude-opus-5-5' }, out: { type: 'string', default: 'results/runs/mw-forge' }, 'as-user': { type: 'string' }, parallel: { type: 'string', default: '4' }, tasks: { type: 'string' }, notes: { type: 'string' } } });
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
const out = path.resolve(values.out!);
const NOTES_DIR = path.resolve(values.notes ?? path.join(import.meta.dirname, 'notes'));
const BIN = path.join(import.meta.dirname, 'bin');

const PROMPT = (task: string, utterance: string) => `You are preparing notes for future sessions, not solving one task. Future sessions will each get ONE new episode of the web task type "${task}" (other words, numbers, layouts and targets than here), act through the \`mw\` command, and be scored on solving it. They see your notes before they start, cannot see their reward, and have one try: the episode usually ends at the first final action (a click on a final item, a submit), right or wrong.

Here you have a live episode in practice mode: \`mw help\` lists the actions, \`mw reward\` tells you whether the current episode is solved (reward > 0) and whether it ended, and \`mw reset\` starts a new episode. The current one asks: "${utterance}"

Play episodes until you solve them reliably (at least 3 solved in a row), and find out what a newcomer gets wrong: what ends an episode, what is needed for success that the task text does not say (e.g. a submit button, hovering to open a submenu, the timing of actions, exact formats), how the widgets behave with these actions, and which actions are fastest and most reliable.

Then write ./NOTES.md, at most 1500 characters: RULES, each saying what to do or not do ("X ends the episode; do Y first"), not bare facts or a diary. Include a short recipe that worked, with <placeholders> where the episode decides. Only write rules you saw hold. When NOTES.md is written, reply DONE.`;

function env(home: string, work: string): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const e: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) e[k] = process.env[k]!;
  e.NO_PROXY = e.no_proxy = [e.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
  return { ...e, PATH: `${BIN}:${e.PATH ?? ''}`, MW_WORK: work, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

async function forge(task: string): Promise<void> {
  const dir = path.join(out, task);
  const work = path.join(dir, 'work');
  const home = path.join(dir, 'home');
  const done = path.join(dir, 'result.json');
  if (existsSync(done)) return;
  mkdirSync(path.join(work, '.service'), { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  mkdirSync(path.join(home, 'tmp'), { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  rmSync(path.join(work, 'NOTES.md'), { force: true });
  const live = await startMw(task, SEEDS.train, { MW_TRAIN: '1', MW_MAX_ACTIONS: '400' });
  let stream = '';
  let exitCode: number | null = null;
  let practice = { episodes: 0, solved: 0 };
  const t0 = Date.now();
  try {
    const info = (await (await fetch(`${live.baseUrl}/task`)).json()) as { utterance: string };
    writeFileSync(path.join(work, '.service', 'base-url'), live.baseUrl + '\n');
    const user = values['as-user'];
    if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
    const args = ['-p', PROMPT(task, info.utterance), '--model', values.model!, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '4', '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent'];
    const e = env(home, work);
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
    // How practice went, from the server itself (not from what the session says).
    practice = (await (await fetch(`${live.baseUrl}/practice`, { headers: { 'x-score-token': live.token } })).json()) as typeof practice;
  } finally {
    live.close();
  }
  writeFileSync(path.join(dir, 'stream.jsonl'), stream);
  const res = stream.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) ?? {};
  const notes = path.join(work, 'NOTES.md');
  // Publish only notes from a session that finished cleanly and solved at least one practice episode; a failed
  // attempt is not cached, so a rerun retries it.
  const ok = exitCode === 0 && res.subtype === 'success' && !res.is_error && practice.solved > 0 && existsSync(notes);
  if (ok) copyFileSync(notes, path.join(NOTES_DIR, `${task}.md`));
  const result = { task, ok, exitCode, chars: ok ? statSync(notes).size : 0, practice, costUsd: res.total_cost_usd ?? 0, turns: res.num_turns ?? 0, wallMs: Date.now() - t0, model: values.model };
  if (ok) writeFileSync(done, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

mkdirSync(NOTES_DIR, { recursive: true });
const tasks = (values.tasks?.split(',') ?? taskTypes()).sort();
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      try {
        await forge(task);
      } catch (e) {
        console.error(`ERROR ${task}: ${(e as Error).message}`);
      }
    }
  }),
);
const results = tasks.filter((t) => existsSync(path.join(out, t, 'result.json'))).map((t) => JSON.parse(readFileSync(path.join(out, t, 'result.json'), 'utf8')) as { costUsd: number });
console.log(`forged ${results.length}/${tasks.length} notes, $${results.reduce((a, d) => a + d.costUsd, 0).toFixed(2)}`);
