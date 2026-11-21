# Round 19: private knowledge: an invented API that no model can have seen

**Result:** on 40 held-out questions about an invented service, Haiku 5.5 answered **75.0%** correctly with no notes,
**98.8–100%** with trod's notes (forge with practice 80/80, forge without practice 80/80, learn 79/80), **62.5%** with
the CLAUDE.md that Claude Code's `/init` wrote, and **66.3%** with an unrelated notes file of similar length. Opus 5.5,
on 16 of the tasks: **68.8%** with no notes, **75.0%** with `/init`'s file, **100%** with trod's forge or learn notes, at
about a third of the cost per run. The round cost $34.14.

| Haiku 5.5, 40 test tasks × 2 | passed | per run (Wilson 95%) | per task (bootstrap 95%) | vs none (bootstrap 95%) | Wilcoxon p | tasks better / worse | $ / run | turns |
|---|---|---|---|---|---|---|---|---|
| none | 60/80 | 75.0% [64.5, 83.2] | [62.5, 86.3] | | | | 0.0203 | 20.1 |
| `/init` | 50/80 | 62.5% [51.5, 72.3] | [48.8, 75.0] | −12.5 pp [−25.0, 0.0] | 0.077 | 4 / 11 | 0.0146 | 17.5 |
| placebo | 53/80 | 66.3% [55.4, 75.7] | [53.8, 78.8] | −8.8 pp [−22.5, +3.8] | 0.20 | 6 / 11 | 0.0163 | 20.5 |
| **forge** | **80/80** | 100% [95.4, 100] | [100, 100] | **+25.0 pp** [+13.8, +37.5] | < 0.001 | 14 / 0 | 0.0048 | 7.0 |
| **forge, no practice** | **80/80** | 100% [95.4, 100] | [100, 100] | **+25.0 pp** [+13.8, +37.5] | < 0.001 | 14 / 0 | 0.0059 | 7.9 |
| **learn** | **79/80** | 98.8% [93.3, 99.8] | [96.3, 100] | **+23.8 pp** [+12.5, +36.3] | 0.001 | 14 / 1 | 0.0063 | 7.8 |

Against `/init`, each trod arm is +36 to +38 points (bootstrap intervals from +22.5 to +51.2, p < 0.001, better on 19
tasks, worse on at most 1).

| Opus 5.5, 16 test tasks × 2 | passed | per run (Wilson 95%) | per task (bootstrap 95%) | vs none (bootstrap 95%) | Wilcoxon p | tasks better / worse | $ / run | turns |
|---|---|---|---|---|---|---|---|---|
| none | 22/32 | 68.8% [51.4, 82.0] | [50.0, 87.5] | | | | 0.293 | 15.9 |
| `/init` | 24/32 | 75.0% [57.9, 86.7] | [56.3, 90.6] | +6.3 pp [−12.5, +25.0] | 0.59 | 4 / 3 | 0.244 | 12.0 |
| **forge** | **32/32** | 100% [89.3, 100] | [100, 100] | **+31.3 pp** [+12.5, +50.0] | 0.019 | 7 / 0 | 0.089 | 4.1 |
| **learn** | **32/32** | 100% [89.3, 100] | [100, 100] | **+31.3 pp** [+12.5, +50.0] | 0.019 | 7 / 0 | 0.102 | 4.9 |

Against `/init` on Opus, forge and learn are each +25.0 points [+9.4, +43.8], p = 0.031, better on 6 tasks, worse on
none. Of the four comparisons fixed in advance (learn and forge against `/init`, per model), the two on Haiku hold after a
Holm correction (adjusted p = 0.002); the two on Opus do not (p = 0.031 each, adjusted 0.062): 16 tasks are too few to
settle them, although no task went the other way.

## What we learned

