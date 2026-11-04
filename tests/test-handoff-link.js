// Fast checks for handoff-link.js: node tests/test-handoff-link.js. Runs it as a real process against temp transcripts.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-link-'));
const script = path.join(__dirname, '..', 'hooks', 'handoff-link.js');
let failed = 0;

function check(name, ok, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failed++;
}

function run(input, pid = '111') {
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  if (pid) env.CLAUDE_PID = pid;
  else delete env.CLAUDE_PID;
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(input), env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

const handoff = (name) => {
  const file = path.join(home, name, '.claude', 'HANDOFF.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  return file;
};

let n = 0;
function transcript(...tools) {  // lines shaped like a real transcript
  const file = path.join(home, `t${n++}.jsonl`);
  fs.writeFileSync(file, tools.map(([name, p]) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name, input: { file_path: p, content: 'text' } }] } })).join('\n') + '\n');
  return file;
}

const clearFrom = (t, pid) => run({ hook_event_name: 'SessionEnd', reason: 'clear', transcript_path: t }, pid);
const afterClear = (pid) => run({ hook_event_name: 'SessionStart', source: 'clear', transcript_path: 'none' }, pid);
const named = (out, file) => Boolean(out) && out.hookSpecificOutput.additionalContext.includes(file) && out.systemMessage.includes(file);

const a = handoff('a'), b = handoff('b');
const worktree = path.join(home, 'a', '.claude', 'worktrees', 'task', '.claude', 'HANDOFF-rescues.md');
fs.mkdirSync(path.dirname(worktree), { recursive: true });
fs.writeFileSync(worktree, 'x');

clearFrom(transcript(['Write', a]));
check('after /clear the new session is told the handoff the old one wrote', named(afterClear(), a));
clearFrom(transcript(['Write', a], ['Read', b]));
check('one it wrote beats one it only read later', named(afterClear(), a));
clearFrom(transcript(['Write', a], ['Edit', b]));
check('the last one written wins', named(afterClear(), b));
clearFrom(transcript(['Read', a]));
check('a session that only read one is on that one', named(afterClear(), a));
clearFrom(transcript(['Write', worktree]));
check('a worktree handoff with a suffix counts', named(afterClear(), worktree));

clearFrom(transcript(['Write', a]));
clearFrom(transcript(['Read', path.join(home, 'notes.md')]));
check('a second /clear with no handoff touched keeps the one it had', named(afterClear(), a));

clearFrom(transcript(['Write', a]), '222');
check("another process doesn't get this one's handoff", !named(afterClear('333'), a));

clearFrom(transcript(['Write', a]), '444');
run({ hook_event_name: 'SessionStart', source: 'startup', transcript_path: 'none' }, '444');
check('a reused pid starts with nothing', afterClear('444') === null);

const gone = handoff('gone');
clearFrom(transcript(['Write', gone]), '555');
fs.rmSync(gone);
check('a handoff deleted because the goal is done is not offered', afterClear('555') === null);

check('no handoff in the transcript, nothing to say', run({ hook_event_name: 'SessionStart', source: 'resume', transcript_path: transcript(['Write', path.join(home, 'HANDOFFS', 'x.txt')]) }, '666') === null);
check('a resume is told the handoff from its own transcript', named(run({ hook_event_name: 'SessionStart', source: 'resume', transcript_path: transcript(['Write', a]) }, '777'), a));
check('and carries it through its next /clear', named(afterClear('777'), a));
check('a transcript that was never written is fine', run({ hook_event_name: 'SessionEnd', reason: 'clear', transcript_path: path.join(home, 'nope.jsonl') }, '888') === null && afterClear('888') === null);
check('compaction says nothing', run({ hook_event_name: 'SessionStart', source: 'compact', transcript_path: transcript(['Write', a]) }, '999') === null);

clearFrom(transcript(['Write', a]), null);
check('no process id, no shared link', afterClear(null) === null && !fs.existsSync(path.join(home, '.claude', 'handoff-links', 'undefined.txt')));

fs.rmSync(home, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
