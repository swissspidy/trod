<p align="center"><img src="assets/logo.svg" alt="" width="72"></p>

# trod

[![CI](https://github.com/swissspidy/trod/actions/workflows/ci.yml/badge.svg)](https://github.com/swissspidy/trod/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Generated context files usually do not help coding agents. trod shows when they do.**

Published studies find that LLM-written AGENTS.md files do not raise success on well-known repositories
([Gloaguen et al., 2026](https://arxiv.org/abs/2602.11988)), and that skills a model writes for itself before trying a
task do not help either ([SkillsBench](https://arxiv.org/abs/2602.12670)). trod's own runs agree: no gain on SWE-bench
Django, BIRD or the full AppWorld test sets.

Where the model lacks the knowledge and the same knowledge comes back in every task (an internal API, in-house tooling,
an unfamiliar workflow), trod writes notes from graded attempts, practice or past sessions, and can hold them back
until they pass your check (`--practice`, note checks, or held-out tasks with `trod tune`). On an invented API that no model can have seen, trod's notes took Haiku 5.5 from 75% to 99–100% and
Opus 5.5 from 69% to 100%, while the CLAUDE.md that Claude Code's `/init` wrote did not help (63% and 75%). On public
benchmarks Haiku went from 17% to 36% on AutomationBench, 68% to 90% on MiniWoB++ and 52% to 89% on ScienceWorld.

```sh
npx trod init       # set this repository up (commit what it writes)
npx trod learn      # write notes from the Claude Code sessions you have already had
npx trod doctor     # see what trod knows here and what to do next
```

> trod is not on npm yet. Until the first release, install the plugin (below), or clone this repository and run
> `node <clone>/plugin/bin/trod init --vendor` in your project.

## Results

Held-out test tasks the learning session never saw; same model and tasks with and without trod
([site](https://swissspidy.github.io/trod/), [all rounds](https://swissspidy.github.io/trod/experiments.html)):

| Tasks solved by Haiku 5.5 | alone | with trod |
|---|---|---|
| [Zorbit](results-19/README.md): an invented API with twelve quirks, 40 tasks | 75% | **100%** (forge), **99%** (learn); `/init`'s file: 63% |
| [AutomationBench](results-18/README.md): business workflows across 50 apps, 300 tasks | 17% | **36%** (learned notes) |
| [MiniWoB++](results-9/README.md): 30 hardest web task types | 68% | **90%** (practice notes); [95%](results-14/README.md) after tuning |
| [ScienceWorld](results-8/README.md): 30 kinds of science task | 52% | **89%** (notes from expert runs) |
| [AppWorld](results-17/README.md): everyday chores in 9 apps, all 585 test tasks | 85.8% | 86.5% (notes) |
| [BIRD](results-7/README.md): text-to-SQL | 61% | 63% (notes) |
| [SWE-bench Verified](results-5/README.md): Django issues | 79.6% | 79.1% (a forged tool library; notes were not tested) |

On Zorbit, Opus 5.5 solves 69% alone and 100% with the same notes, at a third of the cost per run. On AutomationBench,
MiniWoB++ and ScienceWorld, Haiku with notes also beats Sonnet without them (30%, 67% and 67%). Corrections are published
with the same care: an earlier AppWorld gain measured on a 120-task sample [did not hold](results-17/README.md) on the
full test sets, and notes learned there carried a rule that broke tasks.

**What trod has and has not shown.** In round 19 an unrelated notes file of similar length did not help (66%), so there
the gain came from the notes' content, not the priming effect [Zhang et al.](https://arxiv.org/abs/2604.11088) found on
SWE-bench. That is one invented environment whose quirks can all be found by probing it; knowledge that exists only in
people's heads has not been tested.

## When not to use trod

- **A frontier model on a well-known stack.** The model already knows what notes would say. trod measured no gain on
  SWE-bench Django, and the AGENTS.md studies agree.
- **A short AGENTS.md is enough.** If you know the few things every session gets wrong, write them down. Do not assume a
  generated one helps: on Zorbit, `/init`'s file stated 3 of 12 quirks plus one wrong guess, and cut Haiku from 75% to 63%.
- **The model already does well.** On AppWorld, Haiku completes 86% alone; notes added nothing.
- **Each task needs its own fact.** On BIRD, notes from other questions did not raise accuracy.
- **Nothing to learn from.** trod needs graded attempts, past sessions or an environment to explore. On Zorbit a forge
  that only probed the live service did as well as one that practised; the self-generated skills in SkillsBench, written
  with little exploration and no attempts, did not help.
- **You want to prune or enforce a rules file you already have.** Use [ruleprof](https://pypi.org/project/ruleprof/) or
  [obey](https://github.com/B0yko/obey) (see below).

## Three ways to teach it

**From the sessions you already had.** `trod learn` reads the transcripts Claude Code keeps for this project, compares
sessions that went wrong with ones that went right, and writes the rules that would have prevented the failures.

```sh
npx trod learn --dry-run     # which sessions it would read; starts nothing
npx trod learn               # one learning session; review the diff, then commit
npx trod learn --auto 10     # or keep learning by itself, after every 10 sessions
```

**By practising on something new.** Describe an API, tool or workflow, give it a command that says whether an attempt
succeeded, and `trod forge` practises against it before writing notes.

```sh
npx trod forge --brief @env.md --practice 'npm test'
```

**Against your own tasks.** List tasks with a command that checks each one, and `trod tune` keeps a rewrite of the
notes only if it passes more held-out tasks than the current notes (`.trod/tune.json`, `npx trod tune --dry-run`).

What comes out is plain text in your repository: `.trod/notes.md` (rules, each with the action to take), optional
`.trod/wiki/` pages and `.trod/library/` tools. You review it in a pull request like any other change.

## What the gates check

- **Practice:** with `--practice`, notes are linked only if the forge passed your check at least once.
- **Held-out tasks:** `trod tune` rejects a rewrite that does not beat the current notes on validation tasks.
- **Evidence:** `trod learn` counts how often later sessions confirmed or contradicted each rule, and fixes or drops
  rules contradicted more often than confirmed.
- **Checked claims:** a note can carry a check that runs a library tool; `npx trod verify` in CI fails when a check or a
  tool example fails. Notes without a check are not verified by it, and it does not measure whether a note helps.
- **Measured:** `npx trod report` compares your sessions with and without notes; with `npx trod notes --delivery hooks`,
  a random 10% of sessions get no notes, so the comparison is an experiment.

## Compared with

- **[ruleprof](https://pypi.org/project/ruleprof/):** removes one block of your CLAUDE.md at a time and measures whether
  the agent still follows it, with intervals and the token cost of each block. Better than anything trod has for pruning
  a rules file; use it. It measures adherence, not task success.
- **[obey](https://github.com/B0yko/obey):** checks whether agents follow each rule against a no-rule baseline, and turns
  rules into hooks. Use it to enforce rules; trod enforces nothing.
- **[rulebench](https://pypi.org/project/rulebench/):** trap tests for a rule set across configurations, reporting which
  tests told the configurations apart at all.
- **[context-eval](https://jasonxzwen.github.io/context-eval/):** a general A/B harness for context variants on your own
  repository; `trod tune` does this only for the notes trod writes.
- **[NVIDIA SkillEvaluator](https://developer.nvidia.com/blog/evaluating-ai-agent-skill-performance-with-nvidia-skillevaluator/):**
  measures the lift of a skill you already have. trod writes notes; it does not evaluate skills.
- **[Antigravity /learn](https://antigravity.google/docs/commands/learn/):** turns your corrections in one session into
  a rule or skill after you approve it, with no automated check. `trod learn` reads many sessions, compares failures with
  successes and keeps an evidence ledger, with no approval step.
- **CLAUDE.md, auto memory, Agent Skills, memory layers:** you or the agent write notes as you go, or retrieve past
  history; curated skills are measured by SkillsBench (+16pp on average). trod writes the content and measures it.
- **Research on learning from experience (Voyager, ExpeL, Agent Workflow Memory, ACE):** the same idea; trod is a
  version you can install, with its evaluations published.

## Install

```sh
npx trod init                # Claude Code: local, cloud and mobile-app sessions of this repository
npx trod init --codex        # Codex
npx trod init --antigravity  # Antigravity
claude plugin marketplace add swissspidy/trod && claude plugin install trod@trod   # or the plugin, no npm
```

Any other MCP client can run the server with `npx -y trod mcp`. trod can also let an agent write and run its own tools
mid-session; that is off in your sessions unless you set `TROD_ALLOW_EXEC=1`, and notes need no execution at all. The
learning sessions that `trod forge`, `trod learn` and `trod tune` start do run tools, so run those where that is fine.
trod has no telemetry.
See the [reference](docs/reference.md) for how it works and every option, and [SECURITY.md](SECURITY.md).

## More

[Experiments](experiments/) and the results of each round ([1](results/README.md) … [19](results-19/README.md)),
[design decisions](docs/adr/), [distribution](docs/distribution.md), [changelog](plugin/CHANGELOG.md),
[contributing](CONTRIBUTING.md). `pnpm install && pnpm check` runs typecheck, lint and tests; `pnpm build` rebuilds the
bundles under `plugin/`. MIT licensed.
