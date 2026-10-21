// Bundles index.html + all ES modules into one self-contained page (naval.html) that opens directly
// from disk (file://) without a server:
//   npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_TAG = '<script type="module" src="js/main.js"></script>';
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!page.includes(SCRIPT_TAG)) throw new Error('index.html: script tag not found');

const result = await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, legalComments: 'none',
  // the offline trailer director is only used by tools/trailer, not shipped in the single-file page
  external: ['./trailer.js', './trailerScenes.js', './trailerScenes020.js'],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// the balance file (config/balance.json) goes into the page: a page opened from disk cannot read it
const balance = fs.readFileSync(path.join(root, 'config/balance.json'), 'utf8');
JSON.parse(balance);
const balanceTag = `<script>window.__BALANCE_FILE = ${balance.replace(/<\/script/gi, '<\\/script')};</script>`;
const minPage = page
  .replace(SCRIPT_TAG, () => `${balanceTag}<script type="module">${js}</script>`)
  .replace(/<style>([\s\S]*?)<\/style>/, (_, css) => `<style>${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/ ?([{}:;,>]) ?/g, '$1').trim()}</style>`);
fs.writeFileSync(path.join(root, 'naval.html'), minPage);
console.log('wrote naval.html', (minPage.length / 1024).toFixed(0) + ' KB');
