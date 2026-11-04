#!/usr/bin/env node
// Sets up the handoff habit for this user: `node install.js`, or `node install.js --only claude,jetski`.
// Safe to run again after a `git pull`. The hooks run from this clone, so keep the folder where it is.
const fs = require('fs');
const os = require('os');
const path = require('path');

const KIT = __dirname;
const HOME = os.homedir();
const START = '<!-- handoff-kit:start -->';
const END = '<!-- handoff-kit:end -->';

const TARGETS = {
  claude: {
    rules: path.join(HOME, '.claude', 'CLAUDE.md'),
    RESTART: 'Run `/clear`',
    BARE_CONTINUE: ' After `/clear` or a resume, a bare `continue` uses the handoff the session start hook names; keep the `<project>` in the nudge anyway, it works from any session.',
    TODO_START: ' The hooks reload it into every new session and remind you when it goes stale.',
  },
  jetski: {
    rules: path.join(HOME, '.gemini', 'GEMINI.md'),
    RESTART: 'Start a new conversation',
    BARE_CONTINUE: ' With no project name, `continue` means the `.claude/HANDOFF.md` of the current workspace.',
    TODO_START: ' At session start, if `.claude/TODO.md` exists, read it too.',
  },
  codex: {
    rules: path.join(HOME, '.codex', 'AGENTS.md'),
    RESTART: 'Start a new session',
    BARE_CONTINUE: ' With no project name, `continue` means the `.claude/HANDOFF.md` of the current workspace.',
    TODO_START: ' At session start, if `.claude/TODO.md` exists, read it too.',
  },
};

function rulesFor(target) {
  const text = fs.readFileSync(path.join(KIT, 'instructions', 'rules.md'), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const values = { ...target, RULES_FILE: path.basename(target.rules) };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
}

// Replaces this kit's block in place, or adds it to the end. Anything else in the file stays as it is.
function installRules(name, target) {
  fs.mkdirSync(path.dirname(target.rules), { recursive: true });
  const had = fs.existsSync(target.rules) ? fs.readFileSync(target.rules, 'utf8') : '';
  const block = `${START}\n${rulesFor(target)}\n${END}`;
  const a = had.indexOf(START);
  const b = had.indexOf(END);
  if (a === -1 && /^## Handoff habit/m.test(had)) {
    console.log(`${name}: ${target.rules} already has its own handoff rules, left alone`);
    return;
  }
  const next = a !== -1 && b > a
    ? had.slice(0, a) + block + had.slice(b + END.length)
    : `${had}${had && !had.endsWith('\n') ? '\n' : ''}${had ? '\n' : ''}${block}\n`;
  if (next !== had) fs.writeFileSync(target.rules, next);
  console.log(`${name}: rules in ${target.rules}`);
}

function hook(script, ...args) {
  return { type: 'command', command: 'node', args: [path.join(KIT, 'hooks', script), ...args], timeout: 10 };
}

const WIRING = [
  ['SessionStart', null, hook('todo-activity.js', 'start')],
  ['SessionStart', null, hook('handoff-link.js')],
  ['SessionEnd', 'clear', hook('handoff-link.js')],
  ['UserPromptSubmit', null, hook('todo-activity.js', 'prompt')],
  ['Stop', null, hook('todo-activity.js', 'stop')],
];
const OURS = /[\\/](handoff-link\.js|todo-activity\.js|session-todo-reload\.ps1|record-activity\.ps1|record-response-end\.ps1)/;

function isOurs(h) {
  return OURS.test([h.command, ...(h.args || [])].join(' '));
}

// Merged into whatever's there: this kit's hooks are replaced, everything else is kept. A settings file that won't parse
// stops the install rather than being overwritten.
function installHooks() {
  const file = path.join(HOME, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const had = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  let settings;
  try {
    settings = had === null ? {} : JSON.parse(had.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`${file} isn't valid JSON, so nothing was changed there: ${e.message}`);
  }
  const hooks = settings.hooks || {};
  for (const event of Object.keys(hooks)) {
    hooks[event] = hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((group) => group.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  const added = new Map();
  for (const [event, matcher, h] of WIRING) {
    const key = `${event}|${matcher}`;
    if (!added.has(key)) {
      added.set(key, { ...(matcher ? { matcher } : {}), hooks: [] });
      (hooks[event] ||= []).push(added.get(key));
    }
    added.get(key).hooks.push(h);
  }
  settings.hooks = hooks;
  const next = `${JSON.stringify(settings, null, 2)}\n`;
  if (next !== had) {
    if (had !== null) fs.writeFileSync(`${file}.before-handoff-kit`, had);
    fs.writeFileSync(file, next);
  }
  console.log(`claude: hooks in ${file}`);
}

function main() {
  const flag = process.argv.indexOf('--only');
  const names = flag === -1 ? Object.keys(TARGETS).filter((n) => n !== 'codex' || fs.existsSync(path.join(HOME, '.codex'))) : process.argv[flag + 1].split(',');
  for (const name of names) {
    if (!TARGETS[name]) throw new Error(`unknown target ${name}: use ${Object.keys(TARGETS).join(', ')}`);
    installRules(name, TARGETS[name]);
    if (name === 'claude') installHooks();
  }
  console.log('Done. Open a new session to pick it up.');
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
