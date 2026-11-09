import { existsSync } from 'node:fs';
import path from 'node:path';
import type { TrodPaths } from './types.ts';

/**
 * The project directory: TROD_PROJECT_DIR, then CLAUDE_PROJECT_DIR, then the working directory. A client started in a
 * subfolder (Codex, a terminal) still finds the project: the nearest folder up to the git root that has a .trod/ or a
 * .codex/ (a project set up with `trod init --codex` before it has any notes or tools) wins.
 */
export function resolveProjectDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const configured = env.TROD_PROJECT_DIR || env.CLAUDE_PROJECT_DIR;
  if (configured) return path.resolve(configured);
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.trod')) || existsSync(path.join(dir, '.codex'))) return dir;
    if (existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) return start;
  }
}

export function trodPaths(projectDir: string): TrodPaths {
  const trodDir = path.join(projectDir, '.trod');
  return {
    projectDir,
    trodDir,
    toolsDir: path.join(trodDir, 'tools'),
    libraryDir: path.join(trodDir, 'library'),
    logsDir: path.join(trodDir, 'logs'),
  };
}
