# Round 5: SWE-bench Verified (Django)

**Question:** does round 4's result (forge a library once with a strong model, reuse it in every session) carry over
to a known coding benchmark?

**Answer: no.** On all 67 SWE-bench Verified Django 4.0/4.1 instances that grade correctly in this environment, an
Opus-forged Django library changed neither model's resolve rate. It cost 15–22% more tokens. The reason sharpens the
earlier claim: forged libraries pay off where an environment holds knowledge the model cannot guess, and a famous
public repository has almost none.

Report: [report.html](report.html) (on the site at `/round-5/`). Raw records are in `runs.jsonl`, the forged library
in [`forged-library/`](forged-library/).

## Setup

- **Benchmark:** SWE-bench Verified, the Django 4.0/4.1 instances. 67 of 70 pass the gold check here: the gold patch
  resolves the instance and the unpatched base does not (`experiments/swe/validate-gold.ts`). The 3 exclusions depend
  on the exact Python patch release (`strip_tags`).
- **Environment:** no Docker. A Python 3.9 venv with Django's test requirements resolved as of July 2022
  (`uv --exclude-newer`, see `experiments/swe/setup.sh`). Every session starts in `git archive <base_commit>` in a
  fresh repository **without history**, so the fix cannot be found in later commits.
- **Grading:** as in SWE-bench. Test files touched by the test patch are restored from the base commit, the official
  test patch is applied, the affected modules run with `tests/runtests.py -v 2`, and an instance counts as resolved
  only if every FAIL_TO_PASS and PASS_TO_PASS test passes.
- **Forge:** `trod forge` with Opus 5.5, once ($2.29, 73 turns), from the repository alone, at the commit before the
  earliest instance. It built five tools:
  - `django_test`: a compact test runner
  - `django_run`: snippets with Django configured
  - `django_source`: AST source lookup
  - `django_grep`
  - `django_find_tests`
- **Arms:** from scratch vs with the forged library (library cards plus `trod_eval`). Haiku 5.5 ran 3 seeds,
  Sonnet 5.5 ran 2. 670 graded runs, $14.17 plus the forge.

## Results

| | runs | resolved | tokens | turns | cost / instance | cost / resolved | used trod tools |
|---|---|---|---|---|---|---|---|
| Haiku, from scratch | 201 | **79.6%** | 232k | 11.1 | $0.0066 | $0.0083 | – |
| Haiku + forged library | 201 | **79.1%** | 282k | 11.2 | $0.0075 | $0.0095 | 70 / 201 |
| Sonnet, from scratch | 134 | **82.8%** | 83k | 4.7 | $0.038 | $0.046 | – |
| Sonnet + forged library | 134 | **83.6%** | 97k | 5.0 | $0.046 | $0.055 | 17 / 134 |

Paired comparisons (same instance, same seed):

| A | B | only A | only B | p | instances where A / B did better (sign test) |
|---|---|---|---|---|---|
| Haiku from scratch | Haiku + library | 8 | 7 | 1.00 | 7 / 4 (p = 0.55) |
| Sonnet from scratch | Sonnet + library | 3 | 4 | 1.00 | 2 / 4 (p = 0.69) |
| Sonnet from scratch | Haiku + library | 11 | 6 | 0.33 | 8 / 5 (p = 0.58) |

## Why there is no effect

- **The models already know Django.** From scratch, Haiku ran Django's own test suite (`tests/runtests.py`) in 66 of
  67 sessions. Sonnet usually didn't run tests at all and still fixed the issue in about 5 turns. The things a forged
  library encodes (how to run tests, how to reproduce behaviour with settings configured, where things are defined)
  cost these models almost nothing to work out, because Django is among the most documented and most trained-on
  codebases there is.
- **What remains is reasoning.** A SWE-bench instance is one localized bug in one session. A test runner or grep
  wrapper does not make the fix more correct. The unresolved instances fail on the fix itself, not on finding or
  running things.
- **So the agents mostly ignore the library.** Sonnet used it in 13% of sessions, Haiku in 35%. When they did, results
  were no better.

That contrasts with round 4, where the same mechanism let Haiku beat Sonnet at 5–14% of the cost. There, the
environments held **knowledge that cannot be guessed**:
- an auth header hinted at only in `WWW-Authenticate`
- European number formats
- a reversal rule
- the call graph of a codebase nobody has seen

The sharpened claim: **forged libraries help in proportion to how much an environment's working knowledge is
unguessable from pretraining.** Internal APIs, private codebases and bespoke tooling score high on that.
Public-repository benchmarks like SWE-bench score close to zero, so they are close to the worst case for this
approach. Testing the claim on a coding benchmark would need tasks in genuinely unfamiliar codebases. No standard
benchmark offers that today.

A side observation, independent of trod: Haiku 5.5 resolved about 96% as many instances as Sonnet 5.5, at about
1/6 of the cost per instance.

## What went wrong along the way (and is fixed)

- **Disk.** Each run kept a ~100 MB Django checkout, and a few hundred runs filled the session's disk mid-experiment.
  Runs were stopped, finished runs were compacted (re-graded, agent changes saved as `agent.patch`, checkout
  deleted), and runs that were incomplete or hit the full disk were redone. Checkouts are now deleted right after
  grading.
- **My own re-grading bugs.** A relative path in `compact.ts` made Django unimportable from the test run's working
  directory, two compaction passes ran concurrently, and a detached `git gc` raced with deletion. Each made re-grades
  fail spuriously. After fixing all three, **every one of the 342 re-graded verdicts matched the verdict the runner
  recorded at run time**.
- **Review findings (CodeRabbit), all fixed:**
  - test files are restored from the base commit rather than the agent's `HEAD`
  - stderr output between a test's name and its result is handled
  - a test run with no results counts as a failure (usually the fix breaks importing Django), not as an
    infrastructure error
  - compaction leaves recent incomplete runs alone
  - an instance-level test was added, because seeds of one instance are correlated

## Caveats

- One repository and one environment line (Django 4.0/4.1), one forge.
- Haiku ran 3 seeds and Sonnet 2. The resolve-rate differences are far from significant in either direction. The
  data rules out a large effect, not a small one.
- No official SWE-bench Docker images: a locally reconstructed environment, validated with the gold patches.
