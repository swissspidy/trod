export const meta = {
  description: 'Fetch ALL inventory items (auto-paginated, 429 backoff, auth handled) as clean normalized records: sku, name, warehouse code, quantity (number), unit_cost_eur, previous_unit_cost_eur (numbers; API gives "€1.234,56" / "1.234 pcs" strings with dot thousands + comma decimals), reorder_point, archived/active booleans, updated_epoch/updated_iso, plus derived stock_value_eur (=quantity*unit_cost), below_reorder (quantity<reorder_point), price_change_eur/pct (unit_cost - previous). Optional filters: warehouse(s), active status, updated_since, sku list. Optional includeWarehouses lists warehouse codes. Also returns per-warehouse summary (count, stock value) for the filtered set. Active = not archived (archived flag).',
  whenToUse: 'Any question about current stock: stock value per warehouse, items below reorder point, recent price changes, counts of active items, item lookups. Use instead of curl. For stock movements over time use inv_movements.',
  inputSchema: { type: 'object', properties: {
    warehouses: { type: 'array', items: { type: 'string' }, description: 'warehouse codes e.g. ["BER","LIS"]; default all' },
    status: { type: 'string', enum: ['active', 'archived', 'all'], description: 'default "all" — NOTE pass "active" for active (non-archived) items only' },
    updated_since: { type: ['string', 'number'], description: 'epoch seconds or ISO date; only items updated at/after (server-side filter)' },
    skus: { type: 'array', items: { type: 'string' }, description: 'restrict to these skus' },
    below_reorder_only: { type: 'boolean' },
    include_warehouses: { type: 'boolean', description: 'also return warehouse list [{code,label,timezone}]' },
    records: { type: 'boolean', description: 'return the records (default true); false = summary only' },
  } },
  examples: [
    { input: { status: 'active', records: false }, description: 'summary per warehouse of active items' },
    { input: { status: 'all', below_reorder_only: true, include_warehouses: true } },
  ],
};
const BASE = process.env.INVENTORY_URL || 'http://127.0.0.1:44825';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function token() {
  const fs = await import('node:fs'), path = await import('node:path');
  let d = process.cwd();
  for (let i = 0; i < 6; i++) {
    const f = path.join(d, '.secrets/inventory.token');
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    d = path.dirname(d);
  }
  throw new Error('token not found at .secrets/inventory.token');
}
let TOK;
async function get(p) {
  TOK ||= await token();
  for (let a = 0; a < 12; a++) {
    const r = await fetch(BASE + p, { headers: { 'X-Api-Token': TOK } });
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers.get('retry-after'));
      await sleep((ra > 0 ? ra * 1000 : Math.min(500 * 2 ** a, 8000)) + Math.random() * 200);
      continue;
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
  throw new Error(`GET ${p}: still rate limited after retries`);
}
async function paged(p) {
  const out = []; let u = p;
  while (u) { const j = await get(u); if (!j) break; out.push(...j.results); u = j.links?.next || null; }
  return out;
}
const num = s => { // "1.234,56" / "11.406 pcs" / "−89" / "+10" -> number (dot=thousands, comma=decimal)
  if (typeof s === 'number') return s;
  if (s == null) return null;
  let t = String(s).replace(/[−–—]/g, '-').replace(/[^0-9,.\-+]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t); return Number.isNaN(n) ? null : n;
};
const iso = s => s == null ? null : new Date(s * 1000).toISOString();
const toEpoch = v => { // accepts epoch seconds/ms or ISO date string
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = Number(v); return n > 1e11 ? Math.floor(n / 1000) : n; }
  const t = Date.parse(v); if (Number.isNaN(t)) throw new Error('bad date ' + v); return Math.floor(t / 1000);
};
async function pool(items, n, fn) {
  const res = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}
const normItem = r => ({
  sku: r.sku, name: r.name, warehouse: r.warehouse?.code ?? null,
  quantity: num(r.quantity), unit: String(r.quantity ?? '').replace(/^[^a-zA-Z]*/, '') || null,
  unit_cost_eur: num(r.unit_cost), previous_unit_cost_eur: num(r.previous_unit_cost),
  reorder_point: r.reorder_point, archived: !!r.archived, active: !r.archived,
  updated_epoch: r.updated, updated_iso: iso(r.updated), revision: r._meta?.revision ?? null,
});
export default async (input = {}) => {
  const whs = input.warehouses?.length ? input.warehouses : [null];
  const since = toEpoch(input.updated_since);
  let raw = [];
  for (const w of whs) {
    const q = new URLSearchParams();
    if (w) q.set('warehouse', w);
    if (since !== undefined) q.set('updated_since', since);
    raw.push(...await paged('/api/v2/items' + (q.size ? '?' + q : '')));
  }
  const seen = new Set();
  let items = raw.filter(r => !seen.has(r.sku) && seen.add(r.sku)).map(normItem);
  const st = input.status || 'all';
  if (st === 'active') items = items.filter(i => i.active);
  if (st === 'archived') items = items.filter(i => !i.active);
  if (input.skus?.length) items = items.filter(i => input.skus.includes(i.sku));
  for (const i of items) {
    i.stock_value_eur = Math.round(i.quantity * i.unit_cost_eur * 100) / 100;
    i.below_reorder = i.quantity < i.reorder_point;
    i.price_change_eur = Math.round((i.unit_cost_eur - i.previous_unit_cost_eur) * 100) / 100;
    i.price_change_pct = i.previous_unit_cost_eur ? Math.round((i.unit_cost_eur / i.previous_unit_cost_eur - 1) * 10000) / 100 : null;
  }
  if (input.below_reorder_only) items = items.filter(i => i.below_reorder);
  const by = {};
  for (const i of items) { const b = by[i.warehouse] ||= { count: 0, stock_value_eur: 0, units: 0 }; b.count++; b.units += i.quantity; b.stock_value_eur = Math.round((b.stock_value_eur + i.stock_value_eur) * 100) / 100; }
  const out = { count: items.length, by_warehouse: by };
  if (input.include_warehouses) out.warehouses = (await get('/api/v2/warehouses')).results;
  if (input.records !== false) out.items = items;
  return out;
};
// trod: promoted 2026-11-07T03:46:51.506Z
