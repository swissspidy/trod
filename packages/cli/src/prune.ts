/**
 * `trod tune --prune`: does each part of the notes still earn its place on this model? (ADR 0005, section 5.)
 *
 * It runs the tasks of .trod/tune.json with the notes and without them (and, with --sections, without each `##`
 * section of notes.md in turn), on the model of your choice, and gives a verdict per part: KEEP when removing it costs
 * pass rate (the bootstrap interval of the drop is above zero), CUT when the interval's upper end is below the
 * threshold (default 5 points), INCONCLUSIVE otherwise, with a rough number of runs that would resolve it. Nothing is
 * deleted: CUT is a suggestion. Each run appends a line to .trod/prune-history.jsonl (date, model, note size, verdicts)
 * so `trod doctor` can show whether the notes shrink as models change.
 *
 * Single rules are not ablated: per-rule effects on task success need more runs than most projects have tasks, and
 * are not additive (Zhang et al., 2026). For rules with an observable behaviour, ruleprof measures adherence per rule.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createContext, passed, runBatch, snapshotHarness, TUNE_DIR, type RunResult, type TuneOptions } from './tune.ts';

export const PRUNE_HISTORY = path.join('.trod', 'prune-history.jsonl');

export interface Section {
  title: string;
  text: string;
}

/** Splits notes at `## ` headings. The text before the first heading (title, preamble) is kept in every variant. */
export function splitSections(notes: string): { preamble: string; sections: Section[] } {
  const lines = notes.split('\n');
  const sections: Section[] = [];
  const preamble: string[] = [];
  let cur: Section | undefined;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      cur = { title: line.slice(3).trim(), text: `${line}\n` };
      sections.push(cur);
    } else if (cur) cur.text += `${line}\n`;
    else preamble.push(line);
  }
  return { preamble: preamble.join('\n'), sections };
}

/** Rules: bullet or numbered list items. A rough count for the history, not a parse. */
export const countRules = (notes: string) => notes.split('\n').filter((l) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(l)).length;

/** Per-task pass rates from a batch (runs that errored are left out). */
function perTask(rs: RunResult[]): Map<string, number> {
  const by = new Map<string, boolean[]>();
  for (const r of rs) if (!r.error) by.set(r.task, [...(by.get(r.task) ?? []), r.pass]);
  return new Map([...by].map(([t, ps]) => [t, ps.filter(Boolean).length / ps.length]));
}

/** 95% bootstrap interval of the mean of per-task differences (deterministic). */
export function bootstrapMean(diffs: number[], reps = 5000): [number, number] {
  if (!diffs.length) return [0, 0];
  let seed = 5;
  const r = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const means: number[] = [];
  for (let i = 0; i < reps; i++) {
    let s = 0;
    for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(r() * diffs.length)]!;
    means.push(s / diffs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)]!, means[Math.floor(0.975 * reps)]!];
}

export type Verdict = 'KEEP' | 'CUT' | 'INCONCLUSIVE';

export interface Effect {
  part: string;
  /** Mean per-task drop in pass rate when the part is removed (positive: the part helps). */
  drop: number;
  ci: [number, number];
  verdict: Verdict;
  /** For INCONCLUSIVE: roughly how many runs per task would make the interval narrow enough to decide. */
  suggestRuns?: number;
  tasks: number;
}

/** KEEP if the drop's interval is above 0, CUT if its upper end is below the threshold, else INCONCLUSIVE. */
export function verdict(part: string, withPart: Map<string, number>, withoutPart: Map<string, number>, threshold: number, runs: number): Effect {
  const shared = [...withPart.keys()].filter((t) => withoutPart.has(t));
  const diffs = shared.map((t) => withPart.get(t)! - withoutPart.get(t)!);
  const drop = diffs.reduce((s, x) => s + x, 0) / (diffs.length || 1);
  const ci = bootstrapMean(diffs);
  if (shared.length && ci[0] > 0) return { part, drop, ci, verdict: 'KEEP', tasks: shared.length };
  if (shared.length && ci[1] < threshold) return { part, drop, ci, verdict: 'CUT', tasks: shared.length };
  // The interval narrows with the square root of the runs; aim for a half-width of half the threshold.
  const half = (ci[1] - ci[0]) / 2;
  const suggestRuns = half > 0 ? Math.min(50, Math.ceil(runs * (half / (threshold / 2)) ** 2)) : runs;
  return { part, drop, ci, verdict: 'INCONCLUSIVE', suggestRuns, tasks: shared.length };
}

export interface PruneOptions extends Pick<TuneOptions, 'projectDir' | 'config' | 'out' | 'claudeBin' | 'env' | 'configFile'> {
  /** Also leave out each `##` section of notes.md in turn. */
  sections?: boolean;
  /** CUT when the upper end of the drop's interval is below this many points (default 5). */
  threshold?: number;
  outDir?: string;
}

export interface PruneResult {
  model: string;
  notesChars: number;
  rules: number;
  withNotes: { passed: number; runs: number };
  withoutNotes: { passed: number; runs: number };
  effects: Effect[];
  costUsd: number;
  outDir: string;
}

export interface PruneHistoryEntry {
  date: string;
  model: string;
  notesChars: number;
  estTokens: number;
  rules: number;
  sections: number;
  withNotes: { passed: number; runs: number };
  withoutNotes: { passed: number; runs: number };
  verdicts: { part: string; verdict: Verdict; drop: number }[];
}

export function readPruneHistory(projectDir: string): PruneHistoryEntry[] {
  const f = path.join(projectDir, PRUNE_HISTORY);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as PruneHistoryEntry];
      } catch {
        return [];
      }
    });
}

