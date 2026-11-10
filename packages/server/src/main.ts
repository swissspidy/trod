import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveProjectDir, trodPaths } from './paths.ts';
import { TrodServer } from './server.ts';

/** Starts the trod MCP server on stdio; it runs until the client disconnects or the process is signalled. */
export async function startServer(): Promise<void> {
  const trod = new TrodServer({ paths: trodPaths(resolveProjectDir()) });
  await trod.start();
  // Without a configured project directory, follow the client's workspace (MCP roots): some clients (Antigravity)
  // start servers in the home directory and say nothing else about the project.
  if (!process.env.TROD_PROJECT_DIR && !process.env.CLAUDE_PROJECT_DIR) {
    // Report failures on stderr (the client's MCP log) and retry a few times: a transient error must not leave the
    // server in the home directory for the whole session.
    const adopt = (attempt = 1): void => {
      trod.adoptClientRoots().catch((err: Error) => {
        process.stderr.write(`trod: could not use the client's workspace roots (attempt ${attempt}): ${err.message}\n`);
        if (attempt < 3) setTimeout(() => adopt(attempt + 1), 1000 * attempt).unref();
      });
    };
    trod.server.oninitialized = () => adopt();
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
}
