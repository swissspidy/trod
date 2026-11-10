---
"trod": patch
---

Fixes from a full read-through of the code:

- Tool output with non-ASCII text (accents, CJK, emoji) could come back with corrupted characters when it was larger than one pipe chunk. Output is now decoded as a stream.
- A tool called right after it was changed now runs the new version, also while trod is still re-running its examples.
- `trod forge`, `trod learn` and `trod tune` say so when the `claude` CLI cannot be started, instead of crashing, and no longer promote session tools in that case. A session killed mid-line no longer breaks reading its result.
- `trod forge` and `trod learn` remove their temporary folders when they finish.
- `trod tune` no longer leaves its MCP config inside the task workspace, where a check such as `git status` would see it.
- Promoting a single-file tool again keeps one "promoted" stamp, and replaces a folder version of the same tool in the library.
- The PostToolUse hook ignores files next to the tools that are not tools (a README in `.trod/tools/`).
- The server watches only `.trod/tools` and `.trod/library` for changes, and reads the logs at startup only when there is a library to describe.
- A stale "shadows the library tool" warning is dropped once the library tool is gone.
