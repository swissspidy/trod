import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * `trod learn`: distil notes from sessions that already happened. Claude Code keeps a transcript of every session
 * (~/.claude/projects/<project>/<session>.jsonl). trod learn condenses them into short digests, marks each with its
 * outcome when one is known, and hands them to a forge session that compares what worked with what did not and
 * writes rules into .trod/notes.md. No brief, no practice environment: the experience is already on disk.
 */

export type Outcome = 'pass' | 'fail' | 'unknown';

export interface SessionDigest {
  /** Session id (the transcript's file name without .jsonl). */
  id: string;
  file: string;
  /** The first prompt of the session. */
  task: string;
  outcome: Outcome;
  /** The session ran `trod learn` itself (its prompt carried LEARN_RUN_MARKER, possibly in a meta message). */
  learnRun?: boolean;
  toolCalls: number;
  errors: number;
  /** Markdown: the task, then each step (assistant text, tool call, tool result), shortened. */
  text: string;
}

/** Where Claude Code keeps the transcripts of sessions started in projectDir (<config dir>/projects/<project>). */
export function transcriptDir(projectDir: string, configDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude')): string {
  return path.join(configDir, 'projects', path.resolve(projectDir).replace(/[^a-zA-Z0-9]/g, '-'));
}

/** Where Codex keeps its session transcripts ($CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl). */
export function codexSessionsDir(codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex')): string {
  return path.join(codexHome, 'sessions');
}

/** The first line of a Codex rollout file is its session_meta, which names the folder the session ran in. */
function codexSessionCwd(file: string): string | undefined {
  try {
    // Read only the start: rollouts can be large, and there can be thousands of them.
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    const head = buf.subarray(0, n).toString('utf8');
    const e = JSON.parse(head.slice(0, head.indexOf('\n') >= 0 ? head.indexOf('\n') : undefined)) as { type?: string; payload?: { cwd?: string } };
    return e.type === 'session_meta' ? e.payload?.cwd : undefined;
  } catch {
    return undefined;
  }
}

/** Codex transcripts of sessions that ran in projectDir or a folder inside it. */
export function codexTranscripts(projectDir: string, sessionsDir = codexSessionsDir()): string[] {
  const root = path.resolve(projectDir);
  return findTranscripts([sessionsDir]).filter((f) => {
    const cwd = codexSessionCwd(f);
    return cwd !== undefined && (path.resolve(cwd) === root || path.resolve(cwd).startsWith(root + path.sep));
  });
}

/**
 * Every .jsonl file under the given files and directories (directories are searched recursively), each once, newest
 * first. Directories reached twice (overlapping sources, symlink cycles) are walked once.
 */
export function findTranscripts(sources: string[]): string[] {
  const found = new Map<string, string>(); // real path -> path as found
  const seenDirs = new Set<string>();
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    const real = realpathSync(p);
    if (statSync(real).isDirectory()) {
      if (seenDirs.has(real)) return;
      seenDirs.add(real);
      for (const e of readdirSync(real).sort()) walk(path.join(p, e));
    } else if (p.endsWith('.jsonl') && !found.has(real)) found.set(real, p);
  };
  for (const s of sources) walk(s);
  return [...found.keys()].sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).map((r) => found.get(r)!);
}

