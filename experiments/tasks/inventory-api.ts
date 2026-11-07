import type { CheckResult, Task, TaskContext } from '../lib/types.ts';
import { readJson, rng, scoreKeyed, write } from '../lib/util.ts';

/**
 * An internal inventory API with thin docs and undocumented quirks, asked a different question in each of four
 * sessions. Getting a correct client takes discovery: the auth header (only hinted at in WWW-Authenticate), epoch-
 * second timestamps, cursor links, European number formats, archived items, reversal movements, and a rate limit
 * without a Retry-After header. Meant for --mode sessions: each step is a fresh session, so the knowledge only carries
 * over if it was captured somewhere that persists (a script left in the work dir, or a promoted trod tool).
 */

const TOKEN = 'inv_9c41e0b77d2a';
const WAREHOUSES = ['AMS', 'BER', 'LIS', 'OSL'];
const NOW = Date.parse('2026-11-01T00:00:00Z');
const DAY = 86_400_000;

interface Item {
  sku: string;
  name: string;
  warehouse: string;
  qty: number;
  unit_cost: number; // cents
  previous_unit_cost: number;
  reorder_point: number;
  status: 'active' | 'archived';
  updated_at: number;
}
interface Movement { id: string; sku: string; delta: number; at: number; reversal_of?: string }

let cache: ReturnType<typeof build> | undefined;
function build() {
  const r = rng(6060);
  const items: Item[] = Array.from({ length: 64 }, (_, i) => {
    const cost = r.int(150, 250000);
    return {
      sku: `SKU-${String(4000 + i * 7)}`,
      name: `${r.pick(['Bolt', 'Valve', 'Panel', 'Cable', 'Hinge', 'Filter', 'Sensor', 'Bracket'])} ${r.pick(['A', 'B', 'C', 'X'])}${r.int(1, 99)}`,
      warehouse: r.pick(WAREHOUSES),
      qty: r.chance(0.15) ? r.int(1000, 25000) : r.int(0, 900),
      unit_cost: cost,
      previous_unit_cost: r.chance(0.3) ? Math.round(cost * (r.chance(0.5) ? r.int(70, 89) : r.int(111, 140)) / 100) : Math.round(cost * r.int(95, 105) / 100),
      reorder_point: r.int(5, 300),
      status: r.chance(0.12) ? 'archived' : 'active',
      updated_at: NOW - r.int(0, 40) * DAY - r.int(0, 23) * 3600_000,
    };
  });
  const movements: Movement[] = [];
  let mid = 1;
  for (const it of items) {
    for (let k = 0, n = r.int(0, 9); k < n; k++) {
      const m: Movement = { id: `MV-${mid++}`, sku: it.sku, delta: r.pick([-1, 1]) * r.int(1, 120), at: NOW - r.int(0, 30) * DAY - r.int(0, 86399) * 1000 };
      movements.push(m);
      if (r.chance(0.15)) movements.push({ id: `MV-${mid++}`, sku: it.sku, delta: -m.delta, at: m.at + r.int(1, 48) * 3600_000, reversal_of: m.id });
    }
  }
  movements.sort((a, b) => b.at - a.at);

  const active = items.filter((i) => i.status === 'active');
  const round2 = (cents: number) => Math.round(cents) / 100;
  const s1 = Object.fromEntries(WAREHOUSES.map((w) => [w, round2(active.filter((i) => i.warehouse === w).reduce((n, i) => n + i.qty * i.unit_cost, 0))]));
  const s2 = { skus: active.filter((i) => (i.warehouse === 'BER' || i.warehouse === 'LIS') && i.qty < i.reorder_point).map((i) => i.sku).sort() };
  const since3 = NOW - 14 * DAY;
  const reversed = new Set(movements.filter((m) => m.reversal_of).map((m) => m.reversal_of!));
  const s3: Record<string, number> = {};
  for (const m of movements) {
    const it = items.find((i) => i.sku === m.sku)!;
    if (it.warehouse !== 'AMS' || m.at < since3 || m.reversal_of || reversed.has(m.id)) continue;
    s3[m.sku] = (s3[m.sku] ?? 0) + m.delta;
  }
  for (const k of Object.keys(s3)) if (s3[k] === 0) delete s3[k];
  const since4 = NOW - 21 * DAY;
  const s4 = {
    skus: items
      .filter((i) => i.status === 'active' && i.updated_at >= since4 && Math.abs(i.unit_cost - i.previous_unit_cost) / i.previous_unit_cost > 0.1)
      .map((i) => i.sku)
      .sort(),
  };
  return { items, movements, expected: [s1, s2, s3, s4] };
}
const data = () => (cache ??= build());

