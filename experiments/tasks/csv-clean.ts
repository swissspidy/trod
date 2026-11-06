import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { TaskContext, Task } from '../lib/types.ts';
import { rng, write } from '../lib/util.ts';

const FIRST = ['ada', 'grace', 'alan', 'edsger', 'barbara', 'donald', 'margaret', 'ken', 'linus', 'radia'];
const LAST = ['lovelace', 'hopper', 'turing', 'dijkstra', 'liskov', 'knuth', 'hamilton', 'thompson', 'torvalds', 'perlman'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Step i: raw directory and file numbers. */
const BATCHES = [
  { dir: 'data/raw', files: [1, 2, 3, 4, 5, 6, 7, 8] },
  { dir: 'data/raw-2', files: [9, 10, 11, 12, 13, 14] },
  { dir: 'data/raw-3', files: [15, 16, 17, 18, 19, 20] },
];

const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1).toLowerCase();

/** Generates one raw file and its cleaned form. */
function file(n: number): { raw: string; clean: string } {
  const r = rng(202 + n * 31);
  const header = r.pick(['id,date,customer,amount', 'ID, Date , Customer,Amount', ' id,date,customer,amount ']);
  const clean = new Map<number, string | null>();
  const lines: string[] = [];
  const count = r.int(25, 45);
  for (let i = 0; i < count; i++) {
    if (lines.length && r.chance(0.1)) {
      lines.push(lines[r.int(0, lines.length - 1)]!); // exact duplicate
      continue;
    }
    let id = r.int(1000, 9999);
    while (clean.has(id)) id = r.int(1000, 9999);
    const m = r.int(1, 12);
    const d = r.int(1, 28);
    const iso = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateRaw = r.pick([iso, `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/2026`, `${MONTHS[m - 1]} ${d} 2026`]);
    const words = [r.pick(FIRST), r.pick(LAST)];
    const nameRaw = ' '.repeat(r.int(0, 2)) + words.map((w) => r.pick([w, w.toUpperCase(), cap(w)])).join(' '.repeat(r.int(1, 3))) + ' '.repeat(r.int(0, 3));
    const amount = r.int(100, 500000) / 100;
    const bad = r.chance(0.07);
    const amountRaw = bad ? r.pick(['', 'n/a', '-']) : r.pick([amount.toFixed(2), String(amount), `"$${amount.toLocaleString('en-US')}"`, `$${amount.toFixed(2)}`]);
    lines.push([String(id), dateRaw, nameRaw, amountRaw].join(','));
    clean.set(id, bad ? null : `${id},${iso},${words.map(cap).join(' ')},${amount.toFixed(2)}`);
  }
  const rows = [...clean.entries()]
    .filter((e): e is [number, string] => e[1] !== null)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
  return {
    raw: [header, ...lines].join(r.chance(0.3) ? '\r\n' : '\n') + '\n',
    clean: ['id,date,customer,amount', ...rows].join('\n') + '\n',
  };
}

function writeBatch({ work }: TaskContext, step: number) {
  for (const n of BATCHES[step]!.files) write(work, `${BATCHES[step]!.dir}/orders-${n}.csv`, file(n).raw);
}

const check = (step: number) => ({ work }: TaskContext) => {
  const bad: string[] = [];
  let ok = 0;
  const files = BATCHES[step]!.files;
  for (const n of files) {
    const want = file(n).clean;
    const p = path.join(work, 'data/clean', `orders-${n}.csv`);
    const got = existsSync(p) ? readFileSync(p, 'utf8') : undefined;
    if (got === want) ok++;
    else if (got === undefined) bad.push(`orders-${n}.csv: missing`);
    else {
      const gl = got.split('\n');
      const wl = want.split('\n');
      const i = wl.findIndex((l, j) => gl[j] !== l);
      bad.push(`orders-${n}.csv: line ${i + 1} got ${JSON.stringify(gl[i])} want ${JSON.stringify(wl[i])}`);
    }
  }
  return { pass: ok === files.length, score: ok / files.length, details: `${ok}/${files.length} files exact` + (bad.length ? `; ${bad.slice(0, 3).join('; ')}` : '') };
};

/** Clean messy CSV exports into one canonical format, in three batches. */
const task: Task = {
  id: 'csv-clean',
  title: 'Clean messy CSV exports (8, then 6, then 6 files)',
  kind: 'repetitive',
  repetitions: 8,
  setup: (ctx) => {
    writeBatch(ctx, 0);
    return null;
  },
  prepareStep: writeBatch,
  steps: [
    {
      prompt: () => `The directory data/raw/ contains 8 messy CSV exports of orders (orders-1.csv … orders-8.csv). For each file write a cleaned version with the same file name to data/clean/.

Cleaned format (exactly):
- header line: id,date,customer,amount
- id: integer; rows sorted by id ascending; when an id appears more than once keep only one row for it
- date: ISO YYYY-MM-DD. Raw dates come as YYYY-MM-DD, DD/MM/YYYY (day first) or "Mon D YYYY" (e.g. "Mar 4 2026")
- customer: trimmed, internal whitespace collapsed to one space, each word capitalized ("  ada   LOVELACE" -> "Ada Lovelace")
- amount: number with exactly two decimals, no currency symbol or thousands separator ("$1,234.5" -> 1234.50)
- rows whose amount is empty or not a number are dropped
- no quoting, Unix newlines, a trailing newline at the end of the file

Raw files are comma-separated, may use CRLF line endings, may quote fields, and may have a messy header line.
More exports will arrive later. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `A new batch of exports arrived in data/raw-2/ (orders-9.csv … orders-14.csv). Clean them the same way into data/clean/. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `The last batch arrived in data/raw-3/ (orders-15.csv … orders-20.csv). Clean them the same way into data/clean/. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
