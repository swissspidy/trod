---
name: learn
description: Run trod learn for this project, distilling new rules from the sessions since the last run into .trod/notes.md, then report what changed. Use when the user or a scheduled task asks to learn from recent sessions, update the trod notes, or run trod learn.
---

trod-learn-run-7c1e5a (this marker keeps trod learn from learning from this session itself)

1. Before learning, run `git status --short -- .trod CLAUDE.md AGENTS.md .agents` and remember which of those files already
   had uncommitted changes: the report must not attribute them to this run.
2. In the project root, run `npx -y trod learn` (inside the trod repository itself: `node plugin/bin/trod learn`).
   It needs the `claude` CLI, takes a few minutes, and learns only from sessions since its last run.
3. If it prints "nothing new since the last run" or "nothing to learn from yet", reply with that one line and stop.
4. Otherwise report, briefly:
   - the `evidence:` line it printed (rules kept, fixed, new, dropped, and any contradicted more often than confirmed);
   - `git status --short -- .trod CLAUDE.md AGENTS.md .agents` and `git diff --stat -- .trod CLAUDE.md AGENTS.md .agents`; files shown as
     untracked (`??`) are new, so read them in full;
   - the rules that were added, fixed or dropped, from `git diff -- .trod/notes.md .trod/wiki .trod/notes.evidence.json`
     and the new files, leaving out changes that were already there in step 1.
5. Do not commit, push, or edit the notes yourself: the user reviews the changes like any other. Run nothing else.
   If `trod learn` fails, report its last lines.
