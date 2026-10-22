// The map of the code, generated: docs/CODEMAP.md lists every file of js/ (what it is, how long, what it exports, how many files use it) and the scripts of tools/ and test/.
//   node tools/codemap.mjs          writes docs/CODEMAP.md        node tools/codemap.mjs --check   exits 1 when it is out of date (test/codemap.mjs)
//   node tools/codemap.mjs --find word   the files whose name, purpose or exports contain the word (a quick "where is it")
// The purpose of a file is the first comment of the file: keep it up to date when the file changes its job.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, ext, out); } else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out.sort();
}

/** The first comment of a file, as one line of at most 170 characters (null when the file does not start with one). */
export function purposeOf(src) {
  const lines = src.split('\n');
  let i = 0;
  if (lines[0].startsWith('#!')) i++;
  const got = [];
  if (lines[i] && lines[i].trim().startsWith('/*')) {
    for (; i < lines.length; i++) { got.push(lines[i].replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '')); if (lines[i].includes('*/')) break; }
  } else {
    for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) got.push(lines[i].replace(/^\s*\/\/+\s?/, ''));
  }
  const text = got.map((l) => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // the first sentence (a colon is not the end of one: what follows it is what the file is)
  const m = /^(.{40,}?[.;])(\s|$)/.exec(text);
  const one = (m ? m[1] : text).replace(/:$/, '');
  return one.length > 170 ? one.slice(0, 167).replace(/\s+\S*$/, '') + '…' : one;
}

export function exportsOf(src) {
  const out = [];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const x = n.trim().split(/\s+as\s+/).pop(); if (x) out.push(x); }
  return out;
}

function importsOf(src, file) {
  const out = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^import\s+['"](\.[^'"]+)['"]/gm)) {
    const spec = m[1] || m[2] || m[3];
    out.push(rel(path.resolve(path.dirname(file), spec)));
  }
  return out;
}

export function buildMap() {
  const files = walk(path.join(root, 'js'), ['.js']).map((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return { path: rel(f), lines: src.split('\n').length - 1, purpose: purposeOf(src), exports: exportsOf(src), imports: importsOf(src, f) };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));
  // who uses whom (js/ files, the tools and the tests count: a file only a test uses is still used)
  const users = new Map();
  const scan = [...files.map((f) => f.path), ...walk(path.join(root, 'tools'), ['.mjs']).map(rel), ...walk(path.join(root, 'test'), ['.mjs']).map(rel)];
  for (const p of scan) {
    const f = path.join(root, p), src = fs.readFileSync(f, 'utf8');
    for (const target of importsOf(src, f)) { if (byPath.has(target)) (users.get(target) || users.set(target, new Set()).get(target)).add(p); }
  }
  for (const f of files) f.usedBy = users.has(f.path) ? users.get(f.path).size : 0;
  return files;
}

function scripts(dir) {
  return walk(path.join(root, dir), ['.mjs']).filter((f) => !path.basename(f).startsWith('_')).map((f) => ({ path: rel(f), purpose: purposeOf(fs.readFileSync(f, 'utf8')) }));
}

export function render() {
  const files = buildMap();
  const L = [];
  L.push('# Plan du code');
  L.push('');
  L.push('Généré par `node tools/codemap.mjs` (`npm run map`) : ne pas modifier à la main ; `test/codemap.mjs` vérifie qu\'il est à jour. Chaque ligne : le fichier (nombre de lignes), ce qu\'il fait (son premier commentaire),');
  L.push('ce qu\'il exporte, et le nombre de fichiers (js, tools, test) qui l\'importent (← n ; 0 = point d\'entrée, ou code mort à vérifier). Pour trouver un sujet : `node tools/codemap.mjs --find mot`.');
  L.push('');
  const dirs = new Map();
  for (const f of files) { const d = path.posix.dirname(f.path); (dirs.get(d) || dirs.set(d, []).get(d)).push(f); }
  for (const [d, fs_] of dirs) {
    L.push(`## ${d}/`);
    L.push('');
    for (const f of fs_) {
      const ex = f.exports.length ? ' [' + (f.exports.length > 9 ? f.exports.slice(0, 9).join(', ') + ', … +' + (f.exports.length - 9) : f.exports.join(', ')) + ']' : '';
      L.push(`- \`${path.posix.basename(f.path)}\` (${f.lines}) ${f.purpose || '**sans commentaire d\'en-tête**'}${ex} ← ${f.usedBy}`);
    }
    L.push('');
  }
  for (const [d, title] of [['tools', 'Outils (node tools/<nom>.mjs)'], ['test', 'Tests (liste et durées : node tools/runtests.mjs --list)']]) {
    L.push(`## ${title}`);
    L.push('');
    for (const s of scripts(d)) L.push(`- \`${path.posix.basename(s.path)}\` ${s.purpose || '**sans commentaire d\'en-tête**'}`);
    L.push('');
  }
  return L.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(root, 'docs/CODEMAP.md');
  const a = process.argv.slice(2);
  if (a[0] === '--find') {
    const w = (a[1] || '').toLowerCase();
    for (const f of buildMap()) if ((f.path + ' ' + (f.purpose || '') + ' ' + f.exports.join(' ')).toLowerCase().includes(w)) console.log(`${f.path} (${f.lines}) ${f.purpose || ''}${f.exports.length ? ' [' + f.exports.slice(0, 8).join(', ') + ']' : ''}`);
  } else if (a[0] === '--check') {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (cur !== render()) { console.error('docs/CODEMAP.md is out of date: run `npm run map`'); process.exit(1); }
    console.log('docs/CODEMAP.md is up to date');
  } else {
    fs.writeFileSync(out, render());
    const files = buildMap(), bare = files.filter((f) => !f.purpose);
    console.log(`docs/CODEMAP.md: ${files.length} files of js/, ${bare.length} without a header comment${bare.length ? ': ' + bare.map((f) => f.path).join(', ') : ''}`);
  }
}
