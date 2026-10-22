// The map of the code (docs/CODEMAP.md) is up to date and every file of js/ says what it is: node test/codemap.mjs
import { render, buildMap } from '../tools/codemap.mjs';
import fs from 'node:fs';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const files = buildMap();
const bare = files.filter((f) => !f.purpose);
ok(bare.length === 0, `every file of js/ starts with a comment that says what it is (${files.length} files${bare.length ? '; without: ' + bare.map((f) => f.path).join(', ') : ''})`);
const cur = fs.readFileSync(new URL('../docs/CODEMAP.md', import.meta.url), 'utf8');
ok(cur === render(), 'docs/CODEMAP.md is up to date (if not: npm run map)');
