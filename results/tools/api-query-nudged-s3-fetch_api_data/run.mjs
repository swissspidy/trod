import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const base = input.baseUrl.replace(/\/$/, '');
  const get = async (p) => {
    for (let i = 0; i < 100; i++) {
      const r = await fetch(base + p);
      if (r.status === 429) {
        const s = parseFloat(r.headers.get('retry-after') || '1');
        await new Promise((res) => setTimeout(res, Math.max(s, 0.05) * 1000));
        continue;
      }
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      return r.json();
    }
    throw new Error(`${p}: too many retries`);
  };
  const users = [];
  let page = 1;
  while (page) {
    const d = await get(`/users?page=${page}`);
    users.push(...d.users);
    page = d.nextPage;
  }
  const ordersByUser = {};
  const totals = {};
  let n = 0;
  const queue = [...users];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const d = await get(`/users/${u.id}/orders`);
      ordersByUser[u.id] = d.orders;
      let cents = 0;
      for (const o of d.orders) {
        if (o.status === 'completed') cents += Math.round(parseFloat(o.amount) * 100);
      }
      totals[String(u.id)] = cents / 100;
      n += d.orders.length;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const out = {};
  for (const u of users) out[String(u.id)] = totals[String(u.id)];
  writeFileSync(path.resolve(ctx.projectDir, input.dataPath), JSON.stringify({ users, ordersByUser }));
  writeFileSync(path.resolve(ctx.projectDir, input.totalsPath), JSON.stringify(out, null, 1));
  if (input.countStatus && input.countsPath) {
    const c = {};
    for (const u of users) c[String(u.id)] = ordersByUser[u.id].filter((o) => o.status === input.countStatus).length;
    writeFileSync(path.resolve(ctx.projectDir, input.countsPath), JSON.stringify(c, null, 1));
  }
  if (input.sumStatus && input.sumPath) {
    const c = {};
    for (const u of users) {
      let cents = 0;
      for (const o of ordersByUser[u.id]) if (o.status === input.sumStatus && (!input.sinceDate || o.createdAt >= input.sinceDate)) cents += Math.round(parseFloat(o.amount) * 100);
      if (cents !== 0) c[String(u.id)] = cents / 100;
    }
    writeFileSync(path.resolve(ctx.projectDir, input.sumPath), JSON.stringify(c, null, 1));
  }
  return { users: users.length, orders: n, uniqueUserIds: new Set(users.map((u) => u.id)).size };
}
