/**
 * BIRD (https://bird-bench.github.io, CC BY-SA 4.0) text-to-SQL tasks for the experiment runner.
 *
 * The agent gets a question about one of BIRD's dev databases, the database itself (read-only, ./db.sqlite) and its
 * column descriptions (./docs), and writes one SQLite query to answer.sql. Grading executes it and the gold query
 * and compares result rows as sets (BIRD's execution accuracy), in a separate process (bird_eval.py).
 *
 * By default the agent does NOT get BIRD's per-question "evidence" (the human-written domain hint, e.g. how a rate is
 * defined): that is exactly the knowledge an agent cannot guess. BIRD_EVIDENCE=1 adds it as a reference arm.
 * BIRD_NOTES=<dir> copies <dir>/<db_id>.md into the work dir as CLAUDE.md (notes forged from the train split).
 *
 * Layout (BIRD_HOME, default /opt/bird): db/<db_id>/<db_id>.sqlite + db/<db_id>/database_description/ (readable by the
 * agent's user) and data/dev.json (questions, evidence, gold SQL; root only).
 *
 * Split: within each database, questions are ordered by a hash of their id; the first 40% are "train" (used to forge
 * notes) and the rest "test". bird:test samples BIRD_PER_DB (default 10) test questions per database.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CheckResult, Task, TaskContext } from '../lib/types.ts';

export const BIRD_HOME = path.resolve(process.env.BIRD_HOME ?? '/opt/bird');
const BIN = path.join(import.meta.dirname, 'bin');
const EVAL = path.join(import.meta.dirname, 'bird_eval.py');

export interface BirdQuestion {
  question_id: number;
  db_id: string;
  question: string;
  evidence: string;
  SQL: string;
  difficulty: string;
}

const rank = (q: BirdQuestion) => createHash('sha1').update(`bird-${q.question_id}`).digest('hex');

/** All dev questions split per database into train (first 40% by hash) and test. */
export function birdSplit(): { train: BirdQuestion[]; test: BirdQuestion[] } {
  const file = path.join(BIRD_HOME, 'data', 'dev.json');
  if (!existsSync(file)) return { train: [], test: [] };
  const all = JSON.parse(readFileSync(file, 'utf8')) as BirdQuestion[];
  const byDb = new Map<string, BirdQuestion[]>();
  for (const q of all) byDb.set(q.db_id, [...(byDb.get(q.db_id) ?? []), q]);
  const train: BirdQuestion[] = [];
  const test: BirdQuestion[] = [];
  for (const qs of byDb.values()) {
    const sorted = [...qs].sort((a, b) => rank(a).localeCompare(rank(b)));
    const cut = Math.round(sorted.length * 0.4);
    train.push(...sorted.slice(0, cut));
    test.push(...sorted.slice(cut));
  }
  return { train, test };
}

/** Up to perDb test questions per database (the first ones in hash order). */
export function birdTestSample(perDb: number): BirdQuestion[] {
  const seen = new Map<string, number>();
  return birdSplit().test.filter((q) => {
    const n = seen.get(q.db_id) ?? 0;
    seen.set(q.db_id, n + 1);
    return n < perDb;
  });
}

async function grade(q: BirdQuestion, work: string): Promise<CheckResult> {
  const tmp = mkdtempSync(path.join(tmpdir(), 'bird-'));
  const gold = path.join(tmp, 'gold.sql');
  writeFileSync(gold, q.SQL);
  const db = path.join(BIRD_HOME, 'db', q.db_id, `${q.db_id}.sqlite`);
  const out = await new Promise<string>((resolve) => {
    const child = spawn('python3', [EVAL, db, gold, path.join(work, 'answer.sql')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (c: Buffer) => (text += c));
    child.stderr.on('data', (c: Buffer) => (text += c));
    child.on('close', () => resolve(text));
  });
  rmSync(tmp, { recursive: true, force: true });
  const line = out.split('\n').reverse().find((l) => l.startsWith('{'));
  if (!line) return { pass: false, score: 0, infra: true, details: `infra: grader output: ${out.slice(-200)}` };
  const r = JSON.parse(line) as { pass: boolean; details: string; infra?: boolean };
  return { pass: r.pass, score: r.pass ? 1 : 0, details: r.details, ...(r.infra ? { infra: true } : {}) };
}

const PROMPT = (q: BirdQuestion) => `Answer this question about the "${q.db_id}" database with a single SQLite query.

Question: ${q.question}
${process.env.BIRD_EVIDENCE ? `\nHint: ${q.evidence}\n` : ''}
The database is ./db.sqlite (read-only). ./docs/ has a CSV per table describing its columns and value meanings. Explore with the \`sql\` command, e.g. sql "SELECT name FROM sqlite_master WHERE type='table'" (python3's sqlite3 module works too).

Write exactly one SELECT statement to ./answer.sql. It is graded by running it and comparing its result rows with a reference query's rows (order does not matter, but the columns and values do): return exactly what the question asks for, nothing more. Nobody can answer questions while you work. When answer.sql is written, reply DONE.`;

export function birdTasks(questions: BirdQuestion[]): Task[] {
  return questions.map(
    (q): Task => ({
      id: `${q.db_id}-${q.question_id}`,
      title: `BIRD ${q.db_id} #${q.question_id} (${q.difficulty})`,
      kind: 'control',
      repetitions: 1,
      forgeKey: `bird-${q.db_id}`,
      setup: ({ work }: TaskContext) => {
        const dir = path.join(BIRD_HOME, 'db', q.db_id);
        for (const [link, target] of [
          ['db.sqlite', path.join(dir, `${q.db_id}.sqlite`)],
          ['docs', path.join(dir, 'database_description')],
        ] as const) {
          rmSync(path.join(work, link), { force: true, recursive: false });
          symlinkSync(target, path.join(work, link));
        }
        const notes = process.env.BIRD_NOTES ? path.join(process.env.BIRD_NOTES, `${q.db_id}.md`) : '';
        if (notes && existsSync(notes)) cpSync(notes, path.join(work, 'CLAUDE.md'), { dereference: true });
        else rmSync(path.join(work, 'CLAUDE.md'), { force: true });
        // Only the id: the run directory is readable by the agent, so the gold SQL must never be written to it.
        return { question_id: q.question_id, db_id: q.db_id, difficulty: q.difficulty };
      },
      env: () => ({ PATH: `${BIN}:${process.env.PATH ?? ''}` }),
      steps: [{ prompt: () => PROMPT(q), check: ({ work }: TaskContext) => grade(q, work) }],
    }),
  );
}
