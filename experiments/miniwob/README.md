# MiniWoB++: notes forged from practice episodes (round 7, in progress)

The question: does knowledge that recurs across tasks, here the quirks of one web widget type, transfer from practice
episodes to new ones when it is written down as notes?

- `mw_server.mjs` runs one seeded episode in headless Chromium; the agent acts through `bin/mw`. Test sessions never
  see their reward.
- `forge-notes.ts` gives Opus a live episode in train mode (seeds 1000+, `mw reward` and `mw reset`). It practises
  until it solves episodes reliably and writes `notes/<task>.md` (at most 1500 characters of rules plus a recipe).
- `MW_NOTES=experiments/miniwob/notes` copies the notes in as CLAUDE.md for the matching task type.

## Status

| Step | Result |
|---|---|
| Haiku baseline, all 121 task types × 4 dev seeds | 422/484 (87%); 30 types below 4/4 |
| Opus forge for those 30 types (train seeds) | 26 notes, $5.81 (4 failed: API credit ran out) |
| Haiku baseline on the 30 types × test seeds 0–4 | 90/150 (60%) |
| Pilot, 6 dev seeds: form-sequence-2 | 0/6 → 6/6 with notes |
| Pilot, 6 dev seeds: click-menu | 2/6 → 4/6 with notes |
| **Haiku + notes on the test seeds** | **not run yet (API credit ran out)** |

Per-type numbers are in `results/round-7-partial.json`.

To finish the round once the API key has credit again:

    node experiments/miniwob/forge-notes.ts --tasks "$(cat experiments/miniwob/results/headroom-types.txt)" --as-user agent
    MW_NOTES=experiments/miniwob/notes MW_TASKS="$(cat experiments/miniwob/results/headroom-types.txt)" MW_PER_TASK=5 \
      node experiments/runner/run.ts --suite miniwob:test --arms baseline --seeds 1 --model claude-haiku-5-5 \
      --as-user agent --parallel 3 --timeout 900 --out results/runs/mw-test-notes
