---
name: trod-learn
description: Run trod learn for this project, distilling new rules from the sessions since the last run into .trod/notes.md, then report what changed. Use when the user or a scheduled task asks to learn from recent sessions, update the trod notes, or run trod learn.
---

[trod-learn-run] (this marker keeps trod learn from learning from this session itself)

1. In the project root, run `npx -y trod learn` (inside the trod repository itself: `node plugin/bin/trod learn`).
   It needs the `claude` CLI, takes a few minutes, and learns only from sessions since its last run.
2. If it prints "nothing new since the last run", reply with that one line and stop.
3. Otherwise report, briefly:
   - the `evidence:` line it printed (rules kept, fixed, new, dropped, and any contradicted more often than confirmed);
   - `git diff --stat -- .trod CLAUDE.md .agents`;
   - the rules that were added, fixed or dropped, read from `git diff -- .trod/notes.md .trod/wiki .trod/notes.evidence.json`.
4. Do not commit, push, or edit the notes yourself: the user reviews the diff like any other change. Run nothing else.
   If `trod learn` fails, report its last lines.
