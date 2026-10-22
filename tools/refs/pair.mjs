// The game's picture of a window on a ship, to put beside the same window of the reference model (tools/refs/pair.sh): a narrow field of view from far away (nearly orthographic),
// the camera at the preview angles --az --el, aimed at the model point --cx --cy --cz (x along the length, y above the waterline, z to starboard), a window --w x --h metres at --s px/m.
//   node tools/refs/pair.mjs <ship> <out.png> --az=135 --el=20 --cx=10 --cy=5 --cz=0 --w=30 --h=20 --s=30      (the game on :8080)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from '../browser.mjs';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), F = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const [ship, out] = args;
const az = +(F.az ?? 180), el = +(F.el ?? 8), w = +(F.w || 30), h = +(F.h || 20), s = +(F.s || 30), bg = +(F.bg || 1.1);
const W = Math.round(w * s), H = Math.round(h * s), fov = 4, dist = h / (2 * Math.tan(fov * Math.PI / 360));
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto(`${F.base || 'http://localhost:8080'}/index.html?preview=${ship}&offscreen=1&w=${W}&h=${H}&parked=6&fov=${fov}&ocean=0&flags=0&matte=1&bg=${bg},${bg},${bg * 1.02}&quality=high`);
for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate((o) => { window.__engine.P.sunAzim = o.az + 28; window.__engine.P.sunElev = 42; window.__preview.set({ target: 0, heading: 90, az: o.az, el: o.el, dist: o.dist, lookX: o.cx, lookY: o.cy, lookZ: o.cz }); }, { az, el, dist, cx: +(F.cx || 0), cy: +(F.cy || 0), cz: +(F.cz || 0) });
await p.waitForTimeout(1500);
fs.mkdirSync(out.replace(/[^/\\]*$/, '') || '.', { recursive: true });
fs.writeFileSync(out, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
await b.close();
console.log('wrote', out, W, 'x', H);
