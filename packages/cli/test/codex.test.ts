import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkCodexNotes, resolveProjectDir, trodPaths } from '@trod/server';
import { describe, expect, it } from 'vitest';
import { codexTranscripts, digestTranscript } from '../src/learn.ts';
import { init, packageVersion } from '../src/init.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PLUGIN = path.join(ROOT, 'plugin');
const tmp = () => mkdtempSync(path.join(tmpdir(), 'trod-codex-'));
const read = (...p: string[]) => readFileSync(path.join(...p), 'utf8');

describe('trod init --codex', () => {
  it('writes the server and the feature into .codex/config.toml, the .agents skills and the ignores, nothing for Claude Code', () => {
    const dir = tmp();
    const res = init({ projectDir: dir, packageRoot: PLUGIN, codex: true, allowExec: true });
    const toml = read(dir, '.codex', 'config.toml');
    expect(toml).toContain('[mcp_servers.trod]\ncommand = "npx"\n');
    expect(toml).toContain(`args = ["-y", "trod@${packageVersion(PLUGIN)}", "mcp"]`);
    expect(toml).toContain('[mcp_servers.trod.env]\nTROD_ALLOW_EXEC = "1"');
    expect(toml).toContain('[features]\nmcp_tool_list_changed = true');
    expect(read(dir, '.agents', 'skills', 'trod', 'SKILL.md')).toBe(read(PLUGIN, 'agents', 'skills', 'trod', 'SKILL.md'));
    expect(read(dir, '.agents', 'skills', 'trod-learn', 'SKILL.md')).toBe(read(PLUGIN, 'agents', 'skills', 'trod-learn', 'SKILL.md'));
    expect(read(dir, '.gitignore')).toContain('.trod/tools/');
    expect(existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'AGENTS.md'))).toBe(false); // no notes yet
    expect(res.notes.join(' ')).toContain('trusted');
  });

  it('keeps the rest of config.toml, uses an existing [features] table, keeps added variables and is idempotent', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.codex'));
    const before = 'model = "gpt-6.1"\n\n[features]\nweb_search = true\n\n[mcp_servers.other]\ncommand = "x"\n';
    writeFileSync(path.join(dir, '.codex', 'config.toml'), before);
    const first = init({ projectDir: dir, packageRoot: PLUGIN, codex: true });
    let toml = read(dir, '.codex', 'config.toml');
    expect(toml.startsWith(before)).toBe(true);
    expect(toml.match(/^\[features\]/gm)).toHaveLength(1); // a second [features] table would be invalid TOML
    expect(first.notes.join(' ')).toContain('mcp_tool_list_changed = true');
    // A variable the user added inside trod's block survives a rerun; --allow-exec adds one.
    writeFileSync(path.join(dir, '.codex', 'config.toml'), toml.replace('tool_timeout_sec = 600', 'tool_timeout_sec = 600\n\n[mcp_servers.trod.env]\nTROD_PROJECT_DIR = "/work/app"'));
    init({ projectDir: dir, packageRoot: PLUGIN, codex: true, allowExec: true });
    toml = read(dir, '.codex', 'config.toml');
    expect(toml).toContain('TROD_PROJECT_DIR = "/work/app"\nTROD_ALLOW_EXEC = "1"');
    expect(toml.match(/^\[mcp_servers\.trod\]/gm)).toHaveLength(1);
    expect(init({ projectDir: dir, packageRoot: PLUGIN, codex: true, allowExec: true }).written).toEqual([]);
  });

  it('refuses a [mcp_servers.trod] it does not manage, and --vendor or two clients at once', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.codex'));
    writeFileSync(path.join(dir, '.codex', 'config.toml'), '[mcp_servers.trod]\ncommand = "node"\n');
    expect(() => init({ projectDir: dir, packageRoot: PLUGIN, codex: true })).toThrow(/outside trod's block/);
    expect(() => init({ projectDir: tmp(), packageRoot: PLUGIN, codex: true, vendor: true })).toThrow(/--vendor/);
    expect(() => init({ projectDir: tmp(), packageRoot: PLUGIN, codex: true, antigravity: true })).toThrow(/pick one/);
  });

  it('points AGENTS.md at the notes once they exist, keeping what AGENTS.md already says', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- a rule\n');
    writeFileSync(path.join(dir, 'AGENTS.md'), '# Agents\n\nUse pnpm.');
    // Not linked into CLAUDE.md yet (unverified): init leaves them alone.
    expect(init({ projectDir: dir, packageRoot: PLUGIN, codex: true }).written).not.toContain('AGENTS.md');
    writeFileSync(path.join(dir, 'CLAUDE.md'), '@.trod/notes.md\n');
    const res = init({ projectDir: dir, packageRoot: PLUGIN, codex: true });
    expect(res.written).toContain('AGENTS.md');
    const agents = read(dir, 'AGENTS.md');
    expect(agents.startsWith('# Agents\n\nUse pnpm.\n\n<!-- trod notes -->')).toBe(true);
    expect(agents).toContain('read `.trod/notes.md`');
    expect(init({ projectDir: dir, packageRoot: PLUGIN, codex: true }).unchanged).toContain('AGENTS.md');
    expect(read(dir, 'AGENTS.md').match(/trod notes -->/g)).toHaveLength(1);
  });
});

