import { writeFileSync } from 'node:fs';

const strip = (h) => h.replace(/<!--[\s\S]*?(-->|$)/g, '');
const hrefs = (h) => {
  const out = [];
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(strip(h)))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export default async function run(input) {
  const base = input.base.replace(/\/$/, '');
  const cache = new Map();
  const statusOf = (url) => {
    if (!cache.has(url)) cache.set(url, fetch(url, { redirect: 'manual' }).then(async (r) => { await r.arrayBuffer(); return r.status; }).catch(() => 0));
    return cache.get(url);
  };
  const idxUrl = base + '/index.html';
  const idx = await (await fetch(idxUrl)).text();
  const pages = [...new Set(hrefs(idx))];
  const result = {};
  for (const p of pages) {
    const url = new URL(p, idxUrl).href;
    const r = await fetch(url, { redirect: 'manual' });
    const body = await r.text();
    if (r.status !== 200) { result[p] = { status: r.status, title: '', h1Count: 0, brokenLinks: [] }; continue; }
    const clean = strip(body);
    const t = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Count = (clean.match(/<h1[\s>\/]/gi) || []).length;
    const links = [...new Set(hrefs(body).map(decode))].sort();
    const broken = [];
    for (const l of links) {
      let u;
      try { u = new URL(l, url); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = '';
      if ((await statusOf(u.href)) !== 200) broken.push(l);
    }
    result[p] = { status: 200, title: t ? decode(t[1]).trim() : '', h1Count, brokenLinks: broken.sort() };
  }
  writeFileSync(input.outPath, JSON.stringify(result, null, 2) + '\n');
  const vals = Object.values(result);
  return { pages: pages.length, non200: vals.filter((v) => v.status !== 200).length, withBroken: vals.filter((v) => v.brokenLinks.length).length };
}
