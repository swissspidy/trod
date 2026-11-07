import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const meta = {
  provenance: { reason: 'Toolsmith session: helpers for fixing Django 4.x bugs (run tests, reproduce, navigate code).' },
  description:
    "Finds Django test-suite tests related to code, and lists test methods with ready-to-run labels for django_test. Returns " +
    "{files:[{label:'utils_tests.test_text', file:'tests/utils_tests/test_text.py', score, matchedBy:['import django.utils.text','slugify(12)']}], " +
    "apps:[{app:'utils_tests', score}] (test app dirs ranked; run whole apps with django_test), " +
    "tests:[{label:'app.module.Class.test_method', file, line}] (methods whose name matches 'keywords', or all methods of the files in 'list'), testsOmitted?}.",
  whenToUse:
    "After locating the code to fix: pass its module(s) (dotted 'django.db.models.sql.query' or path 'django/db/models/sql/query.py') and/or symbols ('bulk_update','Q') to see which test files import/use them, " +
    "then run those labels with django_test. Use keywords (e.g. ['bulk_update','ticket_31234']) to find existing test methods by name (also matches tests/ dir names), " +
    "and list:['queries.test_q'] or ['tests/queries/test_q.py'] to enumerate the test methods of a module/app (to pick a class to add a regression test to). " +
    "Static text search only: nothing is imported or run. Test app = directory under tests/ (labels are relative to tests/).",
  inputSchema: {
    type: 'object',
    properties: {
      modules: { type: 'array', items: { type: 'string' }, description: "Code modules, dotted or path, e.g. ['django.utils.text', 'django/db/models/deletion.py']" },
      symbols: { type: 'array', items: { type: 'string' }, description: "Names used in tests, e.g. ['slugify', 'bulk_update'] (whole-word match)." },
      keywords: { type: 'array', items: { type: 'string' }, description: "Substrings matched against the full test label, case- and underscore-insensitive ('bulk_update' matches queries.test_bulk_update.BulkUpdateTests.test_simple)." },
      list: { type: 'array', items: { type: 'string' }, description: "Labels/paths whose test methods to enumerate, e.g. ['queries.test_q', 'tests/expressions/tests.py', 'model_forms']" },
      maxFiles: { type: 'integer', minimum: 1, description: 'Default 20.' },
      maxTests: { type: 'integer', minimum: 1, description: 'Default 150.' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: { modules: ['django.utils.text'], symbols: ['slugify'] }, expect: { contains: 'utils_tests.test_text' } },
    { input: { list: ['utils_tests.test_text'], keywords: ['slugify'] }, expect: { matches: 'utils_tests\\.test_text\\.\\w+\\.test_slugify' } },
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
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fileToLabel(f) {
  return f.replace(/^tests\//, '').replace(/\.py$/, '').replace(/\/__init__$/, '').split('/').join('.');
}

const LIST_PY = String.raw`
import ast, json, sys
files = json.load(sys.stdin)
out = {}
for rel, absf in files:
    res = []
    try:
        tree = ast.parse(open(absf, encoding='utf-8').read())
    except Exception:
        out[rel] = res
        continue
    def visit(body):
        for c in body:
            if isinstance(c, ast.ClassDef):
                for x in c.body:
                    if isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef)) and x.name.startswith('test'):
                        res.append([c.name, x.name, x.lineno])
            elif isinstance(c, (ast.If, ast.Try)):
                visit(list(c.body) + list(c.orelse))
    visit(tree.body)
    out[rel] = res
print(json.dumps(out))
`;

async function listTests(projectDir, rels) {
  if (!rels.length) return {};
  const child = spawn('python', ['-I', '-c', LIST_PY], { cwd: projectDir });
  let so = '', se = '';
  child.stdout.on('data', (d) => (so += d));
  child.stderr.on('data', (d) => (se += d));
  child.stdin.end(JSON.stringify(rels.map((r) => [r, path.join(projectDir, r)])));
  const code = await new Promise((r) => child.on('close', r));
  if (code !== 0) throw new Error('test listing failed: ' + se.slice(-1500));
  const raw = JSON.parse(so);
  const out = {};
  for (const [rel, items] of Object.entries(raw)) out[rel] = items.map(([cls, name, line]) => ({ label: `${fileToLabel(rel)}.${cls}.${name}`, file: rel, line }));
  return out;
}

async function pyFilesUnder(projectDir, rel) {
  const out = await rg(['--files', '--type', 'py', '-g', '!**/__pycache__/**', rel], projectDir);
  return out.split('\n').filter(Boolean);
}

function resolveListEntry(projectDir, entry) {
  let s = entry.trim().replace(/::.*$/, '');
  if (s.includes('/') || s.endsWith('.py')) {
    s = s.replace(/^\.\//, '');
    if (path.isAbsolute(s)) s = path.relative(projectDir, s);
    if (!s.startsWith('tests/')) s = 'tests/' + s;
    return { path: s.replace(/\/+$/, ''), filter: null };
  }
  // dotted label: find longest prefix that is a file or dir
  const parts = s.split('.');
  for (let i = parts.length; i > 0; i--) {
    const base = path.join('tests', ...parts.slice(0, i));
    if (fs.existsSync(path.join(projectDir, base + '.py'))) return { path: base + '.py', filter: parts.slice(i).join('.') || null };
    if (fs.existsSync(path.join(projectDir, base)) && fs.statSync(path.join(projectDir, base)).isDirectory()) return { path: base, filter: parts.slice(i).join('.') || null };
  }
  return { path: null, filter: null };
}

export default async function run(input, ctx) {
  const projectDir = ctx.projectDir;
  const maxFiles = input.maxFiles || 20;
  const maxTests = input.maxTests || 150;
  const scores = new Map(); // file -> {score, matchedBy:Map}
  const bump = (file, why, n = 1, w = 1) => {
    if (!file.startsWith('tests/') || file.includes('__pycache__')) return;
    if (!scores.has(file)) scores.set(file, { score: 0, matchedBy: new Map() });
    const s = scores.get(file);
    s.score += n * w;
    s.matchedBy.set(why, (s.matchedBy.get(why) || 0) + n);
  };
  const result = {};

  for (const mod of input.modules || []) {
    let dotted = mod.trim();
    if (dotted.includes('/') || dotted.endsWith('.py')) {
      let p = dotted.replace(/^\.\//, '');
      if (path.isAbsolute(p)) p = path.relative(projectDir, p);
      dotted = p.replace(/\.py$/, '').replace(/\/__init__$/, '').split('/').join('.');
    }
    const parts = dotted.split('.');
    const last = parts[parts.length - 1];
    const parent = parts.slice(0, -1).join('.');
    // import forms: "from a.b.c import", "import a.b.c", "from a.b import c", and string references 'a.b.c'
    const pats = [`from ${esc(dotted)}(\\.\\w+)* import`, `import ${esc(dotted)}\\b`, `['"]${esc(dotted)}(\\.\\w+)*['"]`];
    if (parent) pats.push(`from ${esc(parent)} import .*\\b${esc(last)}\\b`);
    const out = await rg(['-c', '--type', 'py', ...pats.flatMap((p) => ['-e', p]), 'tests'], projectDir);
    for (const line of out.split('\n')) {
      const m = line.match(/^(.*):(\d+)$/);
      if (m) bump(m[1], `import ${dotted}`, 1, 10);
    }
    // name heuristic: tests/<last>_tests, tests/<last>, tests/*/test_<last>.py
    const cands = last === '__init__' || last === 'models' ? [] : [`tests/${last}`, `tests/${last}_tests`, `tests/${last}s`];
    for (const c of cands) {
      if (fs.existsSync(path.join(projectDir, c)) && fs.statSync(path.join(projectDir, c)).isDirectory()) {
        for (const f of (await pyFilesUnder(projectDir, c)).filter((f) => /\/tests?(_\w+)?\.py$/.test(f) || /\/tests\//.test(f))) bump(f, `dir name ~ ${last}`, 1, 2);
      }
    }
    const tf = await rg(['--files', '-g', `**/test_${last}.py`, '-g', `**/test_${last}s.py`, 'tests'], projectDir);
    for (const f of tf.split('\n').filter(Boolean)) bump(f, `file name ~ ${last}`, 1, 5);
  }

  for (const sym of input.symbols || []) {
    const out = await rg(['-c', '-w', '-F', '--type', 'py', '-e', sym, 'tests'], projectDir);
    for (const line of out.split('\n')) {
      const m = line.match(/^(.*):(\d+)$/);
      if (m) bump(m[1], sym, Math.min(+m[2], 50), 1);
    }
  }

  if (scores.size) {
    const files = [...scores.entries()]
      .filter(([f]) => /(^|\/)(tests?|test_\w+|\w+_tests?)\.py$/.test(f) || /\/tests\/\w+\.py$/.test(f.replace(/^tests\//, '')))
      .map(([file, s]) => ({ label: fileToLabel(file), file, score: s.score, matchedBy: [...s.matchedBy.entries()].map(([k, v]) => (v > 1 ? `${k}(${v})` : k)) }))
      .sort((a, b) => b.score - a.score);
    result.files = files.slice(0, maxFiles);
    if (files.length > maxFiles) result.filesOmitted = files.length - maxFiles;
    const apps = new Map();
    for (const f of files) {
      const app = f.file.split('/')[1];
      apps.set(app, (apps.get(app) || 0) + f.score);
    }
    result.apps = [...apps.entries()].map(([app, score]) => ({ app, score })).sort((a, b) => b.score - a.score).slice(0, 15);
  }

  // test method listing
  if ((input.list && input.list.length) || (input.keywords && input.keywords.length)) {
    let targets = [];
    if (input.list && input.list.length) {
      for (const e of input.list) {
        const r = resolveListEntry(projectDir, e);
        if (!r.path) { (result.errors ||= []).push(`cannot resolve ${e} under tests/`); continue; }
        const files = r.path.endsWith('.py') ? [r.path] : await pyFilesUnder(projectDir, r.path);
        targets.push(...files.map((f) => ({ f, filter: r.filter })));
      }
    } else {
      // keywords only: search all test files whose method/class names or dir names match
      // match on normalized names (lowercase, no underscores) so 'bulk_update' also finds BulkUpdateTests and test_bulk_update.py
      const kws = input.keywords.map((k) => k.toLowerCase().replace(/_/g, ''));
      const all = await pyFilesUnder(projectDir, 'tests');
      const re = new RegExp(`(def|class)\\s+\\w*(${input.keywords.map((k) => esc(k)).join('|')})\\w*`, 'i');
      const hitFiles = new Set((await rg(['-l', '-i', '--type', 'py', '-g', '!**/__pycache__/**', '-e', re.source, 'tests'], projectDir)).split('\n').filter(Boolean));
      const clsHits = await rg(['-l', '-i', '--type', 'py', '-g', '!**/__pycache__/**', '-e', `^class\\s+\\w*(${kws.map(esc).join('|')})`, 'tests'], projectDir);
      for (const f of clsHits.split('\n').filter(Boolean)) hitFiles.add(f);
      for (const f of all) if (kws.some((k) => f.toLowerCase().replace(/_/g, '').includes(k))) hitFiles.add(f);
      targets = [...hitFiles].map((f) => ({ f, filter: null }));
    }
    const kwl = (input.keywords || []).map((k) => k.toLowerCase().replace(/_/g, ''));
    let tests = [];
    const seen = new Set();
    const listed = await listTests(projectDir, [...new Set(targets.map((t) => t.f))]);
    for (const { f, filter } of targets) {
      for (const t of listed[f] || []) {
        if (seen.has(t.label)) continue;
        if (filter && !t.label.includes('.' + filter + '.') && !t.label.endsWith('.' + filter)) continue;
        if (kwl.length && !kwl.some((k) => t.label.toLowerCase().replace(/_/g, '').includes(k))) continue;
        seen.add(t.label);
        tests.push(t);
      }
    }
    result.testCount = tests.length;
    if (tests.length > maxTests) result.testsOmitted = tests.length - maxTests;
    result.tests = tests.slice(0, maxTests);
  }
  if (!Object.keys(result).length) throw new Error('Give at least one of modules, symbols, keywords, list');
  return result;
}
// trod: promoted 2026-11-07T06:38:43.894Z
