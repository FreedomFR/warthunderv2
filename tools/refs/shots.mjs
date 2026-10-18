// Take screenshots of the 3D models in the preview scene, from camera positions given in a JSON file.
//   node tools/refs/shots.mjs "<url>" <outDir> <shots.json> [width] [height] [timeoutSec]
//   node tools/refs/shots.mjs "http://localhost:8080/index.html?preview=iowa,yamato&offscreen=1&w=1280&h=720&parked=6&fov=38&ocean=0" out views.json 1280 720 900
// shots.json: [{ "name": "a", "set": {dist, az, el, lookY, lookX, target, heading}, "eval": "js to run before", "wait": ms }, ...]
// (tools/refs/views.mjs writes a standard set). The page needs the same w / h as the viewport; ocean=0 skips the ocean for speed.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from '../browser.mjs';
const [url, outDir, shotsJson, width = '960', height = '540', timeoutSec = '600'] = process.argv.slice(2);
const shots = JSON.parse(fs.existsSync(shotsJson) ? fs.readFileSync(shotsJson, 'utf8') : shotsJson);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: +width, height: +height } });
p.on('console', (m) => { if (m.type() !== 'info' && !/404/.test(m.text())) console.log('[console.' + m.type() + '] ' + m.text().slice(0, 600)); });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 800)));
const t0 = Date.now();
await p.goto(url);
let ok = false;
while ((Date.now() - t0) < +timeoutSec * 1000) {
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -2);
  if (n >= 6) { ok = true; break; }
}
if (!ok) console.log('TIMEOUT waiting for frames');
for (const s of shots) {
  if (s.eval) { try { await p.evaluate(s.eval); } catch (e) { console.log('[eval error]', e.message.slice(0, 300)); } }
  if (s.set) await p.evaluate((o) => window.__preview.set(o), s.set);
  await p.waitForTimeout(s.wait || 600);
  const b64 = await p.evaluate(() => window.__engine.capture());
  fs.writeFileSync(outDir + '/' + s.name + '.png', Buffer.from(b64, 'base64'));
  if (s.ui) await p.screenshot({ path: outDir + '/' + s.name + '_ui.png' });
  console.log('saved', s.name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await b.close();
