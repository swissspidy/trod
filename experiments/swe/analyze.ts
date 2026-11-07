/**
 * Summarizes SWE-bench runs: resolve rate, tokens, turns and cost per model × arm, a paired per-instance comparison
 * (with an exact McNemar test), cost per resolved instance, and how often forged tools were used.
 * Usage: node experiments/swe/analyze.ts <runs root with one dir per model> [--forge <forge.json>] [--out <dir>]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { RunRecord } from '../runner/metrics.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { forge: { type: 'string' }, out: { type: 'string' }, writeup: { type: 'string' } } });
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
/** Exact two-sided binomial (sign / McNemar) test on discordant counts, computed in log space (no overflow). */
function mcnemar(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  const lnFact = (x: number) => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) - n * Math.LN2);
  return Math.min(1, 2 * p);
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
  // Pairs are (instance, seed): the same instance in the same seed slot of both cells.
  const ix = new Map(records.filter((r) => `${r.modelDir}/${r.arm}` === x).map((r) => [`${r.task}#${r.seed}`, r.check.pass]));
  const iy = new Map(records.filter((r) => `${r.modelDir}/${r.arm}` === y).map((r) => [`${r.task}#${r.seed}`, r.check.pass]));
  const common = [...ix.keys()].filter((k) => iy.has(k));
  const both = common.filter((k) => ix.get(k) && iy.get(k)).length;
  const onlyX = common.filter((k) => ix.get(k) && !iy.get(k));
  const onlyY = common.filter((k) => !ix.get(k) && iy.get(k));
  // Seeds of one instance are correlated, so also test at the instance level: a sign test on instances whose resolve
  // rate differs between the two cells.
  const rate = (m: Map<string, boolean>, task: string) => {
    const v = [...m].filter(([k]) => k.startsWith(`${task}#`) && iy.has(k) && ix.has(k)).map(([, pass]) => (pass ? 1 : 0));
    return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : NaN;
  };
  const tasks = [...new Set(common.map((k) => k.split('#')[0]!))];
  const better = tasks.filter((t) => rate(ix, t) > rate(iy, t)).length;
  const worse = tasks.filter((t) => rate(ix, t) < rate(iy, t)).length;
  return {
    x, y, n: common.length, instances: tasks.length, both, onlyX: onlyX.length, onlyY: onlyY.length, neither: common.length - both - onlyX.length - onlyY.length,
    p: mcnemar(onlyX.length, onlyY.length),
    instanceLevel: { xBetter: better, yBetter: worse, p: mcnemar(better, worse) },
    onlyXIds: onlyX, onlyYIds: onlyY,
  };
}

const comparisons: ReturnType<typeof paired>[] = [];
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
  const writeup = values.writeup && existsSync(values.writeup) ? readFileSync(values.writeup, 'utf8') : '';
  writeFileSync(path.join(values.out, 'report.html'), renderHtml(writeup));
}

function renderHtml(writeup: string): string {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const label = (k: string) => {
    const [m, a] = k.split('/');
    return `${m![0]!.toUpperCase()}${m!.slice(1)} ${a === 'forged' ? '+ forged library' : 'from scratch'}`;
  };
  const tiles = Object.entries(cells)
    .map(([k, c]) => `<div class="tile"><div class="tl">${esc(label(k))}</div><div class="big">${(c.rate * 100).toFixed(1)}%</div><div class="sub">resolved ${c.resolved}/${c.n} runs · ${Math.round(c.tokens / 1000)}k tokens · ${c.turns.toFixed(1)} turns · $${c.costPerInstance.toFixed(4)} per instance${c.arm === 'forged' ? ` · used trod tools in ${c.usedTrod}/${c.n}` : ''}</div></div>`)
    .join('');
  const rows = comparisons
    .map((p) => `<tr><td>${esc(label(p.x))}</td><td>${esc(label(p.y))}</td><td>${p.n}</td><td>${p.both}</td><td>${p.onlyX}</td><td>${p.onlyY}</td><td>${p.neither}</td><td>${p.p.toFixed(2)}</td><td>${p.instanceLevel.xBetter} / ${p.instanceLevel.yBetter} (p=${p.instanceLevel.p.toFixed(2)})</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>trod on SWE-bench</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--surface-2:#f3f2ef;--text:#0b0b0b;--text-2:#52514e;--muted:#8a8984;--grid:#e6e5e0}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--surface:#1a1a19;--surface-2:#242422;--text:#f0efec;--text-2:#c3c2b7;--muted:#8f8e86;--grid:#33332f}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--surface-2:#242422;--text:#f0efec;--text-2:#c3c2b7;--muted:#8f8e86;--grid:#33332f}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 16px 64px}h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 8px}p,li{color:var(--text-2);max-width:74ch}
.meta{color:var(--muted);font-size:13px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:20px 0}
.tile{background:var(--surface-2);border-radius:10px;padding:14px 16px}.tl{font-size:13px;color:var(--text-2)}.big{font-size:30px;font-weight:600;margin:4px 0}.sub{font-size:12.5px;color:var(--text-2)}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:13px;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 8px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}th{color:var(--text-2);font-weight:600}
.writeup{background:var(--surface-2);border-radius:10px;padding:4px 20px 12px}code{font-size:12.5px}
</style></head><body><main>
<h1>trod on SWE-bench Verified (Django)</h1>
<div class="meta">${summary.instances} instances (Django 4.0/4.1) · ${records.length} graded runs · one forge with ${esc(String(forge?.model ?? '?'))} ($${forge ? forge.costUsd.toFixed(2) : '?'}): ${(forge?.promoted ?? []).map((t: string) => `<code>${esc(t)}</code>`).join(', ')}</div>
<div class="tiles">${tiles}</div>
<div class="writeup">${writeup}</div>
<h2>Paired comparisons</h2>
<p>Pairs are the same instance in the same seed. "Only A" counts pairs resolved by A but not B. The instance-level column compares per-instance resolve rates across seeds (a sign test, since seeds of one instance are correlated).</p>
<div class="scroll"><table><thead><tr><th>A</th><th>B</th><th>pairs</th><th>both</th><th>only A</th><th>only B</th><th>neither</th><th>p (pairs)</th><th>instances A / B better</th></tr></thead><tbody>${rows}</tbody></table></div>
</main></body></html>`;
}
