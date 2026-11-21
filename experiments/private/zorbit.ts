/**
 * Round 19: "Zorbit", an invented internal order and billing service that no model can have seen.
 *
 * The data and the quirks' parameters (clock offset, throttle limit, region codes, fiscal year start, refund id
 * width) come from ZORBIT_SEED. The seed used for a published round stays out of the repository until the round is
 * written up, so neither the data nor the parameters can be memorized. The quirks' mechanisms are in this file, so
 * runs must execute as another OS user that cannot read experiments/private (see README.md).
 *
 * Quirks (Q1–Q12). Most are silent: they give a plausible wrong answer, not an error.
 *   Q1  requests need an X-Zb-Tenant header (400 "bad request" otherwise; GET /zb/ names it)
 *   Q2  date filters are DD.MM.YYYY (400 "bad date" otherwise)
 *   Q3  `to` is exclusive
 *   Q4  timestamps and date filters use the service's clock, a fixed offset with no marker (GET /zb/ shows it)
 *   Q5  voided orders are listed like the others (voided_at set) unless ?live=1
 *   Q6  each page repeats the previous page's last item first
 *   Q7  more than `throttle` requests within a second: paged responses silently return half a page (x-zb-throttled: 1)
 *   Q8  order lines give unit_price in major units (a decimal number); every other amount is integer minor units
 *   Q9  a return is an order line with negative qty
 *   Q10 refunds reference orders as ORD-000123 while orders are o-123
 *   Q11 some customers carry a region's legacy code (GET /zb/regions lists legacy codes)
 *   Q12 fiscal weeks start on the fiscal year's first day, not on Monday (GET /zb/fiscal)
 *
 * Answers are computed in this process from the data and never written to disk: the runner gives the run directory
 * (with expected.json) to the agent's user, so setup() returns only the task id.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

// ---------- seeded randomness ----------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rngFrom(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

// ---------- data ----------

export interface Params {
  clockMin: number;
  throttle: number;
  refWidth: number;
  /** First day of FY2026, as a UTC midnight timestamp of the service's local date. */
  fyStart: number;
}
export interface Region {
  code: string;
  name: string;
  legacy: string[];
}
export interface Customer {
  id: string;
  name: string;
  tier: 'gold' | 'silver' | 'bronze';
  region: string; // as served: a current or a legacy code
  regionName: string;
}
export interface Line {
  product: string;
  qty: number;
}
export interface Order {
  n: number;
  customer: string;
  at: number; // UTC ms
  voided: boolean;
  lines: Line[];
  amount: number; // minor units, net of return lines
}
export interface Refund {
  id: string;
  order: number;
  at: number;
  amount: number;
}
export interface Product {
  code: string;
  name: string;
  price: number; // minor units
}
export interface World {
  params: Params;
  regions: Region[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  refunds: Refund[];
}

const DAY = 86_400_000;
const REGION_NAMES = ['Varnholt', 'Quessa', 'Ondrimar', 'Teskel', 'Brunwick Flats', 'Lowmere'];
const PRODUCT_WORDS = ['Halyard', 'Spindle', 'Quoin', 'Ferrule', 'Gimbal', 'Tappet', 'Collet', 'Sprocket', 'Clevis', 'Grommet', 'Bushing', 'Toggle'];
const PRODUCT_KINDS = ['Mk I', 'Mk II'];
const SYL = ['ar', 'bel', 'cor', 'dun', 'ek', 'fal', 'gor', 'hal', 'ist', 'jun', 'kel', 'lor', 'mav', 'nor', 'osk', 'pel', 'quin', 'ras', 'sel', 'tor', 'ul', 'ven', 'wyn', 'zed'];

const worlds = new Map<string, World>();

export function seed(): string {
  return process.env.ZORBIT_SEED ?? 'zorbit-public-test-seed';
}

export function world(s = seed()): World {
  const cached = worlds.get(s);
  if (cached) return cached;
  const r = rngFrom(`${s}/world`);
  const params: Params = {
    clockMin: pick(r, [-300, -180, 210, 330, 345, 540]),
    throttle: int(r, 3, 5),
    refWidth: pick(r, [5, 6]),
    fyStart: Date.UTC(2026, 0, 1) + int(r, 5, 55) * DAY,
  };
  const letters = 'ABCDEFGHJKLMNPRSTVWXYZ';
  const usedCodes = new Set<string>();
  const regions: Region[] = REGION_NAMES.map((name, i) => {
    let code = '';
    do code = letters[int(r, 0, letters.length - 1)]! + letters[int(r, 0, letters.length - 1)]!;
    while (usedCodes.has(code));
    usedCodes.add(code);
    return { code, name, legacy: i % 2 === 0 ? [String(10 + int(r, 0, 89))] : [] };
  });
  const usedNames = new Set<string>();
  const customers: Customer[] = [];
  for (let i = 1; i <= 140; i++) {
    let name = '';
    do {
      const a = pick(r, SYL) + pick(r, SYL);
      const b = pick(r, SYL) + pick(r, SYL) + pick(r, SYL);
      name = `${a[0]!.toUpperCase()}${a.slice(1)} ${b[0]!.toUpperCase()}${b.slice(1)} ${pick(r, ['Ltd', 'GmbH', 'AB', 'Co', 'SARL'])}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    const reg = pick(r, regions);
    const tierRoll = r();
    customers.push({
      id: `c-${100 + i}`,
      name,
      tier: tierRoll < 0.2 ? 'gold' : tierRoll < 0.55 ? 'silver' : 'bronze',
      region: reg.legacy.length && r() < 0.35 ? reg.legacy[0]! : reg.code,
      regionName: reg.name,
    });
  }
  const products: Product[] = [];
  for (const w of PRODUCT_WORDS) for (const k of PRODUCT_KINDS) products.push({ code: `P-${110 + products.length * 7}`, name: `${w} ${k}`, price: int(r, 5, 180) * 50 });
  const orders: Order[] = [];
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 10, 1);
  for (let n = 1; n <= 1300; n++) {
    const at = start + Math.floor(r() * (end - start) / 1000) * 1000;
    const lines: Line[] = [];
    const k = int(r, 1, 4);
    for (let j = 0; j < k; j++) lines.push({ product: pick(r, products).code, qty: int(r, 1, 5) });
    if (r() < 0.14) {
      const l = pick(r, lines);
      lines.push({ product: l.product, qty: -int(r, 1, l.qty) });
    }
    const price = (c: string) => products.find((p) => p.code === c)!.price;
    orders.push({ n, customer: pick(r, customers).id, at, voided: r() < 0.08, lines, amount: lines.reduce((s, l) => s + l.qty * price(l.product), 0) });
  }
  orders.sort((a, b) => a.at - b.at);
  orders.forEach((o, i) => (o.n = i + 1));
  const refunds: Refund[] = [];
  for (const o of orders) {
    if (o.voided || o.amount <= 0 || r() >= 0.11) continue;
    const amount = Math.max(50, Math.round((o.amount * (0.1 + r() * 0.6)) / 50) * 50);
    refunds.push({ id: `rf-${1000 + refunds.length}`, order: o.n, at: o.at + int(r, 1, 20) * DAY + int(r, 0, 86_399) * 1000, amount });
  }
  refunds.sort((a, b) => a.at - b.at);
  const w: World = { params, regions, customers, products, orders, refunds };
  worlds.set(s, w);
  return w;
}

// ---------- service clock and formats ----------

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** The service's local wall-clock time of a UTC instant, as a Date whose UTC fields are that wall-clock time. */
const local = (w: World, at: number) => new Date(at + w.params.clockMin * 60_000);
const localStamp = (w: World, at: number) => {
  const d = local(w, at);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
/** Midnight (as UTC ms) of the local date of an instant. */
const localDay = (w: World, at: number) => {
  const d = local(w, at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const utcDay = (at: number) => Math.floor(at / DAY) * DAY;
const dmy = (day: number) => {
  const d = new Date(day);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};
const iso = (day: number) => new Date(day).toISOString().slice(0, 10);
const offsetLabel = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;
const orderId = (n: number) => `o-${n}`;
const refundRef = (w: World, n: number) => `ORD-${pad(n, w.params.refWidth)}`;

function fiscal(w: World, day: number): { fy: number; week: number; start: number; end: number } {
  let fyStart = w.params.fyStart;
  let fy = 2026;
  while (day < fyStart) {
    fyStart -= 364 * DAY;
    fy--;
  }
  while (day >= fyStart + 364 * DAY) {
    fyStart += 364 * DAY;
    fy++;
  }
  const week = Math.floor((day - fyStart) / (7 * DAY)) + 1;
  const start = fyStart + (week - 1) * 7 * DAY;
  return { fy, week, start, end: start + 6 * DAY };
}

// ---------- the service ----------

export const TENANT = 'tn-4471-kq';
const PAGE = 25;

function paged<T>(list: T[], page: number, throttled: boolean): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil((list.length - 1) / (PAGE - 1)));
  const startAt = (page - 1) * (PAGE - 1);
  let items = page >= 1 && page <= pages ? list.slice(startAt, startAt + PAGE) : [];
  if (throttled) items = items.slice(0, Math.ceil(items.length / 2));
  return { items, page, pages };
}

const ENDPOINTS = ['/zb/customers', '/zb/regions', '/zb/products', '/zb/orders', '/zb/orders/{id}', '/zb/lines', '/zb/refunds', '/zb/fiscal'];

export interface PracticeHooks {
  token: string;
  /** Called on POST /_practice/reset: returns the next practice question. */
  reset(): string;
  /** Called on POST /_practice/try with the posted answer.json text. */
  attempt(body: string): CheckResult;
}

export function handler(w: World, practice?: PracticeHooks) {
  let stamps: number[] = [];
  return (req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => serve(req, res, body));
  };
  function serve(req: IncomingMessage, res: ServerResponse, body: string) {
    const json = (status: number, data: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (practice && p.startsWith('/_practice/')) {
      if (req.headers['x-zb-practice'] !== practice.token) return json(404, { error: 'not found' });
      if (p === '/_practice/reset') return json(200, { question: practice.reset() });
      if (p === '/_practice/try') return json(200, practice.attempt(body));
      return json(404, { error: 'not found' });
    }
    const t = Date.now();
    stamps = stamps.filter((s) => t - s < 1000);
    stamps.push(t);
    const throttled = stamps.length > w.params.throttle;
    const hdr: Record<string, string> = throttled ? { 'x-zb-throttled': '1' } : {};
    if (p === '/zb') return json(200, { service: 'zorbit', version: '4.2.1', clock: offsetLabel(w.params.clockMin), auth: 'X-Zb-Tenant header', endpoints: ENDPOINTS });
    if (req.headers['x-zb-tenant'] !== TENANT) return json(400, { error: 'bad request' });
    const page = Number(url.searchParams.get('page') ?? 1) || 1;
    const range = (): [number, number] | 'bad' | undefined => {
      const f = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (f === null && to === null) return undefined;
      const parse = (v: string | null, dflt: number) => {
        if (v === null) return dflt;
        const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        return m ? Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!) : NaN;
      };
      const a = parse(f, -Infinity);
      const b = parse(to, Infinity);
      return Number.isNaN(a) || Number.isNaN(b) ? 'bad' : [a, b];
    };
    const inRange = (at: number, rg: [number, number] | undefined) => !rg || (localDay(w, at) >= rg[0] && localDay(w, at) < rg[1]);
    const orderView = (o: Order) => ({ id: orderId(o.n), customer: o.customer, placed_at: localStamp(w, o.at), amount_minor: o.amount, voided_at: o.voided ? localStamp(w, o.at + 3 * 3_600_000) : null });
    const priceOf = (code: string) => w.products.find((x) => x.code === code)!.price;
    const lineView = (o: Order, l: Line, j: number) => ({ id: `${orderId(o.n)}/${j + 1}`, order_id: orderId(o.n), product: l.product, qty: l.qty, unit_price: priceOf(l.product) / 100 });

    if (p === '/zb/customers') return json(200, paged(w.customers.map((c) => ({ id: c.id, name: c.name, tier: c.tier, region: c.region })), page, throttled), hdr);
    if (p === '/zb/regions') return json(200, { items: w.regions.map((r) => ({ code: r.code, name: r.name, legacy_codes: r.legacy })) });
    if (p === '/zb/products') return json(200, { items: w.products.map((x) => ({ code: x.code, name: x.name, list_price_minor: x.price })) });
    if (p === '/zb/fiscal') {
      const d = url.searchParams.get('date')?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!d) return json(400, { error: 'bad date' });
      const f = fiscal(w, Date.UTC(+d[3]!, +d[2]! - 1, +d[1]!));
      return json(200, { fiscal_year: f.fy, week: f.week, week_start: dmy(f.start), week_end: dmy(f.end) });
    }
    const m = p.match(/^\/zb\/orders\/(o-\d+)$/);
    if (m) {
      const o = w.orders.find((x) => orderId(x.n) === m[1]);
      return o ? json(200, { ...orderView(o), lines: o.lines.map((l, j) => lineView(o, l, j)) }) : json(404, { error: 'not found' });
    }
    if (p === '/zb/orders' || p === '/zb/lines' || p === '/zb/refunds') {
      const rg = range();
      if (rg === 'bad') return json(400, { error: 'bad date' });
      if (p === '/zb/orders') {
        const live = url.searchParams.get('live') === '1';
        return json(200, paged(w.orders.filter((o) => inRange(o.at, rg) && (!live || !o.voided)).map(orderView), page, throttled), hdr);
      }
      if (p === '/zb/lines') return json(200, paged(w.orders.filter((o) => inRange(o.at, rg)).flatMap((o) => o.lines.map((l, j) => lineView(o, l, j))), page, throttled), hdr);
      return json(200, paged(w.refunds.filter((x) => inRange(x.at, rg)).map((x) => ({ id: x.id, order_ref: refundRef(w, x.order), amount_minor: x.amount, refunded_at: localStamp(w, x.at) })), page, throttled), hdr);
    }
    return json(404, { error: 'not found' });
  }
}

// ---------- tasks ----------

export type Kind = 'revenue' | 'region-orders' | 'net-units' | 'returned-value' | 'region-refunds' | 'tier-customers' | 'fiscal-revenue' | 'customer-net';
export interface Question {
  id: string;
  kind: Kind;
  split: 'train' | 'test';
  text: string;
  answer: number | Record<string, number>;
  quirks: string[];
}

const KINDS: { kind: Kind; n: number; quirks: string[] }[] = [
  { kind: 'revenue', n: 8, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] },
  { kind: 'region-orders', n: 8, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q11'] },
  { kind: 'net-units', n: 8, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q9'] },
  { kind: 'returned-value', n: 8, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9'] },
  { kind: 'region-refunds', n: 7, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q6', 'Q7', 'Q10', 'Q11'] },
  { kind: 'tier-customers', n: 7, quirks: ['Q1', 'Q6', 'Q7', 'Q11'] },
  { kind: 'fiscal-revenue', n: 7, quirks: ['Q1', 'Q2', 'Q3', 'Q5', 'Q6', 'Q7', 'Q12'] },
  { kind: 'customer-net', n: 7, quirks: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q10'] },
];
/** Per kind, how many variants go to train; the rest (5 each, 40 in all) are test. */
const TRAIN_PER_KIND = 3;

const regionOf = (w: World, customerId: string) => w.customers.find((c) => c.id === customerId)!.regionName;
const live = (w: World, from: number, to: number) => w.orders.filter((o) => !o.voided && utcDay(o.at) >= from && utcDay(o.at) <= to);

export function questions(s = seed()): Question[] {
  const w = world(s);
  const r = rngFrom(`${s}/tasks`);
  const out: Question[] = [];
  const period = (minDays: number, maxDays: number): [number, number] => {
    const from = Date.UTC(2026, 1, 2) + int(r, 0, 230) * DAY;
    return [from, from + int(r, minDays, maxDays) * DAY - DAY];
  };
  const span = (a: number, b: number) => `from ${iso(a)} to ${iso(b)} (UTC dates, both inclusive)`;
  for (const { kind, n, quirks } of KINDS) {
    for (let i = 0; i < n; i++) {
      const id = `${kind}-${i + 1}`;
      const split = i < TRAIN_PER_KIND - (n === 7 ? 1 : 0) ? 'train' : 'test';
      let text = '';
      let answer: number | Record<string, number> = 0;
      if (kind === 'revenue') {
        const [a, b] = period(5, 9);
        text = `What was our revenue from orders placed ${span(a, b)}?`;
        answer = live(w, a, b).reduce((s, o) => s + o.amount, 0);
      } else if (kind === 'region-orders') {
        const [a, b] = period(6, 10);
        text = `How many orders did each sales region get ${span(a, b)}? Voided orders do not count. Answer with an object that maps every region's name to its count, e.g. {"answer": {"<region name>": 3, ...}}, including regions with 0.`;
        const counts: Record<string, number> = Object.fromEntries(w.regions.map((x) => [x.name, 0]));
        for (const o of live(w, a, b)) counts[regionOf(w, o.customer)]!++;
        answer = counts;
      } else if (kind === 'net-units') {
        // A product with a return line and a voided order in the period, so Q5 and Q9 both matter.
        let prod = pick(r, w.products);
        let [a, b] = period(14, 28);
        for (let tries = 0; tries < 200; tries++) {
          const inP = w.orders.filter((o) => utcDay(o.at) >= a && utcDay(o.at) <= b && o.lines.some((l) => l.product === prod.code));
          if (inP.some((o) => o.voided) && inP.some((o) => !o.voided && o.lines.some((l) => l.product === prod.code && l.qty < 0))) break;
          prod = pick(r, w.products);
          [a, b] = period(14, 28);
        }
        text = `How many units of ${prod.name} did we sell, net of returns, in orders placed ${span(a, b)}?`;
        answer = live(w, a, b).flatMap((o) => o.lines).filter((l) => l.product === prod.code).reduce((s, l) => s + l.qty, 0);
      } else if (kind === 'returned-value') {
        const [a, b] = period(18, 30);
        text = `What was the total value of the units customers returned, at their unit price, in orders placed ${span(a, b)}? Give it as a positive amount in cents.`;
        answer = live(w, a, b).flatMap((o) => o.lines).filter((l) => l.qty < 0).reduce((s, l) => s - l.qty * w.products.find((x) => x.code === l.product)!.price, 0);
      } else if (kind === 'region-refunds') {
        // Regions with a legacy code, so Q11 matters as well as Q10.
        const withLegacy = w.regions.filter((x) => x.legacy.length);
        const reg = withLegacy[i % withLegacy.length]!;
        let [a, b] = period(20, 35);
        for (let tries = 0; tries < 200; tries++) {
          const legacyRefund = w.refunds.some((x) => utcDay(x.at) >= a && utcDay(x.at) <= b && reg.legacy.includes(w.customers.find((c) => c.id === w.orders.find((o) => o.n === x.order)!.customer)!.region));
          if (legacyRefund) break;
          [a, b] = period(20, 35);
        }
        text = `What was the total of the refunds issued ${span(a, b)} on orders of customers in the ${reg.name} region?`;
        answer = w.refunds.filter((x) => utcDay(x.at) >= a && utcDay(x.at) <= b && regionOf(w, w.orders.find((o) => o.n === x.order)!.customer) === reg.name).reduce((s, x) => s + x.amount, 0);
      } else if (kind === 'tier-customers') {
        // Tier and region pairs that include a customer filed under a legacy code (Q11).
        const pairs = w.regions
          .filter((x) => x.legacy.length)
          .flatMap((x) => (['gold', 'silver', 'bronze'] as const).map((t) => ({ reg: x, tier: t })))
          .filter(({ reg, tier }) => w.customers.some((c) => c.tier === tier && c.region === reg.legacy[0]));
        const { reg, tier } = pairs[i % pairs.length]!;
        text = `How many ${tier}-tier customers do we have in the ${reg.name} region?`;
        answer = w.customers.filter((c) => c.tier === tier && c.regionName === reg.name).length;
      } else if (kind === 'fiscal-revenue') {
        const week = int(r, 3, 36);
        text = `What was our revenue in fiscal week ${week} of fiscal year 2026, as finance counts fiscal weeks (in the service's own calendar)?`;
        const start = w.params.fyStart + (week - 1) * 7 * DAY;
        answer = w.orders.filter((o) => !o.voided && localDay(w, o.at) >= start && localDay(w, o.at) < start + 7 * DAY).reduce((s, o) => s + o.amount, 0);
      } else {
        let [a, b] = period(45, 70);
        // A customer with at least two orders and one refund in the period, so the joins matter.
        const pickable = () => w.customers.filter((c) => {
          const os = live(w, a, b).filter((o) => o.customer === c.id);
          const voided = w.orders.some((o) => o.voided && o.customer === c.id && utcDay(o.at) >= a && utcDay(o.at) <= b);
          return os.length >= 2 && voided && w.refunds.some((x) => utcDay(x.at) >= a && utcDay(x.at) <= b && w.orders.find((o) => o.n === x.order)!.customer === c.id);
        });
        const cands = pickable();
        for (let tries = 0; tries < 200 && !cands.length; tries++) {
          [a, b] = period(45, 70);
          cands.push(...pickable());
        }
        const c = pick(r, cands);
        text = `What was the net revenue from ${c.name} ${span(a, b)}: the amounts of their orders placed in that period, minus the refunds issued to them in that period?`;
        const gross = live(w, a, b).filter((o) => o.customer === c.id).reduce((s, o) => s + o.amount, 0);
        const refunded = w.refunds.filter((x) => utcDay(x.at) >= a && utcDay(x.at) <= b && w.orders.find((o) => o.n === x.order)!.customer === c.id).reduce((s, x) => s + x.amount, 0);
        answer = gross - refunded;
      }
      out.push({ id, kind, split, text, answer, quirks });
    }
  }
  return out;
}

