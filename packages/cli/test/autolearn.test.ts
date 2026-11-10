import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trodPaths } from '@trod/server';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { pendingSessions, sessionEndHook, setAutoLearn, TROD_SESSION_ENV } from '../src/autolearn.ts';
import { writeLearnState } from '../src/learn.ts';

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'trod-autolearn-'));
  mkdirSync(path.join(dir, '.trod'), { recursive: true });
  return trodPaths(dir);
}

describe('automatic learning', () => {
  it('does nothing until it is turned on', () => {
    const paths = project();
    const started: string[] = [];
    expect(sessionEndHook(paths, { session_id: 'a' }, () => started.push('x'), new Date(), {})).toMatchObject({ recorded: false, started: false });
    expect(started).toEqual([]);
  });

  it('starts a learning run once enough sessions have ended, then waits for the cooldown', () => {
    const paths = project();
    expect(setAutoLearn(paths, '3').ok).toBe(true);
    const started: Date[] = [];
    const start = () => started.push(new Date());
    const t0 = Date.parse('2026-11-10T10:00:00Z');
    const at = (min: number) => new Date(t0 + min * 60_000);
    expect(sessionEndHook(paths, { session_id: 's1' }, start, at(0), {}).pending).toBe(1);
    expect(sessionEndHook(paths, { session_id: 's2' }, start, at(1), {}).started).toBe(false);
    // The same session ending twice (resume) counts once.
    expect(sessionEndHook(paths, { session_id: 's2' }, start, at(2), {}).pending).toBe(2);
    expect(sessionEndHook(paths, { session_id: 's3' }, start, at(3), {})).toMatchObject({ pending: 3, started: true });
    expect(started).toHaveLength(1);
    // More sessions before the learning run finished and inside the cooldown: no second run.
    for (const s of ['s4', 's5', 's6']) sessionEndHook(paths, { session_id: s }, start, at(10), {});
    expect(started).toHaveLength(1);
    // The run finished and learned s1–s6: nothing pending; after the cooldown, three new sessions start the next run.
    writeLearnState(paths.projectDir, ['s1', 's2', 's3', 's4', 's5', 's6'], at(20));
    expect(pendingSessions(paths)).toEqual([]);
    for (const [i, s] of ['s7', 's8', 's9'].entries()) sessionEndHook(paths, { session_id: s }, start, at(7 * 60 + i), {});
    expect(started).toHaveLength(2);
    // The inbox and state stay out of git.
    expect(readFileSync(path.join(paths.projectDir, '.trod', 'state', '.gitignore'), 'utf8')).toContain('*');
  });

  it('never counts sessions trod started itself (forge, learn, tune)', () => {
    const paths = project();
    setAutoLearn(paths, '1');
    const started: number[] = [];
    expect(sessionEndHook(paths, { session_id: 'forge-session' }, () => started.push(1), new Date(), { [TROD_SESSION_ENV]: 'learn' })).toMatchObject({ recorded: false, started: false });
    expect(started).toEqual([]);
  });

  it('trod learn --auto turns it on and off; trod hook handles SessionEnd quietly', async () => {
    const paths = project();
    const lines: string[] = [];
    expect(await main(['learn', '--dir', paths.projectDir, '--auto', '5'], (s) => lines.push(s))).toBe(0);
    expect(JSON.parse(readFileSync(path.join(paths.trodDir, 'config.json'), 'utf8')).autoLearn).toEqual({ after: 5, cooldownHours: 6 });
    expect(await main(['learn', '--dir', paths.projectDir, '--auto', 'many'], (s) => lines.push(s))).toBe(1);
    expect(await main(['learn', '--dir', paths.projectDir, '--auto', 'off'], (s) => lines.push(s))).toBe(0);
    expect(JSON.parse(readFileSync(path.join(paths.trodDir, 'config.json'), 'utf8')).autoLearn).toBeUndefined();
    // A SessionEnd payload through the CLI: no output, exit 0, recorded in the inbox when on.
    setAutoLearn(paths, '50');
    const out: string[] = [];
    const stdin = process.stdin;
    const fake = { [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 'cli-1' })); } };
    Object.defineProperty(process, 'stdin', { value: fake, configurable: true });
    const env = process.env[TROD_SESSION_ENV];
    delete process.env[TROD_SESSION_ENV];
    try {
      expect(await main(['hook', '--dir', paths.projectDir], (s) => out.push(s))).toBe(0);
    } finally {
      Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
      if (env !== undefined) process.env[TROD_SESSION_ENV] = env;
    }
    expect(out).toEqual([]);
    expect(pendingSessions(paths)).toEqual(['cli-1']);
    writeFileSync(path.join(paths.trodDir, 'state', 'learn.json'), JSON.stringify({ sessions: ['cli-1'] }));
    expect(pendingSessions(paths)).toEqual([]);
  });
});
