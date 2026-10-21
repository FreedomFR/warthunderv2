// Render the matte top and side views of an aircraft model of the preview scene (nose to the right), for planecheck.py.
//   node tools/refs/planecheck.mjs <plane key> [outDir]      (the game must be served on :8080, or on PORT)
/* global __engine */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from '../browser.mjs';
const [key, outDir = 'out/check'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const W = 1600, H = 1000, ALT = 40, FOV = 8;
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 400)));
await p.goto(`http://localhost:${process.env.PORT || 8080}/index.html?preview=plane:${key}&offscreen=1&w=${W}&h=${H}&fov=${FOV}&ocean=0&matte=1&flags=0&alt=${ALT}&ord=0`);
for (let i = 0; i < 120; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate(() => { Object.assign(__engine.P, { sunElev: 40, sunAzim: 180, bloom: 0, vignette: 0, clouds: 0 }); __engine.markDirty('lut'); });
const dist = 60 / (2 * Math.tan(FOV * Math.PI / 360)) * 1.0;   // 60 m fill the height
for (const [view, o] of Object.entries({ side: { az: 180, el: 0 }, top: { az: 180, el: 89.5 } })) {
  await p.evaluate((q) => window.__preview.set(q), { target: 0, heading: 90, dist, az: o.az, el: o.el, lookY: ALT, lookX: 0 });
  await p.waitForTimeout(800);
  fs.writeFileSync(`${outDir}/plane_${key}_${view}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  console.log('rendered', view, 'dist', dist.toFixed(1));
}
await b.close();
