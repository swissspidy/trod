// Bundles the server and the CLI into single files under plugin/, with no node_modules needed at runtime:
// a cloud container clones the repo and starts the server without installing anything (docs/spike.md).
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const banner = {
  js: "import { createRequire as __trodCreateRequire } from 'node:module'; const require = __trodCreateRequire(import.meta.url);",
};
const common = { bundle: true, platform: 'node', format: 'esm', target: 'node22', banner, legalComments: 'none', logLevel: 'warning' };

await build({ ...common, entryPoints: ['packages/server/src/main.ts'], outfile: 'plugin/server/trod-server.mjs' });
await build({
  ...common,
  entryPoints: ['packages/cli/src/bin.ts'],
  outfile: 'plugin/bin/trod',
  banner: { js: '#!/usr/bin/env node\n' + banner.js },
});
// The Antigravity plugin at the repository root ships the same skill as `trod init --antigravity`.
mkdirSync('skills/trod', { recursive: true });
copyFileSync('plugin/antigravity/skills/trod/SKILL.md', 'skills/trod/SKILL.md');
console.log('bundled plugin/server/trod-server.mjs and plugin/bin/trod; copied the Antigravity skill to skills/trod/');
