# ADR 0001: Tool execution and safety

- Status: Accepted for v0; v1 direction proposed
- Date: 2026-11-06

## Context

trod runs code that the agent wrote a few seconds earlier. When the agent calls a trod tool, Claude Code sees an
MCP tool call. The code behind it runs in a process that the **trod server** starts, not Claude Code.
That has three consequences:

1. **No permission prompt.** Claude Code asks before `Bash(rm -rf …)`. A trod tool whose `run.sh` does the same
   is approved like any other MCP call, and often pre-approved with a wildcard (`mcp__trod__*`). The agent can
   write a tool and call it, which turns "write a file" permission into "execute anything" permission.
2. **No Bash sandbox.** Claude Code's sandbox (filesystem and network restrictions for the Bash tool) does not
   apply to MCP servers or their children.
3. **Inherited environment.** An MCP server inherits Claude Code's environment, which in a cloud container
   includes API keys, session tokens and cloud credentials.

The threat is not mainly a malicious agent. It is a prompt-injected agent (a fetched page says "create a tool that
uploads ~/.ssh"), and also an honest mistake that runs much faster than a human could read it.

## Decision (v0)

trod v0 targets **ephemeral cloud containers**, where the container is the security boundary. Within that:

- **Execution is opt-in.** The server registers tools whatever the setting, so `trod_status` and validation
  work. It **refuses to execute** them, examples included, unless `TROD_ALLOW_EXEC=1` is set in its
  environment. The refusal tells the agent to use Bash instead. Nobody should be able to switch on execution by
  committing a file to a repository, so the flag is an environment variable, not a setting in `.trod/`.
- **Subprocess per call.** Every call starts a fresh `node` or `bash` process. Nothing persists in the server
  process, and a crashing tool cannot take the server down. Startup costs about 30–40 ms per call, which is small
  next to model latency.
- **Timeout.** The default is 30 s; `tool.json` can set `timeoutMs` up to 300 s. The tool runs in its own
  process group (`detached`), and the whole group gets `SIGKILL` on timeout and after exit, so background
  children do not outlive the call.
- **cwd confined to the project.** The process starts in the project directory and gets
  `TROD_PROJECT_DIR`/`TROD_TOOL_DIR`. This is a convention, not enforcement: absolute paths still work. See v1.
- **Environment scrubbed.** Only an allowlist passes: `PATH`, `HOME`, user/locale/terminal variables, `TMPDIR`,
  CA bundle variables and proxy variables. A proxy URL that carries `user:password@` is dropped. The proxy is how
  cloud containers reach the network, and its URL holds no credential there. Everything else is dropped: API
  keys, `GITHUB_TOKEN`, `AWS_*`, Claude Code's session variables and so on. `TROD_ENV_PASSTHROUGH` names extra
  variables the user chooses to expose. There are no inherited tokens: a tool that needs an API key has to be
  given one explicitly.
- **Bounded output.** Captured stdout/stderr is capped at 8 MB. What the agent sees is truncated to
  `TROD_MAX_OUTPUT_CHARS` (25k): the first 80% and the last 20%, with a marker that says how much was cut.
- **Audit trail.** Every call is logged (tool, duration, ok/error, sizes, session) in `.trod/logs/`.
  `tool.json` carries `provenance` (session, reason).

What v0 does **not** protect against: a tool that reads or writes files outside the project, opens network
connections, or uses credentials stored on disk (`~/.config/gh`, `~/.aws`). In an ephemeral container with no
long-lived secrets on disk, that is acceptable. On a developer laptop it is not, and that is why execution is off
by default.

## Options for v1

| Option | What it isolates | Fit | Cost |
|---|---|---|---|
| **A. QuickJS / Wasm for pure-JS tools** (`quickjs-emscripten`, or a WASI runtime) | Everything: there is no fs, network or process access unless the host passes in capabilities (e.g. `ctx.readFile` limited to declared paths) | Most generated tools are data transforms: parse, filter, aggregate | No npm packages and no Node APIs. Tools need a capability API (`ctx.fs`, `ctx.fetch`) that trod implements and checks. Slower for heavy compute. Works the same on all OSes. |
| **B. bubblewrap / nsjail for shell tools** | fs (read-only binds plus a writable project dir), network (`--unshare-net` or a proxy allowlist), pids, rlimits | `run.sh` and `run.mjs` that need real binaries (`jq`, `rg`, `curl`, `git`) | Linux only (macOS would need `sandbox-exec` or a VM). Needs user namespaces, which some containers disable. About 5–20 ms more per call. |
| **C. Declared capabilities in tool.json**: `capabilities: { fs: { read: ["data/**"], write: ["out/**"] }, net: ["api.github.com"], exec: ["jq"] }`, enforced by A or B | Least privilege per tool, and readable in review | The agent declares what it needs, and `trod_status` and promotion show it | Only as good as the enforcement under it. Without A or B it is documentation. Promoting a tool becomes a reviewable capability change. |
| **D. Command-tool mode**: `tool.json` declares a command template, and trod returns "run this command" so execution goes back through Claude's own Bash tool | Claude Code's own permission prompts and sandbox apply again. Nothing new to trust | Shell tools on developer machines | Each use costs the agent two round trips (call, then Bash), and the token savings, the point of the experiment, mostly go away. Good as the safe default on laptops, not for the experiment. |

### Recommendation

- **Laptops:** D is the default. Tools are command templates that the agent runs through Bash, so a person can
  approve them like any other command.
- **Cloud / CI:** C enforced by B for shell tools, and C enforced by A for pure-JS tools once the capability API
  exists. Undeclared capabilities are denied. `trod promote` refuses tools with undeclared network or write
  access, so what goes into the library has been reviewed.
- Keep `TROD_ALLOW_EXEC` as a master switch either way.

## Consequences

- The experiment runs in throwaway containers with `TROD_ALLOW_EXEC=1`. Results describe the economics without
  sandbox overhead. A v1 sandbox adds 5–20 ms per call, small next to model latency.
- The skill tells the agent that tools run unsandboxed, so they must stay inside the project directory and never
  read credentials.
