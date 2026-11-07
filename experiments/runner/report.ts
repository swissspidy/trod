/**
 * Aggregates results/runs/<name>/**\/result.json into results/summary.json and results/report.html.
 * Usage: node experiments/runner/report.ts results/runs/<name> [--out results]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TASKS } from '../tasks/index.ts';
import type { RunRecord } from './metrics.ts';

const ARMS = ['baseline', 'scripts', 'genesis', 'nudged', 'library', 'toolsmith', 'forged'] as const;
type Arm = (typeof ARMS)[number];
const ARM_LABEL: Record<Arm, string> = { baseline: 'Baseline (Bash only)', scripts: 'Scripts (Bash only, work dir persists)', genesis: 'Genesis (trod available)', nudged: 'Nudged (told to build trod tools)', library: 'Library (tools from an earlier session)', toolsmith: 'Toolsmith (library built once up front)', forged: 'Forged (trod forge library, cards, trod_eval)' };

export interface Cell {
  task: string;
  arm: Arm;
  n: number;
  passRate: number;
  meanScore: number;
  costUsd: number;
  tokens: number;
  outputTokens: number;
  turns: number;
  wallS: number;
  toolsCreated: number;
  trodCalls: number;
  callsPerTool: number;
  creationTokens: number;
  creationShare: number;
  runsWithTools: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / (xs.length - 1));
};

function findResults(dir: string): RunRecord[] {
  const out: RunRecord[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'work' || e === 'home') continue;
      out.push(...findResults(p));
    } else if (e === 'result.json') {
      const r = JSON.parse(readFileSync(p, 'utf8')) as RunRecord & { stepCostUsd?: number[] };
      // Per-step cost, from each step's final result event.
      r.stepCostUsd = readdirSync(dir)
        .filter((f) => /^stream-\d+\.jsonl$/.test(f))
        .sort()
        .map((f) => {
          const last = readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.includes('"type":"result"')).pop();
          return last ? (JSON.parse(last).total_cost_usd ?? 0) : 0;
        });
      out.push(r);
    }
  }
  return out;
}

export function aggregate(all: RunRecord[]) {
  // A check that could not be completed (infra) says nothing about the agent: leave those runs out of every aggregate.
  const records = all.filter((r) => !r.check.infra);
  const infraExcluded = all.length - records.length;
  const cells: Cell[] = [];
  for (const task of TASKS) {
    for (const arm of ARMS) {
      const rs = records.filter((r) => r.task === task.id && r.arm === arm);
      if (!rs.length) continue;
      const created = rs.map((r) => r.trod?.toolsCreated ?? 0);
      const calls = rs.map((r) => r.trod?.calls ?? 0);
      cells.push({
        task: task.id,
        arm,
        n: rs.length,
        passRate: mean(rs.map((r) => (r.check.pass ? 1 : 0))),
        meanScore: mean(rs.map((r) => r.check.score)),
        costUsd: mean(rs.map((r) => r.costUsd)),
        tokens: mean(rs.map((r) => r.tokens.total)),
        outputTokens: mean(rs.map((r) => r.tokens.output)),
        turns: mean(rs.map((r) => r.turns)),
        wallS: mean(rs.map((r) => r.wallMs / 1000)),
        toolsCreated: mean(created),
        trodCalls: mean(calls),
        callsPerTool: created.reduce((a, b) => a + b, 0) ? calls.reduce((a, b) => a + b, 0) / created.reduce((a, b) => a + b, 0) : 0,
        creationTokens: mean(rs.map((r) => r.trod?.creationTotalTokens ?? 0)),
        creationShare: mean(rs.map((r) => (r.tokens.total ? (r.trod?.creationTotalTokens ?? 0) / r.tokens.total : 0))),
        runsWithTools: rs.filter((r) => (r.trod?.toolsCreated ?? 0) > 0).length,
      });
    }
  }
  const overall = ARMS.map((arm) => {
    const by = (kind: string) => records.filter((r) => r.arm === arm && (kind === 'all' || r.kind === kind));
    const summary = (rs: RunRecord[]) => ({
      n: rs.length,
      passRate: mean(rs.map((r) => (r.check.pass ? 1 : 0))),
      meanScore: mean(rs.map((r) => r.check.score)),
      /** Tokens spent per unit of score: the cost of a correct result. */
      tokensPerScore: rs.reduce((n, r) => n + r.tokens.total, 0) / Math.max(1e-9, rs.reduce((n, r) => n + r.check.score, 0)),
      costUsd: mean(rs.map((r) => r.costUsd)),
      costSd: sd(rs.map((r) => r.costUsd)),
      tokens: mean(rs.map((r) => r.tokens.total)),
      turns: mean(rs.map((r) => r.turns)),
      wallS: mean(rs.map((r) => r.wallMs / 1000)),
      toolsCreated: rs.reduce((n, r) => n + (r.trod?.toolsCreated ?? 0), 0),
      trodCalls: rs.reduce((n, r) => n + (r.trod?.calls ?? 0), 0),
      runsWithTools: rs.filter((r) => (r.trod?.toolsCreated ?? 0) > 0).length,
    });
    return { arm, all: summary(by('all')), repetitive: summary(by('repetitive')), control: summary(by('control')) };
  });
  // Per-task ratio to baseline (cost, turns, wall), the headline numbers.
  const present = TASKS.filter((t) => records.some((r) => r.task === t.id));
  const ratios = present.map((t) => {
    const base = cells.find((c) => c.task === t.id && c.arm === 'baseline');
    return {
      task: t.id,
      kind: t.kind,
      ...Object.fromEntries(
        (['scripts', 'genesis', 'nudged', 'library', 'toolsmith', 'forged'] as const).map((arm) => {
          const c = cells.find((x) => x.task === t.id && x.arm === arm);
          return [arm, base && c ? { tokens: c.tokens / base.tokens, cost: c.costUsd / base.costUsd, turns: c.turns / base.turns, wall: c.wallS / base.wallS } : null];
        }),
      ),
    };
  });
  const stepCost = ARMS.map((arm) => {
    const rs = records.filter((r) => r.arm === arm && r.kind === 'repetitive') as (RunRecord & { stepCostUsd?: number[] })[];
    const n = Math.max(0, ...rs.map((r) => r.stepCostUsd?.length ?? 0));
    return { arm, steps: Array.from({ length: n }, (_, i) => mean(rs.filter((r) => (r.stepCostUsd?.length ?? 0) > i).map((r) => r.stepCostUsd![i]!))) };
  }).filter((x) => x.steps.some((v) => v > 0));
  const tools = records
    .filter((r) => r.arm !== 'baseline')
    .flatMap((r) => (r.trod?.perTool ?? []).map((t) => ({ run: r.id, task: r.task, arm: r.arm, ...t })));
  // The toolsmith arm's one-off session, and how many measured sessions it takes to pay for itself.
  const ts = records.filter((r) => r.arm === 'toolsmith' && (r as RunRecord & { toolsmith?: any }).toolsmith) as (RunRecord & { toolsmith: any })[];
  let investment: { n: number; tokens: number; costUsd: number; turns: number; savedTokensPerSession: number; savedCostPerSession: number; breakEvenSessions: number | null; library: string[][] } | undefined;
  if (ts.length) {
    const usageTotal = (u: any) => (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.output_tokens ?? 0);
    const base = records.filter((r) => r.arm === 'baseline' && ts.some((t) => t.task === r.task));
    const sessions = mean(ts.map((r) => r.steps.length)) || 1;
    const saved = (mean(base.map((r) => r.tokens.total)) - mean(ts.map((r) => r.tokens.total))) / sessions;
    const savedCost = (mean(base.map((r) => r.costUsd)) - mean(ts.map((r) => r.costUsd))) / sessions;
    const tokens = mean(ts.map((r) => usageTotal(r.toolsmith.usage)));
    investment = {
      n: ts.length,
      tokens,
      costUsd: mean(ts.map((r) => r.toolsmith.costUsd)),
      turns: mean(ts.map((r) => r.toolsmith.turns)),
      savedTokensPerSession: saved,
      savedCostPerSession: savedCost,
      breakEvenSessions: saved > 0 ? Math.ceil(tokens / saved) : null,
      library: ts.map((r) => r.toolsmith.library),
    };
  }
  return { cells, overall, ratios, stepCost, tools, investment, infraExcluded };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '–');
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Horizontal grouped bars: one group per task, one bar per arm. */
function groupedBars(cells: Cell[], metric: keyof Cell, label: string, unit: (v: number) => string): string {
  const rows = TASKS.filter((t) => cells.some((c) => c.task === t.id)).map((t) => ({ task: t, vals: ARMS.map((a) => cells.find((c) => c.task === t.id && c.arm === a)) }));
  const max = Math.max(...cells.map((c) => Number(c[metric]) || 0), 1e-9);
  const barH = 10;
  const gap = 2;
  const groupH = ARMS.length * (barH + gap) + 14;
  const left = 150;
  const width = 640;
  const plotW = width - left - 70;
  const height = rows.length * groupH + 24;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} by task and arm" class="chart">`;
  for (const t of ticks) {
    const x = left + (t / max) * plotW;
    svg += `<line x1="${x}" x2="${x}" y1="0" y2="${height - 20}" class="grid"/><text x="${x}" y="${height - 6}" class="tick" text-anchor="middle">${esc(unit(t))}</text>`;
  }
  rows.forEach((row, gi) => {
    const y0 = gi * groupH + 6;
    svg += `<text x="${left - 8}" y="${y0 + (ARMS.length * (barH + gap)) / 2 + 3}" class="cat" text-anchor="end">${esc(row.task.id)}</text>`;
    row.vals.forEach((c, ai) => {
      if (!c) return;
      const v = Number(c[metric]) || 0;
      const w = Math.max(1, (v / max) * plotW);
      const y = y0 + ai * (barH + gap);
      const tip = `${row.task.id} · ${ARM_LABEL[ARMS[ai]!]}: ${unit(v)} (n=${c.n}, pass ${pct(c.passRate)})`;
      svg += `<g class="mark" data-tip="${esc(tip)}"><rect x="${left}" y="${y - 1}" width="${plotW + 60}" height="${barH + 2}" class="hit"/><path d="M${left},${y} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h-${Math.max(0, w - 4)} z" class="s${ai + 1}"/><text x="${left + w + 4}" y="${y + barH - 1}" class="val">${esc(unit(v))}</text></g>`;
    });
  });
  return svg + '</svg>';
}

