# Round 17: the full AppWorld test sets: the notes do not help beyond the sample they were chosen on

**Result:** on all 585 tasks of AppWorld's two official test sets, Haiku completes 85.8% alone and 86.5% with the
round 6 notes (+32 / −28 tasks, p = 0.70). On the 465 tasks no earlier round had touched, it is 84.3% against 83.9%.
The gain reported in round 6 (87.5% → 95%) was measured on a 120-task sample on which these notes had been picked as
the best of five sets, and it does not generalise.

Notes that `trod learn` wrote from Haiku's 90 train sessions do not help either. On the challenge set the first run
had them 24 tasks behind Haiku alone (p = 0.005); a repeat of both arms had them 7 behind (p = 0.46). Over both
runs it is 79.0% against 82.7%. Part of that is a loss that repeats in a handful of scenarios, and one of those was
traced to a learned rule that is wrong outside the train tasks.

This corrects the AppWorld claim made since round 6. The README and the site now carry these numbers.

## What ran

Rounds 6 and 15 used a sample of 40 scenarios (120 tasks) from the test sets. This round runs everything: 168 tasks
in `test_normal` and 417 in `test_challenge`, once per arm, graded by AppWorld's own database-state tests.

| Arm | What the agent has |
|---|---|
| haiku | Claude Code with Haiku 5.5, no notes |
| haiku-notes | the same, with the round 6b notes (`experiments/appworld/notes/CLAUDE.md`) as `CLAUDE.md` |
| haiku-learned | Haiku with notes `trod learn` wrote from its 90 train sessions (see below) |
| sonnet | Sonnet 5.5, no notes |
| sonnet-notes | Sonnet 5.5 with the same notes |

## Results

TGC is task goal completion. SGC is scenario goal completion: all three variants of a scenario pass. Intervals are
95% Wilson; p-values are exact McNemar tests against Haiku alone.

| Set | Arm | TGC | | SGC | Cost per task | Against Haiku alone |
|---|---|---|---|---|---|---|
| test_normal (168) | haiku | 149 | 88.7% [83.0, 92.6] | 78.6% | $0.006 | |
| | haiku-notes | 153 | 91.1% [85.8, 94.5] | 91.1% | $0.006 | +7 / −3, p = 0.34 |
| | haiku-learned | 150 | 89.3% [83.7, 93.1] | 87.5% | $0.006 | +7 / −6, p = 1.00 |
| | sonnet | 145 | 86.3% [80.3, 90.7] | 82.1% | $0.054 | +6 / −10, p = 0.45 |
| | sonnet-notes | 151 | 89.9% [84.4, 93.6] | 82.1% | $0.057 | +9 / −7, p = 0.80 |
| test_challenge (417) | haiku | 353 | 84.7% [80.9, 87.8] | 74.1% | $0.008 | |
| | haiku-notes | 353 | 84.7% [80.9, 87.8] | 75.5% | $0.008 | +25 / −25, p = 1.00 |
| | haiku-learned | 329 | 78.9% [74.7, 82.5] | 65.5% | $0.008 | +22 / −46, p = 0.005 |
| | sonnet | 350 | 83.9% [80.1, 87.1] | 69.8% | $0.078 | +29 / −32, p = 0.80 |
| | sonnet-notes | 351 | 84.2% [80.4, 87.4] | 72.7% | $0.086 | +31 / −33, p = 0.90 |
| both (585) | haiku | 502 | 85.8% [82.8, 88.4] | 75.4% | $0.008 | |
| | haiku-notes | 506 | 86.5% [83.5, 89.0] | 80.0% | $0.008 | +32 / −28, p = 0.70 |
| | haiku-learned | 479 | 81.9% [78.6, 84.8] | 71.8% | $0.008 | +29 / −52, p = 0.014 |
| | sonnet | 495 | 84.6% [81.5, 87.3] | 73.3% | $0.071 | +35 / −42, p = 0.49 |
| | sonnet-notes | 502 | 85.8% [82.8, 88.4] | 75.4% | $0.078 | +40 / −40, p = 1.00 |

