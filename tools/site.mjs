// Assemble the files of the published site into _site/:   node tools/site.mjs
//   index.html   the game as one minified page (naval.html: one request instead of a hundred modules)
//   wiki.html, viewer.html and js/   the wiki and the 3D viewer load their ES modules from js/
// Nothing else is needed: the simulation and the rendering run in the visitor's browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const need = (f) => { if (!fs.existsSync(path.join(root, f))) throw new Error(f + ' is missing (run npm run build first)'); };
for (const f of ['naval.html', 'wiki.html', 'viewer.html', 'js']) need(f);

fs.copyFileSync(path.join(root, 'naval.html'), path.join(out, 'index.html'));
for (const f of ['wiki.html', 'viewer.html']) fs.copyFileSync(path.join(root, f), path.join(out, f));
// the offline trailer director is not part of the page (see build.mjs)
fs.cpSync(path.join(root, 'js'), path.join(out, 'js'), { recursive: true, filter: (src) => !/[\\/]trailer[^\\/]*\.js$/.test(src) });
fs.writeFileSync(path.join(out, '.nojekyll'), '');

let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(out);
console.log(`_site: ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
