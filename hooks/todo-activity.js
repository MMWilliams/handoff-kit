// The per-project to-do list and idle notice, one hook with three modes (`start`, `prompt`, `stop`).
// Does nothing unless <cwd>/.claude/TODO.md exists, so throwaway folders never get an activity file.
const fs = require('fs');
const path = require('path');

const IDLE_SECONDS = 3600;
const STALE_MINUTES = 30;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function start(todo, activity) {
  const content = fs.readFileSync(todo, 'utf8');
  if (!content.trim()) return null;
  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Project to-do list (.claude/TODO.md for this project) - reloaded on session start:\n\n${content}`,
    },
  };
  if (!fs.existsSync(activity)) {
    const now = new Date().toISOString();
    writeState(activity, { last_prompt_at: now, last_response_at: now, last_notice_activity_at: null, last_todo_reminder_mtime: null });
    return out;
  }
  const state = readJson(activity);
  // when the last turn finished, or for an older state file, when it started
  const baseline = state && (state.last_response_at || state.last_prompt_at);
  const idle = baseline ? (Date.now() - new Date(baseline).getTime()) / 1000 : NaN;
  if (idle >= IDLE_SECONDS && state.last_notice_activity_at !== baseline) {
    out.systemMessage = `This project has been idle for about ${Math.round(idle / 360) / 10} hour(s) (no activity since the last session). Consider /clear to start fresh -- the to-do list will reload automatically next time.`;
    state.last_notice_activity_at = baseline;
    writeState(activity, state);
  }
  return out;
}

function prompt(todo, activity) {
  const state = readJson(activity) || { last_notice_activity_at: null, last_todo_reminder_mtime: null };
  state.last_prompt_at = new Date().toISOString();
  const modified = fs.statSync(todo).mtime;
  const minutes = (Date.now() - modified.getTime()) / 60000;
  const stamp = modified.toISOString();
  let out = null;
  if (minutes >= STALE_MINUTES && state.last_todo_reminder_mtime !== stamp) {
    state.last_todo_reminder_mtime = stamp;
    out = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `.claude/TODO.md has not been edited in about ${Math.round(minutes)} minutes even though the conversation is continuing. If any items were completed or new work came up, update it now before moving on.`,
      },
    };
  }
  writeState(activity, state);
  return out;
}

function stop(activity) {
  const now = new Date().toISOString();
  const state = readJson(activity) || { last_prompt_at: now, last_notice_activity_at: null, last_todo_reminder_mtime: null };
  state.last_response_at = now;
  writeState(activity, state);
  return null;
}

function writeState(file, state) {
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function main() {
  const hook = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!hook.cwd) return;
  const todo = path.join(hook.cwd, '.claude', 'TODO.md');
  if (!fs.existsSync(todo)) return;
  const activity = path.join(hook.cwd, '.claude', 'activity.json');
  const out = { start: () => start(todo, activity), prompt: () => prompt(todo, activity), stop: () => stop(activity) }[process.argv[2]]();
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
}

// A broken hook must never get in the way of a session.
try {
  main();
} catch {
  process.exitCode = 0;
}
