import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cpSync } from 'node:fs';
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
    expect(readFileSync(path.join(dir, '.claude', 'skills', 'trod-learn', 'SKILL.md'), 'utf8')).toMatch(/^---\nname: trod-learn\n/);
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
    expect(json(path.join(dir, '.mcp.json')).mcpServers.trod).toEqual({ command: 'node', args: ['.trod/pkg/server/trod-server.mjs'] });
    for (const f of ['server/trod-server.mjs', 'server/trod-lib.mjs', 'bin/trod', 'package.json']) expect(readFileSync(path.join(dir, '.trod', 'pkg', f))).toEqual(readFileSync(path.join(PLUGIN, f)));
    const post = json(path.join(dir, '.claude', 'settings.json')).hooks.PostToolUse;
    expect(post).toHaveLength(1);
    expect(post[0].hooks[0].command).toBe('node "$CLAUDE_PROJECT_DIR/.trod/pkg/bin/trod" hook');
  });

  it('keeps other hooks that share a group with the trod hook, and rejects a non-object .mcp.json', () => {
    const dir = repo();
    init({ projectDir: dir, packageRoot: PLUGIN });
    const file = path.join(dir, '.claude', 'settings.json');
    const settings = json(file);
    settings.hooks.PostToolUse[0].hooks.push({ type: 'command', command: 'npx prettier --write' }, { type: 'command', command: 'echo trod something hook' });
    writeFileSync(file, JSON.stringify(settings));
    init({ projectDir: dir, packageRoot: PLUGIN });
    const commands = json(file).hooks.PostToolUse.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
    expect(commands.filter((c: string) => /^npx -y trod@\S+ hook$/.test(c))).toHaveLength(1);
    expect(commands).toContain('npx prettier --write');
    expect(commands).toContain('echo trod something hook');
    writeFileSync(path.join(dir, '.mcp.json'), '[]');
    expect(() => init({ projectDir: dir, packageRoot: PLUGIN })).toThrow(/JSON object/);
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

  it('says so when the build is unreleased and npx could not fetch it', () => {
    const root = path.join(mkdtempSync(path.join(tmpdir(), 'trod-root-')), 'pkg');
    cpSync(PLUGIN, root, { recursive: true });
    const unreleased = { ...JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')), version: '0.0.0' };
    writeFileSync(path.join(root, 'package.json'), JSON.stringify(unreleased));
    const dir = mkdtempSync(path.join(tmpdir(), 'trod-init-'));
    expect(init({ projectDir: dir, packageRoot: root }).notes.join('\n')).toMatch(/unreleased build \(0\.0\.0\).*trod init --vendor/);
    expect(init({ projectDir: dir, packageRoot: root, vendor: true }).notes.join('\n')).not.toMatch(/unreleased build/);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...unreleased, version: '1.2.3' }));
    expect(init({ projectDir: mkdtempSync(path.join(tmpdir(), 'trod-init-')), packageRoot: root }).notes.join('\n')).not.toMatch(/unreleased build/);
  });
});
