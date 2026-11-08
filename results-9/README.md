# Round 9: MiniWoB++, notes forged from practice take Haiku from 60% to 90%, past Sonnet

[MiniWoB++](https://github.com/Farama-Foundation/miniwob-plusplus) (MIT, `pip install miniwob`) is a set of about 130
small web tasks: nested menus, forms, date pickers, autocompletes, drag and drop, drawing, simple games. A seed
generates each page. Knowledge **recurs** here as in round 8, but it is not about procedures: it is how each kind of
widget behaves. Clicking a parent menu item ends the episode. A form is graded only after Submit even when the task
never mentions it. Enter does not submit. A drawing has to be one stroke.

Unlike round 8, there are no expert trajectories to learn from. The forge learns from **practice**: it plays train
episodes and is told whether each one succeeded.

## Setup

- **Episodes.** Each run gets its own headless Chromium with one seeded episode (`experiments/miniwob/mw_server.mjs`).
  The agent acts through `mw`: list the elements, then click, hover, type, press, drag, take screenshots. It has at
  most 60 actions. The agent never sees the reward; the runner reads it with a token. Solved means raw reward > 0.
  Task types that need sub-second reactions (chase-circle, moving-items, simon-says) are left out.
- **Picking task types.** Haiku 5.5 ran all 121 task types on 4 dev seeds (500+) and solved 422/484 (87%). The 30
  types where it missed at least once are the test set. The other 91 were 4/4 on dev and are not tested here.
- **Notes.** One Opus session per task type ($8.01 for all 30, about 1.3 KB of notes each) got a live episode in
  practice mode on **train** seeds (1000+). There `mw reward` shows whether the current episode is solved and
  `mw reset` starts the next one. The prompt asked it to play until it solved at least 3 in a row, then write rules
  ("X ends the episode; do Y first") plus a recipe that worked (`forged-notes/`). In each test run, the notes for that
  task type are the work directory's `CLAUDE.md`.
- **Test.** 30 types × test seeds 0–4 = 150 runs per arm, one run per seed, the same server code for every arm. Test
  and dev seeds never entered the forge, and test sessions get no practice mode.

## Results

| arm | solved | tokens/run | turns | $/run |
|---|---|---|---|---|
| Haiku, no notes | 90/150 (60.0%) | 128k | 6.4 | 0.0032 |
| **Haiku + forged notes** | **135/150 (90.0%)** | **91k** | **4.7** | **0.0025** |
| Sonnet, no notes | 101/150 (67.3%) | 69k | 4.5 | 0.0271 |

- **Against Haiku without notes:** paired by run, **48 fixed and 3 broken** (exact McNemar p = 2 × 10⁻¹¹). Tokens fall
  29% and turns 27%.
- **Against Sonnet without notes:** Haiku with notes fixes 39 runs and breaks 5 (p = 1.4 × 10⁻⁷), at 9% of Sonnet's
  cost per run.
- **Biggest gains** (solved out of 5, no notes → notes): form-sequence-2 0 → 5, visual-addition 0 → 5, draw-circle
  0 → 5, click-menu 1 → 5, drag-shapes 1 → 5, use-autocomplete 0 → 4, social-media-some 1 → 4, tic-tac-toe 1 → 4
  (all types in `by-task.json`).
- **No help:** hover-shape stays at 0/5 in every arm (the mouse has to keep following a moving square), and hot-cold
  goes only from 1 to 2. click-menu-2 stays at 3/5. The 3 broken runs are click-menu-2, count-sides and
  social-media-some, one each.

## Caveats

- **One note games the grader.** draw-circle asks for a circle drawn with the mouse, but no `mw` action can draw a
  curve. In practice the forge found that one straight diagonal chord scores 0.9, and its note says so. That is a
  quirk of the grader, not a skill. Without draw-circle the result is 90/145 → 130/145, still 43 fixed and 3 broken.
- **Selection favors the notes over Sonnet.** The 30 types were picked by Haiku's own dev failures, not Sonnet's.
  Against Haiku without notes the comparison is fair: the test seeds are fresh, and both arms ran on them.
- **Shared task descriptions are not leakage.** Most MiniWoB task descriptions are generic ("Click button ONE", "Find
  and click on the HOT area"), so 72 test runs share their description with a practice episode. The page itself (its
  layout, values and targets) comes from the seed, and train and test seeds do not overlap.
- **The forge is the stronger model.** The notes are Opus's practice distilled for Haiku. Whether Haiku could practise
  on its own and gain as much is untested.

## What this adds to rounds 5–8

Round 8 needed gold trajectories, which few environments have. Here the forge needed only a practice environment and
a success signal, and still gained 30 points. Notes once again cost less than a bigger model: forged once for $8.01
from practice runs, they let Haiku beat Sonnet while costing less per run than Haiku alone.

Files: `summary.json`, `runs.jsonl` (one line per graded run), `by-task.json`, `forge.json` (per-task forge cost and
turns), `forged-notes/`. Code: `experiments/miniwob/`.
