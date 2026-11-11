# trod

## 0.1.0

### Minor Changes

- [#38](https://github.com/swissspidy/trod/pull/38) [`652f336`](https://github.com/swissspidy/trod/commit/652f336652ed49d47f892642ea268516bdef1a14) Thanks [@swissspidy](https://github.com/swissspidy)! - Learning that runs by itself: `trod learn --auto <n>` makes trod's new SessionEnd hook start `trod learn` in the background after every n finished sessions (at most once per 6 hours, never while another learning run is going, and never counting sessions trod started itself). `trod learn --auto off` turns it off.

- [#31](https://github.com/swissspidy/trod/pull/31) [`0818f6a`](https://github.com/swissspidy/trod/commit/0818f6a8f930396a7d3123ffd305a37ca3880d84) Thanks [@swissspidy](https://github.com/swissspidy)! - Codex support: `trod init --codex` adds the trod server and the `mcp_tool_list_changed` feature to `.codex/config.toml`, the skills to `.agents/skills/`, and (once notes exist) a block in `AGENTS.md` with a copy of `.trod/notes.md` (Codex cannot import a file); `trod learn` also learns from Codex sessions (`~/.codex/sessions`); `plugin/.codex-plugin/plugin.json` makes the repository a Codex plugin. Without a configured project directory, trod now uses the nearest folder with `.trod/` up to the git root, so clients started in a subfolder find the project.

- [#41](https://github.com/swissspidy/trod/pull/41) [`8b1d075`](https://github.com/swissspidy/trod/commit/8b1d07522546ce422f225d58d25e16f8b5ce476e) Thanks [@swissspidy](https://github.com/swissspidy)! - Easier to start with and to find your way around:
  
  - **`trod doctor`** checks the setup (the Claude Code CLI, the server entry, the hooks, whether tools may run), shows what trod knows about the project (notes, wiki pages, library, evidence) and how many sessions it has not learned from yet, and names the next step. It changes nothing and runs no tool.
  - **`trod help`** fits on one screen, with one line per command; `trod help <command>` and `trod <command> --help` show that command's options. A mistyped command gets a "did you mean".
  - **`trod learn --dry-run`** lists the sessions a learning run would read and starts nothing.
  - `trod learn` and `trod forge` say what they are doing, end with what to do next (review the diff, commit), and no longer print "0/0 check(s) passed". `trod learn` does not build tools in a project whose sessions cannot run them.
  - `trod init` from an unreleased build says that npx cannot fetch it and points to `--vendor`.

- [#34](https://github.com/swissspidy/trod/pull/34) [`91a37a0`](https://github.com/swissspidy/trod/commit/91a37a01a8d57f9c576bb7e6ded17f175c0e832f) Thanks [@swissspidy](https://github.com/swissspidy)! - Hooks delivery (`trod notes --delivery hooks [--holdout 0.1]`): trod's SessionStart hook injects `.trod/notes.md` (except in a random holdout of sessions), its UserPromptSubmit hook adds the `.trod/wiki/` pages whose `when:` words a prompt contains, and every decision is logged, so `trod report` compares holdout sessions with the rest and `trod learn` sees what each session had.

- [#29](https://github.com/swissspidy/trod/pull/29) [`c5ca28b`](https://github.com/swissspidy/trod/commit/c5ca28b9acb2f1a82e30cf883186c406403c33b0) Thanks [@swissspidy](https://github.com/swissspidy)! - First release on npm: the trod MCP server (files in `.trod/tools/` become live tools mid-session), `trod init` (Claude Code and `--antigravity`), `trod forge` (tools and verified notes, optionally learned by `--practice`), `trod learn` (notes from past session transcripts, incremental, with an evidence ledger, for scheduled runs), `trod verify` and `trod mcp`. See "Before 0.1.0" below for the milestones that led here.

- [#31](https://github.com/swissspidy/trod/pull/31) [`0818f6a`](https://github.com/swissspidy/trod/commit/0818f6a8f930396a7d3123ffd305a37ca3880d84) Thanks [@swissspidy](https://github.com/swissspidy)! - `trod report`: compares this project's Claude Code and Codex sessions from before the notes were linked with those after (median turns, tool calls, failed tool calls, follow-up prompts, tokens, duration) and prints the evidence ledger's summary.

- [#37](https://github.com/swissspidy/trod/pull/37) [`6fcf964`](https://github.com/swissspidy/trod/commit/6fcf964f023040b330c144db44baed267705d495) Thanks [@swissspidy](https://github.com/swissspidy)! - `trod tune`: validated notes tuning against your own tasks. List tasks with a shell check in `.trod/tune.json`; a model (default Haiku) practises on some of them in throwaway copies of the project, a stronger model rewrites `.trod/notes.md` from the failed sessions, and the rewrite replaces the notes only if it passes more held-out validation runs than the current notes.

### Patch Changes

- [#39](https://github.com/swissspidy/trod/pull/39) [`3aa3ed2`](https://github.com/swissspidy/trod/commit/3aa3ed2c121c75640f3f24f3b3edc1265aafba9e) Thanks [@swissspidy](https://github.com/swissspidy)! - Fixes from a full read-through of the code:
  
  - Tool output with non-ASCII text (accents, CJK, emoji) could come back with corrupted characters when it was larger than one pipe chunk. Output is now decoded as a stream.
  - A tool called right after it was changed now runs the new version, also while trod is still re-running its examples.
  - `trod forge`, `trod learn` and `trod tune` say so when the `claude` CLI cannot be started, instead of crashing, and no longer promote session tools in that case. A session killed mid-line no longer breaks reading its result.
  - `trod forge` and `trod learn` remove their temporary folders when they finish.
  - `trod tune` no longer leaves its MCP config inside the task workspace, where a check such as `git status` would see it.
  - Promoting a single-file tool again keeps one "promoted" stamp, and replaces a folder version of the same tool in the library.
  - The PostToolUse hook ignores files next to the tools that are not tools (a README in `.trod/tools/`).
  - The server watches only `.trod/tools` and `.trod/library` for changes, and reads the logs at startup only when there is a library to describe.
  - A stale "shadows the library tool" warning is dropped once the library tool is gone.

- [#40](https://github.com/swissspidy/trod/pull/40) [`98f5c3d`](https://github.com/swissspidy/trod/commit/98f5c3d0576af3945b50c38ccd88c5b07ba20305) Thanks [@swissspidy](https://github.com/swissspidy)! - The package is about 40% smaller (0.8 MB unpacked instead of 1.4 MB): the CLI (`bin/trod`) now shares the server's code (`server/trod-lib.mjs`) instead of carrying a second copy. `server/trod-server.mjs` is still the server's entry point. A vendored copy (`trod init --vendor`) gets the new file the next time you run it.

## Before 0.1.0 (never published)

Development milestones before the first npm release; their changes ship in 0.1.0.

### Milestone "0.5.0"

- Scheduled learning: `trod learn` is incremental (`.trod/state/learn.json`, self-ignoring; nothing new means no
  session and exit 0; one run per project at a time; `--all` relearns and recounts) and keeps an evidence ledger,
  `.trod/notes.evidence.json`, in which each run checks every existing rule against the new sessions and fixes or
  drops rules contradicted more often than confirmed; the ledger only grows, and a run that breaks it is not
  recorded. The `learn` skill (`/trod:learn`,
  `trod-learn`) runs it for a Claude Code Desktop scheduled task, cron or an Antigravity Automation and reports the
  diff without committing.
  The learner session starts without Claude Code's nested-session marker, so the skill works from inside a session.
- Antigravity: the repository root is an Antigravity plugin (`agy plugin install https://github.com/swissspidy/trod`),
  and `trod init --antigravity` sets a repository up (`.agents/mcp_config.json`, an Antigravity skill); execution
  stays off until you opt in (`--allow-exec` per repository, or `TROD_ALLOW_EXEC=1` for your machine). Notes reach
  Antigravity through `.agents/rules/trod-notes.md`. The server follows the client's workspace through MCP roots when
  no project directory is configured, and creates nothing in the home directory meanwhile.
- `trod learn`: distil notes from the transcripts of sessions that already happened (Claude Code keeps them in
  `~/.claude/projects/`), comparing failed sessions with passed ones; optional `--outcomes` from CI or a grader.
  Many kinds of task get general rules plus an index in `.trod/notes.md` and one page each in `.trod/wiki/`.
  Round 11: from 120 old MiniWoB++ sessions, Haiku 68% → 81–83%; 88% after a second round.
- `--timeout <minutes>` for `trod forge` and `trod learn`.
- `trod forge --practice '<check>' [--reset '<cmd>']`: the forge practises against a success check (any shell
  command; exit code 0 = success) before writing notes, and its notes are linked only if it passed at least once.
  The approach comes from round 9 (MiniWoB++), where an experiment harness (`experiments/miniwob/forge-notes.ts`)
  practised the same way: its notes took Haiku from 68% to 90% on the hardest task types (88% with notes Haiku forged
  for itself).
- `trod init [--vendor] [--allow-exec]`: set any repository up for trod in every Claude Code session, local or cloud
  (including sessions started from the mobile app): `.mcp.json`, `.claude/settings.json`, the skill, `.gitignore`.
- `trod mcp`: start the server on stdio for any MCP client; `trod --version`.
- Packaged for npm as `trod` (`npx trod init`) and for the MCP Registry as `io.github.swissspidy/trod`; both go live
  with the first tagged release (see [docs/distribution.md](https://github.com/swissspidy/trod/blob/main/docs/distribution.md)).

### Milestone "0.4.0"

- Verified notes (ADR 0004): `trod forge` writes `.trod/notes.md` with checks in `.trod/notes.checks.json`;
  `trod notes [--link]` and `trod verify` re-run the checks; only verified notes are linked into `CLAUDE.md`.

### Earlier milestones ("0.3.0" and before)

- `trod forge`, library cards and code mode (`trod_eval`) (ADR 0003); single-file tools, `trod_run`, the validation
  hook (ADR 0002); the genesis server (ADR 0001). See the experiment rounds in the README for what each change did.
