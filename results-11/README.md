# Round 11: `trod learn`, notes from sessions that already happened

Rounds 8–10 forged notes from expert trajectories or from live practice. Both need setup that most projects lack: a
brief, a success check, a practice environment. But every project that uses Claude Code already has a record of its
sessions: Claude Code keeps a transcript of each one in `~/.claude/projects/`. This round tests whether
`trod learn` can turn those transcripts into notes that help, with no brief, no check and no live environment.

## Setup

- **Sessions to learn from.** The 120 Haiku sessions (30 hard MiniWoB++ task types × dev seeds 500–503, no notes)
  that picked the test set in round 9: 58 passed, 62 failed. They are ordinary Claude Code transcripts from the
  isolated home of each run.
- **Learner.** `trod learn --from <transcripts> [--outcomes <file>]`: trod condenses each transcript (task, tool
  calls, errors, final message; about 8,000 characters at most), writes an index, and runs a forge session with the learn prompt:
  group the sessions by kind of task, compare failed sessions with passed ones, keep lessons that hold across
  sessions, write rules with the action to take, and split into `.trod/wiki/<kind>.md` pages when one file is not
  enough. The brief only said that each session operates one web page through `mw` and that no live page exists.
- **Test.** As in rounds 9 and 10: the same 30 types × test seeds 0–4, 150 runs per arm, Haiku 5.5. The learned
  `.trod/notes.md` is the run's `CLAUDE.md`, its wiki pages are in `.trod/wiki/` (`MW_LEARNED`). Test seeds never
  appear in the learners' sessions.
- **Round 2.** Haiku then ran 120 new sessions (dev seeds 504–507) with the round 1 notes loaded (100 passed), and
  `trod learn` ran again on those 120 transcripts, updating the existing notes. This is the loop a project would
  run: work, learn, work with the notes, learn again.

## Results

| arm | learner | solved | full credit | tokens/run | $/run |
|---|---|---|---|---|---|
| Haiku, no notes (round 9) | | 102/150 (68.0%) | 97 | 136k | 0.0034 |
| learned from 120 sessions, with pass/fail labels | Opus, $3.07 | 124/150 (82.7%) | 114 | 164k | 0.0039 |
| learned, **without labels** | Opus, $2.14 | 121/150 (80.7%) | 115 | 148k | 0.0035 |
| learned by **Haiku from its own sessions** | Haiku, $0.44 | 122/150 (81.3%) | 115 | 146k | 0.0036 |
| **learned again after round 2** (240 sessions) | Opus, +$1.38 | **132/150 (88.0%)** | **121** | **128k** | **0.0032** |
| *practice notes, Haiku as forge (round 9b)* | Haiku, $0.79 | 132/150 (88.0%) | 124 | 119k | 0.0031 |
| *practice notes, Opus as forge (round 9)* | Opus, $8.01 | 135/150 (90.0%) | 135 | 91k | 0.0025 |

- **Learning from transcripts works.** Against no notes, the round 1 notes fix 27 runs and break 5 (exact McNemar
  p = 1 × 10⁻⁴; per task type 15 better, 4 worse, sign test p = 0.02).
- **Labels are optional.** Without outcomes the learner judged each session from its transcript: 121/150, no
  significant difference from the labelled learner (9 fixed, 12 broken, p = 0.66).
- **Haiku can learn for itself.** Haiku as the learner, for $0.44: 122/150 (29 fixed, 9 broken against no notes,
  p = 0.002).
- **Learning compounds.** One more round of ordinary sessions and one more `trod learn` lift the notes to 132/150:
  34 fixed and 4 broken against no notes (p = 6 × 10⁻⁷; per type 18 better, 2 worse, p = 0.0004), and 11 fixed,
  3 broken against the round 1 notes (p = 0.06). That equals the notes Haiku forged by live practice (round 9b) and
  is close to Opus's practice notes, without a practice environment, for $4.45 of learning in total.
- **Where it falls short.** The round 1 notes made a few types worse (button-delay 4 → 2, right-angle 5 → 4,
  stock-market 4 → 3). For button-delay the transcripts showed that TWO can cover ONE, but not how exact the wait
  must be: practice (round 9) found that a wait that runs long loses credit, while the learner inferred "sleep N
  in its own Bash call", which adds seconds of turn overhead. Round 2's sessions showed the cost of that rule, and
  the updated notes chain the clicks and the sleep in one Bash call: button-delay went back to 5/5. A rule from
  transcripts is a hypothesis; the next round of sessions tests it.

## What this means for trod

`trod learn` removes the setup cost. A project that has been using Claude Code for a while can run it once, with no
brief and no labels, and get notes that lift a small model by 13–15 points here; run again after more
sessions, it reaches what practice reached. The natural loop is: work as usual, run `trod learn` now and then
(locally or on a schedule), review the diff to `.trod/notes.md` and `.trod/wiki/` like any other change, commit.
Where a success check exists, `--practice` still adds what transcripts cannot show.

## Caveats

- **A contaminated run, discarded.** The first round 2 learner found this repository's MiniWoB harness
  (`experiments/miniwob/mw_server.mjs`) from its working directory, started its own practice server and probed
  pages, some on test seeds; the learn prompt asks it to confirm lessons against the environment, and here the
  environment was the benchmark itself. Its notes were not tested. The round 2 learner reported above ran in a
  private mount namespace that hid the repository, the session's home and scratch directories (it saw empty
  `/home/user` and `/root`). The three round 1 learners did not touch the harness: the two Opus learners read
  nothing outside their sessions; the Haiku learner read `docs/adr/0004-verified-notes.md` for the checks format.
- **One test run read the `mw` client.** In the labelled round 1 arm, draw-circle seed 2 read
  `experiments/miniwob/bin/mw` (the command it was given) and still failed. No other test run in this round read
  anything outside its own work directory.
- **Selection.** The 30 types were picked because Haiku failed them on dev seeds 500–503, the same sessions round 1
  learns from; test seeds are fresh. The round 2 sessions' 100/120 is not comparable to round 1's 58/120 for the
  same reason (and they ran on new seeds).
- **MiniWoB is templated.** Each kind of task recurs with new values, which suits learning from transcripts. In a
  project whose tasks rarely repeat, fewer lessons will transfer.
- **The learned notes are published as tested, flaws included.** Like any rules inferred from transcripts, some are
  wrong or incomplete: the stock-market recipe observes the price and then clicks Buy, but the price can move in
  between (one Bash call does not make it atomic), and coordinate recipes for canvas tasks such as right-angle rest
  on a few sessions. The test results above measure the notes as they are.
- One run per seed and arm, as in rounds 9 and 10.

Files: `summary.json`, `runs.jsonl` (one line per run, including the 120 round 2 sessions), `learned/` (each
learner's `notes.md`, `wiki/` pages and cost). Code: `packages/cli/src/learn.ts`, `MW_LEARNED` and
`MW_SEED_OFFSET` in `experiments/miniwob/miniwob.ts`.
