---
name: trod
description: Build your own MCP tools mid-task with trod. Use when you are about to write a helper script you will run more than once, when the same lookup or check repeats (3+ times), when a terminal pipeline keeps failing and needs to be made robust, or when the user mentions trod, .trod/tools, trod_status or self-made tools.
---

# trod: your helper scripts as real tools

trod turns files in `.trod/tools/` into live tools. You write one file; trod validates it and registers it in the
same conversation. **Call it with the trod tool `trod_run` and `{"tool": "<name>", "input": {…}}`**: it runs any
trod tool by name, with nothing to load first. In your tool list the trod tools carry an MCP prefix (for example
`mcp_trod_server_trod_run`); if they are not listed, call them through `call_mcp_tool`.

## When

**Whenever you are about to write a helper script that you will run more than once, write it as a trod tool
instead.** It is the same amount of work: one file. What you get on top of a script:

- **Cheaper calls.** A call is a few tokens of JSON: no long command lines and no shell quoting bugs.
- **Compact answers by design.** You choose the return value, so return exactly what you need: counts, the matching
  rows, the verdict. Every byte a tool returns stays in your context.
- **Batch.** Let one call take a list (`queries: [...]`, `ids: [...]`) and return all the answers.
- **Capabilities, not answers.** A tool that returns clean records (authenticated, all pages fetched, formats
  parsed) answers tomorrow's different question; a tool that computes today's total does not. Put the hard-won
  knowledge (the auth header, the date format, the reversal rule) in the tool and say so in its `whenToUse`.

The best tools wrap a fiddly, multi-step operation you will do many times: an authenticated API request, a
browser login-and-read, a parser for a log or code format, a lookup across several files. One-off steps stay in
the terminal.

## The format: one file

`.trod/tools/<name>.mjs` (Node 22 ESM, built-ins only):

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

- The name comes from the file name: lowercase letters, digits and underscores, 2–48 chars.
- `description` says what the tool returns; `whenToUse` says when to pick it.
- Inputs are validated against `inputSchema`. Throw an `Error` with a clear message on bad input or a failed
  request; trod returns it as a tool error.
- Tools time out after 120 s; set `meta.timeoutMs` (up to 600000) for slow ones.
- The working directory is the project root. API keys and tokens from the environment are not visible, so read
  credentials the task gives you from their files.

## The workflow

1. **Write the file**, then call `trod_status` with `{"name": "<name>"}`: it says whether the tool is live or
   shows the exact errors (syntax, schema, a failing example). Fix them and write again.
2. **Call it**: `trod_run` with `{"tool": "<name>", "input": {…}}`, in this and later conversations.
3. **Change it in place** when the task changes: add a parameter rather than creating `foo_v2`.

## Code mode: `trod_eval`

`trod_eval` with `{"code": "…"}` runs the body of an async function in which every trod tool is a function:

```js
const items = await tools.inventory_items({ warehouse: 'BER' });
const low = items.filter((i) => i.qty < i.reorderPoint).map((i) => i.sku);
return { count: low.length, low };
```

Fetch, combine and compute in **one** call. Only the returned value enters the conversation. `fs`, `fsp`, `path`
and `projectDir` are available.

## Library tools and project notes

Tools in `.trod/library/` were built and promoted earlier, and their examples pass. Call them directly; read
their source only when a call fails. `.trod/notes.md` holds rules about this project's environment, written by
`trod forge` or `trod learn` and loaded through `.agents/rules/trod-notes.md`. Follow them; if a note is wrong,
say so instead of silently working around it.

## Rules

- Tool code runs outside the terminal sandbox, in a subprocess with a timeout. Antigravity asks before each MCP
  tool call unless you allowed it. Keep tools inside the project directory and the hosts the task needs.
- Execution only works when the server has `TROD_ALLOW_EXEC=1`. If trod says execution is disabled, use the
  terminal instead.
- If `trod_status` reports the home directory as the project, Antigravity did not tell trod which workspace you
  are in: ask the user to set `TROD_PROJECT_DIR` for the trod server.