describe('notes for Codex', () => {
  it('writes the AGENTS.md block only in projects with a .codex/ folder', () => {
    const dir = tmp();
    expect(linkCodexNotes(trodPaths(dir))).toBe('skipped');
    mkdirSync(path.join(dir, '.codex'));
    expect(linkCodexNotes(trodPaths(dir))).toBe('written');
    expect(linkCodexNotes(trodPaths(dir))).toBe('exists');
  });
});

describe('Codex notes, review fixes', () => {
  it('writes to AGENTS.override.md when Codex would read that, and links plugin-only projects that have an AGENTS.md', () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'AGENTS.md'), '# Agents\n');
    expect(linkCodexNotes(trodPaths(dir))).toBe('written'); // no .codex/: the plugin-only case
    expect(read(dir, 'AGENTS.md')).toContain('<!-- trod notes -->');
    const other = tmp();
    mkdirSync(path.join(other, '.codex'));
    writeFileSync(path.join(other, 'AGENTS.override.md'), '# Override\n');
    expect(linkCodexNotes(trodPaths(other))).toBe('written');
    expect(read(other, 'AGENTS.override.md')).toContain('<!-- trod notes -->');
    expect(existsSync(path.join(other, 'AGENTS.md'))).toBe(false);
  });

  it('recognizes quoted TOML table names and keeps literal-string variables', () => {
    const dir = tmp();
    mkdirSync(path.join(dir, '.codex'));
    writeFileSync(path.join(dir, '.codex', 'config.toml'), '["features"]\nweb_search = true\n');
    init({ projectDir: dir, packageRoot: PLUGIN, codex: true });
    expect(read(dir, '.codex', 'config.toml').match(/features/g)).toHaveLength(1);
    writeFileSync(path.join(dir, '.codex', 'config.toml'), '[mcp_servers."trod"]\ncommand = "x"\n');
    expect(() => init({ projectDir: dir, packageRoot: PLUGIN, codex: true })).toThrow(/outside trod's block/);
    const env = tmp();
    init({ projectDir: env, packageRoot: PLUGIN, codex: true });
    const file = path.join(env, '.codex', 'config.toml');
    writeFileSync(file, read(file).replace('tool_timeout_sec = 600', "tool_timeout_sec = 600\n\n[mcp_servers.trod.env]\nTROD_PROJECT_DIR = 'C:\\work\\app'\nEMOJI = \"\\U0001F600\""));
    init({ projectDir: env, packageRoot: PLUGIN, codex: true });
    expect(read(file)).toContain('TROD_PROJECT_DIR = "C:\\\\work\\\\app"');
    expect(read(file)).toContain('EMOJI = "\u{1F600}"');
  });

  it('keeps a Codex prompt that starts with a tag of its own', () => {
    const sessions = tmp();
    const d = digestTranscript(rollout(sessions, 't', '/w', '<task>Fix the checkout test.</task>'))!;
    expect(d.task).toBe('<task>Fix the checkout test.</task>');
  });
});

describe('the project directory', () => {
  it('is the nearest folder with .trod/ up to the git root when no directory is configured', () => {
    const repo = tmp();
    mkdirSync(path.join(repo, '.git'));
    mkdirSync(path.join(repo, '.trod'));
    mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
    expect(resolveProjectDir({}, path.join(repo, 'src', 'deep'))).toBe(repo);
    // Without .trod/ anywhere up to the git root: the working directory, as before.
    const other = tmp();
    mkdirSync(path.join(other, '.git'));
    mkdirSync(path.join(other, 'sub'));
    expect(resolveProjectDir({}, path.join(other, 'sub'))).toBe(path.join(other, 'sub'));
    // A project set up with trod init --codex has .codex/ before it has any .trod/.
    const codex = tmp();
    mkdirSync(path.join(codex, '.git'));
    mkdirSync(path.join(codex, '.codex'));
    mkdirSync(path.join(codex, 'src'));
    expect(resolveProjectDir({}, path.join(codex, 'src'))).toBe(codex);
    expect(resolveProjectDir({ TROD_PROJECT_DIR: '/x' }, repo)).toBe(path.resolve('/x'));
  });
});

