import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  const dir = path.resolve(ctx.projectDir, input.dir);
  if (!dir.startsWith(path.resolve(ctx.projectDir))) throw new Error('dir must be inside the project');
  const files = readdirSync(dir).filter((f) => /\.(js|mjs|cjs)$/.test(f)).sort();
  const report = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const src = readFileSync(p, 'utf8');
    let calls = 0;
    let out = src.replace(
      /(?<![\w.$])log\(\s*(['"`])(\w+)\1\s*,(\s*)/g,
      (_, _q, lvl, ws) => { calls++; return `logger.${lvl}(` + (ws.includes('\n') ? ws : ''); },
    );
    let imp = false;
    out = out.replace(/import\s*\{([^}]*)\}\s*from\s*(['"])(\.\.?\/logger\.js)\2/g, (m, names, q, from) => {
      imp = true;
      const n = names.replace(/\blog\b/, 'logger').replace(/\bformatId\b/, 'formatID');
      return `import {${n}} from ${q}${from}${q}`;
    });
    out = out.replace(/\bformatId\b/g, 'formatID');
    const left = (out.match(/(?<![\w.$])log\(/g) || []).length;
    if (out !== src) writeFileSync(p, out);
    report.push({ file: f, calls, import: imp, changed: out !== src, remainingLog: left });
  }
  return {
    files: files.length,
    changed: report.filter((r) => r.changed).length,
    totalCalls: report.reduce((a, r) => a + r.calls, 0),
    problems: report.filter((r) => r.remainingLog || (r.calls && !r.import)),
  };
}
