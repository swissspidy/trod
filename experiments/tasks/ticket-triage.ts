import { createHmac } from 'node:crypto';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';
import { readJson, rng, write } from '../lib/util.ts';

/**
 * Triage support tickets through an HMAC-signed, paginated, rate-limited API with noisy responses. Every ticket
 * needs several signed calls (ticket, customer, events across pages, incidents) before the policy can be applied.
 * Each step brings new open tickets. A tool that wraps "signed request + pagination + retries + keep only what
 * matters" is reused for every ticket in every step.
 */

const LABELS = ['regional_outage', 'account_locked', 'billing_card_expired', 'plan_limit', 'export_bug', 'how_to'] as const;
type Label = (typeof LABELS)[number];
const REGIONS = ['eu-west', 'us-east', 'ap-south'];
const SECRET = 'trod-ticket-secret-7f3a91';
const KEY_ID = 'k_live_4821';
const H = 3600_000;
const BASE = Date.parse('2026-10-20T00:00:00Z');
const STEP_TICKETS = [10, 8, 8, 8];

interface Customer { id: string; name: string; region: string; plan: string; card_exp: string }
interface Event { id: string; customer: string; type: string; at: number; detail: Record<string, string> }
interface Incident { id: string; region: string; start: number; end: number; component: string }
interface Ticket { id: string; customer: string; created: number; subject: string; body: string; step: number }

const TEXT: Record<Label, [string, string][]> = {
  regional_outage: [['Nothing loads', 'Since this morning the dashboard just spins. Colleagues see the same. Is something down?'], ['Exports failing', 'Our scheduled export did not arrive and the app is very slow.']],
  account_locked: [['Cannot sign in', 'I keep getting an error when signing in, now it says try later.'], ['Access problem', 'Two of us cannot get into the account since yesterday.']],
  billing_card_expired: [['Features disabled?', 'Premium features vanished from our workspace overnight. Did something change on your side?'], ['Account limited', 'We get a banner about our subscription and some features are greyed out.']],
  plan_limit: [['Export blocked', 'Exports stopped working, we get a message about limits.'], ['API errors', 'Our integration started failing with errors this week.']],
  export_bug: [['Export timeout', 'Large exports fail after a few minutes, small ones are fine.'], ['Report download broken', 'The monthly report download never finishes.']],
  how_to: [['How do I add users?', 'Where can I invite colleagues to our workspace?'], ['Change billing email', 'How can I change the email address invoices go to?']],
};

