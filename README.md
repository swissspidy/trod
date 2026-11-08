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
- **Knowledge, not only code:** on AppWorld ([round 6](results-6/README.md)) the forged tools tied, but the forge's
  lessons as always-loaded notes lifted Haiku from 87.5% to 95.0% (notes `trod forge` wrote itself reached only
  86.7–90%: a few specific rules made the difference). On BIRD ([round 7](results-7/README.md)), where
  the missing knowledge is specific to each question, notes only saved tokens. On ScienceWorld
  ([round 8](results-8/README.md)), where whole procedures recur, forged notes took Haiku from 52% to 89% solved,
  past Sonnet (67%) at a tenth of its cost. On MiniWoB++ web tasks ([round 9](results-9/README.md)), notes Opus
  forged from **practice episodes** alone (no expert trajectories) took Haiku from 68% to 90% on the 30 hardest task
  types, past Sonnet (67%) at 9% of its cost per run; notes Haiku forged for itself ($0.79 for 30 task types) reached
  88%. So `trod forge` now also writes verified notes, and can practise against a success check (`--practice`)
  ([ADR 0004](docs/adr/0004-verified-notes.md)).

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

**Any repository, for every session in it** (local, [cloud](https://code.claude.com/docs/en/claude-code-on-the-web)
and sessions started from the Claude mobile app):

```sh
npx trod init --allow-exec     # writes .mcp.json, .claude/settings.json, the skill and .gitignore entries
git add .mcp.json .claude .gitignore && git commit -m "Add trod"
```

Cloud sessions do not install plugins declared in project settings, but they start project MCP servers from a
committed `.mcp.json` (see [docs/spike.md](docs/spike.md)); `trod init` writes one that runs `npx -y trod@<version> mcp`
and approves it with `"enableAllProjectMcpServers": true`. `--vendor` copies the bundled server (one file, no
dependencies) into `.trod/bin/` instead, so nothing is fetched at session start.

**Every cloud session in an environment, without touching any repository** (tested): in the cloud environment's
settings, add this setup script and the variable `TROD_ALLOW_EXEC=1` (the network must reach github.com):

```sh
claude plugin marketplace add swissspidy/trod || true
claude plugin install trod@trod || true
```

Each new session in that environment, whichever repository it opens (or none), then has the trod tools, the skill and
the hook as a plugin.

**Local plugin** (Claude Code on your machine):

```sh
claude plugin marketplace add swissspidy/trod
claude plugin install trod@trod
```

**Other MCP clients** (Antigravity, Cursor, VS Code, ...): run `npx -y trod mcp` as a stdio server, with
`TROD_ALLOW_EXEC=1` in its environment and the project directory as its working directory (or `TROD_PROJECT_DIR`).
Tools written mid-session appear through `notifications/tools/list_changed`; clients that ignore it can still call
every tool through `trod_run` and `trod_eval`. The skill and the validation hook are Claude Code features; elsewhere,
put the skill's text (`plugin/skills/trod/SKILL.md`) into the client's rules file.

**Execution is off by default.** Tool code runs in a subprocess of the server, outside Claude Code's
permission prompts and Bash sandbox. trod only runs tools when `TROD_ALLOW_EXEC=1` is set in its environment,
which is meant for ephemeral cloud containers. See [ADR 0001](docs/adr/0001-tool-execution-and-safety.md).

## Lifecycle

- New tools land in `.trod/tools/` (ignored by git): session tools.
- `trod promote <name>` moves one to `.trod/library/` (committed). The library loads at startup.
- `trod forge --brief @env.md [--model claude-opus-5-5]` runs a dedicated tool-building session (headless Claude
  Code) against an environment and promotes every tool whose examples pass: build the library once with a strong
  model, use it in every later session. The forge also writes `.trod/notes.md` (conventions a newcomer gets wrong)
  with checks in `.trod/notes.checks.json`, and links the notes into `CLAUDE.md` (`@.trod/notes.md`).
- `trod forge --brief @env.md --practice '<check>' [--reset '<cmd>']` lets the forge **practise** first. The check
  is any shell command whose exit code 0 means the current attempt succeeded: a test suite, a grader, a smoke
  test. The forge calls it as `trod-try` (and `--reset` as `trod-reset`), learns from what passes and fails, and
  writes rules plus a recipe that worked. Its notes are linked only if it passed the check at least once
  ([round 9](results-9/README.md): practice notes took Haiku from 68% to 90% on MiniWoB++'s hardest task types).
- `trod verify` re-runs every library tool's examples and every note check: run it in CI to catch a drifted
  environment. `trod notes` shows the notes' status.
- `trod stats` summarizes `.trod/logs/*.jsonl`: tools created, called, reused, errors.
- `trod check` validates every tool folder without running anything.

The CLI is `npx trod <command>`, or bundled at `plugin/bin/trod` in this repository (`node plugin/bin/trod stats`).

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

**Releasing.** `plugin/` is also the npm package `trod` (bundled server and CLI, the skill and the hook; no
dependencies). Bump the version in `plugin/package.json`, `plugin/.claude-plugin/plugin.json` and `plugin/server.json` (a test
keeps them equal), merge, then push a `v<version>` tag: the Release workflow checks, tests, publishes to npm with
provenance and lists the server in the [MCP Registry](https://registry.modelcontextprotocol.io) as
`io.github.swissspidy/trod`. It needs an `NPM_TOKEN` secret in a GitHub environment named `npm`.
