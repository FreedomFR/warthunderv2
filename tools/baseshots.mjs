// Pictures of the military bases in a running battle: node tools/baseshots.mjs "<url>" <outDir> <shots.json> [width] [height] [timeoutSec]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/baseshots.mjs "http://localhost:8080/index.html?offscreen=1&w=1280&h=720&scenario=duel&seed=3&islands=2&bases=2&start=1" out shots.json 1280 720
// shots.json: [{ "name": "a", "eval": "js run in the page first (window.__game is the game)", "sim": seconds of simulation to run before the shot, "wait": ms }, ...]
// In an `eval`, `plane(b, phase)` is an aircraft of base b in that phase, `follow(p, side, back, up, fov)` puts the camera beside it, `base(kind, team)` is the live base, `look(x, y, z, tx, ty, tz)` puts the free camera there and `near(b, s, t, h)` is the point at s along the axis, t across it
// (to the right of it) and h above the ground of base b.
/* global look */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [url, outDir, shotsJson, width = '1280', height = '720', timeoutSec = '600'] = process.argv.slice(2);
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
await p.evaluate(() => {
  const g = window.__game;
  window.base = (kind, team = 0) => g.world.bases.find((q) => q.layout.kind === kind && q.team === team);
  window.near = (bs, s, t, h) => { const L = bs.layout, c = Math.cos(L.ang), sn = Math.sin(L.ang); return [L.x + s * c - t * sn, L.y + h, L.z + s * sn + t * c]; };
  window.look = (x, y, z, tx, ty, tz, fov) => {
    g.camera.setMode('free');
    const dx = tx - x, dy = ty - y, dz = tz - z;
    Object.assign(g.camera.free, { x, y, z, yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) });
    if (fov) g.camera.fovWant = fov * Math.PI / 180;
  };
  window.plane = (bs, ...phases) => g.world.planes.find((q) => q.base === bs && phases.includes(q.phase));
  window.follow = (q, side = 40, back = 25, up = 8, fov = 50) => {
    const f = [Math.sin(q.heading), Math.cos(q.heading)];       // forward (x, -z): the z of the forward vector is -cos
    const r = [Math.cos(q.heading), Math.sin(q.heading)];
    look(q.x + r[0] * side - f[0] * back, q.y + up, q.z + r[1] * side + f[1] * back, q.x, q.y + 1, q.z, fov);
  };
  window.fast = (sec) => { const w = g.world; const t1 = w.time + sec; while (w.time < t1) { w.update(0.1); w.drainEvents(); } };
});
for (const s of shots) {
  if (s.sim) await p.evaluate((n) => window.fast(n), s.sim);
  if (s.eval) { try { await p.evaluate(s.eval); } catch (e) { console.log('[eval error]', e.message.slice(0, 300)); } }
  await p.waitForTimeout(s.wait || 1500);
  const b64 = await p.evaluate(() => window.__engine.capture());
  fs.writeFileSync(outDir + '/' + s.name + '.png', Buffer.from(b64, 'base64'));
  console.log('saved', s.name, ((Date.now() - t0) / 1000).toFixed(0) + 's', await p.evaluate(() => { const w = window.__game.world; return `t=${w.time.toFixed(0)} ships=${w.ships.filter((q) => q.alive).length} planes=${w.planes.length}`; }));
}
await b.close();
