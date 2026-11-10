# trod reference

Everything the [README](../README.md) leaves out: the tool format, every install route, the CLI, configuration and
releasing.

## The tool format

One file, `.trod/tools/<name>.mjs`:

```js
export const meta = {
  description: 'Sums a numeric column of a CSV file and returns the total.',
  whenToUse: 'When you need a column total of a CSV file.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' }, column: { type: 'string' } },
    required: ['path', 'column'],
  },
  examples: [{ input: { path: 'data.csv', column: 'a' }, expect: { equals: 4 } }],
};

export default async ({ path, column }, ctx) => { /* … */ return total; };
```

(The folder format, `.trod/tools/<name>/tool.json` plus `run.mjs` or `run.sh`, also works.)

On every change trod checks the definition, the schema, name collisions and the syntax, then runs the
`examples` as a smoke test. Invalid tools are not registered. A PostToolUse hook reports the result in the
Write's own result. Three permanent tools never change, so they stay in the cached prefix (a client that sends newly
registered tools with the next request still changes its tool list; see ADR 0002):

- `trod_run {tool, input}` calls any trod tool right away, with nothing to load
  ([ADR 0002](adr/0002-tool-loading-and-the-prompt-cache.md)).
- `trod_status` shows the registry, the load errors and per-tool usage.
- `trod_eval {code}` runs JavaScript with every trod tool as a function (`await tools.x({…})`): fetch, combine and
  compute in one call ([ADR 0003](adr/0003-forge-library-cards-and-code-mode.md)).

Library tools (`.trod/library`) are listed in the server's instructions with their evidence (examples passed at
promotion, usage in earlier sessions), so a fresh session can rely on them from its first turn.

## Install routes

