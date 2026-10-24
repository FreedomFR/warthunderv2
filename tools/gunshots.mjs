// Pictures of the defensive guns of every aircraft that has a gunner: the whole aircraft from the side, from above, from the rear quarter above and below, and the
// guns turned to an angle (window.__preview.set({ guns: { yaw, pitch } }), when the aircraft has turrets that turn): one contact sheet per aircraft, <out>/<type>.png
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/gunshots.mjs out/guns [type,type...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
import { HEAVY } from '../js/game/model/bomberdata.js';
const [outDir = 'out/guns', only, aim = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const base = (process.env.BASE || 'http://localhost:8080') + '/index.html?offscreen=1&w=640&h=400&ocean=0&alt=40&heading=90&sunElev=40&sunAzim=200';
const types = only ? only.split(',') : 'b17 b26 b29 lancaster g4m he111 sm79 leo451 tbf sbd d3a b5n swordfish skua ju87 fi167 pl10'.split(' ');
const L = { b17: 23, b26: 15.6, b29: 31, lancaster: 21, g4m: 20, he111: 16.4, sm79: 15.6, leo451: 17.2 };
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
for (const t of types) {
  const d = (L[t] || 11) * 1.25;
  await p.goto(`${base}&preview=plane:${t}&fov=40&view=${d},180,4,40${aim}`);
  for (let i = 0; i < 100; i++) { await p.waitForTimeout(300); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 8) break; }
  const views = [['side', { dist: d, az: 180, el: 4 }], ['top', { dist: d, az: 180, el: 84 }], ['rear-high', { dist: d * 0.8, az: 235, el: 28 }], ['rear-low', { dist: d * 0.8, az: 215, el: -22 }],
    ['front-high', { dist: d * 0.8, az: 125, el: 25 }], ['tail', { dist: d * 0.35, az: 240, el: 12, lookX: -(L[t] || 11) * 0.42 }]];
  // close to each gun position of a heavy bomber (its place from the sheet: d from the nose, the height of the fuselage there)
  const S = HEAVY[t];
  if (S) {
    const at = (d) => { const B = S.body; let i = 0; while (i < B.length - 2 && B[i + 1][0] < d) i++; const a = B[i], c = B[i + 1], u = Math.min(1, Math.max(0, (d - a[0]) / ((c[0] - a[0]) || 1))); return { ry: a[1] + (c[1] - a[1]) * u, yc: a[3] + (c[3] - a[3]) * u }; };
    S.guns.forEach((g, i) => {
      const dd = g.d ?? (g.d0 + g.d1) / 2, q = at(dd);
      const y = g.t === 'dome' ? q.yc + q.ry : g.t === 'ball' || g.t === 'chin' || g.t === 'gondola' ? q.yc - q.ry : g.y ?? q.yc;
      const az = g.t === 'tail' ? 250 : g.side === -1 ? 20 : g.t === 'nose' || g.t === 'fturret' || g.t === 'chin' ? 130 : 200;
      views.push([`gun${i}-${g.t}`, { dist: 4.5, az, el: g.t === 'ball' || g.t === 'chin' || g.t === 'gondola' ? -18 : 18, lookX: S.cg - dd, lookY: 40 + y }]);
    });
  }
  // the guns aimed: at a fighter high on the starboard quarter, low astern, on the port beam, ahead and below
  for (const [name, ga] of [['aim-high-quarter', [135, 30]], ['aim-low-astern', [175, -25]], ['aim-port', [-90, 5]], ['aim-ahead-low', [10, -15]]]) views.push([name, { dist: d * 0.5, az: 215, el: 18, gunaim: ga }]);
  for (const [name, set] of views) {
    await p.evaluate((o) => window.__preview.set({ lookY: 40, lookX: 0, gunaim: null, ...o }), set);
    await p.waitForTimeout(500);
    fs.writeFileSync(`${outDir}/${t}_${name}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  }
  console.log(t);
}
await b.close();
