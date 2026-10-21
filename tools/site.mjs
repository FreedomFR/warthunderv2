// Assemble the files of the published site into _site/:
//   node tools/site.mjs                                  this checkout, at the root of the site
//   node tools/site.mjs --main <dir> --dev <dir> [--out <dir>]   two checkouts: `main` at the root, `dev` in /dev/ (what the Pages workflow does)
// Each version is: index.html (the game as one minified page, naval.html, built and committed with the code), wiki.html and viewer.html when the
// checkout has them, and js/ for the wiki and the viewer. The simulation and the rendering run in the visitor's browser: no server is needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? path.resolve(process.argv[i + 1]) : null; };
const out = arg('out') || path.join(root, '_site');
const BADGE = '<div style="position:fixed;left:8px;bottom:8px;z-index:99999;background:#b45309;color:#fff;font:600 11px system-ui,sans-serif;padding:3px 8px;border-radius:4px;pointer-events:none;opacity:.85">Version dev</div>';

/** Copy one version of the project into `dest`; `badge` marks the pages as the development version. */
function assemble(src, dest, badge) {
  if (!fs.existsSync(path.join(src, 'naval.html'))) throw new Error(src + '/naval.html is missing (run npm run build there)');
  fs.mkdirSync(dest, { recursive: true });
  const page = (from, to) => {
    let html = fs.readFileSync(path.join(src, from), 'utf8');
    if (badge) { const i = html.lastIndexOf('</body>'); html = i >= 0 ? html.slice(0, i) + BADGE + html.slice(i) : html + BADGE; }
    fs.writeFileSync(path.join(dest, to), html);
  };
  page('naval.html', 'index.html');
  for (const f of ['wiki.html', 'viewer.html']) if (fs.existsSync(path.join(src, f))) page(f, f);
  // what lets a phone install the game as an app (full screen, landscape)
  for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png']) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  // the clip of the first screen (the page plays it while the engine, the models and the sounds load)
  for (const f of ['loading.mp4', 'loading-poster.jpg']) if (fs.existsSync(path.join(src, 'docs', f))) { fs.mkdirSync(path.join(dest, 'docs'), { recursive: true }); fs.copyFileSync(path.join(src, 'docs', f), path.join(dest, 'docs', f)); }
  // the balance file, for reference (naval.html carries its values: see build.mjs)
  if (fs.existsSync(path.join(src, 'config'))) fs.cpSync(path.join(src, 'config'), path.join(dest, 'config'), { recursive: true });
  // the offline trailer director is not part of the page (see build.mjs)
  fs.cpSync(path.join(src, 'js'), path.join(dest, 'js'), { recursive: true, filter: (p) => !/[\\/]trailer[^\\/]*\.js$/.test(p) });
}

fs.rmSync(out, { recursive: true, force: true });
const mainDir = arg('main'), devDir = arg('dev');
if (mainDir || devDir) {
  if (mainDir) assemble(mainDir, out, false);
  if (devDir) assemble(devDir, mainDir ? path.join(out, 'dev') : out, true);
} else assemble(root, out, false);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(out);
console.log(`${out}: ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
