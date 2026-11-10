/**
 * Help text. `trod` and `trod --help` print the overview: one line per command, grouped by what you are trying to do.
 * `trod help <command>` and `trod <command> --help` print that command's details.
 */

export const OVERVIEW = `trod: teach Claude Code your environment once

A learning session writes verified notes (and tools) about your project; every later session loads them, so a cheap
model works like one that already knows the place.

Usage: trod <command> [options]        trod help <command> for details

Start here
  init         Set this repository up for trod (Claude Code; also --antigravity, --codex)
  doctor       Check the setup, show what trod knows about this project and say what to do next

Learn
  learn        Distil notes from the sessions you already had (--auto <n>: keep doing it by itself)
  forge        Study an API, tool or workflow in a dedicated session: verified tools and notes
  tune         Improve the notes against your own tasks, and keep a rewrite only if it passes more of them

Check
  verify       Re-run every tool example and note check; exit 1 if something went stale (for CI)
  report       Is it helping? Sessions with the notes against sessions without them
  notes        The notes' status; --link them; --delivery hooks|import
  stats        Tool usage from the logs

Tools
  list         List session and library tools
  check        Validate every tool
  promote      Move a session tool into the committed library

Plumbing
  mcp          Start the MCP server on stdio (what MCP clients run)
  hook         The command behind trod's Claude Code hooks

Common options
  --dir <path>   The project (default: TROD_PROJECT_DIR, CLAUDE_PROJECT_DIR, or the nearest folder with .trod/)
  --json         Machine-readable output
  --version      Print trod's version

Docs: https://github.com/swissspidy/trod/blob/main/docs/reference.md`;

const SESSION_OPTIONS = `  --model <id>             The model for the session
  --timeout <minutes>      Stop the session after this long (default 30)
  --budget <usd>           Spend cap for the session (Claude Code's --max-budget-usd)
  --stream <file>          Keep the session's stream-json output in this file
  --no-link                Do not link the notes into CLAUDE.md afterwards`;

