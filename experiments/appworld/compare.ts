/**
 * Compares arms on the full AppWorld test sets (round 17).
 *
 *   node experiments/appworld/compare.ts <out dir> <arm>=<runs dir prefix> ...
 *
 * `<runs dir prefix>` is completed with `-test_normal` and `-test_challenge` (the runner's --out of each split). Writes
 * runs.jsonl (one compact record per run; no task text, since AppWorld data may only be redistributed encrypted) and
 * summary.json, and prints a table: task goal completion (TGC), scenario goal completion (SGC: every variant of a
 * scenario passed), a 95% Wilson interval, cost per task, and for every arm against the first one the paired
 * outcome per task with an exact McNemar test. "unseen" leaves out the 40 scenarios (120 tasks) that earlier rounds
 * used as their test sample and selected notes on.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [out, ...specs] = process.argv.slice(2);
if (!out || !specs.length) {
  console.error('usage: node experiments/appworld/compare.ts <out dir> <arm>=<runs dir prefix> ...');
  process.exit(1);
}
const SPLITS = ['test_normal', 'test_challenge'] as const;
const sampled = new Set(
  ['normal', 'challenge'].flatMap((s) => (JSON.parse(readFileSync(path.join(import.meta.dirname, `sample-test-${s}.json`), 'utf8')) as string[]).map((id) => id.split('_')[0]!)),
);

interface Run {
  arm: string;
  split: string;
  task: string;
  scenario: string;
  pass: boolean;
  score: number;
  costUsd: number;
  turns: number;
  tokens: number;
  wallS: number;
  model: string;
}

const runs: Run[] = [];
const infra: Record<string, number> = {};
for (const spec of specs) {
  const i = spec.indexOf('=');
  const [arm, prefix] = [spec.slice(0, i), spec.slice(i + 1)];
  for (const split of SPLITS) {
    const dir = `${prefix}-${split}`;
    if (!existsSync(dir)) continue;
    for (const task of readdirSync(dir)) {
      const base = path.join(dir, task, 'baseline-s1');
      if (existsSync(path.join(base, 'result.infra.json'))) infra[arm] = (infra[arm] ?? 0) + 1;
      const f = path.join(base, 'result.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8'));
      if (r.check?.infra) {
        infra[arm] = (infra[arm] ?? 0) + 1;
        continue;
      }
      runs.push({ arm, split, task, scenario: task.split('_')[0]!, pass: !!r.check.pass, score: +Number(r.check.score).toFixed(3), costUsd: +Number(r.costUsd).toFixed(5), turns: r.turns, tokens: r.tokens.total, wallS: Math.round(r.wallMs / 1000), model: r.model });
    }
  }
}

/** 95% Wilson score interval for k successes in n trials. */
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}

/** Exact two-sided McNemar test: b tasks only the first arm passed, c only the second. */
function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let logChoose = 0;
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const arms = specs.map((s) => s.slice(0, s.indexOf('=')));
const summary: Record<string, unknown>[] = [];

function summarize(label: string, keep: (r: Run) => boolean): void {
  console.log(`\n${label}`);
  const base = new Map(runs.filter((r) => r.arm === arms[0] && keep(r)).map((r) => [`${r.split}/${r.task}`, r.pass]));
  for (const arm of arms) {
    const rs = runs.filter((r) => r.arm === arm && keep(r));
    if (!rs.length) continue;
    const k = rs.filter((r) => r.pass).length;
    const [lo, hi] = wilson(k, rs.length);
    // A scenario counts when all of its variants ran and passed.
    const byScenario = new Map<string, boolean[]>();
    for (const r of rs) byScenario.set(`${r.split}/${r.scenario}`, [...(byScenario.get(`${r.split}/${r.scenario}`) ?? []), r.pass]);
    const scenarios = [...byScenario.values()].filter((v) => v.length === 3);
    const sgc = scenarios.filter((v) => v.every(Boolean)).length;
    const cost = rs.reduce((a, r) => a + r.costUsd, 0);
    let paired = '';
    let b = 0;
    let c = 0;
    if (arm !== arms[0]) {
      for (const r of rs) {
        const other = base.get(`${r.split}/${r.task}`);
        if (other === undefined) continue;
        if (other && !r.pass) b++;
        else if (!other && r.pass) c++;
      }
      paired = `  vs ${arms[0]}: +${c} / -${b}, p=${mcnemar(b, c).toFixed(4)}`;
    }
    console.log(`  ${arm.padEnd(15)} TGC ${String(k).padStart(3)}/${rs.length} ${pct(k / rs.length).padStart(6)} [${pct(lo)}, ${pct(hi)}]  SGC ${sgc}/${scenarios.length} ${pct(sgc / Math.max(1, scenarios.length)).padStart(6)}  $${(cost / rs.length).toFixed(4)}/task${paired}`);
    summary.push({ set: label, arm, tasks: rs.length, passed: k, tgc: +(k / rs.length).toFixed(4), ci95: [+lo.toFixed(4), +hi.toFixed(4)], scenarios: scenarios.length, scenariosPassed: sgc, sgc: +(sgc / Math.max(1, scenarios.length)).toFixed(4), costPerTaskUsd: +(cost / rs.length).toFixed(5), costUsd: +cost.toFixed(2), turns: +(rs.reduce((a, r) => a + r.turns, 0) / rs.length).toFixed(1), ...(arm !== arms[0] ? { vs: arms[0], gained: c, lost: b, mcnemarP: +mcnemar(b, c).toFixed(5) } : {}) });
  }
}

for (const split of SPLITS) summarize(split, (r) => r.split === split);
summarize('both test sets', () => true);
summarize('both test sets, unseen scenarios only', (r) => !sampled.has(r.scenario));
if (Object.keys(infra).length) console.log(`\ninfrastructure failures left out: ${JSON.stringify(infra)}`);

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'runs.jsonl'), runs.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ arms, infra, summary }, null, 2) + '\n');
console.log(`\n${runs.length} runs -> ${out}/runs.jsonl, ${out}/summary.json`);
