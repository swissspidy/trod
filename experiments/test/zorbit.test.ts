import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { calibrate } from '../private/calibrate.ts';
import { grade, handler, questions, TENANT, world, zorbitIds } from '../private/zorbit.ts';

async function serve() {
  const server = createServer(handler(world()));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

describe('zorbit environment (round 19)', () => {
  it('is deterministic and splits 20 train / 40 test, 5 test tasks per kind', () => {
    expect(JSON.stringify(questions())).toBe(JSON.stringify(questions()));
    expect(zorbitIds('train')).toHaveLength(20);
    expect(zorbitIds('test')).toHaveLength(40);
    const kinds = new Map<string, number>();
    for (const q of questions().filter((q) => q.split === 'test')) kinds.set(q.kind, (kinds.get(q.kind) ?? 0) + 1);
    expect([...kinds.values()].every((n) => n === 5)).toBe(true);
  });

  it('a client that knows every quirk gets every answer, and every task depends on a silent quirk', async () => {
    const c = await calibrate();
    expect(c.tasks.filter((t) => !t.correct).map((t) => t.id)).toEqual([]);
    expect(c.tasks.filter((t) => !t.sensitive.length).map((t) => t.id)).toEqual([]);
    // Each silent quirk decides at least 5 test tasks.
    for (const [k, v] of Object.entries(c.perQuirk)) expect(v.test, k).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('loud quirks: the tenant header and DD.MM.YYYY dates', async () => {
    const s = await serve();
    try {
      expect((await fetch(`${s.base}/zb/orders`)).status).toBe(400);
      const index = (await (await fetch(`${s.base}/zb/`)).json()) as { auth: string };
      expect(index.auth).toContain('X-Zb-Tenant');
      const h = { 'x-zb-tenant': TENANT };
      expect((await fetch(`${s.base}/zb/orders?from=2026-03-01&to=2026-03-08`, { headers: h })).status).toBe(400);
      expect((await fetch(`${s.base}/zb/orders?from=01.03.2026&to=08.03.2026`, { headers: h })).status).toBe(200);
    } finally {
      s.close();
    }
  });

  it('pages overlap by one item, and a burst of requests silently halves pages', async () => {
    const s = await serve();
    const h = { 'x-zb-tenant': TENANT };
    try {
      const p1 = (await (await fetch(`${s.base}/zb/customers?page=1`, { headers: h })).json()) as { items: { id: string }[] };
      const p2 = (await (await fetch(`${s.base}/zb/customers?page=2`, { headers: h })).json()) as { items: { id: string }[] };
      expect(p2.items[0]?.id).toBe(p1.items.at(-1)?.id);
      const burst = await Promise.all(Array.from({ length: world().params.throttle + 2 }, () => fetch(`${s.base}/zb/customers?page=3`, { headers: h })));
      const last = burst.at(-1)!;
      expect(last.status).toBe(200);
      expect(last.headers.get('x-zb-throttled')).toBe('1');
      expect(((await last.json()) as { items: unknown[] }).items.length).toBeLessThan(25);
    } finally {
      s.close();
    }
  });

  it('grades numbers exactly and region counts as a whole', () => {
    const qs = questions();
    const n = qs.find((q) => typeof q.answer === 'number')!;
    expect(grade(n, JSON.stringify({ answer: n.answer })).pass).toBe(true);
    expect(grade(n, JSON.stringify({ answer: (n.answer as number) + 1 })).pass).toBe(false);
    expect(grade(n, '').pass).toBe(false);
    const r = qs.find((q) => q.kind === 'region-orders')!;
    expect(grade(r, JSON.stringify({ answer: r.answer })).pass).toBe(true);
    const off = { ...(r.answer as Record<string, number>) };
    off[Object.keys(off)[0]!]! += 1;
    expect(grade(r, JSON.stringify({ answer: off })).score).toBeLessThan(1);
  });
});
