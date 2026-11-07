import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import task from '../tasks/ticket-triage.ts';

/** A client written from docs/API.md and docs/TRIAGE.md only. */
async function triage(base: string, work: string): Promise<Record<string, string>> {
  const { key_id, secret } = JSON.parse(readFileSync(path.join(work, '.secrets/support-api.json'), 'utf8'));
  const get = async (p: string): Promise<any> => {
    for (;;) {
      const ts = String(Date.now());
      const sig = createHmac('sha256', secret).update(`GET\n${p}\n${ts}`).digest('base64');
      const res = await fetch(base + p, { headers: { 'x-key-id': key_id, 'x-timestamp': ts, 'x-signature': sig } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${p}`);
      return res.json();
    }
  };
  const all = async (p: string) => {
    const out: any[] = [];
    let tok: string | null = null;
    do {
      const page: any = await get(p + (tok ? `${p.includes('?') ? '&' : '?'}page_token=${encodeURIComponent(tok)}` : ''));
      out.push(...page.data);
      tok = page.next_page_token;
    } while (tok);
    return out;
  };
  const result: Record<string, string> = {};
  for (const s of await all('/v1/tickets?status=open')) {
    const t = await get(`/v1/tickets/${s.id}`);
    const c = await get(`/v1/customers/${t.customer_id}`);
    const created = Date.parse(t.created_at);
    const since = new Date(created - 72 * 3600_000).toISOString();
    const evs = (await all(`/v1/customers/${c.id}/events?since=${since}&until=${t.created_at}`)).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    const inc = (await get(`/v1/status/incidents?region=${c.region}`)).data;
    const last = (types: string[]) => evs.filter((e) => types.includes(e.type)).at(-1);
    let label = 'how_to';
    if (inc.some((i: any) => Date.parse(i.started_at) <= created && Date.parse(i.resolved_at) >= created - 6 * 3600_000)) label = 'regional_outage';
    else if (last(['account_locked', 'account_unlocked'])?.type === 'account_locked') label = 'account_locked';
    else if ((() => { const p = last(['payment_failed', 'payment_succeeded']); return p?.type === 'payment_failed' && p.detail.reason === 'card_expired' && c.billing.card_exp < '2026-10'; })()) label = 'billing_card_expired';
    else if (evs.some((e) => e.type === 'quota_exceeded')) label = 'plan_limit';
    else if (evs.some((e) => e.type === 'export_failed' && e.detail.code === 'E_EXPORT_TIMEOUT')) label = 'export_bug';
    result[t.id] = label;
  }
  return result;
}

describe('ticket-triage fixture', () => {
  it('an independent client following the docs gets the expected labels in every step', async () => {
    const work = mkdtempSync(path.join(tmpdir(), 'trod-triage-'));
    const expected = task.setup({ work });
    const state = { step: 0 };
    const server = createServer(task.handler!(expected, state));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const labels = new Set<string>();
      for (let s = 0; s < 4; s++) {
        state.step = s;
        const got = await triage(base, work);
        expect(got).toEqual(expected[s]);
        Object.values(got).forEach((l) => labels.add(l));
      }
      expect(labels.size).toBeGreaterThanOrEqual(5);
      // Unsigned requests are rejected.
      expect((await fetch(base + '/v1/tickets?status=open')).status).toBe(401);
    } finally {
      server.close();
    }
  });
});
