/**
 * Round 13: validated harness tuning (`trod tune`, experiment first). The harness is a trod notes folder (.trod/notes.md
 * with an index, .trod/wiki/ pages); the model stays fixed (Haiku). Each iteration:
 *   1. Haiku runs every still-imperfect task type on fresh dev seeds with the current harness (the train pass).
 *   2. For each type that failed or got partial credit there, a proposer (Opus) practises live train episodes, seeded
 *      with the type's current page and digests of the failed and passed train sessions, and rewrites that type's page.
 *   3. Haiku runs the parent and the candidate on the same held-out dev seeds (validation). A type's new page is kept
 *      only if it solves more, or as many with clearly more reward (+0.05); otherwise the parent's page stays.
 * Test seeds (0+) are only used by the final test, outside this script. Resumable: state in <out>/state.json.
 *
 *   node experiments/miniwob/tune.ts --start results-12/learned --types a,b --iterations 3 --as-user agent --out results/runs/mw-tune
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { digestTranscript } from '../../packages/cli/src/learn.ts';
import { SEEDS, startMw } from './miniwob.ts';

const { values } = parseArgs({
  options: {
    start: { type: 'string', default: 'results-12/learned' },
    types: { type: 'string' },
    iterations: { type: 'string', default: '3' },
    'train-per-type': { type: 'string', default: '4' },
    'val-per-type': { type: 'string', default: '6' },
    model: { type: 'string', default: 'claude-haiku-5-5' },
    proposer: { type: 'string', default: 'claude-opus-5-5' },
    'as-user': { type: 'string' },
    parallel: { type: 'string', default: '5' },
    out: { type: 'string', default: 'results/runs/mw-tune' },
  },
});
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
const OUT = path.resolve(values.out!);
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BIN = path.join(import.meta.dirname, 'bin');
/** A positive whole number, or stop before any work (a bad --iterations would otherwise "finish" without tuning). */
function count(name: string): number {
  const n = Number(values[name as keyof typeof values]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive whole number, got ${values[name as keyof typeof values]}`);
  return n;
}
const ITERATIONS = count('iterations');
const TRAIN_PER = count('train-per-type');
const VAL_PER = count('val-per-type');
count('parallel');
const VAL_OFFSET = 60; // dev seeds 560+: validation, the same for parent and candidate in every iteration
const trainOffset = (iteration: number) => 12 + iteration * TRAIN_PER; // dev seeds 512+, fresh each iteration
// The proposer sees training episodes: they must never reach the validation seeds.
if (trainOffset(ITERATIONS) + TRAIN_PER > VAL_OFFSET) throw new Error(`--iterations ${ITERATIONS} × --train-per-type ${TRAIN_PER} would reach the validation seeds (dev ${VAL_OFFSET}+): use fewer`);

interface Run { type: string; seed: number; pass: boolean; score: number; stream?: string }
interface State {
  iteration: number;
  /** The accepted harness after each iteration: <out>/harness-<i>/ (a project dir with .trod/). */
  harness: string;
  history: { iteration: number; type: string; parent: { solved: number; reward: number }; candidate?: { solved: number; reward: number }; accepted: boolean; proposerCost: number }[];
  costUsd: number;
}

const statePath = path.join(OUT, 'state.json');
const log = (s: string) => {
  console.log(s);
  writeFileSync(path.join(OUT, 'tune.log'), `${new Date().toISOString()} ${s}\n`, { flag: 'a' });
};

/** A project folder holding a harness: copies a learned/ folder (notes.md, wiki/) into <dir>/.trod/. */
function makeHarness(dir: string, from: string): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, '.trod'), { recursive: true });
  const src = existsSync(path.join(from, '.trod')) ? path.join(from, '.trod') : from;
  cpSync(src, path.join(dir, '.trod'), { recursive: true });
  return dir;
}

/** Runs Haiku on `types` × `per` dev seeds from `offset` with the harness, through the experiment runner. */
async function runBatch(harness: string, types: string[], offset: number, per: number, out: string): Promise<Run[]> {
  if (!types.length) return [];
  const args = ['experiments/runner/run.ts', '--suite', 'miniwob:dev', '--arms', 'baseline', '--seeds', '1', '--model', values.model!, '--parallel', values.parallel!, '--out', out];
  if (values['as-user']) args.push('--as-user', values['as-user']);
  const env = { ...process.env, MW_LEARNED: harness, MW_TASKS: types.join(','), MW_PER_TASK: String(per), MW_SEED_OFFSET: String(offset), ANTHROPIC_API_KEY: apiKey };
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (c: Buffer) => writeFileSync(`${out}.log`, c, { flag: 'a' }));
    child.stderr.on('data', (c: Buffer) => (tail = (tail + c).slice(-2000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`runner exited ${code}: ${tail}`))));
  });
  const runs: Run[] = [];
  for (const t of types) {
    for (let i = 0; i < per; i++) {
      const seed = SEEDS.dev + offset + i;
      const dir = path.join(out, `${t}-s${seed}`, 'baseline-s1');
      const file = path.join(dir, 'result.json');
      if (!existsSync(file)) continue; // infra failure: result.infra.json
      const r = JSON.parse(readFileSync(file, 'utf8')) as { check: { pass: boolean; score: number }; costUsd?: number };
      runs.push({ type: t, seed, pass: r.check.pass, score: r.check.score, stream: path.join(dir, 'stream-1.jsonl') });
    }
  }
  return runs;
}

const summarize = (runs: Run[]) => ({ solved: runs.filter((r) => r.pass).length, reward: Number(runs.reduce((a, r) => a + r.score, 0).toFixed(3)) });
const perfect = (runs: Run[]) => runs.length > 0 && runs.every((r) => r.pass && r.score >= 0.999);

function digests(runs: Run[], max = 4): string {
  const pick = [...runs.filter((r) => !r.pass || r.score < 0.999).slice(0, max), ...runs.filter((r) => r.pass && r.score >= 0.999).slice(0, 1)];
  return pick
    .map((r) => {
      const d = r.stream && existsSync(r.stream) ? digestTranscript(r.stream, { outcome: r.pass ? 'pass' : 'fail', maxChars: 3500 }) : undefined;
      const label = !r.pass ? 'FAILED' : r.score < 0.999 ? `PASSED with partial credit ${r.score}` : 'FULL CREDIT';
      return `### Session (${label})\n\n${d?.text ?? '(no transcript)'}`;
    })
    .join('\n\n');
}

