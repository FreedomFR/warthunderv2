// What the plants cost: node tools/vegperf.mjs [url]
// A free camera is put in the trees of an island (still, then turning) and the frame time is read with the plants drawn and without them, with the time of the preparation of the plants and
// the numbers the plants report (instances, cells, supers, meshes built). GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/vegperf.mjs
import { chromium } from 'playwright-core';
import { launchOptions } from './browser.mjs';
const url = process.argv[2] || 'http://localhost:8080/index.html?scenario=duel&seed=3&islands=2&bases=0&splash=0';
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 400)));
await p.goto(url);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(1000); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 8) break; }
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const PROF = process.env.PROFILE ? process.env.PROFILE : '';
if (PROF) await cdp.send('Profiler.start');
const R = await p.evaluate(async (PROF) => {
  const g = window.__game, e = window.__engine, w = g.world, T = w.terrain;
  const out = { islands: T.islands.map((i) => ({ x: Math.round(i.x), z: Math.round(i.z), R: Math.round(i.R), biome: i.biome })) };
  const wrap = (o, m, k, acc) => { const f = o[m].bind(o); o[m] = (...a) => { const t = performance.now(); const r = f(...a); const d = performance.now() - t; acc[k] = (acc[k] || 0) + d; if (k === 'plants') { acc.maxPlants = Math.max(acc.maxPlants || 0, d); if (d > 8) (acc.slow ||= []).push(+d.toFixed(1)); } return r; }; };
  const meshLog = (out.meshes = []);
  { const r = g.shipRenderer, f = r.createMesh.bind(r); r.createMesh = (b, l) => { const t = performance.now(); const m = f(b, l); meshLog.push({ l, kb: Math.round((b.vertices.byteLength + b.indices.byteLength) / 1024), ms: +(performance.now() - t).toFixed(1) }); return m; }; }
  { const sv = g.shipVisuals, f = sv.forModel.bind(sv); sv.forModel = (m) => { const had = sv.cache.has(m.id); const t = performance.now(); const r = f(m); if (!had) (out.forModel ||= []).push({ id: m.id, ms: +(performance.now() - t).toFixed(1) }); return r; }; }
  const acc = {}; wrap(g.vegetation, 'add', 'plants', acc); wrap(g.shipRenderer, 'upload', 'upload', acc);
  const longs = []; out.longs = longs;
  const cur = { update: 0, prepare: 0 }; const hu = e.hooks.update, hp = e.hooks.prepare;
  e.hooks.update = (...a) => { const t = performance.now(); hu(...a); cur.update = performance.now() - t; };
  e.hooks.prepare = (...a) => { const t = performance.now(); hp(...a); cur.prepare = performance.now() - t; };
  const parts = {}; for (const [o, m, k] of [[g.islandVisuals, 'add', 'islands'], [g.vegetation, 'add', 'plants'], [g.shipVisuals, 'addShip', 'ships'], [g.shipRenderer, 'upload', 'upload'], [g, 'updateShadow', 'shadow'], [g.particles, 'upload', 'particles'], [g.effects, 'update', 'fx'], [g.camera, 'update', 'camera'], [g.world, 'update', 'sim']]) if (o && o[m]) { const f = o[m].bind(o); o[m] = (...a) => { const t = performance.now(); const r = f(...a); parts[k] = performance.now() - t; return r; }; }
  const frames = (ms) => new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; let b0 = g.vegetation.stats.built; const tick = () => { const n = performance.now(); ts.push(n - last); if (n - last > 28) longs.push({ cpu: { update: +cur.update.toFixed(1), prepare: +cur.prepare.toFixed(1), ...Object.fromEntries(Object.entries(parts).filter(([k, v]) => v > 3).map(([k, v]) => [k, +v.toFixed(1)])) }, pass: Object.fromEntries(Object.entries(e.stats.passMs || {}).filter(([k, v]) => v > 1).map(([k, v]) => [k, +v.toFixed(1)])), ms: +(n - last).toFixed(0), built: g.vegetation.stats.built - b0, near: g.vegetation.stats.near, cells: g.vegetation.stats.cells, supers: g.vegetation.stats.supers }); b0 = g.vegetation.stats.built; last = n; if (n - t0 < ms) requestAnimationFrame(tick); else res(ts); }; requestAnimationFrame(tick); });
  const stat = (ts) => { const s = ts.slice(3).sort((a, b) => a - b); const avg = s.reduce((a, b) => a + b, 0) / s.length; return { fps: +(1000 / avg).toFixed(1), p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), worst: +s[s.length - 1].toFixed(1), n: s.length }; };
  // a place in the trees: on the island, where the ground is some metres above the sea, a hundred metres in from the shore
  const is = T.islands.reduce((a, b) => (b.R > a.R ? b : a));
  let spot = null;
  for (let a = 0; a < 6.28 && !spot; a += 0.2) for (let r = is.R * 0.2; r < is.R * 0.95; r += is.R * 0.05) { const x = is.x + Math.cos(a) * r, z = is.z + Math.sin(a) * r, h = T.heightAt(x, z); if (h > 8 && h < 60) { spot = { x, z, h, a }; } }
  out.spot = spot;
  g.camera.setMode('free');
  const cam = g.camera.free;
  const place = (yawOff = 0, up = 8) => Object.assign(cam, { x: spot.x, z: spot.z, y: spot.h + up, yaw: spot.a + Math.PI + yawOff, pitch: -0.05, speed: 0 });
  const run = async (name, ms, f) => { acc.plants = 0; acc.upload = 0; acc.maxPlants = 0; acc.slow = []; const n0 = e.frameIndex; let frameFn = null; if (f) { const t0 = performance.now(); frameFn = setInterval(() => f((performance.now() - t0) / 1000), 8); } const ts = await frames(ms); if (frameFn) clearInterval(frameFn); const nf = Math.max(1, e.frameIndex - n0); out[name] = { ...stat(ts), plantsMs: +(acc.plants / nf).toFixed(2), uploadMs: +(acc.upload / nf).toFixed(2), maxPlantsMs: +acc.maxPlants.toFixed(1), slowPlants: acc.slow.slice(0, 20), veg: { ...g.vegetation.stats }, passMs: e.stats.passMs ? { ...e.stats.passMs } : null }; };
  g.setTimeScale(0.0001);
  // a free camera in the trees: still, then turning (new cells and supers come into view and are built)
  place(); g.vegetation.enabled = true; await frames(2500);
  await run('trees_still', 4000);
  await run('trees_turning', 6000, (t) => { cam.yaw = spot.a + Math.PI + t * 0.9; });
  longs.push('--- follow camera');
  // the camera that follows a ship lying off the shore: the shadows are on then (they follow the ship), and the trees are in the picture
  const ship = w.ships[0];
  let sea = null;
  // walk out from the spot in the trees to the shore, then a hundred metres out to sea
  for (let r = Math.hypot(spot.x - is.x, spot.z - is.z); r < is.R + 800 && !sea; r += 10) { const x = is.x + Math.cos(spot.a) * r, z = is.z + Math.sin(spot.a) * r; if (T.heightAt(x, z) < -5) sea = { x: x + Math.cos(spot.a) * 110, z: z + Math.sin(spot.a) * 110 }; }
  out.sea = sea;
  ship.x = sea.x; ship.z = sea.z; ship.heading = Math.atan2(-Math.cos(spot.a), Math.sin(spot.a)); ship.speed = 0; ship.cmd.throttle = 0; ship.controller = null;
  g.camera.setTarget(ship); g.camera.setMode('follow');
  await frames(3000);
  const orig = g.shipRenderer.setCasting.bind(g.shipRenderer), addOrig = g.vegetation.add.bind(g.vegetation);
  const noCast = (on) => { g.vegetation.add = (c) => { g.shipRenderer.setCasting = () => orig(false); addOrig(c); g.shipRenderer.setCasting = orig; orig(true); }; if (!on) g.vegetation.add = addOrig; };
  const orbit = (t) => { g.camera.orbitYaw = (g.camera.orbitYaw || 0); g.camera.followYaw = t * 0.8; };
  const grab = () => ({ fps: e.stats.fps, passMs: Object.fromEntries(Object.entries(e.stats.passMs || {}).filter(([k, v]) => v > 0.3).map(([k, v]) => [k, +v.toFixed(2)])), shadowActive: g.shadowActive });
  g.vegetation.enabled = true; await frames(1500); await run('follow_trees', 4000); out.follow_trees.grab = grab();
  noCast(true); await frames(1000); await run('follow_trees_nocast', 4000); out.follow_trees_nocast.grab = grab(); noCast(false);
  g.vegetation.enabled = false; await frames(1000); await run('follow_no_trees', 4000); out.follow_no_trees.grab = grab();
  g.vegetation.enabled = true;
  const triBy = () => { const o = {}; for (const m of g.shipRenderer.meshes) { if (!/^(plant|leaves)/.test(m.label)) continue; const n = m.n + m.n2; if (!n) continue; const k = m.label.split(' ').slice(0, 2).join(' '); o[k] = o[k] || { meshes: 0, ktris: 0 }; o[k].meshes++; o[k].ktris += Math.round(n * m.indexCount / 3000); } return o; };
  out.triBy = triBy();
  const tris = () => { let t = 0, inst = 0, mesh = 0; for (const m of g.shipRenderer.meshes) { if (!/^(plant|leaves)/.test(m.label)) continue; const n = m.n + m.n2; if (!n) continue; t += n * m.indexCount / 3; inst += n; mesh++; } return { tris: Math.round(t / 1000) + 'k', instances: inst, meshes: mesh }; };
  out.quality = {};
  for (const q of [0, 1, 2, 3, 4]) { g.vegetation.setQuality(q); await frames(1800); const ts = await frames(1500); out.quality[q] = { ...grab(), ...tris(), ...stat(ts), by: triBy() }; }
  g.vegetation.setQuality(0);
  g.vegetation.enabled = true;
  return out;
}, PROF);
if (PROF) {
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map();
  for (let i = 0; i < profile.samples.length; i++) { const cf = byId.get(profile.samples[i]).callFrame; const key = `${cf.functionName || '(anon)'} ${(cf.url || '').replace(/^.*\/js\//, '')}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0)); }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  // the longest stretches without idle time: what the page was doing when a frame was long
  { let t = 0, start = 0, run = [], best = []; const ids = profile.samples; 
    for (let i = 0; i < ids.length; i++) { const n = byId.get(ids[i]); const idle = n.callFrame.functionName === '(idle)'; const dt = (profile.timeDeltas[i] || 0) / 1000;
      if (idle && dt > 2) { if (run.length) { const tot = run.reduce((a, r) => a + r.dt, 0); best.push({ tot, run }); run = []; } } else run.push({ n: n.callFrame.functionName + ' ' + (n.callFrame.url || '').replace(/^.*\/js\//, '') + ':' + n.callFrame.lineNumber, dt }); }
    best.sort((a, b) => b.tot - a.tot);
    for (const b of best.slice(0, 5)) { const m = new Map(); for (const r of b.run) m.set(r.n, (m.get(r.n) || 0) + r.dt); console.error('busy stretch', b.tot.toFixed(0), 'ms:', [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join(' | ')); } }
  console.error('CPU profile'); for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.error(`${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
}
if (process.env.SHOT) { await p.waitForTimeout(1500); await p.screenshot({ path: process.env.SHOT }); }
console.log(JSON.stringify(R, null, 1));
await b.close();
