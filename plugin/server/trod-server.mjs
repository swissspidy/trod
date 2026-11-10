// The trod MCP server on stdio. The code is in trod-lib.mjs, which the CLI (bin/trod) shares.
import { startServer } from './trod-lib.mjs';

await startServer();