/** Text that Claude Code wraps around slash commands, shell escapes and reminders, not typed by the user. */
const WRAPPER = /^<(command-[a-z]+|local-command-[a-z]+|system-reminder|bash-(input|stdout|stderr)|task-notification|user-memory-input)>/;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} …[${s.length - n} more chars]` : s);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.type === 'text' ? c.text : c?.type === 'image' ? '[image]' : '')).join('\n');
  return '';
}

/**
 * Condenses one transcript. Works on Claude Code session transcripts and on `claude -p --output-format stream-json`
 * output (which has no first prompt; pass it as `task`). Returns undefined for files with no conversation.
 */
export function digestTranscript(file: string, opts: { outcome?: Outcome; task?: string; maxChars?: number } = {}): SessionDigest | undefined {
  const events: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // a torn line: skip it
    }
  }
  if (events[0]?.type === 'session_meta') return digestCodex(file, events, opts);
  let task = opts.task ?? '';
  const steps: string[] = [];
  let toolCalls = 0;
  let errors = 0;
  let final = '';
  let learnRun = false;
  for (const e of events) {
    if (e.type === 'user' && !learnRun && textOf((e.message as { content?: unknown } | undefined)?.content).includes(LEARN_RUN_MARKER)) learnRun = true;
    if (e.isSidechain || e.isMeta) continue;
    const msg = e.message as { role?: string; content?: unknown } | undefined;
    if (e.type === 'user' && msg) {
      // A user message holds typed text, tool results, or both.
      const blocks = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : ((msg.content as { type?: string; text?: string; content?: unknown; is_error?: boolean }[]) ?? []);
      for (const c of blocks) {
        if (c?.type === 'tool_result') {
          if (c.is_error) errors++;
          steps.push(`${c.is_error ? 'ERROR' : 'RESULT'}: ${clip(textOf(c.content).trim(), 700)}`);
        } else if (c?.type === 'text') {
          const t = (c.text ?? '').trim();
          if (!t || WRAPPER.test(t)) continue;
          if (!task) task = t;
          else steps.push(`USER: ${clip(t, 600)}`);
        }
      }
    } else if (e.type === 'assistant' && msg && Array.isArray(msg.content)) {
      for (const c of msg.content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
        if (c?.type === 'text' && c.text?.trim()) {
          final = c.text.trim();
          steps.push(`ASSISTANT: ${clip(final, 500)}`);
        } else if (c?.type === 'tool_use') {
          toolCalls++;
          const input = c.input as Record<string, unknown> | undefined;
          const shown = typeof input?.command === 'string' ? input.command : JSON.stringify(input);
          steps.push(`CALL ${c.name}: ${clip(shown ?? '', 500)}`);
        }
      }
    } else if (e.type === 'result' && typeof e.result === 'string') {
      final = e.result;
    }
  }
  return assembleDigest(file, { task, steps, toolCalls, errors, final, learnRun }, opts);
}

function assembleDigest(file: string, d: { task: string; steps: string[]; toolCalls: number; errors: number; final: string; learnRun: boolean }, opts: { outcome?: Outcome; maxChars?: number }): SessionDigest | undefined {
  const { task, steps, toolCalls, errors, final, learnRun } = d;
  const maxChars = opts.maxChars ?? 8000;
  if (!task && !steps.length) return undefined;
  const id = path.basename(file, '.jsonl');
  const outcome = opts.outcome ?? 'unknown';
  const head = `# Session ${id}: ${outcome.toUpperCase()}\n\n## Task\n\n${clip(task, 1500)}\n\n## Steps (${toolCalls} tool calls, ${errors} errors)\n\n`;
  const finalPart = (shown: string) => (final && !shown.includes(clip(final, 500)) ? `\n## Final message\n\n${clip(final, 800)}\n` : '');
  // Keep the start and the end of long sessions: how they began and how they ended matter most.
  let body = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const OMITTED = '\n…[middle of the session omitted]…\n';
  if (head.length + body.length + 1 + finalPart(body).length > maxChars) {
    // Reserve room for the final message (it may no longer appear in the shortened body) and the marker.
    const budget = Math.max(500, maxChars - head.length - 1 - finalPart('').length - OMITTED.length);
    body = `${body.slice(0, Math.floor(budget * 0.6))}${OMITTED}${body.slice(-Math.floor(budget * 0.4))}`;
  }
  return { id, file, task, outcome, toolCalls, errors, learnRun, text: `${head}${body}\n${finalPart(body)}` };
}

