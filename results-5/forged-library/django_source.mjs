import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const meta = {
  provenance: { reason: 'Toolsmith session: helpers for fixing Django 4.x bugs (run tests, reproduce, navigate code).' },
  description:
    'Returns the exact source (with line numbers) of Python definitions in this checkout, found statically with the ast module (no import, no settings needed). ' +
    "Batch: targets:[...] -> results:[{target, matches:[{file (repo-relative), qualname, kind:'class'|'function'|'method'|'assignment'|'module', startLine, endLine, " +
    "source:'  123| code' (or outline), truncated}], error?}]. Target forms: dotted import path 'django.db.models.query.QuerySet.bulk_create'; " +
    "re-exports are followed ('django.db.models.Q' -> django/db/models/query_utils.py); file + qualname 'django/db/models/sql/query.py:Query.add_q'; " +
    "or a bare/partial qualname 'Query.add_q', 'slugify', 'SQLCompiler.as_sql' which is searched across django/ (all definitions with that name, e.g. every as_sql override, up to maxMatches).",
  whenToUse:
    'Instead of cat/sed on big Django files: read exactly the function/method/class you need, with line numbers you can cite when editing. ' +
    "Module targets (e.g. 'django.db.models.sql.query' or 'django/forms/forms.py:') always come back as an outline. Use outline:true on a class to get member signatures + line ranges (e.g. outline of django.db.models.sql.query.Query) and then fetch the members you need. " +
    "Set includeTests:true to also search tests/ for bare names. Decorators are included in the range. Line numbers reflect the file at call time (re-call after editing).",
  inputSchema: {
    type: 'object',
    properties: {
      targets: { type: 'array', items: { type: 'string' }, minItems: 1, description: "e.g. ['django.utils.text.slugify', 'Query.add_q', 'django/forms/fields.py:Field']" },
      outline: { type: 'boolean', description: 'For classes/modules return member signatures with line ranges instead of full source.' },
      maxLines: { type: 'integer', minimum: 5, description: 'Max source lines per match (default 250).' },
      maxMatches: { type: 'integer', minimum: 1, description: 'Max matches per bare-name target (default 8).' },
      includeTests: { type: 'boolean', description: 'Also search tests/ for bare names.' },
    },
    required: ['targets'],
    additionalProperties: false,
  },
  examples: [
    { input: { targets: ['django.utils.text.slugify'] }, expect: { matches: 'django/utils/text\\.py[\\s\\S]*def slugify' } },
    { input: { targets: ['django.db.models.Q'], outline: true }, expect: { contains: 'query_utils.py' } },
    { input: { targets: ['Query.add_q'] }, expect: { contains: 'def add_q' } },
  ],
  timeoutMs: 120000,
};

