# Round 12: scheduled learning with an evidence ledger, a third round reaches 91%

Round 11 showed that notes learned from transcripts improve when sessions run with them and `trod learn` runs
again (68% → 83% → 88%). This round tests the two features built to make that loop run on its own:

- **Incremental `trod learn`.** It learns only from sessions since its last run (`.trod/learn.json`), and exits
  without a session when nothing is new, so it can run on a schedule.
- **An evidence ledger.** Each run checks every existing rule against the new sessions, which ran with the notes
  loaded, and keeps `.trod/notes.evidence.json`: per rule, how often sessions confirmed or contradicted it, and
  whether it was kept, fixed, newly added or dropped.

## Setup

- **Round 3 sessions.** Haiku ran the 30 hard MiniWoB++ task types on 120 new dev seeds (508–511), with the round 2
  notes loaded (`results-11/learned/opus-round2/`). This is what a project's ordinary sessions would look like after
  the second learning run. 103 of 120 passed.
- **Learner.** `trod learn` (Opus, the code in this repository) on those 120 transcripts with their outcomes,
  starting from the round 2 notes. As in round 11's second round, it ran in a private mount namespace that hid this
  repository and the session's home directory (it saw empty `/home/user` and `/root`), so it could not find the
  benchmark harness. $1.67, 23 turns, 4 minutes.
- **Test.** The same 30 types × test seeds 0–4 as rounds 9–11, 150 runs, Haiku 5.5, `MW_LEARNED`. No test run read
  anything outside its work directory.

## Results

| Haiku 5.5, 150 test runs | solved | full credit | $/run | learning cost so far |
|---|---|---|---|---|
| no notes (round 9) | 102 (68.0%) | 97 | 0.0034 | |
| learned, round 1 (round 11) | 124 (82.7%) | 114 | 0.0039 | $3.07 |
| learned, round 2 (round 11) | 132 (88.0%) | 121 | 0.0032 | $4.45 |
| **learned, round 3, with the ledger** | **137 (91.3%)** | **122** | **0.0033** | **$6.12** |
| *practice notes, Opus forge (round 9)* | *135 (90.0%)* | *135* | *0.0025* | *$8.01* |

- **Against no notes:** 39 runs fixed, 4 broken (exact McNemar p = 3 × 10⁻⁸); per task type 17 better, 2 worse.
- **Against round 2:** 9 fixed, 4 broken (p = 0.27). The trend continues (68 → 83 → 88 → 91), but this step alone
  is not significant.
- **Against the practice notes:** more runs solved (137 vs 135), fewer at full credit (122 vs 135): practice notes
  still pin down the exact recipes that earn full reward (timing, precise drop points).
- **draw-circle**, again: the learner found the same grader quirk as round 9's practice forge (one straight stroke
  scores) and the type went from 2/5 to 5/5. Without draw-circle, round 3 solves 132/145 and round 2 130/145.

## What the ledger did

46 rules: 35 kept, 4 fixed, 5 new, 2 dropped (`learned/notes.evidence.json`).

- **Dropped:** two rules that later sessions only contradicted, both for task types where nothing works reliably:
  a hot-cold "harmless click and screenshot" cue (0 confirmed, 4 contradicted) and a hover-shape chase loop (0/3).
- **Fixed:** the hot-cold click area (1/3), the grid drag rule (2/2), the draw-circle fallback (2/2), and an
  email-inbox rule.
- **New:** tic-tac-toe "win before you block" (4/0), a diagonal stroke check for draw-circle (4/0), a grid
  diagonal-move overshoot (2/0), one synonym per target (3/1), and a budget cap for hover-shape.
- **Still disputed:** the fixed hot-cold rule is contradicted more often than confirmed (1/3). `trod learn` prints
  that, so a reviewer sees it.

Per task type against round 2: click-menu 3 → 5, draw-circle 2 → 5, click-checkboxes-soft, drag-items-grid and
drag-shapes 4 → 5; social-media-some, stock-market and use-autocomplete 5 → 4 or 4 → 3 (one run each).

## What this means for trod

The loop works without a practice environment: ordinary sessions, then `trod learn` on a schedule, three times,
took Haiku from 68% to 91% for $6.12 of learning, and the ledger makes each round's changes reviewable (which rules
held up, which were fixed or dropped, which are still disputed). It has to run where sessions happen, since it
reads local transcripts; the reference lists the schedulers (a Claude Code Desktop scheduled task with
`/trod:learn`, cron, launchd, an Antigravity Automation).

## Caveats

- **One run per seed and arm**, as before; per-type changes of one run are noise.
- **Selection** as in round 11: the 30 types were picked by Haiku's dev failures on seeds 500–503; rounds 2 and 3
  learned from fresh dev seeds (504–507, 508–511), and test seeds 0–4 were never in any learner's sessions.
- **The ledger's counts are the learner's judgment**, not measured ablations: "contradicted" means the learner read
  a session where the rule applied and the session failed because of it or succeeded by doing something else.
- **MiniWoB is templated**, so lessons transfer more readily than in a project whose tasks rarely repeat.

To test these notes yourself, copy `learned/` into a project's `.trod/` folder (`mkdir -p p/.trod && cp -r
results-12/learned/* p/.trod/`) and run the MiniWoB suite with `MW_LEARNED=p` (it reads `p/.trod/notes.md` and
`p/.trod/wiki/`); the same holds for `results-11/learned/<arm>/`.

Files: `summary.json`, `runs.jsonl` (the 120 round 3 sessions and the 150 test runs), `learned/` (notes, wiki pages
and the evidence ledger after round 3). Code: `packages/cli/src/learn.ts` (incremental state, ledger, prompt),
`MW_SEED_OFFSET` and `MW_LEARNED` in `experiments/miniwob/miniwob.ts`.
