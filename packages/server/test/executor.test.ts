import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeTool, scrubEnv, truncateOutput } from '../src/executor.ts';
import { tempProject } from './helpers.ts';

function script(name: string, body: string): { dir: string; file: string; projectDir: string } {
  const { projectDir } = tempProject();
  const dir = path.join(projectDir, '.trod', 'tools', 't');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, body);
  return { dir, file, projectDir };
}

const run = (runner: 'mjs' | 'sh', body: string, input: unknown = {}, extra: Partial<Parameters<typeof executeTool>[0]> = {}) => {
  const s = script(runner === 'mjs' ? 'run.mjs' : 'run.sh', body);
  return executeTool({ runner, runPath: s.file, toolDir: s.dir, toolName: 't', projectDir: s.projectDir, input, ...extra });
};

describe('executeTool (run.mjs)', () => {
  it('returns the structured result and keeps console output out of it', async () => {
    const res = await run('mjs', 'export default async (input, ctx) => { console.log("noise"); return { sum: input.a + input.b, tool: ctx.toolName }; };', { a: 2, b: 3 });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ sum: 5, tool: 't' });
    expect(res.text).not.toContain('noise');
  });

  it('runs in the project directory', async () => {
    const res = await run('mjs', 'export default async () => process.cwd();');
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(/trod-test-/);
  });

  it('uses stdout when the tool printed instead of returning', async () => {
    const res = await run('mjs', 'export default async () => { console.log("printed"); };');
    expect(res.ok).toBe(true);
    expect(res.text.trim()).toBe('printed');
  });

  it('reports thrown errors', async () => {
    const res = await run('mjs', 'export default async () => { throw new Error("boom"); };');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('boom');
  });

  it('reports a missing default export', async () => {
    const res = await run('mjs', 'export const x = 1;');
    expect(res.ok).toBe(false);
    expect(res.text).toContain('default-export a function');
  });

  it('kills a tool that runs past its timeout', async () => {
    const res = await run('mjs', 'export default async () => new Promise(() => setInterval(() => {}, 1000));', {}, { timeoutMs: 300 });
    expect(res.ok).toBe(false);
    expect(res.timedOut).toBe(true);
    expect(res.text).toContain('timed out');
  });

  it('does not pass secrets through the environment', async () => {
    const res = await run('mjs', 'export default async () => ({ key: process.env.ANTHROPIC_API_KEY ?? null, gh: process.env.GITHUB_TOKEN ?? null, path: !!process.env.PATH, dir: process.env.TROD_PROJECT_DIR });', {}, {
      env: { PATH: process.env.PATH, ANTHROPIC_API_KEY: 'sk-secret', GITHUB_TOKEN: 'ghp_secret', HOME: '/tmp' },
    });
    expect(res.value).toMatchObject({ key: null, gh: null, path: true });
    expect((res.value as { dir: string }).dir).toMatch(/trod-test-/);
  });

  it('truncates large outputs with a marker', async () => {
    const res = await run('mjs', 'export default async () => "x".repeat(50000);', {}, { maxOutputChars: 1000 });
    expect(res.ok).toBe(true);
    expect(res.truncated).toBe(true);
    expect(res.outputChars).toBe(50000);
    expect(res.text).toContain('[trod: output truncated');
    expect(res.text.length).toBeLessThan(1400);
  });
});

describe('executeTool (run.sh)', () => {
  it('passes the input as JSON on stdin and parses JSON output', async () => {
    const res = await run('sh', 'input=$(cat); echo "{\\"got\\": $input}"', { a: 1 });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ got: { a: 1 } });
  });

  it('returns plain text output', async () => {
    const res = await run('sh', 'echo hello');
    expect(res.text.trim()).toBe('hello');
  });

  it('reports a non-zero exit with stderr', async () => {
    const res = await run('sh', 'echo oops >&2; exit 3');
    expect(res.ok).toBe(false);
    expect(res.text).toContain('code 3');
    expect(res.text).toContain('oops');
  });

  it('kills child processes on timeout', async () => {
    const res = await run('sh', 'sleep 30 & sleep 30', {}, { timeoutMs: 300 });
    expect(res.timedOut).toBe(true);
    expect(res.durationMs).toBeLessThan(5000);
  });
});

describe('scrubEnv', () => {
  it('keeps an allowlist, LC_*, passthrough names, and drops proxies with credentials', () => {
    const env = scrubEnv(
      { PATH: '/bin', LC_ALL: 'C', AWS_SECRET_ACCESS_KEY: 'x', MY_VAR: 'y', HTTPS_PROXY: 'http://u:p@proxy:8080', NO_PROXY: 'localhost' },
      { passthrough: ['MY_VAR'] },
    );
    expect(env).toEqual({ PATH: '/bin', LC_ALL: 'C', MY_VAR: 'y', NO_PROXY: 'localhost' });
  });
});

describe('truncateOutput', () => {
  it('leaves short output alone', () => {
    expect(truncateOutput('abc', 10)).toEqual({ text: 'abc', truncated: false });
  });
});
