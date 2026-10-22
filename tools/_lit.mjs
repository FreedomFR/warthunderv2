import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [ship, out, az = '135', el = '15', cx = '0', cy = '15', cz = '0', w = '120', h = '45', s = '16'] = process.argv.slice(2);
const W = Math.round(+w * +s), H = Math.round(+h * +s), fov = 4, dist = +h / (2 * Math.tan(fov * Math.PI / 360));
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto(`http://localhost:8080/index.html?preview=${ship}&offscreen=1&w=${W}&h=${H}&parked=6&fov=${fov}&ocean=0&flags=0&quality=high&splash=0`);
for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate((o) => { window.__engine.P.sunAzim = o.az + 28; window.__engine.P.sunElev = 42; window.__preview.set({ target: 0, heading: 90, az: o.az, el: o.el, dist: o.dist, lookX: o.cx, lookY: o.cy, lookZ: o.cz }); }, { az: +az, el: +el, dist, cx: +cx, cy: +cy, cz: +cz });
await p.waitForTimeout(2500);
fs.writeFileSync(out, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
await b.close();
