# Changelog

## 0.5.0

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
  with the first tagged release (see [docs/distribution.md](docs/distribution.md)).

## 0.4.0

- Verified notes (ADR 0004): `trod forge` writes `.trod/notes.md` with checks in `.trod/notes.checks.json`;
  `trod notes [--link]` and `trod verify` re-run the checks; only verified notes are linked into `CLAUDE.md`.

## 0.3.0 and earlier

- `trod forge`, library cards and code mode (`trod_eval`) (ADR 0003); single-file tools, `trod_run`, the validation
  hook (ADR 0002); the genesis server (ADR 0001). See the experiment rounds in the README for what each change did.
