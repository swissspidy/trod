# Rounds 2 and 3: making self-made tools pay off

> Round 4 ([results-4/README.md](../results-4/README.md)) builds on this: forge once with Opus, run with Haiku.

Round 1 ([results/README.md](../results/README.md)) ended with "not on these tasks". Rounds 2 and 3 asked why, fixed
what was fixable in trod, and looked for the setting where tools do pay off. **Short answer: they pay off as an
asset, not as a mid-task trick.**

- A library of tools built once, robustly, cut a later session's tokens by **26%**, with no failures. That was
  four fresh sessions against a quirky internal API. The investment pays for itself after about **12 sessions**.
- Sonnet-built library tools cut a cheaper model's (Haiku 5.5) tokens by **36%** on average. On the call-graph task
  the cut was **4.4×**, with perfect scores and far less variance.
- Building tools *within* a task still does not beat writing a script. With trod 0.2 it is down from 1.84× to
  1.25× baseline tokens, and at parity on one task.

Reports: [round 2 (Sonnet)](report.html) · [round 2, Haiku with library](../results-2-haiku/report.html) ·
[round 3 (fresh sessions)](../results-3/report.html). Raw per-run records are in each directory's `runs.jsonl`.

## What changed in trod (0.2)

Round 1 measured where the overhead came from: building a tool took about 3× the turns of writing a script. The
fixes, in [ADR 0002](../docs/adr/0002-tool-loading-and-the-prompt-cache.md):

| Problem (round 1) | Fix (0.2) |
|---|---|
| Two files per tool | One file: `.trod/tools/<name>.mjs` exporting `meta` and a function |
| A `trod_status` turn to learn whether the tool registered | A PostToolUse hook reports it in the Write's own result |
| A ToolSearch turn per new tool, and again after every resume | `trod_run {tool, input}`, a permanent, always-loaded tool that calls any trod tool at once |
| The agent only learned about trod from the skill | The format is in the server instructions (system prompt) |
| Library tools were read before use | Promotion runs the examples, and library descriptions say "verified, call directly" |

**A dead end worth recording:** turning tool search off removes the ToolSearch turn, but it made *every* arm about
2.7× more expensive. All tool schemas go into every request (about 13k tokens more). Worse, a tool added mid-session
rewrites the whole prompt cache, because tool definitions sit at the start of the cached prefix. Tool search exists
to keep the cache valid as the tool list grows. `trod_run` keeps the tool list fixed instead.

## Round 2: within a session (Sonnet 5.5, 6 tasks + control, 3 seeds, resumed sessions)

Two new tasks were added where per-item reasoning sits on top of fiddly, repeated lookups:
- `code-qa`: call-graph questions about a generated codebase of about 120 modules, with aliases, barrels and
  colliding names
- `ticket-triage`: an HMAC-signed, paginated, rate-limited support API plus a written triage policy