/** A Codex rollout as Codex 0.167 writes it: session_meta, developer and context messages, then the conversation. */
function rollout(dir: string, name: string, cwd: string, task: string): string {
  const day = path.join(dir, '2026', '11', '09');
  mkdirSync(day, { recursive: true });
  const item = (payload: object) => ({ timestamp: '2026-11-09T04:42:43.609Z', type: 'response_item', payload });
  const lines = [
    { timestamp: '2026-11-09T04:42:43.609Z', type: 'session_meta', payload: { id: name, cwd, originator: 'codex_exec', cli_version: '0.167.0' } },
    { type: 'event_msg', payload: { type: 'task_started' } },
    item({ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'You are Codex, an agent…' }] }),
    item({ type: 'message', role: 'user', content: [{ type: 'input_text', text: `<environment_context>\n  <cwd>${cwd}</cwd>\n</environment_context>` }] }),
    item({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for the repo\n\nUse pnpm.' }] }),
    { type: 'turn_context', payload: { cwd } },
    item({ type: 'message', role: 'user', content: [{ type: 'input_text', text: task }] }),
    item({ type: 'reasoning', summary: [] }),
    item({ type: 'function_call', name: 'exec_command', call_id: 'c1', arguments: JSON.stringify({ cmd: 'pnpm test' }) }),
    item({ type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: '1 failed', metadata: { exit_code: 1 } }) }),
    item({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'c2', input: '*** Begin Patch\n*** Update File: src/a.ts\n' }),
    item({ type: 'custom_tool_call_output', call_id: 'c2', output: 'Success. Updated src/a.ts' }),
    item({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed the failing test.' }] }),
  ];
  const file = path.join(day, `rollout-2026-11-09T04-42-43-${name}.jsonl`);
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

describe('learning from Codex sessions', () => {
  it('digests a rollout: the typed task, tool calls with their commands, errors from exit codes, the last message', () => {
    const d = digestTranscript(rollout(tmp(), 'abc', '/work/app', 'Fix the failing test.'), { outcome: 'pass' })!;
    expect(d).toMatchObject({ task: 'Fix the failing test.', toolCalls: 2, errors: 1, outcome: 'pass' });
    expect(d.text).toContain('CALL exec_command: pnpm test');
    expect(d.text).toContain('ERROR: 1 failed');
    expect(d.text).toContain('CALL apply_patch: *** Begin Patch');
    expect(d.text).toContain('RESULT: Success. Updated src/a.ts');
    expect(d.text).toContain('ASSISTANT: Fixed the failing test.');
    expect(d.text).not.toContain('environment_context');
    expect(d.text).not.toContain('Use pnpm');
    expect(d.text).not.toContain('You are Codex');
  });

  it('matches a symlinked project with the real path Codex recorded', () => {
    const sessions = tmp();
    const real = path.join(tmp(), 'app');
    mkdirSync(real);
    const link = path.join(tmp(), 'link');
    symlinkSync(real, link);
    const file = rollout(sessions, 'r', real, 'a');
    expect(codexTranscripts(link, sessions)).toEqual([file]);
  });

  it('finds the sessions that ran in the project or a folder inside it', () => {
    const sessions = tmp();
    const project = path.join(tmp(), 'app');
    const inside = rollout(sessions, 'in', project, 'a');
    const sub = rollout(sessions, 'sub', path.join(project, 'packages', 'x'), 'b');
    rollout(sessions, 'other', `${project}-other`, 'c');
    expect(codexTranscripts(project, sessions).sort()).toEqual([inside, sub].sort());
  });

  it('spots trod learn runs by their marker', () => {
    const d = digestTranscript(rollout(tmp(), 'm', '/w', 'trod-learn-run-7c1e5a (this marker keeps trod learn from learning from this session itself)'))!;
    expect(d.learnRun).toBe(true);
  });
});

describe('the Codex plugin', () => {
  const json = (...p: string[]) => JSON.parse(read(...p));
  it('takes precedence over the Claude manifest in Codex, runs the published package and has no hooks', () => {
    const manifest = json(PLUGIN, '.codex-plugin', 'plugin.json');
    expect(manifest).toMatchObject({ name: 'trod', version: packageVersion(PLUGIN), skills: './agents/skills/', mcpServers: './.codex-mcp.json' });
    expect(manifest.hooks).toBeUndefined();
    expect(existsSync(path.join(PLUGIN, manifest.skills, 'trod', 'SKILL.md'))).toBe(true);
    const server = json(PLUGIN, '.codex-mcp.json').mcpServers.trod;
    expect(server).toMatchObject({ command: 'npx', args: ['-y', `trod@${packageVersion(PLUGIN)}`, 'mcp'] });
    // No cwd and no TROD_ALLOW_EXEC: installed for every project, so execution stays opt-in.
    expect(server.cwd).toBeUndefined();
    expect(server.env?.TROD_ALLOW_EXEC).toBeUndefined();
    const files = json(PLUGIN, 'package.json').files as string[];
    expect(files).toEqual(expect.arrayContaining(['.codex-plugin/', '.codex-mcp.json', 'agents/']));
  });
});
