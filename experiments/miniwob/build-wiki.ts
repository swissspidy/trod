/**
 * Builds a wiki from per-task-type notes: pages are the notes, the index (loaded as CLAUDE.md) lists each page with an
 * example task from a train seed, so the agent has to route itself (MW_WIKI). Also writes all notes concatenated
 * into one file (MW_NOTES_ALL) as the "everything always loaded" arm.
 *
 *   node experiments/miniwob/build-wiki.ts [--notes experiments/miniwob/notes] [--out experiments/miniwob/wiki]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SEEDS, startMw } from './miniwob.ts';

const { values } = parseArgs({ options: { notes: { type: 'string', default: 'experiments/miniwob/notes' }, out: { type: 'string', default: 'experiments/miniwob/wiki' } } });
const notesDir = path.resolve(values.notes!);
const out = path.resolve(values.out!);
mkdirSync(path.join(out, 'pages'), { recursive: true });
const types = readdirSync(notesDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
const lines: string[] = [];
const all: string[] = [];
for (const t of types) {
  const note = readFileSync(path.join(notesDir, `${t}.md`), 'utf8');
  writeFileSync(path.join(out, 'pages', `${t}.md`), note);
  all.push(`<!-- ${t} -->\n${note.trim()}\n`);
  // One train-seed task text per type tells the agent when a page applies (test seeds never enter).
  const env = await startMw(t, SEEDS.train);
  try {
    const { utterance } = (await (await fetch(`${env.baseUrl}/task`)).json()) as { utterance: string };
    lines.push(`- \`.trod/wiki/${t}.md\`: tasks like "${utterance.replace(/\s+/g, ' ').trim()}"`);
  } finally {
    env.close();
  }
}
writeFileSync(
  path.join(out, 'index.md'),
  `# Wiki: notes for kinds of web tasks\n\nEach page holds tested rules and a recipe for one kind of task. Before acting, find the page whose example matches your task (the wording pattern, not the exact names or numbers) and Read it. If none matches, go ahead without.\n\n${lines.join('\n')}\n`,
);
writeFileSync(path.join(out, 'all-notes.md'), `# Notes for kinds of web tasks\n\nApply the section that matches your task.\n\n${all.join('\n')}`);
console.log(`${types.length} pages; index ${readFileSync(path.join(out, 'index.md'), 'utf8').length} chars; all notes ${all.join('').length} chars`);
