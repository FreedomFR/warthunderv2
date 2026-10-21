// Pictures of the automatic camera's shots of aircraft in groups (formations in the air, attacks by several aircraft on one ship, two aircraft fighting), every view of each:
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/flockshots.mjs "http://localhost:8080/index.html?offscreen=1&w=1280&h=720&scenario=carriers&seed=5&islands=1&bases=2&start=1&speed=4" out/flock 400
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [url, outDir, seconds = '400'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 600)));
await p.goto(url);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(1500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate(async () => {
  window.__dir = await import('/js/game/ui/director.js'); const c = window.__game.camera; c.setMode('auto', true);
  // while a shot of the tool is on, the director does not cut away from it
  const ua = c.updateAuto.bind(c); c.updateAuto = (dt) => (c.__lock && c.auto.sub === c.__lock ? c.auto.sub : ua(dt));
});
const want = { formation: ['abeam', 'quarter', 'high', 'ahead', 'pass'], attack: ['behind', 'side'], dogfight: ['chase', 'tail', 'side'] };
const done = new Set();
const t0 = Date.now();
while (Date.now() - t0 < +seconds * 1000 && done.size < 10) {
  await p.waitForTimeout(1000);
  const shot = await p.evaluate((todo) => {
    const g = window.__game, c = g.camera, w = g.world, D = window.__dir;
    const att = D.attacks(w), fm = D.formations(w), df = D.dogfights(w);
    for (const v of todo.dogfight) if (df.length && (v === 'chase' || df[0].d < 280)) { c.startDogfight(df[0], w.time); c.flock.view = v; c.fovWant = (v === 'side' ? 40 : 50) * Math.PI / 180; c.auto.t = 30; c.__lock = 'dogfight'; return { kind: 'dogfight', view: v, d: Math.round(df[0].d), hunter: df[0].hunter.typeKey, prey: df[0].prey.typeKey, t: w.time }; }
    for (const v of todo.attack) if (att.length) { c.startAttack(att[0], w.time); c.flock.view = v; c.fovWant = (v === 'behind' ? 54 : 46) * Math.PI / 180; c.auto.t = 30; c.__lock = 'attack'; return { kind: 'attack', view: v, n: att[0].planes.length, ship: att[0].ship.name, t: w.time }; }
    for (const v of todo.formation) if (fm.length) {
      c.startFormation(fm[0], w.time); const f = c.flock;
      const pose = { abeam: [Math.PI * 0.5, 0.08], quarter: [0.8, 0.2], high: [0.45, 0.55], ahead: [2.5, 0.04], pass: [0, 0] }[v]; f.r = null;
      f.view = v; f.az = pose[0]; f.el = pose[1]; c.fovWant = (v === 'pass' ? 34 : 46) * Math.PI / 180; c.auto.t = 30; c.__lock = 'formation';
      return { kind: 'formation', view: v, n: fm[0].planes.length, types: [...new Set(fm[0].planes.map((q) => q.typeKey || q.kind))].join(','), alt: Math.round(fm[0].y), t: w.time };
    }
    return null;
  }, { dogfight: want.dogfight.filter((v) => !done.has('dogfight_' + v)), attack: want.attack.filter((v) => !done.has('attack_' + v)), formation: want.formation.filter((v) => !done.has('formation_' + v)) });
  if (!shot) continue;
  const name = shot.kind + '_' + shot.view;
  for (const dly of [1500, 3500]) {
    await p.waitForTimeout(dly === 1500 ? 1500 : 2000);
    const st = await p.evaluate(() => { const c = window.__game.camera, f = c.flock, cam = window.__engine.cam; const ps = f ? (f.kind === 'dogfight' ? [f.hunter, f.prey] : f.planes) : []; const d = ps.map((q) => Math.round(Math.hypot(q.x - cam.x, q.y - cam.y, q.z - cam.z))); return { sub: c.auto.sub, left: ps.length, r: f && f.r && Math.round(f.r), dist: d, ship: f && f.ship ? Math.round(Math.hypot(f.ship.x - cam.x, f.ship.z - cam.z)) : null, fov: Math.round(cam.fovY * 57.3) }; });
    fs.writeFileSync(`${outDir}/${name}_${dly}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
    console.log(name, dly, JSON.stringify(shot), JSON.stringify(st));
  }
  done.add(name);
  await p.evaluate(() => { window.__game.camera.__lock = null; });
}
await b.close();
