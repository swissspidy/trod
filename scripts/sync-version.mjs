#!/usr/bin/env node
// Copies the version of the published package (plugin/package.json, which Changesets bumps) into every other place
// that names it: the server's VERSION, the Claude Code and Antigravity plugin manifests and the MCP Registry entry.
// `pnpm version-packages` runs it after `changeset version`; `--check` fails if any of them disagree (CI and tests).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const version = JSON.parse(read('plugin/package.json')).version;
const check = process.argv.includes('--check');

const json = (f, set) => [f, (text) => { const j = JSON.parse(text); set(j); return `${JSON.stringify(j, null, 2)}\n`; }];
const targets = [
  json('plugin/.claude-plugin/plugin.json', (j) => { j.version = version; }),
  json('.antigravity-plugin/plugin.json', (j) => { j.version = version; }),
  json('plugin/server.json', (j) => { j.version = version; for (const p of j.packages) if (p.identifier === 'trod') p.version = version; }),
  ['packages/server/src/server.ts', (text) => text.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${version}';`)],
];

const stale = [];
for (const [file, update] of targets) {
  const before = read(file);
  const after = update(before);
  if (after === before) continue;
  stale.push(file);
  if (!check) writeFileSync(path.join(root, file), after);
}
if (check && stale.length) {
  console.error(`version ${version} (plugin/package.json) is not in: ${stale.join(', ')}. Run node scripts/sync-version.mjs.`);
  process.exit(1);
}
if (!check) console.log(stale.length ? `trod ${version}: updated ${stale.join(', ')}` : `trod ${version}: all in sync`);
