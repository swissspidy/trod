---
"trod": minor
---

Codex support: `trod init --codex` adds the trod server and the `mcp_tool_list_changed` feature to `.codex/config.toml`, the skills to `.agents/skills/`, and (once notes exist) a block in `AGENTS.md` with a copy of `.trod/notes.md` (Codex cannot import a file); `trod learn` also learns from Codex sessions (`~/.codex/sessions`); `plugin/.codex-plugin/plugin.json` makes the repository a Codex plugin. Without a configured project directory, trod now uses the nearest folder with `.trod/` up to the git root, so clients started in a subfolder find the project.
