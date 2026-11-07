# Round 7: BIRD text-to-SQL — knowledge that does not transfer

[BIRD](https://bird-bench.github.io) (CC BY-SA 4.0) asks natural-language questions about real, messy databases
(sports, finance, medicine, schools) and grades a SQL answer by executing it against the gold query. Each question
comes with "evidence": a domain expert's hint such as "eligible free rate = `Free Meal Count (K-12)` / `Enrollment
(K-12)`". After AppWorld (round 6b), where distilled conventions helped, BIRD looked like the next test: the hints are
exactly the knowledge an agent cannot guess, so can experience with *earlier* questions on the same database replace
them?

## Setup

- BIRD dev: 11 databases, 1,534 questions. Within each database the questions are split by a hash of their id into
  train (40%, 614 questions) and test; 10 test questions per database are sampled (110 tasks), 3 seeds each.
- The agent (Haiku 5.5, `claude -p`, Bash only) gets the question, the read-only database (`./db.sqlite`), its column
  docs (`./docs/*.csv`) and a `sql` command, and writes one query to `answer.sql`. Grading executes it and the gold
  query in a separate process and compares the result rows as sets (BIRD's execution accuracy, EX).
- Isolation: sessions run as an unprivileged user that can read the databases but not the questions or gold SQL, and
  the run directory only ever holds the question id.
- Arms (all without the test question's own hint unless stated):
  - **notes**: per-database `CLAUDE.md` written by one Opus session per database that studied the database and the
    train questions with their hints and gold SQL ($3.36 for all 11, about 4 KB each).
  - **memory**: the train questions themselves (question, hint, gold SQL) as `past_questions.json`, with a pointer in
    `CLAUDE.md`. Agents searched it in 328 of 330 runs.
  - **memory + notes**: both.
  - **hint**: the test question's own BIRD evidence (the reference upper bound for "knowing the convention").
  - **sonnet**: Sonnet 5.5 with no hint, 1 seed.

## Results

| arm | EX | simple | moderate | challenging | tokens/run | $/run |
|---|---|---|---|---|---|---|
| Haiku, no hint | 202/330 (61.2%) | 157/222 | 36/78 | 9/30 | 82k | 0.0024 |
| + notes | 207/330 (62.7%) | 152/222 | 45/78 | 10/30 | 67k | 0.0023 |
| + memory | 203/330 (61.5%) | 154/222 | 42/78 | 7/30 | 83k | 0.0026 |
| + memory + notes | 209/330 (63.3%) | 157/222 | 43/78 | 9/30 | 77k | 0.0026 |
| + the question's own hint | **226/330 (68.5%)** | 169/222 | 47/78 | 10/30 | 76k | 0.0024 |
| Sonnet, no hint | 78/110 (70.9%) | 56/74 | 17/26 | 5/10 | 60k | 0.0248 |

Paired by run against the no-hint baseline: notes 24 fixed / 19 broken (exact McNemar p = 0.54), memory 17 / 16
(p = 1), memory + notes 25 / 18 (p = 0.36), the question's own hint 33 / 9 (p = 0.0003).

## What we learned

1. **Experience with other questions does not replace the question's own hint.** Neither distilled notes nor the raw
   past questions moved accuracy significantly, although the agents read them (memory was searched in 328 of 330
   runs). The hint itself is worth 7 points.
2. **BIRD's missing knowledge is question-specific.** Counting a task as solved when a majority of its seeds pass,
   the hint fixes only 10 of the 110 tasks; memory also fixes 4 of those. The hints that matter often encode
   one-off choices ("average monthly consumption = AVG(Consumption) / 12", "John as their first name = full_name LIKE
   'John%'"); the best-matching train hint shares on average 45% of the words of the hint that fixed a task. About 30%
   of tasks fail even with their hint, consistent with BIRD's known annotation noise, so the headroom is small.
3. **The notes still make sessions cheaper.** With notes, Haiku used 18% fewer tokens (82k → 67k) and 23% fewer turns
   (4.4 → 3.4): it skipped schema exploration it would otherwise do. On moderate questions they helped (36 → 45 of 78
   runs) and on simple ones they cost a little (157 → 152).
4. **Where it sits against round 6b.** AppWorld's missing knowledge was a dozen *recurring* conventions, so a 3 KB
   note reached most tasks (+7.5 points, p = 0.02). BIRD's is a long tail of per-question definitions, so the same
   approach mostly saves tokens. A forged library or note pays in proportion to how much of tomorrow's work today's
   lessons cover.

## Reproduce

```sh
mkdir -p /opt/bird && cd /opt/bird && curl -O https://bird-bench.oss-cn-beijing.aliyuncs.com/dev.zip   # unzip into data/ (dev.json, root only) and db/<db_id>/
node experiments/bird/forge-notes.ts --as-user agent                       # writes experiments/bird/notes/<db>.md
node experiments/runner/run.ts --suite bird:test --arms baseline --seeds 3 --model claude-haiku-5-5 --as-user agent --out results/runs/bird-base
BIRD_NOTES=$PWD/experiments/bird/notes node experiments/runner/run.ts …  --out results/runs/bird-notes    # notes arm
BIRD_MEMORY=1 node experiments/runner/run.ts …                           --out results/runs/bird-memory   # memory arm
BIRD_EVIDENCE=1 node experiments/runner/run.ts …                         --out results/runs/bird-evidence # hint arm
```

`runs.jsonl` has one record per run (no question text), `summary.json` the table above, `forge.json` the forge
sessions; the notes are in `experiments/bird/notes/` (CC BY-SA 4.0, derived from BIRD).
