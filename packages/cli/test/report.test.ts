import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { digestTranscript } from '../src/learn.ts';
import { buildReport, formatReport, notesSince, sessionMetrics, type SessionMetrics } from '../src/report.ts';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-report-'));
const write = (file: string, events: object[]) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return file;
};

/** A Claude Code session: `calls` tool calls of which `fails` fail, `followUps` more prompts, split assistant messages. */
function claudeSession(dir: string, id: string, start: string, o: { calls: number; fails: number; followUps?: number; task?: string }) {
  const t = (min: number) => new Date(Date.parse(start) + min * 60_000).toISOString();
  const ev: object[] = [{ type: 'user', timestamp: t(0), message: { role: 'user', content: o.task ?? 'Do the thing.' } }];
  for (let i = 0; i < o.calls; i++) {
    // Claude Code writes one API message as several events with the same id: count it and its usage once.
    ev.push({ type: 'assistant', timestamp: t(i + 1), message: { id: `m${i}`, content: [{ type: 'text', text: 'trying' }], usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 } } });
    ev.push({ type: 'assistant', timestamp: t(i + 1), message: { id: `m${i}`, content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: {} }], usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 } } });
    ev.push({ type: 'user', timestamp: t(i + 1), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: i < o.fails, content: 'x' }] } });
  }
  for (let i = 0; i < (o.followUps ?? 0); i++) ev.push({ type: 'user', timestamp: t(o.calls + 2 + i), message: { role: 'user', content: 'No, the other one.' } });
  ev.push({ type: 'user', isMeta: true, timestamp: t(o.calls + 9), message: { role: 'user', content: 'meta, not a prompt' } });
  ev.push({ type: 'assistant', isSidechain: true, timestamp: t(o.calls + 9), message: { id: 'side', content: [{ type: 'tool_use', id: 's', name: 'Read', input: {} }] } });
  ev.push({ type: 'assistant', timestamp: t(o.calls + 10), message: { id: 'final', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 1, output_tokens: 1 } } });
  return write(path.join(dir, `${id}.jsonl`), ev);
}

describe('sessionMetrics', () => {
  it('counts a Claude Code session: messages and usage once per API message, failed calls, follow-ups, duration; skips meta and subagents', () => {
    const m = sessionMetrics(claudeSession(tmp(), 's', '2026-11-01T10:00:00Z', { calls: 3, fails: 1, followUps: 2 }))!;
    expect(m).toMatchObject({ id: 's', client: 'claude', turns: 4, toolCalls: 3, toolErrors: 1, followUps: 2, outputTokens: 16, inputTokens: 301, trodRun: false });
    expect(m.durationMin).toBe(13);
  });

  it('counts a Codex rollout, with tokens from its last token_count event', () => {
    const file = write(path.join(tmp(), 'rollout-x.jsonl'), [
      { timestamp: '2026-11-01T10:00:00Z', type: 'session_meta', payload: { id: 'x', cwd: '/w' } },
      { timestamp: '2026-11-01T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>…</environment_context>' }] } },
      { timestamp: '2026-11-01T10:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix it.' }] } },
      { timestamp: '2026-11-01T10:00:03Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"ls"}' } },
      { timestamp: '2026-11-01T10:00:04Z', type: 'response_item', payload: { type: 'function_call_output', output: JSON.stringify({ output: 'no', metadata: { exit_code: 2 } }) } },
      { timestamp: '2026-11-01T10:00:05Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 500, output_tokens: 40 } } } },
      { timestamp: '2026-11-01T10:06:00Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed.' }] } },
    ]);
    expect(sessionMetrics(file)).toMatchObject({ client: 'codex', turns: 1, toolCalls: 1, toolErrors: 1, followUps: 0, inputTokens: 500, outputTokens: 40, durationMin: 6 });
  });

  it('spots the learn marker in a meta message or a Codex skill wrapper, without counting them as prompts', () => {
    const meta = write(path.join(tmp(), 'meta.jsonl'), [
      { type: 'user', timestamp: '2026-11-01T10:00:00Z', message: { role: 'user', content: 'Learn from recent sessions.' } },
      { type: 'user', isMeta: true, timestamp: '2026-11-01T10:00:01Z', message: { role: 'user', content: [{ type: 'text', text: 'trod-learn-run-7c1e5a (skill text)' }] } },
      { type: 'assistant', timestamp: '2026-11-01T10:00:02Z', message: { id: 'a', content: [{ type: 'text', text: 'ok' }] } },
    ]);
    expect(sessionMetrics(meta)).toMatchObject({ trodRun: true, followUps: 0 });
    const codex = write(path.join(tmp(), 'rollout-s.jsonl'), [
      { timestamp: '2026-11-01T10:00:00Z', type: 'session_meta', payload: { id: 's', cwd: '/w' } },
      { timestamp: '2026-11-01T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<skills_instructions>trod-learn-run-7c1e5a</skills_instructions>' }] } },
      { timestamp: '2026-11-01T10:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Learn.' }] } },
    ]);
    expect(sessionMetrics(codex)).toMatchObject({ trodRun: true, followUps: 0 });
    // A session that only read the skill file (the marker in a tool result) is an ordinary session.
    const read = write(path.join(tmp(), 'read.jsonl'), [
      { type: 'user', timestamp: '2026-11-01T10:00:00Z', message: { role: 'user', content: 'What does the learn skill do?' } },
      { type: 'user', timestamp: '2026-11-01T10:00:01Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'trod-learn-run-7c1e5a (this marker …)' }] } },
    ]);
    expect(sessionMetrics(read)!.trodRun).toBe(false);
  });

  it('takes the last usage of a split message and counts a multi-block prompt once', () => {
    const file = write(path.join(tmp(), 'u.jsonl'), [
      { type: 'user', timestamp: '2026-11-01T10:00:00Z', message: { role: 'user', content: [{ type: 'text', text: 'Part one.' }, { type: 'text', text: 'Part two.' }] } },
      { type: 'assistant', timestamp: '2026-11-01T10:00:01Z', message: { id: 'a', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 5, output_tokens: 1 } } },
      { type: 'assistant', timestamp: '2026-11-01T10:00:02Z', message: { id: 'a', content: [{ type: 'text', text: 'y' }], usage: { input_tokens: 5, output_tokens: 30 } } },
    ]);
    expect(sessionMetrics(file)).toMatchObject({ turns: 1, followUps: 0, outputTokens: 30, inputTokens: 5 });
  });

  it('counts failed Codex MCP calls, which Codex records only in their item_completed event', () => {
    const file = write(path.join(tmp(), 'rollout-mcp.jsonl'), [
      { timestamp: '2026-11-01T10:00:00Z', type: 'session_meta', payload: { id: 'm', cwd: '/w' } },
      { timestamp: '2026-11-01T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Look it up.' }] } },
      { timestamp: '2026-11-01T10:00:02Z', type: 'response_item', payload: { type: 'function_call', name: 'trod_run', namespace: 'mcp__trod', call_id: 'c1', arguments: '{}' } },
      { timestamp: '2026-11-01T10:00:03Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'McpToolCall', id: 'c1', status: 'failed', error: { message: 'MCP tool call requires approval' } } } },
      { timestamp: '2026-11-01T10:00:03Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'MCP tool call requires approval' }] } },
      { timestamp: '2026-11-01T10:00:04Z', type: 'response_item', payload: { type: 'function_call', name: 'trod_run', namespace: 'mcp__trod', call_id: 'c2', arguments: '{}' } },
      { timestamp: '2026-11-01T10:00:05Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'McpToolCall', id: 'c2', status: 'completed', result: { isError: false } } } },
      { timestamp: '2026-11-01T10:00:05Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c2', output: [{ type: 'input_text', text: 'P007: 3' }] } },
    ]);
    expect(sessionMetrics(file)).toMatchObject({ toolCalls: 2, toolErrors: 1 });
    const d = digestTranscript(file)!;
    expect(d.errors).toBe(1);
    expect(d.text).toContain('ERROR: MCP tool call requires approval');
    expect(d.text).toContain('RESULT: P007: 3');
  });

  it('marks trod forge and learn sessions, which the report leaves out', () => {
    expect(sessionMetrics(claudeSession(tmp(), 'f', '2026-11-01T10:00:00Z', { calls: 1, fails: 0, task: 'You are a toolsmith for this project.' }))!.trodRun).toBe(true);
    expect(sessionMetrics(claudeSession(tmp(), 'l', '2026-11-01T10:00:00Z', { calls: 1, fails: 0, task: 'trod-learn-run-7c1e5a\nrun trod learn' }))!.trodRun).toBe(true);
  });
});

