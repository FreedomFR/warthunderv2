// Runs the tests of test/ in parallel (each is a script of its own: node test/<name>.mjs) and tells which failed:
//   node tools/runtests.mjs                 every test of test/tests.json on a few processes (what `npm test` does)
//   node tools/runtests.mjs --fast          without the slow ones (a minute or so): what to run after every change
//   node tools/runtests.mjs --only audio,ui the named tests (with or without .mjs)
//   node tools/runtests.mjs --jobs 4        how many at once (default: half the cores, at most 8)
//   node tools/runtests.mjs --serial        one at a time, as the old `npm test` chain did
//   node tools/runtests.mjs --list          the tests and the time each took last time
//   node tools/runtests.mjs --verbose       the output of the tests that passed too
// A test passes when its process exits with 0 and prints no line that starts with FAIL. The times of the last run are kept in out/test-times.json (not committed), the
// slowest tests are started first so that the run is as short as it can be.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'test/tests.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = (k) => args.includes('--' + k);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const timesFile = path.join(root, 'out/test-times.json');
let times = {};
try { times = JSON.parse(fs.readFileSync(timesFile, 'utf8')); } catch (e) { /* first run */ }

// every file of test/ must be in the manifest (a test nobody runs is no test) and every entry must exist
{
  const listed = new Set([...manifest.tests.map((t) => t.file), ...(manifest.tools || [])]);
  const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.mjs'));
  const orphan = files.filter((f) => !listed.has(f)), missing = [...listed].filter((f) => !files.includes(f));
  if (orphan.length || missing.length) {
    if (orphan.length) console.error('not in test/tests.json (add it to "tests", or to "tools" if it is a script and not a test): ' + orphan.join(', '));
    if (missing.length) console.error('in test/tests.json but not in test/: ' + missing.join(', '));
    process.exit(2);
  }
}
let list = manifest.tests.map((t) => ({ ...t, name: t.file.replace(/\.mjs$/, '') }));
const only = opt('only');
if (only) { const want = new Set(only.split(',').map((x) => x.replace(/\.mjs$/, ''))); list = list.filter((t) => want.has(t.name)); }
else if (flag('fast')) list = list.filter((t) => !t.slow);
if (flag('list')) {
  for (const t of list) console.log(`${t.name.padEnd(14)} ${t.args.join(' ').padEnd(8)} ${t.slow ? 'slow' : '    '} ${times[t.name] ? times[t.name].toFixed(1).padStart(6) + ' s' : ''}`);
  process.exit(0);
}
if (!list.length) { console.log('no test selected'); process.exit(1); }

const jobs = flag('serial') ? 1 : Math.max(1, Number(opt('jobs')) || Math.min(8, Math.floor(os.cpus().length / 2)));
list.sort((a, b) => (times[b.name] || 30) - (times[a.name] || 30));          // the longest first
const t0 = Date.now();
let next = 0, running = 0, pass = 0, fail = 0;
const results = [];

function run(t) {
  return new Promise((resolve) => {
    const start = Date.now(), out = [];
    const p = spawn(process.execPath, [path.join(root, 'test', t.file), ...t.args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => out.push(d));
    p.on('close', (code) => {
      const text = Buffer.concat(out).toString();
      const lines = text.split('\n');
      const nPass = lines.filter((l) => l.startsWith('PASS')).length, bad = lines.filter((l) => l.startsWith('FAIL'));
      const secs = (Date.now() - start) / 1000;
      resolve({ t, code, secs, nPass, bad, text, ok: code === 0 && bad.length === 0 });
    });
  });
}

await new Promise((done) => {
  const pump = () => {
    while (running < jobs && next < list.length) {
      const t = list[next++];
      running++;
      run(t).then((r) => {
        running--;
        results.push(r);
        times[t.name] = r.secs;
        if (r.ok) { pass++; console.log(`  ok   ${t.name.padEnd(14)} ${r.secs.toFixed(1).padStart(6)} s  ${r.nPass} checks`); if (flag('verbose')) console.log(r.text); }
        else {
          fail++;
          console.log(`  FAIL ${t.name.padEnd(14)} ${r.secs.toFixed(1).padStart(6)} s  (exit ${r.code})`);
          // what failed: the FAIL lines, or the end of the output when the script died before printing any
          const shown = r.bad.length ? r.bad : r.text.trim().split('\n').slice(-12);
          for (const l of shown.slice(0, 20)) console.log('       ' + l);
        }
        if (next >= list.length && running === 0) done(); else pump();
      });
    }
  };
  pump();
});

try { fs.mkdirSync(path.dirname(timesFile), { recursive: true }); fs.writeFileSync(timesFile, JSON.stringify(times, null, 1)); } catch (e) { /* out/ not writable: no times kept */ }
const checks = results.reduce((s, r) => s + r.nPass, 0), wall = (Date.now() - t0) / 1000, cpu = results.reduce((s, r) => s + r.secs, 0);
const slowest = results.slice().sort((a, b) => b.secs - a.secs).slice(0, 3).map((r) => `${r.t.name} ${r.secs.toFixed(0)} s`).join(', ');
console.log(`\n${fail ? 'FAILED' : 'all passed'}: ${pass} of ${list.length} tests, ${checks} checks, ${wall.toFixed(0)} s on ${jobs} processes (${cpu.toFixed(0)} s of work; slowest: ${slowest})`);
process.exit(fail ? 1 : 0);