export const DETAILS: Record<string, string> = {
  init: `trod init [--vendor] [--allow-exec] [--antigravity | --codex [--auto-approve]]

Sets this repository up for trod in every Claude Code session, local or cloud (also sessions started from the mobile
app): writes .mcp.json, .claude/settings.json (trod's hooks) and the skills. Commit what it writes.

  --vendor        Copy the server into .trod/pkg instead of running it through npx
  --allow-exec    Let tools run (TROD_ALLOW_EXEC=1). Tool code runs outside Claude Code's permission prompts, so
                  this is meant for ephemeral cloud containers
  --antigravity   Set the repository up for Antigravity instead (.agents/mcp_config.json, the skill, and a rule
                  that loads the notes)
  --codex         Set it up for Codex instead (.codex/config.toml, the skills in .agents/skills/, a notes block in
                  AGENTS.md); --auto-approve approves trod's tool calls in Codex (needed for codex exec)`,

  doctor: `trod doctor [--json]

Checks the setup (the Claude Code CLI, the MCP server entry, the hooks, whether tools may run), shows what trod knows
about this project (notes, wiki pages, library, evidence) and how many sessions it has not learned from yet, and
names the next step. Changes nothing and runs no tools. Exits 1 when something is broken.`,

  learn: `trod learn [--from <dir|file>]... [--outcomes <file>] [--limit <n>] [--all] [--brief <text|@file>] [--dry-run]
trod learn --auto <n|off>

Distils notes from sessions that already happened. It condenses Claude Code's transcripts of this project
(~/.claude/projects/<project>/) and Codex's sessions in it (~/.codex/sessions), compares failed with passed sessions
in a learning session and writes rules into .trod/notes.md (and .trod/wiki/ pages when there are many kinds of task).

Incremental: only sessions since the last run (.trod/state/learn.json). With nothing new it exits 0 without starting
a session, so it can run on a schedule. The learner keeps .trod/notes.evidence.json: per rule, how often later
sessions confirmed or contradicted it; rules contradicted more often than confirmed are fixed or dropped.

  --dry-run                Show which sessions it would learn from, and stop (starts no session, costs nothing)
  --from <dir|file>        Transcripts to read instead (repeatable)
  --outcomes <file>        JSON mapping session ids to true/false (e.g. from CI); otherwise the outcome is judged
                           from each transcript
  --limit <n>              At most this many sessions, the most recent first (default 200)
  --all                    Relearn from every session and recount the evidence
  --brief <text|@file>     What the learner should know about the project
  --practice <cmd>         A success check the learner can practise against (see trod help forge)
  --auto <n|off>           Learn by itself: trod's SessionEnd hook starts trod learn in the background once n
                           sessions have ended since the last run (at most once per 6 hours, each run capped at
                           $2; log in .trod/logs/auto-learn.log)
${SESSION_OPTIONS}`,

  forge: `trod forge --brief <text|@file> [--practice <cmd> [--reset <cmd>]]

Runs a dedicated session (headless Claude Code) that studies an environment, builds tools with tested examples and
writes .trod/notes.md. Every valid tool whose examples do not fail is promoted to .trod/library (one without examples
is promoted as unverified); the notes' checks are run, and the notes are linked into CLAUDE.md when they pass.

  --brief <text|@file>     A few lines on the API, tooling or workflow to study (required)
  --practice <cmd>         A shell command whose exit code 0 means the current attempt succeeded (a test suite, a
                           grader). The forge practises against it before writing notes, and its notes are linked
                           only if it passed at least once
  --reset <cmd>            Starts a fresh practice attempt
${SESSION_OPTIONS}`,

  tune: `trod tune [--config <file>] [--iterations <n>] [--runs <n>] [--margin <n>] [--proposer <id>] [--dry-run]

Tunes the notes against your own tasks. List them in .trod/tune.json: {"tasks": [{"id", "prompt", "check"}]}, where
check is a shell command and exit 0 means done. A model (default Haiku) runs the practice tasks, each in a throwaway
copy of the project; a stronger model rewrites .trod/notes.md from the failed sessions; the rewrite replaces the notes
only if it passes at least --margin more held-out validation runs than the current notes.

  --dry-run                Show the split and how many sessions an iteration takes, and stop
  --config <file>          The tasks file (default .trod/tune.json)
  --iterations <n>         Repeat the loop on the winning notes (default 1)
  --runs <n>               Runs per task (default 2)
  --margin <n>             How many more validation runs a rewrite must pass (default 1)
  --model <id>             The model the notes are for (default Haiku)
  --proposer <id>          The model that rewrites the notes (default Opus)
  --parallel <n>           Sessions at a time (default 3)
  --timeout <minutes>      Per task session (default 15)
  --budget <usd>           Spend cap per task session (default 2)`,

  verify: `trod verify [--json]

Re-runs every library tool's examples and every note check against the current environment. Exits 1 if any tool or
note is stale: run it in CI or on a schedule.`,

  report: `trod report [--from <path>...] [--json]

Is trod helping? Compares this project's sessions (Claude Code and Codex transcripts) from before the notes were
linked with those after: turns, tool calls, failed calls, follow-up prompts, tokens, duration; plus the evidence
ledger's summary. With hooks delivery (trod notes --delivery hooks) the comparison is randomized: sessions that got
the notes against a holdout that did not.`,

  notes: `trod notes [--link] [--json]
trod notes --delivery hooks|import [--holdout <share>]

Shows .trod/notes.md's status and runs its checks. --link adds @.trod/notes.md to CLAUDE.md (only when the checks pass).

--delivery chooses how Claude Code sessions get the notes. import (default): the CLAUDE.md import. hooks: trod's hooks
inject the notes at session start and add a .trod/wiki/ page when a prompt matches its "when:" words; a random share
of sessions (--holdout, default 0.1, at most 0.5) gets no notes, so trod report can compare.`,

  stats: `trod stats [--logs <path>] [--json]

Summarizes tool usage across .trod/logs/*.jsonl: tools created, called, reused, errors.`,

  list: `trod list

Lists session tools (.trod/tools) and library tools (.trod/library).`,

  check: `trod check

Validates every tool without running its examples; exits 1 if one is invalid. Single-file tools are imported to read
their meta, which needs TROD_ALLOW_EXEC=1.`,

  promote: `trod promote <name>

Moves .trod/tools/<name> to .trod/library/<name> after its examples pass. Commit the library so later sessions load it.`,

  mcp: `trod mcp

Starts the trod MCP server on stdio, for any MCP client. The project is TROD_PROJECT_DIR, CLAUDE_PROJECT_DIR, the
client's first workspace root, or the working directory.`,

  hook: `trod hook

The command behind trod's Claude Code hooks (JSON on stdin): PostToolUse reports whether a just-written tool is valid,
SessionStart and UserPromptSubmit deliver the notes (hooks delivery), SessionEnd counts sessions for trod learn --auto.`,
};

export const COMMANDS = Object.keys(DETAILS);

/** The closest command name, for "did you mean": within two edits, or sharing a prefix of three letters. */
export function suggestCommand(input: string): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cur = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    return row[b.length]!;
  };
  const scored = COMMANDS.map((c) => ({ c, d: distance(input.toLowerCase(), c) })).sort((x, y) => x.d - y.d);
  if (scored[0] && scored[0].d <= 2) return scored[0].c;
  return input.length >= 3 ? COMMANDS.find((c) => c.startsWith(input.toLowerCase().slice(0, 3))) : undefined;
}
