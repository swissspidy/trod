import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';
import { rng, same, write } from '../lib/util.ts';

/**
 * Call-graph questions about a generated JavaScript codebase. The code uses every import style (named, aliased,
 * namespace, default, barrel re-exports), function names collide across modules, and comments and strings mention
 * function names, so grep answers are unreliable. Each step asks new questions about the same code: a reusable
 * analysis (built once) answers all of them; ad-hoc grepping has to start over every time.
 */

const DOMAINS = ['api', 'auth', 'billing', 'storage', 'audit', 'mail', 'search', 'users', 'reports', 'jobs'];
const NAMES = ['validate', 'load', 'save', 'format', 'handle', 'process', 'sync', 'notify', 'compute', 'parse', 'render', 'check', 'build', 'resolve', 'apply', 'merge'];

interface Fn {
  id: string; // "billing/invoice.js:finalize"
  module: string; // "billing/invoice.js"
  name: string;
  isDefault: boolean;
  calls: string[]; // ids
}
interface Mod {
  path: string; // "billing/invoice.js"
  fns: Fn[];
  /** Never called, not re-exported, not imported from main.js: unreachable. */
  dead: boolean;
}

function generate() {
  const r = rng(4242);
  const mods: Mod[] = [];
  for (const d of DOMAINS) {
    const n = r.int(9, 14);
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      let base = `${r.pick(['core', 'service', 'helpers', 'store', 'client', 'policy', 'queue', 'cache', 'model', 'view', 'rules', 'adapter', 'worker', 'index2'])}`;
      while (used.has(base)) base = `${base}${r.int(2, 9)}`;
      used.add(base);
      const p = `${d}/${base}.js`;
      const fnNames = new Set<string>();
      const k = r.int(2, 5);
      while (fnNames.size < k) fnNames.add(r.pick(NAMES) + (r.chance(0.3) ? r.pick(['All', 'One', 'Batch', 'Item', 'Now']) : ''));
      const fns = [...fnNames].map((name, j) => ({ id: `${p}:${name}`, module: p, name, isDefault: j === 0 && r.chance(0.15), calls: [] as string[] }));
      mods.push({ path: p, fns, dead: false });
    }
  }
  for (const m of mods) m.dead = r.chance(0.1);
  // Global order: a function only calls functions later in the order (no recursion, a DAG).
  const all = mods.flatMap((m) => m.fns);
  const deadIds = new Set(mods.filter((m) => m.dead).flatMap((m) => m.fns.map((f) => f.id)));
  const order = [...all].sort(() => r.next() - 0.5);
  const rank = new Map(order.map((f, i) => [f.id, i]));
  for (const f of all) {
    const later = order.filter((g) => rank.get(g.id)! > rank.get(f.id)! && g.module !== f.module && !deadIds.has(g.id));
    const k = Math.min(later.length, r.pick([0, 1, 1, 2, 2, 3, 4]));
    // Prefer few target modules so imports are shared.
    for (let i = 0; i < k; i++) {
      const g = later[Math.floor(Math.pow(r.next(), 2) * later.length)]!;
      if (!f.calls.includes(g.id)) f.calls.push(g.id);
    }
  }
  return { mods, all, byId: new Map(all.map((f) => [f.id, f])) };
}

type Graph = ReturnType<typeof generate>;

