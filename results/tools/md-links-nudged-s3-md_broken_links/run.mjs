import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

// Returns lines outside fenced code blocks
function proseLines(text) {
  const res = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      continue;
    }
    if (!fence) res.push(line);
  }
  return res;
}

const slug = (h) =>
  h.toLowerCase().replace(/[^\p{L}\p{N} \-]/gu, '').replace(/ /g, '-');

const cache = new Map();
function slugs(file) {
  if (!cache.has(file)) {
    const set = new Set();
    for (const l of proseLines(readFileSync(file, 'utf8'))) {
      const m = l.match(/^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/);
      if (m) set.add(slug(m[1].trim()));
    }
    cache.set(file, set);
  }
  return cache.get(file);
}

export default async function run(input, ctx) {
  const docs = path.resolve(ctx.projectDir, input.docsDir ?? 'docs');
  const outPath = path.resolve(ctx.projectDir, input.out ?? 'broken.json');
  const files = walk(docs);
  const broken = new Set();
  for (const f of files) {
    const rel = path.relative(docs, f).split(path.sep).join('/');
    for (const line of proseLines(readFileSync(f, 'utf8'))) {
      for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*([^)\s]*)[^)]*\)/g)) {
        const target = m[1];
        if (!target || /^(https?:\/\/|mailto:)/i.test(target)) continue;
        const hash = target.indexOf('#');
        const filePart = hash < 0 ? target : target.slice(0, hash);
        const frag = hash < 0 ? null : target.slice(hash + 1);
        let tf = f;
        if (filePart) {
          tf = path.resolve(path.dirname(f), filePart);
          if (!existsSync(tf)) {
            let dec = null;
            try { dec = path.resolve(path.dirname(f), decodeURIComponent(filePart)); } catch {}
            if (dec && existsSync(dec)) tf = dec;
            else { broken.add(`${rel}: ${target}`); continue; }
          }
        }
        if (frag) {
          if (!statSync(tf).isFile() || !slugs(tf).has(frag)) broken.add(`${rel}: ${target}`);
        }
      }
    }
  }
  const arr = [...broken].sort();
  writeFileSync(outPath, JSON.stringify(arr, null, 2) + '\n');
  return { files: files.length, broken: arr.length, written: outPath, list: arr };
}
