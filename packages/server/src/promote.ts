import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TrodPaths } from './types.ts';
import { runToolExamples } from './registry.ts';
import { loadToolEntry } from './validate.ts';

export interface PromoteResult {
  name: string;
  from: string;
  to: string;
  replaced: boolean;
  examplesPassed: number;
}

/**
 * Moves .trod/tools/<name> to .trod/library/<name> (replacing an older library version) and
 * stamps provenance.promotedAt. The tool must pass the static checks first.
 */
export async function promoteTool(
  paths: TrodPaths,
  name: string,
  now = new Date(),
  opts: { execAllowed?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<PromoteResult> {
  const execAllowed = opts.execAllowed ?? (opts.env ?? process.env).TROD_ALLOW_EXEC === '1';
  const file = path.join(paths.toolsDir, `${name}.mjs`);
  const single = !existsSync(path.join(paths.toolsDir, name)) && existsSync(file);
  const from = single ? file : path.join(paths.toolsDir, name);
  const to = path.join(paths.libraryDir, path.basename(from));
  if (!existsSync(from)) throw new Error(`no session tool "${name}" in ${path.relative(paths.projectDir, paths.toolsDir) || paths.toolsDir}`);
  const loaded = await loadToolEntry(from, 'session', { execAllowed, env: opts.env });
  if (loaded.ok) await runToolExamples(loaded, { projectDir: paths.projectDir, execAllowed, env: opts.env });
  if (!loaded.ok) throw new Error(`"${name}" is invalid and cannot be promoted:\n- ${loaded.errors.join('\n- ')}`);

  mkdirSync(paths.libraryDir, { recursive: true });
  const replaced = existsSync(to);
  // Staged outside the library so the watcher never sees a half-copied tool.
  const staging = path.join(paths.trodDir, `.promote-${name}-${process.pid}${single ? '.mjs' : ''}`);
  rmSync(staging, { recursive: true, force: true });
  cpSync(from, staging, { recursive: true });
  if (single) {
    writeFileSync(staging, `${readFileSync(staging, 'utf8').trimEnd()}\n// trod: promoted ${now.toISOString()}\n`);
  } else {
    const jsonPath = path.join(staging, 'tool.json');
    const def = JSON.parse(readFileSync(jsonPath, 'utf8'));
    def.provenance = { ...def.provenance, promotedAt: now.toISOString() };
    writeFileSync(jsonPath, JSON.stringify(def, null, 2) + '\n');
  }
  if (replaced) rmSync(to, { recursive: true, force: true });
  renameSync(staging, to);
  rmSync(from, { recursive: true, force: true });
  return { name, from, to, replaced, examplesPassed: loaded.examples?.passed ?? 0 };
}
