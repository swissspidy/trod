# Round 6: AppWorld — the library ties, because Haiku is already near the ceiling

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

TGC = task goal completion, SGC = scenarios with all three variants solved. Each run costs about half a cent.

## What we learned

1. **Haiku 5.5 is near AppWorld's ceiling.** 88% TGC from scratch, against roughly 49% for the best 2024 agents in the
   paper. The APIs are self-documenting (`api_docs`), and a current small model just reads the docs. There is little
   left for tools to fix, and nothing to save: a run costs $0.005.
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

## Reproduce

```sh
pip install appworld && appworld install && appworld download data   # in a venv under AW_HOME
useradd agent; useradd awenv   # see experiments/appworld/appworld.ts for the permissions
AW_HOME=/opt/appworld AW_SERVER_USER=awenv node experiments/runner/run.ts --suite appworld:test_normal \
  --sample experiments/appworld/sample-test-normal.json --arms baseline,forged --model claude-haiku-5-5 \
  --as-user agent --forge-dir results/runs/aw-forge --out results/runs/aw-normal
```

`runs.jsonl` and `summary.json` hold the per-run numbers (no task text: AppWorld data may only be redistributed
encrypted); `forged-library/` is the v2 library; `forge-1.json` and `forge-2.json` are the forge records.
