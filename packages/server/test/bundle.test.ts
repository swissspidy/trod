import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { writeTool } from './helpers.ts';

const bundle = path.resolve(import.meta.dirname, '../../../plugin/server/trod-server.mjs');

// The committed bundle is what Claude Code starts (plugin/.mcp.json and the root .mcp.json).
describe.skipIf(!existsSync(bundle))('bundled server over stdio', () => {
  it('lists, registers and runs a tool', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trod-bundle-'));
    writeTool(path.join(dir, '.trod', 'library'), 'lib_tool', {}, { mjs: 'export default async ({ x }) => `lib:${x}`;' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bundle],
      cwd: dir,
      env: { PATH: process.env.PATH ?? '', TROD_ALLOW_EXEC: '1', TROD_PROJECT_DIR: dir },
    });
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(transport);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(['trod_status', 'lib_tool']);
      const res = await client.callTool({ name: 'lib_tool', arguments: { x: 'ok' } });
      expect((res.content as { text: string }[])[0]!.text).toBe('lib:ok');
    } finally {
      await client.close();
    }
  });
});
