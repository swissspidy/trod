import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.ts';

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'trod-cli-'));
  const tool = path.join(dir, '.trod', 'tools', 'say_hi');
  mkdirSync(tool, { recursive: true });
  writeFileSync(path.join(tool, 'tool.json'), JSON.stringify({ name: 'say_hi', description: 'Says hi to the given name.', whenToUse: 'Greetings.', inputSchema: { type: 'object' } }));
  writeFileSync(path.join(tool, 'run.mjs'), 'export default async () => "hi";');
  return dir;
}

async function run(args: string[]) {
  const out: string[] = [];
  const code = await main(args, (s) => out.push(s));
  return { code, out: out.join('\n') };
}

describe('trod cli', () => {
  it('prints an overview, per-command help, and a suggestion for a mistyped command', async () => {
    const overview = await run(['--help']);
    expect(overview.code).toBe(0);
    // One line per command, short enough to scan.
    for (const c of ['init', 'doctor', 'learn', 'forge', 'tune', 'verify', 'report', 'notes', 'stats', 'list', 'check', 'promote', 'mcp', 'hook']) expect(overview.out).toMatch(new RegExp(`^  ${c} `, 'm'));
    expect(overview.out.split('\n').length).toBeLessThan(50);
    expect((await run([])).code).toBe(1);
    expect((await run(['help'])).out).toBe(overview.out);
    // The details are one command away, either way round.
    const forge = await run(['help', 'forge']);
    expect(forge).toMatchObject({ code: 0 });
    expect(forge.out).toMatch(/^trod forge --brief/);
    expect(forge.out).toContain('--practice <cmd>');
    expect((await run(['forge', '--help'])).out).toBe(forge.out);
    expect(await run(['forg'])).toMatchObject({ code: 1, out: expect.stringContaining('did you mean "forge"?') });
    expect(await run(['help', 'lern'])).toMatchObject({ code: 1, out: expect.stringContaining('did you mean "learn"?') });
    expect((await run(['frobnicate'])).out).not.toContain('did you mean');
  });

  it('checks, promotes and lists tools', async () => {
    const dir = project();
    expect(await run(['check', '--dir', dir])).toMatchObject({ code: 0, out: 'ok      session/say_hi' });
    const promoted = await run(['promote', 'say_hi', '--dir', dir]);
    expect(promoted.out).toContain('.trod/library/say_hi');
    expect(existsSync(path.join(dir, '.trod', 'library', 'say_hi', 'tool.json'))).toBe(true);
    expect((await run(['list', '--dir', dir])).out).toContain('library/say_hi');
  });

  it('fails check on an invalid tool', async () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'tools', 'say_hi', 'run.mjs'), 'export default ( =>');
    const res = await run(['check', '--dir', dir]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('INVALID');
  });

  it('prints stats as text and JSON', async () => {
    const dir = project();
    mkdirSync(path.join(dir, '.trod', 'logs'), { recursive: true });
    writeFileSync(path.join(dir, '.trod', 'logs', 'x.jsonl'), JSON.stringify({ type: 'call', ts: 't', sessionId: 's', tool: 'say_hi', source: 'session', durationMs: 3, ok: true, inputChars: 2, outputChars: 2, truncated: false }) + '\n');
    expect((await run(['stats', '--dir', dir])).out).toContain('say_hi');
    expect(JSON.parse((await run(['stats', '--json', '--dir', dir])).out).calls).toBe(1);
  });
});

describe('trod hook', () => {
  it('ignores files outside .trod and reports validity for tools', async () => {
    const { hookMessage } = await import('../src/cli.ts');
    const dir = project();
    const env = { TROD_ALLOW_EXEC: '1', PATH: process.env.PATH };
    expect(await hookMessage(JSON.stringify({ tool_input: { file_path: path.join(dir, 'README.md') } }), env)).toBeUndefined();
    const ok = await hookMessage(JSON.stringify({ tool_input: { file_path: path.join(dir, '.trod/tools/say_hi/run.mjs') } }), env);
    expect(ok).toMatch(/"say_hi" is valid and live/);
    writeFileSync(path.join(dir, '.trod', 'tools', 'broken.mjs'), 'export default (( =>');
    const bad = await hookMessage(JSON.stringify({ tool_input: { file_path: path.join(dir, '.trod/tools/broken.mjs') } }), env);
    expect(bad).toMatch(/"broken" is NOT registered/);
    // A file next to the tools that is not a tool (a README, a data file) is none of the hook's business.
    writeFileSync(path.join(dir, '.trod', 'tools', 'README.md'), '# my tools');
    expect(await hookMessage(JSON.stringify({ tool_input: { file_path: path.join(dir, '.trod/tools/README.md') } }), env)).toBeUndefined();
    expect(await hookMessage('not json', env)).toBeUndefined();
  });
});

