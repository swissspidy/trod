# Experiment: do self-made tools pay off?

Headless `claude -p` sessions on tasks with machine-checkable outcomes, with and without trod.

## Tasks

Thirteen tasks in [`tasks/`](tasks/): the ten below, and three added in later rounds (`code-qa`, `ticket-triage`
and `inventory-api`; see their files). Each fixture is generated deterministically, so every arm and seed sees the
same data. Results are checked against expected outcomes that the agent cannot see (they are stored outside its
working directory). The eight repetitive tasks are **3-step sessions**: the first prompt does the work for a batch
of items. Two follow-up prompts in the same session (`claude -p --resume`) then ask for the same kind of work again,
on new data or with a variation. Repetition is therefore present both inside a step (many items) and across steps
(the same operation later), which is where a reusable tool could pay off.

| Task | Items per step | Steps | Follow-ups bring |
|---|---|---|---|
| `page-audit` | 30 pages of a local site (status, title, h1 count, broken links) | 3 | a redeployed site |
| `csv-clean` | 8 messy CSV exports | 3 | 6 + 6 new files |
| `bulk-refactor` | 24 modules: `log(level, …)` → `logger.<level>(…)`, plus a rename | 3 | 12 + 12 new modules |
| `api-query` | 45 users behind a paginated API that rate-limits (429) | 3 | different questions |
| `browser-check` | 15 JS-rendered product pages (needs Playwright) | 3 | changed prices and stock |
| `log-analysis` | 20 service logs (error counts, top code, p95) | 3 | the next days' logs |
| `md-links` | 25 Markdown files (broken links and anchors) | 3 | rewritten docs |
| `config-migrate` | 30 JSON configs, v1 → v2 | 3 | 15 + 15 more |
| `control-bugfix` | one bug in one function | 1 | – |
| `control-question` | one question about one CSV | 1 | – |

`test/tasks.test.ts` checks that each fixture is deterministic, that an empty run fails, and that a known-correct
answer passes every step. For `csv-clean` that answer comes from an independently written reference cleaner.

## Arms

| Arm | What the agent has |
|---|---|
| `baseline` | Bash, Read, Write, Edit, Glob, Grep. No MCP servers, no trod skill. |
| `genesis` | the same, plus the trod server (`--mcp-config`) and the trod skill (`--plugin-dir plugin`), `TROD_ALLOW_EXEC=1`. The agent decides whether to build tools. |
| `nudged` | genesis, plus an appended system prompt that **requires** building repeated operations as trod tools instead of Bash-run scripts. It measures what tool building costs when it happens. |
| `library` | genesis with no nudge, but `.trod/library/` starts with the tools that a nudged run of the same task built (as if promoted and committed by an earlier session). It measures cross-session reuse. |
| `scripts` | baseline tools only, but in `--mode sessions` the whole work dir carries over between steps, so scripts the agent wrote survive. |
| `toolsmith` | genesis, after one dedicated session in the same run that builds general tools for the task's kind of work. |
| `forged` | genesis with the library and notes that `trod forge` built once per task (or per `forgeKey`) with `--forge-model`. In `--mode sessions` only the library carries over to later steps; the notes are in the first step only. |

`--mode resume` (default) sends each step as a follow-up in the same session; `--mode sessions` starts a fresh session
in a fresh checkout per step, as with ephemeral cloud containers. Two arms differ: `toolsmith` always uses a fresh
session and checkout per step, and `scripts` keeps its work dir in `sessions` mode. `--suite` runs a benchmark instead of the built-in
tasks: `swe-django4`, `appworld:<split>`, `bird:test`, `sciworld:test`, `miniwob:test` or `miniwob:dev` (each has a
folder here with its setup). `--as-user <name>` runs the sessions as an unprivileged user (it uses `runuser` and `chown`, so the runner itself
must run as root).

Every run is isolated: its own work dir, `HOME` and `CLAUDE_CONFIG_DIR`, and a clean environment (no synced plugins
or user settings). It uses `--strict-mcp-config` and disables WebFetch/WebSearch/Task, has a per-step budget cap
(`--max-budget-usd`) and a session timeout.

## Metrics

From each run's `stream-<step>.jsonl`, the session transcript (`$CLAUDE_CONFIG_DIR/projects/**.jsonl`, usage
deduplicated by API message id) and the trod logs (`work/.trod/logs`):

- success (all steps pass) and the mean score per step
- total tokens (input + cache creation + cache read + output) and output tokens
- turns, cost (USD, from the CLI's own accounting) and wall time
- tools created, trod calls, calls per created tool
- **creation overhead**: the tokens of assistant messages that wrote `.trod/tools` files or called `trod_status`

## Running

```sh
export ANTHROPIC_API_KEY=...          # or TEST_API_KEY
node experiments/runner/run.ts --seeds 3 --parallel 6 --out results/runs/main
node experiments/runner/run.ts --arms library --seeds 3 --library-from results/runs/main --out results/runs/main
node experiments/runner/report.ts results/runs/main --out results --writeup results/writeup.html
```

Finished runs are skipped when rerun with the same `--out`. The **Experiment** GitHub Actions workflow
(manual dispatch, needs the `ANTHROPIC_API_KEY` secret) runs the same thing and uploads the results.