export function renderHtml(agg: ReturnType<typeof aggregate>, meta: { model: string; runs: number; generated: string; writeup: string; title: string }): string {
  const { cells, overall, ratios, stepCost, tools, investment } = agg;
  const investmentHtml = investment
    ? `<h2>The toolsmith investment</h2><p>One dedicated session built the library before the measured sessions (mean of ${investment.n}): ${Math.round(investment.tokens / 1000)}k tokens, $${fmt(investment.costUsd, 3)}, ${fmt(investment.turns, 0)} turns. Tools built: ${investment.library.map((l) => l.map((x) => `<code>${esc(x)}</code>`).join(', ')).join(' · ')}.</p><p>Each measured session with the library used <strong>${Math.round(investment.savedTokensPerSession / 1000)}k fewer tokens</strong> than baseline ($${fmt(investment.savedCostPerSession, 3)} less). The investment pays for itself after <strong>${investment.breakEvenSessions ?? '–'} sessions</strong> (in tokens).</p>`
    : '';
  const nSteps = Math.max(0, ...stepCost.map((x) => x.steps.length));
  const stepTable = `<table><thead><tr><th>arm</th>${Array.from({ length: nSteps }, (_, i) => `<th>step ${i + 1}</th>`).join('')}</tr></thead><tbody>${stepCost
    .map((x) => `<tr><td>${esc(ARM_LABEL[x.arm])}</td>${x.steps.map((v) => `<td>$${fmt(v, 3)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
  const legend = `<div class="legend">${ARMS.map((a, i) => (cells.some((c) => c.arm === a) ? `<span><i class="sw s${i + 1}"></i>${esc(ARM_LABEL[a])}</span>` : '')).join('')}</div>`;
  const tile = (o: (typeof overall)[number]) => `<div class="tile"><div class="tl"><i class="sw s${ARMS.indexOf(o.arm) + 1}"></i>${esc(ARM_LABEL[o.arm])}</div>
<div class="big">${o.repetitive.n ? `${Math.round(o.repetitive.tokens / 1000)}k` : '–'}</div><div class="sub">mean tokens per repetitive session · score ${fmt(o.repetitive.meanScore)} · pass ${pct(o.repetitive.passRate)} · ${Math.round(o.repetitive.tokensPerScore / 1000)}k tokens per full score · $${fmt(o.repetitive.costUsd, 3)} · ${fmt(o.repetitive.turns, 1)} turns · ${fmt(o.repetitive.wallS, 0)} s</div>
<div class="sub">controls: ${o.control.n ? `$${fmt(o.control.costUsd, 3)} · pass ${pct(o.control.passRate)}` : 'no runs'}${o.arm === 'baseline' ? '' : ` · tools built in ${o.all.runsWithTools}/${o.all.n} runs (${o.all.toolsCreated} tools, ${o.all.trodCalls} calls)`}</div></div>`;
  const table = `<table><thead><tr><th>task</th><th>arm</th><th>n</th><th>pass</th><th>score</th><th>cost $</th><th>tokens</th><th>out tokens</th><th>turns</th><th>wall s</th><th>tools</th><th>trod calls</th><th>calls/tool</th><th>creation share</th></tr></thead><tbody>${cells
    .map(
      (c) =>
        `<tr><td>${esc(c.task)}</td><td>${c.arm}</td><td>${c.n}</td><td>${pct(c.passRate)}</td><td>${fmt(c.meanScore)}</td><td>${fmt(c.costUsd, 3)}</td><td>${Math.round(c.tokens).toLocaleString('en-US')}</td><td>${Math.round(c.outputTokens).toLocaleString('en-US')}</td><td>${fmt(c.turns, 1)}</td><td>${fmt(c.wallS, 0)}</td><td>${fmt(c.toolsCreated, 1)}</td><td>${fmt(c.trodCalls, 1)}</td><td>${fmt(c.callsPerTool, 1)}</td><td>${c.arm === 'baseline' ? '–' : pct(c.creationShare)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  const ratioArms = ARMS.filter((a) => a !== 'baseline' && cells.some((c) => c.arm === a));
  const ratioTable = `<table><thead><tr><th>task</th><th>kind</th>${ratioArms.map((a) => `<th>${a} tokens ×</th><th>${a} turns ×</th>`).join('')}</tr></thead><tbody>${ratios
    .map((r: any) => `<tr><td>${esc(r.task)}</td><td>${r.kind}</td>${ratioArms.map((a) => `<td>${fmt(r[a]?.tokens)}</td><td>${fmt(r[a]?.turns)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
  const toolTable = tools.length
    ? `<table><thead><tr><th>run</th><th>tool</th><th>calls</th><th>errors</th><th>revisions</th><th>avg ms</th></tr></thead><tbody>${tools
        .map((t) => `<tr><td>${esc(t.run)}</td><td><code>${esc(t.tool)}</code></td><td>${t.calls}</td><td>${t.errors}</td><td>${t.revisions}</td><td>${t.avgMs}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p>No trod tools were created.</p>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--surface-2:#f3f2ef;--text:#0b0b0b;--text-2:#52514e;--muted:#8a8984;--grid:#e6e5e0;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#6250d6}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--surface:#1a1a19;--surface-2:#242422;--text:#f0efec;--text-2:#c3c2b7;--muted:#8f8e86;--grid:#33332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--surface-2:#242422;--text:#f0efec;--text-2:#c3c2b7;--muted:#8f8e86;--grid:#33332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 16px 64px}h1{font-size:28px;margin:0 0 4px}h2{font-size:19px;margin:40px 0 8px}p,li{color:var(--text-2);max-width:72ch}
.meta{color:var(--muted);font-size:13px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:20px 0}
.tile{background:var(--surface-2);border-radius:10px;padding:14px 16px}.tl{font-size:13px;color:var(--text-2);display:flex;align-items:center;gap:6px}.big{font-size:30px;font-weight:600;margin:4px 0}.sub{font-size:12.5px;color:var(--text-2)}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--text-2);margin:8px 0}.legend span{display:flex;align-items:center;gap:6px}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px}.sw.s1,.s1{background:var(--s1);fill:var(--s1)}.sw.s2,.s2{background:var(--s2);fill:var(--s2)}.sw.s3,.s3{background:var(--s3);fill:var(--s3)}.sw.s4,.s4{background:var(--s4);fill:var(--s4)}.sw.s5,.s5{background:var(--s5);fill:var(--s5)}.sw.s6,.s6{background:var(--s6);fill:var(--s6)}.sw.s7,.s7{background:var(--s7);fill:var(--s7)}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:20px}.chart{width:100%;height:auto;display:block}.chart .grid{stroke:var(--grid);stroke-width:1}
.chart text{font-size:10.5px;fill:var(--text-2)}.chart .tick{fill:var(--muted)}.chart .cat{fill:var(--text)}.chart .val{fill:var(--text-2);font-size:9.5px}.chart .hit{fill:transparent}.chart .mark:hover path{opacity:.8}
figure{margin:0}figcaption{font-weight:600;font-size:14px;margin-bottom:4px}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:12.5px;width:100%;font-variant-numeric:tabular-nums}th,td{padding:5px 8px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}th{color:var(--text-2);font-weight:600}
#tip{position:fixed;pointer-events:none;background:var(--text);color:var(--surface);font-size:12px;padding:5px 8px;border-radius:6px;opacity:0;transition:opacity .1s;max-width:320px}
.writeup{background:var(--surface-2);border-radius:10px;padding:4px 20px 12px}code{font-size:12.5px}
</style></head><body><main>
<h1>${esc(meta.title)}</h1>
<div class="meta">trod experiment · ${esc(meta.model)} · ${meta.runs} runs (task × arm × seed; each repetitive run is a multi-step session or series of sessions) · generated ${esc(meta.generated)}</div>
<div class="tiles">${overall.filter((o) => o.all.n).map(tile).join('')}</div>
<div class="writeup">${meta.writeup}</div>
${investmentHtml}
<h2>Cost and effort per task</h2>
${legend}
<div class="charts">
<figure><figcaption>Mean tokens per session</figcaption>${groupedBars(cells, 'tokens', 'Mean tokens', (v) => `${Math.round(v / 1000)}k`)}</figure>
<figure><figcaption>Mean score (fraction of answers correct)</figcaption>${groupedBars(cells, 'meanScore', 'Mean score', (v) => v.toFixed(2))}</figure>
<figure><figcaption>Mean turns per session</figcaption>${groupedBars(cells, 'turns', 'Mean turns', (v) => v.toFixed(0))}</figure>
<figure><figcaption>Mean wall time per session (s)</figcaption>${groupedBars(cells, 'wallS', 'Mean wall time', (v) => `${v.toFixed(0)}s`)}</figure>
<figure><figcaption>Mean cost per session (USD, list price; noisy because parallel runs share the prompt cache)</figcaption>${groupedBars(cells, 'costUsd', 'Mean cost', (v) => `$${v.toFixed(2)}`)}</figure>
</div>
<h2>Cost per step (repetitive tasks)</h2><p>Steps 2 and 3 are the follow-ups where an existing tool or script can be reused.</p><div class="scroll">${stepTable}</div>
<h2>Relative to baseline</h2><p>Ratios of means: total tokens and turns (1.00 = same as baseline; below 1 is cheaper).</p><div class="scroll">${ratioTable}</div>
<h2>All cells</h2><p>"creation share" is the fraction of a session's tokens spent in assistant messages that wrote <code>.trod/tools</code> files or called <code>trod_status</code>.</p><div class="scroll">${table}</div>
<h2>Tools that emerged</h2><div class="scroll">${toolTable}</div>
</main><div id="tip" role="tooltip"></div>
<script>
const tip=document.getElementById('tip');
document.querySelectorAll('.mark').forEach(m=>{m.addEventListener('mousemove',e=>{tip.textContent=m.dataset.tip;tip.style.opacity=1;tip.style.left=Math.min(e.clientX+12,innerWidth-330)+'px';tip.style.top=(e.clientY+12)+'px'});m.addEventListener('mouseleave',()=>tip.style.opacity=0)});
</script></body></html>`;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'results' }, writeup: { type: 'string' }, title: { type: 'string', default: 'Do self-made tools pay off?' } } });
  const dir = positionals[0];
  if (!dir || !existsSync(dir)) {
    console.error('usage: node experiments/runner/report.ts results/runs/<name> [--out results] [--writeup results/writeup.html]');
    process.exit(1);
  }
  const records = findResults(dir);
  const agg = aggregate(records);
  mkdirSync(values.out!, { recursive: true });
  const writeup = values.writeup && existsSync(values.writeup) ? readFileSync(values.writeup, 'utf8') : '<p>No write-up yet.</p>';
  writeFileSync(path.join(values.out!, 'summary.json'), JSON.stringify({ model: records[0]?.model, runs: records.length, ...agg }, null, 2));
  writeFileSync(path.join(values.out!, 'report.html'), renderHtml(agg, { model: records[0]?.model ?? '?', runs: records.length, generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', writeup, title: values.title! }));
  console.log(`${records.length} runs${agg.infraExcluded ? ` (${agg.infraExcluded} infra failures excluded)` : ''} -> ${values.out}/summary.json, ${values.out}/report.html`);
}
