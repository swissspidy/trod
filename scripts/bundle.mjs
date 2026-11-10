// Bundles the server and the CLI into files under plugin/, with no node_modules needed at runtime: a cloud container
// clones the repo and starts the server without installing anything (docs/spike.md).
//   plugin/server/trod-lib.mjs     everything in packages/server and its dependencies (the MCP SDK, ajv)
//   plugin/server/trod-server.mjs  the server entry: imports the lib and starts it
//   plugin/bin/trod                the CLI: packages/cli only; it imports the lib instead of carrying a second copy
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const banner = {
  js: "import { createRequire as __trodCreateRequire } from 'node:module'; const require = __trodCreateRequire(import.meta.url);",
};
const common = { bundle: true, platform: 'node', format: 'esm', target: 'node22', banner, legalComments: 'none', logLevel: 'warning' };

await build({ ...common, entryPoints: ['packages/server/src/lib.ts'], outfile: 'plugin/server/trod-lib.mjs' });
writeFileSync('plugin/server/trod-server.mjs', "// The trod MCP server on stdio. The code is in trod-lib.mjs, which the CLI (bin/trod) shares.\nimport { startServer } from './trod-lib.mjs';\n\nawait startServer();\n");
await build({
  ...common,
  entryPoints: ['packages/cli/src/bin.ts'],
  outfile: 'plugin/bin/trod',
  banner: { js: '#!/usr/bin/env node\n' + banner.js },
  plugins: [
    {
      name: 'shared-server-lib',
      setup(b) {
        // bin/trod sits next to server/ in the plugin, in the npm package and in a vendored copy (.trod/pkg).
        b.onResolve({ filter: /^@trod\/server$/ }, () => ({ path: '../server/trod-lib.mjs', external: true }));
      },
    },
  ],
});
// The Antigravity plugin at the repository root ships the same skills as `trod init --antigravity` (and --codex).
for (const skill of ['trod', 'trod-learn']) {
  mkdirSync(`skills/${skill}`, { recursive: true });
  copyFileSync(`plugin/agents/skills/${skill}/SKILL.md`, `skills/${skill}/SKILL.md`);
}
console.log('bundled plugin/server/trod-lib.mjs, plugin/server/trod-server.mjs and plugin/bin/trod; copied the .agents skills to skills/');
