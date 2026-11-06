import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LogRecord } from '../src/logs.ts';
import { promoteTool } from '../src/promote.ts';
import { computeStats, formatStats } from '../src/stats.ts';
import { tempProject, writeTool } from './helpers.ts';

const ts = '2026-11-06T00:00:00.000Z';
const call = (tool: string, sessionId: string, ok = true): LogRecord => ({
  type: 'call', ts, sessionId, tool, source: 'session', durationMs: 10, ok, inputChars: 2, outputChars: 5, truncated: false,
});

describe('computeStats', () => {
  it('counts creation, calls, repeats, cross-session reuse and errors', () => {
    const records: LogRecord[] = [
      { type: 'server', ts, sessionId: 'a', event: 'start', execAllowed: true, version: '0', tools: [] },
      { type: 'tool', ts, sessionId: 'a', event: 'added', tool: 'grep_it', source: 'session' },
      { type: 'tool', ts, sessionId: 'a', event: 'updated', tool: 'grep_it', source: 'session' },
      call('grep_it', 'a'),
      call('grep_it', 'a'),
      call('grep_it', 'a', false),
      call('grep_it', 'b'),
      { type: 'tool', ts, sessionId: 'a', event: 'added', tool: 'unused', source: 'session' },
    ];
    const s = computeStats(records);
    expect(s).toMatchObject({ sessions: 2, toolsCreated: 2, toolsCalled: 1, toolsReused: 1, calls: 4, errors: 1 });
    expect(s.tools[0]).toMatchObject({ tool: 'grep_it', calls: 4, errors: 1, repeatCalls: 2, crossSessionCalls: 1, sessions: 2, revisions: 1, avgMs: 10 });
    expect(formatStats(s)).toContain('grep_it');
  });

  it('handles empty logs', () => {
    expect(formatStats(computeStats([]))).toContain('no tool activity');
  });
});

describe('promoteTool', () => {
  it('moves a session tool to the library and stamps promotedAt', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'keep_me', {});
    const res = await promoteTool(paths, 'keep_me', new Date(ts));
    expect(res.replaced).toBe(false);
    expect(existsSync(path.join(paths.toolsDir, 'keep_me'))).toBe(false);
    const def = JSON.parse(readFileSync(path.join(paths.libraryDir, 'keep_me', 'tool.json'), 'utf8'));
    expect(def.provenance).toEqual({ reason: 'test', promotedAt: ts });
    expect(existsSync(path.join(paths.libraryDir, 'keep_me', 'run.mjs'))).toBe(true);
  });

  it('replaces an older library version', async () => {
    const paths = tempProject();
    writeTool(paths.libraryDir, 'keep_me', {}, { sh: 'echo old' });
    writeTool(paths.toolsDir, 'keep_me', {});
    const res = await promoteTool(paths, 'keep_me');
    expect(res.replaced).toBe(true);
    expect(existsSync(path.join(paths.libraryDir, 'keep_me', 'run.sh'))).toBe(false);
  });

  it('refuses invalid or missing tools', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'broken', {}, { mjs: 'export default ( =>' });
    await expect(promoteTool(paths, 'broken')).rejects.toThrow(/invalid/);
    await expect(promoteTool(paths, 'nope')).rejects.toThrow(/no session tool/);
  });
});
