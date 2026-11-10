# Round 16: handing off from Opus to Haiku mid-task saves nothing on SWE-bench Django

**Result:** on 27 SWE-bench Verified Django instances, the "baton" arm passed 26/27 at $0.160 per task. In the baton
arm, Opus investigates and hands the rest to Haiku. Opus alone also passed 26/27, at $0.151 per task. Haiku alone
passed 13/27 at $0.007.

Given the choice, Opus finished the fix itself in 26 of 27 tasks. It handed off once. Asking for a hand-off cost
about 6% more than letting Opus work alone and changed no outcome.

## What ran

`experiments/handoff/run.ts` follows the mid-task hand-off idea from AgentBaton. Each run gets a fresh checkout with no
history and is graded as in round 5 (`experiments/swe`), against the instance's hidden FAIL_TO_PASS and PASS_TO_PASS
tests.

| Arm | What it does |
|---|---|
| haiku | Haiku alone |
| opus | Opus alone |
| baton | Opus works until a hand-off is ready: a reproduction, the responsible code located, the remaining change small and specific. It writes `HANDOFF.md` and stops, and a fresh Haiku session finishes from it. Opus may finish the fix itself when that is shorter than describing it. |

The sample (`experiments/handoff/sample.json`) has 27 instances:
- the 19 instances where Haiku passed fewer than 3 of 3 runs in round 5, the hard part;
- 8 instances drawn at random from the rest (seed 16).

Each arm ran each instance once. There were no infrastructure failures.

## Results

| Arm | Passed | Hard 19 | Cost per task | Total cost |
|---|---|---|---|---|
| haiku | 13/27 | 8/19 | $0.007 | $0.19 |
| opus | 26/27 | 18/19 | $0.151 | $4.07 |
| baton | 26/27 | 18/19 | $0.160 | $4.31 |

- **Paired outcomes:**
  - Baton and Opus passed exactly the same 26 tasks. Both fail django-14170: the fix passes the FAIL_TO_PASS tests but
    breaks 9 of 76 existing ones.
  - Opus and baton each passed 13 tasks Haiku failed.
  - Haiku passed nothing that Opus or baton missed.
- **Where the baton's cost went:** the Opus lead averaged $0.159, about the same as Opus alone. The Haiku finisher added
  $0.001 per task on average. The lead used slightly fewer turns (9.3 vs 10.3), but checking its own fix and writing
  `HANDOFF.md` ate the saving.
- **Handed off vs finished by the lead:**
  - Opus finished and verified the fix itself in 26 of 27 tasks. The finisher then only checked it (2 tasks) or
    didn't run (24 tasks). In those 2 tasks the file was titled `# HANDOFF — DONE`; the run script now recognises
    that form.
  - The one real hand-off, django-15629, was the hardest task in the sample. The fix had to propagate `db_collation`
    to foreign keys in the schema editor. The lead spent $0.365 on a 5.5 kB hand-off (see `handoffs/`), more than
    Opus alone spent on the whole task ($0.27). Haiku then finished it correctly for $0.006.

## Why the hand-off does not pay here

- **Once the cause is found, the fix is short.** On SWE-bench Django the expensive part is the investigation:
  reproducing the bug and finding the responsible code. The change itself is usually a few lines. A model that has done
  the investigation is a turn or two from done. Describing the change precisely enough for another model costs about
  as much as making it, so Opus, given the choice, makes it.
- **The expensive model still does the expensive part.** A hand-off only saves money when a large share of the work
  is left after the hand-off point and the cheap model can do that share. Here almost nothing is left.
- **Haiku is very cheap but fails half the time.** Its runs cost 1/20 of Opus's, but it fails 14 of 27, nearly all on
  the hard part of the sample. A hand-off cannot recover those tasks, because Haiku fails at the investigation, which
  the hand-off leaves to Opus.

## What this means for trod

- Don't build a hand-off mode for fixes like these. The arm that can hand off costs what Opus costs and passes what
  Opus passes.
- The cost lever that works is the one trod already has. Make the cheap model succeed alone with notes and tools
  learned from experience (rounds 5–15), instead of having the strong model do the hard part every time.
- A hand-off could still pay on tasks with a long, mechanical tail after the diagnosis, such as a migration across
  many files or a large generated change. Testing that needs a benchmark of such tasks; SWE-bench Verified has few.

## Caveats

- One run per arm and instance. With identical paired outcomes, Opus vs baton is a tie on pass rate. The cost
  difference ($0.009 per task) is within run-to-run variation, so the result is "no saving", not "baton costs more".
- The lead's instructions explicitly allowed it to finish small fixes itself. A lead forced to always hand off would
  test a different question: whether Haiku can execute Opus's plan. The one real hand-off here suggests it can, but
  that is a single task.

## Files

- `runs.jsonl` holds all 81 runs: pass, grader details, cost and turns per session phase, and the hand-off outcome for
  baton. The two `# HANDOFF — DONE` runs are marked as finished by the lead, with a note.
- `handoffs/django__django-15629.md` is the one real hand-off.

Reproduce: run `experiments/swe/setup.sh`, then `SWE_HOME=... node experiments/handoff/run.ts --instances
experiments/handoff/sample.json --arms haiku,opus,baton --as-user agent --out results/runs/handoff`.
