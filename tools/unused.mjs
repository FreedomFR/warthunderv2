// Exports that nothing imports: node tools/unused.mjs   (the candidates for dead code: check each before removing it; a name only used inside its own file is listed
// separately, it does not need to be exported). Looks at js/, tools/ and test/ by name, so a name that is also a local variable elsewhere counts as used.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMap } from './codemap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', 'out', 'refs', '_site'].includes(e.name)) walk(p); } else if (/\.(m?js|html)$/.test(e.name) && e.name !== 'naval.html') all.push(p); } })(root);
const text = new Map(all.map((f) => [path.relative(root, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')]));
const word = (n) => new RegExp('(?<![\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
const dead = [], inner = [];
for (const f of buildMap()) {
  for (const n of f.exports) {
    const re = word(n);
    let outside = 0, own = 0;
    for (const [p, src] of text) { const c = (src.match(re) || []).length; if (p === f.path) own = c; else outside += c; }
    if (!outside) (own > 1 ? inner : dead).push(`${f.path}: ${n}`);
  }
}
console.log(`${dead.length} exports used nowhere, not even in their own file:\n  ` + dead.join('\n  '));
console.log(`\n${inner.length} exports used only inside their own file (the export can go):\n  ` + inner.join('\n  '));
