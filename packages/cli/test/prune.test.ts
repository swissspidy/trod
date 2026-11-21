import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { countRules, prune, PRUNE_HISTORY, readPruneHistory, splitSections, summarizePruneHistory, verdict } from '../src/prune.ts';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-prune-'));

/** A stand-in for `claude -p`: the task succeeds (done.txt) only when the loaded notes say to write it. */
function fakeClaude(dir: string): string {
  const bin = path.join(dir, 'fake-claude');
  writeFileSync(bin, `#!/bin/sh\ngrep -q 'write done.txt' .trod/notes.md 2>/dev/null && touch done.txt\necho '{"type":"result","subtype":"success","total_cost_usd":0.01,"num_turns":2}'\n`);
  chmodSync(bin, 0o755);
  return bin;
}

const NOTES = `# Notes

Rules for this project.

## Finishing
- Before you finish, write done.txt in the project root.

## Style
- Prefer short answers.
- Use British spelling.
`;

function project(): string {
  const dir = tmp();
  mkdirSync(path.join(dir, '.trod'), { recursive: true });
  writeFileSync(path.join(dir, '.trod', 'notes.md'), NOTES);
  writeFileSync(path.join(dir, 'README.md'), 'a project\n');
  return dir;
}
const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, prompt: `Do task ${i}.`, check: 'test -f done.txt' }));

describe('prune', () => {
  it('splits notes into a preamble and ## sections, and counts rules', () => {
    const { preamble, sections } = splitSections(NOTES);
    expect(preamble).toContain('Rules for this project.');
    expect(sections.map((s) => s.title)).toEqual(['Finishing', 'Style']);
    expect(sections[1]!.text).toContain('British spelling');
    expect(countRules(NOTES)).toBe(3);
  });

  it('calls a part KEEP when removing it costs pass rate, CUT when it changes nothing, INCONCLUSIVE in between', () => {
    const all = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    expect(verdict('x', all, new Map([['a', 0], ['b', 0], ['c', 0], ['d', 0]]), 0.05, 2).verdict).toBe('KEEP');
    expect(verdict('x', all, all, 0.05, 2).verdict).toBe('CUT');
    const mixed = verdict('x', new Map([['a', 1], ['b', 0], ['c', 1], ['d', 0]]), new Map([['a', 0], ['b', 1], ['c', 1], ['d', 0]]), 0.05, 2);
    expect(mixed.verdict).toBe('INCONCLUSIVE');
    expect(mixed.suggestRuns).toBeGreaterThan(2);
  });

  it('runs with and without the notes and each section, records the history, and changes nothing', async () => {
    const dir = project();
    const lines: string[] = [];
    const res = await prune({ projectDir: dir, config: { tasks: tasks(3), runs: 1 }, claudeBin: fakeClaude(tmp()), out: (s) => lines.push(s), sections: true });
    expect(res.withNotes).toEqual({ passed: 3, runs: 3 });
    expect(res.withoutNotes).toEqual({ passed: 0, runs: 3 });
    expect(res.effects.map((e) => [e.part, e.verdict])).toEqual([['all notes', 'KEEP'], ['Finishing', 'KEEP'], ['Style', 'CUT']]);
    expect(readFileSync(path.join(dir, '.trod', 'notes.md'), 'utf8')).toBe(NOTES);
    const h = readPruneHistory(dir);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ notesChars: NOTES.length, rules: 3, sections: 2 });
    expect(summarizePruneHistory(h)).toMatch(/notes KEEP \(\+100 points\), 1 part\(s\) to cut/);
    expect(lines.join('\n')).toMatch(/Nothing was changed/);
  });

  it('trod tune --prune --dry-run counts the sessions and starts none; doctor shows the last prune', async () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'tune.json'), JSON.stringify({ tasks: tasks(4) }));
    const out: string[] = [];
    expect(await main(['tune', '--prune', '--sections', '--dry-run', '--dir', dir], (s) => out.push(s))).toBe(0);
    expect(out.join('\n')).toMatch(/4 task\(s\) × 2 run\(s\).*2 section\(s\): 32 session\(s\)/);
    expect(existsSync(path.join(dir, PRUNE_HISTORY))).toBe(false);
    writeFileSync(path.join(dir, PRUNE_HISTORY), JSON.stringify({ date: '2026-11-01T00:00:00Z', model: 'm', notesChars: 4000, estTokens: 1000, rules: 20, sections: 3, withNotes: { passed: 8, runs: 8 }, withoutNotes: { passed: 8, runs: 8 }, verdicts: [{ part: 'all notes', verdict: 'CUT', drop: 0 }] }) + '\n');
    const doc: string[] = [];
    await main(['doctor', '--dir', dir], (s) => doc.push(s));
    expect(doc.join('\n')).toMatch(/Last prune \(2026-11-01, m\): notes CUT/);
  });
});
