// ---- shared support-API client (inlined in every tool) ----
import crypto from 'node:crypto';
import fsp0 from 'node:fs/promises';
import path0 from 'node:path';
let _cfg = null, _skew = 0;
async function cfg(projectDir) {
  if (_cfg && _cfg.dir === projectDir) return _cfg;
  const base = (await fsp0.readFile(path0.join(projectDir, '.service/base-url'), 'utf8')).trim().replace(/\/+$/, '');
  const s = JSON.parse(await fsp0.readFile(path0.join(projectDir, '.secrets/support-api.json'), 'utf8'));
  _cfg = { dir: projectDir, base, keyId: s.key_id, secret: s.secret };
  return _cfg;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// pathWithQuery must be built with buildPath (no trailing '?', which breaks the signature)
function buildPath(p, params = {}) {
  const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return qs ? `${p}?${qs}` : p;
}
async function apiGet(ctx, pathWithQuery, { allow404 = false } = {}) {
  const c = await cfg(ctx.projectDir);
  let lastErr;
  for (let attempt = 0; attempt < 12; attempt++) {
    const ts = String(Date.now() + _skew);
    const sig = crypto.createHmac('sha256', c.secret).update(`GET\n${pathWithQuery}\n${ts}`).digest('base64');
    let r;
    try {
      r = await fetch(c.base + pathWithQuery, { headers: { 'X-Key-Id': c.keyId, 'X-Timestamp': ts, 'X-Signature': sig, Accept: 'application/json' } });
    } catch (e) { lastErr = e; await sleep(300 * (attempt + 1)); continue; }
    if (r.status === 429 || r.status >= 500) {
      const ra = r.headers.get('retry-after');
      let ms = ra && !isNaN(+ra) ? +ra * 1000 : ra ? Math.max(0, Date.parse(ra) - Date.now()) : 1000 * (attempt + 1);
      if (!(ms >= 0)) ms = 1000;
      await r.text().catch(() => {});
      await sleep(Math.min(ms, 30000) + Math.random() * 200);
      lastErr = new Error(`HTTP ${r.status} on ${pathWithQuery}`);
      continue;
    }
    const text = await r.text();
    if (r.status === 401 && attempt < 2) {
      const d = Date.parse(r.headers.get('date') || '');
      if (d && Math.abs(d - Date.now() - _skew) > 20000) { _skew = d - Date.now(); continue; }
    }
    if (r.status === 404 && allow404) return null;
    if (r.status !== 200) throw new Error(`HTTP ${r.status} on GET ${pathWithQuery}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
  throw lastErr || new Error('request failed: ' + pathWithQuery);
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
function iso(v) { // accepts ISO string, Date, epoch ms/seconds -> canonical ISO UTC with ms, or null
  if (v === undefined || v === null || v === '') return null;
  let d;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = +v; d = new Date(n < 1e12 ? n * 1000 : n); }
  else d = new Date(String(v));
  if (isNaN(d)) throw new Error('Unparseable date: ' + v);
  return d.toISOString();
}
const stripNoise = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !/^x_/.test(k)));
// ---- end client ----

export const meta = {
  description: 'Support API customers by id. Returns { customers: { [id]: { id, name, region (lower-case, e.g. "ap-south"), plan, seats, card_exp ("YYYY-MM" string, compare lexically e.g. card_exp < "2026-10"), card_brand, card_last4, currency, created_at (ISO UTC) } }, not_found: [ids] }. Noise settings.x_* fields are dropped. Handles auth, base URL, 429 backoff; fetches in parallel with de-duplication.',
  whenToUse: 'When you need a customer\'s region (for incidents) or billing card expiry (billing.card_exp) for one or many customers. Pass all customer ids in one call.',
  inputSchema: { type: 'object', properties: {
    ids: { type: 'array', items: { type: 'string' }, description: 'Customer ids, e.g. ["C-1182"]' },
  }, required: ['ids'] },
  examples: [{ input: { ids: ['C-1182', 'C-1260'] }, expect: { matches: '"card_exp":\\s*"2026-09"' } }],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 120000,
};

function normExp(v) {
  if (!v) return null; const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{2,4})$/))) return `${m[2].length === 2 ? '20' + m[2] : m[2]}-${m[1].padStart(2, '0')}`;
  return s;
}

export default async ({ ids }, ctx) => {
  const uniq = [...new Set(ids)]; const customers = {}; const not_found = [];
  await pool(uniq, 4, async id => {
    const c = await apiGet(ctx, `/v1/customers/${encodeURIComponent(id)}`, { allow404: true });
    if (!c) { not_found.push(id); return; }
    customers[id] = { id: c.id, name: c.name ?? null, region: c.region ? String(c.region).toLowerCase() : null, plan: c.plan ?? null, seats: c.seats ?? null,
      card_exp: normExp(c.billing?.card_exp), card_brand: c.billing?.card_brand ?? null, card_last4: c.billing?.last4 ?? null, currency: c.billing?.currency ?? null,
      created_at: c.created_at ? iso(c.created_at) : null };
  });
  return { customers, not_found };
};
// trod: promoted 2026-11-07T04:35:16.763Z
