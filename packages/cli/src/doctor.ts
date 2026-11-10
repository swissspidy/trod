import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { listToolEntries, notesLinked, notesPaths, readChecks, readTrodConfig, NOTES_MAX_CHARS, type TrodPaths } from '@trod/server';
import { autoLearnConfig } from './autolearn.ts';
import { trodHookEvents } from './init.ts';
import { codexTranscripts, findTranscripts, pickSessions, readLearnState, readLedger, summarizeLedger, transcriptDir } from './learn.ts';

/**
 * `trod doctor`: one screen that answers "is this set up, what does trod know here, and what do I do next?".
 * It reads files and asks the Claude Code CLI for its version; it changes nothing and runs no tool.
 */

export type Level = 'ok' | 'info' | 'warn' | 'bad';

export interface Finding {
  level: Level;
  text: string;
}

export interface DoctorReport {
  projectDir: string;
  setup: Finding[];
  knowledge: Finding[];
  sessions: Finding[];
  /** The one thing to do next, as a command where there is one. */
  next: string;
  /** True when something is broken (a "bad" finding): the command exits 1. */
  broken: boolean;
}

const HOOK_EVENTS = ['PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SessionEnd'];

/**
 * Whether sessions in this project may run trod tools: TROD_ALLOW_EXEC=1 in the environment, or in the server entry
 * of the project's MCP config (Claude Code, Antigravity or Codex).
 */
export function execEnabled(projectDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.TROD_ALLOW_EXEC === '1') return true;
  const entry = (file: string) => (readJson(file)?.mcpServers as Record<string, { env?: Record<string, string> }> | undefined)?.trod;
  if (entry(path.join(projectDir, '.mcp.json'))?.env?.TROD_ALLOW_EXEC === '1') return true;
  if (entry(path.join(projectDir, '.agents', 'mcp_config.json'))?.env?.TROD_ALLOW_EXEC === '1') return true;
  const codex = path.join(projectDir, '.codex', 'config.toml');
  return existsSync(codex) && /^\s*TROD_ALLOW_EXEC\s*=\s*"1"/m.test(readFileSync(codex, 'utf8'));
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export interface DoctorOptions {
  env?: NodeJS.ProcessEnv;
  /** Returns the Claude Code CLI's version line, or undefined when it cannot be run (injected in tests). */
  claudeVersion?: () => string | undefined;
  /** Session transcripts of this project (injected in tests). */
  transcripts?: () => string[];
}

