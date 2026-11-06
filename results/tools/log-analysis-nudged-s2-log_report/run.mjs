import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir ?? 'logs');
  const out = path.resolve(ctx.projectDir, input.out ?? 'report.json');
  const files = readdirSync(dir).filter((f) => /\.log$/.test(f)).sort();
  const report = {};
  for (const f of files) {
    const lats = [];
    const codes = new Map();
    let errors = 0;
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const kv = {};
      for (const tok of line.trim().split(/\s+/)) {
        const i = tok.indexOf('=');
        if (i > 0) kv[tok.slice(0, i)] = tok.slice(i + 1);
      }
      if (!kv.level || !/^\d+(\.\d+)?$/.test(kv.latency_ms ?? '')) continue;
      lats.push(Number(kv.latency_ms));
      if (kv.level === 'error') {
        errors++;
        if (kv.code) codes.set(kv.code, (codes.get(kv.code) ?? 0) + 1);
      }
    }
    let topCode = null;
    for (const [c, n] of [...codes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) { topCode = c; break; }
    lats.sort((a, b) => a - b);
    const p95 = lats.length ? lats[Math.ceil(0.95 * lats.length) - 1] : null;
    report[f] = { errors, topCode, p95 };
  }
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  return { files: files.length, out: path.relative(ctx.projectDir, out), sample: report[files[0]] };
}