| arm | score | full pass | tokens / session | × baseline | turns | runs that built tools |
|---|---|---|---|---|---|---|
| baseline | 0.990 | 83% | 166k | 1.00 | 8.3 | – |
| genesis (agent decides) | 0.965 | 83% | 212k | 1.28 | 10.9 | **16 / 18** (round 1: 1 / 24) |
| nudged (required) | 0.993 | 89% | 207k | 1.25 | 10.6 | 18 / 18 |
| library (nudged run's tools pre-installed) | **1.000** | **100%** | 205k | 1.23 | 11.2 | reused |

- **Adoption is solved.** The format in the system prompt took unprompted tool building from 1 in 24 sessions to
  16 in 18. Having trod costs nothing on the one-off control (50k vs 52k tokens).
- **The overhead is much smaller but still there.** On `ticket-triage`, nudged used 0.97× baseline tokens. Elsewhere
  a tool still takes a turn or two more than the script Sonnet writes in one go. Within a single session a tool can
  at best tie with a script: both get written once and re-run.
- **The library arm never failed.** Its tools came from a run whose analyzer was right. The baseline's ad-hoc
  scripts made one systematic mistake in every seed of `code-qa`.
- **A ground-truth bug was found and fixed along the way.** `main.js:main` was missing from the `code-qa` call
  graph, and every arm's "mistake" on one question was actually correct. The questions stayed byte-identical, and
  all runs were re-scored (`experiments/runner/rescore.ts`).

## Round 2b: a cheaper model with a library (Haiku 5.5, 3 seeds)

Same tasks. The `library` arm gets the tools Sonnet built in round 2.

| arm | score | tokens / session | × baseline | turns |
|---|---|---|---|---|
| baseline | 0.997 | 524k | 1.00 | 12.6 |
| library | **1.000** | **333k** | **0.64** | 12.8 |

Per task, library tokens as a multiple of baseline:

| code-qa | page-audit | md-links | log-analysis | ticket-triage | api-query |
|---|---|---|---|---|---|
| **0.23** | 0.75 | 0.88 | 1.10 | 1.38 | 1.61 |

On `code-qa`, Haiku from scratch used anywhere from 491k to 3.7M tokens per session, while burning through
attempts at the analysis. With Sonnet's `callgraph` tool, every run was perfect at 343–434k. **Tools carry
capability from a stronger model to a cheaper one.** They don't help where the inherited tool doesn't fit the
day's question (`api-query`, `ticket-triage`).

## Round 3: across fresh sessions (Sonnet 5.5, inventory API, 4 sessions, 3 seeds)

Each step is a fresh session in a fresh checkout, as with ephemeral cloud containers. The `inventory-api` task is
an internal API with thin docs and undocumented quirks:
- the auth header is only hinted at in `WWW-Authenticate`
- filters take epoch seconds
- numbers use European formats and a Unicode minus
- archived items and reversal movements must be handled
- 429s come without a `Retry-After` header

Each session asks a different question. Arms:
- `baseline`: nothing carries over
- `scripts`: the whole work directory carries over (the fair control)
- `genesis`, `nudged`: the harness promotes their valid tools to `.trod/library` between sessions
- `toolsmith`: one dedicated session first builds robust, general tools, then the four question sessions run with
  them, unnudged

| arm | full pass | tokens (4 sessions) | × baseline | turns |
|---|---|---|---|---|
| baseline | 3 / 3 | 518k | 1.00 | 28.0 |
| scripts | 2 / 3 | 504k | 0.97 | 27.7 |
| genesis | 2 / 3 | 547k | 1.06 | 28.3 |
| nudged | 3 / 3 | 679k | 1.31 | 33.7 |
| **toolsmith** | **3 / 3** | **385k** | **0.74** | **22.3** |

- **A library built for reuse pays off.** The toolsmith sessions took 5–6 turns each, against 6–10 for baseline. The
  one-off toolsmith session cost about 386k tokens ($0.19), and each later session saves about 33k. **Break-even
  comes after about 12 sessions.** That suits an API a team works with daily, not a one-off.
- **Tools built in passing don't transfer.** Nudged sessions built answer-shaped tools (`stock_value`, `reorder`)
  that the next session's question could not use, so they kept adding new ones: 1.31×. Unnudged genesis built no
  tools at all in fresh sessions. Leftover scripts (the `scripts` arm) saved 3%.
- **Robustness matters more than existence.** In early probes a library tool without proper backoff timed out
  (trod 0.1's 30 s limit). The next session then distrusted it and rebuilt everything. trod's default timeout is
  now 120 s. The toolsmith's tools shipped with passing examples and backoff.

## What we learned about agent behaviour

1. **A script on disk is already a tool.** Within a session, trod competes with "write `report.py`, run it again",
   and that costs a capable model one turn.
2. **Reuse costs trust.** A fresh session reads the docs, lists the files, reads an inherited tool's source and
   often cross-checks the API with curl before relying on anything. That floor is about 5 turns per session. Tools
   save turns only above it.
3. **Capabilities transfer; answers don't.** A tool that returns clean records serves tomorrow's question. A tool
   that computes today's total does not. The skill and server instructions now say so, but agents building
   mid-task still default to answer-shaped tools. A dedicated toolsmith session gets it right.
4. **The economics favour cheap models and long horizons.** The bigger the gap between "build it right" and "use
   it", the more a library pays: a weaker model using a stronger model's tools, or many sessions on the same
   environment.

## Where this points

- Make building tools a **separate, deliberate step**. A `trod forge` command or a scheduled session could build
  and test tools for a repository's recurring environments, rather than expecting agents to do it mid-task.
- **Route by model.** Use the strong model to build and the cheap model to execute.
- Let a later session **trust a tool without reading it.** Examples that double as a spec, and
  `trod_status` showing usage history from earlier sessions, could cut the remaining verification turns.

## Caveats

- Sonnet 5.5 and Haiku 5.5 only, 3 seeds per cell. Round 3 covers one task, with high variance between toolsmith
  sessions (320–422k tokens).
- Token totals are the primary metric. List-price cost is reported but noisy: parallel runs share the
  organisation's prompt cache, so whichever run writes a shared prefix first pays for it.
- Fixtures are synthetic and served locally.