/** Renders the source files, with varied import styles, barrels and noise. */
function render(g: Graph): Record<string, string> {
  const r = rng(777);
  const files: Record<string, string> = {};
  // Barrels: each domain has index.js re-exporting some functions (aliased on collision).
  const barrel = new Map<string, Map<string, string>>(); // domain -> fnId -> exported name
  for (const d of DOMAINS) {
    const exported = new Map<string, string>();
    const lines: string[] = ['// Public surface of the ' + d + ' domain.'];
    for (const m of g.mods.filter((x) => x.path.startsWith(d + '/'))) {
      for (const f of m.fns) {
        if (m.dead || f.isDefault || !r.chance(0.5)) continue;
        const taken = [...exported.values()].includes(f.name);
        const as = taken ? `${f.name}${m.path.split('/')[1]!.replace('.js', '').replace(/^./, (c) => c.toUpperCase())}` : f.name;
        exported.set(f.id, as);
        lines.push(as === f.name ? `export { ${f.name} } from './${m.path.split('/')[1]}';` : `export { ${f.name} as ${as} } from './${m.path.split('/')[1]}';`);
      }
    }
    barrel.set(d, exported);
    files[`src/${d}/index.js`] = lines.join('\n') + '\n';
  }

  for (const m of g.mods) {
    const imports: string[] = [];
    const callExpr = new Map<string, string>(); // fnId -> expression used to call it
    const targetsByModule = new Map<string, Fn[]>();
    for (const f of m.fns) for (const c of f.calls) {
      const t = g.byId.get(c)!;
      if (!targetsByModule.has(t.module)) targetsByModule.set(t.module, []);
      if (!targetsByModule.get(t.module)!.includes(t)) targetsByModule.get(t.module)!.push(t);
    }
    const localNames = new Set(m.fns.map((f) => f.name));
    let aliasN = 0;
    for (const [tm, ts] of targetsByModule) {
      const rel = path.posix.relative(path.posix.dirname(m.path), tm);
      const spec = rel.startsWith('.') ? rel : `./${rel}`;
      const dom = tm.split('/')[0]!;
      const style = r.pick(['named', 'alias', 'ns', 'barrel'] as const);
      const defaults = ts.filter((t) => t.isDefault);
      const named = ts.filter((t) => !t.isDefault);
      for (const t of defaults) {
        const local = `${t.name}Default${++aliasN}`;
        imports.push(`import ${local} from '${spec}';`);
        callExpr.set(t.id, local);
      }
      if (!named.length) continue;
      const b = barrel.get(dom)!;
      if (style === 'barrel' && named.every((t) => b.has(t.id)) && dom !== m.path.split('/')[0]) {
        const brel = path.posix.relative(path.posix.dirname(m.path), `${dom}/index.js`);
        const parts = named.map((t) => {
          const exp = b.get(t.id)!;
          const local = localNames.has(exp) || [...callExpr.values()].includes(exp) ? `${exp}From${dom[0]!.toUpperCase()}${dom.slice(1)}${++aliasN}` : exp;
          callExpr.set(t.id, local);
          return local === exp ? exp : `${exp} as ${local}`;
        });
        imports.push(`import { ${parts.join(', ')} } from '${brel.startsWith('.') ? brel : './' + brel}';`);
      } else if (style === 'ns') {
        const ns = `${tm.split('/')[1]!.replace('.js', '')}${dom[0]!.toUpperCase()}${dom.slice(1)}${++aliasN}`;
        imports.push(`import * as ${ns} from '${spec}';`);
        for (const t of named) callExpr.set(t.id, `${ns}.${t.name}`);
      } else {
        const parts = named.map((t) => {
          const clash = localNames.has(t.name) || [...callExpr.values()].includes(t.name);
          const local = style === 'alias' || clash ? `${t.name}${tm.split('/')[1]!.replace('.js', '').replace(/^./, (c) => c.toUpperCase())}${++aliasN}` : t.name;
          callExpr.set(t.id, local);
          return local === t.name ? t.name : `${t.name} as ${local}`;
        });
        imports.push(`import { ${parts.join(', ')} } from '${spec}';`);
      }
    }
    const body: string[] = [];
    for (const f of m.fns) {
      const lines = [`${f.isDefault ? 'export default function' : 'export function'} ${f.name}(input) {`];
      if (r.chance(0.3)) {
        const other = r.pick(g.all);
        lines.push(`  // NOTE: unlike ${other.name}() in ${other.module}, this does not retry.`);
      }
      lines.push(`  const result = { step: '${f.name}', input };`);
      for (const c of f.calls) lines.push(`  result.${g.byId.get(c)!.name.replace(/\W/g, '')}${f.calls.indexOf(c)} = ${callExpr.get(c)}(input);`);
      if (r.chance(0.25)) lines.push(`  logEvent('${r.pick(g.all).name} skipped');`);
      lines.push('  return result;', '}');
      body.push(lines.join('\n'));
    }
    // A local helper whose name collides with exported functions elsewhere (never called).
    if (r.chance(0.4)) {
      const taken = new Set([...localNames, ...[...callExpr.values()].map((e) => e.split('.')[0]!)]);
      const helper = NAMES.find((n) => !taken.has(n) && r.chance(0.5)) ?? NAMES.find((n) => !taken.has(n));
      if (helper) body.push(`function ${helper}(x) {\n  return x;\n}`);
    }
    body.push('function logEvent(message) {\n  return message;\n}');
    files[`src/${m.path}`] = [...imports, '', ...body].join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  // main.js imports a subset of modules; the rest are reachable only through them, or not at all.
  const entry = g.mods.filter((m) => !m.dead && r.chance(0.12)).slice(0, 8);
  files['src/main.js'] =
    entry.map((m, i) => `import * as entry${i} from './${m.path}';`).join('\n') +
    `\n\nexport function main(input) {\n${entry.map((m, i) => `  entry${i}.${m.fns.find((f) => !f.isDefault)?.name ?? 'default'}?.(input);`).join('\n')}\n}\n`;
  files['package.json'] = JSON.stringify({ name: 'monolith', type: 'module', private: true }, null, 2) + '\n';
  return files;
}

/** Module import graph (including barrels), for reachability from main.js. */
function moduleGraph(files: Record<string, string>): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const [file, src] of Object.entries(files)) {
    if (!file.endsWith('.js')) continue;
    const deps: string[] = [];
    for (const m of src.matchAll(/(?:import|export)[^'"]*from '([^']+)'/g)) deps.push(path.posix.join(path.posix.dirname(file), m[1]!));
    edges.set(file, deps);
  }
  return edges;
}

function transitiveCallees(g: Graph, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...g.byId.get(id)!.calls];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    stack.push(...g.byId.get(c)!.calls);
  }
  return seen;
}

