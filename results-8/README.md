# Round 8: ScienceWorld — forged notes take Haiku from 52% to 89%, past Sonnet

[ScienceWorld](https://sciworld.apps.allenai.org) (Apache-2.0, `pip install scienceworld`) is a text-based science
simulator: 30 task types (boil a substance, measure a melting point, test conductivity, identify life stages, mix
paints, grow plants, Mendelian genetics, …), each with many variations that change the substance, organism, room
layout or target. It is the kind of environment rounds 6b and 7 pointed to: the missing knowledge **recurs**. The same
command phrasings, device quirks and procedures come back in every variation of a task type.

## Setup

- 30 task types × the first 2 test variations = 60 tasks, 3 seeds each. Haiku 5.5, `claude -p`, Bash only. Every run
  gets its own environment process; the agent acts through `sw` (one action per line, several per call) with at most
  100 actions. The runner reads the final score (0–100; −100 when an action fails the task) with a token; the agent
  never sees the score or the gold path. A task counts as solved at score 100.
- **Notes**: one Opus session per task type ($6.55 for all 30, about 3 KB each) got the gold trajectories (actions and
  observations) of two **train** variations and a live third train variation to try commands in, and wrote notes on
  how this task type is done: working command phrasings, where things are, broken devices and fallbacks, the procedure,
  what fails the task. In each test run the notes for that task type are the work directory's `CLAUDE.md`. Test
  variations never entered the forge.

## Results

| arm | solved | mean score | tokens/run | turns | $/run |
|---|---|---|---|---|---|
| Haiku, no notes | 94/180 (52.2%) | 69.2 | 265k | 12.6 | 0.0059 |
| **Haiku + forged notes** | **160/180 (88.9%)** | **93.0** | **162k** | **7.9** | **0.0039** |
| Sonnet, no notes (1 seed) | 40/60 (66.7%) | 77.1 | 138k | 7.6 | 0.0420 |

- Paired by run: **67 fixed, 1 broken** (exact McNemar p = 5 × 10⁻¹⁹); the score improves in 72 runs and drops in 2.
- On the same seed, Haiku with notes solves 53/60 against Sonnet's 40/60, at 9% of Sonnet's cost per run. Against
  Sonnet the $6.55 forge pays for itself after about 170 sessions, while solving more.
- With notes Haiku also spends 39% fewer tokens and 37% fewer turns: it stops exploring.
- **Leakage check.** The forge saw only train variations. 6 of the 60 test tasks (the three lifespan task types) have
  the same task description as a variation the forge saw, because their descriptions are generic and the variations
  differ in which animals are present. Excluding them changes nothing: 50.6% → 91.4%, still 67 fixed and 1 broken.

Where it helps most (solved runs out of 6, no notes → notes): identify-life-stages-1 0 → 6, identify-life-stages-2
0 → 6, test-conductivity-of-unknown-substances 0 → 6, chemistry-mix-paint-tertiary-color 1 → 6,
mendelian-genetics-unknown-plant 0 → 5, mendelian-genetics-known-plant 0 → 3 (per task type in `by-task.json`).

## What we learned

1. **When knowledge recurs, forged notes are a big lever.** Each task type's notes cover what every variation needs:
   that `focus on` takes the object as the observations name it (`focus on substance in metal pot`, not
   `focus on water`), that sinks and stoves can be broken and where the fallback is, how long to `wait`, how to read a
   thermometer, which pairings of paints make which colors. A newcomer has to discover all of that by trial and error
   within 100 actions; Haiku with the notes simply does it.
2. **The notes beat a bigger model.** Haiku + $0.22 of notes per task type outperforms Sonnet without them by 22
   points, at a tenth of the cost per run.
3. **This completes the picture from rounds 5–7.** Forged knowledge pays in proportion to how much of tomorrow's work
   today's lessons cover: nothing where the model already knows the domain (SWE-bench, round 5), little where every
   question needs its own fact (BIRD, round 7), +7.5 points where a dozen conventions recur (AppWorld, round 6b), and
   +37 points where whole procedures recur (ScienceWorld).

## Reproduce

```sh
uv venv -p 3.11 /opt/sciworld/venv && VIRTUAL_ENV=/opt/sciworld/venv uv pip install scienceworld==1.2.3   # needs Java
node experiments/sciworld/forge-notes.ts --as-user agent          # writes experiments/sciworld/notes/<task>.md
node experiments/runner/run.ts --suite sciworld:test --arms baseline --seeds 3 --model claude-haiku-5-5 --as-user agent --out results/runs/sw-base
SW_NOTES=$PWD/experiments/sciworld/notes node experiments/runner/run.ts --suite sciworld:test --arms baseline --seeds 3 --model claude-haiku-5-5 --as-user agent --out results/runs/sw-notes
```

`runs.jsonl` has one record per run (with `infra`: whether grading itself failed; none of the 420 did, so no run was excluded), `summary.json` the table above, `by-task.json` the per-task-type numbers and
`forge.json` the forge sessions; the notes are in `experiments/sciworld/notes/`.
