/**
 * Frees disk after SWE runs: every finished run is regraded with the current grader, the agent's changes are saved
 * as agent.patch (enough to regrade later: export the base commit, apply it, grade), and the checkout is deleted.
 * Incomplete runs, and runs that hit "no space left on device", are removed so the runner redoes them.
 * With --regrade, compacted runs whose last grading did not complete (infra, or every test "not run") are regraded
 * from agent.patch: a fresh export of the base commit, the patch applied, graded.
 * Usage: SWE_HOME=… node experiments/swe/compact.ts <runs root> [--parallel 4] [--dry-run] [--regrade]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { RunRecord } from '../runner/metrics.ts';
import { DJANGO4, exportCommit, grade, loadInstances } from './swe.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { parallel: { type: 'string', default: '4' }, 'dry-run': { type: 'boolean', default: false }, regrade: { type: 'boolean', default: false } } });
const root = positionals[0] ? path.resolve(positionals[0]) : undefined;
if (!root || !existsSync(root)) {
  console.error('usage: node experiments/swe/compact.ts <runs root> [--parallel 4] [--dry-run]');
  process.exit(1);
}
const instances = new Map(loadInstances().map((i) => [i.instance_id, i]));
const dry = values['dry-run'];

const runs: string[] = [];
for (const model of readdirSync(root)) {
  const md = path.join(root, model);
  if (model === 'forge' || !existsSync(md)) continue;
  for (const inst of readdirSync(md)) {
    if (!instances.has(inst)) continue;
    for (const run of readdirSync(path.join(md, inst))) runs.push(path.join(md, inst, run));
  }
}

const hitDiskFull = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /^(stderr|stream)-\d+\.(txt|jsonl)$/.test(f))
    .some((f) => /ENOSPC|no space left on device/i.test(readFileSync(path.join(dir, f), 'utf8')));

let removed = 0;
let compacted = 0;
let changed = 0;
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    while (next < runs.length) {
      const dir = runs[next++]!;
      const resultFile = path.join(dir, 'result.json');
      let record: RunRecord | undefined;
      try {
        record = JSON.parse(readFileSync(resultFile, 'utf8')) as RunRecord;
      } catch {
        record = undefined; // missing, or truncated when the disk was full
      }
      if (!record || hitDiskFull(dir)) {
        console.log(`remove ${path.relative(root, dir)} (${record ? 'hit disk full' : 'incomplete'})`);
        if (!dry) rmSync(dir, { recursive: true, force: true });
        removed++;
        continue;
      }
      const inst = instances.get(record.task)!;
      let work = path.join(dir, 'work');
      if (!existsSync(work)) {
        const notRun = /PASS_TO_PASS broken (\d+)\/\1\b/.test(record.check.details) && /FAIL_TO_PASS 0\//.test(record.check.details);
        if (!values.regrade || !(record.check.infra || notRun) || !existsSync(path.join(dir, 'agent.patch'))) continue;
        // Regrade from the saved patch in a fresh export of the base commit.
        work = path.join(dir, 'regrade-work');
        rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        mkdirSync(work, { recursive: true });
        exportCommit(DJANGO4.gitDir, inst.base_commit, work);
        const p = readFileSync(path.join(dir, 'agent.patch'));
        if (p.length) execFileSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: work, input: p });
      }
      // The agent's changes (tracked and untracked), before grading touches the test files again.
      execFileSync('git', ['add', '-A'], { cwd: work });
      const patch = execFileSync('git', ['diff', '--cached', 'HEAD', '--binary'], { cwd: work, maxBuffer: 256 * 1024 * 1024 }).toString();
      const fromPatch = work.endsWith('regrade-work');
      const check = await grade(DJANGO4, inst, work);
      // grade() itself saves agent.patch next to the checkout; for a regrade keep the original one.
      if (fromPatch) writeFileSync(path.join(dir, 'agent.patch'), patch);
      if (check.pass !== record.check.pass) changed++;
      console.log(`${check.pass === record.check.pass ? 'same' : 'CHANGED'} ${path.relative(root, dir)}: ${record.check.pass ? 'resolved' : 'unresolved'} -> ${check.pass ? 'resolved' : 'unresolved'}${check.infra ? ' (infra)' : ''}`);
      if (dry) continue;
      writeFileSync(path.join(dir, 'agent.patch'), patch);
      const steps = record.steps.map((s) => ({ ...s, check }));
      writeFileSync(resultFile, JSON.stringify({ ...record, steps, check, regraded: 'regraded with the reviewed grader; checkout replaced by agent.patch' }, null, 2));
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      compacted++;
    }
  }),
);
console.log(`${compacted} compacted (${changed} verdict(s) changed), ${removed} removed for re-running`);
