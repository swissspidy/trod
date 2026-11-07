import fs from 'node:fs';
import path from 'node:path';

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'do', 'else',
  'await', 'yield', 'delete', 'void', 'in', 'of', 'instanceof', 'throw', 'case', 'super', 'import', 'class', 'with', 'async']);

// Replace comments with spaces and string/template literal *contents* with a placeholder token "__S<n>__".
// Template ${...} expressions are kept as code. Regex literals are blanked.
export function cleanSource(src) {
  const strings = [];
  let out = '';
  let i = 0;
  const n = src.length;
  const tplStack = []; // brace depth at which a template expression started
  let depth = 0;
  let lastSig = ''; // last significant char of output (for regex detection)
  const readTemplate = () => { // i at char after backtick or after closing } of ${}
    let s = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { s += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; strings.push(s); out += `"__S${strings.length - 1}__"`; lastSig = '"'; return; }
      if (c === '$' && src[i + 1] === '{') { strings.push(s); out += `"__S${strings.length - 1}__"+(`; i += 2; tplStack.push(depth); depth++; lastSig = '('; return; }
      s += c; i++;
    }
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '"' || c === "'") {
      let s = ''; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') { s += src.slice(i, i + 2); i += 2; } else s += src[i++]; }
      i++; strings.push(s); out += `"__S${strings.length - 1}__"`; lastSig = '"'; continue;
    }
    if (c === '`') { i++; readTemplate(); continue; }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig) || /\b(return|typeof|case)\s*$/.test(out.slice(-10)))) {
      // regex literal
      let j = i + 1, inCls = false;
      while (j < n && src[j] !== '\n') { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') inCls = true; else if (ch === ']') inCls = false; else if (ch === '/' && !inCls) break; j++; }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      out += '/r/'; i = j; lastSig = '/'; continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (tplStack.length && tplStack[tplStack.length - 1] === depth) { tplStack.pop(); out += ')+'; i++; readTemplate(); continue; }
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return { code: out, strings };
}

function matchBrace(code, open) { // index of '{' (or '(') -> index of matching close
  const o = code[open], cl = o === '{' ? '}' : o === '(' ? ')' : ']';
  let d = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === o) d++; else if (code[k] === cl) { d--; if (d === 0) return k; }
  }
  return code.length - 1;
}

function depthMap(code) { // brace depth at each index (top level = 0)
  const m = new Int32Array(code.length + 1); let d = 0;
  for (let k = 0; k < code.length; k++) { m[k] = d; if (code[k] === '{' || code[k] === '(' || code[k] === '[') d++; else if (code[k] === '}' || code[k] === ')' || code[k] === ']') d--; }
  return m;
}

const lineOf = (code, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (code.charCodeAt(k) === 10) l++; return l; };

function paramNames(p) { return new Set((p.match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => !KEYWORDS.has(x))); }