describe('trod report', () => {
  it('splits sessions at the commit that linked the notes and compares the two sides', async () => {
    const repo = tmp();
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-05T12:00:00Z', GIT_COMMITTER_DATE: '2026-11-05T12:00:00Z' }, stdio: 'ignore' });
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    writeFileSync(path.join(repo, 'CLAUDE.md'), '# Project\n\n@.trod/notes.md\n');
    git('add', 'CLAUDE.md');
    git('commit', '-qm', 'link notes');
    expect(notesSince(repo).claude?.slice(0, 10)).toBe('2026-11-05');
    expect(notesSince(repo).codex).toBeUndefined();

    const sessions = tmp();
    for (let i = 0; i < 3; i++) claudeSession(sessions, `before${i}`, `2026-11-0${i + 1}T10:00:00Z`, { calls: 8, fails: 4, followUps: 2 });
    for (let i = 0; i < 2; i++) claudeSession(sessions, `after${i}`, `2026-11-0${i + 6}T10:00:00Z`, { calls: 4, fails: 1 });
    claudeSession(sessions, 'learn', '2026-11-07T10:00:00Z', { calls: 1, fails: 0, task: 'trod-learn-run-7c1e5a' });
    const lines: string[] = [];
    expect(await main(['report', '--dir', repo, '--from', sessions], (s) => lines.push(s))).toBe(0);
    await main(['report', '--dir', repo, '--from', sessions, '--json'], (s) => lines.push(s));
    {
      const r = JSON.parse(lines.at(-1)!);
      expect(r.before).toMatchObject({ sessions: 3, toolCalls: 8, errorRate: 0.5, followUps: 2 });
      expect(r.after).toMatchObject({ sessions: 2, toolCalls: 4, errorRate: 0.25, followUps: 0 });
      expect(r.excludedTrodRuns).toBe(1);
      const text = lines.slice(0, -1).join('\n');
      expect(text).toContain('Notes linked: Claude Code since 2026-11-05.');
      expect(text).toMatch(/tool calls \(median\)\s+8\s+4\s+-50%/);
      expect(text).toMatch(/failed tool calls\s+50\.0%\s+25\.0%\s+-50%/);
      expect(text).toContain('Fewer than 10 sessions');
    }
  });

  it('says so when no commit links the notes', () => {
    const s: SessionMetrics = { id: 'a', client: 'claude', start: '2026-11-01T00:00:00Z', turns: 1, toolCalls: 1, toolErrors: 0, followUps: 0, outputTokens: 1, inputTokens: 1, trodRun: false };
    expect(formatReport(buildReport([s], {}))).toContain('No commit links the notes yet');
    expect(formatReport(buildReport([s], {}), '3 rules: 3 new')).toContain('evidence: 3 rules: 3 new');
  });
});
