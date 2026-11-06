import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const BOOL = { yes: true, no: false, true: true, false: false, on: true, off: false, 1: true, 0: false };

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const k = String(v).trim().toLowerCase();
  if (!(k in BOOL)) throw new Error(`bad debug value ${JSON.stringify(v)}`);
  return BOOL[k];
}
function toMs(v) {
  if (v === undefined || v === null) return 5000;
  if (typeof v === 'number') return Math.round(v * 1000);
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i);
  if (!m) throw new Error(`bad timeout ${JSON.stringify(v)}`);
  const n = Number(m[1]);
  const u = (m[2] || 's').toLowerCase();
  return Math.round(u === 'ms' ? n : u === 's' ? n * 1000 : n * 60000);
}
function toPort(v) {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n)) throw new Error(`bad port ${JSON.stringify(v)}`);
  return n;
}
function toHosts(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return arr.map((h) => String(h).trim()).filter(Boolean);
}

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir || 'configs');
  if (path.relative(ctx.projectDir, dir).startsWith('..')) throw new Error('dir outside project');
  let migrated = 0, skipped = 0;
  const errors = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const p = path.join(dir, f);
    try {
      const c = JSON.parse(readFileSync(p, 'utf8'));
      if (c.version === 2) { skipped++; continue; }
      const { name, port, debug, hosts, timeout, ...rest } = c;
      const out = {
        version: 2,
        service: { name, port: toPort(port) },
        debug: toBool(debug),
        hosts: toHosts(hosts),
        timeoutMs: toMs(timeout),
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