1. **The notes' content made the difference, not their presence.** An unrelated notes file of similar length did not
   help (66.3% against 75.0%, not significant). This is the control [Zhang et al.](https://arxiv.org/abs/2604.11088)
   motivated, where random rules helped as much as curated ones on SWE-bench; here they did not. It is one environment.
2. **A generated `/init` file can hurt.** It stated 3 of the 12 quirks and one wrong guess: "Net revenue means you
   subtract [refunds] yourself." Revenue questions went from 10/10 without notes to 2/10 with it; the failing sessions
   worked refunds into the answer (17–50 mentions of refunds per session, against 4–11 without notes). This matches
   [Gloaguen et al.](https://arxiv.org/abs/2602.11988): LLM-generated context files did not help on average.
3. **A frontier model does not know private quirks either.** Opus without notes answered 68.8%, no better than Haiku.
   With trod's notes both models reached 100% on the tasks they ran.
4. **A forge without practice worked here.** It explored the live service for $1.72 and its notes did as well as the
   forge that practised. That is the opposite of [SkillsBench](https://arxiv.org/abs/2602.12670)'s self-generated
   skills, which did not help; there the authoring session was told not to solve the task and to inspect the
   environment "only as needed". Here every quirk could be found by probing the service, which is what both forges did.
5. **Notes made sessions cheaper.** Haiku went from $0.020 and 20 turns per run to $0.005–0.006 and 7–8 turns; Opus from
   $0.29 to $0.09–0.10. Making the notes cost $0.91–1.72 once (Opus), so on Opus they paid for themselves within about
   ten sessions.

**What this round does not show.** It is one invented environment, built by the same people as trod, and every quirk
in it can be discovered by probing the service. Knowledge that exists only in people's heads (what "revenue" means in
your company) was not tested, and a forge could not find it this way. The trod arms all reached the ceiling, so the
round cannot tell them apart. The Opus comparison has 16 tasks. And the learn session could probe the live service as
well as read transcripts (see Arms).

## Why this round

Published studies find that generated context files usually do not help coding agents on well-known repositories
([ADR 0005](../docs/adr/0005-positioning.md)). trod's claim is narrower: notes help where the model lacks the knowledge
and the same knowledge recurs. Every earlier round used a public benchmark that a model may have seen in some form.
This round uses an environment that cannot be in any training data, and compares trod's notes with what people
actually do instead: run Claude Code's `/init`.

## The environment

Zorbit ([suite](../experiments/private/README.md)) is an invented order and billing service: 1,300 orders, 140
customers, refunds and order lines behind an HTTP API with thin docs and twelve quirks. Most quirks are silent: a
plausible wrong answer, not an error. Examples: timestamps in an unmarked UTC−05:00 clock, voided orders listed like the
others, pages that repeat the previous page's last item, throttling that returns half a page with status 200, unit
prices in major units where every other amount is in cents, legacy region codes, and dates that must be written
DD.MM.YYYY. The data and the quirks' parameters come from a seed that stayed private until this write-up (it is
`cFNjY8fwknlTAh1By6oTy2jr`). 60 questions: 20 train and 40 test, 5 of each of 8 kinds (revenue, orders per region, net units,
returned value, refunds per region, customers per tier, fiscal-week revenue, customer net revenue). A question passes
only with the exact number.

Before any model ran, a scripted client checked the environment for free (`calibrate.ts`): knowing every quirk it gets
all 60 answers, and every task's answer changes when the client does not know at least one silent quirk. With this
round's seed one quirk turned out inactive: the fiscal year starts on a Monday, so "fiscal weeks do not start on Monday"
changes no answer.

## Arms

| Arm | The notes (loaded as `CLAUDE.md`) | Made by | Cost to make |
|---|---|---|---|
| none | – | | |
| `/init` | 1,750 chars | Claude Code's own `/init` (Opus 5.5) in the task workspace: what people do | $0.09 |
| forge | 3,934 chars | `trod forge --practice` (Opus 5.5): explored the live service and practised on train questions, 6 of 6 attempts passed | $1.52 |
| forge, no practice | 3,595 chars | `trod forge` (Opus 5.5) without a success check: explored the live service only | $1.72 |
| learn | 3,851 chars | `trod learn` (Opus 5.5) over 40 Haiku sessions on the train tasks (28 passed), with pass or fail per session | $0.91 |
| placebo | 5,885 chars | round 18's AutomationBench notes, unchanged: a real notes file about something else | |

Two things to know about the learn arm. Its session ran in the task workspace with the service reachable, so it read
the transcripts *and* probed the live API (it says "checked against the live service"). That is how `trod learn` runs in
a real project, but it differs from round 18, where the learner saw transcripts only. And the train sessions it read
never found the date format; the learner found it by probing.

All four trod-or-`/init` files were checked for which quirks they state. The three trod files state all twelve,
with this seed's parameters. The `/init` file states three (the tenant header, the clock, that a fiscal calendar exists)
and adds a guess that is wrong here ("refunds have to be subtracted for net revenue").

## Method

- Every session is `claude -p` with Bash, Read, Write, Edit, Glob and Grep, run as an unprivileged user that cannot
  read the repository (the environment's source lists the quirks), the notes store, or other arms' notes. The answers
  are computed inside the runner and never written to disk. A scan of every session's tool calls for paths outside its
  own run directory found nothing outside the session's own task directory (608 sessions; 8 references, all to scratch files or mistyped paths inside it).
- Haiku 5.5: all 40 test tasks, 2 trials, every arm. Opus 5.5: 16 test tasks (the first 2 of each kind), 2 trials, arms
  none, learn and `/init`, chosen before any Opus test run, plus forge if more than $7 of the round's $40 budget was
  left afterwards (it was).
- Statistics (`compare.ts`): pass rate per run with a Wilson 95% interval; a 95% interval from a bootstrap that
  resamples tasks, since two runs of one task are not independent; against no notes, the mean per-task difference with a
  task-bootstrap interval and a Wilcoxon signed-rank test. The comparisons fixed in advance were learn and forge against
  `/init` and against none, per model.

**Calibration, and a deviation.** The plan required Haiku without notes to pass 15–60% of the train tasks before the
test tasks ran. It passed 28/40 (70%). Every fiscal-week run failed because no session tried a DD.MM.YYYY date (they
tried ISO, RFC 3339, US-style and epoch, then declined to answer); the other failures matched a missed clock offset,
voided orders or legacy region codes. The environment was not changed: tuning it until notes help would add choices
made after seeing data, and 30 points of headroom is not a ceiling. With every quirk written down (an oracle file, not
an arm), Haiku passed 20/20 train tasks.

## Files

- [`notes/`](notes/): every arm's notes as the sessions saw them, and the oracle. The placebo is [round 18's notes](../results-18/notes.md).
- `calibration.json`: which quirks change each task's answer with this round's seed.
- `runs.json`: one compact record per run (arm, task, pass, cost, turns, tokens). `summary-*.json`: the tables below.
- Reproduce: [experiments/private/README.md](../experiments/private/README.md), with the seed above.

## Cost

| Step | Runs | Cost |
|---|---|---|
| Smoke test and Opus cost probe | 3 | $0.41 |
| Calibration: Haiku on train, no notes (2 trials; also the sessions `trod learn` read) and oracle | 60 | $0.76 |
| Making the notes: `/init`, forge, forge without practice, learn (all Opus) | 4 | $4.24 |
| Haiku test arms (6 × 80) | 480 | $5.46 |
| Opus test arms (4 × 32) | 128 | $23.28 |
| **Total** | | **$34.14** |

The Opus forge arm was conditional: it ran because the other arms left more than $7 of the $40 budget, a rule set
before any Opus test result.
