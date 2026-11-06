import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(n)) out.push(p);
  }
  return out;
}

export default async function run(input, ctx) {
  const root = path.resolve(ctx.projectDir, input.dir);
  if (!root.startsWith(path.resolve(ctx.projectDir))) throw new Error('dir outside project');
  const changed = [];
  const review = [];
  for (const f of walk(root)) {
    if (path.basename(f) === 'logger.js') continue;
    const src = readFileSync(f, 'utf8');
    let s = src;
    s = s.replace(/(?<![.\w$])log\(\s*(['"`])(debug|info|warn|error)\1\s*,\s*/g, (m, q, lvl) => `logger.${lvl}(`);
    s = s.replace(/import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*logger\.js['"])/g, (m, names, from) => {
      const list = names.split(',').map((x) => x.trim()).filter(Boolean)
        .map((x) => (x === 'log' ? 'logger' : x === 'formatId' ? 'formatID' : x));
      return `import { ${[...new Set(list)].join(', ')} } from ${from}`;
    });
    s = s.replace(/\bformatId\b/g, 'formatID');
    if (s !== src) { writeFileSync(f, s); changed.push(path.relative(ctx.projectDir, f)); }
    s.split('\n').forEach((l, i) => {
      if (/(?<![.\w$])log\(/.test(l)) review.push(`${path.relative(ctx.projectDir, f)}:${i + 1}: ${l.trim()}`);
    });
  }
  return { changedCount: changed.length, changed, needsReview: review };
}