function parseFile(rel, src) {
  const { code, strings } = cleanSource(src);
  const S = (tok) => { const m = /^"__S(\d+)__"$/.exec(tok.trim()); return m ? strings[+m[1]] : null; };
  const dm = depthMap(code);
  const imports = []; // {local, kind:'named'|'default'|'namespace', imported, spec}
  const reexports = []; // {exported, imported|'*', spec}
  const exportsMap = {}; // exportedName -> localName
  let defaultLocal = null;
  const functions = {}; // localName -> {name, line, start, end, params}

  // imports
  const impRe = /\bimport\s+([^;"]*?)\s*from\s*("__S\d+__")/g;
  for (let m; (m = impRe.exec(code));) {
    if (dm[m.index] !== 0) continue;
    const spec = S(m[2]); let clause = m[1].trim();
    const ns = /\*\s*as\s+([\w$]+)/.exec(clause);
    if (ns) { imports.push({ local: ns[1], kind: 'namespace', spec }); clause = clause.replace(ns[0], ''); }
    const br = /\{([^}]*)\}/.exec(clause);
    if (br) {
      for (const part of br[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const pm = /^(?:type\s+)?([\w$]+|"__S\d+__")(?:\s+as\s+([\w$]+))?$/.exec(part); if (!pm) continue;
        const imported = S(pm[1]) ?? pm[1];
        if (imported === 'default') imports.push({ local: pm[2], kind: 'default', spec });
        else imports.push({ local: pm[2] || imported, kind: 'named', imported, spec });
      }
      clause = clause.replace(br[0], '');
    }
    const def = /^\s*([\w$]+)/.exec(clause.replace(/,/g, ' '));
    if (def) imports.push({ local: def[1], kind: 'default', spec });
  }
  // re-exports
  const reRe = /\bexport\s+(\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*("__S\d+__")/g;
  for (let m; (m = reRe.exec(code));) {
    const spec = S(m[2]);
    if (m[1].startsWith('*')) { const a = /as\s+([\w$]+)/.exec(m[1]); reexports.push(a ? { exported: a[1], namespace: true, spec } : { exported: '*', imported: '*', spec }); continue; }
    for (const part of m[1].slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)) {
      const pm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part); if (pm) reexports.push({ exported: pm[2] || pm[1], imported: pm[1], spec });
    }
  }
  // function declarations at top level
  const fnRe = /(\bexport\s+(default\s+)?)?(?:async\s+)?\bfunction\s*\*?\s*([\w$]*)\s*\(/g;
  for (let m; (m = fnRe.exec(code));) {
    if (dm[m.index] !== 0) continue;
    const pOpen = m.index + m[0].length - 1; const pClose = matchBrace(code, pOpen);
    const bOpen = code.indexOf('{', pClose); const bEnd = matchBrace(code, bOpen);
    const name = m[3] || (m[2] ? 'default' : null); if (!name) continue;
    functions[name] = { name, line: lineOf(code, m.index), start: bOpen, end: bEnd, params: paramNames(code.slice(pOpen + 1, pClose)) };
    if (m[1]) { if (m[2]) defaultLocal = name; else exportsMap[name] = name; }
  }
  // const/let/var name = function / arrow
  const varRe = /(\bexport\s+)?\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:function\b\s*\*?\s*[\w$]*\s*\(|(\([^)]*\)|[\w$]+)\s*=>)/g;
  for (let m; (m = varRe.exec(code));) {
    if (dm[m.index] !== 0) continue;
    const name = m[2]; let start, end, params;
    if (m[3] === undefined) { // function expression
      const pOpen = m.index + m[0].length - 1; const pClose = matchBrace(code, pOpen);
      params = paramNames(code.slice(pOpen + 1, pClose)); start = code.indexOf('{', pClose); end = matchBrace(code, start);
    } else {
      params = paramNames(m[3]); let k = m.index + m[0].length; while (/\s/.test(code[k])) k++;
      if (code[k] === '{') { start = k; end = matchBrace(code, k); } else { start = k; end = k; while (end < code.length && !(dm[end] === 0 && (code[end] === ';' || code[end] === '\n'))) end++; }
    }
    functions[name] = { name, line: lineOf(code, m.index), start, end, params };
    if (m[1]) exportsMap[name] = name;
  }
  // export { a, b as c }  (no from)
  const exRe = /\bexport\s*\{([^}]*)\}(?!\s*from)/g;
  for (let m; (m = exRe.exec(code));) {
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const pm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part); if (!pm) continue;
      if (pm[2] === 'default') defaultLocal = pm[1]; else exportsMap[pm[2] || pm[1]] = pm[1];
    }
  }
  const ed = /\bexport\s+default\s+([\w$]+)\s*;?/.exec(code);
  if (ed && !['function', 'async', 'class'].includes(ed[1])) defaultLocal = ed[1];

  // raw calls per function
  for (const f of Object.values(functions)) {
    const body = code.slice(f.start, f.end + 1);
    const calls = [];
    const memRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*([\w$]+)\s*(?:\?\.\s*)?\(/g;
    for (let m; (m = memRe.exec(body));) calls.push({ obj: m[1], prop: m[2] });
    const bracketRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*\[\s*("__S\d+__")\s*\]\s*(?:\?\.\s*)?\(/g;
    for (let m; (m = bracketRe.exec(body));) calls.push({ obj: m[1], prop: S(m[2]) });
    const idRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?:\?\.\s*)?\(/g;
    for (let m; (m = idRe.exec(body));) {
      if (KEYWORDS.has(m[1])) continue;
      const before = body.slice(Math.max(0, m.index - 12), m.index);
      if (/\bfunction\s*\*?\s*$/.test(before)) continue; // nested declaration name
      calls.push({ name: m[1] });
    }
    // locally declared shadowing names (params, const/let/var, nested functions)
    const shadow = new Set(f.params);
    for (const dm2 of body.matchAll(/\b(?:const|let|var)\s+([\w$]+)/g)) shadow.add(dm2[1]);
    for (const dm2 of body.slice(1).matchAll(/\bfunction\s*\*?\s*([\w$]+)/g)) shadow.add(dm2[1]);
    f.calls = calls; f.shadow = shadow;
  }
  return { rel, imports, reexports, exportsMap, defaultLocal, functions };
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js|cjs|jsx)$/.test(e.name)) out.push(p); } };
  walk(dir); return out.sort();
}

