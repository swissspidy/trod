# Round 18: AutomationBench: notes learned from past sessions double Haiku's pass rate, past Sonnet

**Result:** on 300 held-out [AutomationBench](https://github.com/zapier/AutomationBench) tasks, Haiku passes 50
(16.7%) alone and 109 (36.3%) with the notes `trod learn` wrote from its own earlier sessions: 66 tasks fixed, 7
broken, p < 0.0001. Sonnet without notes passes 91 (30.3%) at twelve times the cost per task, and 133 (44.3%) with the same notes.
The learning session cost $1.95.

AutomationBench is Zapier's benchmark of business workflows: 600 tasks in sales, marketing, operations, support,
finance and HR, each in a simulated world of about 50 apps reached through their REST APIs. A task passes only when
every assertion about the final state of those apps holds. It was not used in any earlier round, and nothing in trod
was written with it in mind.

## What ran

| Step | What | Cost |
|---|---|---|
| 1 | Haiku alone on the 300 train tasks: 54 passed (18.0%) | $3.04 |
| 2 | `trod learn` (Opus) on the 240 train sessions outside dev, with only pass or fail per session | $1.95 |
| 3 | Check on the 60 dev tasks: 11 → 20 passed (p = 0.02) | |
| 4 | The 300 test tasks, once per arm | |

The learning session saw Haiku's transcripts and the grader's verdict for each. It did not see the rubrics, the
benchmark's source, the test tasks, or a live environment to try things in. It wrote
[`notes.md`](notes.md): 11 rules and a few API recipes in 5,885 characters, loaded into every later session as
`CLAUDE.md`. Nothing was edited by hand, and the notes were not changed after the dev check.

The split is this suite's own, since the benchmark publishes none: each domain's 100 tasks shuffled with a fixed seed
and cut in half ([setup and splits](../experiments/autobench/README.md)).

## Results

Held-out test set, 300 tasks, one run each. Intervals are 95% Wilson; p-values are exact McNemar tests against Haiku
alone.

| Arm | Passed | | Assertions satisfied | Cost per task | Against Haiku alone |
|---|---|---|---|---|---|
| Haiku | 50/300 | 16.7% [12.9, 21.3] | 49.6% | $0.011 | |
| **Haiku + learned notes** | **109/300** | **36.3%** [31.1, 41.9] | 77.6% | $0.008 | +66 / −7, p < 0.0001 |
| Haiku + learned notes, second pass | 106/300 | 35.3% [30.1, 40.9] | 77.5% | $0.008 | +65 / −9, p < 0.0001 |
| Haiku + date hint only (control) | 55/300 | 18.3% [14.4, 23.1] | 50.6% | $0.011 | +22 / −17, p = 0.52 |
| Sonnet | 91/300 | 30.3% [25.4, 35.8] | 68.3% | $0.095 | +54 / −13, p < 0.0001 |
| **Sonnet + learned notes** | **133/300** | **44.3%** [38.8, 50.0] | 82.4% | $0.074 | +90 / −7, p < 0.0001 |

Passes per domain (50 tasks each):

| Arm | Finance | HR | Marketing | Operations | Sales | Support |
|---|---|---|---|---|---|---|
| Haiku | 5 | 8 | 9 | 12 | 6 | 10 |
| Haiku + learned notes | 14 | 20 | 22 | 21 | 17 | 15 |
| Sonnet | 13 | 21 | 12 | 22 | 8 | 15 |
| Sonnet + learned notes | 22 | 24 | 28 | 24 | 20 | 15 |

- **The gain is in every domain**, from 1.5× (support) to 2.8× (finance, sales).
- **Haiku with notes against Sonnet alone:** 109 against 91 passes (+49 / −31, p = 0.057), at 8% of the cost per
  task.
- **The notes make sessions shorter:** 8.8 turns instead of 11.9, and 36% fewer tokens.
- **The same notes help Sonnet about as much.** Written from Haiku's sessions, they take Sonnet from 91 to 133
  passes (+61 / −19, p < 0.0001), with 6.6 turns instead of 9.7 and 23% lower cost per task. The gain is in five
  domains; support stays at 15.

## Is it the notes, or the clock?

Claude Code tells the model the machine's real date. The benchmark's own harness does not, and tasks carry their
own "today". Haiku alone sometimes used the machine date in records, and rule 5 of the learned notes tells it not
to. Part of the gain could therefore come from undoing something this harness introduced.

The control arm measures that: Haiku with a `CLAUDE.md` that holds only [that one rule](datehint.md). It passes 55
tasks against 50 (p = 0.52). The clock explains little; the other ten rules do the work.

## What the notes say

The three rules the evidence ledger ([`evidence.json`](evidence.json)) counted most often in the train sessions:

- **Never stop with "blocked" or "need your confirmation".** About a third of the failed sessions ended that way and
  no passed one did (71 sessions).
- **Use the scenario's date** (18 sessions).
- **How to send mail through the Gmail API**, with the raw base64url body (15 sessions).

The others are of the same kind: `ss_…` names are spreadsheet ids and how to read them; a 401 "no account connected"
means the data lives in another app; read every tab, because a newer update overrides the base policy; make every
state change the task names instead of reporting what should change.

Two kinds of knowledge are in there. Some is about the benchmark's world (id conventions, which endpoints its
simulated APIs support). Some is about how to behave as an automation agent (finish the job, follow written policy
over an ad-hoc request). Both are what a newcomer to any company's systems would have to learn, and neither was
visible to a model starting from zero.

## A second pass does not add to the first

Haiku then ran the 240 learn tasks again with the notes, and `trod learn` revised them from those sessions ($2.32:
4 rules kept, 7 fixed, 6 new; [`notes-2.md`](notes-2.md)). On dev the revision looked slightly better (22 against 20
of 60). On test it is not: 106 against 109.

One pass took the gain that was there to take from this kind of evidence. The failures that remain are mostly
tasks that need one specific judgement about that task's data, which general rules do not supply. The same pattern
showed on MiniWoB++, where later passes added less each time ([round 12](../results-12/README.md)).

## Caveats

- **Not comparable to the benchmark's leaderboard.** The agent here is Claude Code calling the benchmark's two
  tools (`api_search`, `api_fetch`) through a shell command, with a file system and Bash at hand. The benchmark's
  own harness uses native tool calls. Arms in this table are comparable with each other only.
- **The split is ours.** The benchmark has no official train/test split. Train and test tasks come from the same
  six domains and the same simulated apps, which is the setting trod is for: tomorrow's work resembles today's.
- **Public task set.** The 600 tasks are public; a model could have seen them in training. That affects every arm
  alike.
- **One run per task.** Run-to-run variation is not measured; the intervals cover sampling of tasks only.
- **Costs are as Claude Code reports them** per session.
- **The learned notes mention this benchmark's quirks**, such as endpoints its simulation does not support. They are
  notes for this environment, as intended, and would not transfer to another.

## Files

- `runs.jsonl`: one record per run (arm, task, pass, score, cost, turns, tokens). `summary.json`: the table above.
- `notes.md`, `evidence.json`: the learned notes and the evidence ledger of the first pass.
- `notes-2.md`, `evidence-2.json`: the second pass. `datehint.md`: the control arm's only rule.

Reproduce: [`experiments/autobench/README.md`](../experiments/autobench/README.md).
