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
  description: 'Raw signed GET against the support API (base URL from .service/base-url, HMAC auth, 429/5xx retry, clock-skew correction). Input path like "/v1/tickets/T-100" plus optional params object (query string is built correctly; never leave a trailing "?" since it breaks the signature). With all_pages:true follows next_page_token and concatenates "data". Returns the parsed JSON (or {data:[...], pages} when all_pages), or {not_found:true} on 404.',
  whenToUse: 'Only for endpoints or fields the dedicated support_* tools do not cover. Prefer support_tickets, support_customers, support_events, support_incidents, support_ticket_context.',
  inputSchema: { type: 'object', properties: {
    path: { type: 'string' }, params: { type: 'object' }, all_pages: { type: 'boolean' },
  }, required: ['path'] },
  examples: [{ input: { path: '/v1/customers/C-1182' }, expect: { matches: '"region":\\s*"ap-south"' } }],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 120000,
};

export default async ({ path, params = {}, all_pages = false }, ctx) => {
  if (!all_pages) return (await apiGet(ctx, buildPath(path, params), { allow404: true })) ?? { not_found: true };
  const data = []; let tok = null, pages = 0;
  do { const r = await apiGet(ctx, buildPath(path, { ...params, page_token: tok })); pages++; data.push(...(r.data || [])); tok = r.next_page_token || null; } while (tok);
  return { data, pages };
};
// trod: promoted 2026-11-07T04:35:18.241Z
