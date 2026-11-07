import { buildGraph, exportedAdjacency, resolveRoot } from './js_call_graph.mjs';

export const meta = {
  description: 'Answers a batch of call-graph questions about the JavaScript code under a source root (default "src") in one call. Function ids are "<path relative to root>:<declared function name>", e.g. "billing/core.js:validate" (default exports use their declared function name). Only exported functions are graph nodes; calls that appear only in comments or strings are ignored; named/aliased/default/namespace (ns.f(), ns.f?.()) imports, re-exports and same-file calls are resolved; a call through a barrel such as users/index.js (export { checkNow } from "./helpers.js") is attributed to the defining function "users/helpers.js:checkNow", never to the index file. Ops: "callers" / "callees" (direct=true for direct only, else transitive) -> {ids: sorted array, count}; "path" (from -> to) -> {path: array of ids first..last inclusive, length = edges, shortestPathCount} or path:null if unreachable (BFS, ties broken by lexicographically smallest id at each step); "node" -> function info plus direct callers/callees. Transitive results never include the start function itself; selfInCycle=true tells you it reaches itself through a cycle.',
  whenToUse: 'For any question like "which functions call X directly or transitively", "how many distinct functions does X call", "shortest call chain from A to B", "what does X call directly". Put all questions in one queries array. Answer sorted-array questions with result.ids and count questions with result.count. If an id is unknown the result has error plus suggestions (closest ids).',
  inputSchema: {
    type: 'object',
    properties: {
      root: { type: 'string', description: 'Source root relative to project dir. Default "src".' },
      throughHelpers: { type: 'boolean', description: 'Attribute calls made via non-exported helper functions to the exported caller. Default true.' },
      queries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Optional label echoed back (e.g. "q1").' },
            op: { type: 'string', enum: ['callers', 'callees', 'path', 'node'] },
            id: { type: 'string', description: 'Function id (for path: the start).' },
            to: { type: 'string', description: 'Target id for op "path".' },
            direct: { type: 'boolean', description: 'callers/callees: direct only. Default false (transitive).' },
          },
          required: ['op', 'id'],
          additionalProperties: false,
        },
      },
    },
    required: ['queries'],
    additionalProperties: false,
  },
  examples: [
    { input: { queries: [{ op: 'callers', id: 'users/helpers.js:checkNow', direct: true }] }, expect: { contains: 'auth/helpers.js:notify' } },
    { input: { queries: [{ key: 'a', op: 'callees', id: 'users/core.js:format', direct: true }] }, expect: { contains: 'storage/model2.js:resolve' } },
    { input: { queries: [{ op: 'path', id: 'main.js:main', to: 'audit/view.js:notify' }] }, expect: { matches: '"path":\\s*\\[\\s*"main.js:main",\\s*"audit/view.js:notify"\\s*\\]' } },
  ],
  timeoutMs: 120000,
  provenance: { reason: 'Batch graph search (transitive callers/callees, shortest chains, counts) over js_call_graph data for code-QA tasks on src/.' },
};

function suggest(nodes, id) {
  const [file, name] = id.split(':');
  const c = Object.keys(nodes).filter((k) => k.startsWith(file + ':') || k.endsWith(':' + name));
  return c.sort().slice(0, 15);
}

function reach(adj, start, direct) {
  if (direct) return { set: new Set(adj[start]), self: adj[start].has(start) };
  const seen = new Set(); const st = [...adj[start]];
  while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const y of adj[x]) if (!seen.has(y)) st.push(y); }
  const self = seen.has(start); seen.delete(start);
  return { set: seen, self };
}

export default async function run(input, ctx) {
  const g = buildGraph(resolveRoot(ctx, input.root));
  const adj = exportedAdjacency(g, input.throughHelpers !== false);
  const radj = {}; for (const k of Object.keys(adj)) radj[k] = new Set();
  for (const [a, s] of Object.entries(adj)) for (const b of s) radj[b].add(a);
  const sorted = {}; for (const k of Object.keys(adj)) sorted[k] = [...adj[k]].sort();
  const check = (id) => { if (!adj[id]) return { error: g.nodes[id] ? `${id} is not exported` : `unknown function id ${id}`, suggestions: suggest(adj, id) }; return null; };
  const results = input.queries.map((q) => {
    const base = q.key ? { key: q.key, op: q.op } : { op: q.op, id: q.id };
    const e = check(q.id); if (e) return { ...base, ...e };
    if (q.op === 'callers' || q.op === 'callees') {
      const r = reach(q.op === 'callers' ? radj : adj, q.id, q.direct);
      r.set.delete(q.id);
      const ids = [...r.set].sort();
      return { ...base, direct: !!q.direct, count: ids.length, ids, ...(r.self ? { selfInCycle: true } : {}) };
    }
    if (q.op === 'node') {
      const n = g.nodes[q.id];
      return { ...base, file: n.file, name: n.name, line: n.line, isDefault: n.isDefault, callees: sorted[q.id], callers: [...radj[q.id]].sort() };
    }
    if (q.op === 'path') {
      const e2 = check(q.to); if (!q.to || e2) return { ...base, ...(e2 || { error: 'missing to' }) };
      // BFS from source; count shortest paths; reconstruct lexicographically smallest path
      const dist = { [q.id]: 0 }; const cnt = { [q.id]: 1 }; let frontier = [q.id];
      while (frontier.length && dist[q.to] === undefined) {
        const next = [];
        for (const x of frontier) for (const y of sorted[x]) {
          if (dist[y] === undefined) { dist[y] = dist[x] + 1; cnt[y] = cnt[x]; next.push(y); } else if (dist[y] === dist[x] + 1) cnt[y] += cnt[x];
        }
        frontier = next;
      }
      if (q.id === q.to) return { ...base, path: [q.id], length: 0, shortestPathCount: 1 };
      if (dist[q.to] === undefined) return { ...base, path: null, reachable: false };
      // distance-to-target via reverse BFS restricted, then greedy lexicographic walk
      const dt = { [q.to]: 0 }; let fr = [q.to];
      while (fr.length) { const nx = []; for (const x of fr) for (const y of radj[x]) if (dt[y] === undefined) { dt[y] = dt[x] + 1; nx.push(y); } fr = nx; }
      const p = [q.id]; let cur = q.id;
      while (cur !== q.to) { cur = sorted[cur].find((y) => dt[y] === dt[cur] - 1); p.push(cur); }
      return { ...base, path: p, length: p.length - 1, shortestPathCount: cnt[q.to] };
    }
    return { ...base, error: 'unknown op' };
  });
  return { results };
}
// trod: promoted 2026-11-07T04:35:22.437Z
