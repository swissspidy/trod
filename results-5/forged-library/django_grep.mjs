import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export const meta = {
  provenance: { reason: 'Toolsmith session: helpers for fixing Django 4.x bugs (run tests, reproduce, navigate code).' },
  description:
    'Searches the checkout with ripgrep for one or more identifiers/regexes and returns an array with one entry per pattern: ' +
    "{pattern, total, definitions:[{file,line,text}] (def/class/assignment of the identifier, with qualname like 'CharField.get_prep_value'), files:[{file, count, hits:[{line, kind:'def'|'import'|'use'|'test', text}]}]} " +
    'sorted with django/ before tests/ and by hit count; paths repo-relative, text trimmed to 200 chars. Python files only by default; __pycache__/docs excluded unless asked.',
  whenToUse:
    "To find where a name is defined and every place it is used (callers, overrides, imports) across django/ and optionally tests/ or docs/, e.g. patterns:['get_prep_value','_combine'] before changing a signature, " +
    "or to locate the code that produces an error message from a bug report (pass a distinctive literal fragment of the message with fixedString:true; messages are often split across lines or contain %s/{} placeholders, so search a short piece). Identifiers are matched as whole words; set regex:true for a regex. " +
    "Use django_source to then read the definitions.",
  inputSchema: {
    type: 'object',
    properties: {
      patterns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Identifiers, literal strings or regexes, e.g. ['bulk_update', 'Cannot resolve keyword']" },
      regex: { type: 'boolean', description: 'Treat patterns as ripgrep regexes (default: identifiers -> whole-word literal; other text -> literal).' },
      fixedString: { type: 'boolean', description: 'Force literal match without word boundaries (good for error messages).' },
      ignoreCase: { type: 'boolean' },
      paths: { type: 'array', items: { type: 'string' }, description: "Dirs/files to search (default ['django']). E.g. ['django/db', 'tests/queries']." },
      includeTests: { type: 'boolean', description: "Also search tests/ (adds 'tests' to paths)." },
      includeDocs: { type: 'boolean', description: "Also search docs/ (.txt release notes, reference)." },
      allFiles: { type: 'boolean', description: 'Search all file types (templates, js, txt), not only .py.' },
      maxFiles: { type: 'integer', minimum: 1, description: 'Max files listed per pattern (default 25).' },
      maxHitsPerFile: { type: 'integer', minimum: 1, description: 'Max hit lines per file (default 8).' },
      context: { type: 'integer', minimum: 0, maximum: 5, description: 'Lines of context around each hit (default 0).' },
    },
    required: ['patterns'],
    additionalProperties: false,
  },
  examples: [
    { input: { patterns: ['slugify'], includeTests: true, maxFiles: 5 }, expect: { matches: '"definitions":\\s*\\[[^\\]]*django/utils/text\\.py' } },
    { input: { patterns: ['Cannot resolve keyword'], fixedString: true }, expect: { contains: 'django/db/models/sql/query.py' } },
  ],
  timeoutMs: 120000,
};

function rg(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('rg', args, { cwd, maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code !== 1) return reject(new Error('rg failed: ' + (stderr || err.message)));
      resolve(stdout || '');
    });
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function run(input, ctx) {
  const projectDir = ctx.projectDir;
  let paths = input.paths && input.paths.length ? [...input.paths] : ['django'];
  if (input.includeTests && !paths.includes('tests')) paths.push('tests');
  if (input.includeDocs && !paths.includes('docs')) paths.push('docs');
  const maxFiles = input.maxFiles || 25;
  const maxHits = input.maxHitsPerFile || 8;
  const results = [];
  for (const pat of input.patterns) {
    const isIdent = /^[A-Za-z_]\w*$/.test(pat);
    const args = ['-n', '--no-heading', '--with-filename', '--color', 'never', '-g', '!**/__pycache__/**', '-M', '400'];
    if (!input.allFiles) {
      if (input.includeDocs) args.push('-g', '*.py', '-g', '*.txt');
      else args.push('--type', 'py');
    }
    if (input.ignoreCase) args.push('-i');
    if (input.context) args.push('-C', String(input.context));
    if (input.regex) args.push('-e', pat);
    else if (input.fixedString || !isIdent) args.push('-F', '-e', pat);
    else args.push('-w', '-F', '-e', pat);
    args.push('--', ...paths);
    const out = await rg(args, projectDir);
    const byFile = new Map();
    const defs = [];
    let total = 0;
    const defRe = isIdent ? new RegExp(`^\\s*((async\\s+)?def|class)\\s+${escapeRe(pat)}\\b|^\\s*${escapeRe(pat)}\\s*(:[^=]*)?=(?!=)`) : null;
    for (const line of out.split('\n')) {
      if (!line) continue;
      // file:line:text (match) or file-line-text (context)
      let m = line.match(/^(.*?):(\d+):(.*)$/);
      let isCtx = false;
      if (!m) { m = line.match(/^(.*?)-(\d+)-(.*)$/); isCtx = true; }
      if (!m) continue;
      const [, file, ln, textRaw] = m;
      const text = textRaw.trim().slice(0, 200);
      if (!byFile.has(file)) byFile.set(file, { file, count: 0, hits: [] });
      const f = byFile.get(file);
      if (isCtx) { if (f.hits.length < maxHits * (1 + 2 * (input.context || 0))) f.hits.push({ line: +ln, kind: 'ctx', text }); continue; }
      total++;
      f.count++;
      let kind = 'use';
      if (defRe && defRe.test(textRaw)) { kind = 'def'; defs.push({ file, line: +ln, text }); }
      else if (/^\s*(from\s+\S+\s+import|import)\s/.test(textRaw)) kind = 'import';
      else if (file.startsWith('tests/')) kind = 'test';
      if (f.hits.filter((h) => h.kind !== 'ctx').length < maxHits) f.hits.push({ line: +ln, kind, text });
    }
    const files = [...byFile.values()].sort((a, b) => (a.file.startsWith('tests/') - b.file.startsWith('tests/')) || (b.count - a.count));
    defs.sort((a, b) => a.file.startsWith('tests/') - b.file.startsWith('tests/'));
    // add enclosing class/function names: "Field.get_prep_value"
    const fileCache = new Map();
    for (const d of defs.slice(0, 30)) {
      try {
        if (!fileCache.has(d.file)) fileCache.set(d.file, fs.readFileSync(path.join(projectDir, d.file), 'utf8').split('\n'));
        const ls = fileCache.get(d.file);
        let indent = ls[d.line - 1].match(/^\s*/)[0].length;
        const chain = [];
        for (let i = d.line - 2; i >= 0 && indent > 0; i--) {
          const mm = ls[i].match(/^(\s*)(?:async\s+)?(?:class|def)\s+(\w+)/);
          if (mm && mm[1].length < indent) { chain.unshift(mm[2]); indent = mm[1].length; }
        }
        d.qualname = [...chain, pat].join('.');
      } catch {}
    }
    const r = { pattern: pat, total, fileCount: files.length, definitions: defs.slice(0, 30), files: files.slice(0, maxFiles) };
    if (files.length > maxFiles) r.moreFiles = files.slice(maxFiles).map((f) => `${f.file} (${f.count})`).slice(0, 40);
    results.push(r);
  }
  return results;
}
// trod: promoted 2026-11-07T06:38:44.124Z