const PY = String.raw`
import ast, json, os, sys
cfg = json.load(open(sys.argv[1]))
proj = cfg['projectDir']
maxLines = cfg['maxLines']; outline = cfg['outline']

_cache = {}
def parse(path):
    if path not in _cache:
        try:
            src = open(path, encoding='utf-8').read()
            _cache[path] = (ast.parse(src), src.splitlines())
        except Exception as e:
            _cache[path] = (None, [])
    return _cache[path]

def module_file(dotted):
    parts = dotted.split('.')
    base = os.path.join(proj, *parts)
    if os.path.isfile(base + '.py'): return base + '.py'
    if os.path.isfile(os.path.join(base, '__init__.py')): return os.path.join(base, '__init__.py')
    return None

def start_of(node):
    decs = getattr(node, 'decorator_list', None) or []
    return min([node.lineno] + [d.lineno for d in decs])

def kind_of(node, in_class):
    if isinstance(node, ast.ClassDef): return 'class'
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): return 'method' if in_class else 'function'
    return 'assignment'

def names_of(node):
    if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)): return [node.name]
    if isinstance(node, ast.Assign):
        out = []
        for t in node.targets:
            if isinstance(t, ast.Name): out.append(t.id)
            elif isinstance(t, ast.Tuple): out += [e.id for e in t.elts if isinstance(e, ast.Name)]
        return out
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name): return [node.target.id]
    return []

def find_in(body, parts, in_class=False):
    # returns list of (node, qualname, in_class)
    name = parts[0]
    hits = []
    for node in body:
        if name in names_of(node):
            if len(parts) == 1:
                hits.append((node, in_class))
            elif isinstance(node, ast.ClassDef):
                hits += find_in(node.body, parts[1:], True)
        elif isinstance(node, ast.If) or isinstance(node, ast.Try):
            # definitions under if/try at module level
            sub = list(node.body) + list(getattr(node, 'orelse', [])) + [s for h in getattr(node, 'handlers', []) for s in h.body]
            hits += find_in(sub, parts, in_class)
    return hits

def signature(lines, node):
    s = node.lineno - 1
    out = []
    for i in range(s, min(s + 8, len(lines))):
        out.append(lines[i].strip())
        if lines[i].rstrip().endswith(':') and isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)): break
        if not isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)): break
    sig = ' '.join(out)
    return sig[:200]

def render(path, lines, node, qual, in_class):
    rel = os.path.relpath(path, proj)
    if node is None:
        start, end, kind = 1, len(lines), 'module'
    else:
        start, end, kind = start_of(node), node.end_lineno, kind_of(node, in_class)
    m = {'file': rel, 'qualname': qual, 'kind': kind, 'startLine': start, 'endLine': end}
    body = None
    if node is None: body = ast.parse('\n'.join(lines)).body if lines else []
    elif isinstance(node, ast.ClassDef): body = node.body
    if (outline or (node is None and cfg.get('outlineModules', True))) and body is not None:
        out = []
        if node is not None:
            out.append('%5d| %s' % (node.lineno, signature(lines, node)))
            ds = ast.get_docstring(node)
            if ds: out.append('       """%s"""' % ds.strip().splitlines()[0][:150])
        def walk(b, depth):
            for n in b:
                if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef, ast.Assign, ast.AnnAssign)):
                    decs = ''.join('@' + ast.unparse(d) + ' ' for d in getattr(n, 'decorator_list', [])) if hasattr(ast, 'unparse') else ''
                    out.append('%5d-%-5d %s%s%s' % (start_of(n), n.end_lineno, '    ' * depth, decs, signature(lines, n)))
                    if isinstance(n, ast.ClassDef) and node is None and depth == 0:
                        walk(n.body, depth + 1)
                elif isinstance(n, (ast.If, ast.Try)) and node is None:
                    walk(list(n.body) + list(getattr(n, 'orelse', [])), depth)
        walk(body, 1 if node is not None else 0)
        m['source'] = '\n'.join(out[:maxLines * 2])
        m['truncated'] = len(out) > maxLines * 2
    else:
        seg = lines[start - 1:end]
        m['truncated'] = len(seg) > maxLines
        seg = seg[:maxLines]
        m['source'] = '\n'.join('%5d| %s' % (start + i, l) for i, l in enumerate(seg))
        if m['truncated']: m['source'] += '\n   ...  (%d more lines; use outline or raise maxLines)' % (end - start + 1 - maxLines)
    return m

def resolve_import(path, tree, name):
    # find "from X import name [as name]" in module; return (dotted module, original name)
    pkg_parts = os.path.relpath(path, proj)[:-3].split(os.sep)
    if pkg_parts[-1] == '__init__': pkg_parts = pkg_parts[:-1]
    else: pkg_parts = pkg_parts[:-1]
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for a in node.names:
                if (a.asname or a.name) == name or a.name == '*':
                    if node.level:
                        base = pkg_parts[:len(pkg_parts) - node.level + 1]
                        mod = '.'.join(base + ([node.module] if node.module else []))
                    else:
                        mod = node.module
                    if a.name == '*':
                        yield (mod, name)
                    else:
                        yield (mod, a.name)

def lookup_dotted(dotted, depth=0):
    parts = dotted.split('.')
    for i in range(len(parts), 0, -1):
        mf = module_file('.'.join(parts[:i]))
        if not mf: continue
        rest = parts[i:]
        tree, lines = parse(mf)
        if tree is None: return []
        if not rest:
            return [render(mf, lines, None, '.'.join(parts[:i]), False)]
        hits = find_in(tree.body, rest)
        if hits:
            # prefer class/function over assignment
            hits.sort(key=lambda h: isinstance(h[0], (ast.Assign, ast.AnnAssign)))
            return [render(mf, lines, n, '.'.join(rest), ic) for n, ic in hits]
        if depth < 4:
            for mod, orig in resolve_import(mf, tree, rest[0]):
                if mod and mod.split('.')[0] in ('django', 'tests') or (mod and module_file(mod)):
                    r = lookup_dotted('.'.join([mod, orig] + rest[1:]), depth + 1)
                    if r: return r
        return []
    return []

def lookup_bare(qual, files, maxMatches):
    parts = qual.split('.')
    out = []
    for f in files:
        tree, lines = parse(f)
        if tree is None: continue
        # search any nesting: top-level or inside classes (one level), match suffix
        def rec(body, prefix, in_class):
            for n in body:
                if isinstance(n, (ast.If, ast.Try)):
                    rec(list(n.body) + list(getattr(n, 'orelse', [])), prefix, in_class)
                    continue
                for nm in names_of(n):
                    q = prefix + [nm]
                    if q[-len(parts):] == parts and (len(parts) > 1 or not isinstance(n, (ast.Assign, ast.AnnAssign)) or not in_class):
                        out.append(render(f, lines, n, '.'.join(q), in_class))
                if isinstance(n, ast.ClassDef):
                    rec(n.body, prefix + [n.name], True)
        rec(tree.body, [], False)
    # definitions in django/ first, then by path length
    out.sort(key=lambda m: (not m['file'].startswith('django'), m['kind'] == 'assignment', len(m['file'])))
    return out[:maxMatches], len(out)

results = []
for t in cfg['targets']:
    r = {'target': t}
    try:
        t2 = t.strip()
        if ':' in t2 and t2.split(':')[0].endswith('.py'):
            fpart, q = t2.split(':', 1)
            fp = os.path.join(proj, fpart)
            tree, lines = parse(fp)
            if tree is None: raise Exception('cannot parse/open ' + fpart)
            hits = find_in(tree.body, q.split('.')) if q else []
            r['matches'] = [render(fp, lines, n, q, ic) for n, ic in hits] if q else [render(fp, lines, None, fpart, False)]
        elif t2.startswith('django.') or t2.startswith('tests.') or t2 == 'django':
            r['matches'] = lookup_dotted(t2)
        else:
            files = cfg['candidates'].get(t2, [])
            r['matches'], total = lookup_bare(t2, files, cfg['maxMatches'])
            if total > len(r['matches']): r['moreMatches'] = total - len(r['matches'])
        if not r['matches']:
            r['error'] = 'not found (check spelling; for attributes defined in __init__ or dynamically, use django_grep)'
    except Exception as e:
        r['error'] = '%s: %s' % (type(e).__name__, e)
        r.setdefault('matches', [])
    results.append(r)
print(json.dumps({'results': results}))
`;

