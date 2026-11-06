import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const bool = (v) => {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  const s = String(v).trim().toLowerCase();
  if (['yes', 'true', 'on', '1'].includes(s)) return true;
  if (['no', 'false', 'off', '0'].includes(s)) return false;
  throw new Error(`bad debug: ${JSON.stringify(v)}`);
};
const ms = (v) => {
  if (v === undefined || v === null) return 5000;
  if (typeof v === 'number') return Math.round(v * 1000);
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i);
  if (!m) throw new Error(`bad timeout: ${JSON.stringify(v)}`);
  const mult = { ms: 1, s: 1000, m: 60000 }[(m[2] || 's').toLowerCase()];
  return Math.round(Number(m[1]) * mult);
};
const hosts = (v) => {
  const a = Array.isArray(v) ? v : v == null ? [] : String(v).split(',');
  return a.map((h) => String(h).trim()).filter(Boolean);
};

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir ?? 'configs');
  let migrated = 0, skipped = 0;
  const errors = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const p = path.join(dir, f);
      const c = JSON.parse(readFileSync(p, 'utf8'));
      if (c.version === 2) { skipped++; continue; }
      const { name, port, debug, hosts: h, timeout, ...rest } = c;
      const out = {
        version: 2,
        service: { name, port: parseInt(port, 10) },
        debug: bool(debug),
        hosts: hosts(h),
        timeoutMs: ms(timeout),
        ...rest,
      };
      if (!Number.isInteger(out.service.port)) throw new Error('bad port');
      writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
      migrated++;
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { migrated, skipped, errors };
}