/** One line for `trod doctor`: the latest prune and how the notes changed since the first one. */
export function summarizePruneHistory(h: PruneHistoryEntry[]): string | undefined {
  const last = h.at(-1);
  if (!last) return undefined;
  const whole = last.verdicts.find((v) => v.part === 'all notes');
  const first = h[0]!;
  const trend = h.length > 1 ? `; since ${first.date.slice(0, 10)}: ${first.notesChars.toLocaleString('en-US')} → ${last.notesChars.toLocaleString('en-US')} chars, ${first.rules} → ${last.rules} rules` : '';
  return `Last prune (${last.date.slice(0, 10)}, ${last.model}): notes ${whole ? `${whole.verdict} (${whole.drop >= 0 ? '+' : ''}${(100 * whole.drop).toFixed(0)} points)` : 'not measured'}, ${last.verdicts.filter((v) => v.verdict === 'CUT').length} part(s) to cut${trend}`;
}

const pts = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;

export async function prune(opts: PruneOptions): Promise<PruneResult> {
  const ctx = createContext(opts);
  const { out, config } = ctx;
  const threshold = (opts.threshold ?? 5) / 100;
  const tasks = config.tasks;
  const outDir = opts.outDir ?? path.join(opts.projectDir, TUNE_DIR, `prune-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(outDir, { recursive: true });
  const trodDir = path.join(opts.projectDir, '.trod');
  const notesFile = path.join(trodDir, 'notes.md');
  if (!existsSync(notesFile)) throw new Error('no .trod/notes.md to prune');
  const notes = readFileSync(notesFile, 'utf8');
  const { preamble, sections } = splitSections(notes);
  // Harnesses: the current one, one without notes (and wiki), and one per section left out.
  const full = path.join(outDir, 'harness-full');
  snapshotHarness(trodDir, full);
  const bare = path.join(outDir, 'harness-no-notes');
  snapshotHarness(trodDir, bare);
  rmSync(path.join(bare, 'notes.md'), { force: true });
  rmSync(path.join(bare, 'wiki'), { recursive: true, force: true });
  rmSync(path.join(bare, 'notes.checks.json'), { force: true });
  const n = tasks.length * config.runs;
  out(`pruning notes for ${config.model}: ${tasks.length} task(s) × ${config.runs} run(s), with and without the notes${opts.sections && sections.length ? `, and without each of ${sections.length} section(s)` : ''} (${n * (2 + (opts.sections ? sections.length : 0))} runs)`);
  let cost = 0;
  const add = (rs: RunResult[]) => rs.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  const effects: Effect[] = [];
  try {
    const withRuns = await runBatch(ctx, full, tasks, path.join(outDir, 'with-notes'), 'with notes');
    const withoutRuns = await runBatch(ctx, bare, tasks, path.join(outDir, 'without-notes'), 'without');
    cost += add(withRuns) + add(withoutRuns);
    const withT = perTask(withRuns);
    effects.push(verdict('all notes', withT, perTask(withoutRuns), threshold, config.runs));
    if (opts.sections) {
      for (const [i, sec] of sections.entries()) {
        const h = path.join(outDir, `harness-without-${i + 1}`);
        snapshotHarness(trodDir, h);
        writeFileSync(path.join(h, 'notes.md'), [preamble, ...sections.filter((_, j) => j !== i).map((s) => s.text)].join('\n'));
        const rs = await runBatch(ctx, h, tasks, path.join(outDir, `without-${i + 1}`), `without "${sec.title}"`);
        cost += add(rs);
        effects.push(verdict(sec.title, withT, perTask(rs), threshold, config.runs));
      }
    }
    const ok = (rs: RunResult[]) => rs.filter((r) => !r.error);
    const result: PruneResult = {
      model: config.model,
      notesChars: notes.length,
      rules: countRules(notes),
      withNotes: { passed: passed(ok(withRuns)), runs: ok(withRuns).length },
      withoutNotes: { passed: passed(ok(withoutRuns)), runs: ok(withoutRuns).length },
      effects,
      costUsd: cost,
      outDir,
    };
    out(`with notes ${result.withNotes.passed}/${result.withNotes.runs}, without ${result.withoutNotes.passed}/${result.withoutNotes.runs}`);
    for (const e of effects) out(`  ${e.verdict.padEnd(12)} ${e.part}: removing it changes the pass rate by ${pts(-e.drop)} points [${pts(-e.ci[1])}, ${pts(-e.ci[0])}] on ${e.tasks} task(s)${e.suggestRuns ? `; about ${e.suggestRuns} runs per task would decide it` : ''}`);
    out('Nothing was changed. CUT means the part had no measurable effect on this model: consider removing it and re-running.');
    const entry: PruneHistoryEntry = {
      date: new Date().toISOString(),
      model: config.model,
      notesChars: notes.length,
      estTokens: Math.round(notes.length / 4),
      rules: result.rules,
      sections: sections.length,
      withNotes: result.withNotes,
      withoutNotes: result.withoutNotes,
      verdicts: effects.map((e) => ({ part: e.part, verdict: e.verdict, drop: +e.drop.toFixed(3) })),
    };
    appendFileSync(path.join(opts.projectDir, PRUNE_HISTORY), JSON.stringify(entry) + '\n');
    writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
    out(`appended to ${PRUNE_HISTORY}; run transcripts in ${path.relative(opts.projectDir, outDir)} ($${cost.toFixed(2)})`);
    return result;
  } finally {
    rmSync(ctx.scratch, { recursive: true, force: true });
  }
}