const PROPOSER = (type: string, utterance: string, page: string, notes: string, sessions: string) => `You are improving the harness that a smaller model (Haiku) uses for the MiniWoB++ web task type "${type}". Haiku gets ONE new episode per session (other words, numbers, layouts than here), acts through the \`mw\` command, sees the notes below before it starts, cannot see its reward, and has one try. Reward is 1.0 for a correct, fast solution; less for slow ones (the reward decays with time) and 0 or below for wrong ones. The goal is full reward on every episode.

The general notes it gets (CLAUDE.md):
<notes>
${notes}
</notes>

The page it currently gets for this task type (.trod/wiki/${type}.md, may be empty):
<page>
${page || '(none yet)'}
</page>

How Haiku did with them on recent episodes (digests; it failed or got partial credit on some):
<sessions>
${sessions}
</sessions>

Here you have a live episode of "${type}" in practice mode: \`mw help\` lists the actions, \`mw reward\` tells you the current episode's reward and whether it ended, \`mw reset\` starts a new one. The current one asks: "${utterance}"

1. Find out why Haiku lost reward: what it did wrong or too slowly, compared with what works.
2. Practise until you get full reward reliably (at least 4 in a row at reward ≥ 0.95), with the fewest and fastest actions. Prefer recipes a weaker model can follow exactly.
3. Write ./PAGE.md, at most 1800 characters: the rules and an exact recipe for this task type, with <placeholders> where the episode decides; say what NOT to do where Haiku went wrong; no facts about a particular episode (words, numbers, positions you saw here). Start it with a one-line title, then a line \`Tasks like: "<the task text with <placeholders> for what varies>"\`: future sessions see only the task text, never the type name, and find this page by that line. Only write what you saw work.
When PAGE.md is written, reply DONE.`;