export function grade(q: Question, raw: string): CheckResult {
  let got: unknown;
  try {
    got = (JSON.parse(raw) as { answer?: unknown }).answer;
  } catch {
    return { pass: false, score: 0, details: 'answer.json missing or not JSON' };
  }
  if (typeof q.answer === 'number') {
    const n = typeof got === 'string' ? Number(got.replace(/[, _]/g, '')) : got;
    return n === q.answer ? { pass: true, score: 1, details: 'correct' } : { pass: false, score: 0, details: `wrong (got ${JSON.stringify(got)?.slice(0, 40)})` };
  }
  if (!got || typeof got !== 'object') return { pass: false, score: 0, details: 'expected an object of counts' };
  const want = q.answer;
  const g = got as Record<string, unknown>;
  const right = Object.keys(want).filter((k) => Number(g[k] ?? 0) === want[k]).length;
  const n = Object.keys(want).length;
  return { pass: right === n, score: right / n, details: `${right}/${n} regions right` };
}

// ---------- the agent's side ----------

export const DOCS = `# Zorbit API (internal)

Zorbit is our order and billing service. The base URL is in \`.service/base-url\`. Every request must identify the
tenant; the tenant id is in \`.zorbit/tenant\`.

| Endpoint | What |
|---|---|
| GET /zb/ | service index |
| GET /zb/customers | customers (paged: \`?page=N\`) |
| GET /zb/regions | sales regions |
| GET /zb/products | product catalogue |
| GET /zb/orders?from=&to= | orders in a date range (paged) |
| GET /zb/orders/{id} | one order with its lines |
| GET /zb/lines?from=&to= | order lines of the orders in a date range (paged) |
| GET /zb/refunds?from=&to= | refunds issued in a date range (paged) |
| GET /zb/fiscal?date= | the fiscal calendar |

Amounts are integers in minor units (cents).
`;

