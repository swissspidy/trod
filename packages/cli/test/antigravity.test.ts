import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkAntigravityNotes, linkNotes, trodPaths } from '@trod/server';
import { describe, expect, it } from 'vitest';
import { init, packageVersion } from '../src/init.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PLUGIN = path.join(ROOT, 'plugin');
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const repo = () => mkdtempSync(path.join(tmpdir(), 'trod-agy-'));

describe('trod init --antigravity', () => {
  it('writes the workspace MCP config, the skill and the ignores, and nothing for Claude Code', () => {
    const dir = repo();
    const res = init({ projectDir: dir, packageRoot: PLUGIN, antigravity: true, allowExec: true });
    expect(json(path.join(dir, '.agents', 'mcp_config.json')).mcpServers.trod).toEqual({
      command: 'npx',
      args: ['-y', `trod@${packageVersion(PLUGIN)}`, 'mcp'],
      env: { TROD_ALLOW_EXEC: '1' },
    });
    expect(readFileSync(path.join(dir, '.agents', 'skills', 'trod', 'SKILL.md'), 'utf8')).toBe(readFileSync(path.join(PLUGIN, 'antigravity', 'skills', 'trod', 'SKILL.md'), 'utf8'));
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('.trod/tools/');
    expect(readFileSync(path.join(dir, '.agents', 'skills', 'trod-learn', 'SKILL.md'), 'utf8')).toBe(readFileSync(path.join(PLUGIN, 'antigravity', 'skills', 'trod-learn', 'SKILL.md'), 'utf8'));
    expect(existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude'))).toBe(false);
    expect(res.notes.join(' ')).toContain('asks before each MCP tool call');
  });

  it('keeps other servers and links existing notes through a rule', () => {
    const dir = repo();
    mkdirSync(path.join(dir, '.agents'));
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.agents', 'mcp_config.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n- a rule\n');
    const res = init({ projectDir: dir, packageRoot: PLUGIN, antigravity: true });
    expect(json(path.join(dir, '.agents', 'mcp_config.json')).mcpServers.other).toEqual({ command: 'x' });
    expect(res.written).toContain(path.join('.agents', 'rules', 'trod-notes.md'));
    const rule = readFileSync(path.join(dir, '.agents', 'rules', 'trod-notes.md'), 'utf8');
    expect(rule).toMatch(/^---\ntrigger: always_on\n---\n/);
    expect(rule).toContain('@[trod notes](../../.trod/notes.md)');
  });

  it('keeps variables the user added and reports an existing rule as unchanged', () => {
    const dir = repo();
    mkdirSync(path.join(dir, '.agents'));
    mkdirSync(path.join(dir, '.trod'));
    writeFileSync(path.join(dir, '.trod', 'notes.md'), '# Notes\n');
    writeFileSync(path.join(dir, '.agents', 'mcp_config.json'), JSON.stringify({ mcpServers: { trod: { command: 'npx', env: { TROD_PROJECT_DIR: '/work/app' } } } }));
    init({ projectDir: dir, packageRoot: PLUGIN, antigravity: true, allowExec: true });
    expect(json(path.join(dir, '.agents', 'mcp_config.json')).mcpServers.trod.env).toEqual({ TROD_PROJECT_DIR: '/work/app', TROD_ALLOW_EXEC: '1' });
    const again = init({ projectDir: dir, packageRoot: PLUGIN, antigravity: true, allowExec: true });
    expect(again.written).toEqual([]);
    expect(again.unchanged).toContain(path.join('.agents', 'rules', 'trod-notes.md'));
  });

  it('rejects --vendor', () => {
    expect(() => init({ projectDir: repo(), packageRoot: PLUGIN, antigravity: true, vendor: true })).toThrow(/--vendor is not supported/);
  });
});

describe('notes in Antigravity projects', () => {
  it('writes the rule once in projects with .agents/, and skips projects without', () => {
    const dir = repo();
    expect(linkAntigravityNotes(trodPaths(dir))).toBe('skipped');
    expect(existsSync(path.join(dir, '.agents'))).toBe(false);
    mkdirSync(path.join(dir, '.agents'));
    expect(linkAntigravityNotes(trodPaths(dir))).toBe('written');
    expect(linkAntigravityNotes(trodPaths(dir))).toBe('exists');
  });

  it('reports a rule it cannot write instead of throwing, and CLAUDE.md is still linked', () => {
    const dir = repo();
    mkdirSync(path.join(dir, '.agents'));
    writeFileSync(path.join(dir, '.agents', 'rules'), 'a file where the folder should be');
    const res = linkAntigravityNotes(trodPaths(dir));
    expect(typeof res === 'object' && res.error).toMatch(/could not write/);
    expect(linkNotes(trodPaths(dir))).toBe(true);
  });
});

describe('the Antigravity plugin at the repository root', () => {
  const manifest = json(path.join(ROOT, '.antigravity-plugin', 'plugin.json'));

  it('uses only documented manifest fields (the schema rejects unknown keys)', () => {
    const allowed = ['$schema', 'name', 'displayName', 'description', 'version', 'logo', 'suggestedPrompts', 'skills', 'disabled', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
    expect(Object.keys(manifest).filter((k) => !allowed.includes(k))).toEqual([]);
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(manifest.suggestedPrompts.length).toBeLessThanOrEqual(3);
    expect(existsSync(path.join(ROOT, manifest.logo))).toBe(true);
    expect(manifest.version).toBe(packageVersion(PLUGIN));
  });

  it('runs the bundled server from the plugin root, with execution off', () => {
    const server = json(path.join(ROOT, 'mcp_config.json')).mcpServers.server;
    expect(server.args[0]).toBe('${PLUGIN_ROOT}/plugin/server/trod-server.mjs');
    // Installed for every workspace: with execution on, opening an untrusted repository would import its tools.
    expect(server.env?.TROD_ALLOW_EXEC).toBeUndefined();
    expect(existsSync(path.join(ROOT, 'plugin', 'server', 'trod-server.mjs'))).toBe(true);
  });

  it('ships the same skills as trod init --antigravity, each named after its folder', () => {
    for (const name of ['trod', 'trod-learn']) {
      const skill = readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
      expect(skill).toBe(readFileSync(path.join(PLUGIN, 'antigravity', 'skills', name, 'SKILL.md'), 'utf8'));
      expect(skill).toMatch(new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n---\\n`));
    }
  });

  it('keeps the scheduled-learning skill identical to the Claude Code one, apart from its name', () => {
    const claude = readFileSync(path.join(PLUGIN, 'skills', 'learn', 'SKILL.md'), 'utf8');
    expect(readFileSync(path.join(PLUGIN, 'antigravity', 'skills', 'trod-learn', 'SKILL.md'), 'utf8')).toBe(claude.replace('name: learn', 'name: trod-learn'));
    expect(claude).toContain('trod-learn-run-7c1e5a');
  });
});
