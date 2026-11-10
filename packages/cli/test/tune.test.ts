import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { makeWorkspace, readTuneConfig, splitTasks, tune, type TuneConfig } from '../src/tune.ts';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-tune-'));

/**
 * A stand-in for `claude -p`. As the proposer (TUNE_PROMPT) it writes `rule` into .trod/notes.md; as a task session it
 * creates done.txt only when the notes it loaded say so, which is what each task's check looks for.
 */
function fakeClaude(dir: string, rule: string): string {
  const bin = path.join(dir, 'fake-claude');
  writeFileSync(
    bin,
    `#!/bin/sh
case "$*" in
  *"You are tuning notes"*) ${rule ? `printf '# Notes\\n- ${rule}\\n' > .trod/notes.md` : ':'} ;;
  *) grep -q 'write done.txt' .trod/notes.md 2>/dev/null && touch done.txt ;;
esac
echo '{"type":"result","subtype":"success","total_cost_usd":0.01,"num_turns":2}'
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

function project(): string {
  const dir = tmp();
  mkdirSync(path.join(dir, '.trod'), { recursive: true });
  writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- Nothing learned yet.\n');
  writeFileSync(path.join(dir, 'README.md'), 'a project\n');
  return dir;
}

const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, prompt: `Do task ${i}.`, check: 'test -f done.txt', split: (i % 2 ? 'validate' : 'practice') as 'practice' | 'validate' }));

describe('tune config', () => {
  it('rejects configs that cannot be tuned against, with a message that says what to fix', () => {
    const dir = tmp();
    const f = path.join(dir, 'tune.json');
    expect(() => readTuneConfig(f)).toThrow(/no .*tune\.json/);
    writeFileSync(f, JSON.stringify({ tasks: [{ id: 'a', prompt: 'p', check: 'true' }] }));
    expect(() => readTuneConfig(f)).toThrow(/at least 2 tasks/);
    writeFileSync(f, JSON.stringify({ tasks: [{ id: 'a', prompt: 'p', check: 'true' }, { id: 'a', prompt: 'p', check: 'true' }] }));
    expect(() => readTuneConfig(f)).toThrow(/duplicate task id/);
    writeFileSync(f, JSON.stringify({ tasks: [{ id: 'a', prompt: 'p', check: 'true' }, { id: 'b', prompt: 'p' }] }));
    expect(() => readTuneConfig(f)).toThrow(/tasks\[1\] needs a non-empty "check"/);
    writeFileSync(f, JSON.stringify({ tasks: tasks(2), runs: 0 }));
    expect(() => readTuneConfig(f)).toThrow(/"runs" must be/);
  });

  it('splits tasks into practice and validation sets, both non-empty and stable', () => {
    const free = Array.from({ length: 10 }, (_, i) => ({ id: `task-${i}`, prompt: 'p', check: 'true' }));
    const a = splitTasks(free);
    expect(a.practice.length + a.validate.length).toBe(10);
    expect(a.practice.length && a.validate.length).toBeTruthy();
    expect(splitTasks(free)).toEqual(a);
    // Explicit splits win; an empty side takes a free task.
    const s = splitTasks([{ id: 'x', prompt: 'p', check: 'true', split: 'practice' }, { id: 'y', prompt: 'p', check: 'true', split: 'practice' }, { id: 'z', prompt: 'p', check: 'true' }]);
    expect(s.validate.map((t) => t.id)).toEqual(['z']);
    expect(() => splitTasks([{ id: 'x', prompt: 'p', check: 'true', split: 'practice' }, { id: 'y', prompt: 'p', check: 'true', split: 'practice' }])).toThrow(/validation task/);
  });

  it('runs each task in a copy of the project that carries the harness and imports the notes', () => {
    const dir = project();
    const harness = path.join(tmp(), 'h');
    mkdirSync(harness);
    writeFileSync(path.join(harness, 'notes.md'), '# Notes\n- candidate rule\n');
    const ws = makeWorkspace(dir, harness, path.join(tmp(), 'scratch'));
    expect(readFileSync(path.join(ws.dir, '.trod', 'notes.md'), 'utf8')).toContain('candidate rule');
    expect(readFileSync(path.join(ws.dir, 'CLAUDE.md'), 'utf8')).toContain('@.trod/notes.md');
    expect(readFileSync(path.join(ws.dir, 'README.md'), 'utf8')).toBe('a project\n');
    // The project itself is untouched.
    expect(readFileSync(path.join(dir, '.trod', 'notes.md'), 'utf8')).toContain('Nothing learned yet');
    ws.remove();
    expect(existsSync(ws.dir)).toBe(false);
  });

  it('exports HEAD without history in a git repository, and hides the tune config', () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'tune.json'), '{"tasks": []}');
    const git = (cwd: string, ...a: string[]) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'one');
    writeFileSync(path.join(dir, 'later.txt'), 'x');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'two');
    writeFileSync(path.join(dir, 'uncommitted.txt'), 'x');
    const harness = path.join(tmp(), 'h');
    mkdirSync(harness);
    const ws = makeWorkspace(dir, harness, path.join(tmp(), 'scratch'));
    expect(existsSync(path.join(ws.dir, 'later.txt'))).toBe(true);
    expect(existsSync(path.join(ws.dir, 'uncommitted.txt'))).toBe(false);
    expect(existsSync(path.join(ws.dir, '.trod', 'tune.json'))).toBe(false);
    // One commit, no history to look things up in (not even the tune config).
    expect(git(ws.dir, 'log', '--oneline').stdout.trim().split('\n')).toHaveLength(1);
    expect(git(ws.dir, 'show', 'HEAD:.trod/tune.json').status).not.toBe(0);
    ws.remove();
    expect(existsSync(ws.dir)).toBe(false);
  });
});

describe('trod tune', () => {
  it('keeps a candidate that passes more validation runs, and writes it into the project', async () => {
    const dir = project();
    const config: TuneConfig = { tasks: tasks(4), runs: 1, parallel: 2 };
    const lines: string[] = [];
    const res = await tune({ projectDir: dir, config, claudeBin: fakeClaude(tmp(), 'Before you finish, write done.txt in the project root.'), out: (s) => lines.push(s) });
    expect(res.iterations[0]).toMatchObject({ practice: { passed: 0, runs: 2, errors: 0 }, parent: { passed: 0, runs: 2 }, candidate: { passed: 2, runs: 2 }, accepted: true });
    expect(res.accepted).toBe(true);
    expect(readFileSync(path.join(dir, '.trod', 'notes.md'), 'utf8')).toContain('write done.txt');
    expect(lines.join('\n')).toContain('ACCEPT');
    // Runs and state are kept, out of git.
    expect(JSON.parse(readFileSync(path.join(res.outDir, 'state.json'), 'utf8')).accepted).toBe(true);
    expect(readFileSync(path.join(dir, '.trod', 'tune', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('leaves the notes alone when the proposer changes nothing or the candidate does not win', async () => {
    const dir = project();
    const res = await tune({ projectDir: dir, config: { tasks: tasks(4), runs: 1 }, claudeBin: fakeClaude(tmp(), '') });
    expect(res.iterations[0]?.reason).toMatch(/did not change/);
    expect(res.accepted).toBe(false);
    // A rule that does not help: the candidate ties at 0 and is rejected.
    const res2 = await tune({ projectDir: dir, config: { tasks: tasks(4), runs: 1 }, claudeBin: fakeClaude(tmp(), 'Be brief.') });
    expect(res2.iterations[0]).toMatchObject({ parent: { passed: 0 }, candidate: { passed: 0 }, accepted: false });
    expect(readFileSync(path.join(dir, '.trod', 'notes.md'), 'utf8')).toContain('Nothing learned yet');
  });

  it('stops when practice already passes everything', async () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- Before you finish, write done.txt.\n');
    const res = await tune({ projectDir: dir, config: { tasks: tasks(2), runs: 1 }, claudeBin: fakeClaude(tmp(), 'x') });
    expect(res.iterations[0]?.reason).toMatch(/every practice run passed/);
  });

  it('trod tune --dry-run shows the split and the run counts without running anything', async () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'tune.json'), JSON.stringify({ tasks: tasks(4), runs: 3 }));
    const lines: string[] = [];
    expect(await main(['tune', '--dir', dir, '--dry-run'], (s) => lines.push(s))).toBe(0);
    expect(lines.join('\n')).toMatch(/practice \(2\): t0, t2/);
    expect(lines.join('\n')).toMatch(/6 practice run\(s\), 1 proposer session, 12 validation run\(s\)/);
    expect(await main(['tune', '--dir', dir, '--runs', '0', '--dry-run'], (s) => lines.push(s))).toBe(1);
  });
});
