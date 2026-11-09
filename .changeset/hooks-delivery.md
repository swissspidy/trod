---
"trod": minor
---

Hooks delivery (`trod notes --delivery hooks [--holdout 0.1]`): trod's SessionStart hook injects `.trod/notes.md` (except in a random holdout of sessions), its UserPromptSubmit hook adds the `.trod/wiki/` pages whose `when:` words a prompt contains, and every decision is logged, so `trod report` compares holdout sessions with the rest and `trod learn` sees what each session had.
