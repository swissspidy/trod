# trod

**Self-morphing tools for Claude Code.** trod is an MCP server that turns files into live tools. The agent
writes a tool definition with its normal Write tool. trod picks it up, validates it, registers it and sends
`notifications/tools/list_changed`, so the agent can call the new tool in the same session.

It is an experiment: do agents that build their own tools mid-task get cheaper or faster than plain Bash?
See [`experiments/`](experiments/) and the results in [`results/`](results/README.md). **Findings so far** ([round 1](results/README.md), [rounds 2 and 3](results-2/README.md), [round 4](results-4/README.md),
[round 5](results-5/README.md), [site](https://swissspidy.github.io/trod/)):
- **Mid-task tools:** building tools *mid-task* does not beat writing a script.
- **Unfamiliar environments:** a library **forged once** by a strong model pays off where an environment holds
  knowledge the model cannot guess. Across three such environments (an internal API, an unseen codebase, a signed
  support API), Haiku with an Opus-forged library got every answer right in all 9 runs (Sonnet from scratch: 6 of 9),
  at 5–14% of Sonnet's cost.
- **SWE-bench:** on SWE-bench Verified (Django), the same approach changed nothing, because the models already know
  how to work in Django.

## A tool

One file, `.trod/tools/<name>.mjs`:

```js
export const meta = {
  description: 'Sums a numeric column of a CSV file and returns the total.',
  whenToUse: 'When you need a column total of a CSV file.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' }, column: { type: 'string' } },
    required: ['path', 'column'],
  },
  examples: [{ input: { path: 'data.csv', column: 'a' }, expect: { equals: 4 } }],
};

export default async ({ path, column }, ctx) => { /* … */ return total; };
```

(The folder format, `.trod/tools/<name>/tool.json` plus `run.mjs` or `run.sh`, also works.)

On every change trod checks the definition, the schema, name collisions and the syntax, then runs the
`examples` as a smoke test. Invalid tools are not registered. A PostToolUse hook reports the result in the
Write's own result. Two permanent tools never change, so the prompt cache stays valid:

- `trod_run {tool, input}` calls any trod tool right away, with nothing to load
  ([ADR 0002](docs/adr/0002-tool-loading-and-the-prompt-cache.md)).
- `trod_status` shows the registry, the load errors and per-tool usage.
- `trod_eval {code}` runs JavaScript with every trod tool as a function (`await tools.x({…})`): fetch, combine and
  compute in one call ([ADR 0003](docs/adr/0003-forge-library-cards-and-code-mode.md)).

Library tools (`.trod/library`) are listed in the server's instructions with their evidence (examples passed at
promotion, usage in earlier sessions), so a fresh session can rely on them from its first turn.

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
- `trod forge --brief @env.md [--model claude-opus-5-5]` runs a dedicated tool-building session (headless Claude
  Code) against an environment and promotes every tool whose examples pass: build the library once with a strong
  model, use it in every later session.
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
