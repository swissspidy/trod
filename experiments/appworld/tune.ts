/**
 * Round 15: validated notes tuning on AppWorld. The harness is one always-loaded CLAUDE.md (AW_NOTES); the model stays
 * fixed (Haiku). Each iteration:
 *   1. Practice: Haiku runs the train split (90 tasks) with the current notes.
 *   2. Propose: an Opus session reads the current notes and the experience digest of the failed train runs (the tests
 *      they failed and AppWorld's reference solutions, which AppWorld ships for the train split only) and rewrites the
 *      notes: general conventions of this world, never task-specific answers.
 *   3. Validate: Haiku runs the dev split (57 tasks) × --val-seeds with the parent notes and with the candidate. The
 *      candidate is kept only if it passes at least --margin more dev runs than the parent.
 * Test tasks are only used by the final test, outside this script. Resumable: state in <out>/state.json.
 *
 *   AW_HOME=/opt/appworld AW_SERVER_USER=awenv node experiments/appworld/tune.ts --start experiments/appworld/notes/CLAUDE.md \
 *     --iterations 3 --as-user agent --out results/runs/aw-tune
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    start: { type: 'string', default: 'experiments/appworld/notes/CLAUDE.md' },
    iterations: { type: 'string', default: '3' },
    'val-seeds': { type: 'string', default: '2' },
    margin: { type: 'string', default: '2' },
    model: { type: 'string', default: 'claude-haiku-5-5' },
    proposer: { type: 'string', default: 'claude-opus-5-5' },
    'as-user': { type: 'string' },
    parallel: { type: 'string', default: '6' },
    /** Reuse an earlier train run of the start notes as iteration 1's practice pass. */
    'train-dir': { type: 'string' },
    out: { type: 'string', default: 'results/runs/aw-tune' },
  },
});
function count(name: 'iterations' | 'val-seeds' | 'margin' | 'parallel'): number {
  const n = Number(values[name]);
  if (!Number.isInteger(n) || n < (name === 'margin' ? 0 : 1)) throw new Error(`--${name} must be a whole number${name === 'margin' ? '' : ' ≥ 1'}, got ${values[name]}`);
  return n;
}
const ITERATIONS = count('iterations');
const VAL_SEEDS = count('val-seeds');
const MARGIN = count('margin');
count('parallel');
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
if (!process.env.AW_HOME) throw new Error('Set AW_HOME (the AppWorld install, e.g. /opt/appworld)');
const OUT = path.resolve(values.out!);
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const NOTES_MAX = 6000;

interface State {
  iteration: number;
  /** The accepted notes after each iteration: <out>/notes-<i>.md. */
  notes: string;
  history: { iteration: number; train: { passed: number; runs: number }; parent: { passed: number; runs: number }; candidate?: { passed: number; runs: number }; accepted: boolean; proposerCost: number }[];
  costUsd: number;
}

mkdirSync(OUT, { recursive: true });
const statePath = path.join(OUT, 'state.json');
const log = (s: string) => {
  console.log(s);
  writeFileSync(path.join(OUT, 'tune.log'), `${new Date().toISOString()} ${s}\n`, { flag: 'a' });
};

/** Runs Haiku on an AppWorld split with the notes file; returns the results in that run dir. */
async function runSplit(notes: string, split: string, seeds: number, out: string): Promise<{ passed: number; runs: number; missing: number }> {
  // The runner skips runs that have a result.json and retries the rest: one extra pass covers runs lost to infrastructure.
  let t = { passed: 0, runs: 0, missing: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    await runnerPass(notes, split, seeds, out);
    t = tally(out, seeds, split);
    if (!t.missing) break;
  }
  return t;
}

async function runnerPass(notes: string, split: string, seeds: number, out: string): Promise<void> {
  const args = ['experiments/runner/run.ts', '--suite', `appworld:${split}`, '--arms', 'baseline', '--seeds', String(seeds), '--model', values.model!, '--parallel', values.parallel!, '--out', out];
  if (values['as-user']) args.push('--as-user', values['as-user']);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', args, { cwd: ROOT, env: { ...process.env, AW_NOTES: notes, ANTHROPIC_API_KEY: apiKey }, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    child.stdout.on('data', (c: Buffer) => writeFileSync(`${out}.log`, c, { flag: 'a' }));
    child.stderr.on('data', (c: Buffer) => (tail = (tail + c).slice(-2000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`runner exited ${code}: ${tail}`))));
  });
}

