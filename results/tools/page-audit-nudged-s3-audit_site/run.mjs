import { writeFileSync } from 'node:fs';
import path from 'node:path';

const stripComments = (h) => h.replace(/<!--[\s\S]*?(-->|$)/g, '');
const hrefs = (h) => {
  const out = [];
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(h))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
};
const statusCache = new Map();
async function status(u) {
  if (!statusCache.has(u)) {
    statusCache.set(u, fetch(u, { redirect: 'follow' }).then(r => { r.body?.cancel(); return r.status; }).catch(() => 0));
  }
  return statusCache.get(u);
}

export default async function run(input, ctx) {
  const idx = await (await fetch(input.indexUrl)).text();
  const pages = [...new Set(hrefs(stripComments(idx)))];
  const result = {};
  for (const href of pages) {
    const url = new URL(href, input.indexUrl).href;
    const r = await fetch(url, { redirect: 'follow' });
    const key = href;
    if (r.status !== 200) {
      await r.body?.cancel();
      result[key] = { status: r.status, title: '', h1Count: 0, brokenLinks: [] };
      continue;
    }
    const html = await r.text();
    const clean = stripComments(html);
    const t = clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = t ? t[1].trim() : '';
    const h1Count = (clean.match(/<h1[\s>\/]/gi) || []).length;
    const links = [...new Set(hrefs(clean))].filter(h => !/^(mailto|tel|javascript):|^#/i.test(h));
    const broken = [];
    for (const l of links) {
      let u;
      try { u = new URL(l, url); } catch { continue; }
      u.hash = '';
      if ((await status(u.href)) !== 200) broken.push(l);
    }
    result[key] = { status: 200, title, h1Count, brokenLinks: broken.sort() };
  }
  writeFileSync(path.resolve(ctx.projectDir, input.outPath || 'audit.json'), JSON.stringify(result, null, 2));
  const vals = Object.values(result);
  return { pages: vals.length, non200: vals.filter(v => v.status !== 200).length, withBroken: vals.filter(v => v.brokenLinks.length).length };
}
