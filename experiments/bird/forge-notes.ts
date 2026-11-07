/**
 * Forges per-database notes for BIRD from the train split: one headless session per database reads the database, its
 * column docs and the train questions with their evidence and gold SQL, and writes NOTES.md, a short guide to the
 * database's conventions for future (different) questions. The notes are copied to experiments/bird/notes/<db>.md.
 *
 *   node experiments/bird/forge-notes.ts [--model claude-opus-5-5] [--out results/runs/bird-forge] [--as-user agent]
 *
 * Only train-split questions are shown; test questions never enter the forge.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BIRD_HOME, birdSplit } from './bird.ts';

const { values } = parseArgs({ options: { model: { type: 'string', default: 'claude-opus-5-5' }, out: { type: 'string', default: 'results/runs/bird-forge' }, 'as-user': { type: 'string' }, parallel: { type: 'string', default: '4' } } });
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
const out = path.resolve(values.out!);
const NOTES_DIR = path.join(import.meta.dirname, 'notes');
const BIN = path.join(import.meta.dirname, 'bin');

const PROMPT = (db: string, n: number) => `You are preparing notes for future sessions, not answering questions. Future sessions will each get ONE new question about the "${db}" database (different from the ones here), the database itself (./db.sqlite, read-only), its column docs (./docs/*.csv) and your notes, and must write a single SQLite query whose result rows exactly match a hidden reference query's rows. They will NOT get the hint ("evidence") that the questions here come with.

./train.json has ${n} past questions for this database with their evidence (the hint a domain expert wrote) and the reference SQL. Study them together with the schema and data (use the \`sql\` command, e.g. sql "SELECT ..." , or python3's sqlite3). Work out the conventions a newcomer gets wrong: what columns and coded values mean (e.g. which value of a flag means what), how derived quantities are defined (rates, ages, percentages, durations), which tables to join and how, date and text formats, how the reference queries shape their output (which columns, DISTINCT or not, how percentages and divisions are computed, CAST to REAL, LIMIT 1 vs ties), and traps (NULLs, duplicates, case, trailing spaces).

Write ./NOTES.md: at most 4000 characters, dense and concrete (exact table/column names, value codes, formula patterns, short SQL snippets). State general conventions that will help with new questions; do not list answers to these questions. Check each claim against the data. When NOTES.md is written, reply DONE.`;

function env(home: string): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const e: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) e[k] = process.env[k]!;
  return { ...e, PATH: `${BIN}:${e.PATH ?? ''}`, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

async function forge(db: string, questions: { question: string; evidence: string; SQL: string }[]): Promise<void> {
  const dir = path.join(out, db);
  const work = path.join(dir, 'work');
  const home = path.join(dir, 'home');
  if (existsSync(path.join(dir, 'result.json'))) return;
  mkdirSync(work, { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  mkdirSync(path.join(home, 'tmp'), { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  for (const [link, target] of [['db.sqlite', path.join(BIRD_HOME, 'db', db, `${db}.sqlite`)], ['docs', path.join(BIRD_HOME, 'db', db, 'database_description')]] as const) {
    if (!existsSync(path.join(work, link))) symlinkSync(target, path.join(work, link));
  }
  writeFileSync(path.join(work, 'train.json'), JSON.stringify(questions, null, 1));
  const user = values['as-user'];
  if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
  const args = ['-p', PROMPT(db, questions.length), '--model', values.model!, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '5', '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent'];
  const e = env(home);
  const [cmd, cargs] = user ? ['runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(e).map(([k, v]) => `${k}=${v}`), 'claude', ...args]] : ['claude', args];
  const t0 = Date.now();
  const stream = await new Promise<string>((resolve) => {
    const child = spawn(cmd as string, cargs as string[], { cwd: work, env: user ? undefined : e, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (c: Buffer) => (text += c));
    child.stderr.on('data', (c: Buffer) => (text += c));
    const timer = setTimeout(() => child.kill('SIGKILL'), 1800_000);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(text);
    });
  });
  writeFileSync(path.join(dir, 'stream.jsonl'), stream);
  const res = stream.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) ?? {};
  const notes = path.join(work, 'NOTES.md');
  const ok = existsSync(notes);
  if (ok) copyFileSync(notes, path.join(NOTES_DIR, `${db}.md`));
  const info = { db, ok, chars: ok ? statSync(notes).size : 0, costUsd: res.total_cost_usd ?? 0, turns: res.num_turns ?? 0, wallMs: Date.now() - t0, trainQuestions: questions.length, model: values.model };
  writeFileSync(path.join(dir, 'result.json'), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
}

mkdirSync(NOTES_DIR, { recursive: true });
const byDb = new Map<string, { question: string; evidence: string; SQL: string }[]>();
for (const q of birdSplit().train) byDb.set(q.db_id, [...(byDb.get(q.db_id) ?? []), { question: q.question, evidence: q.evidence, SQL: q.SQL }]);
const dbs = [...byDb.keys()].sort();
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < dbs.length) {
      const db = dbs[next++]!;
      await forge(db, byDb.get(db)!);
    }
  }),
);
const total = dbs.map((db) => JSON.parse(readFileSync(path.join(out, db, 'result.json'), 'utf8')) as { costUsd: number; ok: boolean });
console.log(`forged ${total.filter((t) => t.ok).length}/${dbs.length} notes, $${total.reduce((a, t) => a + t.costUsd, 0).toFixed(2)}`);