export const COMMON = `You work with Zorbit, the company's internal order and billing service. Its documentation is in docs/zorbit.md, its base URL in .service/base-url and our tenant id in .zorbit/tenant.`;
export const ASK = (q: Question) => `${COMMON}\n\n${q.text}\n\nWrite the answer to answer.json as {"answer": ...}. Amounts are integers in cents. When finished, reply DONE.`;

/** Writes the agent's workspace: docs, tenant, and (ZORBIT_NOTES) a CLAUDE.md. */
export function writeWorkspace(work: string): void {
  mkdirSync(path.join(work, 'docs'), { recursive: true });
  mkdirSync(path.join(work, '.zorbit'), { recursive: true });
  writeFileSync(path.join(work, 'docs', 'zorbit.md'), DOCS);
  writeFileSync(path.join(work, '.zorbit', 'tenant'), TENANT + '\n');
  rmSync(path.join(work, 'answer.json'), { force: true });
  if (process.env.ZORBIT_NOTES) cpSync(process.env.ZORBIT_NOTES, path.join(work, 'CLAUDE.md'), { dereference: true });
  else rmSync(path.join(work, 'CLAUDE.md'), { force: true });
}

export function zorbitIds(split: string): string[] {
  const qs = questions();
  if (split === 'all') return qs.map((q) => q.id);
  if (split === 'pilot') return qs.filter((q) => q.split === 'train').map((q) => q.id);
  return qs.filter((q) => q.split === split).map((q) => q.id);
}

