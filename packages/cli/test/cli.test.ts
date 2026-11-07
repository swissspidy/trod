import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
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
  it('prints usage', async () => {
    expect((await run(['--help'])).out).toContain('trod promote');
    expect((await run([])).code).toBe(1);
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
    expect(await hookMessage('not json', env)).toBeUndefined();
  });
});
