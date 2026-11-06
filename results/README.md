# Results: do self-made tools pay off?

**Short answer: not on these tasks, with this model.** Sonnet 5.5 solved all 120 sessions in every arm. Given
trod, it almost never built a tool on its own (1 of 24 repetitive sessions). When it was required to build tools,
sessions cost **1.84× as much** as plain Bash, even though every tool was reused 3–4 times. Tools carried over from
an earlier session (the `trod promote` path) broke even overall: 0.98× cost, though 1.15× the turns. They helped
when the spec was fiddly (Markdown link checking: **0.69×** cost) and hurt when it was easy (log analysis: 1.16×).

Open [`report.html`](report.html) for the charts and all numbers. The raw per-run records are in
[`runs.jsonl`](runs.jsonl), and the tools that emerged are in [`tools/`](tools/).

## Setup

- 10 tasks ([experiments/README.md](../experiments/README.md)). 8 have repetition built in, each a 3-step session:
  the follow-up prompts bring new data. 2 are one-off controls.
- 4 arms × 3 seeds, 120 headless `claude -p` sessions on `claude-sonnet-5-5`. Total cost $15.99.
  - **baseline:** Bash only
  - **genesis:** the trod server and skill; the agent decides
  - **nudged:** genesis plus a system-prompt requirement to build repeated operations as trod tools
  - **library:** genesis, with the nudged run's tools pre-installed in `.trod/library/`

## Numbers (repetitive tasks, mean per 3-step session)

| arm | pass | cost | × baseline | turns | wall | tokens | tools built | trod calls |
|---|---|---|---|---|---|---|---|---|
| baseline | 24/24 | $0.131 | 1.00 | 7.7 | 25 s | 145k | – | – |
| genesis | 24/24 | $0.144 | 1.10 | 8.3 | 28 s | 158k | 1 (in 1 run) | 3 |
| nudged | 24/24 | $0.241 | 1.84 | 15.8 | 39 s | 289k | 24 (1 per run) | 75 |
| library | 24/24 | $0.128 | 0.98 | 9.0 | 25 s | 163k | 0 (reused in 12 runs) | 37 |

Controls (one-off tasks) cost the same in every arm, within about ±10%. Merely having trod available adds no
measurable overhead on one-off work.

Cost per step (mean USD; steps 2 and 3 are the reuse opportunities):

| arm | step 1 | step 2 | step 3 |
|---|---|---|---|
| baseline | 0.035 | 0.044 | 0.052 |
| nudged | 0.069 | 0.081 | 0.092 |
| library | 0.034 | 0.043 | 0.051 |

## What we learned

1. **A script on disk is already a tool.** Given N items, the agent writes one parameterized script in the first step
   (`report.py logs_dir out.json`) and re-runs it with new arguments in the follow-ups. That costs about 2 turns per
   follow-up. trod competes with this, not with retyping a pipeline each time. Without a nudge, the agent opened
   the trod skill and still wrote a script.
2. **Building a trod tool costs about 3× the turns of writing the script.** Step 1 took 10.3 turns nudged against
   3.5 for baseline: write `tool.json`, write `run.mjs`, `trod_status`, ToolSearch to load the deferred tool, the
   call, often a fix. Messages that built or checked tools account for 13–32% of the session's tokens.
3. **The overhead does not stay in step 1.** In the reuse steps, nudged still costs about 1.8× baseline per step.
   The tool-building turns sit in the resumed context and are read again on every later turn. Calling the tool
   was not cheaper than re-running a script either: 2.8 against 2.2 turns per follow-up, partly because the tool
   has to be loaded through ToolSearch again after each resume.
4. **Reuse across sessions works, and is limited by trust.** With library tools present, the agent used them in
   12 of 24 sessions. Before the first call it inspected the tool's files in 9 of those 12, usually reading the source to check it against the spec. For
   an easy task (log analysis) that check costs more than writing a fresh 40-line script (1.16× baseline). For a
   fiddly spec (Markdown links and anchors) the tool saved real work (0.69×). CSV cleaning came out at 0.87×.
5. **The tools that emerged are task-sized, not composable.** All 24 were one `run.mjs` per task of 33–79 lines,
   taking a directory and writing a file (side effects, not return values). None declared `examples`, although
   the skill recommends them. When the follow-up questions changed (api-query), the agent extended the existing
   tool with new parameters 2–6 times instead of making new ones, as the skill asks. No tool call failed.
6. **Success did not separate the arms.** Every session passed. These tasks measure cost, not capability. A
   harder suite, where a pipeline keeps failing (the skill's second reason to build a tool), is the obvious next
   experiment.

## What would change the economics

- **Cheaper creation:** one `tool.json` that holds the code inline, or `trod_status` replies that hand back the
  ready-to-call tool, would save turns. Making the agent's first script promotable, by wrapping a script it
  already wrote, would avoid writing the logic twice.
- **No reload tax:** keep session tools loaded across resumes instead of deferring them behind ToolSearch.
- **Trust:** a short "spec" and passing `examples` in `tool.json` would let a later session trust a tool without
  reading its code. That is the case where library reuse paid off.
- **Tasks where it matters:** long sessions with many small, interleaved repetitions, and pipelines that are
  hard to get right, rather than a few large batchable steps.

## Caveats

One model (Sonnet 5.5) and 3 seeds per cell. Across seeds, cost varies by 5% (median coefficient of variation per task
and arm; 39% in the worst cell), so treat single-task differences under about 15% as noise. Fixtures are synthetic and local. Cost is Claude Code's own list-price accounting with prompt
caching. The nudged arm measures forced tool building, which is an upper bound on its overhead.
