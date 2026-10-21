// The performance test's report: node test/bench.mjs — the figures of a view, what the A/B views say, the text of the report.
import { summarize, analyse, formatReport, PHASES } from '../js/game/ui/bench.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const fr = (ms, n, g = 0, u = 1, p = 0.5, spike = 0) => Array.from({ length: n }, (_, i) => ({ w: ms + (i % 10 === 0 ? spike : 0), g, u, p }));

const s = summarize(fr(16.7, 100, 0, 1, 0.5, 20));
ok(s.frames === 100 && s.fps > 50 && s.fps < 60 && s.over20 === 10 && s.over33 === 10 && s.ms.max > 36 && s.gpu === null, `the figures of a view (${s.fps.toFixed(1)} i/s, ${s.over20} frames over 20 ms, no GPU time)`);
ok(summarize([]).frames === 0 && summarize([]).fps === 0, 'an empty view gives zeros, not NaN');
ok(summarize(fr(10, 50, 4)).gpu.mean === 4, 'the GPU time is averaged when the device gives it');

// a device that is GPU-bound: the cost of the clouds and of the pixels, a slowdown with the heat
const mk = (id, ms, gpu, name = id) => ({ id, name, ...summarize(fr(ms, 120, gpu, 2, 1)) });
const ph = [mk('sea', 30, 28), mk('noclouds', 22, 20), mk('noshadow', 29, 27), mk('half', 18, 16), mk('fewp', 29, 27), mk('tactical', 20, 18), mk('sea2', 38, 36)];
const a = analyse(ph, true);
ok(a.costs['les nuages'] > 7 && a.costs['la moitié des pixels'] > 11 && a.costs['les ombres'] < 3, `the cost of each setting (clouds ${a.costs['les nuages'].toFixed(1)}, half the pixels ${a.costs['la moitié des pixels'].toFixed(1)} ms)`);
ok(a.notes.some((n) => /limité par le GPU/.test(n)) && a.notes.some((n) => /chauffant/.test(n)), `it says what limits the frame and that the device slows when it heats (${a.notes.length} notes)`);
const b = analyse([mk('sea', 16.7, 5), mk('sea2', 16.7, 5)], true);
ok(b.notes.some((n) => /plafonnée par l'écran \(60/.test(n)) && b.notes.some((n) => /pas de ralentissement/.test(n)), 'a frame that sits on the refresh of the screen is flagged as capped');
const c = analyse([mk('sea', 8.3, 3), mk('sea2', 8.3, 3)], true);
ok(c.notes.some((n) => /120/.test(n)), 'and so is a 120 Hz screen');
ok(analyse([mk('sea', 30, 0)], false).notes.some((n) => /non fourni/.test(n)), 'without GPU times the report says so and judges by the frame time');

const r = { version: 1, date: '2026-10-21 12:00', size: 'Bataille moyenne', device: { model: 'SM-S928B', platform: 'Android', platformVersion: '14', cores: 8, memory: 8, screen: [412, 915], dpr: 3.5 },
  gpu: { vendor: 'qualcomm', architecture: 'adreno-750', device: '', description: 'Adreno', isFallback: false }, hasTS: true, battery: { start: 80, end: 77, charging: false },
  settings: { quality: 'auto', qLevel: 2, renderScale: 0.76, canvas: [1100, 2440] }, phases: ph.concat([{ id: 'air', name: 'Vue d\'un avion en vol', frames: 0, skipped: 'aucun avion en vol à ce moment' }]), analysis: a };
const t = formatReport(r);
ok(/SM-S928B/.test(t) && /adreno-750/.test(t) && /Vue d'un avion en vol\s+aucun avion/.test(t) && /--- données ---/.test(t), 'the report names the device, the GPU, the views not played, and ends with the data');
const json = JSON.parse(t.split('--- données ---\n')[1]);
ok(json.phases.length === ph.length + 1 && json.device.model === 'SM-S928B', 'the data at the end is valid JSON');
ok(t.split('\n').length < 60 && PHASES.length === 15 && PHASES.every((p) => p.secs >= 6), `the report is short (${t.split('\n').length} lines); ${PHASES.length} views`);

// what the next round of work reads: the GPU time by pass, the CPU by part, the long tasks, the particle census, the new A/B views
import { histogram, worstFrames, meanPasses, particleCensus, HIST_EDGES } from '../js/game/ui/benchprobe.js';
{
  ok(histogram([5, 10, 15, 20, 30, 40, 60, 200]).join() === '1,1,1,1,1,1,1,1' && histogram([]).length === HIST_EDGES.length + 1, 'the frame times fall in bands (a steady 30 fps and a stuttering 60 are not the same thing)');
  const frs = [{ w: 16, at: 1, n: 100, g: 5 }, { w: 90, at: 2, n: 3000, g: 80 }, { w: 40, at: 3, n: 2000, g: 30 }];
  const wf = worstFrames(frs, 2);
  ok(summarize(Array.from({ length: 130 }, () => ({ w: 20, g: 0, u: 1, p: 1 }))).series.length === 2 && summarize(Array.from({ length: 130 }, () => ({ w: 20, g: 0, u: 1, p: 1 }))).series[0] === 50, 'the frame rate of each second is kept (a device that throttles shows there)');
  ok(wf.length === 2 && wf[0].ms === 90 && wf[0].at === 2 && wf[0].particles === 3000, 'the worst frames are kept with when they happened and how many particles there were');
  const mp = meanPasses([{ ps: { main: 10, sim: 2, shadow: 0 } }, { ps: { main: 20, sim: 2, shadow: 0 } }, { ps: null }]);
  ok(mp.main === 15 && mp.sim === 2 && !('shadow' in mp), 'the GPU passes are averaged, the ones that did not run are left out');
  ok(meanPasses([{ ps: null }]) === null, 'no GPU times: null');
}
{
  // a camera looking down -z with a 90 degree lens at a 1000x500 image: a puff 100 m ahead with a half-size of 100 m is as wide as the image is high (half a screen of area)
  const pool = new Float32Array(24 * 4);
  const put = (i, x, y, z, kind, size) => { const o = i * 24; pool[o] = x; pool[o + 1] = y; pool[o + 2] = z; pool[o + 6] = 0; pool[o + 7] = 10; pool[o + 8] = size; pool[o + 9] = size; pool[o + 19] = kind; };
  put(0, 0, 0, -100, 0, 100);                 // smoke, ahead
  put(1, 0, 0, 100, 0, 50);                   // smoke, behind the camera
  put(2, 5000, 0, -100, 2, 5);                // spray, far to the side
  put(3, 0, 0, -100, 1, 1);                   // fire, small
  const game = { particles: { n: 4, pool }, engine: { cam: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fovY: Math.PI / 2 }, stats: { width: 1000, height: 500 } } };
  const c = particleCensus(game);
  ok(c.total === 4 && c.inView === 2 && c.kinds.smoke.n === 2 && c.kinds.smoke.inView === 1 && c.kinds.spray.inView === 0, `the census counts what is in front of the lens (${c.inView} of ${c.total})`);
  ok(Math.abs(c.kinds.smoke.screens - 0.5) < 0.02 && c.kinds.smoke.big === 1, `and how many screens of it there are (${c.kinds.smoke.screens})`);
}
{
  const mk2 = (id, ms, gpu, extra = {}) => ({ id, name: id, ...summarize(Array.from({ length: 100 }, () => ({ w: ms, g: gpu, u: 1, p: 1, at: 1, n: 100, ps: extra.ps || null }))), ...extra.r });
  const ph2 = [mk2('sea', 50, 45, { ps: { main: 38, sim: 3, bloom: 2, composite: 2 }, r: { census: { total: 3000, inView: 2500, kinds: { smoke: { n: 1500, inView: 1200, screens: 4.2, big: 40 }, spray: { n: 500, inView: 400, screens: 0.5, big: 0 } } } } }),
    mk2('nopart', 32, 28), mk2('smoke0', 44, 40), mk2('smoke2', 48, 44), mk2('noocean', 40, 35), mk2('noopaque', 41, 36), mk2('notrees', 49, 44), mk2('sea2', 50, 45)];
  const a2 = analyse(ph2, true);
  ok(a2.costs['dessiner les particules'] > 15 && a2.costs['la mer'] > 8 && a2.costs['navires, avions, îles et bases'] > 8 && a2.costs['la végétation'] < 2, 'the cost of drawing the particles, the sea, the geometry and the trees');
  ok(a2.notes.some((n) => /niveau de détail 2 contre 0 : \+4\.0 ms/.test(n)), 'what the two levels of smoke detail cost on the device');
  ok(a2.notes.some((n) => /passes GPU.*passe principale.*84 %/.test(n)), 'the main pass share of the GPU is named');
  ok(a2.notes.some((n) => /1200 à l'écran sur 3000|2500 à l'écran sur 3000/.test(n) && /4\.7 écrans/.test(n)), 'and the particles to fill: how many, how many screens');
  const rep = formatReport({ ...r, phases: ph2.map((p) => ({ ...p, cpuParts: { sim: 3, fxEvents: 0.5, fxUpdate: 1, particles: 1.5, camera: 0.2, audio: 0.8, audioEvents: 0.1 }, long: { n: 2, totalMs: 130, maxMs: 80 } })), analysis: a2 });
  ok(/Passes GPU \(ms\)/.test(rep) && /Processeur \(ms par image\)/.test(rep) && /max 80 ms/.test(rep), 'the report has the GPU by pass and the CPU by part, with the long tasks');
  ok(JSON.parse(rep.split('--- données ---\n')[1]).phases[0].passes.main === 38, 'and the data keeps the passes');
}
{
  const m3 = (id, ms, gpu, particles) => ({ id, name: id, particles, ...summarize(Array.from({ length: 100 }, () => ({ w: ms, g: gpu, u: 1, p: 1 }))) });
  const cold = analyse([m3('sea', 60, 55, 2650), m3('sea2', 33, 28, 1600)], true);
  ok(cold.notes.some((n) => /démarrage à froid/.test(n) && /2650 puis 1600/.test(n)), 'a first view much slower than the last is called a cold start (or a battle that calmed down), with the particle counts to tell');
  ok(PHASES[0].warmup === true && PHASES.filter((p) => p.warmup).length === 1, 'the first seconds of a run are a warm-up that is not reported (kept apart as `prime` in the data)');
}
