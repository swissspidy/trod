---
"trod": minor
---

Easier to start with and to find your way around:

- **`trod doctor`** checks the setup (the Claude Code CLI, the server entry, the hooks, whether tools may run), shows what trod knows about the project (notes, wiki pages, library, evidence) and how many sessions it has not learned from yet, and names the next step. It changes nothing and runs no tool.
- **`trod help`** fits on one screen, with one line per command; `trod help <command>` and `trod <command> --help` show that command's options. A mistyped command gets a "did you mean".
- **`trod learn --dry-run`** lists the sessions a learning run would read and starts nothing.
- `trod learn` and `trod forge` say what they are doing, end with what to do next (review the diff, commit), and no longer print "0/0 check(s) passed". `trod learn` does not build tools in a project whose sessions cannot run them.
- `trod init` from an unreleased build says that npx cannot fetch it and points to `--vendor`.
