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
  description: 'Customer event history from GET /v1/customers/{id}/events, all pages walked (10/page). Batch: pass several queries at once. Each query: { customer_id, since?, until?, hours_before? , types? }. Time bounds are INCLUSIVE on both ends (an event exactly at since or until is included) and are re-checked client-side. Dates may be ISO strings or epoch ms (converted to ISO; the API itself silently returns nothing for non-ISO values). hours_before=N with until sets since = until - N hours (e.g. 72 for a 72-hour window ending at a ticket\'s created_at). Returns { results: [{ customer_id, since, until, count, events: [{ id, type, occurred_at (ISO UTC), detail (object, e.g. {reason:"card_expired"}, {code:"E_EXPORT_TIMEOUT"}, {by:"policy"}, {resource:"exports"}), source, seq }] }] }. Events are newest first; several events can share the same occurred_at; seq is the API\'s original order (0 = newest) to break ties. Known types: account_locked, account_unlocked, payment_failed, payment_succeeded, quota_exceeded, export_failed, export_succeeded, login_failed, login_succeeded, user_invited, settings_changed.',
  whenToUse: 'To check what happened to a customer in a time window (lock/unlock, payments, quota, export failures). Use one call with many queries for many tickets. Filter with types to keep output small.',
  inputSchema: { type: 'object', properties: {
    queries: { type: 'array', items: { type: 'object', properties: {
      customer_id: { type: 'string' },
      since: { type: ['string', 'number'], description: 'Inclusive lower bound (ISO or epoch ms).' },
      until: { type: ['string', 'number'], description: 'Inclusive upper bound (ISO or epoch ms).' },
      hours_before: { type: 'number', description: 'If set (and since omitted), since = until - hours_before hours.' },
      types: { type: 'array', items: { type: 'string' }, description: 'Only return these event types.' },
      tag: { type: 'string', description: 'Free label echoed back (e.g. a ticket id).' },
    }, required: ['customer_id'] } },
  }, required: ['queries'] },
  examples: [
    { input: { queries: [{ customer_id: 'C-1182', until: '2026-10-20T22:00:00.000Z', hours_before: 72, types: ['account_locked', 'account_unlocked'], tag: 'x' }] },
      expect: { matches: '"type":\\s*"account_unlocked"' } },
  ],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 180000,
};

export default async ({ queries }, ctx) => {
  const results = await pool(queries, 3, async q => {
    const until = iso(q.until);
    let since = iso(q.since);
    if (!since && q.hours_before != null) {
      if (!until) throw new Error('hours_before requires until');
      since = new Date(Date.parse(until) - q.hours_before * 3600e3).toISOString();
    }
    const all = []; const seen = new Set(); let tok = null;
    do {
      const r = await apiGet(ctx, buildPath(`/v1/customers/${encodeURIComponent(q.customer_id)}/events`, { until, since, page_token: tok }));
      for (const e of r.data || []) if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
      tok = r.next_page_token || null;
    } while (tok);
    const lo = since ? Date.parse(since) : -Infinity, hi = until ? Date.parse(until) : Infinity;
    const types = q.types?.length ? new Set(q.types) : null;
    let events = all.map((e, i) => ({ id: e.id, type: e.type, occurred_at: iso(e.occurred_at), detail: e.detail ?? {}, source: e.source ?? null, seq: i }))
      .filter(e => { const t = Date.parse(e.occurred_at); return t >= lo && t <= hi; });
    events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || a.seq - b.seq);
    if (types) events = events.filter(e => types.has(e.type));
    const out = { customer_id: q.customer_id, since, until, count: events.length, events };
    if (q.tag !== undefined) out.tag = q.tag;
    return out;
  });
  return { results };
};
// trod: promoted 2026-11-07T04:35:18.096Z
