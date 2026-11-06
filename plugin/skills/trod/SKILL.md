---
name: trod
description: Build your own MCP tools mid-task with trod. Use when an operation will repeat (3+ times in this task), when a Bash pipeline keeps failing and needs to be made robust, or when the user mentions trod, .trod/tools, trod_status or self-made tools.
---

# trod: build tools when they pay off

trod turns folders in `.trod/tools/<name>/` into live MCP tools. You write the files with the Write tool. The trod
server validates them, registers them and tells Claude Code that the tool list changed, so you can call the tool in
this session as `mcp__trod__<name>` (or `mcp__plugin_trod_trod__<name>` when trod comes from the plugin).

## When to build a tool (the economics)

A tool costs about one or two turns to write, plus its definition in the tool list on every later turn. It pays
off when it replaces work you would otherwise repeat:

- **Build** when the same operation will run **3 or more times in this task** (check 30 pages, transform 12
  files, query an API per item, re-run the same verification after each edit).
- **Build** when a Bash pipeline has **failed twice**. A tool with real parsing and error handling is more robust
  than a fourth one-liner.
- **Do not build** for one-off steps, for things a single Bash command already does well (`ls`, `grep`, `git
  status`), or when you are still exploring and do not know the shape of the work yet.
- **Batch inside the tool.** A tool that takes a list (`urls: [...]`) and returns a compact table beats one call
  per item. Summarize in the tool: return the counts, the failures and the few lines that matter, not raw dumps.
- **Update rather than duplicate.** Fix `fetch_status` in place instead of adding `fetch_status_v2`. Keep tools
  small and composable, each doing one thing, with precise descriptions.

## The format

```
.trod/tools/<name>/
├── tool.json
└── run.mjs   (or run.sh)
```

`tool.json`:

```json
{
  "name": "csv_column_stats",
  "description": "Reads a CSV file and returns count, min, max, mean and blank count for one numeric column.",
  "whenToUse": "When you need numeric stats for a CSV column; prefer it over ad-hoc awk/python one-liners.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "CSV path relative to the project root" },
      "column": { "type": "string" }
    },
    "required": ["path", "column"],
    "additionalProperties": false
  },
  "examples": [
    { "input": { "path": "fixtures/small.csv", "column": "price" }, "expect": { "contains": "\"count\": 3" } }
  ],
  "timeoutMs": 30000,
  "provenance": { "reason": "stats for 14 CSV exports in this task" }
}
```

- `name`: lowercase letters, digits and underscores, 2–48 chars. It **must equal the folder name**.
  `trod_status` is reserved.
- `description` says what the tool does **and what it returns**. `whenToUse` says when to pick it over Bash.
  Both are shown to you in the tool list, so make them precise.
- `inputSchema` is a JSON Schema with `"type": "object"`. Inputs are validated against it before the tool runs.
- `examples` (optional, recommended) run as a smoke test on every change. `expect` takes `contains`,
  `matches` (a regex) or `equals` (deep-equal on the returned value). A failing example keeps the tool
  unregistered, so only use inputs that exist and are stable.
- `provenance.reason`: one line on why the tool exists.

`run.mjs` (Node 22, ESM, built-ins only: there is no npm install):

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default async function run(input, ctx) {
  // ctx: { projectDir, toolDir, toolName, sessionId, log(...) }  (log goes to stderr, not to the result)
  const text = readFileSync(path.resolve(ctx.projectDir, input.path), 'utf8');
  // ... compute ...
  return { count: 3, min: 1, max: 9 }; // objects are returned as JSON; strings as text
}
```

`run.sh` gets the input as JSON on stdin and prints its result to stdout (JSON output is parsed). A non-zero
exit is an error, and stderr is shown to you. Use `jq` when it is installed, or Node, to read the input.

Throw, or exit non-zero, with a clear message on bad input. trod returns it as a tool error.

## The workflow

1. **Write `tool.json` and the run file** with the Write tool (`tool.json` first or second, it does not matter).
2. **Then, in a separate step, call `trod_status`.** Do not call it in parallel with the Write: a search or
   call batched with the Write runs before the file exists. `trod_status` lists live tools and, for invalid
   ones, the exact errors (schema, syntax, failing example). Fix them and check again.
3. **Call the tool.** With tool search on, find it with ToolSearch (`select:mcp__trod__<name>`, or search for
   its name).
4. If the output says `[trod: output truncated …]`, make the tool filter or summarize instead of returning more.

Changing only `run.mjs` takes effect on the next call. Changing the name, description or schema updates the
tool list.

## Rules

- Tools run **outside Claude Code's sandbox and permission prompts**, in a subprocess with a timeout and a
  scrubbed environment (no API keys). Keep them inside the project directory. Never read credentials, never
  delete outside the project, and never call hosts the task does not need.
- Execution only works when the server has `TROD_ALLOW_EXEC=1`. If `trod_status` says execution is disabled, use
  Bash and do not build tools.
- A tool that is useful beyond this task can be promoted to the committed library with
  `node plugin/bin/trod promote <name>` (or `trod promote <name>`). Only do that when the user asks.
