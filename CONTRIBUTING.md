# Contributing to trod

Thanks for looking. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **A bug or a question:** open an issue. `npx trod doctor` output and the trod version (`npx trod --version`) save a
  round trip.
- **A bigger change:** open an issue first and say what you want to change and why, so we agree on the direction
  before you write the code.
- **A security problem:** do not open a public issue; see [SECURITY.md](SECURITY.md).

## Setup

You need Node 22 or newer and [pnpm](https://pnpm.io) (`corepack enable` gives you the pinned version).

```sh
pnpm install
pnpm check      # typecheck, lint, tests: run this before you push
pnpm build      # rebuilds the bundles under plugin/, which are committed
```

Run the CLI from your checkout with `node plugin/bin/trod <command>` (after `pnpm build`).

## Where things are

| Path | What |
|---|---|
| `packages/server` | The MCP server: tool registry, validation, execution, notes |
| `packages/cli` | The `trod` command: init, learn, forge, tune, report, doctor |
| `plugin/` | The Claude Code plugin and the npm package (bundles, skills, hooks) |
| `docs/` | The reference, the distribution notes and the decision records (`docs/adr/`) |
| `experiments/`, `results*/` | The benchmark harnesses and the published results of each round |

## Pull requests

- One change per pull request, with tests for what you changed.
- Run `pnpm check` and `pnpm build`, and commit the rebuilt `plugin/` bundles when you changed server or CLI code
  (CI fails on stale bundles).
- If users will notice the change, add a changeset: `pnpm changeset`, pick `trod`, and describe the change in a
  sentence or two for the changelog.
- A decision worth remembering (why this design and not another) goes into `docs/adr/`.
- Claims about results need the data: experiment changes come with the runs they were measured on.

## Style

TypeScript, checked by `tsc` and `oxlint`. Comments say why, not what. User-facing text is plain: short sentences,
the real command to run, no jargon the reference does not define.
