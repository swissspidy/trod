import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { init, packageVersion } from '../src/init.ts';

const PLUGIN = path.resolve(import.meta.dirname, '..', '..', '..', 'plugin');
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

function repo() {
  return mkdtempSync(path.join(tmpdir(), 'trod-init-'));
}

describe('trod init', () => {
  it('sets a repository up for local and cloud sessions through npx, pinned to this version', () => {
    const dir = repo();
    const res = init({ projectDir: dir, packageRoot: PLUGIN });
    const version = packageVersion(PLUGIN);
    expect(json(path.join(dir, '.mcp.json')).mcpServers.trod).toEqual({ command: 'npx', args: ['-y', `trod@${version}`, 'mcp'] });
    const settings = json(path.join(dir, '.claude', 'settings.json'));
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe(`npx -y trod@${version} hook`);
    expect(existsSync(path.join(dir, '.claude', 'skills', 'trod', 'SKILL.md'))).toBe(true);
    expect(res.notes.join(' ')).toContain('TROD_ALLOW_EXEC');
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('.trod/tools/');
  });

  it('keeps existing servers, settings and hooks, and is idempotent', () => {
    const dir = repo();
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ model: 'opus', hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] } }));
    init({ projectDir: dir, packageRoot: PLUGIN, allowExec: true });
    const again = init({ projectDir: dir, packageRoot: PLUGIN, allowExec: true });
    expect(again.written).toEqual([]);
    const mcp = json(path.join(dir, '.mcp.json'));
    expect(mcp.mcpServers.other).toEqual({ command: 'x' });
    expect(mcp.mcpServers.trod.env).toEqual({ TROD_ALLOW_EXEC: '1' });
    const settings = json(path.join(dir, '.claude', 'settings.json'));
    expect(settings.model).toBe('opus');
    expect(settings.hooks.PostToolUse.map((g: { matcher: string }) => g.matcher)).toEqual(['Bash', 'Write|Edit|MultiEdit']);
  });

  it('vendors the bundled server and CLI and replaces an earlier trod hook', () => {
    const dir = repo();
    init({ projectDir: dir, packageRoot: PLUGIN });
    init({ projectDir: dir, packageRoot: PLUGIN, vendor: true });
    expect(json(path.join(dir, '.mcp.json')).mcpServers.trod).toEqual({ command: 'node', args: ['.trod/bin/trod-server.mjs'] });
    expect(existsSync(path.join(dir, '.trod', 'bin', 'trod-server.mjs'))).toBe(true);
    const post = json(path.join(dir, '.claude', 'settings.json')).hooks.PostToolUse;
    expect(post).toHaveLength(1);
    expect(post[0].hooks[0].command).toContain('.trod/bin/trod');
  });
});

describe('package', () => {
  it('keeps the npm and plugin versions in step', () => {
    const version = packageVersion(PLUGIN);
    expect(version).toBe(json(path.join(PLUGIN, '.claude-plugin', 'plugin.json')).version);
    const server = json(path.join(PLUGIN, 'server.json'));
    expect([server.version, server.packages[0].version]).toEqual([version, version]);
    expect(server.name).toBe(json(path.join(PLUGIN, 'package.json')).mcpName);
  });
});
