import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANTIGRAVITY_NOTES_RULE, codexNotesFile, linkAntigravityNotes, linkCodexNotes, notesLinked, trodPaths } from '@trod/server';

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
  /** Set the repository up for Antigravity (.agents/) instead of Claude Code. */
  antigravity?: boolean;
  /** Set the repository up for Codex (.codex/config.toml, .agents/skills/, AGENTS.md) instead of Claude Code. */
  codex?: boolean;
  /** Codex only: approve trod's tool calls without asking (needed for `codex exec`, whose approval policy is never). */
  autoApprove?: boolean;
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
  if (opts.antigravity && opts.codex) throw new Error('trod init: pick one of --antigravity and --codex (run it twice to set up both)');
  if (opts.antigravity) return initAntigravity(opts, root, spec, res);
  if (opts.codex) return initCodex(opts, root, spec, res);

  // How sessions start the server and the CLI.
  let server: { command: string; args: string[] };
  let hookCommand: string;
  if (opts.vendor) {
    // Keep the package layout (bin/, server/, package.json), so the vendored CLI finds its server and version.
    for (const [from, to] of [
      ['server/trod-server.mjs', '.trod/pkg/server/trod-server.mjs'],
      ['server/trod-lib.mjs', '.trod/pkg/server/trod-lib.mjs'],
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

  // .claude/settings.json: approve project MCP servers (cloud sessions cannot answer the prompt) and add the hooks.
  installClaudeHooks(dir, hookCommand, res, { approveMcp: true });

  // The skills: plugins bring them locally, but cloud sessions only see project skills. The plugin's `learn` skill
  // (/trod:learn) becomes the project skill `trod-learn`.
  for (const [from, to] of [['trod', 'trod'], ['learn', 'trod-learn']] as const) {
    const skill = path.join(root, 'skills', from, 'SKILL.md');
    if (existsSync(skill)) writeIfChanged(path.join(dir, '.claude', 'skills', to, 'SKILL.md'), readFileSync(skill, 'utf8').replace(/^name: .*$/m, `name: ${to}`), res, dir);
    else res.notes.push(`skill not found at ${skill}; skipped`);
  }

  addIgnores(dir, res);
  // A build from a checkout is not on npm: the npx entries written above could not fetch it.
  if (version === '0.0.0' && !opts.vendor) res.notes.push('This is an unreleased build (0.0.0), which npx cannot fetch: run `trod init --vendor` instead, to copy the server and CLI into the repository.');
  if (opts.allowExec) res.notes.push('TROD_ALLOW_EXEC=1 is set in .mcp.json: tool code runs outside Claude Code\'s permission prompts. Fine for ephemeral cloud containers; think twice on your own machine.');
  else res.notes.push('Tools do not run until TROD_ALLOW_EXEC=1 is set, and single-file tools are not even registered (re-run with --allow-exec, or set it in your cloud environment\'s variables).');
  return res;
}

/**
 * `trod init --antigravity`: .agents/mcp_config.json (the server, through npx), .agents/skills/trod/SKILL.md (the
 * Antigravity variant of the skill) and, once notes exist, .agents/rules/trod-notes.md. Antigravity starts MCP servers
 * outside the project, so the server finds the workspace through MCP roots (or TROD_PROJECT_DIR).
 */
function initAntigravity(opts: InitOptions, root: string, spec: string, res: InitResult): InitResult {
  const dir = opts.projectDir;
  if (opts.vendor) throw new Error('trod init --antigravity: --vendor is not supported (Antigravity starts MCP servers outside the project, so a path inside it cannot be resolved)');
  const mcpFile = path.join(dir, '.agents', 'mcp_config.json');
  const mcp = readJson(mcpFile);
  const servers = (mcp.mcpServers ?? {}) as Record<string, unknown>;
  // Keep variables the user added (e.g. TROD_PROJECT_DIR); --allow-exec only adds TROD_ALLOW_EXEC.
  const previous = (servers.trod ?? {}) as { env?: Record<string, string> };
  const env = { ...previous.env, ...(opts.allowExec ? { TROD_ALLOW_EXEC: '1' } : {}) };
  servers.trod = { command: 'npx', args: ['-y', spec, 'mcp'], ...(Object.keys(env).length ? { env } : {}) };
  mcp.mcpServers = servers;
  writeIfChanged(mcpFile, JSON.stringify(mcp, null, 2) + '\n', res, dir);
  writeAgentsSkills(root, dir, res);
  // Only notes already linked into CLAUDE.md (verified, or linked on purpose): unverified ones stay unlinked.
  if (existsSync(path.join(dir, '.trod', 'notes.md')) && notesLinked(trodPaths(dir))) {
    const rule = linkAntigravityNotes(trodPaths(dir));
    if (rule === 'written') res.written.push(ANTIGRAVITY_NOTES_RULE);
    else if (rule === 'exists') res.unchanged.push(ANTIGRAVITY_NOTES_RULE);
    else if (typeof rule === 'object') res.notes.push(rule.error);
  }
  addIgnores(dir, res);
  res.notes.push('trod forge and trod learn add .agents/rules/trod-notes.md, which loads .trod/notes.md into every Antigravity conversation.');
  if (opts.allowExec) res.notes.push('TROD_ALLOW_EXEC=1 is set in .agents/mcp_config.json: tool code runs outside the terminal sandbox. Antigravity still asks before each MCP tool call unless you allow it.');
  else res.notes.push('Tools do not run until TROD_ALLOW_EXEC=1 is set, and single-file tools are not even registered (re-run with --allow-exec).');
  return res;
}

type HookGroup = { matcher?: string; hooks: { type: string; command?: string; timeout?: number }[] };
/** Only the commands trod installs: `npx -y trod[@v] hook`, or `node "<...>/trod" hook` (plugin, repo or vendored). */
const isTrodHook = (h: { type?: string; command?: unknown }) => h.type === 'command' && typeof h.command === 'string' && /^(npx -y trod(@\S+)? hook|node "[^"]*\/bin\/trod" hook)$/.test(h.command.trim());

/** The trod hook command already in .claude/settings.json, if any. */
export function installedHookCommand(dir: string): string | undefined {
  const hooks = (readJson(path.join(dir, '.claude', 'settings.json')).hooks ?? {}) as Record<string, HookGroup[]>;
  for (const groups of Object.values(hooks)) for (const g of groups) for (const h of g.hooks ?? []) if (isTrodHook(h)) return h.command as string;
  return undefined;
}

/** The hook events in .claude/settings.json that run trod's hook command. Empty when the file is missing or unreadable. */
export function trodHookEvents(dir: string): string[] {
  try {
    const hooks = (readJson(path.join(dir, '.claude', 'settings.json')).hooks ?? {}) as Record<string, HookGroup[]>;
    return Object.entries(hooks).filter(([, groups]) => Array.isArray(groups) && groups.some((g) => (g.hooks ?? []).some(isTrodHook))).map(([event]) => event);
  } catch {
    return [];
  }
}

/**
 * trod's hooks in .claude/settings.json, replacing earlier trod hooks and keeping everything else: PostToolUse validates
 * tools as they are written; SessionStart and UserPromptSubmit deliver notes when .trod/config.json asks for hooks
 * delivery (and do nothing otherwise).
 */
export function installClaudeHooks(dir: string, hookCommand: string, res: InitResult, opts: { approveMcp?: boolean } = {}): void {
  const settingsFile = path.join(dir, '.claude', 'settings.json');
  const settings = readJson(settingsFile);
  if (opts.approveMcp) settings.enableAllProjectMcpServers = true;
  const hooks = (settings.hooks ?? {}) as Record<string, HookGroup[]>;
  const wanted: [string, string | undefined][] = [['PostToolUse', 'Write|Edit|MultiEdit'], ['SessionStart', undefined], ['UserPromptSubmit', undefined], ['SessionEnd', undefined]];
  for (const [event, matcher] of wanted) {
    const kept = (hooks[event] ?? []).map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isTrodHook(h)) })).filter((g) => g.hooks.length > 0);
    kept.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCommand, timeout: event === 'PostToolUse' ? 60 : 15 }] });
    hooks[event] = kept;
  }
  settings.hooks = hooks;
  writeIfChanged(settingsFile, JSON.stringify(settings, null, 2) + '\n', res, dir);
}