function world() {
  const r = rng(5150);
  const customers: Customer[] = Array.from({ length: 30 }, (_, i) => ({
    id: `C-${1000 + i * 13}`,
    name: `Customer ${i + 1}`,
    region: r.pick(REGIONS),
    plan: r.pick(['starter', 'team', 'business']),
    card_exp: '2027-08',
  }));
  const events: Event[] = [];
  const incidents: Incident[] = [];
  const tickets: Ticket[] = [];
  let eid = 1;
  let tid = 100;
  const ev = (customer: string, type: string, at: number, detail: Record<string, string> = {}) =>
    events.push({ id: `E-${eid++}`, customer, type, at, detail });

  // Background noise: routine events for everyone.
  for (const c of customers) for (let i = 0; i < r.int(15, 30); i++) ev(c.id, r.pick(['login_succeeded', 'export_succeeded', 'payment_succeeded', 'user_invited', 'settings_changed']), BASE - 10 * 24 * H + r.int(0, 50 * 24) * H);
  // Old incidents everywhere (distractors).
  for (const region of REGIONS) incidents.push({ id: `INC-${incidents.length + 1}`, region, start: BASE - r.int(5, 9) * 24 * H, end: BASE - r.int(2, 4) * 24 * H, component: 'api' });

  STEP_TICKETS.forEach((n, step) => {
    for (let k = 0; k < n; k++) {
      const c = r.pick(customers);
      const created = BASE + step * 2 * 24 * H + r.int(2, 40) * H;
      const intended = r.pick(LABELS);
      const at = (hBefore: number) => created - hBefore * H;
      switch (intended) {
        case 'regional_outage':
          incidents.push({ id: `INC-${incidents.length + 1}`, region: c.region, start: at(r.int(3, 6)), end: created + 3 * H, component: r.pick(['api', 'exports', 'web']) });
          if (r.chance(0.6)) ev(c.id, 'export_failed', at(2), { code: 'E_UPSTREAM' });
          break;
        case 'account_locked':
          for (let i = 0; i < 5; i++) ev(c.id, 'login_failed', at(30 - i), { reason: 'bad_password' });
          ev(c.id, 'account_locked', at(25), { by: 'policy' });
          break;
        case 'billing_card_expired':
          c.card_exp = '2026-09';
          ev(c.id, 'payment_failed', at(r.int(5, 15)), { reason: 'card_expired' });
          break;
        case 'plan_limit':
          ev(c.id, 'quota_exceeded', at(r.int(5, 60)), { resource: r.pick(['exports', 'api_calls']) });
          break;
        case 'export_bug':
          ev(c.id, 'export_failed', at(r.int(3, 50)), { code: 'E_EXPORT_TIMEOUT' });
          break;
        case 'how_to':
          break;
      }
      // Distractors: stale or resolved evidence.
      if (r.chance(0.35)) ev(c.id, 'payment_failed', at(r.int(80, 200)), { reason: 'card_expired' });
      if (r.chance(0.3)) {
        ev(c.id, 'payment_failed', at(40), { reason: 'card_expired' });
        ev(c.id, 'payment_succeeded', at(20), { method: 'new_card' });
      }
      if (r.chance(0.3)) ev(c.id, 'quota_exceeded', at(r.int(100, 300)), { resource: 'exports' });
      if (r.chance(0.25)) {
        ev(c.id, 'account_locked', at(50), { by: 'policy' });
        ev(c.id, 'account_unlocked', at(45), { by: 'support' });
      }
      const [subject, body] = r.pick(TEXT[intended]);
      tickets.push({ id: `T-${tid++}`, customer: c.id, created, subject, body, step });
    }
  });
  events.sort((a, b) => b.at - a.at);
  return { customers, events, incidents, tickets };
}

type World = ReturnType<typeof world>;

/** The policy in docs/TRIAGE.md, applied to the data. */
function label(w: World, t: Ticket): Label {
  const c = w.customers.find((x) => x.id === t.customer)!;
  const window = (e: Event) => e.customer === c.id && e.at <= t.created && e.at >= t.created - 72 * H;
  const evs = w.events.filter(window).sort((a, b) => a.at - b.at);
  const lastOf = (types: string[]) => evs.filter((e) => types.includes(e.type)).at(-1);
  if (w.incidents.some((i) => i.region === c.region && i.start <= t.created && i.end >= t.created - 6 * H)) return 'regional_outage';
  if (lastOf(['account_locked', 'account_unlocked'])?.type === 'account_locked') return 'account_locked';
  const pay = lastOf(['payment_failed', 'payment_succeeded']);
  if (pay?.type === 'payment_failed' && pay.detail.reason === 'card_expired' && c.card_exp < '2026-10') return 'billing_card_expired';
  if (evs.some((e) => e.type === 'quota_exceeded')) return 'plan_limit';
  if (evs.some((e) => e.type === 'export_failed' && e.detail.code === 'E_EXPORT_TIMEOUT')) return 'export_bug';
  return 'how_to';
}

let cache: { w: World; expected: Record<string, Label>[] } | undefined;
function data() {
  if (!cache) {
    const w = world();
    cache = { w, expected: STEP_TICKETS.map((_, s) => Object.fromEntries(w.tickets.filter((t) => t.step === s).map((t) => [t.id, label(w, t)]))) };
  }
  return cache;
}

