/**
 * Validates the local grading environment: for every instance, the gold patch must resolve it and the unpatched
 * base must not. Instances that fail either check here (environment differences from the official images) are
 * excluded from experiments. Writes $SWE_HOME/gold-<env>.json.
 * Usage: SWE_HOME=… node experiments/swe/validate-gold.ts [--parallel 4] [--limit N]
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DJANGO4, SWE_HOME, exportCommit, grade, loadInstances } from './swe.ts';

const { values } = parseArgs({ options: { parallel: { type: 'string', default: '4' }, limit: { type: 'string' } } });
const env = DJANGO4;
const instances = loadInstances()
  .filter((i) => i.repo === env.repo && env.versions.includes(i.version))
  .slice(0, values.limit ? Number(values.limit) : undefined);

const results: Record<string, { gold: string; empty: string; ok: boolean }> = {};
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < instances.length) {
      const inst = instances[next++]!;
      const gold = mkdtempSync(path.join(tmpdir(), 'gold-'));
      const empty = mkdtempSync(path.join(tmpdir(), 'empty-'));
      try {
        exportCommit(env.gitDir, inst.base_commit, gold);
        execFileSync('git', ['apply', '-'], { cwd: gold, input: inst.patch });
        exportCommit(env.gitDir, inst.base_commit, empty);
        const [g, e] = await Promise.all([grade(env, inst, gold), grade(env, inst, empty)]);
        results[inst.instance_id] = { gold: g.details, empty: e.details, ok: g.pass && !e.pass };
        console.log(`${g.pass && !e.pass ? 'OK  ' : 'SKIP'} ${inst.instance_id} gold: ${g.details} | empty: ${e.details}`);
      } catch (err) {
        results[inst.instance_id] = { gold: `error: ${(err as Error).message.slice(0, 200)}`, empty: '', ok: false };
        console.log(`ERR  ${inst.instance_id} ${(err as Error).message.slice(0, 200)}`);
      } finally {
        rmSync(gold, { recursive: true, force: true });
        rmSync(empty, { recursive: true, force: true });
      }
    }
  }),
);
const file = path.join(SWE_HOME, `gold-${env.key}.json`);
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`${Object.values(results).filter((r) => r.ok).length}/${instances.length} valid -> ${file}`);
