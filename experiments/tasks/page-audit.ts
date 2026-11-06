import type { Task } from '../lib/types.ts';
import { fail, readJson, rng, scoreKeyed } from '../lib/util.ts';

interface Page { path: string; title: string; h1: string[]; links: string[]; status: number }

const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'harbor', 'meadow', 'canyon', 'summit', 'river', 'forest', 'ember', 'quartz'];
const OUT = ['audit.json', 'audit-2.json', 'audit-3.json'];

/** One version of the site; each step serves a new version. */
function site(version: number) {
  const r = rng(101 + version * 1000);
  const missing = new Set([r.int(1, 10), r.int(11, 20), r.int(21, 30)]);
  const pages: Page[] = [];
  for (let i = 1; i <= 30; i++) {
    const path = `/pages/p${String(i).padStart(2, '0')}.html`;
    pages.push({
      path,
      title: `${r.pick(WORDS)} ${r.pick(WORDS)} ${i}`,
      h1: Array.from({ length: r.int(0, 3) }, () => `${r.pick(WORDS)} heading`),
      links: Array.from({ length: r.int(2, 6) }, () =>
        r.chance(0.15) ? `/gone/${r.pick(WORDS)}.html` : `/pages/p${String(r.int(1, 34)).padStart(2, '0')}.html`,
      ),
      status: missing.has(i) ? 404 : 200,
    });
  }
  const ok = new Set(pages.filter((p) => p.status === 200).map((p) => p.path));
  const expected: Record<string, unknown> = {};
  for (const p of pages) {
    expected[p.path] =
      p.status === 200
        ? { status: 200, title: p.title, h1Count: p.h1.length, brokenLinks: [...new Set(p.links.filter((l) => !ok.has(l)))].sort() }
        : { status: 404, title: '', h1Count: 0, brokenLinks: [] };
  }
  return { pages, expected };
}

const RULES = `For each of the 30 pages linked from the index, determine:
- "status": the HTTP status code of the page
- "title": the text of its <title> element, trimmed ("" if the page is not 200)
- "h1Count": the number of <h1> elements, case-insensitive, not counting any inside HTML comments (0 if not 200)
- "brokenLinks": the sorted list of distinct link targets on that page (href values exactly as written, e.g. "/pages/p07.html") whose URL returns a status other than 200 ([] if not 200)`;

const check = (i: number) => ({ work }: { work: string }, versions: Record<string, unknown>[]) => {
  const got = readJson(work, OUT[i]!);
  if (!got.ok) return fail(got.error);
  return scoreKeyed(versions[i]!, got.value);
};

/** Crawl and check 30 pages of a local site, three times as the site changes. */
const task: Task = {
  id: 'page-audit',
  title: 'Audit 30 web pages (status, title, h1 count, broken links), 3 site versions',
  kind: 'repetitive',
  repetitions: 30,
  setup: () => [0, 1, 2].map((v) => site(v).expected),
  handler: (_expected, state) => (req, res) => {
    const { pages } = site(state.step);
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Index</title></head><body><ul>${pages.map((p) => `<li><a href="${p.path}">${p.path}</a></li>`).join('')}</ul></body></html>`);
      return;
    }
    const page = pages.find((p) => p.path === url && p.status === 200);
    if (!page) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><head><title>Not found</title></head><body><h1>404</h1></body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      [
        `<!doctype html><html><head><meta charset="utf-8">\n<title>\n  ${page.title}\n</title></head><body>`,
        '<nav><a href="/index.html">home</a></nav>',
        ...page.h1.map((h, i) => (i % 2 ? `<H1 class="x">${h}</H1>` : `<h1>${h}</h1>`)),
        '<p>Some text <!-- <h1>commented</h1> --></p>',
        ...page.links.map((l) => `<p>See <a class="ref" href="${l}">${l}</a></p>`),
        '</body></html>',
      ].join('\n'),
    );
  },
  steps: [
    {
      prompt: ({ baseUrl }) => `A small website is running at ${baseUrl}/ . Its index page ${baseUrl}/index.html links to 30 pages.

${RULES}

Write the result to audit.json in the current directory as a JSON object keyed by the page path as linked from the index (for example "/pages/p01.html"), each value being {"status", "title", "h1Count", "brokenLinks"}.
Use only this local site. I will ask you to re-audit it after future deploys. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `The site was just redeployed and its content changed. Audit it again with the same rules and write the result to audit-2.json. When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `Another deploy just went out. Audit the site once more, same rules, and write audit-3.json. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
