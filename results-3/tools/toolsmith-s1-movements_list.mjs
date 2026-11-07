import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.INVENTORY_URL || 'http://127.0.0.1:38991';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token(ctx) {
  if (process.env.INVENTORY_TOKEN) return process.env.INVENTORY_TOKEN.trim();
  const dirs = [ctx?.cwd, process.cwd(), resolve(process.cwd(), '..')].filter(Boolean);
  for (const d of dirs) {
    try { return readFileSync(resolve(d, '.secrets/inventory.token'), 'utf8').trim(); } catch {}
  }
  throw new Error('inventory token not found (.secrets/inventory.token)');
}

async function api(path, ctx, tries = 12) {
  let wait = 500;
  for (let i = 0; i < tries; i++) {
    let res;
    try { res = await fetch(BASE + path, { headers: { 'X-Api-Token': token(ctx), accept: 'application/json' } }); }
    catch (e) { await sleep(wait); wait = Math.min(wait * 2, 8000); continue; }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? ra * 1000 : wait);
      wait = Math.min(wait * 2, 8000);
      continue;
    }
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) { const e = new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 200)}`); e.status = res.status; throw e; }
    return body;
  }
  throw new Error('gave up after retries (rate limited): ' + path);
}

async function pageAll(path, ctx, maxPages = 1000) {
  const out = []; let next = path;
  for (let p = 0; next && p < maxPages; p++) {
    const b = await api(next, ctx);
    out.push(...(b.results || []));
    next = b.links?.next || null;
  }
  return out;
}

// "€1.576,28" -> 1576.28 ; "1,234.56" -> 1234.56 ; "230 pcs" -> 230 ; unicode minus ok
function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[−‒–—]/g, '-').replace(/[^\d.,+\-]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  } else if (lc >= 0) {
    s = /,\d{3}$/.test(s) && (s.match(/,/g) || []).length >= 1 && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ld >= 0) {
    // dots only: thousands separators if groups of 3 (e.g. 11.406, 1.234.567)
    if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const iso = (t) => (t == null ? null : new Date(t * 1000).toISOString());

export const meta = {
  description: 'Fetch stock movements (auto-paginated, auth + 429 backoff handled) for a list of SKUs (or ALL items if skus omitted) as normalized records {sku,id,change(signed integer; unicode minus handled),at(epoch s),at_iso,by}. Optional since/until (epoch s) filter; returns per-sku net change and overall net. Duplicate movement ids are dropped.',
  whenToUse: 'Net stock movements over a period, movement history per item/warehouse. Pass warehouse to restrict to one warehouse\'s items; excludeArchived to skip archived items.',
  inputSchema: {
    type: 'object',
    properties: {
      skus: { type: 'array', items: { type: 'string' }, description: 'SKUs; omit for all (one request series per item, slower)' },
      warehouse: { type: 'string', description: 'when skus omitted, only items of this warehouse' },
      excludeArchived: { type: 'boolean' },
      since: { type: 'number', description: 'epoch seconds, inclusive (also sent to server)' },
      until: { type: 'number', description: 'epoch seconds, exclusive, client side' },
      records: { type: 'boolean', description: 'include movement records (default true)' },
    },
  },
  examples: [{ input: { skus: ['SKU-4000'] } }, { input: { skus: ['SKU-4000'], since: 1791800000, records: false } }],
};

export default async (input = {}, ctx) => {
  let skus = input.skus;
  const meta = {};
  if (!skus) {
    const q = input.warehouse ? '?warehouse=' + encodeURIComponent(input.warehouse) : '';
    const items = await pageAll('/api/v2/items' + q, ctx);
    const f = items.filter((i) => !(input.excludeArchived && i.archived));
    skus = [...new Set(f.map((i) => i.sku))];
    for (const i of f) meta[i.sku] = i.warehouse?.code;
  }
  const out = [];
  const queue = [...skus];
  const worker = async () => {
    while (queue.length) {
      const sku = queue.shift();
      const q = input.since != null ? '?since=' + input.since : '';
      let rows;
      try { rows = await pageAll(`/api/v2/items/${encodeURIComponent(sku)}/movements${q}`, ctx); }
      catch (e) { if (e.status === 404) { out.push({ sku, error: 'not found' }); continue; } throw e; }
      const seen = new Set();
      for (const m of rows) {
        if (seen.has(m.id)) continue; seen.add(m.id);
        const at = typeof m.at === 'number' ? m.at : Number(m.at);
        if (input.since != null && at < input.since) continue;
        if (input.until != null && at >= input.until) continue;
        out.push({ sku, id: m.id, change: parseNum(m.change), at, at_iso: iso(at), by: m.by, warehouse: meta[sku] });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const per = {}; let net = 0, n = 0;
  for (const m of out) { if (m.error) continue; per[m.sku] = (per[m.sku] || 0) + (m.change || 0); net += m.change || 0; n++; }
  const errors = out.filter((m) => m.error);
  return { count: n, net_change: net, net_by_sku: per, ...(errors.length ? { errors } : {}), ...(input.records === false ? {} : { movements: out.filter((m) => !m.error) }) };
};
// trod: promoted 2026-11-07T03:41:51.112Z