/** European money: "€1.234,50". Quantities: "1.204 pcs". */
const eur = (cents: number) => `€${Math.floor(cents / 100).toLocaleString('de-DE')},${String(cents % 100).padStart(2, '0')}`;
const pcs = (n: number) => `${n.toLocaleString('de-DE')} pcs`;

const DOCS = `# Inventory API (v2)

Internal service, see the base URL in your task. Token: \`.secrets/inventory.token\`.

- \`GET /api/v2/warehouses\`
- \`GET /api/v2/items\` — paged. Filters: \`warehouse\`, \`updated_since\`.
- \`GET /api/v2/items/{sku}\`
- \`GET /api/v2/items/{sku}/movements\` — paged, newest first. Filter: \`since\`.

Please be gentle with the API, it is rate limited.
`;

const OUT = ['stock-value.json', 'reorder.json', 'movements.json', 'price-changes.json'];

const COMMON = (baseUrl?: string) =>
  `The inventory service runs at ${baseUrl} (docs: docs/inventory-api.md, which are incomplete; token in .secrets/inventory.token). ` +
  `"Active" items are those whose status is not archived. Money values are euros.`;

const QUESTIONS = [
  `For each warehouse, compute the total stock value of active items (quantity × unit cost). Write ${OUT[0]}: {"<warehouse code>": <value in euros, rounded to 2 decimals>, …} for every warehouse.`,
  `Which active items in warehouses BER and LIS have a quantity below their reorder point? Write ${OUT[1]}: {"skus": [sorted SKUs]}.`,
  `For warehouse AMS, compute the net stock movement per SKU over the last 14 days before 2026-11-01T00:00:00Z (movements at or after 2026-10-18T00:00:00Z). A reversal movement and the movement it reverses both do not count. Write ${OUT[2]}: {"<sku>": <net quantity>, …}, leaving out SKUs whose net is 0.`,
  `Which active items were updated on or after 2026-10-11T00:00:00Z and have a unit cost that differs from their previous unit cost by more than 10% (relative to the previous cost)? Write ${OUT[3]}: {"skus": [sorted SKUs]}.`,
];

function check(i: number) {
  return ({ work }: TaskContext): CheckResult => {
    const want = data().expected[i]!;
    const got = readJson(work, OUT[i]!);
    if (!got.ok) return { pass: false, score: 0, details: got.error };
    if ('skus' in want) {
      const w = (want as { skus: string[] }).skus;
      const g: string[] = Array.isArray(got.value?.skus) ? got.value.skus : [];
      const ok = w.filter((x) => g.includes(x)).length;
      const extra = g.filter((x) => !w.includes(x)).length;
      const score = Math.max(0, (ok - extra) / w.length);
      return { pass: ok === w.length && extra === 0, score, details: `${ok}/${w.length} SKUs, ${extra} extra` };
    }
    const norm = Object.fromEntries(Object.entries(got.value ?? {}).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]));
    return scoreKeyed(want as Record<string, unknown>, norm);
  };
}

