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
  description: 'One-call evidence bundle per ticket. For each ticket (given ids, or ALL currently open tickets if ids omitted) returns { ticket: {id, subject, status, customer_id, created_at, body}, customer: {id, region, plan, card_exp ("YYYY-MM")}, window: {since, until} where until = ticket.created_at and since = until - window_hours (default 72), both INCLUSIVE, events: [all customer events in the window, newest first, {id,type,occurred_at,detail,seq}; ties in occurred_at keep API order, seq 0 = newest], latest_by_type: {type: newest event of that type in window}, incidents: [ALL incidents in the customer\'s region, {id, component, started_at, resolved_at|null=ongoing}] }. Output: { count, contexts: [...] } sorted by ticket id. Customers and regions are fetched once and shared; requests are throttled with 429 backoff. Times are ISO 8601 UTC. Does NOT assign labels: apply the policy (e.g. docs/TRIAGE.md) yourself to this evidence.',
  whenToUse: 'The fastest way to gather everything needed to triage/classify tickets: call once for all open tickets (or for new ids only, via exclude_ids), then apply the rules in trod_eval. Incidents are unfiltered so you can apply your own time rule (e.g. started_at <= created_at and resolved_at >= created_at - 6h).',
  inputSchema: { type: 'object', properties: {
    ids: { type: 'array', items: { type: 'string' }, description: 'Ticket ids; omit for all open tickets.' },
    exclude_ids: { type: 'array', items: { type: 'string' }, description: 'When listing open tickets, skip these ids (e.g. already triaged).' },
    window_hours: { type: 'number', description: 'Event window length ending at created_at. Default 72.' },
  } },
  examples: [
    { input: { ids: ['T-107'] }, expect: { matches: '"region":\\s*"eu-west"[\\s\\S]*"type":\\s*"account_locked"' } },
  ],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 240000,
};

export default async (input = {}, ctx) => {
  const wh = input.window_hours ?? 72;
  let ids = input.ids;
  if (!ids?.length) {
    ids = []; let tok = null;
    do { const r = await apiGet(ctx, buildPath('/v1/tickets', { status: 'open', page_token: tok })); for (const t of r.data || []) if (!ids.includes(t.id)) ids.push(t.id); tok = r.next_page_token || null; } while (tok);
    if (input.exclude_ids?.length) { const ex = new Set(input.exclude_ids); ids = ids.filter(i => !ex.has(i)); }
  }
  const notFound = [];
  const tickets = (await pool(ids, 4, async id => {
    const t = await apiGet(ctx, `/v1/tickets/${encodeURIComponent(id)}`, { allow404: true });
    if (!t) { notFound.push(id); return null; }
    return { id: t.id, subject: t.subject ?? null, status: t.status ?? null, customer_id: t.customer_id, created_at: iso(t.created_at), body: t.body ?? null };
  })).filter(Boolean);
  const custIds = [...new Set(tickets.map(t => t.customer_id))];
  const customers = {};
  await pool(custIds, 4, async cid => {
    const c = await apiGet(ctx, `/v1/customers/${encodeURIComponent(cid)}`, { allow404: true });
    customers[cid] = c ? { id: c.id, region: c.region ? String(c.region).toLowerCase() : null, plan: c.plan ?? null, card_exp: c.billing?.card_exp ?? null } : null;
  });
  const regions = [...new Set(Object.values(customers).filter(Boolean).map(c => c.region).filter(Boolean))];
  const incidents = {};
  await pool(regions, 3, async region => {
    const r = await apiGet(ctx, buildPath('/v1/status/incidents', { region }));
    incidents[region] = (r.data || []).map(i => ({ id: i.id, component: i.component ?? null, started_at: iso(i.started_at), resolved_at: i.resolved_at ? iso(i.resolved_at) : null }))
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  });
  const contexts = await pool(tickets, 3, async t => {
    const until = t.created_at, since = new Date(Date.parse(until) - wh * 3600e3).toISOString();
    const all = []; const seen = new Set(); let tok = null;
    do {
      const r = await apiGet(ctx, buildPath(`/v1/customers/${encodeURIComponent(t.customer_id)}/events`, { until, since, page_token: tok }));
      for (const e of r.data || []) if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
      tok = r.next_page_token || null;
    } while (tok);
    const lo = Date.parse(since), hi = Date.parse(until);
    const events = all.map((e, i) => ({ id: e.id, type: e.type, occurred_at: iso(e.occurred_at), detail: e.detail ?? {}, seq: i }))
      .filter(e => { const x = Date.parse(e.occurred_at); return x >= lo && x <= hi; })
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || a.seq - b.seq);
    const latest_by_type = {};
    for (const e of events) if (!latest_by_type[e.type]) latest_by_type[e.type] = e;
    const cust = customers[t.customer_id];
    return { ticket: t, customer: cust, window: { since, until }, events, latest_by_type, incidents: cust?.region ? incidents[cust.region] || [] : [] };
  });
  contexts.sort((a, b) => a.ticket.id.localeCompare(b.ticket.id, undefined, { numeric: true }));
  const out = { count: contexts.length, contexts };
  if (notFound.length) out.not_found = notFound;
  return out;
};
// trod: promoted 2026-11-07T04:35:18.555Z
