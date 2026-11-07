import fs from 'node:fs';
import path from 'node:path';

// ---- shared client (duplicated in each inventory_* tool) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lim = (globalThis.__inventoryLimiter ??= { next: 0 });
async function slot() {
  // server allows a burst of ~4 then ~4 req/s; space calls 270 ms apart, shared across concurrent tool calls
  const now = Date.now();
  const at = Math.max(now, lim.next);
  lim.next = at + 270;
  if (at > now) await sleep(at - now);
}
function client(ctx) {
  const dir = ctx?.projectDir || process.cwd();
  const base = fs.readFileSync(path.join(dir, '.service/base-url'), 'utf8').trim().replace(/\/+$/, '');
  const token = fs.readFileSync(path.join(dir, '.secrets/inventory.token'), 'utf8').trim();
  async function get(url) {
    for (let attempt = 0; ; attempt++) {
      await slot();
      const res = await fetch(url.startsWith('http') ? url : base + url, { headers: { 'X-Api-Token': token, Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= 12) throw new Error(`HTTP ${res.status} after retries: ${url}`);
        await sleep(Math.min(8000, 500 * 2 ** Math.min(attempt, 4)) + Math.random() * 300);
        continue;
      }
      const body = await res.json().catch(() => null);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body)}: ${url}`);
      return body;
    }
  }
  async function getAll(url) {
    const out = [];
    while (url) {
      const j = await get(url);
      if (!j) break;
      out.push(...(j.results || []));
      url = j.links?.next || null;
    }
    return out;
  }
  return { get, getAll };
}
// German-format numbers: "11.406 pcs" -> 11406, "€1.576,28" -> 1576.28, "−7" (unicode minus) -> -7
function deNum(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  let t = String(s).replace(/[−–]/g, '-').replace(/[€\s ]/g, '').replace(/[a-zA-Z]+\.?$/, '');
  t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const berlinDate = (sec) => new Date(sec * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
// "2026-10-01" (Europe/Berlin midnight), ISO datetime, or epoch seconds -> epoch seconds
function toEpoch(v, endOfDay = false) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) { const n = Number(v); return n > 1e11 ? Math.floor(n / 1000) : n; }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d + (endOfDay ? 1 : 0));
    // offset of Europe/Berlin at that instant
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
    const g = Object.fromEntries(p.map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute);
    return Math.floor((guess - (asUtc - guess)) / 1000) - (endOfDay ? 1 : 0);
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error(`Bad date: ${s}`);
  return Math.floor(t / 1000);
}
function normItem(i) {
  const qtyStr = String(i.quantity ?? '');
  const quantity = deNum(qtyStr);
  const unit = (qtyStr.match(/[a-zA-Z]+\.?$/) || [null])[0];
  const unit_cost = deNum(i.unit_cost);
  const prev = deNum(i.previous_unit_cost);
  const archived = i.archived === true || String(i.status || '').toLowerCase() === 'archived';
  const change = unit_cost != null && prev != null ? r2(unit_cost - prev) : null;
  return {
    sku: i.sku,
    name: i.name,
    warehouse: i.warehouse?.code ?? i.warehouse ?? null,
    warehouse_label: i.warehouse?.label ?? null,
    quantity,
    unit,
    unit_cost_eur: unit_cost,
    previous_unit_cost_eur: prev,
    price_change_eur: change,
    price_change_pct: change != null && prev ? r2((change / prev) * 100) : null,
    price_changed: change != null && change !== 0,
    stock_value_eur: quantity != null && unit_cost != null ? r2(quantity * unit_cost) : null,
    reorder_point: deNum(i.reorder_point),
    below_reorder_point: quantity != null && i.reorder_point != null ? quantity < deNum(i.reorder_point) : null,
    archived,
    active: !archived,
    updated_at: i.updated != null ? new Date(toEpoch(i.updated) * 1000).toISOString() : null,
    updated_epoch: i.updated != null ? toEpoch(i.updated) : null,
    updated_date_berlin: i.updated != null ? berlinDate(toEpoch(i.updated)) : null,
    revision: i._meta?.revision ?? null,
  };
}
// ---- end shared ----

export const meta = {
  description:
    'Lists inventory items as clean records: {sku, name, warehouse (code e.g. "BER"), warehouse_label, quantity (number, German "11.406 pcs" parsed to 11406), unit ("pcs"), unit_cost_eur, previous_unit_cost_eur (euros, "€1.576,28" parsed to 1576.28), price_change_eur (unit_cost - previous), price_change_pct, price_changed (bool; false when cost equals previous), stock_value_eur (quantity*unit_cost, 2 dp), reorder_point, below_reorder_point (quantity < reorder_point, strict), archived, active, updated_at (ISO UTC), updated_epoch (s), updated_date_berlin (YYYY-MM-DD in Europe/Berlin, the warehouses\' timezone), revision}. By default ONLY ACTIVE items (archived excluded). Handles X-Api-Token auth, cursor pagination, 429 rate limiting (shared throttle + backoff) and reads the base URL from .service/base-url. Returns {count, items}. Round your own sums to 2 dp (float noise).',
  whenToUse:
    'Any question about current stock: stock value per warehouse (sum stock_value_eur grouped by warehouse), items below reorder point (belowReorderPoint:true), price changes (priceChanged:true, sort by updated_epoch or price_change_pct), item lookup by sku. Set includeArchived:true only if the question explicitly wants archived items. For stock movements use inventory_movements.',
  inputSchema: {
    type: 'object',
    properties: {
      warehouses: { type: 'array', items: { type: 'string' }, description: 'Warehouse codes to keep, e.g. ["BER","AMS"]. Default all.' },
      skus: { type: 'array', items: { type: 'string' }, description: 'Only these SKUs (e.g. "SKU-4042").' },
      includeArchived: { type: 'boolean', description: 'Include archived items (default false = active only).' },
      onlyArchived: { type: 'boolean', description: 'Return only archived items.' },
      belowReorderPoint: { type: 'boolean', description: 'Only items with quantity < reorder_point.' },
      priceChanged: { type: 'boolean', description: 'Only items whose unit_cost differs from previous_unit_cost.' },
      updatedSince: { description: 'Only items updated at/after this: "YYYY-MM-DD" (Europe/Berlin midnight), ISO datetime, or epoch seconds.', type: ['string', 'number'] },
      updatedUntil: { description: 'Only items updated at/before this; a bare date is inclusive (end of that Berlin day).', type: ['string', 'number'] },
      fields: { type: 'array', items: { type: 'string' }, description: 'Return only these fields per item (to keep output small).' },
    },
  },
  examples: [
    { input: { skus: ['SKU-4042'] }, expect: { matches: '"quantity":\\s*11406' } },
    { input: { warehouses: ['LIS'], fields: ['sku', 'warehouse'] }, expect: { matches: '"warehouse":\\s*"LIS"' } },
  ],
  timeoutMs: 120000,
  provenance: { reason: 'Inventory API v2 capability: X-Api-Token auth, German number/euro formats, unicode minus, reversal movements, 429 burst-4 rate limit, base URL from .service/base-url.' },
};

export default async (input = {}, ctx) => {
  const api = client(ctx);
  let raw;
  if (input.skus?.length && input.skus.length <= 5) {
    raw = (await Promise.all(input.skus.map((s) => api.get(`/api/v2/items/${encodeURIComponent(s)}`)))).filter(Boolean);
  } else if (input.warehouses?.length === 1) {
    raw = await api.getAll(`/api/v2/items?warehouse=${encodeURIComponent(input.warehouses[0].toUpperCase())}`);
  } else {
    raw = await api.getAll('/api/v2/items');
  }
  const seen = new Set();
  let items = raw.map(normItem).filter((i) => (seen.has(i.sku) ? false : seen.add(i.sku)));
  const wh = input.warehouses?.map((w) => w.toUpperCase());
  if (wh?.length) items = items.filter((i) => wh.includes(String(i.warehouse).toUpperCase()));
  if (input.skus?.length) { const s = new Set(input.skus.map((x) => x.toUpperCase())); items = items.filter((i) => s.has(i.sku.toUpperCase())); }
  if (input.onlyArchived) items = items.filter((i) => i.archived);
  else if (!input.includeArchived) items = items.filter((i) => !i.archived);
  if (input.belowReorderPoint) items = items.filter((i) => i.below_reorder_point);
  if (input.priceChanged) items = items.filter((i) => i.price_changed);
  const since = toEpoch(input.updatedSince);
  const until = toEpoch(input.updatedUntil, true);
  if (since != null) items = items.filter((i) => i.updated_epoch >= since);
  if (until != null) items = items.filter((i) => i.updated_epoch <= until);
  items.sort((a, b) => a.sku.localeCompare(b.sku));
  if (input.fields?.length) items = items.map((i) => Object.fromEntries(input.fields.map((f) => [f, i[f]])));
  return { count: items.length, items };
};
// trod: promoted 2026-11-07T04:37:25.274Z
