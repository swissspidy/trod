# trod

**Teach a small model your environment once.** trod gives Claude Code a forge: one session studies (or practises
on) your API, tooling or workflow and writes a verified tool library and rule-shaped notes. Every later session
loads them, so a cheap model works like one that already knows the place.

On the benchmarks where knowledge recurs, Haiku with forged notes beats Sonnet without them at about a tenth of the
cost per run ([site](https://swissspidy.github.io/trod/), [all experiments](https://swissspidy.github.io/trod/experiments.html)):

| Haiku 5.5, solved | alone | with forged notes |
|---|---|---|
| [MiniWoB++](results-9/README.md), 30 hardest web task types | 68% | **90%** (88% with notes Haiku forged itself, $0.79) |
| [ScienceWorld](results-8/README.md), 30 science task types | 52% | **89%** |
| [AppWorld](results-6/README.md), everyday app chores | 87.5% | **95%** (`trod forge`'s own notes: 87–90%) |
| [BIRD](results-7/README.md) text-to-SQL (each question needs its own fact) | 61% | 63% |
| [SWE-bench Verified](results-5/README.md), Django (the model already knows it) | 79.6% | 79.1% (tool library) |

**Where it shines:** internal or quirky APIs, unfamiliar codebases, repeated workflows, web and app tasks: anything
whose rules a model cannot guess but that come back in every task. **Where it doesn't:** domains the model already
knows, and tasks where each one needs a fact no earlier task taught.

## Quick start

Write `env.md`: a few lines on the API, tooling or workflow the forge should study. Then:

```sh
npx trod init --allow-exec        # set this repo up for every Claude Code session: local, cloud, mobile app
npx trod forge --brief @env.md --practice 'npm test'   # use your project's own success check
npx trod verify                   # in CI: re-check every tool and note against the environment
```

Commit what the forge wrote (`.trod/library`, `.trod/notes.md`, `.trod/notes.checks.json`, the `CLAUDE.md` import)
so every later session, cloud ones included, loads it.

Or install the Claude Code plugin: `claude plugin marketplace add swissspidy/trod`, then
`claude plugin install trod@trod`. Other MCP clients run `npx -y trod mcp`.

## How it works

1. **Live tools.** The agent writes `.trod/tools/<name>.mjs` with its normal Write tool; trod validates it, runs its
   examples and registers it in the same session. `trod_eval` combines tools in one call.
2. **The forge.** `trod forge` runs a dedicated session (any model) that builds general tools with tested examples
   and writes `.trod/notes.md`: rules a newcomer gets wrong, each with the action to take. Tools whose examples pass
   go to `.trod/library`; notes are linked into `CLAUDE.md`.
3. **Verified, not just written.** Every note can carry a check that is re-run by `trod verify`, and with
   `--practice` the forge must pass your success check at least once, or its notes are not linked.

Tool code runs outside Claude Code's permission prompts, so execution is off unless `TROD_ALLOW_EXEC=1` is set
(meant for ephemeral cloud containers; [ADR 0001](docs/adr/0001-tool-execution-and-safety.md)).

## Compared with

- **`CLAUDE.md`, auto memory, Cline's Memory Bank:** notes you or the agent write as you go. trod writes them in a
  dedicated session, from probing or practice, and does not link notes whose checks fail (or, with `--practice`,
  notes from a forge that never passed your check).
- **Agent Skills (`SKILL.md`):** packaged know-how that someone authors. trod produces the know-how; a forged
  library and notes work alongside skills.
- **Memory layers (Letta, MCP memory servers):** retrieve what happened before. trod distils rules and tools that
  apply to new tasks, and measures whether they help.
- **Runtime tool servers (e.g. DIY Tools MCP):** let an agent add tools. trod adds validation, examples, a promoted
  library and the notes, and found that the notes matter more than the tools.
- **Harness² (Google Research):** refines a whole harness per task with contrastive probes and keeps lessons in a
  persistent improvement harness (up to +11.5 points on WorkBuddy-Bench). A research framework for other executors;
  trod is a forge you run in Claude Code, gated by your own success check.
- **Anthropic's [components of agent memory](https://www.anthropic.com/research/components-of-agent-memory):**
  transcripts, notes, wikis and a small injected layer, organized by offline "dreaming". trod is a shippable instance
  of the same lessons: a small injected layer of validated rules, written by an offline forge.
- **Research (Voyager, ExpeL, Agent Workflow Memory):** the same idea of learning reusable skills from experience,
  packaged here for Claude Code with nine rounds of published, paired evaluations.

## More

- [Reference](docs/reference.md): tool format, every install route (plugin, `trod init`, cloud environments, other
  MCP clients), CLI, configuration, releasing.
- [Experiments](experiments/) and results: [round 1](results/README.md) … [round 9](results-9/README.md);
  decisions in [docs/adr](docs/adr/); [distribution](docs/distribution.md); [changelog](CHANGELOG.md).

```sh
pnpm install && pnpm check    # typecheck, lint, tests
pnpm build                    # bundles plugin/server/trod-server.mjs and plugin/bin/trod (committed)
```

MIT licensed.
