import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const MON = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function parse(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const p2 = n => String(n).padStart(2, '0');
function date(s) {
  s = s.trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/)) && MON.includes(m[1].toLowerCase()))
    return `${m[3]}-${p2(MON.indexOf(m[1].toLowerCase()) + 1)}-${p2(m[2])}`;
  return null;
}
export default async function run(input, ctx) {
  const inDir = path.resolve(ctx.projectDir, input.inDir || 'data/raw');
  const outDir = path.resolve(ctx.projectDir, input.outDir || 'data/clean');
  mkdirSync(outDir, { recursive: true });
  const files = input.files || readdirSync(inDir).filter(f => f.endsWith('.csv')).sort();
  const report = [];
  for (const file of files) {
    const rows = parse(readFileSync(path.join(inDir, file), 'utf8').replace(/^﻿/, ''));
    const h = rows.shift().map(x => x.trim().toLowerCase());
    const ix = k => h.indexOf(k);
    const [ii, di, ci, ai] = ['id', 'date', 'customer', 'amount'].map(ix);
    const byId = new Map(); const st = { in: rows.length, badAmount: 0, badOther: 0, dup: 0 };
    for (const r of rows) {
      const raw = (r[ai] ?? '').trim().replace(/^[^\d.+-]+/, '').replace(/,/g, '');
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) { st.badAmount++; continue; }
      const id = (r[ii] ?? '').trim(); const d = date(r[di] ?? '');
      if (!/^\d+$/.test(id) || !d) { st.badOther++; continue; }
      if (byId.has(+id)) { st.dup++; continue; }
      const cust = (r[ci] ?? '').trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      byId.set(+id, `${+id},${d},${cust},${Number(raw).toFixed(2)}`);
    }
    const out = [...byId.keys()].sort((a, b) => a - b).map(k => byId.get(k));
    writeFileSync(path.join(outDir, file), ['id,date,customer,amount', ...out].join('\n') + '\n');
    report.push({ file, ...st, out: out.length });
  }
  return report;
}
