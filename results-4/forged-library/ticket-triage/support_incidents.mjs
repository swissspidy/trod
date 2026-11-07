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
  description: 'Status-page incidents per region from GET /v1/status/incidents?region=R. Returns { incidents: { [region]: [{ id, region, component, started_at, resolved_at (ISO UTC; null = still ongoing), postmortem_url }] } }. Region names are lower-cased before querying (the API is case-sensitive and returns [] for "AP-SOUTH"). Calling without a region returns nothing from the API, so you must pass regions. Optional active_at (ISO) + grace_hours keep only incidents with started_at <= active_at and (resolved_at null or resolved_at >= active_at - grace_hours).',
  whenToUse: 'To check whether a customer\'s region had an outage around a time (e.g. a ticket\'s created_at). Pass all needed regions in one call; get regions from support_customers.',
  inputSchema: { type: 'object', properties: {
    regions: { type: 'array', items: { type: 'string' }, description: 'e.g. ["ap-south","us-east","eu-west"]' },
    active_at: { type: 'string', description: 'Optional ISO time filter (see description).' },
    grace_hours: { type: 'number', description: 'Used with active_at; default 0.' },
  }, required: ['regions'] },
  examples: [{ input: { regions: ['eu-west'] }, expect: { matches: '"id":\\s*"INC-1"' } }],
  provenance: { reason: 'Support-API toolkit for ticket triage sessions (HMAC auth, paging, 429 backoff, inclusive windows).' },
  timeoutMs: 60000,
};

export default async ({ regions, active_at, grace_hours = 0 }, ctx) => {
  const uniq = [...new Set(regions.map(r => String(r).toLowerCase()))];
  const at = active_at ? Date.parse(iso(active_at)) : null;
  const incidents = {};
  await pool(uniq, 3, async region => {
    const r = await apiGet(ctx, buildPath('/v1/status/incidents', { region }));
    let list = (r.data || []).map(i => ({ id: i.id, region: i.region ? String(i.region).toLowerCase() : region, component: i.component ?? null,
      started_at: i.started_at ? iso(i.started_at) : null, resolved_at: i.resolved_at ? iso(i.resolved_at) : null, postmortem_url: i.postmortem_url ?? null }));
    if (at != null) list = list.filter(i => Date.parse(i.started_at) <= at && (i.resolved_at == null || Date.parse(i.resolved_at) >= at - grace_hours * 3600e3));
    list.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    incidents[region] = list;
  });
  return { incidents };
};
// trod: promoted 2026-11-07T04:35:18.392Z
