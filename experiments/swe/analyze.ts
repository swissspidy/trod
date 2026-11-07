/**
 * Summarizes SWE-bench runs: resolve rate, tokens, turns and cost per model × arm, a paired per-instance comparison
 * (with an exact McNemar test), cost per resolved instance, and how often forged tools were used.
 * Usage: node experiments/swe/analyze.ts <runs root with one dir per model> [--forge <forge.json>] [--out <dir>]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { RunRecord } from '../runner/metrics.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { forge: { type: 'string' }, out: { type: 'string' } } });
const root = positionals[0];
if (!root || !existsSync(root)) {
  console.error('usage: node experiments/swe/analyze.ts <runs root> [--forge forge.json] [--out dir]');
  process.exit(1);
}

type Rec = RunRecord & { modelDir: string };
const records: Rec[] = [];
const excluded: string[] = [];
for (const modelDir of readdirSync(root)) {
  const md = path.join(root, modelDir);
  if (modelDir === 'forge' || !existsSync(md) || !readdirSync(md).length) continue;
  for (const inst of readdirSync(md)) {
    const d = path.join(md, inst);
    if (!existsSync(d)) continue;
    for (const run of readdirSync(d)) {
      const f = path.join(d, run, 'result.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8')) as RunRecord;
      // Runs whose grading could not complete say nothing about the agent.
      if (r.steps.some((s) => s.check.infra)) {
        excluded.push(r.id);
        continue;
      }
      records.push({ ...r, modelDir });
    }
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** Exact two-sided McNemar test (binomial on the discordant pairs). */
function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let p = 0;
  let coef = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) coef = (coef * (n - i + 1)) / i;
    if (i <= k) p += coef;
  }
  return Math.min(1, (2 * p) / 2 ** n);
}

const models = [...new Set(records.map((r) => r.modelDir))].sort();
const arms = ['baseline', 'forged'] as const;
const cells: Record<string, any> = {};
for (const m of models) {
  for (const a of arms) {
    const rs = records.filter((r) => r.modelDir === m && r.arm === a);
    if (!rs.length) continue;
    const resolved = rs.filter((r) => r.check.pass).length;
    const cost = rs.reduce((n, r) => n + r.costUsd, 0);
    cells[`${m}/${a}`] = {
      model: m,
      arm: a,
      n: rs.length,
      resolved,
      rate: resolved / rs.length,
      tokens: mean(rs.map((r) => r.tokens.total)),
      turns: mean(rs.map((r) => r.turns)),
      wallS: mean(rs.map((r) => r.wallMs / 1000)),
      costPerInstance: cost / rs.length,
      costPerResolved: resolved ? cost / resolved : null,
      usedTrod: rs.filter((r) => (r.trod?.calls ?? 0) > 0 || Object.keys(r.toolCalls ?? {}).some((k) => k.startsWith('mcp__trod__'))).length,
      trodCalls: rs.reduce((n, r) => n + Object.entries(r.toolCalls ?? {}).filter(([k]) => k.startsWith('mcp__trod__')).reduce((s, [, v]) => s + v, 0), 0),
    };
  }
}

/** Paired comparison of two cells over the instances both ran. */
function paired(x: string, y: string) {
  const ix = new Map(records.filter((r) => `${r.modelDir}/${r.arm}` === x).map((r) => [r.task, r.check.pass]));
  const iy = new Map(records.filter((r) => `${r.modelDir}/${r.arm}` === y).map((r) => [r.task, r.check.pass]));
  const common = [...ix.keys()].filter((k) => iy.has(k));
  const both = common.filter((k) => ix.get(k) && iy.get(k)).length;
  const onlyX = common.filter((k) => ix.get(k) && !iy.get(k));
  const onlyY = common.filter((k) => !ix.get(k) && iy.get(k));
  return { x, y, n: common.length, both, onlyX: onlyX.length, onlyY: onlyY.length, neither: common.length - both - onlyX.length - onlyY.length, p: mcnemar(onlyX.length, onlyY.length), onlyXIds: onlyX, onlyYIds: onlyY };
}

const comparisons = [];
for (const m of models) if (cells[`${m}/baseline`] && cells[`${m}/forged`]) comparisons.push(paired(`${m}/baseline`, `${m}/forged`));
const ms = models.slice().sort();
if (ms.length >= 2) {
  const [cheap, strong] = ms.includes('haiku') && ms.includes('sonnet') ? ['haiku', 'sonnet'] : [ms[0]!, ms[1]!];
  if (cells[`${strong}/baseline`] && cells[`${cheap}/forged`]) comparisons.push(paired(`${strong}/baseline`, `${cheap}/forged`));
}
const forge = values.forge && existsSync(values.forge) ? JSON.parse(readFileSync(values.forge, 'utf8')) : undefined;

const summary = { instances: new Set(records.map((r) => r.task)).size, excludedInfra: excluded, cells, comparisons, forge: forge && { costUsd: forge.costUsd, turns: forge.turns, tools: forge.promoted, model: forge.model } };
console.log(JSON.stringify({ ...summary, comparisons: comparisons.map(({ onlyXIds: _a, onlyYIds: _b, ...c }) => c) }, null, 2));

if (values.out) {
  mkdirSync(values.out, { recursive: true });
  writeFileSync(path.join(values.out, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(path.join(values.out, 'runs.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
