# trod

**Self-morphing tools for Claude Code.** trod is an MCP server that turns files into live tools. The agent
writes a tool definition with its normal Write tool. trod picks it up, validates it, registers it and sends
`notifications/tools/list_changed`, so the agent can call the new tool in the same session.

It is an experiment: do agents that build their own tools mid-task get cheaper or faster than plain Bash?
See [`experiments/`](experiments/) and the results in [`results/`](results/README.md). **Headline (Sonnet 5.5, 120 sessions):** agents almost never built tools unprompted. When required to, sessions cost 1.84× plain Bash, because a parameterized script on disk is already a tool. Tools carried over from an earlier session broke even overall and saved 31% on the fiddliest task.

## A tool

One folder per tool under `.trod/tools/<name>/`:

```
.trod/tools/csv_sum/
├── tool.json   # name, description, whenToUse, inputSchema, examples, provenance
└── run.mjs     # export default async (input, ctx) => result      (or run.sh: input JSON on stdin)
```

```json
{
  "name": "csv_sum",
  "description": "Sums a numeric column of a CSV file and returns the total.",
  "whenToUse": "When you need a column total of a CSV file.",
  "inputSchema": {
    "type": "object",
    "properties": { "path": { "type": "string" }, "column": { "type": "string" } },
    "required": ["path", "column"]
  },
  "examples": [{ "input": { "path": "data.csv", "column": "a" }, "expect": { "equals": 4 } }],
  "provenance": { "reason": "summing 30 CSV files" }
}
```

On every change trod checks the definition, the schema, name collisions and the run file's syntax, then runs
the `examples` as a smoke test. Invalid tools are not registered. The one permanent tool, `trod_status`, shows
the registry, the load errors and per-tool usage.

## Install

**Local (plugin):**

```sh
claude plugin marketplace add swissspidy/trod
claude plugin install trod@trod
```

**Cloud sessions:** plugins declared in project settings are not installed there (see
[docs/spike.md](docs/spike.md)). Commit a root `.mcp.json` that runs the bundled server, as this repository
does:

```json
{ "mcpServers": { "trod": { "command": "node", "args": ["plugin/server/trod-server.mjs"] } } }
```

and approve it in `.claude/settings.json` with `"enableAllProjectMcpServers": true`.

**Execution is off by default.** Tool code runs in a subprocess of the server, outside Claude Code's
permission prompts and Bash sandbox. trod only runs tools when `TROD_ALLOW_EXEC=1` is set in its environment,
which is meant for ephemeral cloud containers. See [ADR 0001](docs/adr/0001-tool-execution-and-safety.md).

## Lifecycle

- New tools land in `.trod/tools/` (ignored by git): session tools.
- `trod promote <name>` moves one to `.trod/library/` (committed). The library loads at startup.
- `trod stats` summarizes `.trod/logs/*.jsonl`: tools created, called, reused, errors.
- `trod check` validates every tool folder without running anything.

The CLI is bundled at `plugin/bin/trod` (`node plugin/bin/trod stats`).

## Configuration

| Variable | Default | |
|---|---|---|
| `TROD_ALLOW_EXEC` | unset | `1` lets the server execute tools |
| `TROD_PROJECT_DIR` | `CLAUDE_PROJECT_DIR`, then cwd | where `.trod/` lives |
| `TROD_MAX_OUTPUT_CHARS` | 25000 | longer outputs are truncated with a marker |
| `TROD_ENV_PASSTHROUGH` | empty | comma-separated extra variables tools may see |
| `TROD_SESSION_ID` | `CLAUDE_CODE_SESSION_ID` | session id for logs |

## Development

```sh
pnpm install
pnpm check      # typecheck, lint, tests
pnpm build      # bundles plugin/server/trod-server.mjs and plugin/bin/trod (committed)
```

pnpm monorepo: `packages/server` (MCP server, registry, executor, logs), `packages/cli`, `plugin/` (the
Claude Code plugin), `experiments/` (tasks, runner, report). MIT licensed.
