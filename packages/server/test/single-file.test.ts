import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { promoteTool } from '../src/promote.ts';
import { TrodServer } from '../src/server.ts';
import { loadToolFile } from '../src/validate.ts';
import { tempProject, writeTool } from './helpers.ts';

const env = { TROD_ALLOW_EXEC: '1', PATH: process.env.PATH };
const SRC = `export const meta = {
  description: 'Doubles a number and returns the result.',
  whenToUse: 'When you need to double something.',
  inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] },
  examples: [{ input: { n: 2 }, expect: { equals: 4 } }],
};
export default async ({ n }) => n * 2;
`;

const servers: TrodServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe('single-file tools', () => {
  it('loads meta and runs like a folder tool', async () => {
    const paths = tempProject();
    const file = path.join(paths.toolsDir, 'double_it.mjs');
    writeTool(paths.toolsDir, 'placeholder', {}); // make sure the dir exists
    writeFileSync(file, SRC);
    const t = await loadToolFile(file, 'session', { execAllowed: true, env });
    expect(t.errors).toEqual([]);
    expect(t.def?.name).toBe('double_it');

    const trod = new TrodServer({ paths, env, pollMs: 0 });
    servers.push(trod);
    await trod.start();
    expect(trod.listTools().map((x) => x.name)).toContain('double_it');
    const res = await trod.callTool('double_it', { n: 21 });
    expect(res.content).toEqual([{ type: 'text', text: '42' }]);
    expect(trod.registry.active.get('double_it')?.examples).toMatchObject({ passed: 1, failed: 0 });
  });

  it('explains a missing meta export or exec being disabled', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'placeholder', {});
    const file = path.join(paths.toolsDir, 'no_meta.mjs');
    writeFileSync(file, 'export default async () => 1;');
    expect((await loadToolFile(file, 'session', { execAllowed: true, env })).errors.join()).toMatch(/must export meta/);
    expect((await loadToolFile(file, 'session', { execAllowed: false, env })).errors.join()).toMatch(/TROD_ALLOW_EXEC/);
  });

  it('rejects a file that clashes with a folder of the same name', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'double_it', {});
    writeFileSync(path.join(paths.toolsDir, 'double_it.mjs'), SRC);
    const trod = new TrodServer({ paths, env, pollMs: 0 });
    servers.push(trod);
    await trod.start();
    expect(trod.status()).toMatch(/both double_it\/ and double_it.mjs exist/);
  });

  it('promotes with verified examples, and library tools say they can be trusted', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'placeholder', {});
    writeFileSync(path.join(paths.toolsDir, 'double_it.mjs'), SRC);
    const res = await promoteTool(paths, 'double_it', new Date('2026-11-07T00:00:00Z'), { execAllowed: true, env });
    expect(res.examplesPassed).toBe(1);
    expect(existsSync(path.join(paths.libraryDir, 'double_it.mjs'))).toBe(true);
    expect(readFileSync(path.join(paths.libraryDir, 'double_it.mjs'), 'utf8')).toMatch(/trod: promoted 2026-11-07/);

    const trod = new TrodServer({ paths, env, pollMs: 0 });
    servers.push(trod);
    await trod.start();
    const desc = trod.listTools().find((t) => t.name === 'double_it')?.description;
    expect(desc).toMatch(/Library tool.*1 example\(s\) passed.*no need to read its source/s);
  });

  it('refuses to promote a tool whose examples fail', async () => {
    const paths = tempProject();
    writeTool(paths.toolsDir, 'placeholder', {});
    writeFileSync(path.join(paths.toolsDir, 'double_it.mjs'), SRC.replace('n * 2', 'n * 3'));
    await expect(promoteTool(paths, 'double_it', new Date(), { execAllowed: true, env })).rejects.toThrow(/does not equal/);
  });
});
