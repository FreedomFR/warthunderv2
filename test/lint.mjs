// ESLint over the code (no-undef and the like: names that do not exist in paths the tests do not run): node test/lint.mjs — skipped when eslint is not installed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const bin = new URL('../node_modules/.bin/eslint', import.meta.url).pathname;
if (!fs.existsSync(bin)) console.log('PASS eslint is not installed (npm install): lint skipped');
else {
  const r = spawnSync(bin, ['-f', 'json', 'js', 'tools', 'test', 'build.mjs', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 64 << 20 });
  let files = [];
  try { files = JSON.parse(r.stdout); } catch (e) { /* the linter did not run */ }
  const msgs = files.flatMap((f) => f.messages.map((m) => ({ ...m, file: f.filePath })));
  const errors = msgs.filter((m) => m.severity === 2), warnings = msgs.filter((m) => m.severity === 1);
  for (const e of errors.slice(0, 20)) console.log(`   ${e.file.split('/warthunderv2/').pop()}:${e.line}  ${e.message} (${e.ruleId})`);
  ok(files.length > 100 && errors.length === 0, `eslint: ${files.length} files, no error (${warnings.length} warnings: unused names, see \`npm run lint\`)`);
}
