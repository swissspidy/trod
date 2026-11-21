# Zorbit suite (round 19): private knowledge

Zorbit is an invented internal order and billing service, so no model can have seen it. It answers questions about
1,300 orders, 140 customers, refunds and order lines over HTTP, with twelve quirks (listed at the top of
[`zorbit.ts`](zorbit.ts)). Most quirks are silent: they give a plausible wrong answer rather than an error. The data and
the quirks' parameters (clock offset, throttle limit, region codes, fiscal year start, refund id width) come from
`ZORBIT_SEED`. The seed used for a round stays private until the round is written up, and is published with it.

## Files

| File | What |
|---|---|
| `zorbit.ts` | data, service, the 60 questions (20 train, 40 test: 5 of each of 8 kinds), grading, the agent's docs |
| `solver.ts` | a scripted client that knows every quirk, except the ones you tell it to ignore |
| `calibrate.ts` | offline, no model: checks that the scripted client gets every answer, and which quirks change each one |
| `produce.ts` | writes each arm's notes: Claude Code's `/init`, `trod forge` (with or without practice), `trod learn` |
| `compare.ts` | pass rates with Wilson and task-bootstrap intervals, and paired differences against the first arm |

## Isolation

The service runs inside the runner, and the answers are computed there. Nothing about the answers is written to disk,
because the runner gives each run directory (including `expected.json`) to the agent's user. The quirks' mechanisms are
in this folder's source, so agent sessions run as another OS user (`--as-user`) while the repository is not readable
for it (`chmod 700` on the checkout for the duration of the runs). Notes files are copied in as `CLAUDE.md` from a
directory the agent cannot read (`ZORBIT_NOTES`).

## Run

```sh
export ZORBIT_SEED=<seed>
node experiments/private/calibrate.ts                         # no cost
node experiments/runner/run.ts --suite zorbit:train --arms baseline --model claude-haiku-5-5 \
  --as-user agent --seeds 2 --out /srv/r19/haiku-train-none   # the sessions trod learn reads
node experiments/private/produce.ts learn /srv/r19/produce/learn /srv/r19/haiku-train-none
ZORBIT_NOTES=/srv/r19/produce/learn/notes.md node experiments/runner/run.ts --suite zorbit:test --arms baseline \
  --model claude-haiku-5-5 --as-user agent --seeds 2 --out /srv/r19/haiku-test-learn
node experiments/private/compare.ts summary.json none=/srv/r19/haiku-test-none learn=/srv/r19/haiku-test-learn
```

[Round 19](../../results-19/README.md) has the results.
