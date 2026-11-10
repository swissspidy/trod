# Milestone 0: spike findings

Date: 2026-11-06. Claude Code 2.1.318, `@modelcontextprotocol/sdk` 1.32.2, Node 22.23. Models: Sonnet 5.5
for the runs below (Opus 5.5 for the auth smoke test).

The throwaway server was `spike/server.mjs`, and `spike/headless.sh` ran the headless check (both removed since; see them at [commit 3aa3ed2](https://github.com/swissspidy/trod/tree/3aa3ed2c121c75640f3f24f3b3edc1265aafba9e/spike)). The server is about 40 lines: it watches a directory
of `*.json` files, each one a tool definition with a canned `reply`. It registers them with the low-level
`Server` API (raw JSON Schema, `capabilities.tools.listChanged: true`) and sends
`notifications/tools/list_changed` 100 ms after the directory changes. It logs every `tools/list` and call.

Every test used the same task. The agent writes `.spike-tools/magic.json` (tool `magic_word`, reply
`MAGIC-7731`) with its Write tool, then calls the new tool and reports the output word for word. It is told not
to read the file. The other way to pass would be to guess the reply, and the server log shows that it did not.

## Results

| # | Assumption | Setup | Result |
|---|------------|-------|--------|
| 1 | `list_changed` is picked up in **headless** `claude -p` | `--mcp-config` (stdio), `--allowedTools Write,mcp__spike__*,ToolSearch`, `ENABLE_TOOL_SEARCH=false` | ✅ The tool appeared in the same `-p` run and was called. The server log shows `list_changed`, a fresh `tools/list` 4 ms later and then the call. |
| 2 | Same with **tool search on** | as 1, `ENABLE_TOOL_SEARCH=true` | ✅ `ToolSearch("magic_word")` returned `mcp__spike__magic_word` and the agent called it in the same turn. **Caveat:** see below. |
| 3 | Works in an **interactive** session | `claude` in a TTY (tmux), same flags, one user message | ✅ The `Write` was followed by `Called spike` and the verbatim output in the same turn. |
| 4 | Works in a **Claude Code cloud session** with the server started from the repo | a fresh cloud session on the spike branch | ⚠️ / ✅ See below: the plugin route failed, the project `.mcp.json` route works. |

### Tool search caveat (race)

With tool search on, the agent sent `ToolSearch("select:mcp__spike__magic_word")` **in parallel with** the
`Write`, in the same assistant message. That search ran before the file existed and returned "No matching
deferred tools found". A second search by keyword found the tool. Write and search are independent tool calls,
so the model batches them. Consequences:

- The skill tells the agent to write the tool, **then** call `trod_status` in a separate step, and only then
  use the tool. `trod_status` is the stable tool that is always loaded, and it confirms that the tool registered
  or explains why it did not.
- The server rescans on demand when it gets a call for a name it does not know, so a call that arrives before
  the debounced watcher has fired still works.

### Cloud sessions: plugin vs. project `.mcp.json`

- **Plugin declared in project settings (failed).** `.claude/settings.json` had
  `extraKnownMarketplaces` (a `directory` marketplace at the repo root) and `enabledPlugins: { "trod@trod": true }`.
  The cloud session did not install it: `claude plugin list` said "No plugins installed" and no server started.
  The same thing happens in headless `claude -p` with a fresh config: a marketplace declared by the project only
  comes into play after an interactive trust prompt or an explicit `claude plugin marketplace add` + `install`.
  After the install, the plugin route worked headless: the tool was `mcp__plugin_trod_trod__magic_word`, and the
  server got `cwd` and `CLAUDE_PROJECT_DIR` set to the project.
- **Project `.mcp.json` (works).** A root `.mcp.json` points at the plugin's bundled server
  (`node plugin/server/trod-server.mjs` from Milestone 1 on), and `.claude/settings.json` has `"enableAllProjectMcpServers": true`.
  The cloud session started the server (`cwd` = repo root, `CLAUDE_PROJECT_DIR` set), got `list_changed`, found
  `mcp__trodroot__magic_word` through ToolSearch and called it. `claude mcp list` still reported the server as
  "pending approval", but its tools were loaded and callable.

**Decision.** Both routes stay. The plugin (`plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json`, the skill)
is how people install trod locally. A repository that wants trod in cloud sessions commits a root `.mcp.json`
that runs the bundled server, plus `enableAllProjectMcpServers` (or `enabledMcpjsonServers: ["trod"]`). The
server is committed as **one bundled file** with no `node_modules`, because a cloud container clones the repo
and starts the server without installing anything. The skill must also reach cloud sessions without the plugin,
so it is mirrored at `.claude/skills/trod/SKILL.md`.

## Other observations

- **Session id.** Claude Code sets `CLAUDE_CODE_SESSION_ID` in the environment of the MCP servers it starts (checked with the parent variable unset), and the server uses
  it for logs and provenance. The experiment runner sets `TROD_SESSION_ID` explicitly.
- **Isolation for experiments.** A headless run picks up the user's synced plugins (here the
  `engineering` plugin) unless it runs with a separate `CLAUDE_CONFIG_DIR` and `--strict-mcp-config`. The
  experiment runner does both, so the baseline and genesis arms differ only in the trod server.
- **Auth.** Headless runs use `ANTHROPIC_API_KEY` (from `TEST_API_KEY` here) and unset `ANTHROPIC_BASE_URL`.
- **Permissions.** `--dangerously-skip-permissions` was refused by this environment's auto-mode classifier. An
  explicit `--allowedTools` list works and is what the experiment uses.
- **Latency.** From the `Write` to the `list_changed` → `tools/list` round trip took 3–5 s of wall time, almost
  all of it model time. The server side (watch, debounce, rescan, notify) took about 100 ms.

## Verdict

All assumptions hold. One works with a workaround: in cloud sessions the server starts from the project
`.mcp.json`, not from the plugin. Milestone 1 continues as specified, with the bundled-server and skill-mirror
changes above.
