import { execFileSync } from 'node:child_process';
import type { Task } from '../lib/types.ts';
import { write } from '../lib/util.ts';

/** Control: a one-off bug fix. Nothing repeats, so building a tool should not pay off. */
const task: Task = {
  id: 'control-bugfix',
  title: 'Control: fix one bug in a stats module',
  kind: 'control',
  repetitions: 1,
  setup: ({ work }) => {
    write(
      work,
      'src/stats.mjs',
      `export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  const sorted = values.sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted[mid];
}
`,
    );
    write(
      work,
      'test.mjs',
      `import assert from 'node:assert/strict';
import { median } from './src/stats.mjs';
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([5]), 5);
console.log('ok');
`,
    );
    return null;
  },
  steps: [
    {
      prompt: () => `src/stats.mjs exports median(values). It returns wrong results for some inputs. Fix the bug so that median works for any non-empty array of numbers (without mutating the input). \`node test.mjs\` runs a few checks. When finished, reply DONE.`,
      check: ({ work }) => {
        const probe = `
    import { median } from './src/stats.mjs';
    const cases = [[[3,1,2],2],[[4,1,3,2],2.5],[[10,9,100,1],9.5],[[5],5],[[-1,-5,3],-1],[[1.5,2.5],2]];
    let ok = 0;
    for (const [input, want] of cases) { const copy = [...input]; if (median(copy) === want && copy.join() === input.join()) ok++; }
    console.log(ok + '/' + cases.length);
    `;
        try {
          const out = execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: work, encoding: 'utf8', timeout: 10_000 }).trim();
          const [ok, n] = out.split('/').map(Number);
          return { pass: ok === n, score: ok! / n!, details: `${out} hidden cases pass` };
        } catch (err) {
          return { pass: false, score: 0, details: (err as Error).message.slice(0, 200) };
        }
      },
    },
  ],
};
export default task;
