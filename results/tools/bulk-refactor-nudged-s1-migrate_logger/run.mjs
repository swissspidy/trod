import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const root = path.resolve(ctx.projectDir);
  const dir = path.resolve(root, input.dir);
  if (!dir.startsWith(root + path.sep)) throw new Error('dir must be inside project');
  const files = readdirSync(dir, { recursive: true })
    .filter((f) => /\.(m?js)$/.test(f) && f !== 'logger.js');
  const changed = [], leftovers = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const src = readFileSync(p, 'utf8');
    let out = src.replace(
      /(?<![\w.$])log\(\s*(['"`])(debug|info|warn|error)\1\s*(,[ \t]*)?/g,
      (_, _q, lvl) => `logger.${lvl}(`);
    out = out.replace(
      /import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]*logger\.js)\2/g,
      (m, names, q, from) => {
        const list = names.split(',').map((s) => s.trim()).filter(Boolean)
          .map((n) => (n === 'log' ? 'logger' : n === 'formatId' ? 'formatID' : n));
        const uniq = [...new Set(list)];
        return `import { ${uniq.join(', ')} } from ${q}${from}${q}`;
      });
    out = out.replace(/(?<![\w$])formatId(?![\w$])/g, 'formatID');
    const left = out.split('\n').map((l, i) => [i + 1, l])
      .filter(([, l]) => /(?<![\w.$])log\(/.test(l));
    if (left.length) leftovers.push({ file: f, lines: left.map(([n, l]) => `${n}: ${l.trim()}`) });
    if (out !== src) {
      changed.push(f);
      if (!input.dryRun) writeFileSync(p, out);
    }
  }
  return { scanned: files.length, changed: changed.length, leftovers, dryRun: !!input.dryRun };
}
