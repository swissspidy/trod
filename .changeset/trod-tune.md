---
"trod": minor
---

`trod tune`: validated notes tuning against your own tasks. List tasks with a shell check in `.trod/tune.json`; a model (default Haiku) practises on some of them in throwaway copies of the project, a stronger model rewrites `.trod/notes.md` from the failed sessions, and the rewrite replaces the notes only if it passes more held-out validation runs than the current notes.
