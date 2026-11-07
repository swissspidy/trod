import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { executeTool } from './executor.ts';
import type { ExampleExpectation, LoadedTool, TrodPaths } from './types.ts';
import { checkExpectation, listToolEntries, loadToolEntry } from './validate.ts';

/**
 * Project notes (ADR 0004): what a forge learned about an environment that is knowledge rather than code (conventions,
 * value meanings, formulas, traps). They live in .trod/notes.md and reach every session through CLAUDE.md, which
 * imports them with an `@.trod/notes.md` line. Claims that can be checked go into .trod/notes.checks.json: each runs a
 * library tool with an input and an expectation, like a tool example, so `trod verify` can tell when the environment
 * has moved and a note went stale.
 */

export const NOTES_FILE = 'notes.md';
export const CHECKS_FILE = 'notes.checks.json';
export const NOTES_IMPORT = '@.trod/notes.md';
/** Notes are always in context, so they must stay short. */
export const NOTES_MAX_CHARS = 6000;

export interface NoteCheck {
  /** The claim in the notes this check backs, in a few words. */
  claim: string;
  /** A library (or session) tool to run. */
  tool: string;
  input?: unknown;
  expect: ExampleExpectation;
}

export interface NoteCheckResult {
  claim: string;
  tool: string;
  ok: boolean;
  error?: string;
}

export interface NotesReport {
  exists: boolean;
  chars: number;
  tooLong: boolean;
  linked: boolean;
  checks: NoteCheckResult[];
  /** Problems with notes.checks.json itself (unparseable, malformed entries). */
  errors: string[];
}

export function notesPaths(paths: TrodPaths) {
  return { notes: path.join(paths.trodDir, NOTES_FILE), checks: path.join(paths.trodDir, CHECKS_FILE), claudeMd: path.join(paths.projectDir, 'CLAUDE.md') };
}

export function readChecks(file: string): { checks: NoteCheck[]; errors: string[] } {
  if (!existsSync(file)) return { checks: [], errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { checks: [], errors: [`${CHECKS_FILE}: not valid JSON (${(e as Error).message})`] };
  }
  if (!Array.isArray(raw)) return { checks: [], errors: [`${CHECKS_FILE}: must be an array of checks`] };
  const checks: NoteCheck[] = [];
  const errors: string[] = [];
  raw.forEach((c, i) => {
    const ok = c && typeof c === 'object' && typeof c.claim === 'string' && typeof c.tool === 'string' && c.expect && typeof c.expect === 'object';
    if (!ok) {
      errors.push(`${CHECKS_FILE}[${i}]: needs {claim, tool, input?, expect: {contains|matches|equals…}}`);
      return;
    }
    if (c.expect.matches !== undefined) {
      try {
        new RegExp(String(c.expect.matches));
      } catch (e) {
        errors.push(`${CHECKS_FILE}[${i}] ("${c.claim}"): invalid matches pattern (${(e as Error).message})`);
        return;
      }
    }
    checks.push(c as NoteCheck);
  });
  return { checks, errors };
}

/** True if CLAUDE.md imports the notes. */
export function notesLinked(paths: TrodPaths): boolean {
  const { claudeMd } = notesPaths(paths);
  return existsSync(claudeMd) && readFileSync(claudeMd, 'utf8').split('\n').some((l) => l.trim() === NOTES_IMPORT);
}

/** Adds the `@.trod/notes.md` import to CLAUDE.md (creating it if needed). Returns false if it was already there. */
export function linkNotes(paths: TrodPaths): boolean {
  if (notesLinked(paths)) return false;
  const { claudeMd } = notesPaths(paths);
  const block = `\n## Project notes (trod)\n\nVerified notes about this project's environment, kept by trod (\`trod forge\`, \`trod verify\`):\n\n${NOTES_IMPORT}\n`;
  if (existsSync(claudeMd)) appendFileSync(claudeMd, block);
  else writeFileSync(claudeMd, block.trimStart());
  return true;
}

async function findTool(paths: TrodPaths, name: string, execAllowed: boolean, cache: Map<string, LoadedTool | undefined>): Promise<LoadedTool | undefined> {
  if (cache.has(name)) return cache.get(name);
  let found: LoadedTool | undefined;
  for (const [dir, source] of [[paths.libraryDir, 'library'], [paths.toolsDir, 'session']] as const) {
    const entry = listToolEntries(dir).find((e) => path.basename(e).replace(/\.mjs$/, '') === name);
    if (entry) {
      found = await loadToolEntry(entry, source, { execAllowed });
      break;
    }
  }
  cache.set(name, found);
  return found;
}

/** Reads the notes and runs every check. Checks need execution (they run tools), as tool examples do. */
export async function verifyNotes(paths: TrodPaths, opts: { execAllowed: boolean; env?: NodeJS.ProcessEnv }): Promise<NotesReport> {
  const p = notesPaths(paths);
  const exists = existsSync(p.notes);
  const chars = exists ? readFileSync(p.notes, 'utf8').length : 0;
  const { checks, errors } = readChecks(p.checks);
  const results: NoteCheckResult[] = [];
  const cache = new Map<string, LoadedTool | undefined>();
  for (const c of checks) {
    if (!opts.execAllowed) {
      results.push({ claim: c.claim, tool: c.tool, ok: false, error: 'execution is disabled (TROD_ALLOW_EXEC is not 1)' });
      continue;
    }
    const tool = await findTool(paths, c.tool, opts.execAllowed, cache);
    if (!tool?.ok || !tool.runner || !tool.runPath || !tool.def) {
      results.push({ claim: c.claim, tool: c.tool, ok: false, error: tool ? `tool is invalid: ${tool.errors.join('; ')}` : 'no such tool' });
      continue;
    }
    const res = await executeTool({ runner: tool.runner, runPath: tool.runPath, toolDir: tool.dir, toolName: tool.def.name, projectDir: paths.projectDir, input: c.input ?? {}, timeoutMs: tool.def.timeoutMs, env: opts.env });
    const failure = res.ok ? checkExpectation(c.expect, res.text, res.value) : `threw: ${res.error ?? res.text.slice(0, 300)}`;
    results.push({ claim: c.claim, tool: c.tool, ok: !failure, ...(failure ? { error: failure } : {}) });
  }
  return { exists, chars, tooLong: chars > NOTES_MAX_CHARS, linked: notesLinked(paths), checks: results, errors };
}
