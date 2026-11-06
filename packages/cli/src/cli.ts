import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { computeStats, formatStats, loadToolFolder, promoteTool, readLogs, resolveProjectDir, trodPaths } from '@trod/server';

const USAGE = `trod: self-morphing tools for Claude Code

Usage:
  trod promote <name>      Move .trod/tools/<name> to .trod/library/<name> (commit the library)
  trod stats [--json]      Summarize tool usage across .trod/logs/*.jsonl
  trod check               Validate every tool folder (static checks, no execution)
  trod list                List session and library tools

Options:
  --dir <path>             Project directory (default: TROD_PROJECT_DIR, CLAUDE_PROJECT_DIR or cwd)
  --logs <path>            Logs directory for stats (default: <dir>/.trod/logs)
`;

export async function main(argv: string[], out: (s: string) => void = console.log): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      logs: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    out(USAGE);
    return command || values.help ? 0 : 1;
  }
  const paths = trodPaths(values.dir ? path.resolve(values.dir) : resolveProjectDir());

  switch (command) {
    case 'promote': {
      const name = rest[0];
      if (!name) {
        out('trod promote: missing tool name');
        return 1;
      }
      const res = await promoteTool(paths, name);
      out(`promoted ${name} -> ${path.relative(paths.projectDir, res.to)}${res.replaced ? ' (replaced the previous library version)' : ''}`);
      out('Commit .trod/library/ so later sessions load it.');
      return 0;
    }
    case 'stats': {
      const stats = computeStats(readLogs(values.logs ? path.resolve(values.logs) : paths.logsDir));
      out(values.json ? JSON.stringify(stats, null, 2) : formatStats(stats));
      return 0;
    }
    case 'check':
    case 'list': {
      let bad = 0;
      for (const [source, root] of [['library', paths.libraryDir], ['session', paths.toolsDir]] as const) {
        if (!existsSync(root)) continue;
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const t = await loadToolFolder(path.join(root, entry.name), source);
          if (!t.ok) bad++;
          out(`${t.ok ? 'ok     ' : 'INVALID'} ${source}/${t.folder}${t.ok || command === 'list' ? '' : '\n  - ' + t.errors.join('\n  - ')}`);
        }
      }
      return command === 'check' && bad ? 1 : 0;
    }
    default:
      out(`trod: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}