function sandboxEnv(home: string, work: string): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const e: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) e[k] = process.env[k]!;
  e.NO_PROXY = e.no_proxy = [e.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
  return { ...e, PATH: `${BIN}:${e.PATH ?? ''}`, MW_WORK: work, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

/** One practice session for a type: returns the new page text (or undefined) and its cost. */
async function propose(type: string, iteration: number, page: string, notes: string, sessions: string): Promise<{ page?: string; costUsd: number; practice: { episodes: number; solved: number } }> {
  const dir = path.join(OUT, `propose-${iteration}`, type);
  const work = path.join(dir, 'work');
  const home = path.join(dir, 'home');
  const cached = path.join(dir, 'result.json');
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  for (const d of [path.join(work, '.service'), path.join(home, '.claude'), path.join(home, 'tmp')]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  // Train seeds only, a different range per iteration.
  const live = await startMw(type, SEEDS.train + 100 * iteration, { MW_TRAIN: '1', MW_MAX_ACTIONS: '500' });
  let stream = '';
  let practice = { episodes: 0, solved: 0 };
  try {
    const info = (await (await fetch(`${live.baseUrl}/task`)).json()) as { utterance: string };
    writeFileSync(path.join(work, '.service', 'base-url'), live.baseUrl + '\n');
    const user = values['as-user'];
    if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
    const args = ['-p', PROPOSER(type, info.utterance, page, notes, sessions), '--model', values.proposer!, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '5', '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent'];
    const e = sandboxEnv(home, work);
    const [cmd, cargs] = user ? ['runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(e).map(([k, v]) => `${k}=${v}`), 'claude', ...args]] : ['claude', args];
    stream = await new Promise<string>((resolve, reject) => {
      // Its own process group, so a timeout ends the whole tree (runuser, claude and whatever it started).
      const child = spawn(cmd as string, cargs as string[], { cwd: work, env: user ? undefined : e, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let text = '';
      child.stdout.on('data', (c: Buffer) => (text += c));
      child.stderr.on('data', (c: Buffer) => (text += c));
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, 2400_000);
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(text);
      });
    });
    practice = (await (await fetch(`${live.baseUrl}/practice`, { headers: { 'x-score-token': live.token } })).json()) as typeof practice;
  } finally {
    live.close();
  }
  writeFileSync(path.join(dir, 'stream.jsonl'), stream);
  const res = stream.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) ?? {};
  const file = path.join(work, 'PAGE.md');
  const result = { page: existsSync(file) && practice.solved > 0 ? readFileSync(file, 'utf8') : undefined, costUsd: res.total_cost_usd ?? 0, practice };
  writeFileSync(cached, JSON.stringify(result, null, 2));
  return result;
}

const INDEX_HEADER = '## Task-specific pages (tuned)';
/** A harness with `pages` (type -> text) written as .trod/wiki/<type>.md and listed in the notes index. */
function withPages(base: string, dir: string, pages: Record<string, string>): string {
  makeHarness(dir, base);
  const notesFile = path.join(dir, '.trod', 'notes.md');
  let notes = readFileSync(notesFile, 'utf8');
  mkdirSync(path.join(dir, '.trod', 'wiki'), { recursive: true });
  for (const [type, text] of Object.entries(pages)) {
    writeFileSync(path.join(dir, '.trod', 'wiki', `${type}.md`), text.trim() + '\n');
    const like = text.match(/^Tasks like:\s*(.+)$/m)?.[1]?.trim() ?? `"${text.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 120)}"`;
    const line = `- Tasks like ${like}: read \`.trod/wiki/${type}.md\` first; it overrides the general pages.`;
    if (!notes.includes(INDEX_HEADER)) notes = `${notes.trimEnd()}\n\n${INDEX_HEADER}\n\nBefore acting, check this list too: if your task matches a line, read that page and follow it.\n`;
    // A rewritten page may match different task text: its index line is replaced, not kept.
    const lines = notes.split('\n');
    const at = lines.findIndex((l) => l.startsWith('- Tasks like ') && l.includes(`\`.trod/wiki/${type}.md\``));
    if (at >= 0) {
      lines[at] = line;
      notes = lines.join('\n');
    } else notes = `${notes.trimEnd()}\n${line}\n`;
  }
  writeFileSync(notesFile, notes);
  return dir;
}

function pageOf(harness: string, type: string): string {
  const f = path.join(harness, '.trod', 'wiki', `${type}.md`);
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
}

mkdirSync(OUT, { recursive: true });
const types = values.types?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
if (!types.length) throw new Error('--types is required (the task types to tune)');
let state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { iteration: 0, harness: makeHarness(path.join(OUT, 'harness-0'), path.resolve(values.start!)), history: [], costUsd: 0 };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
save();

for (let it = state.iteration + 1; it <= ITERATIONS; it++) {
  log(`iteration ${it}: train pass on ${types.length} type(s), dev seeds ${SEEDS.dev + trainOffset(it)}+`);
  const train = await runBatch(state.harness, types, trainOffset(it), TRAIN_PER, path.join(OUT, `train-${it}`));
  const imperfect = types.filter((t) => !perfect(train.filter((r) => r.type === t)));
  log(`  train: ${summarize(train).solved}/${train.length} solved; imperfect: ${imperfect.join(', ') || 'none'}`);
  if (!imperfect.length) {
    state = { ...state, iteration: it };
    save();
    break;
  }
  const notes = readFileSync(path.join(state.harness, '.trod', 'notes.md'), 'utf8');
  // Proposals, a few at a time (each is a live practice session).
  const proposals: Record<string, { page?: string; costUsd: number }> = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < imperfect.length) {
        const t = imperfect[next++]!;
        try {
          proposals[t] = await propose(t, it, pageOf(state.harness, t), notes, digests(train.filter((r) => r.type === t)));
          log(`  proposed ${t}: ${proposals[t].page ? `${proposals[t].page!.length} chars` : 'no page'}, $${proposals[t].costUsd.toFixed(2)}`);
        } catch (e) {
          log(`  proposer ${t} failed: ${(e as Error).message}`);
        }
      }
    }),
  );
  const changed = Object.entries(proposals).filter(([, p]) => p.page).map(([t]) => t);
  const candidate = withPages(state.harness, path.join(OUT, `candidate-${it}`), Object.fromEntries(changed.map((t) => [t, proposals[t].page!])));
  log(`  validation: parent vs candidate on ${changed.length} type(s) × ${VAL_PER} seeds`);
  const parentVal = await runBatch(state.harness, changed, VAL_OFFSET, VAL_PER, path.join(OUT, `val-parent-${it}`));
  const candVal = await runBatch(candidate, changed, VAL_OFFSET, VAL_PER, path.join(OUT, `val-candidate-${it}`));
  const accepted: Record<string, string> = {};
  for (const t of imperfect) {
    const pRuns = parentVal.filter((r) => r.type === t);
    const cRuns = candVal.filter((r) => r.type === t);
    const p = summarize(pRuns);
    const c = changed.includes(t) ? summarize(cRuns) : undefined;
    // Compare like with like: an episode lost to an infrastructure failure on either side means no decision (kept as is).
    const complete = pRuns.length === VAL_PER && cRuns.length === VAL_PER;
    if (c && !complete) log(`  ${t}: validation incomplete (parent ${pRuns.length}/${VAL_PER}, candidate ${cRuns.length}/${VAL_PER} episodes), not accepted`);
    const ok = !!c && complete && (c.solved > p.solved || (c.solved === p.solved && c.reward > p.reward + 0.05));
    if (ok) accepted[t] = proposals[t].page!;
    state.history.push({ iteration: it, type: t, parent: p, candidate: c, accepted: ok, proposerCost: proposals[t]?.costUsd ?? 0 });
    state.costUsd += proposals[t]?.costUsd ?? 0;
    log(`  ${ok ? 'ACCEPT' : 'reject'} ${t}: parent ${p.solved}/${VAL_PER} (${p.reward}) vs candidate ${c ? `${c.solved}/${VAL_PER} (${c.reward})` : '-'}`);
  }
  state = { ...state, iteration: it, harness: withPages(state.harness, path.join(OUT, `harness-${it}`), accepted) };
  save();
}
log(`done: harness ${state.harness}; proposer cost $${state.costUsd.toFixed(2)} (Haiku runs are in the runner logs)`);
