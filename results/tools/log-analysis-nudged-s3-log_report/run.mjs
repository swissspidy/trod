import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir ?? 'logs');
  const out = path.resolve(ctx.projectDir, input.out ?? 'report.json');
  const report = {};
  const files = readdirSync(dir).filter((f) => f.endsWith('.log')).sort();
  for (const f of files) {
    let errors = 0;
    const codes = new Map();
    const lat = [];
    for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const toks = new Map();
      for (const t of line.trim().split(/\s+/)) {
        const i = t.indexOf('=');
        if (i > 0 && !toks.has(t.slice(0, i))) toks.set(t.slice(0, i), t.slice(i + 1));
      }
      const level = toks.get('level');
      const l = toks.get('latency_ms');
      if (!level || l === undefined || !/^\d+(\.\d+)?$/.test(l)) continue;
      lat.push(Number(l));
      if (level === 'error') {
        errors++;
        const c = toks.get('code');
        if (c) codes.set(c, (codes.get(c) ?? 0) + 1);
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
  return { files: files.length, report };
}
