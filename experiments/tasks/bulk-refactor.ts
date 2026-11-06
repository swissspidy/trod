import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Task, TaskContext } from '../lib/types.ts';
import { rng, write } from '../lib/util.ts';

const LEVELS = ['debug', 'info', 'warn', 'error'];
/** Step i: directory and number of modules. */
const BATCHES = [
  { dir: 'src/modules', n: 24 },
  { dir: 'src/legacy', n: 12 },
  { dir: 'src/plugins', n: 12 },
];

type Call = [string, string] | [string, string, 'FMT', number];

function modules(step: number): { name: string; src: string; calls: Call[] }[] {
  const r = rng(303 + step * 77);
  return Array.from({ length: BATCHES[step]!.n }, (_, k) => {
    const i = k + 1;
    const name = `mod${String(i).padStart(2, '0')}`;
    const usesFormat = r.chance(0.5);
    const body: string[] = [];
    const calls: Call[] = [];
    for (let j = 0, n = r.int(2, 5); j < n; j++) {
      const level = r.pick(LEVELS);
      const q = r.pick(["'", '"', '`']);
      const msg = `${name} step ${j}`;
      const multiline = r.chance(0.3);
      if (usesFormat && r.chance(0.5)) {
        body.push(multiline ? `  log(\n    ${q}${level}${q},\n    ${q}${msg}${q},\n    formatId(x + ${j}),\n  );` : `  log(${q}${level}${q}, ${q}${msg}${q}, formatId(x + ${j}));`);
        calls.push([level, msg, 'FMT', j]);
      } else {
        body.push(multiline ? `  log(\n    ${q}${level}${q},\n    ${q}${msg}${q}\n  );` : `  log(${q}${level}${q}, ${q}${msg}${q});`);
        calls.push([level, msg]);
      }
    }
    const imports = usesFormat ? `import { log, formatId } from '../logger.js';` : `import { log } from '../logger.js';`;
    return { name, calls, src: `${imports}\n\n// Does the ${name} work.\nexport function run(x) {\n${body.join('\n')}\n  return x * ${i};\n}\n` };
  });
}

function writeBatch({ work }: TaskContext, step: number) {
  for (const m of modules(step)) write(work, `${BATCHES[step]!.dir}/${m.name}.js`, m.src);
}

const check = (step: number) => ({ work }: TaskContext) => {
  const rel = BATCHES[step]!.dir;
  const dir = path.join(work, rel);
  if (!existsSync(dir)) return { pass: false, score: 0, details: `${rel} missing` };
  const probe = `
import { readdirSync } from 'node:fs';
import { calls } from './src/logger.js';
const out = {};
for (const f of readdirSync(${JSON.stringify(rel)}).sort()) {
  calls.length = 0;
  const mod = await import('./${rel}/' + f);
  mod.run(2);
  out[f.replace('.js', '')] = calls.map((c) => c.map((v) => (typeof v === 'string' && v.startsWith('#') ? 'FMT:' + v : v)));
}
console.log(JSON.stringify(out));
`;
  let actual: Record<string, unknown[][]>;
  try {
    actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: work, encoding: 'utf8', timeout: 20_000 }));
  } catch (err) {
    return { pass: false, score: 0, details: `modules fail to load: ${(err as Error).message.slice(0, 300)}` };
  }
  const logSrc = readFileSync(path.join(work, 'src/logger.js'), 'utf8');
  const loggerUnchanged = logSrc.includes('export function log(level, ...args)') && logSrc.includes('export const formatID = formatId;');
  let ok = 0;
  const bad: string[] = [];
  const mods = modules(step);
  for (const m of mods) {
    const src = readFileSync(path.join(dir, `${m.name}.js`), 'utf8');
    const migrated = !/\blog\s*\(/.test(src) && !/\bformatId\b/.test(src) && /import\s*\{[^}]*\blogger\b[^}]*\}\s*from\s*['"]\.\.\/logger\.js['"]/.test(src);
    const want = m.calls.map((c) => (c[2] === 'FMT' ? [c[0], c[1], 'FMT:#' + String(2 + (c[3] ?? 0)).padStart(5, '0')] : c));
    const sameCalls = JSON.stringify(actual[m.name] ?? []) === JSON.stringify(want);
    if (migrated && sameCalls) ok++;
    else bad.push(`${m.name}: ${migrated ? '' : 'not migrated '}${sameCalls ? '' : 'calls differ'}`);
  }
  const n = mods.length;
  return {
    pass: ok === n && readdirSync(dir).length === n && loggerUnchanged,
    score: ok / n,
    details: `${ok}/${n} modules migrated with identical calls${loggerUnchanged ? '' : '; src/logger.js was changed'}${bad.length ? `; ${bad.slice(0, 4).join('; ')}` : ''}`,
  };
};

const RULES = `Rules:
- every log(level, ...args) call becomes logger.<level>(...args), with the arguments after the level unchanged (calls may span several lines and use ' " or \` strings)
- the import of log becomes an import of logger; keep any other imported names in the same import
- rename the helper formatId to formatID (src/logger.js already exports both names)
- do not change src/logger.js and do not change behaviour otherwise`;

/** Migrate modules from log(level, msg) to logger.<level>(msg), in three batches. */
const task: Task = {
  id: 'bulk-refactor',
  title: 'Refactor a logging API (24, then 12, then 12 modules)',
  kind: 'repetitive',
  repetitions: 24,
  setup: (ctx) => {
    write(
      ctx.work,
      'src/logger.js',
      `export const calls = [];
export function log(level, ...args) { calls.push([level, ...args]); }
export const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map((l) => [l, (...args) => calls.push([l, ...args])]));
export function formatId(id) { return '#' + String(id).padStart(5, '0'); }
export const formatID = formatId;
`,
    );
    write(
      ctx.work,
      'test.mjs',
      `import { readdirSync, existsSync } from 'node:fs';
let failed = 0;
for (const dir of ['src/modules', 'src/legacy', 'src/plugins'].filter((d) => existsSync(d))) {
  for (const f of readdirSync(dir).sort()) {
    const mod = await import('./' + dir + '/' + f);
    if (mod.run(2) !== 2 * Number(f.slice(3, 5))) { console.error('FAIL', dir, f); failed++; }
  }
}
if (failed) process.exit(1);
console.log('ok');
`,
    );
    writeBatch(ctx, 0);
    return null;
  },
  prepareStep: writeBatch,
  steps: [
    {
      prompt: () => `This repository has 24 modules in src/modules/. They log through the deprecated API in src/logger.js:

    import { log } from '../logger.js';
    log('warn', 'message', extra);

Migrate every module to the new API, which src/logger.js already exports:

    import { logger } from '../logger.js';
    logger.warn('message', extra);

${RULES}

\`node test.mjs\` runs the existing behaviour tests; they must still pass. More directories will need the same migration later. When finished, reply DONE.`,
      check: check(0),
    },
    {
      prompt: () => `12 more modules were just merged into src/legacy/ and still use the old log API and formatId. Migrate them the same way (same rules). When finished, reply DONE.`,
      check: check(1),
    },
    {
      prompt: () => `Last batch: src/plugins/ has 12 modules on the old API. Migrate them the same way. When finished, reply DONE.`,
      check: check(2),
    },
  ],
};
export default task;