function shortestPathLen(g: Graph, from: string, to: string): number {
  const dist = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const x = q.shift()!;
    if (x === to) return dist.get(x)!;
    for (const c of g.byId.get(x)!.calls) {
      if (dist.has(c)) continue;
      dist.set(c, dist.get(x)! + 1);
      q.push(c);
    }
  }
  return -1;
}

type Question =
  | { id: string; kind: 'callers'; target: string; text: string; answer: string[] }
  | { id: string; kind: 'path'; from: string; to: string; text: string; length: number }
  | { id: string; kind: 'count'; fn: string; text: string; answer: number }
  | { id: string; kind: 'unreachable'; text: string; answer: string[] };

function questions(g: Graph, files: Record<string, string>): Question[][] {
  const r = rng(99 + 1);
  const closure = new Map(g.all.map((f) => [f.id, transitiveCallees(g, f.id)]));
  const callers = (t: string) => g.all.filter((f) => closure.get(f.id)!.has(t)).map((f) => f.id).sort();
  const pick = <T>(xs: T[], pred: (x: T) => boolean) => {
    const ok = xs.filter(pred);
    return ok[Math.floor(r.next() * ok.length)]!;
  };
  const steps: Question[][] = [];
  const usedTargets = new Set<string>();
  for (let s = 0; s < 4; s++) {
    const qs: Question[] = [];
    // 1. transitive callers of a function with a moderate fan-in
    const t = pick(g.all, (f) => !usedTargets.has(f.id) && callers(f.id).length >= 3 && callers(f.id).length <= 12);
    usedTargets.add(t.id);
    qs.push({ id: 'q1', kind: 'callers', target: t.id, text: `Which functions call \`${t.id}\` directly or transitively? Answer with a sorted array of ids.`, answer: callers(t.id) });
    // 2. shortest call chain of length >= 3
    let from: Fn, to: string, len: number;
    do {
      from = pick(g.all, (f) => closure.get(f.id)!.size >= 4);
      const reach = [...closure.get(from.id)!];
      to = reach[Math.floor(r.next() * reach.length)]!;
      len = shortestPathLen(g, from.id, to);
    } while (len < 3);
    qs.push({ id: 'q2', kind: 'path', from: from.id, to, length: len, text: `What is a shortest call chain from \`${from.id}\` to \`${to}\`? Answer with the array of ids from the first to the last function, inclusive.` });
    // 3. transitive callee count
    const f3 = pick(g.all, (f) => closure.get(f.id)!.size >= 5 && !usedTargets.has(f.id));
    usedTargets.add(f3.id);
    qs.push({ id: 'q3', kind: 'count', fn: f3.id, text: `How many distinct functions does \`${f3.id}\` call directly or transitively? Answer with a number.`, answer: closure.get(f3.id)!.size });
    // 4. alternate: another callers question, or the unreachable-modules question in the last step
    if (s === 3) {
      const mg = moduleGraph(files);
      const seen = new Set<string>();
      const stack = ['src/main.js'];
      while (stack.length) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        stack.push(...(mg.get(x) ?? []));
      }
      const un = [...mg.keys()].filter((f) => !seen.has(f) && !f.endsWith('/index.js')).map((f) => f.replace(/^src\//, '')).sort();
      qs.push({ id: 'q4', kind: 'unreachable', text: 'Which modules (excluding the index.js barrels) are not reachable from src/main.js through imports and re-exports? Answer with a sorted array of paths relative to src/, e.g. "billing/core.js".', answer: un });
    } else {
      const t4 = pick(g.all, (f) => !usedTargets.has(f.id) && callers(f.id).length >= 2 && callers(f.id).length <= 15);
      usedTargets.add(t4.id);
      qs.push({ id: 'q4', kind: 'callers', target: t4.id, text: `Which functions call \`${t4.id}\` directly or transitively? Answer with a sorted array of ids.`, answer: callers(t4.id) });
    }
    steps.push(qs);
  }
  return steps;
}

let cached: { g: Graph; files: Record<string, string>; steps: Question[][] } | undefined;
function data() {
  if (!cached) {
    const g = generate();
    const files = render(g);
    cached = { g, files, steps: questions(g, files) };
  }
  return cached;
}

const OUT = (i: number) => `answers-${i + 1}.json`;
const ID_FORMAT = 'A function id is "<path relative to src/>:<function name>", e.g. "billing/core.js:validate"; for a default export use its declared function name.';

function promptFor(i: number): string {
  const { steps } = data();
  const qs = steps[i]!.map((q) => `- ${q.id}: ${q.text}`).join('\n');
  return `Answer these questions about the JavaScript code in src/ (call graph of exported functions; ignore calls that appear only in comments or strings, and ignore non-exported helpers). ${ID_FORMAT}

${qs}

Write ${OUT(i)}: a JSON object {"q1": …, "q2": …, …}.${i === 0 ? ' I will have more questions about this code base afterwards.' : ''} When finished, reply DONE.`;
}

function checkStep(i: number) {
  return ({ work }: TaskContext): CheckResult => {
    const { g, steps } = data();
    const p = path.join(work, OUT(i));
    if (!existsSync(p)) return { pass: false, score: 0, details: `${OUT(i)} missing` };
    let got: Record<string, unknown>;
    try {
      got = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return { pass: false, score: 0, details: `${OUT(i)} is not JSON` };
    }
    const bad: string[] = [];
    let ok = 0;
    for (const q of steps[i]!) {
      const a = got[q.id];
      let correct = false;
      if (q.kind === 'callers' || q.kind === 'unreachable') correct = Array.isArray(a) && same([...a].sort(), q.answer);
      else if (q.kind === 'count') correct = Number(a) === q.answer;
      else if (q.kind === 'path') {
        correct =
          Array.isArray(a) &&
          a.length === q.length + 1 &&
          a[0] === q.from &&
          a[a.length - 1] === q.to &&
          a.every((x, j) => j === 0 || (g.byId.get(a[j - 1] as string)?.calls.includes(x as string) ?? false));
      }
      if (correct) ok++;
      else bad.push(`${q.id} (${q.kind})`);
    }
    const n = steps[i]!.length;
    return { pass: ok === n, score: ok / n, details: `${ok}/${n} correct${bad.length ? `; wrong: ${bad.join(', ')}` : ''}` };
  };
}

const task: Task = {
  id: 'code-qa',
  title: 'Call-graph questions about a 120-module codebase, 4 rounds',
  kind: 'repetitive',
  repetitions: 4,
  setup: ({ work }) => {
    const { files, steps } = data();
    for (const [p, c] of Object.entries(files)) write(work, p, c);
    return steps;
  },
  steps: [0, 1, 2, 3].map((i) => ({
    prompt: () => (i === 0 ? promptFor(0) : `More questions about the same code (same rules and id format).\n\n${promptFor(i).split('\n\n')[1]}\n\nWrite ${OUT(i)}. When finished, reply DONE.`),
    check: checkStep(i),
  })),
};
export default task;

/** For tests: the ground-truth graph. */
export const _codeQa = { data, transitiveCallees, shortestPathLen };