function defaultClaudeVersion(env: NodeJS.ProcessEnv): string | undefined {
  const r = spawnSync(env.TROD_CLAUDE_BIN ?? 'claude', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : undefined;
}

export function doctor(paths: TrodPaths, opts: DoctorOptions = {}): DoctorReport {
  const env = opts.env ?? process.env;
  const dir = paths.projectDir;
  const setup: Finding[] = [];
  const knowledge: Finding[] = [];
  const sessions: Finding[] = [];

  // --- Setup
  const claude = (opts.claudeVersion ?? (() => defaultClaudeVersion(env)))();
  setup.push(claude ? { level: 'ok', text: `Claude Code CLI: ${claude}` } : { level: 'warn', text: 'Claude Code CLI not found (`claude`): trod learn, forge and tune need it; the MCP server and hooks do not' });

  const mcp = readJson(path.join(dir, '.mcp.json'));
  const server = (mcp?.mcpServers as Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> | undefined)?.trod;
  const antigravity = (readJson(path.join(dir, '.agents', 'mcp_config.json'))?.mcpServers as Record<string, unknown> | undefined)?.trod;
  const codexFile = path.join(dir, '.codex', 'config.toml');
  const codex = existsSync(codexFile) && /^\s*\[\s*mcp_servers\s*\.\s*trod\s*\]/m.test(readFileSync(codexFile, 'utf8'));
  const clients = [server && 'Claude Code (.mcp.json)', antigravity && 'Antigravity (.agents/mcp_config.json)', codex && 'Codex (.codex/config.toml)'].filter(Boolean);
  const installed = clients.length > 0;
  setup.push(
    installed
      ? { level: 'ok', text: `MCP server set up for ${clients.join(', ')}` }
      : { level: 'info', text: 'No trod server in this repository\'s config (fine if you use the Claude Code plugin; otherwise run `trod init`)' },
  );

  const settingsFile = path.join(dir, '.claude', 'settings.json');
  const hooks = trodHookEvents(dir);
  const missing = HOOK_EVENTS.filter((e) => !hooks.includes(e));
  if (existsSync(settingsFile) && !readJson(settingsFile)) setup.push({ level: 'bad', text: '.claude/settings.json is not valid JSON: Claude Code ignores it, hooks included' });
  else if (!hooks.length) setup.push({ level: 'info', text: 'No trod hooks in .claude/settings.json (the plugin brings its own; `trod init` installs them for every session, cloud ones included)' });
  else if (missing.length) setup.push({ level: 'warn', text: `Hooks: ${hooks.join(', ')} installed, ${missing.join(', ')} missing (an older trod wrote them: run \`trod init\` again)` });
  else setup.push({ level: 'ok', text: 'Hooks installed: tool validation, notes delivery, session counting' });

  const execOn = execEnabled(dir, env);
  setup.push(
    execOn
      ? { level: 'ok', text: 'Tools may run (TROD_ALLOW_EXEC=1): their code runs outside the client\'s permission prompts' }
      : { level: 'info', text: 'Tools do not run in sessions (TROD_ALLOW_EXEC is not set). Notes work without it; for tools, see `trod help init`' },
  );

  // --- What trod knows here
  const np = notesPaths(paths);
  const hasNotes = existsSync(np.notes);
  const linked = hasNotes && notesLinked(paths);
  const config = readTrodConfig(paths);
  if (hasNotes) {
    const chars = readFileSync(np.notes, 'utf8').length;
    const { checks, errors } = readChecks(np.checks);
    const how = linked ? (config.delivery === 'hooks' ? `delivered by trod's hooks${config.holdout ? ` (${Math.round(config.holdout * 100)}% holdout)` : ''}` : 'linked from CLAUDE.md') : 'NOT linked: sessions do not load them';
    knowledge.push({ level: linked ? (chars > NOTES_MAX_CHARS ? 'warn' : 'ok') : 'warn', text: `Notes: ${chars.toLocaleString('en-US')} chars${chars > NOTES_MAX_CHARS ? ` (over ${NOTES_MAX_CHARS}: every session pays for them, trim them)` : ''}, ${how}` });
    if (errors.length) knowledge.push({ level: 'bad', text: `Note checks: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}` });
    else knowledge.push({ level: 'info', text: checks.length ? `Note checks: ${checks.length} (run them with \`trod verify\`)` : 'Note checks: none (the notes rest on the sessions they were learned from)' });
  } else knowledge.push({ level: 'info', text: 'No notes yet (.trod/notes.md)' });

  const wikiDir = path.join(paths.trodDir, 'wiki');
  const pages = existsSync(wikiDir) ? readdirSync(wikiDir).filter((f) => f.endsWith('.md')).length : 0;
  if (pages) knowledge.push({ level: 'ok', text: `Wiki: ${pages} page(s) for particular kinds of task` });
  const library = listToolEntries(paths.libraryDir).length;
  const sessionTools = listToolEntries(paths.toolsDir).length;
  if (library && !execOn) knowledge.push({ level: 'warn', text: `Tools: ${library} in the library, but sessions cannot run them (execution is off; \`trod init --allow-exec\` turns it on, see \`trod help init\`)` });
  else if (library || sessionTools) knowledge.push({ level: library ? 'ok' : 'info', text: `Tools: ${library} in the library${sessionTools ? `, ${sessionTools} session tool(s) not promoted` : ''}` });
  const ledger = readLedger(dir);
  if (ledger.exists) knowledge.push(ledger.errors.length ? { level: 'bad', text: `Evidence ledger: ${ledger.errors[0]}` } : { level: 'ok', text: `Evidence: ${summarizeLedger(ledger.rules)}` });

  // --- Sessions
  const files = (opts.transcripts ?? (() => findTranscripts([transcriptDir(dir), ...codexTranscripts(dir)])))();
  const state = readLearnState(dir);
  // The same selection trod learn makes (no subagent side-chains, none of trod's own sessions), capped to stay quick.
  const CAP = 200;
  const { picked, skipped } = pickSessions(files, { seen: new Set(state.sessions), limit: CAP });
  const pending = picked.length;
  const last = state.lastRun ? ` (last learning run: ${state.lastRun.slice(0, 10)})` : '';
  sessions.push({
    level: 'info',
    text: pending || skipped ? `${pending}${pending === CAP ? '+' : ''} session(s) to learn from, ${skipped} already learned from${last}` : 'No sessions of this project to learn from yet (Claude Code and Codex keep transcripts as you work)',
  });
  const auto = autoLearnConfig(paths);
  sessions.push({ level: 'info', text: auto ? `Learning by itself: after every ${auto.after} session(s)` : 'Learning by itself: off (`trod learn --auto 10` turns it on)' });

  // --- The next step
  const broken = [...setup, ...knowledge, ...sessions].some((f) => f.level === 'bad');
  let next: string;
  if (broken) next = 'Fix what is marked ✗ above first.';
  else if (!installed && !hooks.length && !hasNotes) next = '`trod init` sets this repository up; then `trod doctor` again.';
  else if (hasNotes && !linked) next = '`trod notes --link` runs the notes\' checks and links them, so sessions load them.';
  else if (!hasNotes && pending > 0) next = claude ? `\`trod learn\` writes notes from your ${pending} session(s) (\`trod learn --dry-run\` shows them first).` : 'Install Claude Code, then `trod learn` writes notes from your sessions.';
  else if (!hasNotes) next = '`trod forge --brief @env.md` studies an API, tool or workflow you describe; or work in Claude Code for a while, then `trod learn`.';
  else if (pending >= 5) next = `\`trod learn\` checks the notes against ${pending} new session(s) and adds what they teach.`;
  else next = 'Nothing to do. `trod report` shows whether the notes help; `trod verify` in CI catches notes that went stale.';
  return { projectDir: dir, setup, knowledge, sessions, next, broken };
}

const MARK: Record<Level, string> = { ok: '✓', info: '·', warn: '!', bad: '✗' };

export function formatDoctor(r: DoctorReport, version: string): string {
  const section = (title: string, items: Finding[]) => [title, ...items.map((f) => `  ${MARK[f.level]} ${f.text}`)];
  return [`trod ${version} in ${r.projectDir}`, '', ...section('Setup', r.setup), '', ...section('What trod knows here', r.knowledge), '', ...section('Sessions', r.sessions), '', `Next: ${r.next}`].join('\n');
}
