# trod

**Teach a small model your environment once.** trod gives Claude Code a forge: one session studies (or practises
on) your API, tooling or workflow and writes a verified tool library and rule-shaped notes. Every later session
loads them, so a cheap model works like one that already knows the place.

On the benchmarks where knowledge recurs, Haiku with forged notes beats Sonnet without them at about a tenth of the
cost per run ([site](https://swissspidy.github.io/trod/), [all experiments](https://swissspidy.github.io/trod/experiments.html)):

| Haiku 5.5, solved | alone | with forged notes |
|---|---|---|
| [MiniWoB++](results-9/README.md), 30 hardest web task types | 68% | **90%** (91% after three rounds of [learning from past sessions](results-12/README.md), 94% after [validated tuning](results-13/README.md), [95%](results-14/README.md) with an exact right angle: 98.6% of the scoreable runs) |
| [ScienceWorld](results-8/README.md), 30 science task types | 52% | **89%** |
| [AppWorld](results-6/README.md), everyday app chores | 87.5% | **95%** (`trod forge`'s own notes: 87–90%) |
| [BIRD](results-7/README.md) text-to-SQL (each question needs its own fact) | 61% | 63% |
| [SWE-bench Verified](results-5/README.md), Django (the model already knows it) | 79.6% | 79.1% (tool library) |

**Where it shines:** internal or quirky APIs, unfamiliar codebases, repeated workflows, web and app tasks: anything
whose rules a model cannot guess but that come back in every task. **Where it doesn't:** domains the model already
knows, and tasks where each one needs a fact no earlier task taught.

## Quick start

Already using Claude Code in this repo? Learn from the sessions you have had, with no setup:

```sh
npx trod init                     # set this repo up for every Claude Code session: local, cloud, mobile app
npx trod learn                    # distil notes from Claude Code's transcripts of this project's sessions
```

(`learn` and `forge` let their own session run tools. For later sessions to run forged tools too, opt in with
`npx trod init --allow-exec`, meant for ephemeral cloud containers; see the note below.)

`trod learn` compares sessions that failed with ones that worked and writes rules (plus a page per kind of task when
there are many). On MiniWoB++ it took Haiku from 68% to 81–83% from 120 old sessions, to 88% after one more
round of sessions and learning, and to 91% after a third ([rounds 11](results-11/README.md) and [12](results-12/README.md)). Run it on a schedule where your sessions
happen (a Claude Code Desktop scheduled task with `/trod:learn` from the plugin or `/trod-learn` after `trod init`,
cron, or an Antigravity Automation): each run
learns only from new sessions, checks every existing rule against them, and leaves a diff to review
([keep learning](docs/reference.md#keep-learning)). `npx trod report` shows how sessions changed since the notes
were linked: turns, failed tool calls, follow-up prompts, tokens ([is it helping?](docs/reference.md#is-it-helping)).
`npx trod notes --delivery hooks` makes that comparison randomized: trod's hooks load the notes (and only the wiki
pages a prompt calls for), and leave them out of 10% of sessions ([hooks delivery](docs/reference.md#hooks-delivery-only-the-rules-that-apply-and-a-holdout)).

To study something new instead, write `env.md` (a few lines on the API, tooling or workflow) and forge:

```sh
npx trod forge --brief @env.md --practice 'npm test'   # use your project's own success check
npx trod verify                   # in CI: re-check every tool and note against the environment
```

Commit and push what `init`, `learn` and `forge` wrote (`.mcp.json`, `.claude/`, `.gitignore`, `.trod/library`,
`.trod/notes.md`, `.trod/notes.checks.json`, `.trod/notes.evidence.json`, `.trod/wiki/`, the `CLAUDE.md` import) so every later session, cloud
ones included, loads it.

Or install the Claude Code plugin: `claude plugin marketplace add swissspidy/trod`, then
`claude plugin install trod@trod`. In Antigravity: `agy plugin install https://github.com/swissspidy/trod` (or
`npx trod init --antigravity` per repository; execution stays off until you opt in, see the reference). In Codex:
`npx trod init --codex` per repository (`trod learn` reads Codex sessions too). Other MCP clients run `npx -y trod mcp`.

## How it works

1. **Live tools.** The agent writes `.trod/tools/<name>.mjs` with its normal Write tool; trod validates it, runs its
   examples and registers it in the same session. `trod_eval` combines tools in one call.
2. **The forge.** `trod forge` runs a dedicated session (any model) that builds general tools with tested examples
   and writes `.trod/notes.md`: rules a newcomer gets wrong, each with the action to take. Tools whose examples pass
   go to `.trod/library`; notes are linked into `CLAUDE.md`.
3. **Learning from experience.** `trod learn` runs the same kind of session over the transcripts of past sessions:
   what failed, what worked instead, which rule would have prevented the failure.
4. **Verified, not just written.** Every note can carry a check that is re-run by `trod verify`, and with
   `--practice` the forge must pass your success check at least once, or its notes are not linked.

Tool code runs outside Claude Code's permission prompts, so execution is off unless `TROD_ALLOW_EXEC=1` is set
(meant for ephemeral cloud containers; [ADR 0001](docs/adr/0001-tool-execution-and-safety.md)).

## Compared with

- **`CLAUDE.md`, auto memory, Cline's Memory Bank:** notes you or the agent write as you go. trod writes them in a
  dedicated session, from probing, practice or many past sessions at once, and does not link notes whose checks fail (or, with `--practice`,
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
  packaged here for Claude Code with twelve rounds of published, paired evaluations.

## More

- [Reference](docs/reference.md): tool format, every install route (plugin, `trod init`, cloud environments, other
  MCP clients), CLI, configuration, releasing.
- [Experiments](experiments/) and results: [round 1](results/README.md) … [round 14](results-14/README.md);
  decisions in [docs/adr](docs/adr/); [distribution](docs/distribution.md); [changelog](plugin/CHANGELOG.md).

```sh
pnpm install && pnpm check    # typecheck, lint, tests
pnpm build                    # bundles plugin/server/trod-server.mjs and plugin/bin/trod (committed)
```

MIT licensed.