function rg(args, cwd) {
  return new Promise((resolve) => {
    execFile('rg', args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => resolve(stdout || ''));
  });
}

export default async function run(input, ctx) {
  const projectDir = ctx.projectDir;
  const candidates = {};
  const roots = ['django', ...(input.includeTests ? ['tests'] : [])];
  for (const t of input.targets) {
    const s = t.trim();
    if (s.startsWith('django.') || s.startsWith('tests.') || /\.py:/.test(s)) continue;
    const last = s.split('.').pop();
    if (!/^\w+$/.test(last)) continue;
    const out = await rg(['-l', '--type', 'py', '-e', `^\\s*(async\\s+)?(def|class)\\s+${last}\\b`, '-e', `^\\s*${last}\\s*(:[^=]+)?=[^=]`, ...roots], projectDir);
    candidates[s] = out.split('\n').filter(Boolean).map((f) => path.join(projectDir, f));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-src-'));
  try {
    const cfg = { projectDir, targets: input.targets, outline: !!input.outline, maxLines: input.maxLines || 250, maxMatches: input.maxMatches || 8, candidates };
    fs.writeFileSync(path.join(tmp, 'cfg.json'), JSON.stringify(cfg));
    fs.writeFileSync(path.join(tmp, 'src.py'), PY);
    const out = await new Promise((resolve, reject) => {
      const child = spawn('python', ['-I', path.join(tmp, 'src.py'), path.join(tmp, 'cfg.json')], { cwd: tmp });
      let so = '', se = '';
      child.stdout.on('data', (d) => (so += d));
      child.stderr.on('data', (d) => (se += d));
      child.on('close', (c) => (c === 0 ? resolve(so) : reject(new Error('python failed: ' + se.slice(-2000)))));
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
// trod: promoted 2026-11-07T06:38:46.080Z
