import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';
import { countRules, newcombe, prune, PRUNE_HISTORY, readPruneHistory, splitSections, summarizePruneHistory, verdict } from '../src/prune.ts';

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

  const runs = (tasks: number, perTask: number, pass: boolean | ((t: number, r: number) => boolean)) =>
    new Map(Array.from({ length: tasks }, (_, t) => [`t${t}`, Array.from({ length: perTask }, (_, r) => (typeof pass === 'function' ? pass(t, r) : pass))]));

  it('matches the published Newcombe interval', () => {
    // Newcombe (1998), method 10: 56/70 vs 48/80 gives 0.0524 to 0.3339.
    expect(newcombe(56, 70, 48, 80).map((x) => +x.toFixed(4))).toEqual([0.0524, 0.3339]);
  });

  it('calls a part KEEP when removing it costs pass rate, CUT only with enough runs to rule out an effect, INCONCLUSIVE otherwise', () => {
    expect(verdict('x', runs(6, 2, true), runs(6, 2, false), 0.05, 2).verdict).toBe('KEEP');
    // No difference on 6 tasks × 2: too few runs to rule out a 5-point effect.
    const same = verdict('x', runs(6, 2, true), runs(6, 2, true), 0.05, 2);
    expect(same.verdict).toBe('INCONCLUSIVE');
    expect(same.suggestRuns).toBeGreaterThan(2);
    expect(verdict('x', runs(40, 5, true), runs(40, 5, true), 0.05, 5).verdict).toBe('CUT');
    const mixed = verdict('x', runs(6, 2, (t) => t % 2 === 0), runs(6, 2, (t) => t % 3 === 0), 0.05, 2);
    expect(mixed.verdict).toBe('INCONCLUSIVE');
  });

  it('gives no verdict from too few tasks or runs, however clean they look', () => {
    // Two tasks, one run each, notes pass and no notes fail: 1 time in 8 by chance when the notes do nothing.
    expect(verdict('x', runs(2, 1, true), runs(2, 1, false), 0.05, 1).verdict).toBe('INCONCLUSIVE');
    expect(verdict('x', runs(4, 5, true), runs(4, 5, false), 0.05, 5).verdict).toBe('INCONCLUSIVE');
  });

  it('runs with and without the notes and each section, records the history, and changes nothing', async () => {
    const dir = project();
    const lines: string[] = [];
    const res = await prune({ projectDir: dir, config: { tasks: tasks(6), runs: 2, parallel: 6 }, claudeBin: fakeClaude(tmp()), out: (s) => lines.push(s), sections: true });
    expect(res.withNotes).toEqual({ passed: 12, runs: 12 });
    expect(res.withoutNotes).toEqual({ passed: 0, runs: 12 });
    // "Style" changes nothing here, but 12 runs cannot rule out a 5-point effect.
    expect(res.effects.map((e) => [e.part, e.verdict])).toEqual([['all notes', 'KEEP'], ['Finishing', 'KEEP'], ['Style', 'INCONCLUSIVE']]);
    expect(existsSync(path.join(dir, '.trod', 'tune', '.gitignore'))).toBe(true);
    expect(readFileSync(path.join(dir, '.trod', 'notes.md'), 'utf8')).toBe(NOTES);
    const h = readPruneHistory(dir);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ notesChars: NOTES.length, rules: 3, sections: 2 });
    expect(summarizePruneHistory(h)).toMatch(/notes KEEP \(\+100 points\), 0 part\(s\) to cut/);
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
