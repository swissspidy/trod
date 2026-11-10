# Security

## Reporting a vulnerability

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/swissspidy/trod/security/advisories/new), not in a
public issue. Say what you found, how to reproduce it and which version you used.

## What trod runs, and when

trod lets an agent write tools and then runs them. That is the point of it, and it is why the defaults are careful:

- **Execution is off by default.** The server only runs tool code when `TROD_ALLOW_EXEC=1` is set in its
  environment. Without it, tools are validated but never run. `trod init --allow-exec` writes the setting; it is
  meant for ephemeral containers such as Claude Code cloud sessions.
- **Tool code runs outside the client's permission prompts and sandbox**, in a subprocess of the server, with a
  timeout and a process group that is killed with it. Treat enabling execution like allowing the agent to run
  arbitrary commands, because that is what it is.
- **Tools get a scrubbed environment.** Only an allowlist of variables (PATH, HOME, locale, proxy and CA settings)
  is passed on; API keys, tokens and cloud credentials are not. `TROD_ENV_PASSTHROUGH` adds names you choose. A proxy
  URL that carries a password is dropped.
- **`trod forge`, `trod learn` and `trod tune` start Claude Code sessions with execution on**, because building and
  testing tools needs it. They run on your machine with your Claude Code credentials. `--budget` caps what a session
  may spend, and learning that runs by itself (`trod learn --auto`) is capped at $2 per run.
- **Notes are text an agent will follow.** `.trod/notes.md` and `.trod/wiki/` are loaded into later sessions, like
  `CLAUDE.md`. Review them in pull requests the way you review code: a learning run leaves a diff, and `trod learn`
  never commits.
- **Session transcripts stay local.** `trod learn` reads the transcripts Claude Code and Codex keep on your machine
  and sends condensed versions to the model in a normal Claude Code session. Nothing else leaves the machine, and
  trod has no telemetry.

The design decisions behind this are in [ADR 0001](docs/adr/0001-tool-execution-and-safety.md).
