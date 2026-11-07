/**
 * Round 6 (AppWorld) summary: node experiments/appworld/analyze.ts <out dir> <label>=<runs dir> ...
 * Writes runs.jsonl (one compact record per run: no task text, since AppWorld data may only be redistributed
 * encrypted) and summary.json (per condition and arm: task and scenario goal completion, tokens, cost, turns).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [out, ...specs] = process.argv.slice(2);
const runs: Record<string, unknown>[] = [];
const summary: Record<string, unknown>[] = [];
for (const spec of specs) {
  const i = spec.indexOf('=');
  const [label, dir] = [spec.slice(0, i), spec.slice(i + 1)];
  const byArm = new Map<string, Record<string, any>[]>();
  const incomplete = new Set<string>();
  for (const task of readdirSync(dir)) {
    for (const run of existsSync(path.join(dir, task)) ? readdirSync(path.join(dir, task)) : []) {
      const f = path.join(dir, task, run, 'result.json');
      if (!existsSync(f)) continue;
      const r = JSON.parse(readFileSync(f, 'utf8'));
      // A run whose grading failed (infrastructure) is not a failure of the agent: leave it out, and mark its
      // scenario incomplete so it cannot count as solved from the remaining variants.
      if (r.steps?.some((s: { check?: { infra?: boolean } }) => s.check?.infra)) {
        incomplete.add(`${r.arm}/${task.split('_')[0]}`);
        continue;
      }
      const rec = { condition: label, task, scenario: task.split('_')[0], arm: r.arm, pass: r.check.pass, score: +r.check.score.toFixed(3), tokens: r.tokens.total, costUsd: +r.costUsd.toFixed(5), turns: r.turns, wallMs: r.wallMs, libraryCalls: r.trod?.calls ?? 0, notes: existsSync(path.join(dir, task, run, 'work', 'CLAUDE.md')) };
      runs.push(rec);
      byArm.set(r.arm, [...(byArm.get(r.arm) ?? []), rec]);
    }
  }
  for (const [arm, rs] of byArm) {
    const scen = new Map<string, boolean[]>();
    for (const r of rs) scen.set(r.scenario, [...(scen.get(r.scenario) ?? []), r.pass]);
    const n = rs.length;
    const mean = (k: string) => rs.reduce((a, r) => a + r[k], 0) / n;
    summary.push({ condition: label, arm, runs: n, passed: rs.filter((r) => r.pass).length, tgc: +(rs.filter((r) => r.pass).length / n).toFixed(3), scenarios: scen.size, sgc: [...scen.entries()].filter(([sc, v]) => !incomplete.has(`${arm}/${sc}`) && v.every(Boolean)).length, incompleteScenarios: [...scen.keys()].filter((sc) => incomplete.has(`${arm}/${sc}`)).length, meanScore: +mean('score').toFixed(3), meanTokens: Math.round(mean('tokens')), meanCostUsd: +mean('costUsd').toFixed(5), meanTurns: +mean('turns').toFixed(1), usedLibrary: rs.filter((r) => r.libraryCalls > 0).length, withNotes: rs.filter((r) => r.notes).length });
  }
}
writeFileSync(path.join(out!, 'runs.jsonl'), runs.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(path.join(out!, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.table(summary);
