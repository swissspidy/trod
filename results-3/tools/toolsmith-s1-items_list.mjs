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
  description: 'Fetch ALL inventory items (auto-paginated, auth + 429 backoff handled) as clean normalized records: {sku,name,warehouse,quantity(number),unit,unit_cost(EUR number),previous_unit_cost,price_change,price_change_pct,stock_value(quantity*unit_cost),reorder_point,below_reorder,archived,active,updated(epoch s),updated_iso,revision}. Parses European money ("€1.576,28"->1576.28) and quantities ("11.406 pcs"->11406). Optional server-side filters warehouse/updated_since plus client filters. Returns also per-warehouse summary (count, stock_value over active items). Note: "active" = not archived.',
  whenToUse: 'First call for any question on items: stock value per warehouse, below reorder point, price changes (unit_cost vs previous_unit_cost), counts, listing active items. Use movements_list for stock movements.',
  inputSchema: {
    type: 'object',
    properties: {
      warehouse: { type: 'string', description: 'Warehouse code (AMS,BER,LIS,OSL); server filter' },
      updated_since: { type: 'number', description: 'epoch seconds; server filter' },
      activeOnly: { type: 'boolean', description: 'drop archived items' },
      belowReorderOnly: { type: 'boolean', description: 'only items with quantity < reorder_point' },
      priceChangedOnly: { type: 'boolean' },
      records: { type: 'boolean', description: 'include the records array (default true); set false for summary only' },
    },
  },
  examples: [
    { input: { activeOnly: true, records: false } },
    { input: { warehouse: 'AMS', belowReorderOnly: true, activeOnly: true } },
  ],
};

export default async (input = {}, ctx) => {
  const q = new URLSearchParams();
  if (input.warehouse) q.set('warehouse', input.warehouse);
  if (input.updated_since != null) q.set('updated_since', String(input.updated_since));
  const raw = await pageAll('/api/v2/items' + (q.toString() ? '?' + q : ''), ctx);
  const seen = new Map();
  for (const r of raw) seen.set(r.sku, r); // dedupe on sku (later wins)
  let recs = [...seen.values()].map((r) => {
    const quantity = parseNum(r.quantity);
    const unit_cost = parseNum(r.unit_cost);
    const prev = parseNum(r.previous_unit_cost);
    const archived = r.archived === true || r.archived === 'true' || /archiv/i.test(String(r.status ?? ''));
    const chg = unit_cost != null && prev != null ? Math.round((unit_cost - prev) * 100) / 100 : null;
    return {
      sku: r.sku, name: r.name,
      warehouse: r.warehouse?.code ?? r.warehouse,
      quantity, unit: String(r.quantity ?? '').replace(/[\d.,\s+\-−]/g, '') || null,
      unit_cost, previous_unit_cost: prev,
      price_change: chg, price_change_pct: chg != null && prev ? Math.round((chg / prev) * 10000) / 100 : null,
      stock_value: quantity != null && unit_cost != null ? Math.round(quantity * unit_cost * 100) / 100 : null,
      reorder_point: parseNum(r.reorder_point),
      below_reorder: quantity != null && r.reorder_point != null ? quantity < parseNum(r.reorder_point) : null,
      archived, active: !archived,
      updated: r.updated, updated_iso: iso(r.updated),
      revision: r._meta?.revision ?? null,
    };
  });
  if (input.activeOnly) recs = recs.filter((r) => r.active);
  if (input.belowReorderOnly) recs = recs.filter((r) => r.below_reorder);
  if (input.priceChangedOnly) recs = recs.filter((r) => r.price_change);
  const by = {};
  for (const r of recs) {
    const w = (by[r.warehouse] ||= { count: 0, active_count: 0, active_stock_value: 0, all_stock_value: 0 });
    w.count++; w.all_stock_value += r.stock_value || 0;
    if (r.active) { w.active_count++; w.active_stock_value += r.stock_value || 0; }
  }
  for (const w of Object.values(by)) { w.active_stock_value = Math.round(w.active_stock_value * 100) / 100; w.all_stock_value = Math.round(w.all_stock_value * 100) / 100; }
  return { total: recs.length, raw_fetched: raw.length, by_warehouse: by, ...(input.records === false ? {} : { records: recs }) };
};
// trod: promoted 2026-11-07T03:41:47.687Z
