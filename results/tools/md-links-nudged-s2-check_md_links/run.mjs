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

// Returns non-fenced lines
function lines(text) {
  const res = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) { fence = m[1]; continue; }
    res.push(line);
  }
  return res;
}

const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} \-]/gu, '').replace(/ /g, '-');

const cache = new Map();
function slugs(file) {
  if (!cache.has(file)) {
    const set = new Set();
    for (const l of lines(readFileSync(file, 'utf8'))) {
      const m = l.match(/^\s{0,3}#{1,6}\s+(.*?)\s*$/);
      if (m) set.add(slug(m[1].replace(/\s+#+\s*$/, '')));
    }
    cache.set(file, set);
  }
  return cache.get(file);
}

export default async function run(input, ctx) {
  const docs = path.resolve(ctx.projectDir, input.docs ?? 'docs');
  const outPath = path.resolve(ctx.projectDir, input.out ?? 'broken.json');
  const broken = new Set();
  const files = walk(docs);
  for (const file of files) {
    const rel = path.relative(docs, file).split(path.sep).join('/');
    for (const l of lines(readFileSync(file, 'utf8'))) {
      for (const m of l.matchAll(/!?\[[^\]]*\]\(\s*([^)]*?)\s*\)/g)) {
        let target = m[1];
        const sp = target.search(/\s+["']/);
        if (sp > 0) target = target.slice(0, sp);
        if (/^(https?:\/\/|mailto:)/i.test(target)) continue;
        const hash = target.indexOf('#');
        const filePart = hash >= 0 ? target.slice(0, hash) : target;
        const frag = hash >= 0 ? target.slice(hash + 1) : null;
        let dest = file;
        if (filePart) {
          dest = path.resolve(path.dirname(file), filePart);
          if (!existsSync(dest)) { broken.add(`${rel}: ${target}`); continue; }
        }
        if (frag) {
          if (!statSync(dest).isFile() || !slugs(dest).has(frag)) broken.add(`${rel}: ${target}`);
        }
      }
    }
  }
  const list = [...broken].sort();
  writeFileSync(outPath, JSON.stringify(list, null, 2) + '\n');
  return { files: files.length, broken: list.length, list };
}
