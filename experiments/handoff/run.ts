/**
 * Round 16: hand-off from a capable model to a cheap one, mid-task (after AgentBaton, arXiv 2026). SWE-bench Verified
 * Django instances, graded as in round 5 (experiments/swe). Arms, each in a fresh history-less checkout:
 *   haiku   Haiku alone.
 *   opus    Opus alone.
 *   baton   Opus works until a hand-off is ready (a reproduction or failing test, the code responsible located, the
 *           remaining change small and specific), writes HANDOFF.md and stops; a fresh Haiku session finishes from it.
 *           Opus may finish a fix itself when that is cheaper than writing the hand-off; the record says which.
 *
 *   SWE_HOME=... node experiments/handoff/run.ts --instances <file.json> --arms haiku,opus,baton --as-user agent --out results/runs/handoff
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DJANGO4, envVars, exportCommit, grade, loadInstances, type Instance } from '../swe/swe.ts';

const { values } = parseArgs({
  options: {
    instances: { type: 'string' },
    arms: { type: 'string', default: 'haiku,opus,baton' },
    cheap: { type: 'string', default: 'claude-haiku-5-5' },
    strong: { type: 'string', default: 'claude-opus-5-5' },
    'as-user': { type: 'string' },
    parallel: { type: 'string', default: '4' },
    out: { type: 'string', default: 'results/runs/handoff' },
  },
});
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.TEST_API_KEY;
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY or TEST_API_KEY');
const OUT = path.resolve(values.out!);
const env = DJANGO4;
const ids = values.instances ? (JSON.parse(readFileSync(values.instances, 'utf8')) as string[]) : undefined;
const instances = loadInstances().filter((i) => i.repo === env.repo && env.versions.includes(i.version) && (!ids || ids.includes(i.instance_id)));
if (!instances.length) throw new Error('no instances: run experiments/swe/setup.sh, and check --instances');

const ISSUE = (inst: Instance) => `You are working in a checkout of the ${inst.repo} repository (current directory). A Python environment with the project and its test dependencies is active (run tests with \`python tests/runtests.py <module>\`).

Resolve the following issue by changing the repository's source code. Do not modify the existing tests to make them pass; you may add tests. Hidden tests will check your fix.

<issue>
${inst.problem_statement.trim()}
</issue>`;

const LEAD = `## Your role: lead, then hand off

A cheaper model will finish this fix from your notes, so your time is the expensive part. Work until the hand-off is ready, then stop:
1. Reproduce the bug: a command (a new test or a short script) that fails now and will pass once the bug is fixed.
2. Find the code responsible and decide on the fix.
3. Write HANDOFF.md in the repository root: what is wrong and where (files, functions, lines), the exact change to make (a diff or precise instructions), the command that checks it, and anything to watch out for (other callers, edge cases, tests that must keep passing).
Do not make the fix yourself, unless finishing it is clearly shorter than describing it (a one- or two-line change you are certain of): then make it, run the check, and write HANDOFF.md saying it is done and verified.
When HANDOFF.md is written, reply HANDOFF (or DONE if you finished the fix yourself).`;

const FINISH = `## A colleague has prepared this fix

A colleague investigated the issue and left HANDOFF.md in the repository root: the diagnosis, the change to make and a command that checks it. Read it first and follow it, but check what you change (the colleague can be wrong). Run the check command and the tests of the module you changed. If HANDOFF.md says the fix is already done, verify it and stop. Delete HANDOFF.md at the end. When finished, reply DONE.`;

interface Phase {
  model: string;
  costUsd: number;
  turns: number;
  outputTokens: number;
  exit: number | null;
  final: string;
}

function cleanEnv(home: string, work: string): Record<string, string> {
  const keep = ['PATH', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];
  const e: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) e[k] = process.env[k]!;
  const v = envVars(env, work);
  return { ...e, ...v, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), TMPDIR: path.join(home, 'tmp'), ANTHROPIC_API_KEY: apiKey!, DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

/** One headless session in `work`; returns what the result event reports. */
async function session(dir: string, work: string, name: string, model: string, prompt: string): Promise<Phase> {
  const home = path.join(dir, `home-${name}`);
  for (const d of [path.join(home, '.claude'), path.join(home, 'tmp')]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(home, '.claude', '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  const user = values['as-user'];
  if (user) spawnSync('chown', ['-R', `${user}:`, dir]);
  const e = cleanEnv(home, work);
  const args = ['-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '4', '--strict-mcp-config', '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,TodoWrite', '--disallowedTools', 'WebFetch,WebSearch,Task,Agent'];
  const [cmd, cargs] = user ? ['runuser', ['-u', user, '--', 'env', '-i', ...Object.entries(e).map(([k, v]) => `${k}=${v}`), 'claude', ...args]] : ['claude', args];
  const { code, text } = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = spawn(cmd as string, cargs as string[], { cwd: work, env: user ? undefined : e, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let buf = '';
    child.stdout.on('data', (c: Buffer) => (buf += c));
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, 40 * 60_000);
    child.on('close', (c) => {
      clearTimeout(timer);
      resolve({ code: c, text: buf });
    });
  });
  writeFileSync(path.join(dir, `stream-${name}.jsonl`), text);
  const res = (text.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l)).at(-1) ?? {}) as { total_cost_usd?: number; num_turns?: number; usage?: { output_tokens?: number }; result?: string };
  return { model, costUsd: res.total_cost_usd ?? 0, turns: res.num_turns ?? 0, outputTokens: res.usage?.output_tokens ?? 0, exit: code, final: String(res.result ?? '').slice(-400) };
}

