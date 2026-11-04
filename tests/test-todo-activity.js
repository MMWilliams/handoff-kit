// node tests/test-todo-activity.js. Runs the hook as a real process against a temp project.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, '..', 'hooks', 'todo-activity.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-activity-'));
let failed = 0;

function check(name, ok, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failed++;
}

function run(mode, cwd, input) {
  const r = spawnSync(process.execPath, [script, mode], { input: input ?? JSON.stringify({ cwd }), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

const project = path.join(root, 'project');
const dot = path.join(project, '.claude');
const todo = path.join(dot, 'TODO.md');
const activity = path.join(dot, 'activity.json');
const state = () => JSON.parse(fs.readFileSync(activity, 'utf8'));
const write = (s) => fs.writeFileSync(activity, JSON.stringify(s));
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

const bare = path.join(root, 'bare');
fs.mkdirSync(bare);
check('a folder with no TODO.md gets nothing', run('start', bare) === null && run('prompt', bare) === null && run('stop', bare) === null);
check('and no activity file', !fs.existsSync(path.join(bare, '.claude')));

fs.mkdirSync(dot, { recursive: true });
fs.writeFileSync(todo, '- [ ] ship it\n');
let out = run('start', project);
check('session start reloads the list', out.hookSpecificOutput.hookEventName === 'SessionStart' && out.hookSpecificOutput.additionalContext.includes('- [ ] ship it'));
check('and starts the activity file', Boolean(state().last_response_at));
check('no idle notice on a new project', out.systemMessage === undefined);

fs.writeFileSync(todo, '  \n');
check('an empty list says nothing', run('start', project) === null);
fs.writeFileSync(todo, '- [ ] ship it\n');

write({ last_response_at: hoursAgo(3), last_prompt_at: hoursAgo(4), last_notice_activity_at: null, last_todo_reminder_mtime: null });
out = run('start', project);
check('three idle hours brings the notice', /idle for about 3 hour/.test(out.systemMessage || ''), out.systemMessage);
check('once for that idle stretch', run('start', project).systemMessage === undefined);
write({ last_prompt_at: hoursAgo(2), last_notice_activity_at: null });
check('an older state file falls back to the last prompt', /idle for about 2 hour/.test(run('start', project).systemMessage || ''));
write({ last_response_at: hoursAgo(0.5), last_notice_activity_at: null });
check('half an hour is not idle', run('start', project).systemMessage === undefined);
fs.writeFileSync(activity, '{broken');
check('a broken activity file still reloads the list', run('start', project).hookSpecificOutput.additionalContext.includes('ship it'));

fs.rmSync(activity);
run('prompt', project);
const stamped = state().last_prompt_at;
check('a prompt stamps the time', Boolean(stamped));
run('stop', project);
check('a stop stamps the end and keeps the rest', Boolean(state().last_response_at) && state().last_prompt_at === stamped);

const old = new Date(Date.now() - 45 * 60000);
fs.utimesSync(todo, old, old);
out = run('prompt', project);
check('45 minutes unedited brings the reminder', /about 45 minutes/.test(out?.hookSpecificOutput?.additionalContext || '') && out.hookSpecificOutput.hookEventName === 'UserPromptSubmit');
check('once per edit', run('prompt', project) === null);
fs.writeFileSync(todo, '- [ ] ship it again\n');
check('a fresh edit is quiet', run('prompt', project) === null);
const older = new Date(Date.now() - 31 * 60000);
fs.utimesSync(todo, older, older);
check('and a new stale stretch reminds again', run('prompt', project) !== null);

check('bad input never breaks a session', run('start', project, 'not json') === null);

fs.rmSync(root, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
