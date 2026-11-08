# Changelog

## 0.5.0

- `trod learn`: distil notes from the transcripts of sessions that already happened (Claude Code keeps them in
  `~/.claude/projects/`), comparing failed sessions with passed ones; optional `--outcomes` from CI or a grader.
  Many kinds of task get general rules plus an index in `.trod/notes.md` and one page each in `.trod/wiki/`.
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
