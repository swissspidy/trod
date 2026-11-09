# Distribution

How trod reaches users, what is ready, and what needs the repository owner.

## Channels

| Channel | How users install | Status |
|---|---|---|
| Claude Code plugin (local) | `claude plugin marketplace add swissspidy/trod`, `claude plugin install trod@trod` | works |
| Cloud environment (every session, any repo) | setup script with the two commands above, plus `TROD_ALLOW_EXEC=1` as an environment variable of the cloud environment (not in the script) | works (tested in a fresh cloud session) |
| Per repository (local, cloud, mobile app) | `npx trod init --allow-exec`, commit the files | ready; needs the npm release |
| Per repository, no network at start | `npx trod init --vendor --allow-exec` (server and CLI copied into `.trod/pkg/`; `git add -f .trod/pkg` if `bin/` is gitignored) | ready; needs the npm release |
| Antigravity plugin (every workspace) | `agy plugin install https://github.com/swissspidy/trod` (repository root: `.antigravity-plugin/plugin.json`, `mcp_config.json`, `skills/`) | ready; runs the bundled server, no npm release needed; tested with an Antigravity-like MCP client, not yet in Antigravity |
| Antigravity, per repository | `npx trod init --antigravity --allow-exec` (`.agents/mcp_config.json`, skill, notes rule) | ready; needs the npm release |
| Antigravity Marketplace | submit through the partner intake form (`agy plugin validate --strict` first) | owner step |
| Any other MCP client (Cursor, VS Code, ...) | `npx -y trod mcp`, `TROD_ALLOW_EXEC=1` (project from cwd, `TROD_PROJECT_DIR` or MCP roots) | ready; needs the npm release; untested in those clients |
| MCP Registry | listed as `io.github.swissspidy/trod` (`plugin/server.json`) | published by the MCP Registry workflow once the version is on npm |

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) (details in
[.changeset/README.md](../.changeset/README.md)): pull requests that change what users get add a changeset
(`pnpm changeset`); merging the "Version packages" pull request the Release workflow keeps open stages the new
version on npm with provenance, tags it and creates the GitHub release. Nothing is tagged by hand. The first release
is 0.1.0.

## Owner steps for the first release

1. On npmjs.com, add `swissspidy/trod` with the workflow `release.yml` as the trusted publisher of the `trod`
   package, allowing staged publishes only (no token is stored). The name `trod` was free on npm when this was
   written. Run the first release within 48 hours, or the configuration expires.
2. Settings → Actions → General: allow GitHub Actions to create and approve pull requests.
3. Merge the "Version packages" pull request, then approve the staged version on npmjs.com (Staged Packages) or
   with `npm stage approve <stage-id>` from the job summary. The MCP Registry workflow lists it within six hours,
   or run it by hand.
4. Optional: set the repository's description and topics (`mcp`, `claude-code`, `ai-agents`) so it is found.

## Why it is worth distributing

The evidence across twelve rounds (see the README) supports one product claim and rules out another:

- **Supported:** knowledge forged once and reused pays off where an environment holds knowledge a model cannot
  guess and that recurs across tasks. Forged notes took Haiku from 52% to 89% (ScienceWorld) and from 68% to 90%
  (MiniWoB++), past Sonnet at a tenth of its cost; practising against a success signal, Haiku forged useful notes for
  itself for under three cents per task type (the experiment harness behind those numbers is what `trod forge
  --practice` now offers). Without any setup, `trod learn` distilled notes from 120 ordinary past sessions that
  took Haiku to 81–83%, and to 88% after one more round of sessions (round 11).
- **Ruled out:** building tools mid-task is not cheaper than writing a script, and forging changes nothing where
  the model already knows the domain (SWE-bench on Django) or where every task needs its own fact (BIRD).

So the pitch is `trod learn` for projects that already use Claude Code and `trod forge` (tools and verified notes,
optionally learned by practice) for internal APIs, quirky tooling and repeated workflows, with `trod verify` in CI to catch drift; the live tool server is the delivery
mechanism, not the headline.