export function zorbitTasks(ids: string[]): Task[] {
  const qs = new Map(questions().map((q) => [q.id, q]));
  return ids.map((id): Task => {
    const q = qs.get(id);
    if (!q) throw new Error(`zorbit: no task ${id}`);
    return {
      id,
      title: `Zorbit ${id}`,
      kind: 'repetitive',
      repetitions: 1,
      forgeKey: 'zorbit',
      // Only the id: the runner writes setup()'s value to expected.json in a directory the agent's user owns.
      setup: ({ work }: TaskContext) => {
        writeWorkspace(work);
        return { task: id };
      },
      handler: () => handler(world()),
      steps: [
        {
          prompt: () => ASK(q),
          check: async ({ work }: TaskContext) => {
            const { readFileSync, existsSync } = await import('node:fs');
            const f = path.join(work, 'answer.json');
            return grade(q, existsSync(f) ? readFileSync(f, 'utf8') : '');
          },
        },
      ],
    };
  });
}

/** Every quirk written down, with this seed's parameters: the calibration ceiling, never an arm. */
export function oracleNotes(s = seed()): string {
  const w = world(s);
  const legacy = w.regions.filter((r) => r.legacy.length).map((r) => `${r.legacy[0]} = ${r.code} (${r.name})`).join(', ');
  return `# Zorbit: what every session must know

- Send the tenant id in an \`X-Zb-Tenant\` header on every request.
- Date filters are DD.MM.YYYY, and \`to\` is exclusive: for an inclusive end date pass the day after.
- Timestamps (placed_at, refunded_at) and date filters use the service clock, UTC${offsetLabel(w.params.clockMin)}, with no marker. Convert to UTC before deciding which UTC date something falls on; query one extra day on each side and filter yourself.
- Voided orders are listed like the others (voided_at is set). They are not revenue and do not count as orders; \`?live=1\` leaves them out.
- Paged endpoints repeat the previous page's last item at the top of the next page: de-duplicate by id.
- More than ${w.params.throttle} requests in one second makes paged responses silently return half a page (header \`x-zb-throttled: 1\`). Sleep 0.4 s between requests and refetch any page that carries that header.
- Order lines give \`unit_price\` in major units (12.5 = 1250 cents); every other amount is integer cents.
- A return is an order line with negative qty; there is no returns endpoint.
- Refunds reference orders as \`ORD-${'0'.repeat(w.params.refWidth - 3)}123\` for order \`o-123\`.
- Some customers carry a region's legacy code: ${legacy}. Map those to the region before grouping.
- Fiscal weeks start on the fiscal year's first day (${iso(w.params.fyStart)} for FY2026), not on Monday; use \`/zb/fiscal?date=\`.
`;
}
