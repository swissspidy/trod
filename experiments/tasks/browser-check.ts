import type { Task, TaskContext } from '../lib/types.ts';
import { fail, readJson, rng, scoreKeyed } from '../lib/util.ts';

interface Product { path: string; name: string; price: string; inStock: boolean }

const ADJ = ['Swift', 'Quiet', 'Bright', 'Solid', 'Tiny', 'Grand'];
const NOUN = ['Lamp', 'Chair', 'Kettle', 'Desk', 'Clock', 'Mug', 'Shelf'];
const OUT = ['products.json', 'products-2.json', 'products-3.json'];

/** The catalogue at one point in time; prices and stock change between steps. */
function catalogue(version: number): Product[] {
  const names = rng(505);
  const r = rng(505 + version * 1000);
  return Array.from({ length: 15 }, (_, i) => ({
    path: `/products/${i + 1}.html`,
    name: `${names.pick(ADJ)} ${names.pick(NOUN)} ${names.int(2, 9)}`,
    price: `$${(r.int(199, 19999) / 100).toFixed(2)}`,
    inStock: r.chance(0.6),
  }));
}

const check = (i: number) => ({ work }: TaskContext, expected: Record<string, unknown>[]) => {
  const got = readJson(work, OUT[i]!);
  if (!got.ok) return fail(got.error);
  return scoreKeyed(expected[i]!, got.value);
};

/** Read 15 product pages whose content only exists after client-side rendering, three times. */
const task: Task = {
  id: 'browser-check',
  title: 'Check 15 JavaScript-rendered product pages, 3 times',
  kind: 'repetitive',
  repetitions: 15,
  setup: () => [0, 1, 2].map((v) => Object.fromEntries(catalogue(v).map((p) => [p.path, { name: p.name, price: p.price, inStock: p.inStock }]))),
  handler: (_expected, state) => (req, res) => {
    const products = catalogue(state.step);
    const url = (req.url ?? '/').split('?')[0]!;
    if (url === '/data.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      // Encoded so the values cannot be read from the raw HTML or the script without running it.
      res.end(`window.__P = ${JSON.stringify(products.map((x) => Buffer.from(JSON.stringify(x)).toString('base64').split('').reverse().join('')))};`);
      return;
    }
    const m = url.match(/^\/products\/(\d+)\.html$/);
    const p = m ? products[Number(m[1]) - 1] : undefined;
    if (!p) {
      res.writeHead(url === '/' ? 200 : 404, { 'content-type': 'text/html' });
      res.end(`<html><body><h1>Shop</h1>${products.map((x) => `<a href="${x.path}">${x.path}</a>`).join(' ')}</body></html>`);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><title>Product</title><script src="/data.js"></script></head>
<body><main><h2 id="name">Loading…</h2><p id="price">…</p><button id="buy" disabled>Buy</button></main>
<script>
setTimeout(() => {
  const raw = window.__P[${Number(m![1]) - 1}];
  const p = JSON.parse(atob(raw.split('').reverse().join('')));
  document.getElementById('name').textContent = p.name;
  document.getElementById('price').textContent = p.price;
  document.getElementById('buy').disabled = !p.inStock;
}, 150);
</script></body></html>`);
  },
  steps: [
    {
      prompt: ({ baseUrl }) => `A shop runs at ${baseUrl}/ . The product pages ${baseUrl}/products/1.html through ${baseUrl}/products/15.html render their content with client-side JavaScript after the page loads, so the raw HTML does not contain it.

For each of the 15 pages, read the rendered page and record:
- "name": the text of the element with id "name"
- "price": the text of the element with id "price" (e.g. "$12.50")
- "inStock": true if the button with id "buy" is enabled, false if it is disabled

Write products.json in the current directory: a JSON object keyed by the page path (e.g. "/products/1.html") with {"name","price","inStock"} values.
A headless Chromium and the "playwright" npm package are installed (require('playwright') works from any directory; chromium.launch() needs no options).
Prices change often, so I will ask you to re-check later. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `Prices and stock were updated. Check all 15 product pages again, same fields, and write products-2.json. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `Another update went live. Check the 15 pages once more and write products-3.json. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
