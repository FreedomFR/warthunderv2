// Pictures of every aircraft from the pilot's seat (ahead, to each side, behind over the shoulder, down at the floor) and from outside close to the cockpit:
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/cockpitshots.mjs out/cockpits [type,type...]
// One contact sheet per aircraft: <out>/<type>.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [outDir = 'out/cockpits', only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const base = 'http://localhost:8080/index.html?offscreen=1&w=640&h=360&ocean=1&alt=300';
const types = only ? only.split(',') : 'sbd tbf d3a b5n swordfish skua ju87 fi167 ln401 pl10 re2001 re2001t f6f f4f fm2 f8f p40 spitfire a6m fulmar bf109t d520 mc202 b17 b29 g4m lancaster he111 sm79 leo451'.split(' ');
const views = [['ahead', '0,-4'], ['left', '-70,-10'], ['right', '70,-10'], ['back-left', '-150,0'], ['back-right', '150,0'], ['down', '0,-55'], ['up', '0,60']];
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
for (const t of types) {
  const shots = [];
  for (const [name, look] of views) {
    await p.goto(`${base}&preview=plane:${t}&cockpit=1&look=${look}&fov=70`);
    for (let i = 0; i < 100; i++) { await p.waitForTimeout(400); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 12) break; }
    shots.push([name, await p.evaluate(() => window.__engine.capture())]);
  }
  // outside: close to the cockpit, from the front quarter and from above
  for (const [name, set] of [['out-front', { dist: 14, az: 150, el: 12, lookY: 300.5 }], ['out-top', { dist: 12, az: 210, el: 55, lookY: 300.5 }]]) {
    await p.goto(`${base}&preview=plane:${t}&fov=40&view=14,150,12,300`);
    for (let i = 0; i < 100; i++) { await p.waitForTimeout(400); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 12) break; }
    await p.evaluate((o) => window.__preview.set(o), set);
    await p.waitForTimeout(800);
    shots.push([name, await p.evaluate(() => window.__engine.capture())]);
  }
  for (const [name, png] of shots) fs.writeFileSync(`${outDir}/${t}_${name}.png`, Buffer.from(png, 'base64'));
  console.log(t, shots.length);
}
await b.close();
