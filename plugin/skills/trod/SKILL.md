---
name: trod
description: Build your own MCP tools mid-task with trod. Use when you are about to write a helper script you will run more than once, when the same lookup or check repeats (3+ times), when a Bash pipeline keeps failing and needs to be made robust, or when the user mentions trod, .trod/tools, trod_status or self-made tools.
---

# trod: your helper scripts as real tools

trod turns files in `.trod/tools/` into live tools. You write one file with the Write tool; trod validates it and
the Write result tells you right away whether it is live. **Call it with `trod_run {"tool": "<name>", "input": {…}}`**,
the permanent trod tool that runs any trod tool by name, with nothing to load first. (Each tool is also registered
as `mcp__trod__<name>`; use that form if it is already in your tool list.)

## When

**Whenever you are about to write a helper script that you will run more than once, write it as a trod tool
instead.** It is the same amount of work: one file. What you get on top of a script:

- **Cheaper calls.** A call is a few tokens of JSON. No `cd …; node script.mjs --flag "quoted 'args'"` each time, and
  no shell quoting bugs.
- **Compact answers by design.** You choose the return value, so return exactly what you need: counts, the matching
  rows, the verdict. Do not dump raw responses into your context. Every byte a tool returns is re-read on every
  later turn.
- **Reuse.** The tool stays available for the rest of the session, and `trod promote` moves it into the committed
  library for future sessions.

- **Batch.** Every turn re-reads the whole context, so turns are the expensive unit. Let one call take a list
  (`queries: [...]`, `ids: [...]`) and return all the answers. When you do make several independent calls, send
  them in parallel in one message.

- **Capabilities, not answers.** Tomorrow's question will be different. A tool that returns clean records
  (`inventory_items({warehouse, updated_since})`: authenticated, all pages fetched, rate limits respected, `"€1.234,50"`
  parsed to `1234.5`) answers it; a tool that computes today's total (`stock_value_per_warehouse`) does not. Put the
  hard-won knowledge (the auth header that took three tries, the date format the API wants, the reversal rule) in
  the capability tool and say so in its `whenToUse`, so a later session can rely on it without rediscovering it.
  Compute the answer itself with a quick script or a second small tool that calls the same helper code.

The best tools wrap a **fiddly, multi-step operation you will do many times with judgment in between**. Examples:
an authenticated API request (signing, pagination, retries) that returns only the fields you need; a browser
login-and-read; a parser for a log or code format; a lookup across several files. One-off steps stay in Bash.

## The format: one file

`.trod/tools/<name>.mjs` (Node 22 ESM, built-ins only; `require('playwright')` and other globally installed
packages work through `createRequire`):

```js
export const meta = {
  description: 'Fetches a ticket with its customer and the last 20 events, and returns a compact summary.',
  whenToUse: 'For every ticket you triage; replaces three signed API requests.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Ticket id, e.g. T-104' } },
    required: ['id'],
    additionalProperties: false,
  },
  // Optional: smoke tests run on every change. A failing example keeps the tool unregistered.
  examples: [{ input: { id: 'T-101' }, expect: { contains: 'T-101' } }],
};

export default async function run(input, ctx) {
  // ctx: { projectDir, toolDir, toolName, sessionId, log(...) }  (log goes to stderr, not to the result)
  return { id: input.id /* , … only what you need */ }; // objects come back as JSON, strings as text
}
```

- The name comes from the file name: lowercase letters, digits and underscores, 2–48 chars (`trod_status`,
  `trod_run` and `trod_eval` are reserved).
- `description` says what the tool returns; `whenToUse` says when to pick it. Both show up in your tool list.
- Inputs are validated against `inputSchema` before the tool runs.
- Throw an `Error` with a clear message on bad input or a failed request; trod returns it as a tool error.
- Tools time out after 120 s; set `meta.timeoutMs` (up to 600000) for slow ones, and make API tools back off on
  429 instead of retrying immediately.
- The working directory is the project root. The environment is scrubbed: API keys and tokens from your
  environment are not visible, so read credentials the task gives you from their files.

The older two-file format still works: `.trod/tools/<name>/tool.json` plus `run.mjs` or `run.sh` (input JSON on
stdin, result on stdout).

## The workflow

1. **Write the file.** The Write result includes a `trod:` line: either "valid and live", or the exact errors
   (syntax, schema, a failing example). Fix them and write again.
2. **Call it** in the next step: `trod_run {"tool": "<name>", "input": {…}}`. In later turns and resumed sessions
   too: there is nothing to load. `trod_status` shows the whole registry, invalid tools and usage.
3. **Change it in place** when the task changes: add a parameter rather than creating `foo_v2`. Code-only changes
   take effect on the next call.

## Code mode: `trod_eval`

`trod_eval {"code": "…"}` runs the body of an async function in which every trod tool is a function:

```js
const items = await tools.inventory_items({ warehouse: 'BER' });
const low = items.filter((i) => i.qty < i.reorderPoint).map((i) => i.sku);
await fsp.writeFile(path.join(projectDir, 'reorder.json'), JSON.stringify({ skus: low }));
return { count: low.length };
```

Fetch, combine, compute and write in **one** call. Only the returned value enters the conversation, so large
intermediate data stays out of your context. `fs`, `fsp`, `path` and `projectDir` are available.

## Library tools

Tools in `.trod/library/` were built in earlier sessions, and their examples passed when they were promoted.
**Call them directly (`trod_run`); do not read their source first.** `trod_status` lists them with their descriptions. Only read the source when a call fails
or returns something that looks wrong.

## Project notes

`.trod/notes.md` holds verified notes about the project's environment (conventions, value meanings, traps), usually
written by `trod forge` and loaded through `CLAUDE.md`. Follow them. If you find that a note is wrong, say so instead
of silently working around it; `npx -y trod notes` runs their checks.

## Rules

- Tools run **outside Claude Code's sandbox and permission prompts**, in a subprocess with a timeout. Keep them inside
  the project directory and the hosts the task needs. Never read credentials the task did not give you.
- Execution only works when the server has `TROD_ALLOW_EXEC=1`. If trod says execution is disabled, use Bash.
- Promote a tool to the library (`npx -y trod promote <name>`) only when the user asks.
