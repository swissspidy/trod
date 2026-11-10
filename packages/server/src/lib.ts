// The one bundle the server entry and the CLI share (plugin/server/trod-lib.mjs): the package's API plus the server's start.
export * from './index.ts';
export { startServer } from './main.ts';
