import fs from 'node:fs';

export const meta = {
  description: 'Fetch ALL inventory items (every page, auth + 429 backoff handled) as clean normalized records: {sku,name,warehouse,quantity(number),unit,unit_cost(EUR number),previous_unit_cost,price_change,price_change_pct,stock_value(quantity*unit_cost),reorder_point,below_reorder(quantity<reorder_point),archived,active,updated(epoch s),updated_iso,revision}. Parses "11.406 pcs"->11406 and "€1.783,73"->1783.73. Optional filters: warehouse(s), active_only, updated_since, below_reorder_only, skus, name_contains. Optional summary groups (count, quantity, stock_value) by warehouse. Also returns the warehouse list. Auth header is X-Api-Token (not Bearer); page size is fixed at 7 (limit ignored).',
  whenToUse: 'Any question about inventory items: stock value per warehouse, items below reorder point, price changes (unit_cost vs previous_unit_cost), counts of active/archived items. "Active" = not archived. Use summary:true for per-warehouse totals; use records for item lists.',
  inputSchema: { type: 'object', properties: {
    warehouses: { type: 'array', items: { type: 'string' }, description: 'warehouse codes, e.g. ["BER"]; filtered client-side too' },
    active_only: { type: 'boolean', description: 'exclude archived items' },
    archived_only: { type: 'boolean' },
    updated_since: { description: 'epoch seconds or ISO date; keeps items updated at/after' },
    below_reorder_only: { type: 'boolean' },
    price_changed_only: { type: 'boolean' },
    skus: { type: 'array', items: { type: 'string' } },
    name_contains: { type: 'string' },
    summary: { type: 'boolean', description: 'return per-warehouse aggregates (and no records unless include_records)' },
    include_records: { type: 'boolean', description: 'with summary, also return records' },
    fields: { type: 'array', items: { type: 'string' }, description: 'limit record fields to these' },
  } },
  examples: [{ input: { summary: true, active_only: true }}, { input: { below_reorder_only: true, active_only: true, fields: ['sku','warehouse','quantity','reorder_point'] }}],
};
const B = 'http://127.0.0.1:41935';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const num = (s) => { // handles "11.406", "1.234,56", "1,5", "-3", unicode minus
  if (typeof s === 'number') return s;
  let t = String(s).replace(/[−–‒]/g, '-').replace(/[^\d.,+-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t); return Number.isFinite(n) ? n : null;
};
export async function get(path, token) {
  for (let a = 0; a < 40; a++) {
    let r;
    try { r = await fetch(B + path, { headers: { 'X-Api-Token': token } }); } catch { await sleep(500 * (a + 1)); continue; }
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers.get('retry-after'));
      await sleep(ra > 0 ? ra * 1000 : Math.min(500 * 1.5 ** a, 5000)); continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${path} ${await r.text()}`);
    return r.json();
  }
  throw new Error('rate limited too long: ' + path);
}
export async function pages(path, token) {
  const out = []; let url = path;
  while (url) {
    const j = await get(url, token);
    out.push(...(j.results ?? []));
    url = j.links?.next ? (j.links.next.startsWith('http') ? new URL(j.links.next).pathname + new URL(j.links.next).search : j.links.next) : null;
  }
  return out;
}
export const epoch = (v) => { if (v == null) return null; if (typeof v === 'number' || /^\d+$/.test(v)) { const n = Number(v); return n > 1e11 ? Math.floor(n / 1000) : n; } const d = Date.parse(v); return isNaN(d) ? null : Math.floor(d / 1000); };
const r2 = (x) => Math.round(x * 100) / 100;
export default async (input = {}, ctx) => {
  const token = fs.readFileSync(new URL('../../.secrets/inventory.token', import.meta.url), 'utf8').trim();
  const q = [];
  const since = epoch(input.updated_since);
  const wh = input.warehouses?.map(w => w.toUpperCase());
  const [raw, whs] = await Promise.all([pages('/api/v2/items', token), get('/api/v2/warehouses', token)]);
  const seen = new Map();
  for (const i of raw) seen.set(i.sku, i);
  let recs = [...seen.values()].map(i => {
    const quantity = num(i.quantity), uc = num(i.unit_cost), pc = i.previous_unit_cost == null ? null : num(i.previous_unit_cost);
    const archived = i.archived === true || /archiv/i.test(i.status ?? '');
    const upd = epoch(i.updated);
    return { sku: i.sku, name: i.name, warehouse: i.warehouse?.code, quantity, unit: String(i.quantity).replace(/^[\d.,\s+-]+/, '').trim() || null,
      unit_cost: uc, previous_unit_cost: pc,
      price_change: pc == null ? null : r2(uc - pc), price_change_pct: pc ? r2((uc - pc) / pc * 100) : null,
      stock_value: r2(quantity * uc), reorder_point: i.reorder_point, below_reorder: quantity < i.reorder_point,
      archived, active: !archived, updated: upd, updated_iso: upd ? new Date(upd * 1000).toISOString() : null, revision: i._meta?.revision };
  });
  recs = recs.filter(r =>
    (!wh || wh.includes(r.warehouse)) && (!input.active_only || r.active) && (!input.archived_only || r.archived) &&
    (since == null || (r.updated ?? 0) >= since) && (!input.below_reorder_only || r.below_reorder) &&
    (!input.price_changed_only || (r.price_change ?? 0) !== 0) && (!input.skus || input.skus.includes(r.sku)) &&
    (!input.name_contains || r.name.toLowerCase().includes(input.name_contains.toLowerCase())));
  const out = { total: recs.length, warehouses: whs.results };
  if (input.summary) {
    const g = {};
    for (const r of recs) { const x = g[r.warehouse] ??= { items: 0, quantity: 0, stock_value: 0, below_reorder: 0 }; x.items++; x.quantity += r.quantity; x.stock_value = r2(x.stock_value + r.stock_value); x.below_reorder += r.below_reorder ? 1 : 0; }
    out.by_warehouse = g;
    out.grand_total_value = r2(recs.reduce((s, r) => s + r.stock_value, 0));
  }
  if (!input.summary || input.include_records) out.records = input.fields ? recs.map(r => Object.fromEntries(input.fields.map(f => [f, r[f]]))) : recs;
  return out;
};
// trod: promoted 2026-11-07T03:44:40.085Z
