/**
 * A scripted Zorbit client over HTTP, for checking the environment without a model.
 *
 * solve(q, base, ignore) answers a question the way a client that knows every quirk would, except for the quirks in
 * `ignore`, which it handles the way an uninformed but reasonable client would. Comparing the answers shows which
 * quirks each task actually depends on (calibrate.ts prints the matrix; the test asserts on it).
 */
import type { Question } from './zorbit.ts';

export type Quirk = 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q8' | 'Q9' | 'Q10' | 'Q11' | 'Q12';
export const SILENT: Quirk[] = ['Q3', 'Q4', 'Q5', 'Q6', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12'];

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const dmy = (day: number) => {
  const d = new Date(day);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};
const parseDmy = (s: string) => {
  const [d, m, y] = s.split('.').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const isoDay = (s: string) => Date.parse(`${s}T00:00:00Z`);

interface Ctx {
  base: string;
  ignore: Set<Quirk>;
  offsetMin: number;
}

async function get(ctx: Ctx, p: string): Promise<{ body: any; throttled: boolean }> {
  for (;;) {
    const res = await fetch(ctx.base + p, { headers: { 'x-zb-tenant': 'tn-4471-kq' } });
    const body = await res.json();
    if (res.status !== 200) throw new Error(`${p}: ${res.status} ${JSON.stringify(body)}`);
    const throttled = res.headers.get('x-zb-throttled') === '1';
    if (!throttled) return { body, throttled };
    await new Promise((r) => setTimeout(r, 1100));
  }
}

async function all(ctx: Ctx, p: string): Promise<any[]> {
  const sep = p.includes('?') ? '&' : '?';
  const first = (await get(ctx, `${p}${sep}page=1`)).body;
  const items: any[] = [...first.items];
  for (let page = 2; page <= first.pages; page++) items.push(...(await get(ctx, `${p}${sep}page=${page}`)).body.items);
  if (ctx.ignore.has('Q6')) return items;
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** UTC instant of a service timestamp (or the timestamp read as UTC when Q4 is ignored). */
const utc = (ctx: Ctx, stamp: string) => Date.parse(stamp.replace(' ', 'T') + 'Z') - (ctx.ignore.has('Q4') ? 0 : ctx.offsetMin * 60_000);

/** Items of a dated endpoint whose timestamp falls on UTC dates a..b inclusive. */
async function dated(ctx: Ctx, endpoint: string, field: string, a: number, b: number): Promise<any[]> {
  // Knowing Q4: one extra local day on each side, then filter by UTC. Not knowing it: the UTC dates as local dates.
  const lo = ctx.ignore.has('Q4') ? a : a - DAY;
  const hiInclusive = ctx.ignore.has('Q4') ? b : b + DAY;
  const to = ctx.ignore.has('Q3') ? hiInclusive : hiInclusive + DAY;
  const items = await all(ctx, `${endpoint}?from=${dmy(lo)}&to=${dmy(to)}`);
  return items.filter((x) => {
    const day = Math.floor(utc(ctx, x[field]) / DAY) * DAY;
    return day >= a && day <= b;
  });
}

const counts = (o: any, ctx: Ctx) => ctx.ignore.has('Q5') || o.voided_at === null;
const span = (text: string): [number, number] => {
  const m = text.match(/from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/)!;
  return [isoDay(m[1]!), isoDay(m[2]!)];
};

export async function solve(q: Question, base: string, ignore: Quirk[] = []): Promise<number | Record<string, number>> {
  const index = (await (await fetch(base + '/zb/')).json()) as { clock: string };
  const sign = index.clock.startsWith('-') ? -1 : 1;
  const [hh, mm] = index.clock.slice(1).split(':').map(Number);
  const ctx: Ctx = { base, ignore: new Set(ignore), offsetMin: sign * (hh! * 60 + mm!) };
  const regions = (await get(ctx, '/zb/regions')).body.items as { code: string; name: string; legacy_codes: string[] }[];
  const regionName = (code: string) => regions.find((r) => r.code === code || (!ctx.ignore.has('Q11') && r.legacy_codes.includes(code)))?.name ?? '?';
  const customers = async () => all(ctx, '/zb/customers');

  switch (q.kind) {
    case 'revenue': {
      const [a, b] = span(q.text);
      return (await dated(ctx, '/zb/orders', 'placed_at', a, b)).filter((o) => counts(o, ctx)).reduce((s, o) => s + o.amount_minor, 0);
    }
    case 'region-orders': {
      const [a, b] = span(q.text);
      const cs = new Map((await customers()).map((c) => [c.id, c.region]));
      const out: Record<string, number> = Object.fromEntries(regions.map((r) => [r.name, 0]));
      for (const o of await dated(ctx, '/zb/orders', 'placed_at', a, b)) {
        if (!counts(o, ctx)) continue;
        const n = regionName(cs.get(o.customer)!);
        if (n in out) out[n]!++;
      }
      return out;
    }
    case 'net-units':
    case 'returned-value': {
      const [a, b] = span(q.text);
      const orders = (await dated(ctx, '/zb/orders', 'placed_at', a, b)).filter((o) => counts(o, ctx));
      const ids = new Set(orders.map((o) => o.id));
      const lo = a - DAY;
      const lines = (await all(ctx, `/zb/lines?from=${dmy(lo)}&to=${dmy(b + 3 * DAY)}`)).filter((l) => ids.has(l.order_id));
      if (q.kind === 'net-units') {
        const products = (await get(ctx, '/zb/products')).body.items as { code: string; name: string }[];
        const code = products.find((p) => q.text.includes(`units of ${p.name} `))!.code;
        return lines.filter((l) => l.product === code && (!ctx.ignore.has('Q9') || l.qty > 0)).reduce((s, l) => s + l.qty, 0);
      }
      if (ctx.ignore.has('Q9')) return 0; // no returns endpoint: an uninformed client finds no returns
      const cents = (p: number) => (ctx.ignore.has('Q8') ? Math.round(p) : Math.round(p * 100));
      return lines.filter((l) => l.qty < 0).reduce((s, l) => s - l.qty * cents(l.unit_price), 0);
    }
    case 'region-refunds': {
      const [a, b] = span(q.text);
      const reg = regions.find((r) => q.text.includes(`the ${r.name} region`))!.name;
      const cs = new Map((await customers()).map((c) => [c.id, c.region]));
      let sum = 0;
      for (const x of await dated(ctx, '/zb/refunds', 'refunded_at', a, b)) {
        const id = ctx.ignore.has('Q10') ? x.order_ref : `o-${Number(x.order_ref.replace(/^ORD-/, ''))}`;
        const o = await fetch(`${base}/zb/orders/${id}`, { headers: { 'x-zb-tenant': 'tn-4471-kq' } });
        if (o.status !== 200) continue;
        if (regionName(cs.get(((await o.json()) as any).customer)!) === reg) sum += x.amount_minor;
      }
      return sum;
    }
    case 'tier-customers': {
      const tier = q.text.match(/many (\w+)-tier/)![1];
      const reg = regions.find((r) => q.text.includes(`the ${r.name} region`))!.name;
      return (await customers()).filter((c) => c.tier === tier && regionName(c.region) === reg).length;
    }
    case 'fiscal-revenue': {
      const week = Number(q.text.match(/fiscal week (\d+)/)![1]);
      const f = (await get(ctx, '/zb/fiscal?date=01.03.2026')).body as { week: number; week_start: string };
      let start = parseDmy(f.week_start) + (week - f.week) * 7 * DAY;
      if (ctx.ignore.has('Q12')) {
        // Monday-based weeks counted from the week holding the fiscal year's first day.
        const fy = parseDmy(f.week_start) - (f.week - 1) * 7 * DAY;
        const monday = fy - ((new Date(fy).getUTCDay() + 6) % 7) * DAY;
        start = monday + (week - 1) * 7 * DAY;
      }
      const to = ctx.ignore.has('Q3') ? start + 6 * DAY : start + 7 * DAY;
      return (await all(ctx, `/zb/orders?from=${dmy(start)}&to=${dmy(to)}`)).filter((o) => counts(o, ctx)).reduce((s, o) => s + o.amount_minor, 0);
    }
    case 'customer-net': {
      const [a, b] = span(q.text);
      const c = (await customers()).find((c) => q.text.includes(`from ${c.name} `))!;
      const orders = (await dated(ctx, '/zb/orders', 'placed_at', a, b)).filter((o) => counts(o, ctx) && o.customer === c.id);
      const gross = orders.reduce((s, o) => s + o.amount_minor, 0);
      let refunded = 0;
      for (const x of await dated(ctx, '/zb/refunds', 'refunded_at', a, b)) {
        const id = ctx.ignore.has('Q10') ? x.order_ref : `o-${Number(x.order_ref.replace(/^ORD-/, ''))}`;
        const o = await fetch(`${base}/zb/orders/${id}`, { headers: { 'x-zb-tenant': 'tn-4471-kq' } });
        if (o.status === 200 && ((await o.json()) as any).customer === c.id) refunded += x.amount_minor;
      }
      return gross - refunded;
    }
  }
}
