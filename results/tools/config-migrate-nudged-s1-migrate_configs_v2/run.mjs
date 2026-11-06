import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const bool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['yes', 'true', 'on', '1'].includes(s)) return true;
  if (['no', 'false', 'off', '0'].includes(s)) return false;
  throw new Error(`bad debug value ${JSON.stringify(v)}`);
};

const timeout = (v) => {
  if (v === undefined || v === null) return 5000;
  if (typeof v === 'number') return Math.round(v * 1000);
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/);
  if (!m) throw new Error(`bad timeout ${JSON.stringify(v)}`);
  const mult = { ms: 1, s: 1000, m: 60000, undefined: 1000 }[m[2]];
  return Math.round(Number(m[1]) * mult);
};

const hosts = (v) => {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return arr.map((h) => String(h).trim()).filter(Boolean);
};

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir ?? 'configs');
  let migrated = 0, skipped = 0;
  const errors = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const p = path.join(dir, f);
    try {
      const o = JSON.parse(readFileSync(p, 'utf8'));
      if (o.version === 2) { skipped++; continue; }
      const { name, port, debug, hosts: h, timeout: t, ...rest } = o;
      const p2 = typeof port === 'number' ? port : parseInt(String(port).trim(), 10);
      if (!Number.isInteger(p2)) throw new Error(`bad port ${JSON.stringify(port)}`);
      const out = {
        version: 2,
        service: { name, port: p2 },
        debug: bool(debug),
        hosts: hosts(h),
        timeoutMs: timeout(t),
        ...rest,
      };
      writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
      migrated++;
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { migrated, skipped, errors };
}
