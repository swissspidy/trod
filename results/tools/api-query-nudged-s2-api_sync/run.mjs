import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input) {
  const base = input.baseUrl.replace(/\/$/, '');
  async function get(p) {
    for (let i = 0; i < 50; i++) {
      const r = await fetch(base + p);
      if (r.status === 429) {
        const s = Number(r.headers.get('retry-after')) || 1;
        await new Promise((res) => setTimeout(res, s * 1000));
        continue;
      }
      if (!r.ok) throw new Error(`${p} -> ${r.status}`);
      return r.json();
    }
    throw new Error(`${p}: too many 429s`);
  }
  const users = [];
  let page = 1;
  while (page) {
    const d = await get(`/users?page=${page}`);
    users.push(...d.users);
    page = d.nextPage;
  }
  const orders = {};
  const queue = [...users];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const u = queue.shift();
      orders[u.id] = (await get(`/users/${u.id}/orders`)).orders;
    }
  }));
  const totals = {};
  for (const u of users) {
    let cents = 0;
    for (const o of orders[u.id]) if (o.status === 'completed') cents += Math.round(parseFloat(o.amount) * 100);
    totals[String(u.id)] = cents / 100;
  }
  if (input.countStatus) {
    const counts = {};
    for (const u of users) counts[String(u.id)] = orders[u.id].filter((o) => o.status === input.countStatus).length;
    writeFileSync(path.join(input.outDir, input.countFile || `${input.countStatus}_counts.json`), JSON.stringify(counts, null, 1));
  }
  if (input.sumStatus) {
    const sums = {};
    for (const u of users) {
      let cents = 0;
      for (const o of orders[u.id]) {
        if (o.status === input.sumStatus && (!input.sinceDate || o.createdAt >= input.sinceDate)) cents += Math.round(parseFloat(o.amount) * 100);
      }
      if (cents !== 0) sums[String(u.id)] = cents / 100;
    }
    writeFileSync(path.join(input.outDir, input.sumFile || `${input.sumStatus}_sums.json`), JSON.stringify(sums, null, 1));
  }
  writeFileSync(path.join(input.outDir, 'api_data.json'), JSON.stringify({ users, orders }));
  writeFileSync(path.join(input.outDir, 'totals.json'), JSON.stringify(totals, null, 1));
  return { users: users.length, orders: Object.values(orders).reduce((a, b) => a + b.length, 0) };
}
