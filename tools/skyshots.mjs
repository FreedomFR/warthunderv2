// Pictures of the sky and the clouds: node tools/skyshots.mjs <outDir> [extra url parameters]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/skyshots.mjs out/sky "vclouds=1"
// A ship on the sea seen from near the water and from an aircraft's height, the sun low and high; one picture per view (<out>/<name>.png) and a sheet.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [outDir = 'out/sky', extra = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const views = [
  // name, sun elevation, sun azimuth, preview view: dist, az, el, lookY
  ['sunset_sea', 2.6, 4, '420,200,3,40'],
  ['sunset_back', 2.6, 4, '420,20,3,60'],
  ['day_sea', 28, 60, '420,200,4,60'],
  ['day_up', 28, 60, '300,200,25,500'],
  ['noon_sea', 55, 140, '500,230,6,120'],
  ['day_high', 28, 60, '3200,200,52,0'],
  ['day_high_flat', 28, 60, '3000,200,4,2800'],
  ['sunset_high', 6, 4, '3200,180,48,0'],
];
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
p.on('console', (m) => { if (/GPU error|FATAL/.test(m.text())) console.log(m.text().slice(0, 300)); });
for (const [name, el, az, view] of views) {
  await p.goto(`http://localhost:8080/index.html?offscreen=1&w=960&h=540&preview=iowa&fov=60&view=${view}&sunElev=${el}&sunAzim=${az}&${extra}`);
  for (let i = 0; i < 100; i++) { await p.waitForTimeout(400); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 20) break; }
  await p.waitForTimeout(500);
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  console.log(name, await p.evaluate(() => window.__engine.stats.gpuMs.toFixed(2)));
}
await b.close();
