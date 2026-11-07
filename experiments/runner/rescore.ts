/**
 * Re-runs the checkers on finished runs, for example after fixing a fixture's ground truth, and updates each
 * result.json. Steps whose output files no longer exist (session mode) keep their original result. Usage: node experiments/runner/rescore.ts results/runs/<name> [--tasks a,b]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { TASKS } from '../tasks/index.ts';
import type { RunRecord } from './metrics.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { tasks: { type: 'string' } } });
const root = positionals[0];
if (!root || !existsSync(root)) {
  console.error('usage: node experiments/runner/rescore.ts results/runs/<name> [--tasks a,b]');
  process.exit(1);
}
const only = values.tasks?.split(',');
let changed = 0;
for (const task of TASKS) {
  if (only && !only.includes(task.id)) continue;
  const dir = path.join(root, task.id);
  if (!existsSync(dir)) continue;
  for (const run of readdirSync(dir)) {
    const file = path.join(dir, run, 'result.json');
    if (!existsSync(file)) continue;
    const record = JSON.parse(readFileSync(file, 'utf8')) as RunRecord;
    const expected = JSON.parse(readFileSync(path.join(dir, run, 'expected.json'), 'utf8'));
    const work = path.join(dir, run, 'work');
    // Session mode wipes earlier sessions' outputs (fresh checkouts), so a step whose output is gone keeps its original
    // result instead of turning into a failure.
    const steps = record.steps.map((s, i) => {
      const check = task.steps[i]!.check({ work }, expected);
      const gone = !check.pass && /missing|does not exist|ENOENT/.test(check.details);
      return gone ? s : { ...s, check };
    });
    const scores = task.steps.map((_, i) => steps[i]?.check.score ?? 0);
    const check = {
      pass: steps.length === task.steps.length && steps.every((s) => s.check.pass),
      score: scores.reduce((a, b) => a + b, 0) / scores.length,
      details: steps.map((s) => `step ${s.step}: ${s.check.pass ? 'ok' : s.check.details}`).join(' | '),
    };
    if (JSON.stringify(check) !== JSON.stringify(record.check)) {
      changed++;
      console.log(`${task.id}/${run}: score ${record.check.score.toFixed(2)} -> ${check.score.toFixed(2)}`);
    }
    writeFileSync(file, JSON.stringify({ ...record, steps, check }, null, 2));
  }
}
console.log(`${changed} run(s) changed`);
