# Round 10: a wiki of notes routes itself

Round 9 handed each test run the notes for its own task type. A real project does not know in advance which kind
of task comes next. This round checks whether that matters, prompted by Anthropic's
[components of agent memory](https://www.anthropic.com/research/components-of-agent-memory) (a small injected layer
plus pages read on demand) and by the observation that wikis grow naturally page by page.

## Setup

The 29 Opus notes from round 9 (`results-9/forged-notes/`) were turned into a wiki by
`experiments/miniwob/build-wiki.ts`, without editing them:

- **Index** (`experiments/miniwob/wiki/index.md`, 3.2 KB): one line per page, `.trod/wiki/<type>.md: tasks like
  "<a train-seed task utterance>"`, plus one instruction: find the page whose example matches your task and Read it.
  The index is the run's `CLAUDE.md`; the pages are in `.trod/wiki/`. hover-shape has no page: its notes were never
  verified in practice (round 9 caveats).
- **All notes**: the same 29 pages concatenated into one `CLAUDE.md` (38.5 KB), no routing.

The same 30 hard task types and test seeds 0–4 as round 9 (150 runs per arm), Haiku 5.5, the same harness. The
round 9 arms are the comparison.

## Results

| arm | solved | full credit | tokens/run | turns | $/run |
|---|---|---|---|---|---|
| Haiku, no notes (round 9) | 102/150 (68.0%) | 97 | 136k | 6.8 | 0.0034 |
| Haiku + its type's notes, pre-routed (round 9) | 135/150 (90.0%) | 135 | 91k | 4.7 | 0.0025 |
| **Haiku + wiki index, reads its own page** | **134/150 (89.3%)** | **133** | **112k** | **5.5** | **0.0030** |
| Haiku + all notes in `CLAUDE.md` | 136/150 (90.7%) | 135 | 141k | 4.1 | 0.0047 |

- **Routing works.** In every run whose task type has a page, Haiku read that page (145 of 145) and never a wrong
  one; in the 5 hover-shape runs, which has none, it read no page. Against pre-routed notes: 4 fixed, 5 broken
  (exact McNemar p = 1.0).
- **Against no notes:** the wiki fixes 38 runs and breaks 6 (p = 9 × 10⁻⁷); per task type it improves 17 and
  worsens 1 (sign test p = 0.0001). All notes at once: 40 fixed, 6 broken (p = 3 × 10⁻⁷).
- **Cost.** Loading all 29 pages solves as many but costs 1.9× the pre-routed notes per run ($0.0047 vs $0.0025;
  38.5 KB more context in every turn). The index costs one Read per run: $0.0030, still below Haiku without notes.
- Where the arms differ, it is noise on hard types: stock-market fails 4/5 with the wiki and 0/5 pre-routed (its
  price moves between observing and clicking), count-sides and visual-addition fail more with all notes.

## What this means for trod

The notes do not need to be routed by the harness. A small index in `CLAUDE.md` that says when to read which page
lets the model pick the right page itself, at almost no cost, and the knowledge can grow page by page instead of
filling every session's context: general rules plus an index in `.trod/notes.md`, one page per kind of task in
`.trod/wiki/`.

## Caveats

- 29 pages is a small wiki, and the index lines carry a typical task utterance, which makes matching easy for
  MiniWoB's templated tasks. Projects whose tasks are worded freely need index lines that describe the kind of task.
- One run per seed and arm, as in round 9.

Files: `summary.json`, `runs.jsonl` (one line per run; `pagesRead` lists the wiki pages each wiki run read). Code:
`experiments/miniwob/build-wiki.ts`, the `MW_WIKI` and `MW_NOTES_ALL` options in `experiments/miniwob/miniwob.ts`.
