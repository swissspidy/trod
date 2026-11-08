# ADR 0004: Verified notes

- Status: Accepted (trod 0.4)
- Date: 2026-11-07

## Context

Round 6b ([results-6/README.md](../../results-6/README.md)) changed what we think a forge should produce. On AppWorld,
an Opus forge that read graded train-split runs built a tool library *and* a checklist of the environment's
conventions ("my roommates" means phone contacts with that relationship, `place_order` buys the whole cart, …). The
tools tied with no tools at all. The same checklist as an always-loaded `CLAUDE.md` raised Haiku from 87.5% to 95.0%
(11 tasks fixed, 2 broken, p = 0.022). Much of what a newcomer gets wrong is knowledge, not missing code.

Round 7 ([results-7/README.md](../../results-7/README.md)) bounded that: on BIRD, where the missing knowledge is
specific to each question, notes from other questions did not help accuracy (they still cut tokens by 18%). Notes
pay when the knowledge recurs.

Knowledge has a weakness code does not: it goes stale silently. A tool whose example fails is caught by
`trod verify`; a note that says "status is one of Active, Closed, Merged" after the environment added "Pending" keeps
misleading every session. Related work that keeps lessons across tasks, such as Harness² (Xu et al., 2026), stores
them as free text.

## Decision

1. **Notes are a forge output.** `trod forge` asks for `.trod/notes.md` (at most about 4000 characters: conventions,
   value meanings, definitions, output shapes, traps; general rules, not answers) next to the tools.
2. **Checkable claims carry checks.** `.trod/notes.checks.json` is an array of
   `{claim, tool, input, expect}`: run a library tool with an input and check the output like a tool example
   (`contains`, `matches`, `equals`). The forge runs them after promotion and reports failures.
3. **Delivered by Claude Code, not by trod.** Notes reach sessions through `CLAUDE.md`, which imports them with an
   `@.trod/notes.md` line. `trod forge` adds the import once (opt out with `--no-link`; `trod notes --link` adds it
   later). They are not part of the MCP server instructions, whose ~4 KB budget the library cards already use and
   which Claude Code truncates.
4. **Staleness is detected.** `trod verify` runs the note checks with the tool examples and exits 1 when either
   fails; `trod notes` shows the notes' size, link status and checks.

## Consequences

- A forge's knowledge is versioned with the code (committed `.trod/notes.md`) and checked in CI like the tools.
- Notes cost context in every session, so their size is capped by convention (warnings above 6000 characters).
- Only claims that a library tool can observe are checkable; the rest is as trustworthy as the forge that wrote it.
  The forge prompt asks to check each claim against the environment while writing.
- Editing `CLAUDE.md` is a visible change to a user file; it is a single appended import line under its own heading.
- Evidence since: on ScienceWorld (round 8) forged notes took Haiku from 52% to 89% solved. On AppWorld through
  `trod forge` (round 6c), the first forged notes missed domain rules because they described the tools instead, so
  the forge prompt now keeps notes to environment knowledge. Tools on top of good notes added nothing there.

## Addendum: practice (round 9)

Notes checked by tool examples verify facts, not procedures. Round 9 (MiniWoB++) showed a second source of verified
notes: practice against a success signal. `trod forge --practice '<check>'` exposes the check to the forge session as
`trod-try`, logs every attempt outside the session, and adds a notes error when no attempt passed, so the notes are
not linked. The check is a plain shell command (exit code 0 = success), which covers test suites, graders and smoke
tests without trod knowing the environment. The forge can still write a wrong rule after a pass; the gate only
guarantees that something in the notes was seen to work, which is why the notes stay short and rule-shaped.
