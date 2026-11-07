# ADR 0003: Forge, library cards and code mode

- Status: Accepted (trod 0.3)
- Date: 2026-11-07

## Context

Rounds 1–3 ([results-2/README.md](../../results-2/README.md)) showed that tools pay off as an asset, not when
improvised mid-task. They also showed why even a good library saved only about 26% per fresh session: every
session paid a floor of about 7 turns before trusting anything:

- read the docs
- list the files
- read the library tool's source
- cross-check the API with curl
- then call, compute and write the answer, one turn each

In addition, the server re-ran every library tool's examples at startup. Against a rate-limited API that took long
enough for Claude Code to start the session without the server.

## Decision

1. **Library cards.** At startup the server writes the committed library into its MCP instructions, which are part
   of the system prompt. For each tool, the card has:
   - its signature, description and `whenToUse`
   - whether its examples passed at promotion
   - its usage history from earlier sessions (calls, sessions, errors)

   The card text says the tools are verified and need no source reading. The instructions are fixed for the
   session, so the prompt cache is unaffected.
2. **Code mode: `trod_eval {code}`.** A third permanent, always-loaded tool runs an async function body in which
   every trod tool is a function (`await tools.inventory_items({...})`), with `fs`, `path` and `projectDir`
   available. Fetching, combining and computing happen in one call, and only the returned value enters the
   conversation. Inner calls are logged per tool.
3. **`trod forge`.** A CLI command that runs a dedicated headless tool-building session for an environment. The
   toolsmith prompt asks for:
   - capabilities, not answers
   - every quirk encoded inside the tools
   - descriptions written as the only documentation
   - examples against the real environment

   Afterwards every tool whose examples pass is promoted. Forging is where a strong model earns its price.
4. **Fast startup.** Library tools are not re-verified at startup; their examples passed at promotion. New session
   tools are still validated and smoke-tested on every change.
5. **Default timeout 120 s** (round 3), since API-crawling tools legitimately take longer than 30 s.

## Consequences

- A fresh session with a forged library goes straight to the tools, taking about 3 turns instead of about 7 (round 4
  probe). A cheaper model can run sessions that only a stronger model could have set up.
- `trod_eval` runs arbitrary code with the same trust level as any trod tool: the `TROD_ALLOW_EXEC` gate and the
  subprocess, timeout and scrubbed environment from ADR 0001 apply.
- Library examples can go stale if an environment changes. `trod forge` (or `trod promote`) re-verifies, and a
  failing call is reported like any other tool error. A scheduled re-forge is the natural next step.
