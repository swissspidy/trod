import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import task from '../tasks/inventory-api.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('inventory-api fixture', () => {
  it('a careful client gets the expected answers for all four questions, and the quirks bite', async () => {
    const work = mkdtempSync(path.join(tmpdir(), 'trod-inv-'));
    const expected = task.setup({ work });
    const token = readFileSync(path.join(work, '.secrets/inventory.token'), 'utf8').trim();
    const server = createServer(task.handler!(expected, { step: 0 }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      // Quirks: Bearer auth fails with a hint; ISO dates are rejected.
      const bearer = await fetch(`${base}/api/v2/warehouses`, { headers: { authorization: `Bearer ${token}` } });
      expect(bearer.status).toBe(401);
      expect(bearer.headers.get('www-authenticate')).toMatch(/X-Api-Token/);
      await sleep(1100);
      expect((await fetch(`${base}/api/v2/items?updated_since=2026-10-01`, { headers: { 'x-api-token': token } })).status).toBe(400);

      let last = 0;
      const get = async (p: string): Promise<any> => {
        for (;;) {
          const wait = last + 260 - Date.now(); // stay under 4 requests per second
          if (wait > 0) await sleep(wait);
          last = Date.now();
          const res = await fetch(base + p, { headers: { 'x-api-token': token } });
          if (res.status === 429) {
            await sleep(1600);
            continue;
          }
          if (!res.ok) throw new Error(`${res.status} ${p}`);
          return res.json();
        }
      };
      const all = async (p: string) => {
        const out: any[] = [];
        let next: string | null = p;
        while (next) {
          const page: any = await get(next);
          out.push(...page.results);
          next = page.links.next;
        }
        return out;
      };
      const euros = (s: string) => Number(s.replace('€', '').replaceAll('.', '').replace(',', '.'));
      const qty = (s: string) => Number(s.replace(' pcs', '').replaceAll('.', ''));
      const items = await all('/api/v2/items');
      const active = items.filter((i) => !i.archived);

      const s1: Record<string, number> = {};
      for (const w of (await get('/api/v2/warehouses')).results.map((x: any) => x.code)) {
        s1[w] = Math.round(active.filter((i) => i.warehouse.code === w).reduce((n, i) => n + qty(i.quantity) * Math.round(euros(i.unit_cost) * 100), 0)) / 100;
      }
      expect(s1).toEqual(expected[0]);

      const s2 = active.filter((i) => ['BER', 'LIS'].includes(i.warehouse.code) && qty(i.quantity) < i.reorder_point).map((i) => i.sku).sort();
      expect({ skus: s2 }).toEqual(expected[1]);

      const since = Date.parse('2026-10-18T00:00:00Z') / 1000;
      const s3: Record<string, number> = {};
      for (const i of items.filter((x) => x.warehouse.code === 'AMS')) {
        const mv = await all(`/api/v2/items/${i.sku}/movements`);
        const reversed = new Set(mv.filter((m) => m.reverses).map((m) => m.reverses));
        for (const m of mv) {
          if (m.at < since || m.reverses || reversed.has(m.id)) continue;
          s3[i.sku] = (s3[i.sku] ?? 0) + Number(m.change.replace('−', '-'));
        }
        if (s3[i.sku] === 0) delete s3[i.sku];
      }
      expect(s3).toEqual(expected[2]);

      const since4 = Date.parse('2026-10-11T00:00:00Z') / 1000;
      const s4 = active.filter((i) => i.updated >= since4 && Math.abs(euros(i.unit_cost) - euros(i.previous_unit_cost)) / euros(i.previous_unit_cost) > 0.1).map((i) => i.sku).sort();
      expect({ skus: s4 }).toEqual(expected[3]);
      for (const e of expected.slice(1) as { skus?: string[] }[]) if (e.skus) expect(e.skus.length).toBeGreaterThan(2);
    } finally {
      server.close();
    }
  }, 120_000);
});
