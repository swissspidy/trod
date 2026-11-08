# MiniWoB++: notes forged from practice episodes

Write-up and numbers: [round 9](../../results-9/README.md).

- `mw_server.mjs` runs one seeded episode in headless Chromium; the agent acts through `bin/mw`. Test sessions never
  see their reward. `MW_TRAIN=1` (forges only) adds `reward` and `reset`.
- `miniwob.ts` is the runner suite (`--suite miniwob:test|miniwob:dev`; test seeds 0+, dev 500+, train 1000+).
- `forge-notes.ts` gives Opus a live train episode in practice mode per task type; it writes `notes/<task>.md`.
- `MW_NOTES=experiments/miniwob/notes` copies the matching notes in as CLAUDE.md.
- `results/headroom-types.txt`: the 30 task types Haiku missed at least once on 4 dev seeds; `results/dev-sweep.json`:
  the per-type dev numbers.

Reproduce:

    T="$(cat experiments/miniwob/results/headroom-types.txt)"
    node experiments/miniwob/forge-notes.ts --tasks "$T" --as-user agent
    for arm in "" notes; do
      MW_NOTES=${arm:+experiments/miniwob/notes} MW_TASKS="$T" MW_PER_TASK=5 node experiments/runner/run.ts \
        --suite miniwob:test --arms baseline --seeds 1 --model claude-haiku-5-5 --as-user agent --out results/runs/mw-${arm:-base}
    done
