import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  /** How linked notes reach Claude Code sessions: trod's hooks, or the CLAUDE.md import. */
  delivery: 'hooks' | 'import';
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
    if (c.expect.contains === undefined && c.expect.matches === undefined && c.expect.equals === undefined) {
      errors.push(`${CHECKS_FILE}[${i}] ("${c.claim}"): expect needs contains, matches or equals`);
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

/** .trod/config.json: how notes reach Claude Code sessions. Committed with the notes. */
export interface TrodConfig {
  /** "import" (default): CLAUDE.md imports .trod/notes.md. "hooks": trod's hooks inject the notes and matching wiki pages. */
  delivery?: 'import' | 'hooks';
  /** With hooks: the share of sessions that get no notes at all (a holdout for `trod report`), 0..0.5. Default 0.1. */
  holdout?: number;
}
export const CONFIG_FILE = 'config.json';

export function readTrodConfig(paths: TrodPaths): TrodConfig {
  try {
    const raw = JSON.parse(readFileSync(path.join(paths.trodDir, CONFIG_FILE), 'utf8')) as TrodConfig;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function writeTrodConfig(paths: TrodPaths, config: TrodConfig): void {
  mkdirSync(paths.trodDir, { recursive: true });
  writeFileSync(path.join(paths.trodDir, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
}

/** Notes go out through trod's hooks rather than the CLAUDE.md import. */
export function hooksDelivery(paths: TrodPaths): boolean {
  return readTrodConfig(paths).delivery === 'hooks';
}

/** True if Claude Code sessions get the notes: CLAUDE.md imports them, or trod's hooks deliver them. */
export function notesLinked(paths: TrodPaths): boolean {
  if (hooksDelivery(paths)) return true;
  const { claudeMd } = notesPaths(paths);
  return existsSync(claudeMd) && readFileSync(claudeMd, 'utf8').split('\n').some((l) => l.trim() === NOTES_IMPORT);
}

/** Antigravity does not read CLAUDE.md: it loads rules from .agents/rules/, which can inline a file. */
export const ANTIGRAVITY_NOTES_RULE = path.join('.agents', 'rules', 'trod-notes.md');
const ANTIGRAVITY_RULE_TEXT = `---
trigger: always_on
---

# Project notes (trod)

Verified notes about this project's environment, kept by trod (\`trod forge\`, \`trod learn\`, \`trod verify\`):

@[trod notes](../../.trod/notes.md)
`;

/**
 * For projects set up for Antigravity (an .agents/ folder, e.g. from `trod init --antigravity`): writes the rule that
 * loads .trod/notes.md into every Antigravity conversation. 'skipped' when the project has no .agents/ folder.
 * File system errors come back as { error } instead of being thrown, so they never block the CLAUDE.md import.
 */
export function linkAntigravityNotes(paths: TrodPaths): 'written' | 'exists' | 'skipped' | { error: string } {
  const rule = path.join(paths.projectDir, ANTIGRAVITY_NOTES_RULE);
  // .agents/skills/ alone is not Antigravity (trod init --codex writes it too): look for Antigravity's own files.
  const agents = path.join(paths.projectDir, '.agents');
  if (!existsSync(path.join(agents, 'mcp_config.json')) && !existsSync(path.join(agents, 'rules'))) return 'skipped';
  if (existsSync(rule)) return 'exists';
  try {
    mkdirSync(path.dirname(rule), { recursive: true });
    writeFileSync(rule, ANTIGRAVITY_RULE_TEXT);
    return 'written';
  } catch (err) {
    return { error: `could not write ${ANTIGRAVITY_NOTES_RULE}: ${(err as Error).message}` };
  }
}

/**
 * Codex reads AGENTS.md, which cannot import a file, and models do not reliably follow a pointer to another file
 * (gpt-5-mini never opened .trod/notes.md when AGENTS.md told it to), so the block carries a copy of the notes.
 */
export const CODEX_NOTES_FILE = 'AGENTS.md';
/** Codex reads AGENTS.override.md instead of AGENTS.md when both exist. */
export function codexNotesFile(paths: TrodPaths): string {
  return existsSync(path.join(paths.projectDir, 'AGENTS.override.md')) ? 'AGENTS.override.md' : CODEX_NOTES_FILE;
}
export const CODEX_NOTES_MARKER = '<!-- trod notes -->';
export const CODEX_NOTES_END = '<!-- /trod notes -->';
function codexNotesBlock(notes: string): string {
  return `${CODEX_NOTES_MARKER}
## Project notes (trod)

Verified rules about this project's environment, kept by trod in \`.trod/notes.md\` (\`trod forge\`, \`trod learn\`,
\`trod verify\`; this copy is refreshed when they link the notes). Follow them; when they list a page in
\`.trod/wiki/\` for your kind of task, read that page.

${notes.trim().replaceAll(CODEX_NOTES_MARKER, '<!-- trod notes (quoted) -->').replaceAll(CODEX_NOTES_END, '<!-- /trod notes (quoted) -->')}
${CODEX_NOTES_END}
`;
}

/**
 * For projects that use Codex (a .codex/ folder, e.g. from `trod init --codex`, or an AGENTS.md or
 * AGENTS.override.md already there, as in projects that only use the Codex plugin): adds a block to the instruction
 * file Codex reads (AGENTS.override.md if it exists, else AGENTS.md) with a copy of .trod/notes.md, and refreshes
 * that copy when the notes changed. 'exists' when it is up to date; 'skipped' when the project uses no Codex or has
 * no notes. Errors come back as { error }.
 */
export function linkCodexNotes(paths: TrodPaths): 'written' | 'exists' | 'skipped' | { error: string } {
  const name = codexNotesFile(paths);
  const file = path.join(paths.projectDir, name);
  if (!existsSync(path.join(paths.projectDir, '.codex')) && !existsSync(file)) return 'skipped';
  const notesFile = notesPaths(paths).notes;
  if (!existsSync(notesFile)) return 'skipped';
  try {
    const block = codexNotesBlock(readFileSync(notesFile, 'utf8'));
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const start = current.indexOf(CODEX_NOTES_MARKER);
    const end = start >= 0 ? current.indexOf(CODEX_NOTES_END, start) : -1;
    let next: string;
    if (start >= 0 && end > start) next = current.slice(0, start) + block.trimEnd() + current.slice(end + CODEX_NOTES_END.length);
    else if (start >= 0) return { error: `${name} has "${CODEX_NOTES_MARKER}" without "${CODEX_NOTES_END}": remove the old trod block, then link the notes again` };
    else next = current ? `${current}${current.endsWith('\n') ? '' : '\n'}\n${block}` : block;
    if (next === current) return 'exists';
    writeFileSync(file, next);
    return 'written';
  } catch (err) {
    return { error: `could not update ${name}: ${(err as Error).message}` };
  }
}

/** Adds the `@.trod/notes.md` import to CLAUDE.md (creating it if needed). Returns false if it was already there. */
export function linkNotes(paths: TrodPaths): boolean {
  // With hooks delivery the hooks inject the notes; an import as well would load them twice and defeat the holdout.
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
  return { exists, chars, tooLong: chars > NOTES_MAX_CHARS, linked: notesLinked(paths), delivery: hooksDelivery(paths) ? 'hooks' : 'import', checks: results, errors };
}