/** Text Codex puts in user messages that the user did not type (environment, AGENTS.md, skills, turn context). */
const CODEX_WRAPPER = /^(<[a-z_]+>|# AGENTS\.md instructions)/;

type CodexItem = { type?: string; role?: string; content?: { type?: string; text?: string }[]; name?: string; arguments?: string; input?: string; call_id?: string; output?: unknown };

/** A Codex tool result: a string, or { output, metadata: { exit_code } } (sometimes JSON-encoded). */
export function codexOutput(output: unknown): { text: string; error: boolean } {
  let value = output;
  if (typeof value === 'string' && value.trimStart().startsWith('{')) {
    try {
      value = JSON.parse(value);
    } catch {
      // plain text that starts with a brace
    }
  }
  if (value && typeof value === 'object') {
    const o = value as { output?: unknown; content?: unknown; metadata?: { exit_code?: number }; success?: boolean };
    const text = typeof o.output === 'string' ? o.output : typeof o.content === 'string' ? o.content : JSON.stringify(value);
    return { text, error: (o.metadata?.exit_code ?? 0) !== 0 || o.success === false };
  }
  const text = String(value ?? '');
  return { text, error: /^(Exit code|Process exited with code):? *[1-9]/m.test(text) };
}

/** Condenses a Codex rollout transcript (session_meta, response_item, event_msg lines) like a Claude Code one. */
function digestCodex(file: string, events: Record<string, unknown>[], opts: { outcome?: Outcome; task?: string; maxChars?: number }): SessionDigest | undefined {
  let task = opts.task ?? '';
  const steps: string[] = [];
  let toolCalls = 0;
  let errors = 0;
  let final = '';
  let learnRun = false;
  for (const e of events) {
    if (e.type !== 'response_item') continue;
    const item = (e.payload ?? {}) as CodexItem;
    if (item.type === 'message') {
      const text = (item.content ?? []).map((c) => (c?.type === 'input_text' || c?.type === 'output_text' ? (c.text ?? '') : '')).join('\n').trim();
      if (item.role === 'user') {
        if (text.includes(LEARN_RUN_MARKER)) learnRun = true;
        if (!text || CODEX_WRAPPER.test(text)) continue;
        if (!task) task = text;
        else steps.push(`USER: ${clip(text, 600)}`);
      } else if (item.role === 'assistant' && text) {
        final = text;
        steps.push(`ASSISTANT: ${clip(text, 500)}`);
      }
    } else if (item.type === 'function_call' || item.type === 'custom_tool_call') {
      toolCalls++;
      let shown = item.arguments ?? item.input ?? '';
      try {
        const args = JSON.parse(shown) as { command?: unknown; cmd?: unknown };
        const cmd = args.command ?? args.cmd;
        if (Array.isArray(cmd)) shown = cmd.join(' ');
        else if (typeof cmd === 'string') shown = cmd;
      } catch {
        // custom tools (apply_patch) send plain text
      }
      steps.push(`CALL ${item.name}: ${clip(shown, 500)}`);
    } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      const { text, error } = codexOutput(item.output);
      if (error) errors++;
      steps.push(`${error ? 'ERROR' : 'RESULT'}: ${clip(text.trim(), 700)}`);
    }
  }
  return assembleDigest(file, { task, steps, toolCalls, errors, final, learnRun }, opts);
}

/** Reads an outcomes file: {"<session id or file name>": true | false | "pass" | "fail" | <score 0..1>}. */
export function readOutcomes(file: string): Map<string, Outcome> {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const map = new Map<string, Outcome>();
  for (const [k, v] of Object.entries(raw)) {
    const o: Outcome = v === true || v === 'pass' || (typeof v === 'number' && v > 0) ? 'pass' : v === false || v === 'fail' || v === 0 ? 'fail' : 'unknown';
    map.set(path.basename(k, '.jsonl'), o);
  }
  return map;
}

/** Writes one digest per session plus INDEX.md into dir; returns counts by outcome. */
export function writeDigests(dir: string, digests: SessionDigest[]): Record<Outcome, number> {
  mkdirSync(dir, { recursive: true });
  const counts: Record<Outcome, number> = { pass: 0, fail: 0, unknown: 0 };
  const index: string[] = ['# Sessions', '', '| file | outcome | tool calls | errors | task (first line) |', '|---|---|---|---|---|'];
  digests.forEach((d, i) => {
    counts[d.outcome]++;
    const name = `${String(i + 1).padStart(3, '0')}-${d.outcome}.md`;
    writeFileSync(path.join(dir, name), d.text);
    const firstLine = d.task.split('\n').find((l) => /\w/.test(l) && !/^you are\b/i.test(l)) ?? d.task.split('\n')[0] ?? '';
    index.push(`| ${name} | ${d.outcome} | ${d.toolCalls} | ${d.errors} | ${clip(firstLine.replace(/\|/g, '/').trim(), 160)} |`);
  });
  writeFileSync(path.join(dir, 'INDEX.md'), index.join('\n') + '\n');
  return counts;
}

/**
 * Sessions already learned from, so scheduled runs only look at what is new. It lists local session ids, so it lives
 * in .trod/state/, which ignores itself (.trod/state/.gitignore) and is never committed, with or without `trod init`.
 */
