import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveProjectDir, trodPaths } from './paths.ts';
import { TrodServer } from './server.ts';

const trod = new TrodServer({ paths: trodPaths(resolveProjectDir()) });
await trod.start();
await trod.server.connect(new StdioServerTransport());
trod.markConnected();

const shutdown = () => {
  void trod.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);
