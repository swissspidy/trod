import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { TrodServer } from '../src/server.ts';
import type { TrodPaths } from '../src/types.ts';
import { tempProject, writeTool } from './helpers.ts';

const servers: TrodServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function connect(paths: TrodPaths, env: NodeJS.ProcessEnv = { TROD_ALLOW_EXEC: '1', PATH: process.env.PATH, TROD_SESSION_ID: 's1' }) {
  const trod = new TrodServer({ paths, env, debounceMs: 30, pollMs: 200 });
  servers.push(trod);
  await trod.start();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await trod.server.connect(a);
  trod.markConnected();
  const client = new Client({ name: 'test', version: '0' });
  let changes = 0;
  const waiters: (() => void)[] = [];
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    changes++;
    waiters.splice(0).forEach((w) => w());
  });
  await client.connect(b);
  const nextChange = () => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no list_changed within 5s')), 5000);
    waiters.push(() => { clearTimeout(t); resolve(); });
  });
  const names = async () => (await client.listTools()).tools.map((t) => t.name);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return { isError: !!res.isError, text: (res.content as { text: string }[]).map((c) => c.text).join('') };
  };
  return { trod, client, nextChange, names, call, changes: () => changes };
}

describe('TrodServer', () => {
  it('starts with only trod_status', async () => {
    const { names, call } = await connect(tempProject());
    expect(await names()).toEqual(['trod_status']);
    expect((await call('trod_status')).text).toContain('No tools yet');
  });

  it('registers a tool written mid-session, notifies, and runs it', async () => {
    const paths = tempProject();
    const { names, call, nextChange } = await connect(paths);
    const changed = nextChange();
    writeTool(paths.toolsDir, 'add_nums', {
      description: 'Adds two numbers and returns the sum.',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
      examples: [{ input: { a: 1, b: 2 }, expect: { equals: 3 } }],
    }, { mjs: 'export default async ({ a, b }) => a + b;' });
    await changed;
    expect(await names()).toEqual(['trod_status', 'add_nums']);
    expect(await call('add_nums', { a: 20, b: 22 })).toEqual({ isError: false, text: '42' });
    const status = (await call('trod_status')).text;
    expect(status).toContain('add_nums [session], examples 1/1, 1 call(s)');
  });

  it('includes whenToUse in the description the client sees', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'echo_it', { whenToUse: 'Whenever you need an echo.' });
    const { client } = await connect(paths);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'echo_it');
    expect(tool?.description).toContain('When to use: Whenever you need an echo.');
  });

  it('validates input against the schema', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'typed', { inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] } });
    const { call } = await connect(paths);
    const res = await call('typed', { n: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('input/n must be number');
  });

  it('keeps invalid tools out and explains why in trod_status and on call', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'broken', {}, { mjs: 'export default async ( => 1' });
    writeTool(paths.toolsDir, 'fails_example', { examples: [{ input: { x: 'a' }, expect: { contains: 'zzz' } }] });
    const { names, call } = await connect(paths);
    expect(await names()).toEqual(['trod_status']);
    const status = (await call('trod_status')).text;
    expect(status).toContain('session/broken');
    expect(status).toContain('syntax error in run.mjs');
    expect(status).toContain('does not contain "zzz"');
    const res = await call('broken');
    expect(res.isError).toBe(true);
    expect(res.text).toContain('failed validation');
  });

  it('notifies when a tool is removed or its description changes, not when only its code changes', async () => {
    const paths = tempProject();
    const dir = writeTool(paths.toolsDir, 'echo_it', {});
    const { names, nextChange, changes, call } = await connect(paths);
    expect(await names()).toContain('echo_it');

    writeFileSync(path.join(dir, 'run.mjs'), 'export default async () => "v2";');
    await new Promise((r) => setTimeout(r, 400));
    expect(changes()).toBe(0);
    expect((await call('echo_it')).text).toBe('v2');

    let changed = nextChange();
    writeTool(paths.toolsDir, 'echo_it', { description: 'A new description for the echo tool.' }, { mjs: 'export default async () => "v2";' });
    await changed;

    changed = nextChange();
    rmSync(dir, { recursive: true });
    await changed;
    expect(await names()).toEqual(['trod_status']);
  });

  it('finds a tool called right after it was written, before the watcher fired', async () => {
    const paths = tempProject();
    const trod = new TrodServer({ paths, env: { TROD_ALLOW_EXEC: '1', PATH: process.env.PATH }, debounceMs: 10_000, pollMs: 0 });
    servers.push(trod);
    await trod.start();
    writeTool(paths.toolsDir, 'quick', {}, { mjs: 'export default async () => "fast";' });
    const res = await trod.callTool('quick', {});
    expect(res.isError).toBe(false);
  });

  it('loads the library at startup and lets a session tool shadow it', async () => {
    const paths = tempProject();
    writeTool(paths.libraryDir, 'shared', {}, { mjs: 'export default async () => "library";' });
    const { call, nextChange } = await connect(paths);
    expect((await call('shared')).text).toBe('library');
    const changed = nextChange();
    writeTool(paths.toolsDir, 'shared', { description: 'Session version of the shared tool.' }, { mjs: 'export default async () => "session";' });
    await changed;
    expect((await call('shared')).text).toBe('session');
    expect((await call('trod_status', { name: 'shared' })).text).toMatch(/shadowed/);
  });

  it('refuses to execute without TROD_ALLOW_EXEC=1 and skips examples', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'echo_it', { examples: [{ input: {}, expect: { contains: 'x' } }] });
    const { call, names } = await connect(paths, { PATH: process.env.PATH });
    expect(await names()).toContain('echo_it');
    const res = await call('echo_it');
    expect(res.isError).toBe(true);
    expect(res.text).toContain('TROD_ALLOW_EXEC=1');
    expect((await call('trod_status')).text).toContain('Execution DISABLED');
  });

  it('writes JSONL logs for calls and registry events', async () => {
    const paths = tempProject();
    const { call, nextChange } = await connect(paths);
    const changed = nextChange();
    writeTool(paths.toolsDir, 'echo_it', {});
    await changed;
    await call('echo_it', { x: 'hi' });
    mkdirSync(paths.logsDir, { recursive: true });
    const files = readdirSync(paths.logsDir);
    expect(files).toHaveLength(1);
    const records = readFileSync(path.join(paths.logsDir, files[0]!), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(records.map((r) => r.type)).toEqual(['server', 'tool', 'call']);
    expect(records[1]).toMatchObject({ event: 'added', tool: 'echo_it', source: 'session', sessionId: 's1' });
    expect(records[2]).toMatchObject({ tool: 'echo_it', ok: true, sessionId: 's1', truncated: false });
  });
});