const task: Task = {
  id: 'inventory-api',
  title: 'Answer questions from a quirky, rate-limited internal API, 4 sessions',
  kind: 'repetitive',
  repetitions: 64,
  setup: ({ work }) => {
    write(work, 'docs/inventory-api.md', DOCS);
    write(work, '.secrets/inventory.token', TOKEN + '\n');
    return data().expected;
  },
  handler: () => {
    const { items, movements } = data();
    // Rate limit: more than 4 requests in any 1 s window -> blocked for 1.5 s; 429 without a Retry-After header.
    let stamps: number[] = [];
    let blockedUntil = 0;
    return (req, res) => {
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      const t = Date.now();
      if (t < blockedUntil) return json(429, { error: 'slow down' });
      stamps = stamps.filter((s) => t - s < 1000);
      stamps.push(t);
      if (stamps.length > 4) {
        blockedUntil = t + 1500;
        return json(429, { error: 'slow down' });
      }
      if (req.headers['x-api-token'] !== TOKEN) {
        return json(401, { error: 'unauthenticated' }, { 'www-authenticate': 'Token header="X-Api-Token"' });
      }
      const url = new URL(req.url ?? '/', 'http://x');
      const p = url.pathname;
      const epoch = (name: string): number | undefined | 'bad' => {
        const v = url.searchParams.get(name);
        if (v === null) return undefined;
        return /^\d{9,11}$/.test(v) ? Number(v) * 1000 : 'bad';
      };
      const pageOf = <T,>(list: T[], base: string) => {
        const start = Number(url.searchParams.get('cursor') ?? 0) || 0;
        const next = start + 7 < list.length ? `${base}${base.includes('?') ? '&' : '?'}cursor=${start + 7}` : null;
        return { results: list.slice(start, start + 7), links: { next } };
      };
      const view = (i: Item) => ({
        sku: i.sku, name: i.name, warehouse: { code: i.warehouse, label: `Warehouse ${i.warehouse}` }, quantity: pcs(i.qty),
        unit_cost: eur(i.unit_cost), previous_unit_cost: eur(i.previous_unit_cost), reorder_point: i.reorder_point,
        archived: i.status === 'archived', updated: Math.floor(i.updated_at / 1000), _meta: { etag: `W/"${i.sku}-${i.updated_at}"`, revision: 3 },
      });
      if (p === '/api/v2/warehouses') return json(200, { results: WAREHOUSES.map((code) => ({ code, label: `Warehouse ${code}`, timezone: 'Europe/Berlin' })) });
      if (p === '/api/v2/items') {
        const since = epoch('updated_since');
        if (since === 'bad') return json(400, { error: 'invalid parameter' });
        const w = url.searchParams.get('warehouse');
        const list = items.filter((i) => (!w || i.warehouse === w) && (since === undefined || i.updated_at >= since)).map(view);
        const keep = [...url.searchParams].filter(([k]) => k !== 'cursor').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        return json(200, pageOf(list, `/api/v2/items${keep ? `?${keep}` : ''}`));
      }
      let m = p.match(/^\/api\/v2\/items\/(SKU-\d+)$/);
      if (m) {
        const it = items.find((i) => i.sku === m![1]);
        return it ? json(200, view(it)) : json(404, { error: 'not found' });
      }
      m = p.match(/^\/api\/v2\/items\/(SKU-\d+)\/movements$/);
      if (m) {
        const since = epoch('since');
        if (since === 'bad') return json(400, { error: 'invalid parameter' });
        const list = movements
          .filter((x) => x.sku === m![1] && (since === undefined || x.at >= since))
          .map((x) => ({ id: x.id, change: `${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)}`, at: Math.floor(x.at / 1000), ...(x.reversal_of ? { reverses: x.reversal_of } : {}), by: 'wms-sync' }));
        const keep = since === undefined ? '' : `?since=${url.searchParams.get('since')}`;
        return json(200, pageOf(list, `/api/v2/items/${m[1]}/movements${keep}`));
      }
      return json(404, { error: 'not found' });
    };
  },
  toolsmithBrief: ({ baseUrl }) =>
    `${COMMON(baseUrl)}\n\nFuture sessions will each answer one question about this inventory data, for example stock value per warehouse, ` +
    `items below their reorder point, net stock movements over a period, or recent price changes.`,
  steps: QUESTIONS.map((q, i) => ({
    prompt: ({ baseUrl }: TaskContext) => `${COMMON(baseUrl)}\n\n${q}\n\nWhen finished, reply DONE.`,
    check: check(i),
  })),
};
export default task;

export const _inventory = { data, TOKEN };