The `haiku-learned` rows are a first run; a repeat [changes the picture](#notes-from-trod-learn-no-gain-and-a-few-rules-that-hurt).

Split by whether earlier rounds had used the scenario:

| Tasks | haiku | haiku-notes | haiku-learned | sonnet | sonnet-notes |
|---|---|---|---|---|---|
| the 120 sampled in rounds 6 and 15 | 110 (91.7%) | 116 (96.7%) | 107 (89.2%) | 99 (82.5%) | 105 (87.5%) |
| the other 465 | 392 (84.3%) | 390 (83.9%) | 372 (80.0%) | 396 (85.2%) | 397 (85.4%) |

## What this says

- **The round 6 gain was a selection effect.** The round 6b notes were written from train runs, but round 6
  measured five sets of notes on the same 120 test tasks and this set came out on top. Round 6d already hinted at
  the problem: notes `trod forge` wrote by itself reached only 86.7–90%, and most of the gap was one scenario whose
  three tasks the 6b notes happened to cover. On the sample the notes still score 96.7%, as in round 15. On
  everything else they change nothing.
- **Without the learned notes, no arm differs from any other.** Four arms, two models, with and without the round 6
  notes: all between 84.6% and 86.5% on 585 tasks, and all six paired tests between them far from significance (the smallest p is 0.25, Haiku with notes
  against Sonnet alone). In this harness AppWorld does not separate Haiku from
  Sonnet at all, so there is no missing knowledge for notes to supply. The remaining failures are spread evenly:
  the notes fix about as many tasks as they break.
- **Scenario completion is the one place the notes may help:** 80.0% against 75.4% on both sets (156 against 147
  scenarios), mostly from `test_normal`. That fits what notes do, making behaviour consistent across variants of
  one task, but it was not a planned comparison and is not tested here.
- **This is the pattern of round 5 (SWE-bench Django), not of rounds 8, 9 and 18.** Notes pay where a newcomer
  fails for lack of local knowledge. Haiku alone already completes 86% here.

## Against published numbers

The ACE paper ([arXiv 2510.04618](https://arxiv.org/abs/2510.04618)) reports on the same test sets, with a ReAct
agent on DeepSeek-V3.1: 63.7% TGC on test_normal and 41.5% on test_challenge for the base agent, 76.2% and 57.3%
with its learned context (offline, with ground-truth labels). The numbers here are higher for every arm, including
the ones without notes, which says the difference is the model and the harness (Claude Code with a shell), not
anything trod adds. They are not a like-for-like comparison.

## Notes from `trod learn`: no gain, and a few rules that hurt

The fifth arm repeats what worked on AutomationBench ([round 18](../results-18/README.md)): Haiku ran the 90 train
tasks alone (84 passed), and `trod learn` (Opus) wrote notes from those sessions with only pass or fail per session.
The result is 6,000 characters: nine general rules and recipes for the task families of the train set. The ledger in
[`evidence.json`](evidence.json) tracks ten claims from both parts with their counts; the notes are not published
because their recipes paraphrase train tasks.

| Set | haiku | haiku-learned | |
|---|---|---|---|
| test_normal | 149 | 150 | +7 / −6, p = 1.00 |
| test_challenge | 353 | 329 | +22 / −46, p = 0.005 |
| both | 502 | 479 | +29 / −52, p = 0.014 |

The first run looks like a clear loss on `test_challenge`. The repeat is less clear. Both arms were run a second time on
the 417 challenge tasks ([`repeat.jsonl`](repeat.jsonl)):

| test_challenge | haiku | haiku-learned | |
|---|---|---|---|
| first run | 353 | 329 | +22 / −46, p = 0.005 |
| second run | 337 | 330 | +29 / −36, p = 0.46 |
| both runs (834) | 690 (82.7%) | 659 (79.0%) | |

- **Haiku alone differs from itself** between two runs: 52 of 417 tasks change outcome (18 pass only in the second
  run, 34 only in the first), a net 16 fewer passes (p = 0.04). The first run of the baseline was a high one. A single run per task cannot resolve differences of this size, and the p-values in the
  tables above, which treat a run as the truth about a task, are too confident. That holds for every comparison in
  this round.
- **A small, real loss remains.** 18 tasks pass in both runs alone and fail in both runs with the notes; 5 go the
  other way. Most are in five scenarios.
- **One cause is identified.** The notes say "friends" means the Venmo friend list together with phone contacts
  labelled friend, a rule the learning session added from three train sessions. In the first run it changed what
  Haiku did in 16 tasks, and passes there fell from 13 to 9. One scenario fails in all six runs with the notes for this reason and passes in all six without.
  The other clustered losses are in Gmail and Amazon tasks, apps the train tasks barely use; their cause is not
  established.
- **There was little to learn from.** With six failures in 90 sessions, the learning session had almost no evidence
  about what goes wrong, and wrote down how the train tasks were solved. On AutomationBench it had 200 failures.
- **These notes were not checked on held-out tasks before the test run.** On AutomationBench a dev check came first.
  `trod tune` does this check and keeps the old notes when a rewrite scores lower
  ([round 15](../results-15/README.md)); `trod learn` alone does not.
- **Caveat on the learning step.** A first learning session wrote notes and was cut off when the API credits ran
  out; the session that finished ($1.20) started from that draft and revised it (6 rules kept, 2 fixed, 2 new).

## Files

- `runs.jsonl`: one record per run (arm, split, task id, pass, cost, turns, tokens); no task text, since AppWorld's
  data may only be redistributed encrypted. `summary.json`: the tables above. `evidence.json`: the evidence ledger of the learned notes. `repeat.jsonl`: the second run of two arms on
  `test_challenge`.
- Reproduce, per arm and split (`AW_NOTES` only for the notes arms; `claude-sonnet-5-5` for the Sonnet arms):

  ```sh
  AW_NOTES=$PWD/experiments/appworld/notes/CLAUDE.md node experiments/runner/run.ts --suite appworld:test_normal \
    --arms baseline --model claude-haiku-5-5 --as-user agent --seeds 1 --out results/runs/aw17-haiku-notes-test_normal
  node experiments/appworld/compare.ts results/aw17 haiku=results/runs/aw17-haiku \
    haiku-notes=results/runs/aw17-haiku-notes haiku-learned=results/runs/aw17-haiku-learned sonnet=results/runs/aw17-sonnet sonnet-notes=results/runs/aw17-sonnet-notes
  ```