interface Record_ {
  instance: string;
  arm: string;
  pass: boolean;
  details: string;
  infra?: boolean;
  phases: Phase[];
  costUsd: number;
  /** baton only: did the lead hand off, or finish the fix itself? */
  handoff?: 'handed-off' | 'finished-by-lead' | 'no-handoff-file';
  handoffChars?: number;
}

async function runOne(inst: Instance, arm: string): Promise<Record_> {
  const dir = path.join(OUT, inst.instance_id, arm);
  const resFile = path.join(dir, 'result.json');
  if (existsSync(resFile)) return JSON.parse(readFileSync(resFile, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  const work = path.join(dir, 'work');
  mkdirSync(work, { recursive: true });
  exportCommit(env.gitDir, inst.base_commit, work);
  const phases: Phase[] = [];
  let handoff: Record_['handoff'];
  let handoffChars: number | undefined;
  if (arm === 'haiku' || arm === 'opus') {
    phases.push(await session(dir, work, arm, arm === 'haiku' ? values.cheap! : values.strong!, `${ISSUE(inst)}\n\nWhen finished, reply DONE.`));
  } else if (arm === 'baton') {
    const lead = await session(dir, work, 'lead', values.strong!, `${ISSUE(inst)}\n\n${LEAD}`);
    phases.push(lead);
    const file = path.join(work, 'HANDOFF.md');
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    handoffChars = text.length;
    writeFileSync(path.join(dir, 'HANDOFF.md'), text);
    // The lead replies DONE when it finished the fix itself, and its HANDOFF.md says so up front ("DONE, verified").
    const finished = /^\W*DONE\b/.test(lead.final.trim()) || /\b(done|fixed|applied)\b[^\n]{0,40}\bverified\b|\bverified\b[^\n]{0,40}\b(done|fixed|applied)\b|\(DONE\b|\bstatus:\s*done\b/i.test(text.slice(0, 300));
    if (!text) handoff = 'no-handoff-file';
    else if (finished) handoff = 'finished-by-lead';
    else handoff = 'handed-off';
    // The cheap model finishes unless the lead says it already did (then the work is graded as the lead left it).
    if (handoff !== 'finished-by-lead') phases.push(await session(dir, work, 'finish', values.cheap!, `${ISSUE(inst)}\n\n${FINISH}`));
    rmSync(file, { force: true });
  } else throw new Error(`unknown arm ${arm}`);
  const check = await grade(env, inst, work);
  const rec: Record_ = { instance: inst.instance_id, arm, pass: check.pass, details: check.details, infra: check.infra, phases, costUsd: phases.reduce((a, p) => a + p.costUsd, 0), handoff, handoffChars };
  writeFileSync(resFile, JSON.stringify(rec, null, 2));
  if (existsSync(path.join(dir, 'agent.patch'))) rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  return rec;
}

mkdirSync(OUT, { recursive: true });
const arms = values.arms!.split(',');
const jobs = instances.flatMap((i) => arms.map((a) => [i, a] as const));
console.log(`${jobs.length} runs: ${instances.length} instances × ${arms.join(', ')} -> ${OUT}`);
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < jobs.length) {
      const [inst, arm] = jobs[next++]!;
      try {
        const r = await runOne(inst, arm);
        console.log(`${r.pass ? 'PASS' : r.infra ? 'INFRA' : 'FAIL'} ${inst.instance_id} ${arm} $${r.costUsd.toFixed(3)}${r.handoff ? ` ${r.handoff}` : ''} (${r.details.slice(0, 90)})`);
      } catch (e) {
        console.log(`ERROR ${inst.instance_id} ${arm}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }),
);
console.log('done');
