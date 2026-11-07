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
    'Stock movements for inventory items as clean records: {sku, name, warehouse (code), id ("MV-17"), change (signed number; API uses unicode minus "−21" -> -21), at (ISO UTC), at_epoch (s), date_berlin (YYYY-MM-DD in Europe/Berlin, the warehouses\' timezone), by, is_reversal (this entry undoes another), reverses (id it undoes or null), reversed (bool: this entry was later undone by a reversal), reversed_by}. REVERSALS: by default (includeReversals:false) both reversed entries and the reversal entries that cancel them are EXCLUDED, so sum(change) is the genuine net movement; set includeReversals:true to get every raw entry with flags. Items: by default movements of ACTIVE (non-archived) items only. Period: since/until accept "YYYY-MM-DD" (Europe/Berlin day; until is inclusive of that whole day), ISO datetime or epoch seconds. Handles auth, pagination (newest first), 429 rate limit (~4 req/s; fetching all items takes ~20-30 s). Returns {count, net_change, movements, per_sku:[{sku,name,warehouse,net_change,count}]}.',
  whenToUse:
    'Net stock movements over a period (per item / per warehouse), inbound vs outbound totals, movement history of a SKU. Pass skus or warehouses to limit API calls. For current quantities/values use inventory_items.',
  inputSchema: {
    type: 'object',
    properties: {
      skus: { type: 'array', items: { type: 'string' }, description: 'Only these SKUs. Default: all items (filtered by warehouses/includeArchived).' },
      warehouses: { type: 'array', items: { type: 'string' }, description: 'Only items in these warehouse codes.' },
      since: { type: ['string', 'number'], description: 'Start (inclusive). "YYYY-MM-DD" = Berlin midnight; ISO; epoch seconds.' },
      until: { type: ['string', 'number'], description: 'End (inclusive). Bare date = through end of that Berlin day.' },
      includeReversals: { type: 'boolean', description: 'Keep reversed entries and reversal entries (default false = drop both).' },
      includeArchived: { type: 'boolean', description: 'Also include movements of archived items (default false).' },
      direction: { type: 'string', enum: ['in', 'out'], description: 'Only positive (in) or negative (out) changes.' },
      omitMovements: { type: 'boolean', description: 'Return only totals and per_sku (smaller output).' },
    },
  },
  examples: [
    { input: { skus: ['SKU-4028'], includeReversals: true }, expect: { matches: '"reverses":\\s*"MV-17"' } },
    { input: { skus: ['SKU-4028'], omitMovements: true }, expect: { matches: '"net_change":\\s*-?\\d+' } },
  ],
  timeoutMs: 180000,
  provenance: { reason: 'Inventory API v2 capability: X-Api-Token auth, German number/euro formats, unicode minus, reversal movements, 429 burst-4 rate limit, base URL from .service/base-url.' },
};

export default async (input = {}, ctx) => {
  const api = client(ctx);
  let items;
  if (input.skus?.length && input.skus.length <= 5) {
    items = (await Promise.all(input.skus.map((s) => api.get(`/api/v2/items/${encodeURIComponent(s)}`)))).filter(Boolean).map(normItem);
  } else {
    const wh = input.warehouses?.length === 1 ? `?warehouse=${encodeURIComponent(input.warehouses[0].toUpperCase())}` : '';
    items = (await api.getAll('/api/v2/items' + wh)).map(normItem);
    if (input.skus?.length) { const s = new Set(input.skus.map((x) => x.toUpperCase())); items = items.filter((i) => s.has(i.sku.toUpperCase())); }
  }
  if (input.warehouses?.length) { const w = input.warehouses.map((x) => x.toUpperCase()); items = items.filter((i) => w.includes(i.warehouse)); }
  // explicit skus are honoured even if archived
  if (!input.includeArchived && !input.skus?.length) items = items.filter((i) => !i.archived);
  const since = toEpoch(input.since);
  const until = toEpoch(input.until, true);
  const all = [];
  await Promise.all(items.map(async (it) => {
    // server-side `since` (epoch seconds) cuts pages; later reversals are still fetched because they are newer
    const raw = await api.getAll(`/api/v2/items/${encodeURIComponent(it.sku)}/movements` + (since != null ? `?since=${since}` : ''));
    const seen = new Set();
    const rows = raw.filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).map((m) => {
      const at = toEpoch(m.at);
      return { sku: it.sku, name: it.name, warehouse: it.warehouse, id: m.id, change: deNum(m.change), at: new Date(at * 1000).toISOString(), at_epoch: at, date_berlin: berlinDate(at), by: m.by ?? null, is_reversal: !!m.reverses, reverses: m.reverses ?? null, reversed: false, reversed_by: null };
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rows) if (r.reverses && byId.has(r.reverses)) { const o = byId.get(r.reverses); o.reversed = true; o.reversed_by = r.id; }
    all.push(...rows);
  }));
  let mv = all;
  if (since != null) mv = mv.filter((m) => m.at_epoch >= since);
  if (until != null) mv = mv.filter((m) => m.at_epoch <= until);
  if (!input.includeReversals) mv = mv.filter((m) => !m.is_reversal && !m.reversed);
  if (input.direction === 'in') mv = mv.filter((m) => m.change > 0);
  if (input.direction === 'out') mv = mv.filter((m) => m.change < 0);
  mv.sort((a, b) => a.sku.localeCompare(b.sku) || b.at_epoch - a.at_epoch);
  const per = new Map();
  for (const it of items) per.set(it.sku, { sku: it.sku, name: it.name, warehouse: it.warehouse, net_change: 0, count: 0 });
  for (const m of mv) { const p = per.get(m.sku); p.net_change += m.change; p.count++; }
  const out = { count: mv.length, net_change: mv.reduce((s, m) => s + m.change, 0), per_sku: [...per.values()] };
  if (!input.omitMovements) out.movements = mv;
  return out;
};
// trod: promoted 2026-11-07T04:37:26.091Z
