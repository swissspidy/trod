import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TrodPaths } from './types.ts';
import { loadToolFolder } from './validate.ts';

export interface PromoteResult {
  name: string;
  from: string;
  to: string;
  replaced: boolean;
}

/**
 * Moves .trod/tools/<name> to .trod/library/<name> (replacing an older library version) and
 * stamps provenance.promotedAt. The tool must pass the static checks first.
 */
export async function promoteTool(paths: TrodPaths, name: string, now = new Date()): Promise<PromoteResult> {
  const from = path.join(paths.toolsDir, name);
  const to = path.join(paths.libraryDir, name);
  if (!existsSync(from)) throw new Error(`no session tool "${name}" in ${path.relative(paths.projectDir, paths.toolsDir) || paths.toolsDir}`);
  const loaded = await loadToolFolder(from, 'session');
  if (!loaded.ok) throw new Error(`"${name}" is invalid and cannot be promoted:\n- ${loaded.errors.join('\n- ')}`);

  mkdirSync(paths.libraryDir, { recursive: true });
  const replaced = existsSync(to);
  // Staged outside the library so the watcher never sees a half-copied folder.
  const staging = path.join(paths.trodDir, `.promote-${name}-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  cpSync(from, staging, { recursive: true });
  const jsonPath = path.join(staging, 'tool.json');
  const def = JSON.parse(readFileSync(jsonPath, 'utf8'));
  def.provenance = { ...def.provenance, promotedAt: now.toISOString() };
  writeFileSync(jsonPath, JSON.stringify(def, null, 2) + '\n');
  if (replaced) rmSync(to, { recursive: true, force: true });
  renameSync(staging, to);
  rmSync(from, { recursive: true, force: true });
  return { name, from, to, replaced };
}
