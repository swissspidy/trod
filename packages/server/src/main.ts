import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveProjectDir, trodPaths } from './paths.ts';
import { TrodServer } from './server.ts';

const trod = new TrodServer({ paths: trodPaths(resolveProjectDir()) });
await trod.start();
// Without a configured project directory, follow the client's workspace (MCP roots): some clients (Antigravity)
// start servers in the home directory and say nothing else about the project.
if (!process.env.TROD_PROJECT_DIR && !process.env.CLAUDE_PROJECT_DIR) {
  const adopt = () => void trod.adoptClientRoots().catch(() => {});
  trod.server.oninitialized = adopt;
  trod.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => adopt());
}
await trod.server.connect(new StdioServerTransport());
trod.markConnected();

const shutdown = () => {
  void trod.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);
