import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trodPaths } from '../src/paths.ts';
import type { TrodPaths } from '../src/types.ts';

export function tempProject(): TrodPaths {
  const dir = mkdtempSync(path.join(tmpdir(), 'trod-test-'));
  return trodPaths(dir);
}

export function writeTool(
  root: string,
  name: string,
  def: Record<string, unknown> | string,
  run: { mjs?: string; sh?: string } = { mjs: 'export default async (input) => ({ echo: input });' },
): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const json =
    typeof def === 'string'
      ? def
      : JSON.stringify({
          name,
          description: `Test tool ${name} that echoes its input`,
          whenToUse: 'In tests.',
          inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          provenance: { reason: 'test' },
          ...def,
        });
  writeFileSync(path.join(dir, 'tool.json'), json);
  if (run.mjs !== undefined) writeFileSync(path.join(dir, 'run.mjs'), run.mjs);
  if (run.sh !== undefined) writeFileSync(path.join(dir, 'run.sh'), run.sh);
  return dir;
}
