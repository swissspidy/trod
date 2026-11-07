# Round 6: AppWorld — the tools tie, the distilled notes win

**Update (round 6b):** the same conventions the experience forge learned, put in an always-loaded `CLAUDE.md`
instead of tool descriptions, raise Haiku from 87.5% to **95.0%** task goal completion (105 → 114 of 120 paired test
runs; 11 fixed, 2 broken, exact McNemar p = 0.022). Adding the tool library on top does not help (110/120). See
[Round 6b](#round-6b-the-conventions-as-always-loaded-notes) below.

[AppWorld](https://appworld.dev) (ACL 2024) is a simulated world of nine apps (Amazon, Gmail, Spotify, Venmo,
Splitwise, SimpleNote, Todoist, phone, file system) with 457 APIs. Tasks are everyday chores ("approve all Venmo
payment requests from my roommates from this calendar month"), graded by unit tests on the final database state. It
looked like the ideal case for a forged library: one recurring, unfamiliar environment, programmatic grading, and
published agents that topped out around 50% task goal completion in 2024.

## Setup

- 20 scenarios × 3 variants from `test_normal` and 20 × 3 from `test_challenge` (`experiments/appworld/sample-*.json`),
  plus all 90 `train` tasks. Haiku 5.5, one seed, `claude -p` with Bash only (plus trod in the forged arm).
- The agent reaches the world only through `aw` (Python into the task's REPL with the `apis` object, the interface
  AppWorld's own agents get). Grading runs AppWorld's tests afterwards in a separate process (`aw_eval.py`).
- Isolation by OS user: the agent's sessions run as `agent`, which cannot read the AppWorld install at all; the
  environment runs as `awenv`, which cannot read the ground truth. This matters: AppWorld's in-process sandbox blocks
  `open()` but `getattr(__builtins__, 'open')` still reads files, so code sent to the REPL could read the answers. No
  transcript tried it; the published numbers all use the fixed setup.
- **v1**: a library forged once by Opus against one train task ($3.00, 12 tools). **v2**: the same library improved by
  a second Opus forge that read an *experience digest* ($1.40): the train tasks Haiku failed, the tests they failed,
  and AppWorld's reference solutions for the train scenarios (`digest.ts`). It learned the conventions, e.g. that
  "my roommates" means phone contacts with that relationship, not an app's friend list, and put them in a
  first-call `aw_context` tool and in the tool descriptions.

## Results

| condition | baseline TGC | forged TGC | baseline SGC | forged SGC | tokens/run (b → f) |
|---|---|---|---|---|---|
| train (no library) | 84/90 (93%) | | 27/30 | | 210k |
| v1, test_normal | 53/60 | 52/60 | 17/20 | 17/20 | 202k → 230k |
| v1, test_challenge | 53/60 | 52/60 | 16/20 | 14/20 | 325k → 348k |
| v2, test_normal | 52/60 | 54/60 | 16/20 | 17/20 | 197k → 230k |
| v2, test_challenge | 53/60 | 51/60 | 13/20 | 13/20 | 337k → 379k |
| **all test runs** | **211/240 (87.9%)** | **209/240 (87.1%)** | | | **+12%** |

TGC = task goal completion, SGC = scenarios with all three variants solved. Test runs averaged $0.0071 each.

## What we learned

1. **Haiku 5.5 is near AppWorld's ceiling.** 88% TGC from scratch, against roughly 49% for the best 2024 agents in the
   paper. The APIs are self-documenting (`api_docs`), and a current small model just reads the docs. There is little
   left for tools to fix, and nothing to save: a run costs less than a cent.
2. **The remaining failures are conventions, not capability.** They cluster in the same scenarios in both arms and all
   variants (Splitwise trips from a note, "roommates", friend sync, shopping-list orders): readings of an ambiguous
   instruction that differ from the grader's.
3. **The experience forge found those conventions, but they only help when they are read.** Haiku used the library in
   about half the forged runs; when it did, it followed the conventions (e.g. "roommates" → phone relationships)
   and passed tasks the baseline fails, but when it went straight to `aw` it repeated the baseline's mistakes. Net
   effect: none, at 12% more tokens.
4. **An explicit interface in the prompt beats library cards.** With "by running Python with the `aw` command" in the
   task prompt, Haiku almost never touched the library. Neutral wording raised use to about half the runs.

Round 4's lesson holds and sharpens: a forged library pays when working knowledge of an environment cannot be guessed
*and* the model cannot cheaply look it up. AppWorld documents itself, so the only unguessable part is the grader's
conventions, and those reach the model only if it reads them.

## Round 6b: the conventions as always-loaded notes

The v2 library tied, and one likely reason is reach: its lessons sat mainly in `aw_context`'s output (called in about
half the forged runs) and in tool descriptions, which the library cards clip. The runs do not prove that this was
the only way they could reach the model. Round 6b puts the same checklist (rewritten without tool references:
`experiments/appworld/notes/CLAUDE.md`, about 3 KB) into each session's work directory as `CLAUDE.md`, which
Claude Code always loads. Same 120 test tasks, Haiku 5.5, one seed (`AW_NOTES=…`).

| condition | TGC | SGC | tokens/run |
|---|---|---|---|
| baseline (v2 prompt) | 105/120 (87.5%) | 29/40 | 267k |
| baseline + notes | **114/120 (95.0%)** | **36/40** | 257k |
| v2 library | 105/120 (87.5%) | 30/40 | 305k |
| v2 library + notes | 110/120 (91.7%) | 31/40 | 288k |

Paired by task: notes vs no notes, 11 tasks fixed and 2 broken (exact McNemar p = 0.022); adding the library to the
notes, 3 fixed and 7 broken (p = 0.34). The notes cost nothing per run (tokens even fell slightly); they came from one
$1.40 Opus session that read 90 graded train runs.

**What this changes:** the valuable output of a forge is not necessarily code. Here the environment documents its own
APIs, so tools add little, but the grader's conventions cannot be guessed, and a short always-loaded note carries
them to every session. trod's forge should be able to emit notes as well as tools (for example into `CLAUDE.md` or the
server instructions), and the library-cards budget should leave room for them.

## Reproduce

```sh
pip install appworld && appworld install && appworld download data   # in a venv under AW_HOME
useradd agent; useradd awenv   # see experiments/appworld/appworld.ts for the permissions
# Use the published v2 library instead of forging a new one: the runner skips the forge when forge.json exists.
mkdir -p results/runs/aw-forge/appworld/work/.trod/library
cp results-6/forged-library/*.mjs results/runs/aw-forge/appworld/work/.trod/library/
cp results-6/forge-2.json results/runs/aw-forge/appworld/forge.json
AW_HOME=/opt/appworld AW_SERVER_USER=awenv node experiments/runner/run.ts --suite appworld:test_normal \
  --sample experiments/appworld/sample-test-normal.json --arms baseline,forged --model claude-haiku-5-5 \
  --as-user agent --seeds 1 --forge-dir results/runs/aw-forge --out results/runs/aw-normal
```

Round 6b adds `AW_NOTES=$PWD/experiments/appworld/notes/CLAUDE.md` to the same command, with a separate `--out`
(e.g. `results/runs/aw-normal-notes`): the runner skips task/arm/seed combinations that already have a result. Use
`--suite appworld:test_challenge --sample experiments/appworld/sample-test-challenge.json` for the challenge sample.
The published notes runs were checked: all 240 had a `CLAUDE.md` identical to `notes/CLAUDE.md`, and none of the
240 runs without notes had one (`analyze.ts` records this per run as `notes`).

`runs.jsonl` and `summary.json` hold the per-run numbers (no task text: AppWorld data may only be redistributed
encrypted); `forged-library/` is the v2 library; `forge-1.json` and `forge-2.json` are the forge records.
