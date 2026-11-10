import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { trodPaths } from '@trod/server';
import { main } from '../src/cli.ts';
import { doctor, formatDoctor } from '../src/doctor.ts';
import { init } from '../src/init.ts';

const PLUGIN = path.resolve(import.meta.dirname, '../../../plugin');
const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-doctor-'));

/** A session transcript trod learn would read. */
function transcript(dir: string, id: string): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  writeFileSync(file, [{ type: 'user', message: { role: 'user', content: 'Fix the login test' } }, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }].map((l) => JSON.stringify(l)).join('\n'));
  return file;
}

const texts = (r: ReturnType<typeof doctor>) => [...r.setup, ...r.knowledge, ...r.sessions].map((f) => `${f.level}: ${f.text}`).join('\n');

describe('trod doctor', () => {
  it('sends an untouched repository to trod init', () => {
    const dir = tmp();
    const r = doctor(trodPaths(dir), { env: {}, claudeVersion: () => '2.1.0 (Claude Code)', transcripts: () => [] });
    expect(r.broken).toBe(false);
    expect(texts(r)).toMatch(/ok: Claude Code CLI: 2\.1\.0/);
    expect(texts(r)).toMatch(/info: No trod server in this repository/);
    expect(r.next).toMatch(/trod init/);
  });

  it('after init: everything installed, and learning is the next step when there are sessions', () => {
    const dir = tmp();
    init({ projectDir: dir, packageRoot: PLUGIN });
    const sessions = [transcript(path.join(dir, 't'), 'a'), transcript(path.join(dir, 't'), 'b')];
    const r = doctor(trodPaths(dir), { env: {}, claudeVersion: () => '2.1.0', transcripts: () => sessions });
    expect(texts(r)).toMatch(/ok: MCP server set up for Claude Code/);
    expect(texts(r)).toMatch(/ok: Hooks installed/);
    expect(texts(r)).toMatch(/info: Tools do not run in sessions/);
    expect(texts(r)).toMatch(/info: 2 session\(s\) to learn from, 0 already learned from/);
    expect(r.next).toMatch(/trod learn.*2 session/);
    // Without the Claude Code CLI there is nothing to run the learner with.
    expect(doctor(trodPaths(dir), { env: {}, claudeVersion: () => undefined, transcripts: () => sessions }).next).toMatch(/Install Claude Code/);
  });

  it('notices notes that sessions do not load, hooks from an older trod, and tools that may run', () => {
    const dir = tmp();
    init({ projectDir: dir, packageRoot: PLUGIN, allowExec: true });
    mkdirSync(path.join(dir, '.trod'), { recursive: true });
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- Click Submit; Enter does not submit.\n');
    // An older trod installed only the PostToolUse hook.
    writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'npx -y trod hook' }] }] } }));
    const r = doctor(trodPaths(dir), { env: {}, claudeVersion: () => '2.1.0', transcripts: () => [] });
    expect(texts(r)).toMatch(/warn: Notes: \d+ chars, NOT linked/);
    expect(texts(r)).toMatch(/warn: Hooks: PostToolUse installed, SessionStart, UserPromptSubmit, SessionEnd missing/);
    expect(texts(r)).toMatch(/ok: Tools may run/);
    expect(r.next).toMatch(/trod notes --link/);
  });

  it('warns when the library holds tools that sessions cannot run', () => {
    const dir = tmp();
    init({ projectDir: dir, packageRoot: PLUGIN });
    mkdirSync(path.join(dir, '.trod', 'library'), { recursive: true });
    writeFileSync(path.join(dir, '.trod', 'library', 'inv_items.mjs'), 'export default async () => 1;');
    const off = doctor(trodPaths(dir), { env: {}, claudeVersion: () => '2.1.0', transcripts: () => [] });
    expect(texts(off)).toMatch(/warn: Tools: 1 in the library, but sessions cannot run them/);
    const on = doctor(trodPaths(dir), { env: { TROD_ALLOW_EXEC: '1' }, claudeVersion: () => '2.1.0', transcripts: () => [] });
    expect(texts(on)).toMatch(/ok: Tools: 1 in the library/);
  });

  it('exits 1 when something is broken, and prints one screen', async () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude', 'settings.json'), '{ not json');
    const r = doctor(trodPaths(dir), { env: {}, claudeVersion: () => '2.1.0', transcripts: () => [] });
    expect(r.broken).toBe(true);
    expect(r.next).toMatch(/Fix what is marked/);
    const screen = formatDoctor(r, '1.2.3');
    expect(screen).toMatch(/^trod 1\.2\.3 in /);
    expect(screen).toContain('✗ .claude/settings.json is not valid JSON');
    expect(screen.split('\n').length).toBeLessThan(25);
    const out: string[] = [];
    expect(await main(['doctor', '--dir', dir], (s) => out.push(s))).toBe(1);
  });
});

describe('trod learn --dry-run', () => {
  it('lists the sessions it would read and starts nothing', async () => {
    const dir = tmp();
    const sessions = path.join(dir, 'sessions');
    transcript(sessions, 'one');
    transcript(sessions, 'two');
    const project = path.join(dir, 'project');
    mkdirSync(project);
    // If it started a session, this would fail the run.
    process.env.TROD_CLAUDE_BIN = path.join(dir, 'no-such-claude');
    const out: string[] = [];
    try {
      expect(await main(['learn', '--dir', project, '--from', sessions, '--dry-run'], (s) => out.push(s))).toBe(0);
    } finally {
      delete process.env.TROD_CLAUDE_BIN;
    }
    expect(out[0]).toMatch(/learn would read 2 session\(s\)/);
    expect(out.join('\n')).toContain('Fix the login test');
    expect(out.at(-1)).toMatch(/Nothing was started/);
  });
});
