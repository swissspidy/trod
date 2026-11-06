import { writeFileSync } from 'node:fs';
import path from 'node:path';

const stripComments = (h) => h.replace(/<!--[\s\S]*?(-->|$)/g, '');
const hrefs = (h) => {
  const out = [];
  for (const m of stripComments(h).matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
    out.push(m[1] ?? m[2] ?? m[3]);
  return out;
};

export default async function run(input, ctx) {
  const base = new URL(input.indexUrl);
  const cache = new Map();
  const statusOf = async (u) => {
    if (!cache.has(u)) cache.set(u, fetch(u, { redirect: 'manual' }).then(async (r) => { await r.arrayBuffer(); return r.status; }).catch(() => 0));
    return cache.get(u);
  };
  const idx = await (await fetch(base)).text();
  const pages = [...new Set(hrefs(idx))];
  const result = {};
  for (const p of pages) {
    const url = new URL(p, base);
    if (url.origin !== base.origin) continue;
    const r = await fetch(url, { redirect: 'manual' });
    const status = r.status;
    const body = await r.text();
    if (status !== 200) { result[p] = { status, title: '', h1Count: 0, brokenLinks: [] }; continue; }
    const clean = stripComments(body);
    const t = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const h1Count = (clean.match(/<h1[\s>\/]/gi) || []).length;
    const broken = [];
    for (const href of new Set(hrefs(body))) {
      let u;
      try { u = new URL(href, url); } catch { continue; }
      if (u.origin !== base.origin) continue;
      u.hash = '';
      if ((await statusOf(u.href)) !== 200) broken.push(href);
    }
    result[p] = { status, title: t ? t[1].trim() : '', h1Count, brokenLinks: broken.sort() };
  }
  writeFileSync(path.resolve(ctx.projectDir, input.output || 'audit.json'), JSON.stringify(result, null, 2));
  const vals = Object.values(result);
  return { pages: vals.length, non200: vals.filter((v) => v.status !== 200).length, pagesWithBroken: vals.filter((v) => v.brokenLinks.length).length };
}
