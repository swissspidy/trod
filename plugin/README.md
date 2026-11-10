# trod

**Self-morphing tools for Claude Code.** trod is an MCP server that turns files into live tools: the agent writes
`.trod/tools/<name>.mjs` with its normal Write tool, and trod validates and registers it in the same session.
`trod forge` builds a verified tool library and rule-shaped notes once, with a strong model, for every later session
to reuse; with `--practice` it learns from real attempts against a success check.

Experiments, results and the full documentation: https://github.com/swissspidy/trod

## Install

```sh
# Claude Code plugin (local sessions)
claude plugin marketplace add swissspidy/trod
claude plugin install trod@trod

# Any repository, for every session in it: local, cloud and sessions started from the Claude mobile app
npx trod init --allow-exec      # or --vendor to commit the server instead of fetching it with npx

# Any other MCP client: run the server on stdio
npx -y trod mcp
```

Tool code runs in a subprocess, outside Claude Code's permission prompts, so trod only runs tools when
`TROD_ALLOW_EXEC=1` is set (`--allow-exec` writes it into `.mcp.json`). That is meant for ephemeral cloud containers.

## CLI

`trod forge --brief @env.md [--practice '<check>' [--reset '<cmd>']]`, `trod verify`, `trod notes [--link]`,
`trod learn [--auto <n>]`, `trod tune`, `trod report`, `trod promote <name>`, `trod stats`, `trod check`, `trod list`.
Run `npx trod --help` for details.