/** The skills Antigravity and Codex both read from .agents/skills/. */
function writeAgentsSkills(root: string, dir: string, res: InitResult): void {
  for (const name of ['trod', 'trod-learn']) {
    const skill = path.join(root, 'agents', 'skills', name, 'SKILL.md');
    if (existsSync(skill)) writeIfChanged(path.join(dir, '.agents', 'skills', name, 'SKILL.md'), readFileSync(skill, 'utf8'), res, dir);
    else res.notes.push(`skill not found at ${skill}; skipped`);
  }
}

const TOML_BEGIN = '# >>> trod (managed by `trod init --codex`; edits inside this block are replaced)';
const TOML_END = '# <<< trod';

/**
 * The trod block of .codex/config.toml: the server (Codex starts project servers in the folder it runs in, and trod
 * finds the project from there) and, unless the file already has a [features] table, the feature that makes tools
 * written mid-session appear in Codex's tool list.
 */
export function codexConfigBlock(spec: string, opts: { allowExec?: boolean; autoApprove?: boolean; env?: Record<string, string>; featuresTable: boolean }): string {
  const q = (v: string) => JSON.stringify(v);
  const env = { ...opts.env, ...(opts.allowExec ? { TROD_ALLOW_EXEC: '1' } : {}) };
  const lines = [TOML_BEGIN, '[mcp_servers.trod]', 'command = "npx"', `args = ["-y", ${q(spec)}, "mcp"]`, 'startup_timeout_sec = 60', 'tool_timeout_sec = 600'];
  // A separate opt-in: without it `codex exec` (approval policy never) refuses every trod call ("MCP tool call requires
  // approval"), with it no call is asked about, trod_eval's arbitrary code included.
  if (opts.autoApprove) lines.push('default_tools_approval_mode = "approve"');
  if (Object.keys(env).length) lines.push('', '[mcp_servers.trod.env]', ...Object.entries(env).map(([k, v]) => `${k} = ${q(v)}`));
  if (!opts.featuresTable) lines.push('', '# Tools written mid-session appear in the tool list (trod_run calls them either way).', '[features]', 'mcp_tool_list_changed = true');
  lines.push(TOML_END);
  return `${lines.join('\n')}\n`;
}

