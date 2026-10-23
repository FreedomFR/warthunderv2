// (a plain grey background, the sun high and no clouds, so that the model is seen well; STUDIO=0 gives the sea sky of the game)
// Pictures of a ship of the preview scene from chosen angles: node tools/previewshots.mjs <ship> <out prefix> "az,el,dist,lookX,lookY;..." (az 180 = starboard profile, lookX along the ship, bow +; on the GPU through the Windows Node)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [ship, prefix, views] = process.argv.slice(2);
const W = 1280, H = 720;
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto(`http://localhost:8080/index.html?preview=${ship}&offscreen=1&w=${W}&h=${H}&fov=36&ocean=0&flags=0&quality=high${process.env.STUDIO === "0" ? "" : "&matte=1&bg=0.36,0.40,0.46&sunElev=50&exposure=0.45&clouds=0&vclouds=0"}${process.env.Q || ""}`);
for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
let k = 0;
for (const v of views.split(';')) {
  const [az, el, dist, lx, ly] = v.split(',').map(Number);
  await p.evaluate((q) => window.__preview.set(q), { target: 0, heading: 90, dist, az, el, lookY: ly, lookX: lx });
  await p.waitForTimeout(1500);
  fs.writeFileSync(`${prefix}_${k++}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
}
await b.close();
