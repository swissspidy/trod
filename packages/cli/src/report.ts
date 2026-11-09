import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { codexFailedCalls, codexOutput, LEARN_RUN_MARKER } from './learn.ts';

/**
 * `trod report`: is trod helping? Compares this project's sessions from before the notes were linked with the ones
 * after, on what transcripts record without a grader: turns, tool calls, failed tool calls, follow-up prompts (often
 * corrections), tokens and duration. Not a controlled experiment: the tasks before and after differ.
 */

export interface SessionMetrics {
  id: string;
  client: 'claude' | 'codex';
  start?: string;
  durationMin?: number;
  /** Assistant messages in the main thread. */
  turns: number;
  toolCalls: number;
  toolErrors: number;
  /** Prompts the user typed after the first one. */
  followUps: number;
  outputTokens: number;
  /** Input tokens, cached or not. */
  inputTokens: number;
  /** A trod forge or learn session, or one that ran trod learn: left out of the report. */
  trodRun: boolean;
}

const TROD_TASK = /^You are (a toolsmith|distilling experience)/;
const CLAUDE_WRAPPER = /^<(command-[a-z]+|local-command-[a-z]+|system-reminder|bash-(input|stdout|stderr)|task-notification|user-memory-input)>/;
const CODEX_WRAPPER = /^(<(environment_context|user_instructions|skills_instructions|turn_aborted|user_shell_command|subagent_notification|permissions instructions|apps_instructions|collaboration_mode|multi_agent_[a-z_]+)>|# AGENTS\.md instructions)/;

function lines(file: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // torn line
    }
  }
  return out;
}

const minutes = (a?: string, b?: string) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 60_000) : undefined);

/** Metrics for one transcript (Claude Code or Codex); undefined when it holds no conversation. */
export function sessionMetrics(file: string): SessionMetrics | undefined {
  const events = lines(file);
  if (!events.length) return undefined;
  const id = path.basename(file, '.jsonl');
  const m: SessionMetrics = { id, client: events[0].type === 'session_meta' ? 'codex' : 'claude', turns: 0, toolCalls: 0, toolErrors: 0, followUps: 0, outputTokens: 0, inputTokens: 0, trodRun: false };
  const stamps = events.map((e) => e.timestamp).filter((t): t is string => typeof t === 'string');
  m.start = stamps[0];
  m.durationMin = minutes(stamps[0], stamps.at(-1));
  let prompts = 0;
  const prompt = (text: string) => {
    if (text.includes(LEARN_RUN_MARKER) || (prompts === 0 && TROD_TASK.test(text))) m.trodRun = true;
    prompts++;
  };
  const usage = new Map<string, { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }>();
  if (m.client === 'codex') {
    const failedMcp = codexFailedCalls(events);
    for (const e of events) {
      const p = (e.payload ?? {}) as { type?: string; role?: string; call_id?: string; content?: { type?: string; text?: string }[]; output?: unknown; info?: { total_token_usage?: { input_tokens?: number; output_tokens?: number } } };
      if (e.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
        m.inputTokens = p.info.total_token_usage.input_tokens ?? m.inputTokens;
        m.outputTokens = p.info.total_token_usage.output_tokens ?? m.outputTokens;
      }
      if (e.type !== 'response_item') continue;
      if (p.type === 'message') {
        const text = (p.content ?? []).map((c) => c?.text ?? '').join('\n').trim();
        // The marker counts wherever it is, also in injected context (a skill); only typed prompts count as prompts.
        if (p.role === 'user' && text.includes(LEARN_RUN_MARKER)) m.trodRun = true;
        if (p.role === 'user' && text && !CODEX_WRAPPER.test(text)) prompt(text);
        else if (p.role === 'assistant') m.turns++;
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call') m.toolCalls++;
      else if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && (codexOutput(p.output).error || (p.call_id !== undefined && failedMcp.has(p.call_id)))) m.toolErrors++;
    }
  } else {
    for (const e of events) {
      // The marker counts in user text, also in a meta message (a skill's text), but not in a tool result (a session
      // that only read the skill file); only typed prompts count as prompts.
      if (e.type === 'user') {
        const content = (e.message as { content?: unknown } | undefined)?.content;
        const texts = typeof content === 'string' ? [content] : Array.isArray(content) ? (content as { type?: string; text?: string }[]).filter((c) => c?.type === 'text').map((c) => c.text ?? '') : [];
        if (texts.some((t) => t.includes(LEARN_RUN_MARKER))) m.trodRun = true;
      }
      if (e.isSidechain) continue;
      const msg = e.message as { id?: string; content?: unknown; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } } | undefined;
      if (e.type === 'user' && msg && !e.isMeta) {
        const blocks = typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : ((msg.content as { type?: string; text?: string; is_error?: boolean }[]) ?? []);
        const typed: string[] = [];
        for (const c of blocks) {
          if (c?.type === 'tool_result' && c.is_error) m.toolErrors++;
          else if (c?.type === 'text' && c.text?.trim() && !CLAUDE_WRAPPER.test(c.text.trim())) typed.push(c.text.trim());
        }
        // One message is one prompt, however many text blocks it has.
        if (typed.length) prompt(typed.join('\n'));
      } else if (e.type === 'assistant' && msg) {
        // One API message is split over several transcript events: count it once, with the usage of its last event
        // (earlier ones can carry partial counts).
        const key = msg.id ?? String(e.uuid);
        if (!usage.has(key)) m.turns++;
        usage.set(key, msg.usage ?? usage.get(key) ?? {});
        if (Array.isArray(msg.content)) m.toolCalls += (msg.content as { type?: string }[]).filter((c) => c?.type === 'tool_use').length;
      }
    }
  }
  if (m.client === 'claude') {
    for (const u of usage.values()) {
      m.outputTokens += u.output_tokens ?? 0;
      m.inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    }
  }
  if (!prompts && !m.turns) return undefined;
  m.followUps = Math.max(0, prompts - 1);
  return m;
}

