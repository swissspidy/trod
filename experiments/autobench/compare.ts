/**
 * Compares arms on AutomationBench tasks.
 *
 *   node experiments/autobench/compare.ts <out dir> <arm>=<runs dir> ...
 *
 * Writes runs.jsonl (one compact record per run) and summary.json, and prints per arm: tasks passed (every scored
 * assertion holds: the benchmark's pass rate) with a 95% Wilson interval, the mean share of assertions satisfied,
 * cost per task, the tasks passed per domain, and against the first arm the paired outcome per task with an exact
 * McNemar test.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mcnemar, wilson } from '../lib/stats.ts';

const [out, ...specs] = process.argv.slice(2);
if (!out || !specs.length || specs.some((s) => !s.includes('='))) {
  console.error('usage: node experiments/autobench/compare.ts <out dir> <arm>=<runs dir> ...');
  process.exit(1);
}

interface Run {
  arm: string;
  task: string;
  domain: string;
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
const arms = specs.map((s) => s.slice(0, s.indexOf('=')));
for (const spec of specs) {
  const i = spec.indexOf('=');
  const [arm, dir] = [spec.slice(0, i), spec.slice(i + 1)];
  if (!existsSync(dir)) {
    console.error(`${arm}: no such directory ${dir}`);
    process.exit(1);
  }
  for (const task of readdirSync(dir)) {
    const f = path.join(dir, task, 'baseline-s1', 'result.json');
    if (!existsSync(f)) {
      if (existsSync(path.join(dir, task, 'baseline-s1', 'result.infra.json'))) infra[arm] = (infra[arm] ?? 0) + 1;
      continue;
    }
    const r = JSON.parse(readFileSync(f, 'utf8'));
    if (r.check?.infra) {
      infra[arm] = (infra[arm] ?? 0) + 1;
      continue;
    }
    runs.push({ arm, task, domain: task.slice(0, task.lastIndexOf('-')), pass: !!r.check.pass, score: +Number(r.check.score).toFixed(3), costUsd: +Number(r.costUsd).toFixed(5), turns: r.turns, tokens: r.tokens.total, wallS: Math.round(r.wallMs / 1000), model: r.model });
  }
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const domains = [...new Set(runs.map((r) => r.domain))].sort();
const base = new Map(runs.filter((r) => r.arm === arms[0]).map((r) => [r.task, r.pass]));
const summary: Record<string, unknown>[] = [];
console.log(`${'arm'.padEnd(16)} ${'passed'.padEnd(34)} assertions  $/task   ${domains.map((d) => d.slice(0, 5).padStart(5)).join(' ')}`);
for (const arm of arms) {
  const rs = runs.filter((r) => r.arm === arm);
  if (!rs.length) continue;
  const k = rs.filter((r) => r.pass).length;
  const [lo, hi] = wilson(k, rs.length);
  const partial = rs.reduce((a, r) => a + r.score, 0) / rs.length;
  const cost = rs.reduce((a, r) => a + r.costUsd, 0);
  const byDomain: Record<string, { tasks: number; passed: number }> = {};
  for (const d of domains) {
    const v = rs.filter((r) => r.domain === d);
    byDomain[d] = { tasks: v.length, passed: v.filter((r) => r.pass).length };
  }
  let b = 0;
  let c = 0;
  let n = 0;
  let paired = '';
  if (arm !== arms[0]) {
    for (const r of rs) {
      const other = base.get(r.task);
      if (other === undefined) continue;
      n++;
      if (other && !r.pass) b++;
      else if (!other && r.pass) c++;
    }
    paired = `  vs ${arms[0]}: +${c} / -${b}, p=${mcnemar(b, c).toFixed(4)}${n < rs.length || n < base.size ? ` (on the ${n} tasks both ran)` : ''}`;
  }
  const passed = `${String(k).padStart(3)}/${rs.length} ${pct(k / rs.length).padStart(6)} [${pct(lo)}, ${pct(hi)}]`;
  console.log(`${arm.padEnd(16)} ${passed.padEnd(34)} ${pct(partial).padStart(6)}      $${(cost / rs.length).toFixed(4)}  ${domains.map((d) => String(byDomain[d]!.passed).padStart(5)).join(' ')}${paired}`);
  summary.push({ arm, model: rs[0]!.model, tasks: rs.length, passed: k, passRate: +(k / rs.length).toFixed(4), ci95: [+lo.toFixed(4), +hi.toFixed(4)], assertionsSatisfied: +partial.toFixed(4), costPerTaskUsd: +(cost / rs.length).toFixed(5), costUsd: +cost.toFixed(2), turns: +(rs.reduce((a, r) => a + r.turns, 0) / rs.length).toFixed(1), byDomain, ...(arm !== arms[0] ? { vs: arms[0], paired: n, gained: c, lost: b, mcnemarP: +mcnemar(b, c).toFixed(5) } : {}) });
}
if (Object.keys(infra).length) console.log(`\ninfrastructure failures left out: ${JSON.stringify(infra)}`);

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'runs.jsonl'), runs.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ arms, infra, summary }, null, 2) + '\n');
console.log(`\n${runs.length} runs -> ${out}/runs.jsonl, ${out}/summary.json`);