const TRIAGE_MD = `# Ticket triage policy

Assign every open ticket exactly one label. Check the rules in this order and use the first that applies.
"Window" means the 72 hours up to and including the ticket's created_at. Times are ISO 8601 UTC.

1. **regional_outage**: an incident in the customer's region that started at or before the ticket's created_at and
   ended no earlier than 6 hours before it.
2. **account_locked**: within the window, the customer's latest event of type account_locked / account_unlocked is
   account_locked.
3. **billing_card_expired**: within the window, the latest payment_failed / payment_succeeded event is a
   payment_failed with reason card_expired, AND the customer's card expiry (billing.card_exp, YYYY-MM) is before 2026-10.
4. **plan_limit**: a quota_exceeded event within the window.
5. **export_bug**: an export_failed event with code E_EXPORT_TIMEOUT within the window.
6. **how_to**: none of the above.

The ticket text describes symptoms only; it is not evidence.
`;

const API_MD = `# Support API

Base URL: given in the task. All responses are JSON.

## Authentication
Every request needs three headers:
- \`X-Key-Id\`: the key id from .secrets/support-api.json
- \`X-Timestamp\`: current Unix time in milliseconds (must be within 60 s of the server clock)
- \`X-Signature\`: base64 of HMAC-SHA256(secret, METHOD + "\\n" + PATH_WITH_QUERY + "\\n" + X-Timestamp),
  e.g. the string "GET\\n/v1/tickets?status=open\\n1793960000000"

Unsigned or wrongly signed requests get 401.

## Rate limiting
The API answers 429 now and then, with a Retry-After header in seconds. Retry after that delay.

## Endpoints
- \`GET /v1/tickets?status=open[&page_token=…]\` → \`{"data": [ticket summaries], "next_page_token": string|null}\`
- \`GET /v1/tickets/{id}\` → the ticket, with \`customer_id\` and \`created_at\`
- \`GET /v1/customers/{id}\` → the customer, including \`region\` and \`billing.card_exp\`
- \`GET /v1/customers/{id}/events?until=ISO&since=ISO[&page_token=…]\` → events, newest first, 10 per page:
  \`{"data": [{"id","type","occurred_at","detail",…}], "next_page_token": string|null}\`
- \`GET /v1/status/incidents?region=REGION\` → \`{"data": [{"id","region","started_at","resolved_at","component",…}]}\`
`;

const iso = (ms: number) => new Date(ms).toISOString();
const noise = (seed: string, n: number) => {
  const r = rng(seed.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`x_${['trace', 'audit', 'meta', 'shard', 'ver'][i % 5]}_${i}`, Math.floor(r.next() * 1e12).toString(36).repeat(3)]));
};

const OUT = (i: number) => `triage-${i + 1}.json`;

function check(i: number) {
  return ({ work }: TaskContext): CheckResult => {
    const want = data().expected[i]!;
    const got = readJson(work, OUT(i));
    if (!got.ok) return { pass: false, score: 0, details: got.error };
    const ids = Object.keys(want);
    const wrong = ids.filter((id) => got.value?.[id] !== want[id]);
    const extra = Object.keys(got.value ?? {}).filter((id) => !(id in want));
    return {
      pass: wrong.length === 0 && extra.length === 0,
      score: (ids.length - wrong.length) / ids.length,
      details: `${ids.length - wrong.length}/${ids.length} correct` + (wrong.length ? `; wrong: ${wrong.slice(0, 4).map((id) => `${id} (got ${got.value?.[id]}, want ${want[id]})`).join(', ')}` : '') + (extra.length ? `; ${extra.length} extra` : ''),
    };
  };
}

