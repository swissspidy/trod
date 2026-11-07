# Round 4: forge once with Opus, run with Haiku

**Result:**
- **Haiku 5.5 with a tool library forged once by Opus 5.5 answered every question correctly in all 9 runs.**
  Sonnet 5.5 working from scratch did so in 6 of 9. Haiku did it at **5–14% of Sonnet's cost**, in fresh sessions
  that each asked a different question.
- Against Haiku from scratch, the library cut tokens to **0.21–0.69×**, turns roughly in half, and wall time by up
  to **6×**.
- Each forge cost about $0.85 once and pays for itself after about 12–22 sessions.

Reports: [Sonnet runs](report.html) · [Haiku runs](../results-4-haiku/report.html) · forged libraries in
[`forged-library/`](forged-library/) · raw records in `runs.jsonl`.

## What changed since round 3 (trod 0.3, [ADR 0003](../docs/adr/0003-forge-library-cards-and-code-mode.md))

Round 3 showed that even a good library saved only about 26% per fresh session. Every session paid a floor of
about 7 turns: read the docs, list the files, read the tool's source, cross-check the API with curl. Then it
called, computed and wrote the answer one turn each. Three changes removed that floor:

1. **`trod forge`**: a dedicated, headless tool-building session per environment, on the strongest model. The
   prompt asks for capabilities rather than answers, every quirk encoded, descriptions written as the only
   documentation, and examples against the real environment. Only tools whose examples pass are promoted.
2. **Library cards**: at startup the server puts the library into its instructions (system prompt): signatures,
   what each tool handles, "verified", and usage in earlier sessions. A fresh session knows what it can rely on
   before its first turn.
3. **`trod_eval` (code mode)**: one call runs JS in which every tool is a function, so a session can fetch,
   combine, compute and write its answer in a single turn. Only the return value enters the context.

A typical forged session (Sonnet, inventory API, question 4) is two tool calls:

```
mcp__trod__trod_eval  const r = await tools.inventory_items({updatedSince: "2026-10-11T00:00:00Z", priceChanged: true}); …
Bash                  echo '{"skus": [...]}' > price-changes.json
```

## Results (3 environments × 4 fresh sessions × 3 seeds)

| environment | who | full pass | score | tokens | turns | wall | cost (4 sessions) | × Sonnet baseline |
|---|---|---|---|---|---|---|---|---|
| inventory-api | Sonnet, from scratch | 3/3 | 1.00 | 526k | 29 | 94 s | $0.209 | 1.00 |
| | Haiku, from scratch | 3/3 | 1.00 | 1005k | 45 | 200 s | $0.028 | 0.13 |
| | Sonnet + forged library | 3/3 | 1.00 | 243k | 13 | 49 s | $0.127 | 0.61 |
| | **Haiku + forged library** | **3/3** | **1.00** | 563k | 25 | 93 s | **$0.016** | **0.08** |
| code-qa | Sonnet, from scratch | 0/3 | 0.88 | 413k | 21 | 98 s | $0.271 | 1.00 |
| | Haiku, from scratch | 0/3 | 0.92 | 1912k | 54 | 235 s | $0.064 | 0.24 |
| | Sonnet + forged library | 3/3 | 1.00 | 401k | 21 | 45 s | $0.187 | 0.69 |
| | **Haiku + forged library** | **3/3** | **1.00** | 406k | 20 | 39 s | **$0.013** | **0.05** |
| ticket-triage | Sonnet, from scratch | 3/3 | 1.00 | 283k | 15 | 96 s | $0.190 | 1.00 |
| | Haiku, from scratch | 3/3 | 1.00 | 994k | 39 | 183 s | $0.039 | 0.21 |
| | Sonnet + forged library | 3/3 | 1.00 | 373k | 20 | 80 s | $0.190 | 1.00 |
| | **Haiku + forged library** | **3/3** | **1.00** | 681k | 25 | 146 s | **$0.026** | **0.14** |

Forges (Opus 5.5, once per environment):

| environment | cost | turns | tools |
|---|---|---|---|
| inventory-api | $0.84 | 35 | `inventory_items`, `inventory_movements`, `inventory_warehouses` |
| code-qa | $0.80 | 35 | `js_call_graph`, `call_graph_query` |
| ticket-triage | $0.90 | 31 | six `support_*` tools, including `support_ticket_context` |

The forge pays for itself through the cheaper sessions it enables. Running the daily sessions on Haiku with the
library instead of Sonnet from scratch saves $0.041–0.065 per session, so the forge has paid off after 12–22
sessions. Staying on Sonnet, the library saves $0.02 per session on two environments (break-even after about 40
sessions) and nothing on ticket-triage.

## What it means

1. **Tools are a way to move capability from an expensive model to a cheap one.** The hard part of these
   environments is figuring them out: the auth header, the number formats, the reversal rule, import aliasing.
   Opus does that once and writes it down as tested code. Haiku then needs only to read a card and call
   `trod_eval`. On `code-qa`, Haiku from scratch spent 1.9M tokens per run and still got answers wrong. With the
   library it spent 0.4M and got everything right.
2. **The library made the answers *more* correct, not just cheaper.** Every Sonnet-from-scratch run on `code-qa`
   got at least one call-graph answer wrong; with the forged analyzer, every run of either model was perfect. A
   tool that was tested once does not make the ad-hoc mistakes a fresh script makes.
3. **Where a capable model can rewrite the solution in one go, a library doesn't help that model.** On
   `ticket-triage`, Sonnet writes a 30-line signed client faster than it learns six tools (1.32× tokens). The
   library still helps Haiku there (0.69× tokens).
4. **The session floor is gone.** With cards and code mode, fresh sessions go straight to the tools: 2–4 turns on
   the inventory API instead of about 7.

## Bugs found along the way (all fixed in trod 0.3.1 and the harness)

- **Startup verification starved Claude Code.** Re-running library examples at startup (network calls against a
  rate-limited API) delayed the server long enough that Claude Code started sessions without it. Library tools are
  now trusted from promotion.
- **Instructions are truncated at about 4k characters.** Six verbose cards were cut off, and the agent looked them
  up one by one through `trod_status`. Cards now share a budget, with short generic instructions when a library
  exists. `trod_status {"name": "library"}` returns the full documentation in one call. Round 4's forged runs use
  this fix; the earlier runs are kept in `results/runs/r4-v030` for the record.
- **Fire-and-forget writes in `trod_eval` were lost.** The runner exited right after returning, so an un-awaited
  `fsp.writeFile` produced an empty file (one Sonnet ticket-triage session). Runners now let pending work finish.
  That run was repeated on the fixed build; the failed one is kept in `results/runs/r4-aside`.
- **An ambiguous question.** Inventory question 3 did not say whether archived items count. Every Haiku run
  excluded the one archived SKU, and every Sonnet run included it. Both readings are now accepted, and future
  prompts say "include archived items".
- **A harness mistake of mine.** `rescore.ts` re-checked session-mode runs whose earlier outputs had been wiped by
  the next fresh checkout, and overwrote their per-step results. They were restored from the runner logs
  (`experiments/runner/restore-from-log.ts`, with a provenance note in each result), and `rescore` now keeps a
  step's original result when its outputs are gone.

## Caveats

- Three synthetic environments, 3 seeds each, four sessions per run. One forge per environment, so the forge's
  quality is a single draw. A worse forge would shift these numbers.
- Cost is Claude Code's list-price accounting. Within a model it is noisy, because parallel runs share the prompt
  cache, but the cross-model gap (7–20×) is far larger than that noise.
- The forge brief describes the environment and the kinds of questions to expect; it does not include the
  questions themselves.
