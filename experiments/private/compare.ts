/**
 * Compares round 19 arms on the Zorbit test tasks.
 *
 *   node experiments/private/compare.ts <out.json> <arm>=<runs dir> ...      (the first arm is the reference)
 *
 * Per arm: runs passed with a 95% Wilson interval (per run, as in earlier rounds), and a 95% interval from a bootstrap
 * that resamples tasks (runs of one task are not independent), plus cost, turns and tokens per run. Against the
 * reference, on the tasks both arms ran: the mean per-task difference in pass rate with a task bootstrap interval, a
 * Wilcoxon signed-rank test on the per-task differences (normal approximation with tie correction), and tasks better
 * or worse. Infrastructure failures are excluded and counted.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { wilson } from '../lib/stats.ts';

interface Run {
  task: string;
  pass: boolean;
  cost: number;
  turns: number;
  tokens: number;
}

const [outFile, ...specs] = process.argv.slice(2);
if (!outFile || !specs.length || specs.some((s) => !s.includes('='))) {
  console.error('usage: compare.ts <out.json> <arm>=<runs dir> ...');
  process.exit(1);
}

function load(dir: string): { runs: Run[]; infra: number } {
  const runs: Run[] = [];
  let infra = 0;
  for (const task of readdirSync(dir)) {
    for (const run of readdirSync(path.join(dir, task))) {
      const f = path.join(dir, task, run, 'result.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8'));
      if (r.check?.infra) {
        infra++;
        continue;
      }
      runs.push({ task, pass: !!r.check.pass, cost: r.costUsd ?? 0, turns: r.turns ?? 0, tokens: r.tokens?.total ?? 0 });
    }
  }
  return { runs, infra };
}

/** Deterministic PRNG so the intervals are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
};
/** 95% interval of the mean of per-task values, resampling tasks. */
function bootstrap(values: number[], reps = 10_000): [number, number] {
  const r = rng(19);
  const means: number[] = [];
  for (let i = 0; i < reps; i++) {
    let s = 0;
    for (let j = 0; j < values.length; j++) s += values[Math.floor(r() * values.length)]!;
    means.push(s / values.length);
  }
  return [quantile(means, 0.025), quantile(means, 0.975)];
}
/** Two-sided Wilcoxon signed-rank p-value (normal approximation, tie-corrected; zeros dropped). */
function wilcoxon(diffs: number[]): number {
  const d = diffs.filter((x) => x !== 0);
  const n = d.length;
  if (!n) return 1;
  const sorted = d.map((x) => ({ x, a: Math.abs(x) })).sort((p, q) => p.a - q.a);
  const ranks: number[] = Array.from({ length: n }, () => 0);
  let tie = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && sorted[j + 1]!.a === sorted[i]!.a) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = rank;
    const t = j - i + 1;
    tie += t * t * t - t;
    i = j + 1;
  }
  const wPlus = sorted.reduce((s, p, i) => s + (p.x > 0 ? ranks[i]! : 0), 0);
  const mean = (n * (n + 1)) / 4;
  const sd = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tie / 48);
  if (sd === 0) return 1;
  const z = (Math.abs(wPlus - mean) - 0.5) / sd;
  // Two-sided normal tail.
  const erfc = (x: number) => {
    const t = 1 / (1 + 0.5 * x);
    return t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  };
  return Math.min(1, erfc(Math.max(0, z) / Math.SQRT2));
}

const perTask = (runs: Run[]) => {
  const m = new Map<string, boolean[]>();
  for (const r of runs) m.set(r.task, [...(m.get(r.task) ?? []), r.pass]);
  return new Map([...m].map(([t, ps]) => [t, ps.filter(Boolean).length / ps.length]));
};
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;

const arms = specs.map((s) => {
  const i = s.indexOf('=');
  return { arm: s.slice(0, i), ...load(s.slice(i + 1)) };
});
const ref = arms[0]!;
const refTasks = perTask(ref.runs);
const summary: unknown[] = [];
console.log(`| arm | runs passed | per run (Wilson 95%) | per task (bootstrap 95%) | vs ${ref.arm}, tasks both ran (bootstrap 95%) | Wilcoxon p | tasks better / worse | $ / run | turns | tokens |`);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const a of arms) {
  const k = a.runs.filter((r) => r.pass).length;
  const n = a.runs.length;
  const [lo, hi] = wilson(k, n);
  const tasks = perTask(a.runs);
  const [tlo, thi] = bootstrap([...tasks.values()]);
  const shared = [...tasks.keys()].filter((t) => refTasks.has(t));
  const diffs = shared.map((t) => tasks.get(t)! - refTasks.get(t)!);
  const meanDiff = diffs.reduce((s, x) => s + x, 0) / (diffs.length || 1);
  const [dlo, dhi] = a === ref ? [0, 0] : bootstrap(diffs);
  const p = a === ref ? 1 : wilcoxon(diffs);
  const better = diffs.filter((x) => x > 0).length;
  const worse = diffs.filter((x) => x < 0).length;
  const mean = (f: (r: Run) => number) => a.runs.reduce((s, r) => s + f(r), 0) / (n || 1);
  const row = { arm: a.arm, passed: k, runs: n, infra: a.infra, rate: k / (n || 1), wilson: [lo, hi], taskBootstrap: [tlo, thi], vsRef: a === ref ? null : { tasks: shared.length, meanDiff, ci: [dlo, dhi], p, better, worse }, costPerRun: mean((r) => r.cost), turns: mean((r) => r.turns), tokens: mean((r) => r.tokens) };
  summary.push(row);
  console.log(`| ${a.arm} | ${k}/${n}${a.infra ? ` (+${a.infra} infra)` : ''} | ${pct(k / (n || 1))} [${pct(lo)}, ${pct(hi)}] | [${pct(tlo)}, ${pct(thi)}] | ${a === ref ? '' : `${pp(meanDiff)} pp [${pp(dlo)}, ${pp(dhi)}] on ${shared.length}`} | ${a === ref ? '' : p < 0.001 ? '< 0.001' : p.toFixed(3)} | ${a === ref ? '' : `${better} / ${worse}`} | ${mean((r) => r.cost).toFixed(4)} | ${mean((r) => r.turns).toFixed(1)} | ${Math.round(mean((r) => r.tokens) / 1000)}k |`);
}
writeFileSync(outFile, JSON.stringify(summary, null, 2));