const graphCache = new Map();

export function buildGraph(rootDir) {
  const files = listFiles(rootDir);
  const key = rootDir + '|' + files.map((f) => f + fs.statSync(f).mtimeMs).join(',');
  if (graphCache.has(key)) return graphCache.get(key);
  const mods = {};
  for (const f of files) { const rel = path.relative(rootDir, f).split(path.sep).join('/'); mods[rel] = parseFile(rel, fs.readFileSync(f, 'utf8')); }
  const resolveSpec = (fromRel, spec) => {
    if (!spec || !spec.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    for (const c of [base, base + '.js', base + '.mjs', base + '/index.js', base + '/index.mjs']) if (mods[c]) return c;
    return null;
  };
  // resolve exported name of module -> {file, local} (function definition)
  const resolveExport = (rel, name, seen = new Set()) => {
    const m = mods[rel]; if (!m || seen.has(rel + ':' + name)) return null; seen.add(rel + ':' + name);
    if (name === 'default') { if (m.defaultLocal) return resolveLocal(rel, m.defaultLocal, seen); }
    else if (m.exportsMap[name]) return resolveLocal(rel, m.exportsMap[name], seen);
    for (const r of m.reexports) {
      if (r.exported === name && r.imported && r.imported !== '*') { const t = resolveSpec(rel, r.spec); if (t) return resolveExport(t, r.imported, seen); }
    }
    for (const r of m.reexports) if (r.exported === '*' && name !== 'default') { const t = resolveSpec(rel, r.spec); const x = t && resolveExport(t, name, seen); if (x) return x; }
    return null;
  };
  const resolveLocal = (rel, local, seen) => {
    const m = mods[rel];
    if (m.functions[local]) return { file: rel, local };
    const imp = m.imports.find((i) => i.local === local);
    if (imp && imp.kind !== 'namespace') { const t = resolveSpec(rel, imp.spec); if (t) return resolveExport(t, imp.kind === 'default' ? 'default' : imp.imported, seen); }
    return null;
  };
  const idOf = (file, local) => {
    const m = mods[file];
    return `${file}:${local}`;
  };
  const isExported = (file, local) => { const m = mods[file]; return m.defaultLocal === local || Object.values(m.exportsMap).includes(local); };

  const nodes = {}; const rawEdges = []; const unresolved = [];
  for (const [rel, m] of Object.entries(mods)) {
    for (const f of Object.values(m.functions)) {
      const id = idOf(rel, f.name);
      const exportedAs = Object.entries(m.exportsMap).filter(([, l]) => l === f.name).map(([e]) => e);
      if (m.defaultLocal === f.name) exportedAs.push('default');
      nodes[id] = { id, file: rel, name: f.name, line: f.line, exported: exportedAs.length > 0, isDefault: m.defaultLocal === f.name, exportedAs };
      for (const c of f.calls) {
        let target = null; let label;
        if (c.name) {
          label = c.name; if (f.shadow.has(c.name)) continue;
          if (m.functions[c.name]) target = { file: rel, local: c.name };
          else { const imp = m.imports.find((i) => i.local === c.name); if (!imp) continue; target = resolveLocal(rel, c.name, new Set()); if (!target) unresolved.push({ from: id, call: label, spec: imp.spec }); }
        } else {
          label = `${c.obj}.${c.prop}`; if (f.shadow.has(c.obj)) continue;
          const imp = m.imports.find((i) => i.local === c.obj && i.kind === 'namespace');
          if (!imp) continue;
          const t = resolveSpec(rel, imp.spec);
          target = t && resolveExport(t, c.prop);
          if (!target) unresolved.push({ from: id, call: label, spec: imp.spec });
        }
        if (target) rawEdges.push([id, idOf(target.file, target.local)]);
      }
    }
  }
  const adjAll = {};
  for (const id of Object.keys(nodes)) adjAll[id] = new Set();
  for (const [a, b] of rawEdges) adjAll[a].add(b);
  const g = { mods, nodes, adjAll, unresolved, isExported, fileCount: files.length };
  graphCache.set(key, g);
  return g;
}

// Exported-only adjacency. throughHelpers: calls that go via non-exported helpers are attributed to the exported caller.
export function exportedAdjacency(g, throughHelpers = true) {
  const adj = {};
  for (const [id, n] of Object.entries(g.nodes)) {
    if (!n.exported) continue;
    const out = new Set(); const seen = new Set([id]); const stack = [...g.adjAll[id]];
    while (stack.length) {
      const t = stack.pop(); if (seen.has(t) && t !== id) continue; seen.add(t);
      if (g.nodes[t].exported) out.add(t);
      else if (throughHelpers) for (const u of g.adjAll[t]) if (!seen.has(u) || u === id) stack.push(u);
    }
    adj[id] = out;
  }
  return adj;
}

export function resolveRoot(ctx, root) {
  const r = path.resolve(ctx?.projectDir || process.cwd(), root || 'src');
  if (!fs.existsSync(r)) throw new Error(`root directory not found: ${r}`);
  return r;
}

export const meta = {
  description: 'Parses every .js/.mjs file under a source root (default "src") and returns the static call graph between functions as clean records: nodes [{id, file, name, line, exported, isDefault}] and edges [{from, to}], where id = "<path relative to root>:<declared function name>" (default exports use their declared name, e.g. "users/core.js:format"; anonymous default -> ":default"; a function exported under an alias via export {cc as c} keeps its declared name "cc"). The code base has 130 files / 416 exported functions; every call site is "x = f(input)" or "ns.f(input)" / "ns.f?.(input)". Calls written only in comments or string/template text are ignored; calls via named imports, aliased imports (import {a as b}), default imports, namespace imports (ns.f(), ns.f?.(), ns["f"]()), re-exports (export {..} from / export * from) and same-file calls are resolved to the defining function. By default only exported functions are included and calls routed through non-exported helpers are attributed to the exported caller (helpers in this code base just return their argument, so this rarely matters).',
  whenToUse: 'When you need raw call-graph data (edge lists, who calls what directly, per-file function inventory) for ad-hoc analysis in trod_eval. For callers/callees/transitive/shortest-path/count questions, prefer call_graph_query which does the graph search for you on the same data. Filter with fileFilter (substring/regex of path) or ids to keep output small.',
  inputSchema: {
    type: 'object',
    properties: {
      root: { type: 'string', description: 'Source root relative to the project dir. Default "src".' },
      includeHelpers: { type: 'boolean', description: 'Include non-exported functions as nodes and raw edges to/from them. Default false.' },
      fileFilter: { type: 'string', description: 'Regex applied to node file path; only edges whose caller matches (and those nodes) are returned.' },
      ids: { type: 'array', items: { type: 'string' }, description: 'Only return these nodes and their outgoing edges.' },
      includeEdges: { type: 'boolean', description: 'Default true.' },
      includeNodes: { type: 'boolean', description: 'Default true.' },
      adjacency: { type: 'boolean', description: 'Return edges compactly as adjacency {callerId: [calleeIds sorted]} instead of [{from,to}]. Default false.' },
    },
    additionalProperties: false,
  },
  examples: [
    { input: { ids: ['users/core.js:format'] }, expect: { contains: 'mail/index2.js:load' } },
    { input: { fileFilter: '^main\\.js$' }, expect: { contains: 'main.js:main' } },
  ],
  timeoutMs: 120000,
  provenance: { reason: 'Static call-graph extraction for repeated code-QA questions about src/ (callers, callees, chains, counts). Verified against an independent regex count (773 call lines = 773 edges) and a synthetic test of comments/strings/templates/regex/re-exports/shadowing.' },
};

export default async function run(input, ctx) {
  const g = buildGraph(resolveRoot(ctx, input.root));
  const adj = input.includeHelpers ? g.adjAll : exportedAdjacency(g, true);
  const re = input.fileFilter ? new RegExp(input.fileFilter) : null;
  const idset = input.ids ? new Set(input.ids) : null;
  const keep = (id) => (!re || re.test(g.nodes[id].file)) && (!idset || idset.has(id));
  if (idset) for (const id of idset) if (!g.nodes[id]) throw new Error(`unknown function id ${id}`);
  const ids = Object.keys(adj).filter(keep).sort();
  const res = { root: input.root || 'src', files: g.fileCount, nodeCount: ids.length };
  if (input.includeNodes !== false) res.nodes = ids.map((id) => { const { exportedAs, ...n } = g.nodes[id]; return n; });
  if (input.includeEdges !== false && input.adjacency) res.adjacency = Object.fromEntries(ids.map((id) => [id, [...adj[id]].sort()]));
  else if (input.includeEdges !== false) res.edges =ids.flatMap((id) => [...adj[id]].sort().map((to) => ({ from: id, to })));
  if (g.unresolved.length) res.unresolvedImportCalls = g.unresolved.filter((u) => keep(u.from)).slice(0, 50);
  return res;
}
// trod: promoted 2026-11-07T04:35:22.779Z