export const LEARN_STATE_DIR = path.join('.trod', 'state');
export const LEARN_STATE_FILE = path.join(LEARN_STATE_DIR, 'learn.json');
const LEARN_LOCK_FILE = path.join(LEARN_STATE_DIR, 'learn.lock');
/** Per rule: how many later sessions confirmed or contradicted it. The learner keeps it; reviewers read it. */
export const LEDGER_FILE = path.join('.trod', 'notes.evidence.json');
/** Sessions that ran `trod learn` (e.g. a scheduled task) carry this marker and are never learned from. */
export const LEARN_RUN_MARKER = 'trod-learn-run-7c1e5a';

export interface LearnState {
  lastRun?: string;
  sessions: string[];
}

export function readLearnState(projectDir: string): LearnState {
  try {
    const raw = JSON.parse(readFileSync(path.join(projectDir, LEARN_STATE_FILE), 'utf8')) as Partial<LearnState>;
    return { lastRun: typeof raw.lastRun === 'string' ? raw.lastRun : undefined, sessions: Array.isArray(raw.sessions) ? raw.sessions.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return { sessions: [] };
  }
}

function ensureStateDir(projectDir: string): void {
  const dir = path.join(projectDir, LEARN_STATE_DIR);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path.join(dir, '.gitignore'))) writeFileSync(path.join(dir, '.gitignore'), '# machine-local trod state (written by trod learn)\n*\n');
}

/**
 * Records the sessions of a finished run. Every id is kept: dropping old ones would make later runs learn from those
 * sessions again and count their evidence twice. Rereads the file so ids recorded meanwhile are kept too.
 */
export function writeLearnState(projectDir: string, learned: string[], now = new Date()): void {
  ensureStateDir(projectDir);
  const sessions = [...new Set([...readLearnState(projectDir).sessions, ...learned])];
  writeFileSync(path.join(projectDir, LEARN_STATE_FILE), JSON.stringify({ lastRun: now.toISOString(), sessions }, null, 2) + '\n');
}

/**
 * One learning run per project at a time: overlapping runs would learn from the same sessions and count their evidence
 * twice. Returns a release function, or undefined when another live run holds the lock (a stale lock is taken over).
 */
export function acquireLearnLock(projectDir: string): (() => void) | undefined {
  ensureStateDir(projectDir);
  const lock = path.join(projectDir, LEARN_LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      return () => {
        try {
          if (readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock);
        } catch {
          // already gone
        }
      };
    } catch {
      const pid = Number(readFileSync(lock, 'utf8'));
      let alive = false;
      try {
        if (pid > 0) process.kill(pid, 0);
        alive = pid > 0;
      } catch (err) {
        alive = (err as NodeJS.ErrnoException).code === 'EPERM';
      }
      if (alive) return undefined;
      unlinkSync(lock); // stale: its run died
    }
  }
  return undefined;
}

export interface LedgerRule {
  id: string;
  where?: string;
  confirmed: number;
  contradicted: number;
  status: 'new' | 'kept' | 'fixed' | 'dropped';
}

/** Reads the evidence ledger; returns errors instead of throwing so a malformed ledger is reported, not fatal. */
export function readLedger(projectDir: string): { rules: LedgerRule[]; errors: string[]; exists: boolean } {
  const file = path.join(projectDir, LEDGER_FILE);
  if (!existsSync(file)) return { rules: [], errors: [], exists: false };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { rules: [], errors: [`${LEDGER_FILE}: ${(err as Error).message}`], exists: true };
  }
  const list = (raw as { rules?: unknown })?.rules;
  if (!Array.isArray(list)) return { rules: [], errors: [`${LEDGER_FILE}: expected {"rules": [...]}`], exists: true };
  const rules: LedgerRule[] = [];
  const errors: string[] = [];
  list.forEach((r, i) => {
    const o = r as Partial<LedgerRule>;
    const ok = o && typeof o.id === 'string' && Number.isInteger(o.confirmed) && Number.isInteger(o.contradicted) && ['new', 'kept', 'fixed', 'dropped'].includes(o.status as string);
    if (ok) rules.push(o as LedgerRule);
    else errors.push(`${LEDGER_FILE}: rule ${i + 1} needs id, confirmed, contradicted (integers) and status (new|kept|fixed|dropped)`);
  });
  return { rules, errors, exists: true };
}

/**
 * The ledger only grows: a rule seen before stays in it, a dropped rule stays dropped (so it is not re-learned), and
 * counts never fall, except in a relearning run (--all), which recounts from scratch.
 */
