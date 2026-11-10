# Round 6: AppWorld — the tools tie, the distilled notes win

**Update (round 6b):** the same conventions the experience forge learned, put in an always-loaded `CLAUDE.md`
instead of tool descriptions, raise Haiku from 87.5% to **95.0%** task goal completion (105 → 114 of 120 paired test
runs; 11 fixed, 2 broken, exact McNemar p = 0.022). Adding the tool library on top does not help (110/120). See
[Round 6b](#round-6b-the-conventions-as-always-loaded-notes) below. **Round 6d:** notes written by `trod forge` itself
reached 104–108/120, so the 6b result depends on a few rules one forge happened to find
([round 6d](#round-6d-can-trod-forge-write-the-round-6b-notes-itself)).

**Correction (round 17):** on all 585 tasks of the two test sets, these notes do not help: 85.8% without and 86.5%
with them. The 95% below holds only on this round's 120-task sample, on which the notes were the best of five sets
tried. See [round 17](../results-17/README.md).

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

## Round 6c: through `trod forge` (trod 0.4)

The product path: `trod forge` (trod 0.4, [ADR 0004](../docs/adr/0004-verified-notes.md)) with the same experience
digest wrote 9 tools and 3.8 KB of `.trod/notes.md` with 17 checks, **all 17 passing** against the live environment,
and linked the notes into `CLAUDE.md` ($3.03, 73 turns). Haiku on the same 120 tasks:

| condition | TGC |
|---|---|
| baseline | 105/120 (87.5%) |
| round 6b notes only | **114/120 (95.0%)** |
| `trod forge` tools + `trod forge` notes | 105/120 (87.5%) |
| `trod forge` tools + round 6b notes | 110/120 (91.7%) |

The forged notes and tools did not reproduce round 6b. Two causes, from the failures:
- **The notes spent their budget on the tools.** Much of the 3.8 KB explained how to use the forged tools, and
  domain rules that round 6b's notes had were missing. One example is that approving a Venmo request needs a
  `payment_card_id` when the balance is too low; all three variants of that scenario failed on it. trod's forge
  prompt now tells it to keep notes to environment knowledge and leave tool usage to the tool descriptions.
- **Tools on top of good notes cost a little.** Round 6b's notes with a library scored 110/120 in both round 6b and
  6c, against 114 without one. That is not significant on its own (p = 0.29 here), but it is consistent.

So on AppWorld the knowledge is the asset, and its content matters more than its packaging.

## Round 6d: can `trod forge` write the round 6b notes itself?

Round 6c's forge spent its notes on its own tools. Two more forges with the same experience digest (Opus 5.5, about
$3 each) and an improved notes prompt, each scored with and without its tools. All checks passed in both forges
(v6: 18/18), and both linked their notes. Haiku 5.5, the same 120 test tasks, one seed, no infra failures:

| condition | TGC | vs baseline (fixed/broken) | vs round 6b notes (fixed/broken, p) |
|---|---|---|---|
| baseline | 105/120 (87.5%) | | |
| round 6b notes | **114/120 (95.0%)** | 11/2 | |
| v5 notes ("environment, not tools") | 104/120 (86.7%) | 6/7 | 2/12, p = 0.013 |
| v5 tools + notes | 106/120 (88.3%) | 7/6 | 2/10, p = 0.039 |
| v6 notes ("rules; every trap with its action") | 108/120 (90.0%) | 9/6 | 2/8, p = 0.11 |
| v6 tools + notes | 107/120 (89.2%) | 7/5 | 3/10, p = 0.09 |

The notes are in [`forged-notes/`](forged-notes/), per-task results in [`round-6d.json`](round-6d.json).

- **Facts are not rules.** v5's notes ([v5.md](forged-notes/v5.md)) were accurate API facts and scored like no notes.
  One true line, "place_order buys EVERYTHING in the cart (may already hold items)", gave no action. Haiku improvised
  one, moving cart items to the wishlist. That was an unrequested change, and 4 tasks the baseline passed failed on
  it. A warning without the right action can do harm, so trod's forge prompt now asks for rules ("X means Y; do Z")
  and an action for every trap it names. v6 ([v6.md](forged-notes/v6.md)) follows that and is the best forged
  result, but it is still 2–3 tasks above baseline and not significant.
- **The gap to round 6b is a few specific rules.** One scenario explains most of it: "approve all Venmo payment
  requests from my roommates from this calendar month". Every forged variant failed all 3 of its tasks. Round 6b's
  notes passed all 3 with one rule: pass `payment_card_id` when the Venmo balance is too low. That rule came from the
  v2 forge exploring the live environment; the train digest never mentions it. So whether a forge finds the rules
  that matter varies from forge to forge. Notes that scored 114/120 and notes that scored 104/120 came from the
  same procedure.

So `trod forge` can write useful, verified notes: the checks held in every forge. But on AppWorld it does not
reliably write the notes that matter. What helped was knowledge one forge happened to find. To make that reliable,
notes would have to accumulate across forges and be scored against graded runs, not only checked against the
environment.

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
