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

export const meta = {
  description: 'Lists warehouses: [{code ("AMS","BER","LIS","OSL"...), label, timezone}]. Handles auth/rate limit; base URL from .service/base-url.',
  whenToUse: 'To get the list of warehouse codes/labels (e.g. to report warehouses with zero stock too). Item and movement data come from inventory_items / inventory_movements.',
  inputSchema: { type: 'object', properties: {} },
  examples: [{ input: {}, expect: { matches: '"code":\\s*"BER"' } }],
  timeoutMs: 60000,
  provenance: { reason: 'Inventory API v2 capability: X-Api-Token auth, German number/euro formats, unicode minus, reversal movements, 429 burst-4 rate limit, base URL from .service/base-url.' },
};

export default async (input, ctx) => {
  const j = await client(ctx).get('/api/v2/warehouses');
  return (j?.results || []).map((w) => ({ code: w.code, label: w.label, timezone: w.timezone }));
};
// trod: promoted 2026-11-07T04:37:31.186Z
