# Distribution

How trod reaches users, what is ready, and what needs the repository owner.

## Channels

| Channel | How users install | Status |
|---|---|---|
| Claude Code plugin (local) | `claude plugin marketplace add swissspidy/trod`, `claude plugin install trod@trod` | works |
| Cloud environment (every session, any repo) | setup script with the two commands above, plus `TROD_ALLOW_EXEC=1` as an environment variable of the cloud environment (not in the script) | works (tested in a fresh cloud session) |
| Per repository (local, cloud, mobile app) | `npx trod init --allow-exec`, commit the files | ready; needs the npm release |
| Per repository, no network at start | `npx trod init --vendor --allow-exec` (server and CLI copied into `.trod/pkg/`) | ready; needs the npm release |
| Any MCP client (Antigravity, Cursor, VS Code, ...) | `npx -y trod mcp`, `TROD_ALLOW_EXEC=1` | ready; needs the npm release; untested in those clients |
| MCP Registry | listed as `io.github.swissspidy/trod` (`plugin/server.json`) | published by the Release workflow |

## Owner steps for the first release

1. Create an npm granular access token with publish rights for the package (or an automation token) on the `swissspidy` account and add it as the `NPM_TOKEN` secret of a GitHub
   environment named `npm` (Settings, Environments). The name `trod` was free on npm when this was written.
2. Push the tag: `git tag v0.5.0 && git push origin v0.5.0`. The Release workflow checks, tests, publishes to npm
   with provenance and lists the server in the MCP Registry (GitHub OIDC; no extra secret).
3. Optional: set the repository's description and topics (`mcp`, `claude-code`, `ai-agents`) so it is found.

## Why it is worth distributing

The evidence across nine rounds (see the README) supports one product claim and rules out another:

- **Supported:** knowledge forged once and reused pays off where an environment holds knowledge a model cannot
  guess and that recurs across tasks. Forged notes took Haiku from 52% to 89% (ScienceWorld) and from 68% to 90%
  (MiniWoB++), past Sonnet at a tenth of its cost; practising against a success signal, Haiku forged useful notes for
  itself for under three cents per task type (the experiment harness behind those numbers is what `trod forge
  --practice` now offers).
- **Ruled out:** building tools mid-task is not cheaper than writing a script, and forging changes nothing where
  the model already knows the domain (SWE-bench on Django) or where every task needs its own fact (BIRD).

So the pitch is `trod forge` (tools and verified notes, optionally learned by practice) for internal APIs, quirky
tooling and repeated workflows, with `trod verify` in CI to catch drift; the live tool server is the delivery
mechanism, not the headline.
