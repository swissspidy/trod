/**
 * Offline calibration of the Zorbit environment: no model, no cost.
 *
 *   ZORBIT_SEED=<seed> node experiments/private/calibrate.ts [--json out.json]
 *
 * For every task, the scripted client (solver.ts) answers once knowing every quirk (must equal the expected answer)
 * and once per silent quirk with that one quirk unknown. Prints which quirks change each task's answer, and how many
 * tasks each quirk affects. Throttling (Q7) depends on timing and is checked separately in the test; it is switched
 * off here so the run is fast.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { handler, questions, world } from './zorbit.ts';
import { SILENT, solve, type Quirk } from './solver.ts';

export interface Calibration {
  tasks: { id: string; split: string; correct: boolean; sensitive: Quirk[] }[];
  perQuirk: Record<string, { train: number; test: number }>;
}

export async function calibrate(): Promise<Calibration> {
  const w = world();
  const throttle = w.params.throttle;
  w.params.throttle = 1e9;
  const server = createServer(handler(w));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  try {
    const tasks: Calibration['tasks'] = [];
    for (const q of questions()) {
      const ref = await solve(q, base);
      const sensitive: Quirk[] = [];
      for (const k of SILENT) if (!same(await solve(q, base, [k]), q.answer)) sensitive.push(k);
      tasks.push({ id: q.id, split: q.split, correct: same(ref, q.answer), sensitive });
    }
    const perQuirk: Calibration['perQuirk'] = Object.fromEntries(SILENT.map((k) => [k, { train: 0, test: 0 }]));
    for (const t of tasks) for (const k of t.sensitive) perQuirk[k]![t.split as 'train' | 'test']++;
    return { tasks, perQuirk };
  } finally {
    server.close();
    w.params.throttle = throttle;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = await calibrate();
  for (const t of c.tasks) console.log(`${t.correct ? 'ok ' : 'BAD'} ${t.split.padEnd(5)} ${t.id.padEnd(18)} ${t.sensitive.join(' ') || '(no silent quirk changes the answer)'}`);
  console.log('\ntasks whose answer each quirk changes (train / test):');
  for (const [k, v] of Object.entries(c.perQuirk)) console.log(`  ${k.padEnd(4)} ${v.train} / ${v.test}`);
  const i = process.argv.indexOf('--json');
  if (i > 0) writeFileSync(process.argv[i + 1]!, JSON.stringify(c, null, 2));
}