**Any repository, for every session in it** (local, [cloud](https://code.claude.com/docs/en/claude-code-on-the-web)
and sessions started from the Claude mobile app):

```sh
npx trod init --allow-exec     # writes .mcp.json, .claude/settings.json, the skill and .gitignore entries
git add .mcp.json .claude .gitignore && git commit -m "Add trod"
```

Cloud sessions do not install plugins declared in project settings, but they start project MCP servers from a
committed `.mcp.json` (see [docs/spike.md](spike.md)); `trod init` writes one that runs `npx -y trod@<version> mcp`
and sets `"enableAllProjectMcpServers": true`, which approves every server in the project's `.mcp.json`, not only
trod's (cloud sessions cannot answer the approval prompt). On your own machine, Claude Code ignores approvals committed
to the project until you trust the folder ([workspace trust](https://code.claude.com/docs/en/mcp#project-server-approvals-and-workspace-trust)). `--vendor` copies the bundled server (one file, no
dependencies) into `.trod/pkg/` instead, so nothing is fetched at session start. Stage it with the other files
(`git add .trod/pkg`, or `git add -f .trod/pkg` if your `.gitignore` ignores `bin/`).

**Every cloud session in an environment, without touching any repository** (tested): in the cloud environment's
settings, add this setup script and the variable `TROD_ALLOW_EXEC=1` (the network must reach github.com):

```sh
claude plugin marketplace add swissspidy/trod || true
claude plugin install trod@trod || true
```

The `|| true` keeps sessions starting when GitHub is unreachable or the marketplace is already added; if a session
lacks the trod tools, check `claude plugin list` in it. Each new session in that environment, whichever repository it
opens (or none), then has the trod tools, the skill and
the hook as a plugin.

**Local plugin** (Claude Code on your machine):

```sh
claude plugin marketplace add swissspidy/trod
claude plugin install trod@trod
```

**Antigravity**, as a plugin for every workspace (the repository root is an Antigravity plugin: it runs the bundled
server, so it needs no npm release; the install clones the repository, about 6 MB):

```sh
agy plugin install https://github.com/swissspidy/trod
```

or per repository, committed like `trod init` for Claude Code:

```sh
npx trod init --antigravity --allow-exec   # .agents/mcp_config.json, .agents/skills/trod/SKILL.md
```

Antigravity starts MCP servers outside the project (reportedly in the home directory) and passes no project path, so
when neither `TROD_PROJECT_DIR` nor `CLAUDE_PROJECT_DIR` is set, the server asks the client for its workspace through
MCP roots and moves to the first one; until then it creates nothing in the home directory, and `trod_status` names
the directory it uses. If Antigravity does not answer with a root, set `TROD_PROJECT_DIR` for the server. Notes reach
Antigravity through `.agents/rules/trod-notes.md`, an always-on rule that inlines `.trod/notes.md`; `trod init
--antigravity`, `trod forge`, `trod learn` and `trod notes --link` write it in projects with an `.agents/` folder (in
a workspace that only uses the plugin, run `npx trod init --antigravity` or create `.agents/rules/` first; for notes that
already exist, then run `trod notes --link`).

Execution stays off in the plugin: it is installed for every workspace, and with execution on the server imports a
workspace's tool files (and runs their examples) as soon as it starts, before Antigravity could ask about any tool
call, so opening an untrusted repository would run its code. Turn it on where you trust the code: per repository with
`npx trod init --antigravity --allow-exec` (committed in `.agents/mcp_config.json`; teammates who open the repository
run its tools), or for your machine by setting `TROD_ALLOW_EXEC=1` in the environment Antigravity starts from. Once
on, Antigravity still asks before each MCP tool call unless you allowed it. Antigravity's PostToolUse hooks
cannot send messages to the agent, so instead of the validation hook the skill tells the agent to check
`trod_status` after writing a tool. `trod forge` and `trod learn` run Claude Code sessions, so they need the
`claude` CLI; `trod learn` reads Claude Code's and Codex's transcripts, not Antigravity's. Verified here with an MCP client that
behaves like Antigravity (starts the server in an empty home directory, reports a workspace root); not yet tested in
Antigravity itself.

**Codex**, per repository (tested with the Codex CLI 0.167 and gpt-5-mini: the server starts from the project or a
subfolder, a tool written mid-session is called as a tool of its own, and `trod learn` learns from the sessions):

```sh
npx trod init --codex --allow-exec   # .codex/config.toml, .agents/skills/, .gitignore entries (--auto-approve for codex exec)
```

`trod init --codex` adds a marked block to `.codex/config.toml` (the rest of the file is kept): the server through
`npx -y trod@<version> mcp`, and the `mcp_tool_list_changed` feature, which makes tools written mid-session appear in
Codex's tool list (without it, `trod_run` and `trod_eval` still call them). If the file already has a `[features]`
table, add `mcp_tool_list_changed = true` there yourself (init says so). Codex reads a project's `.codex/config.toml`
only once you trust the project. It starts project servers in the folder Codex runs in and sends no MCP roots, so
trod walks up from there to the nearest folder with `.trod/` (stopping at the git root). The skills go to
`.agents/skills/` (the same files Antigravity reads), and `trod forge`, `trod learn`, `trod notes --link` and `trod init
--codex` (for notes already linked into `CLAUDE.md`) keep a copy of `.trod/notes.md` in a marked block of `AGENTS.md`
(or `AGENTS.override.md`), in projects with a `.codex/` folder or an `AGENTS.md`: Codex cannot import a file, and in a
real run gpt-5-mini never followed a pointer to it. Run `trod notes --link` after editing the notes by hand to refresh
the copy. `codex exec` runs with approval policy "never", which refuses every MCP call that needs approval: `--auto-approve` (a
separate opt-in) sets `default_tools_approval_mode = "approve"` for trod, so Codex runs every trod tool without asking,
`trod_eval`'s arbitrary code included. Tool code, `trod_eval` included, runs outside Codex's sandbox, so with
execution on `trod_eval` can write files that `workspace-write` would not allow. Rerunning `trod init --codex`
rewrites the block (keeping variables you added under `[mcp_servers.trod.env]`). `trod learn` reads Codex's sessions too (`$CODEX_HOME/sessions`, default `~/.codex/sessions`, those
that ran in the project or a folder inside it); `trod forge` and `trod learn` still run Claude Code as their engine.

As a plugin for every project, `codex plugin marketplace add swissspidy/trod` and `codex plugin add trod@trod`
install `plugin/.codex-plugin/plugin.json`: the skills and the server through `npx` (Codex does not expand the
plugin's own path in a server's arguments, so the plugin runs the published package), with execution off and no
hooks. Untested: Codex only started plugin servers in a signed-in session, which this repository's tests cannot do.

**Other MCP clients** (Cursor, VS Code, ...): run `npx -y trod mcp` as a stdio server, with `TROD_ALLOW_EXEC=1` in
its environment and the project directory as its working directory, `TROD_PROJECT_DIR`, or an MCP root.
Tools written mid-session appear through `notifications/tools/list_changed`; clients that ignore it can still call
every tool through `trod_run` and `trod_eval`. The skill and the validation hook are Claude Code features; elsewhere,
put the skill's text (`plugin/skills/trod/SKILL.md`) into the client's rules file.

**Execution is off by default.** Tool code runs in a subprocess of the server, outside Claude Code's
permission prompts and Bash sandbox. trod only runs tools when `TROD_ALLOW_EXEC=1` is set in its environment,
which is meant for ephemeral cloud containers. See [ADR 0001](adr/0001-tool-execution-and-safety.md).

## CLI and lifecycle

- New tools land in `.trod/tools/` (ignored by git): session tools.
- `trod promote <name>` moves one to `.trod/library/` (committed). The library loads at startup.
- `trod forge --brief @env.md [--model claude-opus-5-5]` runs a dedicated tool-building session (headless Claude
  Code) against an environment and promotes every tool whose examples pass: build the library once with a strong
  model, use it in every later session. The forge also writes `.trod/notes.md` (conventions a newcomer gets wrong)
  with checks in `.trod/notes.checks.json`, and links the notes into `CLAUDE.md` (`@.trod/notes.md`).
- `trod forge --brief @env.md --practice '<check>' [--reset '<cmd>']` lets the forge **practise** first. The check
  is any shell command whose exit code 0 means the current attempt succeeded: a test suite, a grader, a smoke
  test. The forge calls it as `trod-try` (and `--reset` as `trod-reset`), learns from what passes and fails, and
  writes rules plus a recipe that worked. Its notes are linked only if it passed the check at least once
  ([round 9](../results-9/README.md): practice notes took Haiku from 68% to 90% on MiniWoB++'s hardest task types).
- `trod learn [--from <dir|file>]... [--outcomes <file>] [--limit <n>]` learns from sessions that **already
  happened**. Claude Code keeps a transcript of every session in `~/.claude/projects/<project>/`; trod learn
  condenses the most recent ones (200 by default, `--limit` changes it) (task, tool calls, errors, final message), skips trod's own forge
  sessions, and runs a forge session that compares failed sessions with passed ones and writes rules into
  `.trod/notes.md`. When there are many kinds of task, it keeps general rules plus an index there and puts each
  kind's rules into `.trod/wiki/<kind>.md`, which sessions read on demand ([round 10](../results-10/README.md):
  Haiku picks the right page itself). `--outcomes` is a JSON object mapping session ids to `true`/`false` (from
  CI, a grader, or your own judgment); without it the learner judges each session from its errors, retries and
  your corrections. No brief and no practice environment are needed; `--brief` and `--practice` still work.
  Like the forge, the learner is a Claude Code session that may run commands to confirm a lesson against the
  project ([round 11](../results-11/README.md) found it starting the project's own test server); run it where that
  is fine. It sees the transcripts on the machine where it runs: on your own machine that is every session you had
  in this project; a cloud container only holds its own session's transcripts, so point `--from` at transcripts you
  collected (for example from CI runs of `claude -p`).
- `trod verify` re-runs every library tool's examples and every note check: run it in CI to catch a drifted
  environment. `trod notes` shows the notes' status.
- `trod stats` summarizes `.trod/logs/*.jsonl`: tools created, called, reused, errors.
- `trod check` validates every tool folder without running anything.

The CLI is `npx trod <command>`, or bundled at `plugin/bin/trod` in this repository (`node plugin/bin/trod stats`).

## Keep learning

Notes improve with every round of sessions ([rounds 11](../results-11/README.md) and [12](../results-12/README.md): 68% → 83% → 88% → 91%; validated tuning in [round 13](../results-13/README.md) reached 94%, and [round 14](../results-14/README.md) 95%), so `trod learn`
is made to run on a schedule:

- **Incremental.** It learns only from sessions since its last run (`.trod/state/learn.json`: local session ids, in a
  folder that ignores itself, so it is never committed). With nothing new, or no sessions yet, it says so and exits 0
  without starting a session, so a frequent schedule costs nothing on quiet days. One run per project at a time.
  `--all` learns from every session again (still at most `--limit`, 200 by default) and recounts the evidence.
- **Evidence.** When the notes are linked (the default; not with `--no-link`), later sessions run with them loaded,
  so each run checks every existing rule against those sessions and keeps `.trod/notes.evidence.json` (committed):
  per rule, how often sessions confirmed or contradicted it, and whether it was kept, fixed, newly added or
  dropped. The learner is told to fix or drop rules contradicted more often than confirmed; dropped ones stay in the
  ledger so they are not re-learned. The ledger is required and only grows (no rule disappears, a dropped rule stays
  dropped, counts never fall outside `--all`); a run that breaks it fails and does not mark its sessions as learned.
  `trod learn` prints a one-line summary.
- **Review, don't auto-commit.** A run leaves its changes in the working tree; review `git status -- .trod` and
  `git diff -- .trod` (new files such as the first ledger are untracked) like any other change.

It has to run where the sessions happen, because it reads the local transcripts: a CI job or a cloud scheduled task
starts in a fresh checkout with no history to learn from. Options:

| Scheduler | How |
|---|---|
| Claude Code Desktop, scheduled task | Code tab, Scheduled, New task: "Only on this computer", the project as local folder, weekly, prompt `/trod:learn` (plugin) or `/trod-learn` (after `trod init`). Runs while the app is open; a missed run gets one catch-up. |
| cron (Linux, macOS) | `17 9 * * 1  cd /path/to/project && mkdir -p .trod/logs && npx -y trod learn >> .trod/logs/learn.log 2>&1` (needs the `claude` CLI on cron's PATH and logged in) |
| launchd (macOS) | a LaunchAgent with `ProgramArguments` `npx -y trod learn`, `WorkingDirectory` the project, `StartCalendarInterval` weekly |
| Antigravity | an Automation or a sidecar `schedule` that runs `npx -y trod learn` in the project (`/schedule` lasts only for its conversation) |

The `learn` skill (`/trod:learn`, or `trod-learn` in projects set up with `trod init`) runs `trod learn` and
reports the evidence line and the changes without committing. Its prompt carries a marker (`trod-learn-run-7c1e5a`),
and `trod learn` never learns from sessions whose prompts contain it (hidden skill messages included), so scheduled
runs do not feed on themselves.

## Hooks delivery: only the rules that apply, and a holdout

By default `CLAUDE.md` imports `.trod/notes.md`, so every session loads all of it. `trod notes --delivery hooks
[--holdout 0.1]` switches Claude Code sessions to trod's hooks instead (`.trod/config.json`, committed):

- **SessionStart** injects `.trod/notes.md`, except in a random share of sessions, the holdout (10% by default, by a
  stable hash of the session id), which gets no notes at all.
- **UserPromptSubmit** adds a `.trod/wiki/` page when the prompt contains one of the words in its front matter
  (`---` / `when: invoice, billing run` / `---`, which `trod learn` now writes), once per session. Pages can grow without
  growing every session's context; pages without `when:` are still reachable through the index in the notes.
- Every decision goes to `.trod/logs/notes.jsonl`: which sessions were in the holdout and which pages fired. `trod
  report` then compares holdout sessions with the rest, a randomized comparison instead of before and after, and
  `trod learn` marks each digest with what the session had, so the learner can weigh a rule against sessions that ran
  without it.

If SessionStart did not run for a session, its first prompt carries the notes. A resume, clear or compaction is a new
context and gets the notes again. The switch is refused while any notes check fails, as `--link` is, and the hooks are
installed before anything else changes. A pinned `npx -y trod@<version> hook` from an older trod moves to the current
version. A vendored copy in `.trod/pkg` must be updated with `trod init --vendor` first.

The switch removes the `@.trod/notes.md` import from `CLAUDE.md` (forge and learn no longer add it) and installs the
three hooks in `.claude/settings.json`; `trod init` and the plugin install them too, and they do nothing until the
project chooses hooks delivery. `trod notes --delivery import` switches back. Checked with Claude Code and Haiku: the
model answered from the injected notes and the page its prompt matched, without a tool call. Codex and Antigravity keep
their copy and rule (they have no equivalent hooks for this yet).

## Tuning notes against your own tasks

`trod learn` judges sessions after the fact. When you can say what "done" means as a command, `trod tune` measures
instead. List tasks in `.trod/tune.json`:

```json
{
  "tasks": [
    { "id": "add-lower", "prompt": "Add an exported function `lower` to util.js.", "check": "npm test && grep -q '^- lower:' CHANGELOG.md" },
    { "id": "add-trim", "prompt": "Add an exported function `trim` to util.js.", "check": "npm test && grep -q '^- trim:' CHANGELOG.md", "split": "validate" }
  ],
  "runs": 2
}
```

Each task has a `prompt` (what a user would type), a `check` (a shell command run in the task's workspace afterwards;
exit 0 means done) and optionally a `setup` command and a `split`. Then `npx trod tune` runs a loop:

1. **Practice.** A model (`--model`, default Haiku) runs each practice task `runs` times. Every run gets a throwaway
   copy of the project carrying the current notes: a detached git worktree at HEAD (so commit what the tasks should
   see), or a plain copy outside git. The task's check decides pass or fail.
2. **Propose.** A stronger model (`--proposer`, default Opus) reads digests of those sessions and rewrites
   `.trod/notes.md` (and `.trod/wiki/`) in a copy of the project. It writes general rules, not task answers, and its
   notes checks must pass.
3. **Validate.** The held-out validation tasks run with the current notes and with the candidate. The candidate
   replaces the project's notes only if it passes at least `--margin` (default 1) more runs; otherwise nothing changes.

Tasks without a `split` are divided between the two sets by a stable hash of their id. `--iterations` repeats the
loop on the winning notes, and `--dry-run` shows the split and how many sessions an iteration costs. Runs, digests
and the decision go to `.trod/tune/<time>/` (ignored by git). The project's notes change only when a candidate wins,
and nothing is committed.

Validation is the point. On AppWorld, three plausible rewrites from Opus were each rejected because they did no
better on held-out tasks; one did 3.5 points worse ([round 15](../results-15/README.md)). On MiniWoB++, the pages
that did win took Haiku from 137 to 141 of 150 ([round 13](../results-13/README.md)). On a toy repository with an
unwritten changelog rule, one iteration took Haiku from 0 to 3 of 3 validation runs for $0.26.

## Is it helping?

`trod report` compares this project's sessions (the Claude Code and Codex transcripts `trod learn` reads) from
before the notes were linked with the ones after: median turns, tool calls, follow-up prompts (often corrections),
tokens and duration, and the share of tool calls that failed, plus the evidence ledger's summary. The split is the
first commit that added the `@.trod/notes.md` import to `CLAUDE.md` (Claude Code) or the trod block to `AGENTS.md`
(Codex); trod's own forge and learn sessions are left out. `--json` for the numbers, `--from <path>` for other
transcripts.

It needs no grader, which makes it usable anywhere, but it is not a controlled experiment: the tasks before and after
differ, and a quieter week looks like an improvement. In the experiments every round that helped also showed up as
fewer tokens and turns (MiniWoB++ −33% tokens, ScienceWorld −39%), so a clear drop is a good sign and a rise is
worth a look at the notes. Claude Code does not record in a transcript which memory files a session loaded, so
sessions are split by date, not by whether they actually saw the notes.

## Configuration

| Variable | Default | |
|---|---|---|
| `TROD_ALLOW_EXEC` | unset | `1` lets the server execute tools |
| `TROD_PROJECT_DIR` | `CLAUDE_PROJECT_DIR`, then the client's first MCP root, then cwd | where `.trod/` lives |
| `TROD_MAX_OUTPUT_CHARS` | 25000 | longer outputs are truncated with a marker |
| `TROD_ENV_PASSTHROUGH` | empty | comma-separated extra variables tools may see |
| `TROD_SESSION_ID` | `CLAUDE_CODE_SESSION_ID` | session id for logs |

## Development

```sh
pnpm install
pnpm check      # typecheck, lint, tests
pnpm build      # bundles plugin/server/trod-server.mjs and plugin/bin/trod (committed)
```

pnpm monorepo: `packages/server` (MCP server, registry, executor, logs), `packages/cli`, `plugin/` (the
Claude Code plugin), `experiments/` (tasks, runner, report). MIT licensed.

**Releasing.** `plugin/` is also the npm package `trod` (bundled server and CLI, the skills and the hook; no
dependencies). Releases go through [Changesets](../.changeset/README.md): add a changeset (`pnpm changeset`) to a
pull request that changes what users get; merging the "Version packages" pull request bumps the version everywhere
(`scripts/sync-version.mjs`), stages it on npm with provenance, tags it and creates the GitHub release. A
maintainer approves the staged version on npmjs.com, and the MCP Registry workflow lists it as
`io.github.swissspidy/trod`. Nothing is tagged by hand and no npm token is stored.
