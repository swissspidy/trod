import type { Task, TaskContext } from '../lib/types.ts';
import { fail, readJson, rng, scoreKeyed, write } from '../lib/util.ts';

const CODES = ['E100', 'E200', 'E301', 'E404', 'E500', 'E503'];
const PATHS = ['/api/a', '/api/b', '/login', '/search', '/cart'];
const DIRS = ['logs', 'logs-2', 'logs-3'];
const OUT = ['report.json', 'report-2.json', 'report-3.json'];

/** One batch of 20 log files and its expected report. */
function batch(step: number) {
  const r = rng(606 + step * 1000);
  const files: Record<string, string> = {};
  const expected: Record<string, unknown> = {};
  for (let f = 1; f <= 20; f++) {
    const name = `svc-${String(f).padStart(2, '0')}.log`;
    const lines: string[] = [];
    const lat: number[] = [];
    const codeCount = new Map<string, number>();
    let errors = 0;
    for (let i = 0, n = r.int(80, 200); i < n; i++) {
      if (r.chance(0.04)) {
        lines.push(r.pick(['', '###', `2026-11-01T10:${String(i % 60).padStart(2, '0')}:00Z level=info code=`, 'garbage line here', 'level=warn latency_ms=abc']));
        continue;
      }
      const level = r.pick(['info', 'info', 'info', 'warn', 'error']);
      const code = r.pick(CODES);
      const ms = r.int(3, 2500);
      lat.push(ms);
      if (level === 'error') {
        errors++;
        codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
      }
      const ts = `2026-11-0${step + 1}T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`;
      lines.push(`${ts} level=${level} code=${code} latency_ms=${ms} path=${r.pick(PATHS)}`);
    }
    files[name] = lines.join('\n') + '\n';
    lat.sort((a, b) => a - b);
    const top = [...codeCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    expected[name] = { errors, topCode: top, p95: lat[Math.ceil(0.95 * lat.length) - 1] };
  }
  return { files, expected };
}

function writeBatch({ work }: TaskContext, step: number) {
  for (const [name, content] of Object.entries(batch(step).files)) write(work, `${DIRS[step]}/${name}`, content);
}

const check = (i: number) => ({ work }: TaskContext, expected: Record<string, unknown>[]) => {
  const got = readJson(work, OUT[i]!);
  if (!got.ok) return fail(got.error);
  return scoreKeyed(expected[i]!, got.value);
};

/** Summarize 20 service logs into per-file error stats, for three days of logs. */
const task: Task = {
  id: 'log-analysis',
  title: 'Summarize 20 service log files, 3 days',
  kind: 'repetitive',
  repetitions: 20,
  setup: (ctx) => {
    writeBatch(ctx, 0);
    return [0, 1, 2].map((s) => batch(s).expected);
  },
  prepareStep: writeBatch,
  steps: [
    {
      prompt: () => `logs/ contains 20 service logs (svc-01.log … svc-20.log). Each line looks like:

    2026-11-01T10:00:00Z level=error code=E404 latency_ms=123 path=/api/a

Some lines are malformed (truncated or garbage); ignore any line that does not have a parseable level= and a numeric latency_ms= field.

For each file compute:
- "errors": number of valid lines with level=error
- "topCode": the most frequent code= among error lines (ties broken by the alphabetically smallest code; null if there are no errors)
- "p95": the 95th percentile of latency_ms over all valid lines, using the nearest-rank method (sort ascending, take the value at rank ceil(0.95 * n), 1-based)

Write report.json: an object keyed by file name ("svc-01.log") with {"errors","topCode","p95"}.
New logs arrive daily and will need the same report. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `Today's logs are in logs-2/ (same 20 file names). Produce the same report for them as report-2.json. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `And the next day's logs are in logs-3/. Same report, written to report-3.json. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
