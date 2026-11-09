# Round 14: an exact right angle, a second test sample, and where 100% is impossible

**Result on test seeds 0–4: 143/150 solved (95.3%), all 143 at full credit.** Of the 145 runs that can be scored,
143 pass (98.6%). Round 13 had 141 solved and 136 at full credit; round 12 had 137 and 122. The same harness on five
new test seeds (5–9) solves 140/150. Over all 300 runs it solves 283, which is 97.6% of the 290 scoreable runs.

Same 30 task types and model (Haiku 5.5) as rounds 9–13. The harness is round 13's tuned harness with one page
replaced, right-angle.

## right-angle: from 0.97–0.99 to full credit

Round 13 solved every right-angle run but never got full credit. The reward is continuous, (90° − error) / 90°, so
any error costs credit. Reading the page source and probing it in a browser turned up two problems with the old
recipe:

- **The page measures bounding boxes.** The angle is computed between the circles' bounding-box corners. The new
  circle has radius 3 and the given ones 3.5, so their boxes sit half a pixel apart. A click puts the new centre at
  (click + 2, click + 2) on the page.
- **Observed centres were off by half a pixel.** `mw observe` rounds the circles' .5 edges up, so the old script's
  `x + w/2` read each centre 0.5 px too far.

The new recipe takes centre = `x + (w−1)/2` and searches every click in the canvas for the smallest angle error,
preferring long arms. On 6 validation seeds it scored 0.9997–1.0; on the 10 test seeds, nine runs scored 0.9996–1.0
and one scored 0.9961.

## Per type, seeds 0–9 (types that missed full credit at least once)

| Type | Solved / 10 | Why |
|---|---|---|
| hover-shape | 0 | **Cannot be scored**: the call that reports the reward is commented out upstream, so no agent can pass. |
| tic-tac-toe | 8 | **Cannot reach 100%.** The page's opponent plays a random cell 55% of the time; otherwise it takes a winning cell, else blocks X. Computed exactly, perfect play wins 96.6% of games where X moves first and 72.7% where O does (it starts half the time): **84.7% overall**. 8/10 is at that ceiling. |
| button-delay, copy-paste, drag-items-grid, social-media-some, stock-market | 9 each | One miss each, on different seeds; no type missed twice. |
| right-angle | 10 (one at 0.996) | See above. |

The other 22 types passed all 10 runs at full credit.

## What this says about "100% everywhere"

- **The scoreable ceiling is below 150/150 on this set.** hover-shape cannot be scored, and tic-tac-toe's ceiling is
  about 85% because of the opponent's randomness. Leaving out hover-shape and counting tic-tac-toe at that ceiling,
  the best expected score is about 143.5 of 145 on seeds 0–4. This run got 143.
- **The remaining misses are rare and spread out**, one each on five types. Tuning against them needs many more
  practice seeds per type, so that a 1-in-10 failure shows up before the test.
- `candidates/tic-tac-toe.md` holds a solver rewritten around the opponent's exact policy from the page source. It was
  written after this test and is not part of the tested harness. On the two lost boards it chooses the same moves as
  the old solver, which already played close to optimal; it goes to validation in the next tuning round.

## Caveats

- One run per seed and type. Seeds 0–4 repeat round 13's test seeds; 5–9 are new. No learner, tuner or proposer has
  seen any test seed.
- MiniWoB++ episodes are seeded, so the opponent's moves are fixed for each seed. A harness could exploit that, but it
  would not generalize, and we do not.

Files: `summary.json`, `runs.jsonl` (300 runs), `harness/` (the harness as tested), `candidates/` (not tested).