export function checkLedgerHistory(before: LedgerRule[], after: LedgerRule[], relearn: boolean): string[] {
  const now = new Map(after.map((r) => [r.id, r]));
  const errors: string[] = [];
  for (const old of before) {
    const r = now.get(old.id);
    if (!r) errors.push(`${LEDGER_FILE}: rule "${old.id}" disappeared (keep it; mark it "dropped" if it no longer holds)`);
    else if (old.status === 'dropped' && r.status !== 'dropped') errors.push(`${LEDGER_FILE}: dropped rule "${old.id}" came back as "${r.status}"`);
    else if (!relearn && (r.confirmed < old.confirmed || r.contradicted < old.contradicted)) errors.push(`${LEDGER_FILE}: counts of "${old.id}" went down (add this run's counts to the earlier ones)`);
  }
  return errors;
}

export function summarizeLedger(rules: LedgerRule[]): string {
  const by = (s: LedgerRule['status']) => rules.filter((r) => r.status === s).length;
  const disputed = rules.filter((r) => r.status !== 'dropped' && r.contradicted > r.confirmed).length;
  return `${rules.length} rule(s): ${by('kept')} kept, ${by('fixed')} fixed, ${by('new')} new, ${by('dropped')} dropped${disputed ? `; ${disputed} contradicted more often than confirmed` : ''}`;
}

export const LEARN_PROMPT = (dir: string, counts: Record<Outcome, number>, previous?: { lastRun?: string }, relearn = false) => `You are distilling experience. You are not solving a task: you are writing the notes that future sessions in this project will load, so that they avoid the mistakes earlier sessions made and repeat what worked.

Earlier sessions in this environment are condensed in ${dir}: INDEX.md lists them (${counts.pass} passed, ${counts.fail} failed, ${counts.unknown} with unknown outcome), one file per session. Future sessions start fresh and see only what you write.

1. Read INDEX.md, then the sessions. Group them by kind of task. Within a group, compare failed sessions with passed ones: find the step where a failed session went wrong, and what the passed sessions did instead. For sessions with an unknown outcome, judge from errors, retries, user corrections and the final message.
2. Keep only lessons that hold across sessions or that explain a failure clearly. Do not invent rules that no session supports. Where you can, confirm a lesson against the environment itself (read the code, run a harmless command).
3. Write .trod/notes.md as RULES, each with the action to take: "X ends the attempt; do Y first", "Z is required even when the task does not say so". Put the rules that apply to most tasks first. Then, for each kind of task that needs its own rules, add a short recipe that worked, with <placeholders> for what differs between tasks. Keep the whole file under 4000 characters if you can.
4. If there are many kinds of task and the rules do not fit, keep .trod/notes.md as the general rules plus an index, and put each kind's rules and recipe into .trod/wiki/<kind>.md (under 2000 characters each). Each index line must say when to read the page, e.g. "- Tasks like "<typical task wording>": read \`.trod/wiki/<kind>.md\` first". Start the index with: "Before acting, read the page that matches your task."
5. ${previous?.lastRun ? `These sessions are new since the last learning run (${previous.lastRun}); most of them ran with the current .trod/notes.md and .trod/wiki/ pages loaded. ` : ''}If .trod/notes.md already exists, check every existing rule against these sessions before you add anything: did sessions that followed it succeed (confirmed), or fail because of it, or succeed by doing something else (contradicted)? Fix or drop rules that are contradicted more often than confirmed; keep the rest.
   Keep the evidence in ${LEDGER_FILE}: {"rules": [{"id": "<short-kebab-id>", "where": "<file the rule is in>", "confirmed": <count>, "contradicted": <count>, "status": "new" | "kept" | "fixed" | "dropped"}]}. ${relearn ? "This run re-reads sessions that earlier runs already counted, so recount: replace each rule's counts with what these sessions show (do not add them to the old counts), and keep every rule and every \"dropped\" status that is in the file;" : "Read the file if it exists and add this run's counts to the earlier ones;"} give each new rule an entry with the sessions that support it counted as confirmed; leave dropped rules in the file with status "dropped" so they are not re-learned. Only count sessions where the rule actually applied.
6. Build a trod tool (.trod/tools/<name>.mjs, with examples) only if several sessions repeated the same fiddly multi-step procedure that a tool would make reliable, and back checkable claims with .trod/notes.checks.json as described in the project's trod skill. Most lessons need neither.

Never copy answers to one particular task into the notes: write what transfers to the next task. When finished, reply with the list of rules you wrote and DONE.`;
