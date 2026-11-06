import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n) => String(n).padStart(2, '0');

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function parseDate(s) {
  s = s.trim();
  let m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [m[1], m[2], m[3]];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [d, mo, y] = [m[1], m[2], m[3]];
  else if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/)) && MONTHS[m[1].toLowerCase()]) [mo, d, y] = [MONTHS[m[1].toLowerCase()], m[2], m[3]];
  else return null;
  return `${y}-${p2(+mo)}-${p2(+d)}`;
}

function parseAmount(s) {
  s = s.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)) return null;
  return Number(s).toFixed(2);
}

const cap = (s) => s.trim().split(/\s+/).filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export default async function run(input, ctx) {
  const rawDir = path.resolve(ctx.projectDir, input.dir ?? 'data/raw');
  const outDir = path.resolve(ctx.projectDir, 'data/clean');
  mkdirSync(outDir, { recursive: true });
  const files = input.files?.length ? input.files : readdirSync(rawDir).filter((f) => f.endsWith('.csv')).sort();
  const report = {};
  for (const f of files) {
    const rows = parseCsv(readFileSync(path.join(rawDir, path.basename(f)), 'utf8').replace(/^﻿/, ''));
    const head = rows.shift().map((h) => h.trim().toLowerCase());
    const ix = Object.fromEntries(['id', 'date', 'customer', 'amount'].map((k) => [k, head.indexOf(k)]));
    const byId = new Map();
    let dropped = 0, dups = 0;
    for (const r of rows) {
      const id = /^\s*\d+\s*$/.test(r[ix.id] ?? '') ? parseInt(r[ix.id], 10) : null;
      const date = parseDate(r[ix.date] ?? '');
      const amount = parseAmount(r[ix.amount] ?? '');
      if (id === null || amount === null || date === null) { dropped++; continue; }
      if (byId.has(id)) { dups++; continue; }
      byId.set(id, `${id},${date},${cap(r[ix.customer] ?? '')},${amount}`);
    }
    const lines = [...byId.keys()].sort((a, b) => a - b).map((k) => byId.get(k));
    writeFileSync(path.join(outDir, path.basename(f)), 'id,date,customer,amount\n' + lines.map((l) => l + '\n').join(''));
    report[f] = { in: rows.length, out: lines.length, dropped, duplicates: dups };
  }
  return report;
}
