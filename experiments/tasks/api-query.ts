import type { Task, TaskContext } from '../lib/types.ts';
import { fail, readJson, rng, scoreKeyed } from '../lib/util.ts';

interface Order { id: number; amount: string; status: 'completed' | 'refunded' | 'pending'; createdAt: string }
interface User { id: number; name: string; orders: Order[] }

const PAGE_SIZE = 10;
const OUT = ['totals.json', 'refunds.json', 'pending.json'];

function data() {
  const r = rng(404);
  const users: User[] = [];
  let oid = 1;
  for (let i = 0; i < 45; i++) {
    const id = 100 + i * 7;
    users.push({
      id,
      name: `user-${id}`,
      orders: Array.from({ length: r.int(0, 6) }, () => ({
        id: oid++,
        amount: (r.int(50, 99999) / 100).toFixed(2),
        status: r.pick(['completed', 'completed', 'completed', 'refunded', 'pending'] as const),
        createdAt: `2026-${String(r.int(1, 10)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}`,
      })),
    });
  }
  const sum = (os: Order[]) => os.reduce((n, o) => n + Math.round(Number(o.amount) * 100), 0) / 100;
  const expected = [
    Object.fromEntries(users.map((u) => [String(u.id), sum(u.orders.filter((o) => o.status === 'completed'))])),
    Object.fromEntries(users.map((u) => [String(u.id), u.orders.filter((o) => o.status === 'refunded').length])),
    Object.fromEntries(
      users
        .map((u) => [String(u.id), sum(u.orders.filter((o) => o.status === 'pending' && o.createdAt >= '2026-06-01'))] as const)
        .filter(([, v]) => v > 0),
    ),
  ];
  return { users, expected };
}

const check = (i: number) => ({ work }: TaskContext, expected: Record<string, number>[]) => {
  const got = readJson(work, OUT[i]!);
  if (!got.ok) return fail(got.error);
  const norm = Object.fromEntries(Object.entries(got.value ?? {}).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]));
  return scoreKeyed(expected[i]!, norm);
};

/** Query a paginated, sometimes rate-limited JSON API for every user, three different questions. */
const task: Task = {
  id: 'api-query',
  title: 'Query a paginated API for 45 users, three questions',
  kind: 'repetitive',
  repetitions: 45,
  setup: () => data().expected,
  handler: () => {
    const { users } = data();
    let n = 0;
    return (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      n++;
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };
      if (n % 9 === 0) return json(429, { error: 'Too Many Requests' }, { 'retry-after': '1' });
      if (url.pathname === '/api/users') {
        const page = Number(url.searchParams.get('page') ?? '1');
        if (!Number.isInteger(page) || page < 1) return json(400, { error: 'bad page' });
        const slice = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return json(200, { users: slice.map(({ id, name }) => ({ id, name })), nextPage: page * PAGE_SIZE < users.length ? page + 1 : null });
      }
      const m = url.pathname.match(/^\/api\/users\/(\d+)\/orders$/);
      if (m) {
        const u = users.find((x) => x.id === Number(m[1]));
        return u ? json(200, { orders: u.orders }) : json(404, { error: 'no such user' });
      }
      return json(404, { error: 'not found' });
    };
  },
  steps: [
    {
      prompt: ({ baseUrl }) => `A JSON API runs at ${baseUrl}/api . Endpoints:
- GET /api/users?page=N : one page of users, {"users":[{"id","name"}], "nextPage": N+1 or null}; pages start at 1
- GET /api/users/{id}/orders : that user's orders, {"orders":[{"id","amount","status","createdAt"}]}; amount is a string like "12.30", createdAt is YYYY-MM-DD

The API sometimes answers 429 Too Many Requests (with a Retry-After header in seconds); retry those requests.

For every user, compute the sum of the amounts of their orders with status "completed". Write totals.json in the current directory: a JSON object mapping the user's id (as a string) to that sum as a number rounded to 2 decimals (0 if none).
I will have more questions about this API's data afterwards. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `Next question about the same API: for every user, how many orders have status "refunded"? Write refunds.json mapping user id (string) to that count (0 if none). Query the API for this (do not reuse files from the previous answer). When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `Last one: for each user, the sum of amounts of "pending" orders created on or after 2026-06-01. Write pending.json mapping user id (string) to the sum rounded to 2 decimals, and leave out users whose sum is 0. Query the API for this (do not reuse files from earlier answers). When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
