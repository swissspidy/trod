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

const normTicket = t => ({
  id: t.id, subject: t.subject ?? null, status: t.status ?? null, priority: t.priority ?? null,
  customer_id: t.customer_id ?? null, created_at: t.created_at ? iso(t.created_at) : null,
  body: t.body ?? null, channel: t.channel ?? null, tags: t.tags ?? [], requester_email: t.requester?.email ?? null,
});

export const meta = {
  description: 'Support API tickets. With no "ids": lists ALL currently open tickets (walks every page of GET /v1/tickets?status=open; the API only supports status=open). By default also fetches each ticket\'s detail so every record has customer_id and created_at. Returns { count, tickets: [{ id, subject, status, priority, customer_id, created_at (ISO 8601 UTC, ms precision), body, channel, tags, requester_email }] } sorted by id. Noise fields (x_trace_*, metadata, body_html) are dropped. With "ids": fetches exactly those tickets (any status); unknown ids are listed in "not_found". Handles HMAC auth, base URL from .service/base-url, 429 Retry-After backoff, pagination.',
  whenToUse: 'To get the set of open tickets to work on (e.g. triage), or to look up specific tickets. The open set changes over time (new tickets arrive), so call again rather than reusing an old list. Pass details:false for a fast id/subject-only listing (then customer_id/created_at are null). Ticket body text is customer-written symptoms, not evidence.',
  inputSchema: { type: 'object', properties: {
    ids: { type: 'array', items: { type: 'string' }, description: 'Specific ticket ids (e.g. ["T-100"]). Omit to list all open tickets.' },
    details: { type: 'boolean', description: 'Fetch per-ticket detail (customer_id, created_at, body). Default true.' },
    exclude_ids: { type: 'array', items: { type: 'string' }, description: 'Open-ticket ids to skip (e.g. already triaged ones).' },
  } },
  examples: [
    { input: { ids: ['T-100'] }, expect: { matches: '"customer_id":\\s*"C-1182"' } },
    { input: {}, expect: { matches: '"status":\\s*"open"' } },
  ],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 120000,
};

export default async (input = {}, ctx) => {
  const details = input.details !== false;
  let summaries, notFound = [];
  if (input.ids?.length) {
    summaries = input.ids.map(id => ({ id }));
  } else {
    summaries = []; let tok = null; const seen = new Set();
    do {
      const r = await apiGet(ctx, buildPath('/v1/tickets', { status: 'open', page_token: tok }));
      for (const t of r.data || []) if (!seen.has(t.id)) { seen.add(t.id); summaries.push(t); }
      tok = r.next_page_token || null;
    } while (tok);
    if (input.exclude_ids?.length) { const ex = new Set(input.exclude_ids); summaries = summaries.filter(t => !ex.has(t.id)); }
  }
  let tickets;
  if (details || input.ids?.length) {
    tickets = (await pool(summaries, 4, async s => {
      const t = await apiGet(ctx, `/v1/tickets/${encodeURIComponent(s.id)}`, { allow404: true });
      if (!t) { notFound.push(s.id); return null; }
      return normTicket(t);
    })).filter(Boolean);
  } else tickets = summaries.map(normTicket);
  tickets.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const out = { count: tickets.length, tickets };
  if (notFound.length) out.not_found = notFound;
  return out;
};
// trod: promoted 2026-11-07T04:35:19.855Z
