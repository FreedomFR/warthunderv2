// The side view of each ship's model, for the wiki (wiki/ships/<id>.webp): every ship is rendered twice from the starboard beam, on a black and on a white background,
// then tools/wikishots.py cuts it out exactly (the difference of the two pictures gives the transparency) and scales it to one scale for all ships.
//   node tools/wikishots.mjs [shipId,shipId,...] [outDir=out/wiki] [--w=3000] [--h=1000]     then: python3 tools/wikishots.py out/wiki wiki/ships
// With the game served (node server.mjs 8080). On the GPU from WSL: GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/wikishots.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
import { ALL_SHIPS } from '../js/game/data/ships.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const ids = (args[0] ? args[0].split(',') : ALL_SHIPS.map((s) => s.id)).filter(Boolean), outDir = args[1] || 'out/wiki';
const W = +(flags.w || 3000), H = +(flags.h || 1000), base = flags.base || 'http://localhost:8080';
fs.mkdirSync(outDir, { recursive: true });
const metaPath = `${outDir}/meta.json`, meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
const b = await chromium.launch(launchOptions());
for (const id of ids) {
  const spec = ALL_SHIPS.find((s) => s.id === id);
  if (!spec) { console.log('unknown ship', id); continue; }
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
  await p.goto(`${base}/index.html?preview=${id}&offscreen=1&w=${W}&h=${H}&parked=6&fov=36&ocean=0&flags=0&matte=1&bg=0,0,0&quality=high`);
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
  const len = spec.loa;
  // a wide frame (3:1): the field of view is vertical, so the width seen is 2 d tan(18 deg) x 3; the ship takes 90 % of it
  const d = len / (0.9 * 2 * Math.tan(18 * Math.PI / 180) * (W / H));
  await p.evaluate(({ d, len }) => {
    window.__engine.P.sunAzim = 208; window.__engine.P.sunElev = 42;       // lit from behind the camera (the starboard side is seen from az 180)
    window.__preview.set({ target: 0, heading: 90, az: 180, el: 2, dist: d, lookY: len * 0.1 + 2, lookX: 0 });
  }, { d, len });
  for (const [name, v] of [['black', 0], ['white', 12]]) {
    await p.evaluate((v) => { const c = window.__engine.matteClear; c.r = v; c.g = v; c.b = v; }, v);
    await p.waitForTimeout(1500);
    fs.writeFileSync(`${outDir}/${id}_${name}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  }
  await p.close();
  meta[id] = { loa: len, width: W, ppm: Math.round(0.9 * W / len * 100) / 100 };       // pixels per metre on the centre line
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  console.log(id, 'ok');
}
await b.close();
