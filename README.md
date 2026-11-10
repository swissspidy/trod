<p align="center"><img src="assets/logo.svg" alt="" width="72"></p>

# trod

[![CI](https://github.com/swissspidy/trod/actions/workflows/ci.yml/badge.svg)](https://github.com/swissspidy/trod/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Teach Claude Code your project once.**

Every new session starts from zero: it rediscovers how your API pages, which flag the build needs, what "active
customer" means here. trod turns that experience into a short set of verified notes (and tools), written by a
dedicated learning session. Every later session loads them, so a small, cheap model works like one that already
knows the place.

```sh
npx trod init       # set this repository up (commit what it writes)
npx trod learn      # write notes from the Claude Code sessions you have already had
npx trod doctor     # see what trod knows here and what to do next
```

> trod is not on npm yet. Until the first release, install the plugin (below), or clone this repository and run
> `node <clone>/plugin/bin/trod init --vendor` in your project.

## Does it work?

Measured on public benchmarks, with held-out test tasks the learning session never saw. Same model, same tasks,
with and without the notes ([site](https://swissspidy.github.io/trod/),
[all 18 rounds](https://swissspidy.github.io/trod/experiments.html)):

| Tasks solved by Haiku 5.5 | alone | with trod's notes |
|---|---|---|
| [AutomationBench](results-18/README.md): business workflows across 50 apps, 300 held-out tasks | 17% | **36%** |
| [MiniWoB++](results-9/README.md): 30 hardest web task types | 68% | **90%**; [95%](results-14/README.md) after further learning and validated tuning |
| [ScienceWorld](results-8/README.md): 30 kinds of science task | 52% | **89%** |
| [AppWorld](results-17/README.md): everyday chores across 9 apps, all 585 test tasks | 85.8% | 86.5% |
| [BIRD](results-7/README.md): text-to-SQL | 61% | 63% |
| [SWE-bench Verified](results-5/README.md): Django issues | 79.6% | 79.1% |

On the first three, Haiku with notes also beats Sonnet without them (30%, 67% and 67%) at about a tenth of the cost
per run. On AutomationBench the notes came from `trod learn` alone: one $2 learning session over Haiku's own earlier
sessions, and the same notes take Sonnet from 30% to 44%.

**It helps** where the same hidden rules come back in every task: internal or quirky APIs, unfamiliar codebases,
in-house tooling, web and app workflows. **It does not help** where the model already knows the domain (Django),
where it already does well without notes (AppWorld), or where every task needs its own fact that no earlier task
taught (BIRD). The null results are published with the same care as the wins, and so are corrections: an earlier
AppWorld gain measured on a 120-task sample [did not hold](results-17/README.md) on the full test sets, and notes learned there
from 90 sessions with only 6 failures cost 4 points. Check learned notes on held-out tasks before relying on them
(`trod tune` does).

## Three ways to teach it

**From the sessions you already had.** No setup, no labels. `trod learn` reads the transcripts Claude Code keeps for
this project, compares sessions that went wrong with ones that went right, and writes the rules that would have
prevented the failures.

```sh
npx trod learn --dry-run     # see which sessions it would read; starts nothing
npx trod learn               # one learning session; review the diff, then commit
npx trod learn --auto 10     # or: keep learning by itself, after every 10 sessions
```

**By studying something new.** Describe an API, a tool or a workflow in a few lines, and `trod forge` explores it in
a dedicated session. Give it a success check and it practises against it first.

```sh
npx trod forge --brief @env.md --practice 'npm test'
```

**Against your own tasks.** List a few tasks with a command that checks each one, and `trod tune` rewrites the
notes and keeps the rewrite only if it passes more held-out tasks than before.

```sh
npx trod tune --dry-run      # tasks live in .trod/tune.json
```

What comes out is plain text in your repository: `.trod/notes.md` (rules, each with the action to take),
optionally `.trod/wiki/` pages for particular kinds of task and tools in `.trod/library/`. You review it in a pull
request like any other change.

## Why trust the notes?

Notes an agent writes about your project can be wrong. trod does not take them on faith:

- **Checked claims.** A note can carry a check that re-runs against your environment. `npx trod verify` in CI
  fails when a tool or a note has gone stale.
- **Practice.** With `--practice`, notes are linked only if the learning session passed your success check at
  least once.
- **Evidence.** `trod learn` keeps a ledger: how often later sessions confirmed or contradicted each rule. Rules
  contradicted more often than confirmed are fixed or dropped.
- **Measured.** `npx trod report` compares your sessions with and without the notes: turns, failed tool calls,
  follow-up prompts, tokens. With `npx trod notes --delivery hooks`, a random 10% of sessions get no notes, so the
  comparison is a real experiment.
- **Validated rewrites.** `trod tune` rejects a rewrite that does not beat the current notes on held-out tasks. On
  AppWorld it rejected three plausible rewrites, one of which would have cost 3.5 points on the validation tasks.

## Install

```sh
npx trod init                # Claude Code: local, cloud and mobile-app sessions of this repository
npx trod init --codex        # Codex
npx trod init --antigravity  # Antigravity
```

Commit what it writes. Or install the Claude Code plugin, which needs no npm:

```sh
claude plugin marketplace add swissspidy/trod
claude plugin install trod@trod
```

Any other MCP client can run the server with `npx -y trod mcp`. The [reference](docs/reference.md) covers every
route, and `npx trod help` lists the commands.

## Is it safe?

trod can also let an agent write its own tools mid-session and run them. Tool code runs outside the client's
permission prompts, so **execution is off unless you turn it on** (`TROD_ALLOW_EXEC=1`, meant for ephemeral cloud
containers). Notes need no execution at all. Tools run in a subprocess with a timeout and without your API keys or
tokens in their environment. trod has no telemetry, and your transcripts stay on your machine apart from the
condensed versions a learning session reads. Details: [SECURITY.md](SECURITY.md).

## How it works

1. **A learning session, separate from your work.** `trod learn`, `trod forge` and `trod tune` each start a
   headless Claude Code session whose only job is to write down what future sessions need: rules a newcomer gets
   wrong, each with the action to take.
2. **A small always-loaded layer.** The notes are linked into `CLAUDE.md` (or `AGENTS.md`, or an Antigravity rule),
   and kept short (trod warns above 6,000 characters). Rules for one kind of task go into wiki pages, which the
   agent reads, or trod's hooks add, only when a task calls for them.
3. **Live tools, if you want them.** The agent writes `.trod/tools/<name>.mjs` with its normal Write tool; trod's
   MCP server validates it, runs its examples and registers it in the same session. Good ones are promoted to a
   committed library.

## How it compares

- **`CLAUDE.md`, auto memory, Cline's Memory Bank:** notes you or the agent write as you go. trod writes them in a
  dedicated session from many sessions at once, checks them, and measures whether they help.
- **Agent Skills:** packaged know-how that someone authors. trod produces the know-how; the two work together.
- **Memory layers (Letta, Mem0, MCP memory servers):** retrieve what happened before. trod distils rules that apply
  to new tasks.
- **Research (Voyager, ExpeL, Agent Workflow Memory, ACE, Anthropic's
  [components of agent memory](https://www.anthropic.com/research/components-of-agent-memory)):** the same idea of
  learning from experience. trod is a version you can install, with its evaluations published.

## More

- [Reference](docs/reference.md): the tool format, every install route, the CLI, configuration.
- [Experiments](experiments/) and the results of each round: [1](results/README.md) … [18](results-18/README.md).
- [Design decisions](docs/adr/), [distribution](docs/distribution.md), [changelog](plugin/CHANGELOG.md).
- [Contributing](CONTRIBUTING.md) and [security](SECURITY.md).

```sh
pnpm install && pnpm check    # typecheck, lint, tests
pnpm build                    # rebuilds the bundles under plugin/ (committed)
```

MIT licensed.
