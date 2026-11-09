import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { notesPaths, readTrodConfig, type TrodPaths } from '@trod/server';

/**
 * Notes delivered by hooks (`.trod/config.json` with `"delivery": "hooks"`), for Claude Code:
 * - SessionStart: a stable share of sessions (the holdout, 10% by default) gets no notes; the others get .trod/notes.md.
 * - UserPromptSubmit: wiki pages whose `when:` keywords appear in the prompt are added, once per session.
 * Every decision is logged to .trod/logs/notes.jsonl, so `trod report` can compare sessions with notes against the
 * holdout (randomized, unlike a before/after split) and `trod learn` can see which rules each session had.
 */

export const NOTES_LOG = 'notes.jsonl';

export type NotesEvent =
  | { type: 'session'; ts: string; session: string; holdout: boolean; notes: boolean }
  | { type: 'page'; ts: string; session: string; page: string; trigger: string };

export interface WikiPage {
  /** File name without .md. */
  name: string;
  file: string;
  /** Lower-cased keywords from the page's `when:` line; the page is added when the prompt contains one of them. */
  when: string[];
  /** The page without its front matter. */
  body: string;
}

/** Wiki pages with front matter (`---\nwhen: invoice, billing run\n---`). Pages without `when:` are only reachable via the index. */
export function readWikiPages(paths: TrodPaths): WikiPage[] {
  const dir = path.join(paths.trodDir, 'wiki');
  if (!existsSync(dir)) return [];
  const pages: WikiPage[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const raw = readFileSync(path.join(dir, f), 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const front = m?.[1] ?? '';
    const when = (front.match(/^when:\s*(.+)$/m)?.[1] ?? '')
      .split(',')
      .map((k) => k.trim().replace(/^["']|["']$/g, '').toLowerCase())
      .filter((k) => k.length >= 3);
    pages.push({ name: f.slice(0, -3), file: path.join(dir, f), when, body: m ? raw.slice(m[0].length) : raw });
  }
  return pages;
}

/** The pages a prompt calls for: a `when:` keyword appears in it (case-insensitive, at word boundaries). */
export function matchPages(pages: WikiPage[], prompt: string): { page: WikiPage; keyword: string }[] {
  const text = prompt.toLowerCase();
  const hits: { page: WikiPage; keyword: string }[] = [];
  for (const page of pages) {
    const keyword = page.when.find((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text));
    if (keyword) hits.push({ page, keyword });
  }
  return hits;
}

/** A stable decision per session: the same session id always lands on the same side. */
export function inHoldout(session: string, share: number): boolean {
  if (!(share > 0)) return false;
  const n = parseInt(createHash('sha256').update(session).digest('hex').slice(0, 8), 16) / 0xffffffff;
  return n < Math.min(share, 0.5);
}

interface SessionState {
  holdout: boolean;
  pages: string[];
  /** When SessionStart last ran: the plugin's hook and the project's can both fire, and the notes go in once. */
  started?: string;
}

const stateFile = (paths: TrodPaths, session: string) => path.join(paths.trodDir, 'state', 'sessions', `${session.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

function readState(paths: TrodPaths, session: string): SessionState | undefined {
  try {
    return JSON.parse(readFileSync(stateFile(paths, session), 'utf8')) as SessionState;
  } catch {
    return undefined;
  }
}

function writeState(paths: TrodPaths, session: string, state: SessionState): void {
  const file = stateFile(paths, session);
  mkdirSync(path.dirname(file), { recursive: true });
  // .trod/state/ ignores itself (trod learn writes the .gitignore); make sure it does here too.
  const ignore = path.join(paths.trodDir, 'state', '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  writeFileSync(file, JSON.stringify(state));
}

function log(paths: TrodPaths, event: NotesEvent): void {
  mkdirSync(paths.logsDir, { recursive: true });
  appendFileSync(path.join(paths.logsDir, NOTES_LOG), `${JSON.stringify(event)}\n`);
}

export function readNotesLog(paths: TrodPaths): NotesEvent[] {
  const file = path.join(paths.logsDir, NOTES_LOG);
  if (!existsSync(file)) return [];
  const out: NotesEvent[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as NotesEvent);
    } catch {
      // torn line
    }
  }
  return out;
}

const pageBlock = (page: WikiPage) => `trod: rules for this kind of task (.trod/wiki/${page.name}.md):\n\n${page.body.trim()}`;

/**
 * Handles a SessionStart or UserPromptSubmit hook payload in hooks delivery mode; returns the context to add, if any.
 * Undefined when the project does not use hooks delivery, so the hooks can be installed unconditionally.
 */
export function notesHook(paths: TrodPaths, payload: { hook_event_name?: string; session_id?: string; prompt?: string; source?: string }, now = new Date()): string | undefined {
  const config = readTrodConfig(paths);
  if (config.delivery !== 'hooks') return undefined;
  const session = payload.session_id;
  if (!session) return undefined;
  const ts = now.toISOString();
  let state = readState(paths, session);
  if (payload.hook_event_name === 'SessionStart' && state?.started && now.getTime() - Date.parse(state.started) < 10_000) return undefined;
  if (payload.hook_event_name === 'SessionStart' || !state) {
    // A resumed or compacted session keeps its side; its context lost the notes, so they are added again.
    const holdout = state?.holdout ?? inHoldout(session, config.holdout ?? 0.1);
    const notesFile = notesPaths(paths).notes;
    const notes = !holdout && existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '';
    const fresh = !state;
    state = payload.hook_event_name === 'SessionStart' ? { holdout, pages: [], started: ts } : { holdout, pages: state?.pages ?? [] };
    writeState(paths, session, state);
    if (fresh) log(paths, { type: 'session', ts, session, holdout, notes: !!notes });
    if (payload.hook_event_name === 'SessionStart') return notes ? `trod: verified notes about this project (.trod/notes.md):\n\n${notes}` : undefined;
  }
  if (payload.hook_event_name !== 'UserPromptSubmit' || state.holdout || !payload.prompt) return undefined;
  const hits = matchPages(readWikiPages(paths), payload.prompt).filter((h) => !state.pages.includes(h.page.name));
  if (!hits.length) return undefined;
  for (const h of hits) log(paths, { type: 'page', ts, session, page: h.page.name, trigger: h.keyword });
  writeState(paths, session, { ...state, pages: [...state.pages, ...hits.map((h) => h.page.name)] });
  return hits.map((h) => pageBlock(h.page)).join('\n\n---\n\n');
}

/** What each logged session had: holdout or not, and the pages added. */
export function sessionDelivery(paths: TrodPaths): Map<string, { holdout: boolean; pages: string[] }> {
  const out = new Map<string, { holdout: boolean; pages: string[] }>();
  for (const e of readNotesLog(paths)) {
    if (e.type === 'session') out.set(e.session, { holdout: e.holdout, pages: out.get(e.session)?.pages ?? [] });
    else if (e.type === 'page') {
      const s = out.get(e.session) ?? { holdout: false, pages: [] };
      if (!s.pages.includes(e.page)) s.pages.push(e.page);
      out.set(e.session, s);
    }
  }
  return out;
}