/**
 * `trod init --codex`: .codex/config.toml (the trod server through npx, merged as a marked block), the .agents/
 * skills Codex reads, and a block in AGENTS.md that points Codex at .trod/notes.md. Codex loads a project's
 * .codex/config.toml only once the project is trusted.
 */
function initCodex(opts: InitOptions, root: string, spec: string, res: InitResult): InitResult {
  const dir = opts.projectDir;
  if (opts.vendor) throw new Error('trod init --codex: --vendor is not supported yet (Codex starts project servers in the folder it runs in, which may be a subfolder)');
  const file = path.join(dir, '.codex', 'config.toml');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const begin = current.indexOf(TOML_BEGIN);
  const end = current.indexOf(TOML_END, begin);
  const outside = begin >= 0 && end > begin ? current.slice(0, begin) + current.slice(end + TOML_END.length) : current;
  if (/^\s*\[\s*("?)mcp_servers\1\s*\.\s*("?)trod\2\s*(\.\s*("?)env\4\s*)?\]/m.test(outside)) throw new Error(`trod init --codex: ${path.relative(dir, file)} already defines [mcp_servers.trod] outside trod's block; remove it and run again`);
  // Keep variables the user put in our block (e.g. TROD_PROJECT_DIR).
  const previousEnv: Record<string, string> = {};
  if (begin >= 0 && end > begin) {
    const envPart = current.slice(begin, end).split('[mcp_servers.trod.env]')[1]?.split(/^\s*\[/m)[0] ?? '';
    for (const m of envPart.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/gm)) {
      if (m[3] !== undefined) previousEnv[m[1]] = m[3]; // a literal string: no escapes
      else {
        try {
          previousEnv[m[1]] = JSON.parse(`"${m[2].replace(/\\U([0-9A-Fa-f]{8})/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))}"`);
        } catch {
          previousEnv[m[1]] = m[2];
        }
      }
    }
  }
  const featuresTable = /^\s*\[\s*("?)features\1\s*\]/m.test(outside);
  const block = codexConfigBlock(spec, { allowExec: opts.allowExec, autoApprove: opts.autoApprove, env: previousEnv, featuresTable });
  const next = begin >= 0 && end > begin ? current.slice(0, begin) + block.trimEnd() + current.slice(end + TOML_END.length) : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}${block}`;
  writeIfChanged(file, next, res, dir);
  if (featuresTable && !/^\s*mcp_tool_list_changed\s*=\s*true/m.test(outside)) res.notes.push(`${path.relative(dir, file)} has its own [features] table: add \`mcp_tool_list_changed = true\` to it so tools written mid-session appear in Codex's tool list.`);
  writeAgentsSkills(root, dir, res);
  // Only notes already linked into CLAUDE.md (verified, or linked on purpose): unverified ones stay unlinked.
  if (existsSync(path.join(dir, '.trod', 'notes.md')) && notesLinked(trodPaths(dir))) {
    const notes = linkCodexNotes(trodPaths(dir));
    if (notes === 'written') res.written.push(codexNotesFile(trodPaths(dir)));
    else if (notes === 'exists') res.unchanged.push(codexNotesFile(trodPaths(dir)));
    else if (typeof notes === 'object') res.notes.push(notes.error);
  }
  addIgnores(dir, res);
  res.notes.push('Codex loads .codex/config.toml only in trusted projects: trust this one when Codex asks (or with `codex --cd <repo>` once).');
  res.notes.push('trod forge, trod learn and trod notes --link keep a copy of .trod/notes.md in a block of AGENTS.md (Codex cannot import a file).');
  res.notes.push('Run Codex from the repository root or a folder inside it; trod finds the project by walking up to the nearest .trod/ folder.');
  if (opts.allowExec) res.notes.push('TROD_ALLOW_EXEC=1 is set in .codex/config.toml: tool code runs outside Codex\'s sandbox. Codex still applies its approval settings to MCP tool calls.');
  else res.notes.push('Tools do not run until TROD_ALLOW_EXEC=1 is set, and single-file tools are not even registered (re-run with --allow-exec).');
  if (opts.autoApprove) res.notes.push('default_tools_approval_mode = "approve" is set for trod: Codex runs every trod tool, trod_eval\'s arbitrary code included, without asking.');
  else res.notes.push('codex exec (approval policy never) refuses trod\'s tool calls until you approve them: rerun with --auto-approve to approve them all.');
  res.notes.push('trod forge and trod learn still run Claude Code (the `claude` CLI) as their engine; trod learn also reads your Codex sessions.');
  return res;
}

/** Session tools and logs are per session; the library and notes are committed. */
function addIgnores(dir: string, res: InitResult): void {
  const ignoreFile = path.join(dir, '.gitignore');
  const ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
  const missing = ['.trod/tools/', '.trod/logs/'].filter((l) => !ignore.split(/\r?\n/).includes(l));
  if (missing.length) writeIfChanged(ignoreFile, `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}# trod: per-session tools and logs (the library, notes and evidence ledger are committed)\n${missing.join('\n')}\n`, res, dir);
  else res.unchanged.push('.gitignore');
}
