// The 3D picture of each aircraft of the wiki (wiki/aircraft/<key>.webp, the key with ':' as '_'): the model seen from the front, to the right and a little above, on a black and
// on a white background, which tools/wikishots.py cuts out exactly (the same method as the ships: tools/wikishots.mjs). It is the viewer page that draws them.
//   node tools/wikiplanes.mjs [key,key,...] [outDir=out/wiki] [--w=1800] [--h=1200] [--az=140] [--el=16]     then: python3 tools/wikishots.py out/wiki wiki/aircraft --planes
// With the game served (node server.mjs 8080). On the GPU from WSL: GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/wikiplanes.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
import { AIRCRAFT } from '../js/wiki/data.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const keys = (args[0] ? args[0].split(',') : AIRCRAFT.map((a) => a.key)).filter(Boolean), outDir = args[1] || 'out/wiki';
const W = +(flags.w || 1800), H = +(flags.h || 1200), az = +(flags.az || 140), el = +(flags.el || 16), base = flags.base || 'http://localhost:8080';
fs.mkdirSync(outDir, { recursive: true });
const metaPath = `${outDir}/planes.json`, meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const b = await chromium.launch(launchOptions());
for (const key of keys) {
  const a = AIRCRAFT.find((q) => q.key === key);
  if (!a) { console.log('unknown aircraft', key); continue; }
  const size = Math.max(a.spec.L, a.spec.span);
  const dist = size * 1.55 / (2 * Math.tan(20 * Math.PI / 180));        // fov 40: the aircraft fills about two thirds of the height
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
  await p.goto(`${base}/viewer.html?m=${encodeURIComponent(key)}&offscreen=1&w=${W}&h=${H}&matte=1&bg=0,0,0&oc=0&sh=0&az=${az}&el=${el}&d=${dist.toFixed(1)}&ty=0&alt=0&gr=0&embed=1`);
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
  for (const [name, v] of [['black', 0], ['white', 12]]) {
    await p.evaluate((v) => { const c = window.__engine.matteClear; c.r = v; c.g = v; c.b = v; }, v);
    await p.waitForTimeout(1200);
    fs.writeFileSync(`${outDir}/${key.replace(':', '_')}_${name}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  }
  await p.close();
  meta[key.replace(':', '_')] = { L: a.spec.L, span: a.spec.span, width: W };
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  console.log(key, 'ok');
}
await b.close();