function tally(out: string, seeds: number, split: string): { passed: number; runs: number; missing: number } {
  const ids = readFileSync(path.join(process.env.AW_HOME!, 'data', 'datasets', `${split}.txt`), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  let passed = 0;
  let runs = 0;
  let missing = 0;
  for (const id of ids)
    for (let s = 1; s <= seeds; s++) {
      const f = path.join(out, id, `baseline-s${s}`, 'result.json');
      if (!existsSync(f)) {
        missing++;
        continue;
      }
      const r = JSON.parse(readFileSync(f, 'utf8')) as { check: { pass: boolean; infra?: boolean }; steps?: { check?: { infra?: boolean } }[] };
      // An evaluator that failed for infrastructure reasons is not a task failure: drop it so the next runner pass retries it.
      if (r.check.infra || r.steps?.some((st) => st.check?.infra)) {
        rmSync(f);
        missing++;
        continue;
      }
      runs++;
      if (r.check.pass) passed++;
    }
  return { passed, runs, missing };
}

const PROPOSER = `You improve the notes that a smaller model (Haiku) reads before every AppWorld task. AppWorld is a simulated world of apps (Amazon, Gmail, Spotify, Venmo, Splitwise, SimpleNote, Todoist, phone, file system) reached through Python APIs; tasks are graded by unit tests on the final database state.

Read ./NOTES.md (the current notes, always loaded into Haiku's context) and ./digest.md: the train tasks Haiku failed WITH these notes, the tests each failed, Haiku's final message, and AppWorld's reference solution; then reference solutions of tasks it passed.

Find why each failure happened and what general convention of this world the reference solution follows that Haiku missed (how an instruction is meant to be read, which app or record is the source of truth, what must or must not be changed, how to finish). Then write ./NOTES_NEW.md: the improved notes.
- Rules must be general conventions that will hold on unseen tasks: never task-specific names, amounts, dates or IDs, and never "for task X do Y".
- Keep every current rule unless the digest shows it is wrong; tighten wording rather than adding near-duplicates.
- Concise imperative bullets, grouped by topic. At most ${NOTES_MAX} characters in total.
- Only write what the reference solutions or the failed tests show.
When ./NOTES_NEW.md is written, reply DONE with one line per rule you added or changed.`;

/** One proposer session: returns the candidate notes (or undefined) and the cost. */
async function propose(iteration: number, notes: string, digest: string): Promise<{ notes?: string; costUsd: number }> {
  const dir = path.join(OUT, `propose-${iteration}`);
  const cached = path.join(dir, 'result.json');
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  const work = path.join(dir, 'work');
  const home = path.join(dir, 'home');
  // A fresh directory per attempt: an interrupted earlier attempt's NOTES_NEW.md must not become this attempt's proposal.
  rmSync(dir, { recursive: true, force: true });
  for (const d of [work, path.join(home, '.claude'), path.join(home, 'tmp')]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  writeFileSync(path.join(work, 'NOTES.md'), notes);
  writeFileSync(path.join(work, 'digest.md'), digest);
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  Object.assign(env, { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  const user = values['as-user'];
  if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
  const args = ['-p', PROPOSER, '--model', values.proposer!, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '5', '--strict-mcp-config', '--allowedTools', 'Read,Write,Edit,Glob,Grep', '--disallowedTools', 'Bash,WebFetch,WebSearch,Task,Agent'];
  const [cmd, cargs] = user ? ['runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), 'claude', ...args]] : ['claude', args];
  const { stream, code } = await new Promise<{ stream: string; code: number | null }>((resolve, reject) => {
    const child = spawn(cmd as string, cargs as string[], { cwd: work, env: user ? undefined : env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let text = '';
    child.stdout.on('data', (c: Buffer) => (text += c));
    child.stderr.on('data', (c: Buffer) => (text += c));
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
    child.on('close', (exit) => {
      clearTimeout(timer);
      resolve({ stream: text, code: exit });
    });
  });
  writeFileSync(path.join(dir, 'stream.jsonl'), stream);
  const res = stream.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1);
  // A session that failed is not a proposal of "no change": throw (nothing cached) so a restart retries it.
  if (code !== 0 || !res || res.is_error) throw new Error(`proposer session ${iteration} failed (exit ${code}${res?.subtype ? `, ${res.subtype}` : ''}); see ${path.join(dir, 'stream.jsonl')}`);
  const file = path.join(work, 'NOTES_NEW.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  const result = { notes: text && text.length <= NOTES_MAX * 1.1 ? `${text}\n` : undefined, costUsd: res.total_cost_usd ?? 0 };
  writeFileSync(cached, JSON.stringify(result, null, 2));
  return result;
}

function digestOf(trainDir: string): string {
  const r = spawnSync('node', ['experiments/appworld/digest.ts', trainDir], { cwd: ROOT, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`digest failed: ${r.stderr}`);
  return r.stdout;
}

let state: State;
if (existsSync(statePath)) state = JSON.parse(readFileSync(statePath, 'utf8'));
else {
  const first = path.join(OUT, 'notes-0.md');
  copyFileSync(path.resolve(values.start!), first);
  state = { iteration: 0, notes: first, history: [], costUsd: 0 };
}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
save();

for (let it = state.iteration + 1; it <= ITERATIONS; it++) {
  const reuse = it === 1 && !!values['train-dir'];
  const trainDir = reuse ? path.resolve(values['train-dir']!) : path.join(OUT, `train-${it}`);
  log(`iteration ${it}: practice on train with ${path.basename(state.notes)}${reuse ? ` (reusing ${trainDir})` : ''}`);
  const train = reuse ? tally(trainDir, 1, 'train') : await runSplit(state.notes, 'train', 1, trainDir);
  log(`  train: ${train.passed}/${train.runs} passed${train.missing ? `, ${train.missing} missing` : ''}`);
  // The digest must cover every train run: stop (state unchanged) rather than propose from part of the evidence.
  if (train.missing) throw new Error(`iteration ${it}: ${train.missing} train run(s) missing; restart to retry them${reuse ? ' (or drop --train-dir)' : ''}`);
  const notes = readFileSync(state.notes, 'utf8');
  const proposal = await propose(it, notes, digestOf(trainDir));
  state.costUsd += proposal.costUsd;
  log(`  proposed: ${proposal.notes ? `${proposal.notes.length} chars` : 'no notes'}, $${proposal.costUsd.toFixed(2)}`);
  const parent = await runSplit(state.notes, 'dev', VAL_SEEDS, path.join(OUT, `val-parent-${it}`));
  let candidate: { passed: number; runs: number; missing: number } | undefined;
  let accepted = false;
  const candFile = path.join(OUT, `candidate-${it}.md`);
  if (proposal.notes) {
    writeFileSync(candFile, proposal.notes);
    candidate = await runSplit(candFile, 'dev', VAL_SEEDS, path.join(OUT, `val-candidate-${it}`));
    // Like with like: runs missing on either side mean no decision yet. Stop before saving, so a restart retries them.
    if (parent.missing || candidate.missing) throw new Error(`iteration ${it}: dev comparison incomplete (parent ${parent.missing}, candidate ${candidate.missing} missing); restart to retry`);
    accepted = candidate.passed >= parent.passed + MARGIN;
    log(`  ${accepted ? 'ACCEPT' : 'reject'}: dev parent ${parent.passed}/${parent.runs} vs candidate ${candidate.passed}/${candidate.runs}`);
  }
  const next = path.join(OUT, `notes-${it}.md`);
  copyFileSync(accepted ? candFile : state.notes, next);
  state.history.push({ iteration: it, train, parent, candidate, accepted, proposerCost: proposal.costUsd });
  state = { ...state, iteration: it, notes: next };
  save();
}
log(`done: notes ${state.notes}; proposer cost $${state.costUsd.toFixed(2)}`);