const task: Task = {
  id: 'ticket-triage',
  title: 'Triage support tickets through a signed, paginated API, 4 batches',
  kind: 'repetitive',
  repetitions: 9,
  setup: ({ work }) => {
    write(work, 'docs/TRIAGE.md', TRIAGE_MD);
    write(work, 'docs/API.md', API_MD);
    write(work, '.secrets/support-api.json', JSON.stringify({ key_id: KEY_ID, secret: SECRET }, null, 2) + '\n');
    return data().expected;
  },
  handler: (_expected, state) => {
    const { w } = data();
    let n = 0;
    return (req, res) => {
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      const pathq = req.url ?? '/';
      const ts = String(req.headers['x-timestamp'] ?? '');
      const sig = createHmac('sha256', SECRET).update(`${req.method}\n${pathq}\n${ts}`).digest('base64');
      if (req.headers['x-key-id'] !== KEY_ID || req.headers['x-signature'] !== sig || Math.abs(Date.now() - Number(ts)) > 60_000) {
        return json(401, { error: { code: 'unauthorized', message: 'Request signature could not be verified.' } });
      }
      if (++n % 7 === 0) return json(429, { error: { code: 'rate_limited' } }, { 'retry-after': '1' });
      const url = new URL(pathq, 'http://x');
      const p = url.pathname;
      const page = <T,>(items: T[], size: number) => {
        const start = Number(Buffer.from(url.searchParams.get('page_token') ?? 'MA==', 'base64').toString()) || 0;
        const slice = items.slice(start, start + size);
        return { data: slice, next_page_token: start + size < items.length ? Buffer.from(String(start + size)).toString('base64') : null };
      };
      if (p === '/v1/tickets') {
        if (url.searchParams.get('status') !== 'open') return json(400, { error: { code: 'bad_request', message: 'status=open is required' } });
        const open = w.tickets.filter((t) => t.step === state.step);
        return json(200, page(open.map((t) => ({ id: t.id, subject: t.subject, status: 'open', priority: 'normal', ...noise(t.id, 4) })), 4));
      }
      let m = p.match(/^\/v1\/tickets\/(T-\d+)$/);
      if (m) {
        const t = w.tickets.find((x) => x.id === m![1] && x.step <= state.step);
        if (!t) return json(404, { error: { code: 'not_found' } });
        return json(200, {
          id: t.id, subject: t.subject, body: t.body, body_html: `<div class="msg"><p>${t.body}</p><p>--<br>Sent from the web form</p></div>`,
          customer_id: t.customer, created_at: iso(t.created), status: 'open', channel: 'web', tags: ['inbound'],
          attachments: [], requester: { email: `user@${t.customer.toLowerCase()}.example`, locale: 'en' }, metadata: noise(t.id + 'm', 12),
        });
      }
      m = p.match(/^\/v1\/customers\/(C-\d+)$/);
      if (m) {
        const c = w.customers.find((x) => x.id === m![1]);
        if (!c) return json(404, { error: { code: 'not_found' } });
        return json(200, { id: c.id, name: c.name, region: c.region, plan: c.plan, seats: 12, billing: { card_exp: c.card_exp, card_brand: 'visa', last4: '4242', currency: 'EUR' }, settings: noise(c.id + 's', 15), created_at: '2024-01-01T00:00:00.000Z' });
      }
      m = p.match(/^\/v1\/customers\/(C-\d+)\/events$/);
      if (m) {
        const until = Date.parse(url.searchParams.get('until') ?? '2100-01-01');
        const since = Date.parse(url.searchParams.get('since') ?? '2000-01-01');
        const evs = w.events.filter((e) => e.customer === m![1] && e.at <= until && e.at >= since && e.at <= BASE + (state.step + 1) * 2 * 24 * H + 48 * H);
        return json(200, page(evs.map((e) => ({ id: e.id, type: e.type, occurred_at: iso(e.at), detail: e.detail, source: 'platform', context: noise(e.id, 6) })), 10));
      }
      if (p === '/v1/status/incidents') {
        const region = url.searchParams.get('region');
        return json(200, { data: w.incidents.filter((i) => i.region === region).map((i) => ({ id: i.id, region: i.region, started_at: iso(i.start), resolved_at: iso(i.end), component: i.component, postmortem_url: null, updates: [{ at: iso(i.start), text: 'Investigating elevated error rates.' }, { at: iso(i.end), text: 'Resolved.' }] })) });
      }
      return json(404, { error: { code: 'not_found' } });
    };
  },
  steps: [0, 1, 2, 3].map((i) => ({
    prompt: ({ baseUrl }: TaskContext) =>
      // Standalone: works as a follow-up and in a fresh session.
      `Our support API runs at ${baseUrl} (docs in docs/API.md, credentials in .secrets/support-api.json). Triage every currently open ticket according to docs/TRIAGE.md and write ${OUT(i)}: a JSON object mapping ticket id to label. New tickets arrive regularly and will need triage too. When finished, reply DONE.`,
    check: check(i),
  })),
};
export default task;

export const _triage = { data, label, SECRET, KEY_ID };
