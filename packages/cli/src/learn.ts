import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
  toolCalls: number;
  errors: number;
  /** Markdown: the task, then each step (assistant text, tool call, tool result), shortened. */
  text: string;
}

/** Where Claude Code keeps the transcripts of sessions started in projectDir. */
export function transcriptDir(projectDir: string, home = process.env.CLAUDE_CONFIG_DIR ? path.dirname(process.env.CLAUDE_CONFIG_DIR) : homedir()): string {
  return path.join(home, '.claude', 'projects', path.resolve(projectDir).replace(/[^a-zA-Z0-9]/g, '-'));
}

/** Every .jsonl file under the given files and directories (directories are searched recursively). */
export function findTranscripts(sources: string[]): string[] {
  const found: string[] = [];
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) for (const e of readdirSync(p).sort()) walk(path.join(p, e));
    else if (p.endsWith('.jsonl')) found.push(p);
  };
  for (const s of sources) walk(s);
  return found;
}

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
  const maxChars = opts.maxChars ?? 8000;
  const events: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // a torn line: skip it
    }
  }
  let task = opts.task ?? '';
  const steps: string[] = [];
  let toolCalls = 0;
  let errors = 0;
  let final = '';
  for (const e of events) {
    if (e.isSidechain || e.isMeta) continue;
    const msg = e.message as { role?: string; content?: unknown } | undefined;
    if (e.type === 'user' && msg) {
      if (typeof msg.content === 'string' || (Array.isArray(msg.content) && msg.content.some((c) => c?.type === 'text'))) {
        const t = textOf(msg.content).trim();
        if (!t || t.startsWith('<')) continue; // command wrappers, reminders
        if (!task) task = t;
        else steps.push(`USER: ${clip(t, 600)}`);
        continue;
      }
      for (const c of (msg.content as { type?: string; content?: unknown; is_error?: boolean }[]) ?? []) {
        if (c?.type !== 'tool_result') continue;
        if (c.is_error) errors++;
        steps.push(`${c.is_error ? 'ERROR' : 'RESULT'}: ${clip(textOf(c.content).trim(), 700)}`);
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
  if (!task && !steps.length) return undefined;
  const id = path.basename(file, '.jsonl');
  const outcome = opts.outcome ?? 'unknown';
  const head = `# Session ${id}: ${outcome.toUpperCase()}\n\n## Task\n\n${clip(task, 1500)}\n\n## Steps (${toolCalls} tool calls, ${errors} errors)\n\n`;
  // Keep the start and the end of long sessions: how they began and how they ended matter most.
  let body = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const budget = Math.max(1000, maxChars - head.length);
  if (body.length > budget) body = `${body.slice(0, Math.floor(budget * 0.6))}\n…[middle of the session omitted]…\n${body.slice(-Math.floor(budget * 0.4))}`;
  return { id, file, task, outcome, toolCalls, errors, text: `${head}${body}\n${final && !body.includes(clip(final, 500)) ? `\n## Final message\n\n${clip(final, 800)}\n` : ''}` };
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

export const LEARN_PROMPT = (dir: string, counts: Record<Outcome, number>) => `You are distilling experience. You are not solving a task: you are writing the notes that future sessions in this project will load, so that they avoid the mistakes earlier sessions made and repeat what worked.

Earlier sessions in this environment are condensed in ${dir}: INDEX.md lists them (${counts.pass} passed, ${counts.fail} failed, ${counts.unknown} with unknown outcome), one file per session. Future sessions start fresh and see only what you write.

1. Read INDEX.md, then the sessions. Group them by kind of task. Within a group, compare failed sessions with passed ones: find the step where a failed session went wrong, and what the passed sessions did instead. For sessions with an unknown outcome, judge from errors, retries, user corrections and the final message.
2. Keep only lessons that hold across sessions or that explain a failure clearly. Do not invent rules that no session supports. Where you can, confirm a lesson against the environment itself (read the code, run a harmless command).
3. Write .trod/notes.md as RULES, each with the action to take: "X ends the attempt; do Y first", "Z is required even when the task does not say so". Put the rules that apply to most tasks first. Then, for each kind of task that needs its own rules, add a short recipe that worked, with <placeholders> for what differs between tasks. Keep the whole file under 4000 characters if you can.
4. If there are many kinds of task and the rules do not fit, keep .trod/notes.md as the general rules plus an index, and put each kind's rules and recipe into .trod/wiki/<kind>.md (under 2000 characters each). Each index line must say when to read the page, e.g. "- Tasks like "<typical task wording>": read \`.trod/wiki/<kind>.md\` first". Start the index with: "Before acting, read the page that matches your task."
5. If .trod/notes.md already exists, merge: keep its rules unless the sessions show they are wrong.
6. Build a trod tool (.trod/tools/<name>.mjs, with examples) only if several sessions repeated the same fiddly multi-step procedure that a tool would make reliable, and back checkable claims with .trod/notes.checks.json as described in the project's trod skill. Most lessons need neither.

Never copy answers to one particular task into the notes: write what transfers to the next task. When finished, reply with the list of rules you wrote and DONE.`;
