import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { forge, lastResultEvent, PRACTICE_PROMPT } from '../src/forge.ts';

/** A stand-in for `claude -p`: runs trod-try a few times, writes notes, prints a result event. */
function fakeClaude(dir: string, script: string): string {
  const bin = path.join(dir, 'fake-claude');
  writeFileSync(
    bin,
    `#!/bin/sh
${script}
mkdir -p .trod && printf '# Notes\\n- Click Submit last; it ends the attempt.\\n' > .trod/notes.md
echo '{"type":"result","subtype":"success","total_cost_usd":0.01,"num_turns":3}'
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

function setup(script: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trod-forge-practice-'));
  const work = path.join(dir, 'work');
  const state = path.join(dir, 'state');
  mkdirSync(work, { recursive: true });
  writeFileSync(state, '0');
  return { work, state, claude: fakeClaude(dir, script) };
}

describe('trod forge --practice', () => {
  it('tells the forge how to practise', () => {
    expect(PRACTICE_PROMPT(true)).toContain('trod-try');
    expect(PRACTICE_PROMPT(true)).toContain('trod-reset');
    expect(PRACTICE_PROMPT(false)).not.toContain('trod-reset');
  });

  it('links practice notes when the forge passed the check, and counts attempts', async () => {
    const { work, state, claude } = setup('trod-try; trod-reset; trod-try; trod-try');
    // The check passes once the state file says 1; reset flips it.
    const res = await forge({ projectDir: work, brief: 'A web form.', claudeBin: claude, practice: { check: `test "$(cat ${state})" = 1`, reset: `echo 1 > ${state}` } });
    expect(res.practice).toEqual({ attempts: 3, passed: 2, corrupt: 0 });
    expect(res.notes?.errors).toEqual([]);
    expect(readFileSync(path.join(work, 'CLAUDE.md'), 'utf8')).toContain('@.trod/notes.md');
  });

  it('says so when Claude Code cannot be started, and leaves the session tools alone', async () => {
    const { work } = setup('');
    mkdirSync(path.join(work, '.trod', 'tools'), { recursive: true });
    writeFileSync(path.join(work, '.trod', 'tools', 'mine.mjs'), "export const meta = { description: 'Says hello to the caller.', whenToUse: 'In tests.', inputSchema: { type: 'object' } };\nexport default async () => 'hi';\n");
    const lines: string[] = [];
    const res = await forge({ projectDir: work, brief: 'x', claudeBin: path.join(work, 'no-such-claude'), out: (s) => lines.push(s) });
    expect(res).toMatchObject({ exitCode: null, promoted: [] });
    expect(lines.join('\n')).toMatch(/could not start Claude Code .*no-such-claude.*ENOENT/);
    expect(existsSync(path.join(work, '.trod', 'tools', 'mine.mjs'))).toBe(true);
    expect(existsSync(path.join(work, '.trod', 'library'))).toBe(false);
  });

  it('reads the last result event of a stream and skips a torn one', () => {
    const ok = '{"type":"result","total_cost_usd":0.5,"num_turns":3}';
    expect(lastResultEvent(`{"type":"assistant"}\n${ok}\n`)).toMatchObject({ total_cost_usd: 0.5, num_turns: 3 });
    expect(lastResultEvent(`${ok}\n{"type":"result","total_co`)).toMatchObject({ num_turns: 3 });
    expect(lastResultEvent('{"type":"assistant"}\n')).toBeUndefined();
  });

  it('does not link notes from a forge that never passed the check', async () => {
    const { work, claude } = setup('trod-try; trod-try');
    const res = await forge({ projectDir: work, brief: 'A web form.', claudeBin: claude, practice: { check: 'exit 3' } });
    expect(res.practice).toEqual({ attempts: 2, passed: 0, corrupt: 0 });
    expect(res.notes?.errors.join(' ')).toContain('never passed the practice check');
    expect(existsSync(path.join(work, 'CLAUDE.md'))).toBe(false);
  });
});
