# ADR 0005: Positioning against prior work, a private-knowledge experiment, and note pruning

- Status: Proposed (for review; nothing in this ADR has been run)
- Date: 2026-11-21

## Context

Since trod's README was written, several papers and tools have measured or automated what trod does. Some of them
agree with our results, some sharpen them, and two contradict parts of our story. This ADR records what each source
actually says, the conflicts with trod's current claims, and the planned changes: the README, the site, one new
experiment and one new feature. Existing experiment results are not changed.

### What the sources say

Numbers are quoted from the sources themselves. "pp" means percentage points.

**Evaluating AGENTS.md** (Gloaguen, Mündler-Sasahara, Vechev, ETH Zurich; Müller, Raychev, LogicStar.ai;
[arXiv:2602.11988](https://arxiv.org/abs/2602.11988), v3, 29 Sep 2026). Four agent/model pairs on SWE-bench Lite (300
tasks) and a new benchmark of 138 tasks from repositories with developer-written context files. Context files "do not
generally improve task success rates" and increase inference cost "by over 20% on average". LLM-generated files lower
resolution by 0.5% (SWE-bench) and 2% (new benchmark); developer-written files raise it by 2.4% on average (p = 21%).
Repository overviews "are not helpful". With the repository's documentation removed, LLM-generated files improve
performance by 2.7% and beat developer-written ones. Recommendation: omit LLM-generated files for now, keep human-written
ones to what the README lacks, and evaluate any change before adopting it. Stated limits: Python only, where models may
already know the tooling; resolution rate is the only metric.

**Guardrails Beat Guidance** (Zhang et al., AWS Generative AI Innovation Center and HSBC;
[arXiv:2604.11088](https://arxiv.org/html/2604.11088), v2, 28 May 2026). Claude Code with Opus 4.6 on SWE-bench
Verified, 679 scraped rule files (25,532 rules), over 5,000 runs. "Random rules improve a coding agent's task performance
as much as expert-curated ones": both reach 63.8% against a 50.0% baseline (+13.8pp). Pass rates stay in a 59–67% band
from 0 to 50 rules. Per-rule ablation of 18 rules: negative constraints ("do not …") help, some positive directives
hurt, and "14 of 18 rules break at least 2 previously-solved tasks". Two of five rule pairs are not additive. The
authors attribute the gains to context priming and warn against single-rule evaluation. Stated limits: one model, one
benchmark, power for about 15pp effects, per-rule p-values do not survive multiple-comparison correction.

**AGENTS.md and agent efficiency** (Lulla, Treude, Mohsenimofidi, Baltes, Galster, Zhang;
[arXiv:2601.20404](https://arxiv.org/abs/2601.20404), v2, 30 Mar 2026; 5-page workshop paper). Codex with
gpt-5.2-codex on 124 small PRs from 10 repositories, with and without the repository's AGENTS.md. Median runtime falls
28.64% and median output tokens 16.58%; median total tokens change by only 1.29%. Correctness was not measured ("beyond
the scope"); "comparable task completion" rests on a manual check of 50 outputs.

**SkillsBench** (Li et al., BenchFlow and 38 co-authors; [arXiv:2602.12670v1](https://arxiv.org/html/2602.12670v1), 13
Feb 2026). v1: 84 tasks in 11 domains, 7 model/harness configurations, 5 trials per task. Curated skills raise the
average pass rate by 16.2pp; "Self-generated Skills provide no benefit on average" (−1.3pp). Gains are largest in
domains underrepresented in pretraining (Healthcare +51.9pp, Manufacturing +41.9pp) and smallest in Software
Engineering (+4.5pp). Focused skills (2–3) beat many (4+: +5.9pp); "comprehensive" skills hurt (−2.9pp). Stated limit:
no length-matched control, so gains "could partly reflect 'more context'". **The current version (v4, 14 Jun 2026)
changes the numbers**: 87 tasks, curated +16.6pp (33.9% → 50.5%), Software Engineering +11.6pp, and self-generated skills
now fall *below* no skills on all three configurations tested (−8.1, −11.3 and −11.5pp). Appendix D.6 of v4 defines
self-generated skills: a clean session reads the task, may inspect the environment "only as needed", is told "Do not
solve the task directly", and gets no verifier feedback and no experience from other tasks.

**ruleprof** (0.1.2, MIT, [PyPI](https://pypi.org/project/ruleprof/)). Removes one `##` block of a CLAUDE.md at a time,
reruns Claude Code `trials` times with and without it, and checks adherence with a shell command you write per rule.
Verdicts are KEEP, CUT or INCONCLUSIVE from a 90% confidence interval on the adherence change, with each block's token
cost and price. It measures whether the agent follows a rule, not whether tasks succeed.

**obey** (Andrii Boiko, Apache-2.0, `obey-cli` 0.1.1, [GitHub](https://github.com/B0yko/obey)). Extracts the rules from
AGENTS.md, CLAUDE.md, Cursor and Copilot files, maps each to one of twelve deterministic checkers, and runs a sandboxed
agent per rule on a "tempting" probe task against a no-rule baseline, several times, with Wilson 95% intervals. It can
also turn rules into hooks. Its study: a rule was followed "every time the rule was in AGENTS.md (1,474 of 1,474 runs)
and 81% of the time when it was not"; a hook alone raised compliance "from 34% to 100%".

**rulebench** (Rafael Pena, 0.2.2, MIT, [PyPI](https://pypi.org/project/rulebench/)). Runs trap tests across named rule
configurations (none, your rules, rules + skills) in fresh Claude Code sessions, grades against rubrics written before
the run, and reports which tests differentiated the configurations at all. Its origin study found "most of a rules
pack's claimed value was already baseline model behavior". Also vets third-party rule files offline.

**context-eval** ([site](https://jasonxzwen.github.io/context-eval/)). A local A/B framework for coding agents:
context variants (AGENTS.md, docs, skills, rules) × tasks × trials in isolated workspaces, scored by validation commands
and hard checks. No results, version or statistics stated.

**NVIDIA SkillEvaluator** ([blog](https://developer.nvidia.com/blog/evaluating-ai-agent-skill-performance-with-nvidia-skillevaluator/),
19 Aug 2026). Static checks, embedding similarity, and live runs with and without a skill in sandboxes, reported as
"Skill Lift" (with minus without): 41 points for correctness and 39 for effectiveness on NVIDIA's skills. "85% ran one
attempt, and 15% ran two"; no confidence intervals. Evaluates skills, does not write them.

**Antigravity /learn** ([docs](https://antigravity.google/docs/commands/learn/); the linked agy-customizations page
only loads the customization guide). Finds the user's corrections in the current session, proposes a rule or skill as a
`learning_proposal.md`, and writes it only after approval. No automated verification and no measurement.

### Where the sources and trod's current claims conflict

These are reported as found, not resolved. Each needs a decision from the maintainer.

1. **The README table mislabels SWE-bench.** It lists "SWE-bench Verified: Django issues, 79.6% → 79.1%" under "with
   trod's notes". Round 5 measured a forged *tool library*, not notes ([results-5](../../results-5/README.md)). The site
   labels it correctly. trod has never measured notes on SWE-bench.
2. **SkillsBench contradicts plain `trod forge`.** Model-written skills without practice did not help (v1: −1.3pp) or
   hurt (v4: −8 to −12pp). `trod forge` without `--practice` is close to that protocol: a session explores the
   environment and writes notes before any graded attempt. trod's positive results come from notes built with more than
   that: expert trajectories (rounds 8 and 6b), practice against a success check (round 9), or the outcomes of earlier
   sessions (`trod learn`, rounds 11, 12, 18). The one forge without a success signal in the notes era, round 6c on
   AppWorld, "missed domain rules" ([ADR 0004](0004-verified-notes.md)). trod has no result showing that forge without
   practice helps, and the README presents it as a main route ("By studying something new").
3. **Guardrails Beat Guidance means trod's gains could partly be priming.** Random rules did as well as curated ones.
   No trod round has a length-matched placebo; round 18's control has one rule (the date hint, 18.3% vs 16.7% alone). The
   null rounds (AppWorld full sets, BIRD, Django) show that trod's notes do not help automatically, but they do not show
   that the positive rounds depend on the notes' content.
4. **The two efficiency papers disagree with each other**, and trod's own token results go both ways: +15–22% tokens
   with the Django tool library (round 5), −18% tokens with BIRD notes (round 7). The README makes no general cost claim
   apart from "a tenth of the cost per run" for Haiku against Sonnet, which compares models, not notes. No change needed
   beyond not adding a general one.
5. **The site's comparison table is out of date.** It lists Agent Skills as "Verified? No" and "Measured gains n/a".
   SkillsBench measures curated skills (+16.2pp in v1) and SkillEvaluator measures skill lift.
6. **"A small, cheap model works like one that already knows the place"** (README, second paragraph) is stated without
   condition. It holds on AutomationBench, MiniWoB++ and ScienceWorld, not on AppWorld, BIRD or Django.

Sources that support trod's thesis, without softening the above: ETH finds LLM-generated files help (+2.7%) once the
documentation they would duplicate is removed, and names "Python only, where models may already know the tooling" as its
limit. SkillsBench finds the largest gains where knowledge is underrepresented in pretraining. Both match trod's split
between AutomationBench/MiniWoB++/ScienceWorld and Django/BIRD.

## Decision

### 1. README positioning

Keep it shorter than the current 158 lines. Proposed opening, replacing the tagline and first paragraph:

> **Generated context files usually do not help coding agents. trod measures when they do.**
>
> Published studies find that LLM-written AGENTS.md files do not raise success on well-known repositories
> ([Gloaguen et al.](https://arxiv.org/abs/2602.11988)), and that skills a model writes for itself do not help
> ([SkillsBench](https://arxiv.org/abs/2602.12670)). trod's own runs agree: no gain on SWE-bench Django, BIRD or the
> full AppWorld test sets. Where knowledge is missing from the model, and the same knowledge recurs in every task
> (an internal API, in-house tooling, an unfamiliar workflow), notes learned from graded attempts and held back until
> they pass a check took Haiku 5.5 from 17% to 36% on AutomationBench, 68% to 90% on MiniWoB++ and 52% to 89% on
> ScienceWorld.

Changes in the results table: the SWE-bench row says "forged tool library", or moves out of the table into the text.
The "It helps / It does not help" paragraph becomes the "When not to use trod" section below. The "Why trust the
notes?" list says exactly what each gate checks (see section 5). The routes that have evidence (learn, forge with
practice, tune) come first; forge without a success check is described as unmeasured, with the SkillsBench finding.
The five-bullet "How it compares" list is replaced by the section below. Proposed sections that move to
[docs/reference.md](../reference.md) to keep the README short: "How it works" (steps 1–3) and the long safety
paragraph, leaving a one-line link.

### 2. Compared with

One line each, for the README (the site gets the same rows in its table):

- **[ruleprof](https://pypi.org/project/ruleprof/):** per-rule ablation of an existing CLAUDE.md, with intervals and
  token cost per rule. Better than anything trod has for "which of my rules does anything"; use it rather than waiting
  for trod to do the same. It measures adherence, not task success.
- **[obey](https://github.com/B0yko/obey):** checks whether agents follow each rule, against a no-rule baseline, and can
  turn rules into hooks. Use it to enforce rules; trod does not enforce anything.
- **[rulebench](https://pypi.org/project/rulebench/):** trap tests for a rule set across configurations, with an honest
  report of which tests differentiated them. Use it to test a hand-written rules pack.
- **[context-eval](https://jasonxzwen.github.io/context-eval/):** a general A/B harness for context variants on your
  own repository. `trod tune` does this only for notes it writes itself.
- **[NVIDIA SkillEvaluator](https://developer.nvidia.com/blog/evaluating-ai-agent-skill-performance-with-nvidia-skillevaluator/):**
  measures the lift of a skill you already have. trod writes notes; it does not evaluate skills.
- **[Antigravity /learn](https://antigravity.google/docs/commands/learn/):** turns corrections in the current session
  into a rule or skill after you approve it. `trod learn` reads many sessions at once, compares failures with successes
  and keeps an evidence ledger; /learn has no automated check, trod has no per-session approval step.
- **Research ([Gloaguen et al.](https://arxiv.org/abs/2602.11988), [Guardrails Beat Guidance](https://arxiv.org/abs/2604.11088),
  [Lulla et al.](https://arxiv.org/abs/2601.20404), [SkillsBench](https://arxiv.org/abs/2602.12670)):** see "What the
  research says" on the experiments page.
- Existing rows kept, shortened: CLAUDE.md and auto memory, Agent Skills (now: "measured by SkillsBench and
  SkillEvaluator; trod can produce the content a skill packages"), memory layers, and the learning-from-experience
  research (Voyager, ExpeL, AWM, ACE).

### 3. When not to use trod

Proposed section:

> - **A frontier model on a well-known stack.** Opus or Sonnet on Django, React or Rails already knows what notes would
>   say. trod measured no gain on SWE-bench Django, and the published AGENTS.md studies agree.
> - **You can write the rules yourself in a few lines.** If you know the three things every session gets wrong, put them
>   in AGENTS.md. A short file you wrote is cheaper than a learning session and easier to review. trod is for when
>   nobody has written the rules down, or when you want to know whether they help.
> - **The model already does well.** On AppWorld, Haiku completes 86% alone; notes added nothing.
> - **Each task needs its own fact.** On BIRD, notes from other questions did not raise accuracy.
> - **You have no success signal.** Without practice, held-out tasks or graded past sessions, trod writes notes the
>   same way the model-written skills in SkillsBench were written, and those did not help.
> - **You want to prune or enforce a hand-written rules file.** Use ruleprof or obey.

The bullet on a short hand-written AGENTS.md states a recommendation, not a measured result, until experiment 4 runs.
If experiment 4 shows hand-written notes match trod's, the README says so.

### 4. New experiment: private knowledge (round 19)

**Question.** In an environment no model can have seen, does `trod learn` or `trod forge` reach what a short
hand-written AGENTS.md gives, on a cheap and a frontier model?

**Environment.** An invented local HTTP service (working name `zorbit`), built like round 4's `inventory-api`
([experiments/tasks/inventory-api.ts](../../experiments/tasks/inventory-api.ts)) and run by the existing runner. Round 4
is the warning: Haiku solved that API from scratch in 3 of 3 seeds, because its quirks failed loudly and could be found
by probing. The new one needs about 12 quirks, most of them **silent**: they give a plausible wrong answer rather than an
error. Examples:
- money in minor units on every endpoint but one, which uses major units
- timestamps in a fixed non-UTC offset with no marker
- soft-deleted records returned unless a flag is set
- the last item of each page repeated as the first item of the next
- rate limiting that returns 200 with a truncated list instead of 429
- an invented region code table
- a fiscal week that starts on Tuesday
- a negative quantity that means a return
- two loud ones: a required tenant header and a `DD.MM.YYYY` date filter

The docs given to the agent are thin and do not mention the silent quirks, as with many internal APIs. Quirk parameters
(the offset, which endpoint uses major units, the code table) come from a seed that stays out of the repository until
the round is published, so the environment cannot be memorized later either.

**Tasks.** 60 questions, each with a deterministic expected answer, each touching 2–4 quirks, every quirk used by at
least 6 tasks. 20 train tasks and 40 test tasks, split by a hash of the id. The test answers are stored outside the
agent's directory, as in earlier rounds.

**Calibration.** On the train tasks only: run Haiku with no notes and with an oracle file listing every quirk.
Proceed if no-notes is between 15% and 60% and the oracle gains at least 25pp. Otherwise change the environment and
report each calibration iteration in the write-up. The test tasks and the four conditions are not run until
calibration passes, so the environment is not tuned toward any condition.

**Conditions** (each on the 40 test tasks):

| | What the session gets | How it is made |
|---|---|---|
| none | thin docs only | |
| hand-written | an AGENTS.md of at most 4,000 characters | a person with the docs and the service's source, time-boxed to 30 minutes, before any agent run and without seeing the tasks |
| forge | `trod forge` notes | one Opus 5.5 forge with `--practice` on the train tasks' checks |
| learn | `trod learn` notes | Haiku runs the 20 train tasks 3 times with no notes; one `trod learn` session (Opus) reads those 60 sessions with pass or fail |
| placebo (recommended fifth) | notes of the same length from another round's environment | copied, not written; tests the priming effect Guardrails Beat Guidance found |

The forge and learn notes are written once and used for both models, as in round 18. The hand-written author has the
source, which makes it a strong baseline on purpose. If the hand-written file wins, that answers "why not write the
quirks down yourself?" in favour of writing them down, and the README says so.

**Models.** Haiku 5.5 (cheap) and Opus 5.5 (frontier).

**Trials and statistics.** 3 trials per task and condition: 120 runs per cell. Report the pass rate with a Wilson 95%
interval per run, as in earlier rounds, and a 95% interval from a bootstrap that resamples tasks, since runs of the same
task are not independent. Paired differences against hand-written and against none use the per-task mean, with a task
bootstrap interval and a Wilcoxon signed-rank test. Primary comparisons are fixed in advance: learn vs hand-written,
forge vs hand-written, each per model (four tests, Holm-corrected). Everything else is secondary. With 40 tasks this
detects differences of roughly 15–20pp; smaller ones will be reported as not resolved.

**Cost estimate.** Prices: Haiku 5.5 $0.10/$0.50 and Opus 5.5 $4/$20 per million input/output tokens. Haiku per run
uses measured costs from rounds 4, 17 and 18 ($0.007–0.011). Opus 5.5 has not run single API-question tasks in this
harness. The estimate is twice Sonnet's measured $0.05–0.095 (rounds 4 and 18), since Opus 5.5 costs twice Sonnet 5.5
per token, giving $0.10–0.19 per run. Round 16 measured $0.151 per task for Opus alone on Django.

| Step | Runs | Estimate |
|---|---|---|
| Calibration (train, Haiku none + oracle × 2 trials; Opus 1 trial) | 80 + 40 | $1 + $4–8 |
| Learn source (Haiku, train × 3) and one `trod learn` | 60 + 1 | $0.6 + ~$2 |
| One `trod forge --practice` (Opus) | 1 | $1–5 |
| Main, Haiku, 4 conditions | 480 | $3.4–5.3 |
| Main, Opus, 4 conditions | 480 | $48–91 |
| **Total, 4 conditions** | | **$60–113** |
| Placebo, both models (optional) | 240 | +$13–25 |

Proposed hard cap: $150, enforced with the runner's `--max-budget-usd` per step and stopping between steps. Ways to
cut it: 2 Opus trials instead of 3 saves about a third of the Opus line, at wider intervals. Opus is about 90% of the
cost.

**What the round can claim.** Only what it measures: one invented environment, two models. It cannot show trod helps on
real private codebases in general. It can show whether trod's notes reach a hand-written baseline where pretraining
cannot help.

### 5. Pruning and decay

**What `trod verify` does today** ([packages/cli/src/cli.ts](../../packages/cli/src/cli.ts), `case 'verify'`;
`verifyNotes` in [packages/server/src/notes.ts](../../packages/server/src/notes.ts)):
- For each tool in `.trod/library/`: loads it and runs its examples. A tool that fails to load or fails an example is
  STALE. A tool without examples is reported as "cannot be verified".
- For each entry in `.trod/notes.checks.json` (`{claim, tool, input, expect}`): runs the named library tool with the
  input and checks the output with `contains`, `matches` or `equals`.
- Reports the notes' size (warning above 6,000 characters), whether they are linked, and how they are delivered.
- Exits 1 if any tool is stale, any check fails, or the checks file is malformed. It runs no model and costs nothing.

What it does not do: it checks only claims that a library tool can observe. A note without a check is not verified at
all, and nothing in `verify` measures whether a note changes what the agent does or whether tasks succeed. The other
gates are separate: `--practice` refuses to link notes when no attempt passed; `trod notes --link` refuses when a check
fails; `trod tune` keeps a rewrite only if it passes at least `--margin` more held-out tasks; `trod learn` keeps a ledger
of how often later sessions confirmed or contradicted each rule; `trod report` compares sessions with and without notes
(with a random holdout under hooks delivery). The README's word "verified" must say which of these applies.

**Proposal: `trod tune --prune --model <m>`.** It uses the tasks already in `.trod/tune.json`, so no new setup:
1. **Whole notes first.** Run the validation tasks with and without the notes on model `<m>`, `k` trials each. If the
   notes show no measurable effect, say so and suggest removing them on that model. This is the cheapest test and the
   most robust one: Guardrails Beat Guidance warns that single-rule results are unreliable and not additive.
2. **Then sections.** Leave one section out at a time (a `##` heading of notes.md, or one wiki page). Cost:
   `(1 + sections) × tasks × k` runs.
3. **Not single rules.** Per-rule task-success ablation needs more runs than most projects have tasks for, and the
   paper above found per-rule p-values did not survive correction at n = 35. For rules with an observable behaviour,
   recommend ruleprof instead.

Verdicts follow ruleprof's: KEEP when the interval for the pass-rate drop on removal is above zero, CUT when its upper
bound is below a threshold (default 5pp), INCONCLUSIVE otherwise, with the extra trials that would resolve it. CUT is a
suggestion in the output; nothing is deleted automatically. Every run appends a line to `.trod/prune-history.jsonl`:
date, model, number of rules and sections, characters and estimated tokens of the always-loaded notes, pass rate with
and without, and the verdicts. `trod doctor` shows the trend, so a project can see its notes shrink when it moves to a
newer model. Whether notes do shrink as models improve is a question for that history, not a claim for the README.

This is a design only, to be built after review. Its first use could be on round 19's environment, where the main
runs already give the whole-notes comparison for both models at no extra cost; section ablation there would cost more
and is not in the table above.

### 6. Site and experiments page

- `site/index.html`: new lead matching the README; the "Little or no effect" card gains the frontier-model and
  hand-written bullets; the comparison table gains rows for ruleprof, obey, rulebench, context-eval, SkillEvaluator and
  Antigravity /learn; the Agent Skills row is corrected (conflict 5).
- `site/experiments.html`: the intro ("Do self-made tools pay off?") is rewritten around the same thesis; a short
  "What the research says" section with the four papers and the numbers above, next to our null rounds; round 19
  added when it has run.
- No existing round's numbers or write-up change.

## Consequences

- The README leads with the limits, which may make trod look weaker. That is the point.
- Conflicts 1, 5 and 6 are corrections and can ship with the README change. Conflicts 2 and 3 change what we may say
  about `trod forge` without practice and about the content of notes; until round 19 (with the placebo) runs, the
  README says they are unmeasured.
- Round 19 may show hand-written notes are as good as trod's. The README then says to write them yourself when you can.

## Open questions for review

1. Who writes the hand-written AGENTS.md? Recommended: you (or someone who did not design the quirks), from the docs and
   source, 30 minutes. If it has to be a model, that is the ETH "LLM-generated" condition and must be labelled as such.
2. Include the placebo arm (+$13–25)? Recommended: yes, it is the only direct answer to conflict 3.
3. Frontier model: Opus 5.5 as proposed, or Fable 5.2 (about twice Opus per token, roughly doubling the largest line)?
4. Forge arm: with `--practice` as proposed. A forge without practice would test conflict 2 directly, for about $1 more
   on Haiku and $12–23 more on Opus.
5. Budget cap of $150, and 3 Opus trials or 2?
