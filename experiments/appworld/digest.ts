/**
 * Experience digest for an AppWorld forge: what went wrong when a model ran train-split tasks without tools.
 *
 *   node experiments/appworld/digest.ts <runs dir> > digest.md
 *
 * For every failed run: the task, the unit tests it failed (AppWorld's requirement texts), the agent's last message,
 * and AppWorld's reference solution for that task (train-split ground truth, which AppWorld provides for learning;
 * never use this on test tasks). The forge reads it to learn the environment's conventions.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AW_HOME } from './appworld.ts';

/** The solution function only (no imports or boilerplate). */
const solution = (file: string) => {
  const text = readFileSync(file, 'utf8');
  const i = text.search(/^def solution/m);
  return (i >= 0 ? text.slice(i) : text).trim();
};

const dir = path.resolve(process.argv[2] ?? '');
const out: string[] = [];
let runs = 0;
let failed = 0;
const failedScenarios = new Set<string>();
for (const task of readdirSync(dir).sort()) {
  for (const run of existsSync(path.join(dir, task)) ? readdirSync(path.join(dir, task)) : []) {
    const res = path.join(dir, task, run, 'result.json');
    if (!existsSync(res)) continue;
    runs++;
    const r = JSON.parse(readFileSync(res, 'utf8'));
    if (r.check.pass) continue;
    failed++;
    failedScenarios.add(task.split('_')[0]!);
    const read = (f: string) => (existsSync(path.join(dir, task, run, f)) ? readFileSync(path.join(dir, task, run, f), 'utf8') : '');
    const prompt = read('prompt-1.txt');
    const instruction = prompt.split('Task: ')[1]?.split('\n')[0] ?? '';
    const evalFile = path.join(dir, task, run, 'evaluation.json');
    const fails = existsSync(evalFile) ? (JSON.parse(readFileSync(evalFile, 'utf8')).failures as { requirement: string }[]) : [];
    let last = '';
    for (const line of read('stream-1.jsonl').split('\n')) {
      try {
        const e = JSON.parse(line);
        if (e.type === 'result') last = String(e.result ?? '');
      } catch {}
    }
    const sol = path.join(AW_HOME, 'data', 'tasks', task, 'ground_truth', 'solution.py');
    out.push(
      `## ${task}: ${instruction}\n\nFailed tests:\n${fails.map((f) => `- ${f.requirement.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}\n\nAgent's final message (excerpt):\n> ${last.replace(/\s+/g, ' ').slice(0, 500)}\n\n` +
        (existsSync(sol) ? `Reference solution:\n\`\`\`python\n${solution(sol)}\n\`\`\`\n` : ''),
    );
  }
}
// One reference solution per other scenario (the first variant), as worked examples of the conventions.
const covered = new Set(failedScenarios);
const examples: string[] = [];
for (const task of readdirSync(dir).sort()) {
  const scenario = task.split('_')[0]!;
  if (covered.has(scenario)) continue;
  covered.add(scenario);
  const sol = path.join(AW_HOME, 'data', 'tasks', task, 'ground_truth', 'solution.py');
  const specs = path.join(AW_HOME, 'data', 'tasks', task, 'specs.json');
  if (!existsSync(sol) || !existsSync(specs)) continue;
  examples.push(`## ${task}: ${JSON.parse(readFileSync(specs, 'utf8')).instruction}\n\n\`\`\`python\n${solution(sol)}\n\`\`\`\n`);
}
console.log(`# What went wrong without tools: ${failed} of ${runs} train-split runs failed\n\n${out.join('\n')}\n\n# Reference solutions of the other train scenarios (the model passed these)\n\n${examples.join('\n')}`);
