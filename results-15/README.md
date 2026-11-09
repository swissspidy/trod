# Round 15: validated tuning on AppWorld finds nothing to improve, and that is the result

**Result: 117/120 (97.5%) task goal completion on round 6's test sample** (58/60 test_normal, 59/60
test_challenge), Haiku 5.5 with the round 6b notes. Three tuning iterations proposed new notes; dev validation rejected
all three, so the notes are unchanged. Round 6b measured the same notes at 114/120. With the notes identical, the
difference between the two measurements is run-to-run variation.

## What ran

`experiments/appworld/tune.ts` applies round 13's loop to AppWorld. The harness here is one always-loaded `CLAUDE.md`,
not task pages:

1. **Practice.** Haiku runs the 90 train tasks with the current notes.
2. **Propose.** Opus reads the current notes and the experience digest (`digest.ts`): the train tasks Haiku failed,
   the tests they failed, and AppWorld's reference solutions, which ship for the train split only. It rewrites the
   notes as general conventions, never task-specific answers, in at most 6000 characters.
3. **Validate.** Haiku runs the 57 dev tasks twice with the parent and twice with the candidate. The candidate is kept
   only if it passes at least 2 more of the 114 runs.

| Iteration | Train (practice) | Dev, current notes | Dev, candidate | Decision |
|---|---|---|---|---|
| 1 | 86/90 | 110/114 | 106/114 | reject |
| 2 | 86/90 | 113/114 | 111/114 | reject |
| 3 | 86/90 | 109/114 | 110/114 | reject |

Proposer cost: $1.18. Across the three validations the current notes passed 332/342 dev runs (97.1%). The candidates
are kept in `rejected-candidate-*.md`.

## Why the loop had nothing to fix

- **The train failures are mostly one grader bug.** Of the 12 failed train runs over the three passes, 8 are the 3
  variants of one scenario, failed in nearly every pass. The workout plan gives a length in minutes. AppWorld's
  reference solution compares that number directly with the playlist length in seconds, and the tests check for the
  playlist that comparison picks. Haiku converts the units, chooses a playlist that is actually long enough, and
  fails. Iteration 1's proposer learned to copy the bug ("the grader does no unit conversion"). That candidate did
  worse on dev and was rejected, so the bug never reached the notes. Like MiniWoB's hover-shape, this is a ceiling of
  the benchmark, not of the agent.
- **The other failures don't repeat.** The other 4 train failures were on 4 different tasks, one run each. On dev, one
  task failed in all three parent passes. It needs songs from every page of two Spotify lists (playlists and liked
  songs), and the notes already say to fetch all pages. Every other dev failure appeared once or twice in six runs.
- **The proposals did not improve dev.** The three rewrites restructured the notes and added rules drawn from four
  failures. Two did worse on dev (106 vs 110, 111 vs 113). The third passed one run more (110 vs 109), short of the
  two-run margin and within run-to-run variation. Without validation, iteration 1's rewrite would have shipped and cost about
  3.5 points.

## The three test misses

Two are variants of the Splitwise trips scenario: record trip expenses from a free-form note. Round 6 already found
it failing in both arms and in every variant. The third is a long recruiting-email task: replies to applicants, each
from a template, with an offer letter attached for the selected ones. Neither has a train-split counterpart, so the
digest could not teach them.

## What this says about "100% everywhere"

- AppWorld with the 6b notes sits at 97–98% on test and dev. The remaining failures are one grader bug, which matters
  on train only, and rare one-off misses spread across tasks.
- Validated tuning is a safeguard as much as a lever. Here it found no improvement. It stopped two plausible
  rewrites that scored worse, one of them by 3.5 points, and a third whose one-run gain was within noise.
- Moving the last two points would take scenario-specific knowledge the train split does not contain (Splitwise
  trips, multi-template emails) or more practice runs per task, so that rare misses show up in the digest.

## Caveats

- One test run per task (120 runs). Round 6b's 114/120 and this run's 117/120 used identical notes.
- The test sample (`experiments/appworld/sample-*.json`) is round 6's: 20 scenarios × 3 variants per test split.
- AppWorld data may only be redistributed encrypted, so `runs.jsonl` has task IDs and results but no task text.

Reproduce: `AW_HOME=/opt/appworld AW_SERVER_USER=awenv node experiments/appworld/tune.ts --start
experiments/appworld/notes/CLAUDE.md --iterations 3 --as-user agent --out results/runs/my-aw-tune`, then the test
command from `results-6/README.md` with `AW_NOTES` set to the final notes.
