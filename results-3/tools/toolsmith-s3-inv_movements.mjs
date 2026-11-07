export const meta = {
  description: 'Fetch stock movements (auto-paginated per sku, 429 backoff, auth handled) for given skus, or for all items (filter by warehouse/status). Normalizes change ("−89" with unicode minus, "+10") to signed integer `delta`, `at` to epoch + ISO. Handles reversal movements (API field `reverses: "MV-11"` points at the movement it cancels): each record gets reverses, reversed (true if another movement reverses it). With exclude_reversed=true both the cancelled movement AND the reversal entry are dropped (net effect zero). Filters since/until (epoch seconds or ISO date; inclusive since, exclusive until). Returns per-sku net delta and overall net/in/out totals, plus the flat records unless records=false. Movements carry no warehouse; each record includes the item warehouse and active flag.',
  whenToUse: 'Net stock movements over a period (per sku or per warehouse), recent activity, auditing reversals. For current quantities/values use inv_items. Note: period filtering is by movement `at` timestamp (UTC epoch); convert local-time periods to epoch/ISO with timezone offsets before passing (warehouse timezone is Europe/Berlin).',
  inputSchema: { type: 'object', properties: {
    skus: { type: 'array', items: { type: 'string' }, description: 'skus; default = all items matching other filters' },
    warehouses: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['active', 'archived', 'all'], description: 'default all' },
    since: { type: ['string', 'number'], description: 'epoch seconds or ISO datetime (e.g. 2026-10-01T00:00:00+02:00)' },
    until: { type: ['string', 'number'], description: 'exclusive upper bound' },
    exclude_reversed: { type: 'boolean', description: 'drop reversed movements and their reversal entries (default false). Reversal pairs are matched on the full history before since/until filtering.' },
    records: { type: 'boolean', description: 'default true; false = summaries only' },
  } },
  examples: [
    { input: { skus: ['SKU-4000'], since: '2026-10-01' } },
    { input: { skus: ['SKU-4028'], exclude_reversed: true, records: false } },
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
  const since = toEpoch(input.since), until = toEpoch(input.until);
  let list;
  {
    let raw = [];
    for (const w of input.warehouses?.length ? input.warehouses : [null]) { const p = new URLSearchParams(); if (w) p.set('warehouse', w); raw.push(...await paged('/api/v2/items' + (p.size ? '?' + p : ''))); }
    list = raw.map(normItem);
    if (input.status === 'active') list = list.filter(i => i.active);
    if (input.status === 'archived') list = list.filter(i => !i.active);
    if (input.skus?.length) list = list.filter(i => input.skus.includes(i.sku));
  }
  // fetch full history (no server-side since) so reversal pairs resolve; filter locally
  const per = await pool(list, 3, async it => ({ it, mv: await paged(`/api/v2/items/${it.sku}/movements`) }));
  const records = [], by_sku = {}, missing = [];
  let net = 0, inn = 0, out = 0;
  for (const { it, mv } of per) {
    if (!mv.length && mv.length === 0 && it.active === null) { /* may be unknown sku */ }
    const reversedIds = new Set(mv.filter(m => m.reverses).map(m => m.reverses));
    const s = by_sku[it.sku] = { warehouse: it.warehouse, active: it.active, count: 0, net: 0 };
    for (const m of mv) {
      if (since !== undefined && m.at < since) continue;
      if (until !== undefined && m.at >= until) continue;
      const rec = { sku: it.sku, warehouse: it.warehouse, active: it.active, id: m.id, delta: num(m.change), at_epoch: m.at, at_iso: iso(m.at), by: m.by, reverses: m.reverses || null, reversed: reversedIds.has(m.id) };
      if (input.exclude_reversed && (rec.reverses || rec.reversed)) continue;
      records.push(rec); s.count++; s.net += rec.delta; net += rec.delta;
      if (rec.delta > 0) inn += rec.delta; else out += rec.delta;
    }
  }
  const byWh = {};
  for (const [sku, s] of Object.entries(by_sku)) { const b = byWh[s.warehouse] ||= { count: 0, net: 0 }; b.count += s.count; b.net += s.net; }
  const unknown_skus = (input.skus || []).filter(k => !list.some(i => i.sku === k));
  const res = { skus: list.length, unknown_skus, movements: records.length, net, total_in: inn, total_out: out, by_warehouse: byWh, by_sku };
  if (input.records !== false) res.records = records.sort((a, b) => b.at_epoch - a.at_epoch);
  return res;
};
// trod: promoted 2026-11-07T03:47:01.792Z
