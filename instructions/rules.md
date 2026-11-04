## Handoff habit
After every request in a project (not only big tasks; more urgent as context grows, compaction nears, or the session drifts), write state to disk so the next request starts in a clean session.
- Write `.claude/HANDOFF.md` in the project root (shared by every coding agent on this machine; for one-off directories, the working directory). Overwrite it each time: it's current state, not a log.
- Contents, in order:
  1. Goal: what "done" means.
  2. Files changed: paths, one line each on what changed.
  3. Decisions and why.
  4. Approaches that failed and why, so the next session doesn't retry them.
  5. The exact next step: a concrete action, not "continue".
  6. The test command that proves the work is done, and its current result.
- Then end every reply with this nudge as its last lines, never skipped: "Update {{RULES_FILE}} if anything here should stick. {{RESTART}}, then enter `continue <project>`", with `<project>` being the project root's folder name (e.g. `continue myapp`). Once context is large (past compaction or long tool output), say it first, not last.
- `continue <project>` at session start: find that project's root, read its `.claude/HANDOFF.md` before anything else, and resume from its next step. Same for any session start where `.claude/HANDOFF.md` exists.{{BARE_CONTINUE}}
- When the handoff's whole goal is done and no next step remains, delete HANDOFF.md instead of rewriting it; lasting open items go to `.claude/TODO.md`.
- TODO.md is the project backlog; HANDOFF.md is the one task in flight.
- Several tasks at once in one project: give each its own `.claude/HANDOFF-<task>.md`, and name it when you hand off.

## Per-project to-do list
`.claude/TODO.md` in a project root is the to-do list: plain markdown, directly editable.

When working in a directory, assess whether it's an actual ongoing project (has markers like `.git`, `Cargo.toml`, `package.json`, an existing `.claude/` dir, or is clearly a multi-session effort with real outstanding work) versus a one-off task (a quick question, a single script, scratch work). Only for the former: if `.claude/TODO.md` doesn't exist yet, create it and populate it with real outstanding work from the conversation or codebase. Don't create it for one-off things.

Keep it useful: concrete open items, not a restated changelog. Update it as work progresses within a session so the next session starts accurate.{{TODO_START}}
