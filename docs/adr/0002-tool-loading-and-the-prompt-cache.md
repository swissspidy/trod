# ADR 0002: Tool loading, trod_run and the prompt cache

- Status: Accepted (trod 0.2)
- Date: 2026-11-07

## Context

Round 1 of the experiment ([results/README.md](../../results/README.md)) found that building a trod tool took
about 3× the turns of writing a script. The extra steps:
- a second Write: `tool.json` plus `run.mjs`
- a `trod_status` call to see whether the tool registered
- a ToolSearch call to load the new tool, which is deferred behind Claude Code's tool search
- the same ToolSearch again after every resumed session

A probe with tool search turned off removed the ToolSearch calls but made every arm about 2.7× more expensive:

- **The base context grows by about 13k tokens.** With tool search off, every tool schema (built-in ones included)
  is sent on every request.
- **Each new tool rewrites the prompt cache.** Tool definitions come first in the cached prefix, so a new tool
  invalidates the cache for the whole conversation. Cache writes cost about 20× cache reads. The nudged arm's cache
  writes doubled.

So tool search is not the problem; it is what keeps the cache warm while the tool list grows. The deferred load
step was the problem.

## Decision

1. **A second permanent tool, `trod_run {tool, input}`**, runs any registered trod tool by name. It is defined at
   startup and never changes, so the agent can call a tool written a moment ago in the very next turn: no
   ToolSearch, no change to the tool list, and nothing to reload after a resume. Each dynamic tool is still
   registered as its own MCP tool (deferred, so the cache stays valid) for discoverability.
2. **`trod_status` and `trod_run` set `_meta["anthropic/alwaysLoad"] = true`**, so they are never deferred. They
   are in the prompt from the first request and never change, so they cost nothing in cache terms.
3. **Single-file tools.** `.trod/tools/<name>.mjs` exports `meta` (description, whenToUse, inputSchema, examples)
   and a default function. One Write creates a tool. Reading `meta` means importing the file, so it needs
   `TROD_ALLOW_EXEC=1`. The folder format (`tool.json` + `run.mjs`/`run.sh`) stays.
4. **A PostToolUse hook (`trod hook`)** validates a tool when it is written, runs its examples, and puts the
   result into the Write tool's result ("valid and live; call it with trod_run" or the exact errors). No
   `trod_status` turn is needed.
5. **The server instructions carry the format.** They are part of the system prompt, so the agent can build a
   tool without loading the skill. The skill keeps the longer guidance.
6. **Library trust.** `trod promote` runs the tool's examples and refuses on failure. The description of a
   library tool says it came from an earlier session and that its examples passed, so it can be called without
   reading its source. In round 1, reading the source was most of the cost of reusing a library tool.

## Consequences

- The tool list stays fixed for the whole session from the model's point of view. That keeps the spec's
  intent ("keep the core list fixed so the prompt cache isn't busted"), now also for tools added mid-session.
- In the probe, creating a tool costs about one Write, and the reuse steps match a re-run script turn for turn.
- Experiments run with Claude Code's default tool search (on). The runner can still turn it off
  (`--tool-search false`) to reproduce the probe.
