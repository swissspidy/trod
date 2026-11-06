import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false, any = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') { q = true; any = true; }
    else if (c === ',') { row.push(f); f = ''; any = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (any || f !== '') { row.push(f); rows.push(row); }
      row = []; f = ''; any = false;
    } else { f += c; any = true; }
  }
  if (any || f !== '') { row.push(f); rows.push(row); }
  return rows;
}

const pad = (n) => String(n).padStart(2, '0');
function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function parseDate(s) {
  s = s.trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return fmt(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return fmt(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/)) && MON[m[1].toLowerCase()]) return fmt(+m[3], MON[m[1].toLowerCase()], +m[2]);
  return null;
}
function fmt(y, mo, d) { return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null; }

export default async function run(input, ctx) {
  const raw = path.resolve(ctx.projectDir, input.rawDir || 'data/raw');
  const out = path.resolve(ctx.projectDir, input.cleanDir || 'data/clean');
  mkdirSync(out, { recursive: true });
  const report = [];
  for (const file of readdirSync(raw).filter((f) => f.endsWith('.csv')).sort()) {
    let text = readFileSync(path.join(raw, file), 'utf8').replace(/^﻿/, '');
    const rows = parseCsv(text);
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const idx = (n, d) => (head.indexOf(n) >= 0 ? head.indexOf(n) : d);
    const ci = { id: idx('id', 0), date: idx('date', 1), customer: idx('customer', 2), amount: idx('amount', 3) };
    const byId = new Map();
    const stats = { in: rows.length, dupes: 0, badAmount: 0, badOther: 0 };
    for (const r of rows) {
      const idRaw = (r[ci.id] || '').trim();
      if (!/^\d+$/.test(idRaw)) { stats.badOther++; continue; }
      const id = parseInt(idRaw, 10);
      const amtRaw = (r[ci.amount] || '').trim().replace(/[$,\s]/g, '');
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(amtRaw)) { stats.badAmount++; continue; }
      const date = parseDate(r[ci.date] || '');
      if (!date) { stats.badOther++; continue; }
      if (byId.has(id)) { stats.dupes++; continue; }
      const cust = (r[ci.customer] || '').trim().split(/\s+/).filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      byId.set(id, `${id},${date},${cust},${Number(amtRaw).toFixed(2)}`);
    }
    const lines = [...byId.keys()].sort((a, b) => a - b).map((k) => byId.get(k));
    writeFileSync(path.join(out, file), ['id,date,customer,amount', ...lines].join('\n') + '\n');
    report.push({ file, ...stats, out: lines.length });
  }
  return report;
}
