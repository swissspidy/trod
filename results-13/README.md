# Round 13: validated harness tuning (`tune.ts`) on MiniWoB++

**Result: 141/150 solved (94.0%), 136 at full credit. Round 12 had 137 solved and 122 at full credit.** Same 30
task types, same test seeds 0–4, same model (Haiku 5.5). One of those types, hover-shape, cannot be scored (see
below). On the 145 scoreable runs the tuned harness solves 141 (97.2%).

## What changed

Round 12's notes were learned once, from session transcripts. Round 13 tunes them in a loop and keeps a change only
if it helps, the recipe from HarnessMM and the Strands harness optimizer. The model stays fixed; only the harness
changes. `experiments/miniwob/tune.ts`, starting from `results-12/learned`:

1. **Practice.** Haiku runs every type on 4 fresh dev seeds per iteration (516+, 520+, 524+).
2. **Propose.** For each type that is not perfect, an Opus session gets the current notes, that type's page and digests
   of the failed runs. It practises the task live on train seeds and writes one page (at most 1800 characters, with a
   `Tasks like: "…"` line the index routes by). A page is only used if the proposer solved the task at least once
   while practising.
3. **Validate.** Haiku runs the parent harness and the candidate on 6 held-out dev seeds (560–565) per proposed type.
   A page is kept only if it solves more runs, or the same number with reward more than 0.05 higher.
4. Repeat with the accepted harness.

| Iteration | Practice solved | Pages proposed | Kept |
|---|---|---|---|
| 1 | 103/120 | 13 | 10: button-delay, click-button-sequence, click-checkboxes-soft, click-menu, click-test-2, click-test-transfer, draw-circle, hot-cold (validation 2/6 → 6/6), right-angle (3/6 → 6/6), tic-tac-toe |
| 2 | 112/120 | 4 | 1: stock-market (4/6 → 5/6) |
| 3 | 111/120 | 5 | 0 (the parent already solved all but button-delay, where the candidate tied) |

Proposer cost: $10.26 for three iterations. The final harness is in `harness/`: round 12's notes and general pages,
plus 11 task pages listed under "Task-specific pages (tuned)" in `notes.md`.

## Test, per type (only types whose result changed)

| Type | Round 12 solved / full | Round 13 solved / full | Tuned page |
|---|---|---|---|
| hot-cold | 2 / 0 | 5 / 5 | yes |
| stock-market | 3 / 3 | 5 / 5 | yes |
| draw-circle | 5 / 0 | 5 / 5 | yes |
| button-delay | 5 / 3 | 5 / 5 | yes |
| click-checkboxes-soft | 5 / 3 | 5 / 5 | yes |
| right-angle | 4 / 0 | 5 / 0 | yes |
| social-media-some | 4 / 4 | 5 / 5 | no |
| drag-items-grid | 5 / 5 | 4 / 4 | no |
| drag-shapes | 5 / 5 | 4 / 4 | no |
| tic-tac-toe | 5 / 5 | 4 / 4 | yes |

Most gains are on types with tuned pages, and they are large: hot-cold, stock-market and draw-circle were round 12's
weakest types. social-media-some (4 → 5) has no tuned page. Each loss is one run on a type where round 12 was perfect; with one run per seed, that is within noise.

## What stands between this and 100%

- **hover-shape cannot be scored.** The task computes a hover score, but the call that reports it is commented out
  upstream (`// core.continuousReward(score);`, "TODO: Convert to the normal reward."). The episode never ends and
  never gives a reward, whatever the agent does, so every harness scores 0/5. It belongs out of the denominator; see
  `experiments/miniwob/results/headroom-types.notes.md`.
- **right-angle is solved but never at full credit** (0.97–0.99). The reward falls off with the angle error, so this
  is pixel precision rather than a misunderstood task. A measuring tool, rather than another page, is the next thing to
  try.
- **Single misses** on drag-items-grid, drag-shapes, tic-tac-toe and use-autocomplete. A second test run would show
  whether any of them is more than noise; the next tuning round should practise on more seeds per type so that rare
  failures show up before the test.

## Caveats

- **One run per seed and type**, as in earlier rounds. A one-run change per type is noise; the totals and the large
  per-type changes are the signal.
- **The validation seeds are reused** across iterations (as in HarnessMM), so later iterations are slightly fitted to
  them. Test seeds 0–4 were never seen by the tuner, the proposer or any learner.
- **Selection.** The 30 types are the ones Haiku failed on dev seeds 500–503 (round 11). The other 91 MiniWoB++ types
  were not run here.

Files: `summary.json` (totals, every keep/reject decision with its validation scores), `runs.jsonl` (the 150 test
runs), `harness/` (the tuned notes and pages). Reproduce, with a new `--out` folder (the tuner resumes from `state.json` in an existing one):

```
node experiments/miniwob/tune.ts --start results-12/learned --types "$(cat experiments/miniwob/results/headroom-types.txt)" \
  --iterations 3 --out results/runs/my-tune
MW_LEARNED=$PWD/results/runs/my-tune/harness-3 MW_TASKS="$(cat experiments/miniwob/results/headroom-types.txt)" MW_PER_TASK=5 \
  node experiments/runner/run.ts --suite miniwob:test --arms baseline --seeds 1 --model claude-haiku-5-5 --out results/runs/my-test
```

Or test the snapshot here directly: `mkdir -p p/.trod && cp -r results-13/harness/* p/.trod/`, then `MW_LEARNED=$PWD/p`.