/**
 * When the notes started loading in each client: the first commit that added the CLAUDE.md import (Claude Code) or
 * the AGENTS.md block (Codex). Undefined when git does not know (no repository, or never committed).
 */
export function notesSince(projectDir: string): { claude?: string; codex?: string } {
  const first = (needle: string, file: string) => {
    try {
      const out = execFileSync('git', ['log', '--reverse', '--format=%cI', `-S${needle}`, '--', file], { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.split('\n').find(Boolean);
    } catch {
      return undefined;
    }
  };
  return { claude: first('@.trod/notes.md', 'CLAUDE.md'), codex: first('<!-- trod notes -->', 'AGENTS.md') };
}

export interface GroupSummary {
  sessions: number;
  turns: number;
  toolCalls: number;
  /** Failed tool calls per tool call, over all sessions in the group. */
  errorRate: number;
  followUps: number;
  outputTokens: number;
  inputTokens: number;
  durationMin: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function summarize(sessions: SessionMetrics[]): GroupSummary {
  const calls = sessions.reduce((n, s) => n + s.toolCalls, 0);
  return {
    sessions: sessions.length,
    turns: median(sessions.map((s) => s.turns)),
    toolCalls: median(sessions.map((s) => s.toolCalls)),
    errorRate: calls ? sessions.reduce((n, s) => n + s.toolErrors, 0) / calls : 0,
    followUps: median(sessions.map((s) => s.followUps)),
    outputTokens: median(sessions.map((s) => s.outputTokens)),
    inputTokens: median(sessions.map((s) => s.inputTokens)),
    durationMin: median(sessions.flatMap((s) => (s.durationMin === undefined ? [] : [s.durationMin]))),
  };
}

export interface Report {
  since: { claude?: string; codex?: string };
  before: GroupSummary;
  after: GroupSummary;
  /** Sessions without a timestamp, or of a client whose notes were never linked in a commit. */
  ungrouped: number;
  excludedTrodRuns: number;
}

export function buildReport(all: SessionMetrics[], since: { claude?: string; codex?: string }): Report {
  const sessions = all.filter((s) => !s.trodRun);
  const before: SessionMetrics[] = [];
  const after: SessionMetrics[] = [];
  let ungrouped = 0;
  for (const s of sessions) {
    const t = since[s.client];
    if (!t || !s.start) ungrouped++;
    else (Date.parse(s.start) >= Date.parse(t) ? after : before).push(s);
  }
  return { since, before: summarize(before), after: summarize(after), ungrouped, excludedTrodRuns: all.length - sessions.length };
}

export function formatReport(r: Report, ledgerLine?: string): string {
  const out: string[] = [];
  const since = [r.since.claude && `Claude Code since ${r.since.claude.slice(0, 10)}`, r.since.codex && `Codex since ${r.since.codex.slice(0, 10)}`].filter(Boolean).join(', ');
  if (!since) {
    out.push('No commit links the notes yet (the @.trod/notes.md import in CLAUDE.md, or the trod block in AGENTS.md), so there is no before and after to compare.');
    out.push(`${r.before.sessions + r.after.sessions + r.ungrouped} session(s) found${r.excludedTrodRuns ? `, besides ${r.excludedTrodRuns} trod forge/learn session(s)` : ''}.`);
    if (ledgerLine) out.push(`evidence: ${ledgerLine}`);
    return out.join('\n');
  }
  out.push(`Notes linked: ${since}.`);
  const rows: [string, (g: GroupSummary) => number, (n: number) => string][] = [
    ['sessions', (g) => g.sessions, (n) => String(n)],
    ['turns (median)', (g) => g.turns, (n) => n.toFixed(0)],
    ['tool calls (median)', (g) => g.toolCalls, (n) => n.toFixed(0)],
    ['failed tool calls', (g) => g.errorRate, (n) => `${(n * 100).toFixed(1)}%`],
    ['follow-up prompts (median)', (g) => g.followUps, (n) => n.toFixed(1)],
    ['output tokens (median)', (g) => g.outputTokens, (n) => Math.round(n).toLocaleString('en-US')],
    ['input tokens (median)', (g) => g.inputTokens, (n) => Math.round(n).toLocaleString('en-US')],
    ['duration, min (median)', (g) => g.durationMin, (n) => n.toFixed(1)],
  ];
  const w = Math.max(...rows.map(([l]) => l.length));
  out.push('', `${''.padEnd(w)}  ${'before'.padStart(12)}  ${'after'.padStart(12)}  change`);
  for (const [label, get, fmt] of rows) {
    const a = get(r.before);
    const b = get(r.after);
    const change = label === 'sessions' || !r.before.sessions || !r.after.sessions || a === 0 ? '' : `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(0)}%`;
    out.push(`${label.padEnd(w)}  ${fmt(a).padStart(12)}  ${fmt(b).padStart(12)}  ${change}`);
  }
  if (ledgerLine) out.push('', `evidence: ${ledgerLine}`);
  out.push('');
  if (r.excludedTrodRuns) out.push(`Left out: ${r.excludedTrodRuns} trod forge/learn session(s).`);
  if (r.ungrouped) out.push(`Not compared: ${r.ungrouped} session(s) without a timestamp, or from a client whose notes were never linked in a commit.`);
  if (r.before.sessions < 10 || r.after.sessions < 10) out.push('Fewer than 10 sessions on one side: read the changes as anecdotes.');
  out.push('Not a controlled experiment: the tasks before and after differ. Lower is better on every row except sessions.');
  return out.join('\n');
}
