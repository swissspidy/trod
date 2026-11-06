import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Task } from '../lib/types.ts';
import { rng, write } from '../lib/util.ts';

/** Control: one question about one file. */
const task: Task = {
  id: 'control-question',
  title: 'Control: answer one question about a CSV',
  kind: 'control',
  repetitions: 1,
  setup: ({ work }) => {
    const r = rng(909);
    const reps = ['Ana', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'];
    const totals = new Map<string, number>();
    const lines = ['region,rep,amount'];
    for (let i = 0; i < 120; i++) {
      const rep = r.pick(reps);
      const amt = r.int(10, 900);
      totals.set(rep, (totals.get(rep) ?? 0) + amt);
      lines.push(`${r.pick(['north', 'south', 'east', 'west'])},${rep},${amt}`);
    }
    write(work, 'sales.csv', lines.join('\n') + '\n');
    return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  },
  steps: [
    {
      prompt: () => `sales.csv lists sales (region,rep,amount). Which rep has the highest total amount across all regions? Write just the rep's name to answer.txt. When finished, reply DONE.`,
      check: ({ work }, expected: string) => {
        const p = path.join(work, 'answer.txt');
        const got = existsSync(p) ? readFileSync(p, 'utf8').trim() : '';
        return { pass: got === expected, score: got === expected ? 1 : 0, details: `got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}` };
      },
    },
  ],
};
export default task;
