// How long the great war takes to come up in the browser, and what it looks like: node tools/warload.mjs [seconds to run] [out.png]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const secs = Number(process.argv[2] || 20), out = process.argv[3] || 'out/war.png';
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
p.on('pageerror', (e) => console.log(T(), '[pageerror]', e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') console.log(T(), '[console.error]', m.text().slice(0, 300)); });
await p.goto('http://localhost:8080/index.html?offscreen=1&w=1280&h=720&scenario=war&start=1&seed=3&speed=1&mode=tactical&splash=0');
for (let i = 0; i < 1200; i++) {
  await p.waitForTimeout(1000);
  const f = await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1);
  if (i % 10 === 0) console.log(T(), 'frame', f);
  if (f >= 8) break;
}
console.log(T(), 'first frames');
for (let k = 0; k < secs / 5; k++) {
  await p.waitForTimeout(5000);
  console.log(T(), JSON.stringify(await p.evaluate(() => { const g = window.__game, w = g.world; return { frames: window.__engine.frameIndex, t: +w.time.toFixed(0), ships: w.ships.length, bases: w.bases.length, planes: w.planes.length, fps: g.fps }; })));
}
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync(out, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
await b.close();
