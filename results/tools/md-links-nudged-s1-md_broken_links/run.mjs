import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Returns lines outside fenced code blocks.
function outsideFences(text) {
  const res = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
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
  h.trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');

export default async function run(input, ctx) {
  const docs = path.resolve(ctx.projectDir, input.docsDir ?? 'docs');
  const outPath = path.resolve(ctx.projectDir, input.out ?? 'broken.json');
  const files = walk(docs);
  const cache = new Map();
  const slugsOf = (file) => {
    if (!cache.has(file)) {
      const set = new Set();
      for (const l of outsideFences(readFileSync(file, 'utf8'))) {
        const m = l.match(/^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/);
        if (m) set.add(slug(m[1]));
      }
      cache.set(file, set);
    }
    return cache.get(file);
  };
  const broken = new Set();
  const re = /!?\[[^\]]*\]\(([^)]*)\)/g;
  for (const f of files) {
    const rel = path.relative(docs, f).split(path.sep).join('/');
    for (const line of outsideFences(readFileSync(f, 'utf8'))) {
      for (const m of line.matchAll(re)) {
        const target = m[1].trim().split(/\s+/)[0];
        if (!target || /^(https?:\/\/|mailto:)/.test(target)) continue;
        const hash = target.indexOf('#');
        const filePart = hash < 0 ? target : target.slice(0, hash);
        const frag = hash < 0 ? null : target.slice(hash + 1);
        let tf = f;
        if (filePart) {
          tf = path.resolve(path.dirname(f), filePart);
          if (!existsSync(tf)) { broken.add(`${rel}: ${target}`); continue; }
        }
        if (frag) {
          if (!statSync(tf).isFile() || !slugsOf(tf).has(frag)) broken.add(`${rel}: ${target}`);
        }
      }
    }
  }
  const list = [...broken].sort();
  writeFileSync(outPath, JSON.stringify(list, null, 2) + '\n');
  return { files: files.length, broken: list.length, list };
}