describe('trod verify', () => {
  it('passes for tools whose examples still hold and flags stale ones', async () => {
    const dir = project();
    const lib = path.join(dir, '.trod', 'library');
    mkdirSync(lib, { recursive: true });
    writeFileSync(path.join(lib, 'answer.mjs'), "export const meta = { description: 'Returns the answer to everything.', whenToUse: 'Always.', inputSchema: { type: 'object' }, examples: [{ input: {}, expect: { equals: 42 } }] };\nexport default async () => 42;\n");
    const ok = await run(['verify', '--dir', dir]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('1/1 library tool(s) verified');
    // The environment drifts: the tool now returns something else.
    writeFileSync(path.join(lib, 'answer.mjs'), "export const meta = { description: 'Returns the answer to everything.', whenToUse: 'Always.', inputSchema: { type: 'object' }, examples: [{ input: {}, expect: { equals: 42 } }] };\nexport default async () => 41;\n");
    const stale = await run(['verify', '--dir', dir]);
    expect(stale.code).toBe(1);
    expect(stale.out).toContain('stale: answer');
  });
});

describe('trod notes', () => {
  const tool = (value: string) =>
    `export const meta = { description: 'Returns the status codes in use.', whenToUse: 'To look up status codes.', inputSchema: { type: 'object' } };\nexport default async () => (${value});\n`;
  function notesProject(): string {
    const dir = project();
    const lib = path.join(dir, '.trod', 'library');
    mkdirSync(lib, { recursive: true });
    writeFileSync(path.join(lib, 'status_codes.mjs'), tool("['Active', 'Closed', 'Merged']"));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n\n- StatusType is one of Active, Closed, Merged.\n');
    writeFileSync(
      path.join(dir, '.trod', 'notes.checks.json'),
      JSON.stringify([{ claim: 'StatusType values', tool: 'status_codes', input: {}, expect: { contains: 'Merged' } }]),
    );
    return dir;
  }

  it('runs the checks, and verify flags a note whose check no longer holds', async () => {
    const dir = notesProject();
    const ok = await run(['verify', '--dir', dir]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('1/1 check(s) passed');
    expect(ok.out).toContain('not linked');
    // The environment drifts: 'Merged' is gone, so the note is stale.
    writeFileSync(path.join(dir, '.trod', 'library', 'status_codes.mjs'), tool("['Active', 'Closed']"));
    const stale = await run(['verify', '--dir', dir]);
    expect(stale.code).toBe(1);
    expect(stale.out).toContain('STALE  "StatusType values"');
  });

  it('links the notes into CLAUDE.md once, keeping what is there', async () => {
    const dir = notesProject();
    writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\nExisting instructions.\n');
    const first = await run(['notes', '--link', '--dir', dir]);
    expect(first.code).toBe(0);
    expect(first.out).toContain('linked .trod/notes.md into CLAUDE.md');
    await run(['notes', '--link', '--dir', dir]);
    const md = readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    expect(md).toContain('Existing instructions.');
    expect(md.split('\n').filter((l) => l.trim() === '@.trod/notes.md')).toHaveLength(1);
    expect((await run(['notes', '--dir', dir])).out).toContain('linked from CLAUDE.md');
  });

  it('does not link notes whose checks fail', async () => {
    const dir = notesProject();
    writeFileSync(path.join(dir, '.trod', 'library', 'status_codes.mjs'), tool("['Active', 'Closed']"));
    const res = await run(['notes', '--link', '--dir', dir]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('not linked, some checks fail');
    expect(existsSync(path.join(dir, 'CLAUDE.md'))).toBe(false);
  });

  it('reports malformed checks and checks that name a missing tool', async () => {
    const dir = notesProject();
    writeFileSync(path.join(dir, '.trod', 'notes.checks.json'), JSON.stringify([{ claim: 'x' }, { claim: 'y', tool: 'nope', expect: { contains: 'a' } }]));
    const res = await run(['notes', '--dir', dir]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('notes.checks.json[0]');
    expect(res.out).toContain('"y" (nope): no such tool');
  });
});

describe('trod notes: validation', () => {
  it('reports an invalid matches pattern as a check-file error instead of aborting', async () => {
    const dir = project();
    mkdirSync(path.join(dir, '.trod', 'library'), { recursive: true });
    writeFileSync(path.join(dir, '.trod', 'library', 'codes.mjs'), "export const meta = { description: 'Returns codes in use.', whenToUse: 'Codes.', inputSchema: { type: 'object' } };\nexport default async () => 'A B';\n");
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '- codes are A and B\n');
    writeFileSync(path.join(dir, '.trod', 'notes.checks.json'), JSON.stringify([{ claim: 'codes', tool: 'codes', expect: { matches: '[' } }]));
    const res = await run(['notes', '--dir', dir]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('invalid matches pattern');
  });

  it('rejects a check without an expectation', async () => {
    const dir = project();
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '- x\n');
    writeFileSync(path.join(dir, '.trod', 'notes.checks.json'), JSON.stringify([{ claim: 'x', tool: 'codes', expect: {} }]));
    const res = await run(['notes', '--dir', dir]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('expect needs contains, matches or equals');
  });

  it('rejects contradicting or misplaced link flags', async () => {
    const dir = project();
    expect((await run(['notes', '--link', '--no-link', '--dir', dir])).code).toBe(1);
    expect((await run(['verify', '--link', '--dir', dir])).out).toContain('--link only applies to trod notes');
  });
});
