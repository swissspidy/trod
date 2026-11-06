import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const base = input.baseUrl || 'http://127.0.0.1:45321/api';
  const get = async (p) => {
    for (let i = 0; i < 50; i++) {
      const r = await fetch(base + p);
      if (r.status === 429) {
        const s = Number(r.headers.get('retry-after')) || 1;
        await new Promise((x) => setTimeout(x, s * 1000));
        continue;
      }
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.json();
    }
    throw new Error(`${p}: too many 429s`);
  };
  const users = [];
  for (let page = 1; page; ) {
    const d = await get(`/users?page=${page}`);
    users.push(...d.users);
    page = d.nextPage;
  }
  const orders = {};
  const totals = {};
  const refunds = {};
  const pending = {};
  const queue = [...users];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const d = await get(`/users/${u.id}/orders`);
      orders[u.id] = d.orders;
      let cents = 0;
      for (const o of d.orders) if (o.status === 'completed') cents += Math.round(parseFloat(o.amount) * 100);
      totals[String(u.id)] = cents / 100;
      let pc = 0;
      for (const o of d.orders) if (o.status === 'pending' && o.createdAt >= '2026-06-01') pc += Math.round(parseFloat(o.amount) * 100);
      if (pc !== 0) pending[String(u.id)] = pc / 100;
      refunds[String(u.id)] = d.orders.filter((o) => o.status === 'refunded').length;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync(path.resolve(ctx.projectDir, 'api_cache.json'), JSON.stringify({ users, orders }));
  writeFileSync(path.resolve(ctx.projectDir, 'totals.json'), JSON.stringify(totals, null, 1));
  writeFileSync(path.resolve(ctx.projectDir, 'refunds.json'), JSON.stringify(refunds, null, 1));
  writeFileSync(path.resolve(ctx.projectDir, 'pending.json'), JSON.stringify(pending, null, 1));
  return { users: users.length, orders: Object.values(orders).reduce((a, b) => a + b.length, 0) };
}
