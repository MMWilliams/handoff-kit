// node tests/test-install.js. Runs install.js as a real process against a temp home folder.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const install = path.join(__dirname, '..', 'install.js');
let failed = 0;

function check(name, ok, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);
  if (!ok) failed++;
}

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-kit-'));
}

function run(h, ...args) {
  return spawnSync(process.execPath, [install, ...args], { env: { ...process.env, HOME: h, USERPROFILE: h }, encoding: 'utf8' });
}

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const scripts = (settings) => Object.entries(settings.hooks).flatMap(([event, groups]) => groups.flatMap((g) => g.hooks.map((x) => `${event} ${g.matcher || ''} ${path.basename((x.args || [''])[0])} ${(x.args || []).slice(1).join(' ')}`.replace(/\s+/g, ' ').trim())));

// A new laptop: nothing there yet.
let h = home();
let r = run(h);
check('installs on an empty home', r.status === 0, r.stderr);
const claude = read(h, '.claude', 'CLAUDE.md');
const jetski = read(h, '.gemini', 'GEMINI.md');
check('Claude gets the rules, with its own restart', claude.includes('## Handoff habit') && claude.includes('Update CLAUDE.md if anything') && claude.includes('Run `/clear`'));
check('Jetski gets the rules, with its own', jetski.includes('## Handoff habit') && jetski.includes('Update GEMINI.md if anything') && jetski.includes('Start a new conversation') && !jetski.includes('/clear'));
check('no placeholder survives', !/\{\{/.test(claude + jetski));
check('Codex stays out unless it is there', !fs.existsSync(path.join(h, '.codex')));
let settings = JSON.parse(read(h, '.claude', 'settings.json'));
const expected = ['SessionStart todo-activity.js start', 'SessionStart handoff-link.js', 'SessionEnd clear handoff-link.js', 'UserPromptSubmit todo-activity.js prompt', 'Stop todo-activity.js stop'];
check('every hook is wired', JSON.stringify(scripts(settings).sort()) === JSON.stringify([...expected].sort()), scripts(settings));
check('hooks point at files that exist', Object.values(settings.hooks).flat().flatMap((g) => g.hooks).every((x) => fs.existsSync(x.args[0])));

// Running it again changes nothing.
const once = [read(h, '.claude', 'settings.json'), claude, jetski];
check('a second run is clean', run(h).status === 0);
check('and changes nothing', JSON.stringify([read(h, '.claude', 'settings.json'), read(h, '.claude', 'CLAUDE.md'), read(h, '.gemini', 'GEMINI.md')]) === JSON.stringify(once));

// A laptop that already has its own setup.
h = home();
fs.mkdirSync(path.join(h, '.claude'));
fs.mkdirSync(path.join(h, '.gemini'));
fs.mkdirSync(path.join(h, '.codex'));
fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), '# Mine\nKeep this.');
fs.writeFileSync(path.join(h, '.gemini', 'GEMINI.md'), '# Orchestration\n\n## Handoff habit\nMy own.\n');
const mine = { theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-stop.sh' }] }, { hooks: [{ type: 'command', command: 'powershell -File C:\\x\\record-response-end.ps1' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }] } };
fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify(mine));
r = run(h);
check('installs over an existing setup', r.status === 0, r.stderr);
const kept = read(h, '.claude', 'CLAUDE.md');
check('your own rules stay, in front', kept.startsWith('# Mine\nKeep this.') && kept.includes('## Handoff habit'));
check('rules it already has are left alone, and it says so', read(h, '.gemini', 'GEMINI.md') === '# Orchestration\n\n## Handoff habit\nMy own.\n' && /left alone/.test(r.stdout));
check('Codex joins in when it is there', read(h, '.codex', 'AGENTS.md').includes('Update AGENTS.md if anything'));
settings = JSON.parse(read(h, '.claude', 'settings.json'));
const flat = JSON.stringify(settings);
check('your settings and hooks stay', settings.theme === 'dark' && flat.includes('my-stop.sh') && flat.includes('guard.sh'));
check('an older copy of the same hook is replaced, not doubled', !flat.includes('record-response-end.ps1') && scripts(settings).filter((s) => s === 'Stop todo-activity.js stop').length === 1);
check('and the old settings are backed up', JSON.parse(read(h, '.claude', 'settings.json.before-handoff-kit')).theme === 'dark');

// A changed rule replaces the block in place.
const block = read(h, '.claude', 'CLAUDE.md').replace('Goal: what', 'Old wording:');
fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), `${block}\nAfter the block.\n`);
run(h);
const refreshed = read(h, '.claude', 'CLAUDE.md');
check('a re-run refreshes its block and keeps what is around it', refreshed.includes('Goal: what') && !refreshed.includes('Old wording') && refreshed.includes('After the block.') && refreshed.match(/handoff-kit:start/g).length === 1);

// Settings it can't read.
h = home();
fs.mkdirSync(path.join(h, '.claude'));
fs.writeFileSync(path.join(h, '.claude', 'settings.json'), '{ "broken": ');
r = run(h, '--only', 'claude');
check('broken settings stop it, untouched', r.status === 1 && /valid JSON/.test(r.stderr) && read(h, '.claude', 'settings.json') === '{ "broken": ');

h = home();
r = run(h, '--only', 'jetski');
check('--only does just that one', r.status === 0 && fs.existsSync(path.join(h, '.gemini', 'GEMINI.md')) && !fs.existsSync(path.join(h, '.claude')));
check('an unknown target is an error', run(h, '--only', 'nope').status === 1);

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
