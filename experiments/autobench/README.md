# AutomationBench suite

[AutomationBench](https://github.com/zapier/AutomationBench) (Zapier, MIT) has 600 business workflow tasks in six
domains: sales, marketing, operations, support, finance and HR. Each task plays out in a simulated world of about 50
apps (Gmail, Slack, Sheets, Salesforce, Jira, …) reached through their REST APIs, and is graded on the final state of
those apps. A task passes when every assertion of its rubric holds.

## Setup

```sh
export AB_HOME=/opt/autobench                 # default: experiments/autobench/.cache
git clone https://github.com/zapier/AutomationBench "$AB_HOME/src"
git -C "$AB_HOME/src" checkout 4a8e106        # v1.0.6, the version round 18 used
(cd "$AB_HOME/src" && uv sync --no-dev)       # Python 3.13
chmod 700 "$AB_HOME"                          # the agent's user must not be able to read it
```

The benchmark's source holds every task's assertions, so sessions run as another OS user (`--as-user`) that cannot
read `AB_HOME`. The runner itself runs as root.

## How a task runs

- `ab_server.py` serves one task over HTTP: the benchmark's own in-memory world, its own `api` toolset
  (`api_search` and `api_fetch`) and its own rubric. Grading needs a token that only the runner has.
- `bin/ab` is the agent's side: `ab search "<query>"` and `ab fetch <METHOD> <url> [--params …] [--body …]`.
- The prompt is the benchmark's system prompt, the task, and how to call `ab`.
- `AB_NOTES=<file>` copies that file into the work directory as `CLAUDE.md`.

This differs from the benchmark's own harness in two ways. The agent calls the two tools through a shell command
instead of native tool calls. And Claude Code tells the model the machine's real date, which the benchmark's harness
does not; tasks have their own "today".

## Splits

The benchmark publishes no train/test split, so this suite makes one: each domain's 100 tasks are shuffled with a
fixed seed (`random.Random('trod-autobench-<domain>')`) and cut in half. Task ids are `<domain>-<index>`.

| File | Tasks | Use |
|---|---|---|
| `train.json` | 300 | everything learning may see |
| `learn.json` | 240 | train without dev: the sessions `trod learn` reads |
| `dev.json` | 60 | the last 10 train tasks per domain: a check before touching test |
| `test.json` | 300 | held out; only run with finished notes |
| `pilot.json` | 30 | the first 5 train tasks per domain, for trying the setup |

## Run

```sh
node experiments/runner/run.ts --suite autobench:test --arms baseline --model claude-haiku-5-5 \
  --as-user agent --seeds 1 --parallel 6 --out results/runs/ab-test-haiku
AB_NOTES=$PWD/results-18/notes.md node experiments/runner/run.ts --suite autobench:test --arms baseline \
  --model claude-haiku-5-5 --as-user agent --seeds 1 --parallel 6 --out results/runs/ab-test-haiku-learned
node experiments/autobench/compare.ts out haiku=results/runs/ab-test-haiku haiku-learned=results/runs/ab-test-haiku-learned
```

`compare.ts` prints per arm the tasks passed with a 95% Wilson interval, the mean share of assertions satisfied,
cost per task, passes per domain, and the paired outcome against the first arm with an exact McNemar test.
[Round 18](../../results-18/README.md) has the results.
