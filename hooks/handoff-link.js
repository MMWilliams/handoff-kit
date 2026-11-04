// Makes a bare `continue` find the right handoff after /clear or a resume, whatever folder the session runs in.
//
// /clear gives a session a new id and an empty transcript, so nothing inside the new one says what it was working on.
// The process stays, so the link is kept per CLAUDE_PID: SessionEnd(clear) stores the handoff the old transcript last
// touched, SessionStart(clear) tells the new session. A session that touched none keeps the one it inherited.
const fs = require('fs');
const os = require('os');
const path = require('path');

const pid = process.env.CLAUDE_PID;  // undocumented: without it, every session would share one link
const hook = JSON.parse(fs.readFileSync(0, 'utf8'));
const links = path.join(os.homedir(), '.claude', 'handoff-links');
const link = path.join(links, `${pid}.txt`);
const TOOL = /"name":"(Write|Edit|Read)","input":\{"file_path":"([^"]*(?:\\\\|\/)HANDOFF[^"\\/]*\.md)"/g;

// A session can read several handoffs for reference, but the one it writes is the one it's on.
function lastHandoff(transcript) {
  if (!fs.existsSync(transcript)) return null;
  let written = null, read = null;
  for (const [, tool, raw] of fs.readFileSync(transcript, 'utf8').matchAll(TOOL)) {
    const file = JSON.parse(`"${raw}"`);
    if (tool === 'Read') read = file;
    else written = file;
  }
  return written || read;
}

function remember(file) {
  if (file) {
    fs.mkdirSync(links, { recursive: true });
    fs.writeFileSync(link, file);
  } else {
    fs.rmSync(link, { force: true });
  }
}

function currentHandoff() {
  if (hook.hook_event_name === 'SessionEnd') {
    if (hook.reason === 'clear') {
      const file = lastHandoff(hook.transcript_path);
      if (file) remember(file);
    }
    return null;
  }
  if (hook.source === 'startup') {
    remember(null);  // pids get reused: never inherit from a dead process
    return null;
  }
  if (hook.source === 'resume') {
    const file = lastHandoff(hook.transcript_path);
    remember(file);
    return file;
  }
  return hook.source === 'clear' && fs.existsSync(link) ? fs.readFileSync(link, 'utf8') : null;
}

const file = pid ? currentHandoff() : null;
if (file && fs.existsSync(file)) {
  console.log(JSON.stringify({
    systemMessage: `continue resumes ${file}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `This session's handoff file is ${file}. If the user says \`continue\` with no project name, or names this project, read that file before anything else and resume from its next step. A different project name means that project's handoff instead.`,
    },
  }));
}
