import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `trod init`: set a repository up so that every Claude Code session in it, local or cloud (including sessions
 * started from the mobile app), gets trod without installing a plugin. Cloud sessions do not install plugins
 * declared in project settings (docs/spike.md), but they do start project MCP servers from a committed .mcp.json.
 *
 * Writes (merging with what is there): .mcp.json (the trod server), .claude/settings.json (approve project MCP
 * servers, the validation hook) and .claude/skills/trod/SKILL.md (the skill). With --vendor, the bundled server and
 * CLI are copied into .trod/pkg/ so nothing is fetched at session start; otherwise they run through npx.
 */
export interface InitOptions {
  projectDir: string;
  /** The installed package's root (holds server/, bin/, skills/). */
  packageRoot?: string;
  /** Copy the server and CLI into the repository instead of running them through npx. */
  vendor?: boolean;
  /** Set TROD_ALLOW_EXEC=1 for the server: needed for tools to run; meant for ephemeral (cloud) containers. */
  allowExec?: boolean;
}

export interface InitResult {
  written: string[];
  unchanged: string[];
  notes: string[];
}

export function defaultPackageRoot(): string {
  // Bundled CLI: <root>/bin/trod.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function packageVersion(root: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, 'utf8').trim();
  const value: unknown = raw ? JSON.parse(raw) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file} must contain a JSON object`);
  return value as Record<string, unknown>;
}

function writeIfChanged(file: string, content: string, res: InitResult, projectDir: string): void {
  const rel = path.relative(projectDir, file);
  if (existsSync(file) && readFileSync(file, 'utf8') === content) {
    res.unchanged.push(rel);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  res.written.push(rel);
}

export function init(opts: InitOptions): InitResult {
  const root = opts.packageRoot ?? defaultPackageRoot();
  const dir = opts.projectDir;
  const res: InitResult = { written: [], unchanged: [], notes: [] };
  const version = packageVersion(root);
  const spec = version ? `trod@${version}` : 'trod';

  // How sessions start the server and the CLI.
  let server: { command: string; args: string[] };
  let hookCommand: string;
  if (opts.vendor) {
    // Keep the package layout (bin/, server/, package.json), so the vendored CLI finds its server and version.
    for (const [from, to] of [
      ['server/trod-server.mjs', '.trod/pkg/server/trod-server.mjs'],
      ['bin/trod', '.trod/pkg/bin/trod'],
      ['package.json', '.trod/pkg/package.json'],
    ] as const) {
      const src = path.join(root, from);
      if (!existsSync(src)) throw new Error(`trod init --vendor: ${src} not found`);
      const dest = path.join(dir, to);
      const before = existsSync(dest) ? readFileSync(dest) : undefined;
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      (before?.equals(readFileSync(dest)) ? res.unchanged : res.written).push(to);
    }
    server = { command: 'node', args: ['.trod/pkg/server/trod-server.mjs'] };
    hookCommand = 'node "$CLAUDE_PROJECT_DIR/.trod/pkg/bin/trod" hook';
    res.notes.push('Vendored the server and CLI into .trod/pkg/: commit them, and re-run `trod init --vendor` to update.');
  } else {
    server = { command: 'npx', args: ['-y', spec, 'mcp'] };
    hookCommand = `npx -y ${spec} hook`;
  }

  // .mcp.json
  const mcpFile = path.join(dir, '.mcp.json');
  const mcp = readJson(mcpFile);
  const servers = (mcp.mcpServers ?? {}) as Record<string, unknown>;
  servers.trod = { ...server, ...(opts.allowExec ? { env: { TROD_ALLOW_EXEC: '1' } } : {}) };
  mcp.mcpServers = servers;
  writeIfChanged(mcpFile, JSON.stringify(mcp, null, 2) + '\n', res, dir);

  // .claude/settings.json: approve project MCP servers (cloud sessions cannot answer the prompt) and add the hook.
  const settingsFile = path.join(dir, '.claude', 'settings.json');
  const settings = readJson(settingsFile);
  settings.enableAllProjectMcpServers = true;
  type HookGroup = { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] };
  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  // Drop only earlier trod hooks (keeping any other hooks in their groups), then add the current one.
  const isTrodHook = (h: { command: string }) => /\btrod\b.*\bhook$/.test(h.command);
  const post = (hooks.PostToolUse ?? []).map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isTrodHook(h)) })).filter((g) => g.hooks.length > 0);
  post.push({ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: hookCommand, timeout: 60 }] });
  hooks.PostToolUse = post;
  settings.hooks = hooks;
  writeIfChanged(settingsFile, JSON.stringify(settings, null, 2) + '\n', res, dir);

  // The skill: plugins bring it locally, but cloud sessions only see project skills.
  const skill = path.join(root, 'skills', 'trod', 'SKILL.md');
  if (existsSync(skill)) writeIfChanged(path.join(dir, '.claude', 'skills', 'trod', 'SKILL.md'), readFileSync(skill, 'utf8'), res, dir);
  else res.notes.push(`skill not found at ${skill}; skipped`);

  // Session tools and logs are per session; the library and notes are committed.
  const ignoreFile = path.join(dir, '.gitignore');
  const ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
  const missing = ['.trod/tools/', '.trod/logs/'].filter((l) => !ignore.split(/\r?\n/).includes(l));
  if (missing.length) writeIfChanged(ignoreFile, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}# trod: per-session tools and logs (the library in .trod/library is committed)\n${missing.join('\n')}\n`, res, dir);
  else res.unchanged.push('.gitignore');

  if (opts.allowExec) res.notes.push('TROD_ALLOW_EXEC=1 is set in .mcp.json: tool code runs outside Claude Code\'s permission prompts. Fine for ephemeral cloud containers; think twice on your own machine.');
  else res.notes.push('Tools are registered but not executed until TROD_ALLOW_EXEC=1 is set (re-run with --allow-exec, or set it in your cloud environment\'s variables).');
  return res;
}
