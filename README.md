# handoff-kit

Long agent sessions get slow, expensive and forgetful. This keeps each one short: after every request the agent writes where things stand to a file, you clear the session, and one word picks the work back up.

Works with Claude Code and Jetski (the Antigravity CLI, `agy`), and with Codex if it's installed. They all share the same file, so one can pick up where another stopped.

## Set up

You need Git and Node.

```
git clone https://github.com/MMWilliams/handoff-kit.git
cd handoff-kit
node install.js
```

Then open a new session. Keep the folder where you cloned it, because the hooks run from there. To update, `git pull` and run `node install.js` again.

`node install.js --only claude,jetski` picks which agents to set up. Codex is included automatically when `~/.codex` exists.

## How you use it

1. Ask for something. When the agent finishes, its reply ends with:
   > Update CLAUDE.md if anything here should stick. Run `/clear`, then enter `continue myapp`
2. Run `/clear`.
3. Enter `continue myapp`, or just `continue` in Claude Code. The new session reads the handoff and carries on from its next step.

## What the agent writes

`.claude/HANDOFF.md` in the project root, overwritten each time because it's current state, not a log:

1. **Goal:** what "done" means.
2. **Files changed:** paths, one line each.
3. **Decisions and why.**
4. **Approaches that failed and why,** so the next session doesn't retry them.
5. **The exact next step:** a concrete action, not "continue".
6. **The test command** that proves the work is done, and its current result.

When the goal is done, the file gets deleted, and anything still open moves to `.claude/TODO.md`. That's the project's backlog; the handoff is the one task in flight.

Running several tasks in one project? Each gets its own `.claude/HANDOFF-<task>.md`.

## What the installer changes

| File | Change |
|---|---|
| `~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md` | Adds the rules from `instructions/rules.md` between two marker comments. Everything else stays. If a file already has its own `## Handoff habit`, it's left alone and the installer tells you. |
| `~/.claude/settings.json` | Adds the hooks below and keeps your other settings. The previous version is saved as `settings.json.before-handoff-kit`. |

Running it again is safe. It won't touch a settings file it can't parse.

## The hooks (Claude Code only)

- **`hooks/handoff-link.js`** is what makes a bare `continue` work. `/clear` gives a session a new id and an empty transcript, so nothing in the new one says what it was doing. The process survives, though, so this stores the handoff per process and tells the new session which one it's on. It also works after a resume, whatever folder the session runs in.
- **`hooks/todo-activity.js`** reloads `.claude/TODO.md` into every new session, suggests `/clear` once after an hour idle, and reminds the agent when the list goes 30 minutes without an edit while you're still working. It does nothing in a folder with no `.claude/TODO.md`.

Jetski and Codex don't get hooks. There it runs on the written rules alone, so say `continue myapp` with the project name, or `continue` from inside the project.

## Limits

- `handoff-link.js` relies on `CLAUDE_PID`, an environment variable Claude Code doesn't document. If a bare `continue` stops working after an update, that's the first thing to check. `continue <project>` doesn't depend on it.
- The link follows Write, Edit and Read calls, so a handoff changed only by a shell command isn't noticed.
- Agents follow written rules most of the time, not always. If the nudge goes missing, ask for it.

## Tests

```
npm test
```

They run the hooks and the installer as real processes against temp folders, and never touch your own settings.

## License

MIT
