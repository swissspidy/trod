import path from 'node:path';
import type { TrodPaths } from './types.ts';

/** The project directory: TROD_PROJECT_DIR, then CLAUDE_PROJECT_DIR, then the working directory. */
export function resolveProjectDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return path.resolve(env.TROD_PROJECT_DIR || env.CLAUDE_PROJECT_DIR || cwd);
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
