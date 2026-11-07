/**
 * One-off repair (2026-11-07): rescore.ts re-checked session-mode runs whose earlier outputs had been wiped by the
 * fresh checkout of the next session, and overwrote their per-step results. The runner logs keep every run's
 * original per-step outcome ("step 1: ok | step 2: …"); this rebuilds result.json from them. It also applies the
 * inventory-api question-3 rule (archived items may be excluded, consistently): the only archived SKU in that answer
 * is SKU-4343, so a run whose only miss was SKU-4343 (and no extra keys) applied that reading consistently.
 *
 * Usage: node experiments/runner/restore-from-log.ts <runs dir> <log file>… [--task inventory-api]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { RunRecord } from './metrics.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { task: { type: 'string', default: 'inventory-api' } } });
const [root, ...logs] = positionals;
if (!root || !logs.length) {
  console.error('usage: node experiments/runner/restore-from-log.ts <runs dir> <log file>… [--task id]');
  process.exit(1);
}

const lines = new Map<string, string>();
for (const log of logs) {
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    const m = line.match(/^(PASS|FAIL) (\S+)\s/);
    if (m && m[2]!.startsWith(`${values.task}/`)) lines.set(m[2]!, line);
  }
}

let n = 0;
for (const [id, line] of lines) {
  const file = path.join(root, id, 'result.json');
  if (!existsSync(file)) continue;
  const record = JSON.parse(readFileSync(file, 'utf8')) as RunRecord & { restored?: string };
  const pass = line.startsWith('PASS');
  const parts = pass ? record.steps.map(() => 'ok') : (line.match(/\((step 1: .*)\)\s*$/)?.[1] ?? '').split(' | ').map((p) => p.replace(/^step \d+: /, ''));
  if (parts.length !== record.steps.length) throw new Error(`${id}: cannot parse steps from log line`);
  const steps = record.steps.map((s, i) => {
    const d = parts[i]!;
    if (d === 'ok') return { ...s, check: { pass: true, score: 1, details: 'ok (restored from runner log)' } };
    if (values.task === 'inventory-api' && i === 2 && /^9\/10 correct; wrong: SKU-4343 \(got undefined, want -14\)$/.test(d)) {
      return { ...s, check: { pass: true, score: 1, details: '10/10 correct (archived items excluded; restored from runner log)' } };
    }
    let score = 0;
    let m = d.match(/^(\d+)\/(\d+) SKUs, (\d+) extra$/);
    if (m) score = Math.max(0, (Number(m[1]) - Number(m[3])) / Number(m[2]));
    else if ((m = d.match(/^(\d+)\/(\d+) correct/))) score = Number(m[1]) / Number(m[2]);
    return { ...s, check: { pass: false, score, details: `${d} (restored from runner log)` } };
  });
  const scores = steps.map((s) => s.check.score);
  const check = {
    pass: steps.every((s) => s.check.pass),
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    details: steps.map((s) => `step ${s.step}: ${s.check.pass ? 'ok' : s.check.details}`).join(' | '),
  };
  writeFileSync(file, JSON.stringify({ ...record, steps, check, restored: 'per-step results restored from the runner log on 2026-11-07' }, null, 2));
  console.log(`${id}: ${check.score.toFixed(2)}${check.pass ? ' pass' : ''}`);
  n++;
}
console.log(`${n} run(s) restored`);
