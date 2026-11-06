import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir ?? 'logs');
  const out = path.resolve(ctx.projectDir, input.out ?? 'report.json');
  const files = readdirSync(dir).filter((f) => /\.log$/.test(f)).sort();
  const report = {};
  for (const f of files) {
    const lat = [];
    let errors = 0;
    const codes = new Map();
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const kv = {};
      for (const tok of line.trim().split(/\s+/)) {
        const i = tok.indexOf('=');
        if (i > 0 && !(tok.slice(0, i) in kv)) kv[tok.slice(0, i)] = tok.slice(i + 1);
      }
      const level = kv.level;
      const l = kv.latency_ms;
      if (!level || l === undefined || !/^\d+(\.\d+)?$/.test(l)) continue;
      lat.push(Number(l));
      if (level === 'error') {
        errors++;
        if (kv.code) codes.set(kv.code, (codes.get(kv.code) ?? 0) + 1);
      }
    }
    let topCode = null;
    let best = 0;
    for (const [c, n] of codes) {
      if (n > best || (n === best && c < topCode)) { best = n; topCode = c; }
    }
    lat.sort((a, b) => a - b);
    const p95 = lat.length ? lat[Math.ceil(0.95 * lat.length) - 1] : null;
    report[f] = { errors, topCode, p95 };
  }
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  return report;
}
