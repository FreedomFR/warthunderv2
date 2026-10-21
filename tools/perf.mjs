// Where the time of a frame goes in a running battle: node tools/perf.mjs "<url>" [seconds] [profileSeconds]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/perf.mjs "http://localhost:8080/index.html?offscreen=1&w=1920&h=1080&scenario=fleet&seed=3&islands=2&bases=2&start=1" 40 12
// Prints the frame rate, the GPU time, the CPU time of each part of the frame (simulation, effects, camera, scene preparation) and the functions that
// take the most CPU time (a CPU profile of the page).
import { chromium } from 'playwright-core';
import { launchOptions } from './browser.mjs';
const [url, seconds = '40', profSec = '12'] = process.argv.slice(2);
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 600)));
await p.goto(url);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(1500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
// time each part of the frame
await p.evaluate(() => {
  const g = window.__game, w = g.world, T = (window.__perf = { n: 0, parts: {}, frames: [] });
  const wrap = (obj, name, key) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => { const t = performance.now(); const r = f(...a); T.parts[key] = (T.parts[key] || 0) + performance.now() - t; return r; };
  };
  wrap(w, 'update', 'sim');
  wrap(g.effects, 'process', 'fx.events');
  wrap(g.effects, 'update', 'fx.update');
  wrap(g.particles, 'update', 'particles');
  wrap(g.camera, 'update', 'camera');
  wrap(g.audio, 'update', 'audio');
  if (g.ui && g.ui.update) wrap(g.ui, 'update', 'ui');
  // the parts of the scene preparation
  for (const [o, m, k] of [[g.islandVisuals, 'add', 'prep.islands'], [g.baseVisuals, 'add', 'prep.bases'], [g.vegetation, 'add', 'prep.plants'], [g.shipVisuals, 'addShip', 'prep.ships'],
    [g.planeVisuals, 'addPlane', 'prep.planes'], [g.shipRenderer, 'upload', 'prep.upload'], [g, 'updateShadow', 'prep.shadow'], [g.particles, 'upload', 'prep.particles']]) if (o && o[m]) wrap(o, m, k);
  const e = window.__engine, hu = e.hooks.update, hp = e.hooks.prepare;
  let lastT = 0, cur = null;
  e.hooks.update = (...a) => {
    const t = performance.now();
    if (cur && T.frames) { cur.wall = t - lastT; cur.simT = +g.world.time.toFixed(1); cur.heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; cur.shot = g.camera.mode === 'auto' ? g.camera.auto.sub + ' ' + (g.camera.auto.held || 0).toFixed(1) : g.camera.mode; T.frames.push(cur); }
    lastT = t; cur = { snap: { ...T.parts } };
    hu(...a); const du = performance.now() - t; T.parts['update (all)'] = (T.parts['update (all)'] || 0) + du; T.n++; cur.update = du;
  };
  e.hooks.prepare = (...a) => { const t = performance.now(); hp(...a); const dp = performance.now() - t; T.parts.prepare = (T.parts.prepare || 0) + dp; if (cur) { cur.prepare = dp; const d = {}; for (const k in T.parts) { const v = T.parts[k] - (cur.snap[k] || 0); if (v > 0.5) d[k] = +v.toFixed(1); } cur.parts = d; delete cur.snap; } };
  g.camera.setMode('auto', true);
});
await p.waitForTimeout(4000);
await p.evaluate(() => { const T = window.__perf; T.n = 0; T.parts = {}; T.frames = []; T.t0 = performance.now(); T.fps = []; T.gpu = []; T.iv = setInterval(() => { T.fps.push(window.__engine.stats.fps); T.gpu.push(window.__engine.stats.gpuMs); }, 500); });
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const rest = Math.max(0, +seconds - +profSec);
await p.waitForTimeout(rest * 1000);
await cdp.send('Profiler.start');
await p.waitForTimeout(+profSec * 1000);
const { profile } = await cdp.send('Profiler.stop');
const R = await p.evaluate(() => {
  const T = window.__perf, w = window.__game.world; clearInterval(T.iv);
  const ms = performance.now() - T.t0, avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const parts = {}; for (const k in T.parts) parts[k] = +(T.parts[k] / Math.max(1, T.n)).toFixed(2);
  return { frames: T.n, wallMs: +(ms / Math.max(1, T.n)).toFixed(2), fps: +avg(T.fps).toFixed(1), fpsMin: +Math.min(...T.fps).toFixed(1), gpuMs: +avg(T.gpu).toFixed(2),
    parts, simTime: +w.time.toFixed(0), ships: w.ships.filter((s) => s.alive).length, planes: w.planes.length, shells: w.shells.length, particles: window.__game.particles.count ?? null,
    size: [window.__engine.stats.width, window.__engine.stats.height], quality: window.__game.qLevel,
    heapMB: T.frames.filter((x, i) => i % 600 === 0).map((x) => x.heap),
    frameTimes: (() => { const f = T.frames.map((x) => x.wall).sort((a, b) => a - b), q = (k) => +f[Math.min(f.length - 1, Math.floor(f.length * k))].toFixed(1); return { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(0.9999), over20ms: f.filter((x) => x > 20).length, over33ms: f.filter((x) => x > 33.4).length }; })(),
    worst: T.frames.slice().sort((a, b) => b.wall - a.wall).slice(0, 8).map((x) => ({ wall: +x.wall.toFixed(1), simT: x.simT, heap: x.heap, shot: x.shot, cpu: +((x.update || 0) + (x.prepare || 0)).toFixed(1), parts: x.parts })) };
});
console.log(JSON.stringify(R, null, 1));
// self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]), cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${(cf.url || '').replace(/^.*\/js\//, '')}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (dts[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
console.log(`\nCPU profile, ${(total / 1e6).toFixed(1)} s sampled; self time:`);
for (const [k, v] of top) console.log(`${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`);
await b.close();
