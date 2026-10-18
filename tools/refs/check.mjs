// Render the matte views listed for a ship in tools/refs/plans.json (?matte=1: flat green background), for silhouette.py to compare
// with the plans.
//   node tools/refs/check.mjs <ship> [outDir]          (the game must be served on :8080)
//   python3 tools/refs/silhouette.py <ship> side <outDir>/<ship>_side_render.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from '../browser.mjs';

const [ship, outDir = 'out/check', mode = 'matte'] = process.argv.slice(2);   // mode 'colour': the normal sky, for overlay_top.py
const cfg = JSON.parse(fs.readFileSync(new URL('./plans.json', import.meta.url), 'utf8'))[ship];
if (!cfg) { console.error('no plans for ' + ship + ' in tools/refs/plans.json'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const W = 2400, H = 1000;
// default cameras (the ship fills 92 % of the width at fov 4): side and plan view
const L = cfg.loa, auto = Math.round(L * 6.63);
cfg.camera = cfg.camera || {};
for (const v of ['side', 'top']) if (cfg[v] && !cfg.camera[v]) cfg.camera[v] = { dist: auto, fov: 4, lookY: 15, el: v === 'side' ? 0 : 89.5 };
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 400)));
await p.goto(`http://localhost:8080/index.html?preview=${ship}&offscreen=1&w=${W}&h=${H}&parked=0&fov=${(cfg.camera.side || cfg.camera.top).fov}&ocean=0&matte=${mode === 'matte' ? 1 : 0}&flags=0`);
for (let i = 0; i < 120; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate(() => { Object.assign(__engine.P, { sunElev: 35, sunAzim: 180, bloom: 0, vignette: 0, clouds: 0 }); __engine.markDirty('lut'); });
for (const [view, c] of Object.entries(cfg.camera)) {
  await p.evaluate((o) => window.__preview.set(o), { target: 0, heading: 90, dist: c.dist, az: 180, el: c.el, lookY: c.lookY, lookX: 0 });
  await p.waitForTimeout(800);
  const b64 = await p.evaluate(() => window.__engine.capture());
  fs.writeFileSync(`${outDir}/${ship}_${view}_${mode === 'matte' ? 'render' : 'colour'}.png`, Buffer.from(b64, 'base64'));
  console.log('rendered', view);
}
await b.close();
