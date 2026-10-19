// Audio engine smoke test with a stub Web Audio API: every sound is synthesised, every battle event is mapped, the
// continuous voices follow their sources.   node test/audio.mjs
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { SOUND_NAMES, VARIANTS, renderSound, makeLibrary } from '../js/game/audio/synth.js';
import { levelDb } from '../js/game/audio/synth/core.js';
import { TARGET_DBA } from '../js/game/audio/synth/levels.js';
import { airAbsorption, airCutoff, seaEchoDelay } from '../js/game/audio/propagation.js';

// ---- minimal Web Audio stub ----
const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
class Node { constructor() { this.delayTime = param(); this.gain = param(); this.frequency = param(); this.pan = param(); this.Q = param(); this.positionX = param(); this.positionY = param(); this.positionZ = param(); this.playbackRate = param(); this.buffer = null; } connect(n) { return n; } disconnect() {} start() { this.started = true; } stop() {} }
class Ctx {
  constructor() { this.sampleRate = 22050; this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
  createGain() { return new Node(); } createBiquadFilter() { const n = new Node(); (this.filters ||= []).push(n); return n; } createDynamicsCompressor() { const n = new Node(); n.threshold = param(); n.knee = param(); n.ratio = param(); n.attack = param(); n.release = param(); return n; }
  createBufferSource() { const n = new Node(); this.sources = (this.sources || 0) + 1; return n; } createStereoPanner() { return new Node(); } createPanner() { this.panners = (this.panners || 0) + 1; return new Node(); } createConvolver() { return new Node(); } createOscillator() { return new Node(); }
  createDelay() { return new Node(); } createWaveShaper() { return new Node(); }
  createBuffer(ch, len, sr) { const d = new Float32Array(len); return { length: len, duration: len / sr, sampleRate: sr, getChannelData: () => d }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = Ctx;
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {};

const { GameAudio } = await import('../js/game/audio.js');
let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// every sound synthesises without NaN, at its target level, and without a runaway peak
const argOf = (n) => (n === 'aa_burst' ? 20 : n === 'shell_crack' ? 203 : undefined);
const lvl = {};
for (const n of SOUND_NAMES) {
  const d = renderSound(n, 22050, argOf(n));
  let peak = 0, bad = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (!(a <= 4.1)) bad++; if (a > peak) peak = a; }
  const t = typeof TARGET_DBA[n] === 'function' ? TARGET_DBA[n](argOf(n)) : TARGET_DBA[n];
  lvl[n] = levelDb(d, 22050);
  ok(bad === 0 && peak > 0.03 && peak <= 4.1 && Math.abs(lvl[n] - t) < 1.2, `sound ${n}: ${(d.length / 22050).toFixed(1)} s, peak ${peak.toFixed(2)}, level ${lvl[n].toFixed(1)} (target ${t})`);
}
// the loudness hierarchy of the sources: a battleship salvo above a cruiser's, above a destroyer's, above AA; a magazine above a hit
ok(lvl.gun_big > lvl.gun_med && lvl.gun_med > lvl.gun_small && lvl.gun_small > lvl.aa_burst, 'loudness follows the calibre: gun_big > gun_med > gun_small > aa_burst');
ok(lvl.explosion_big > lvl.explosion_med && lvl.explosion_med > lvl.explosion_small, 'loudness follows the size of the blast');
ok(lvl.torpedo_hit > lvl.splash_big && lvl.splash_big > lvl.splash_small, 'a torpedo is louder than a big splash, a big splash than a small one');

// variants: every one-shot has several, they differ from each other (not the same recording heard twice), and the library never repeats one twice in a row
{
  let same = 0;
  for (const n of SOUND_NAMES) {
    if (VARIANTS[n] < 2) continue;
    const x = renderSound(n, 22050, argOf(n), 0), y = renderSound(n, 22050, argOf(n), 1);
    let diff = 0; for (let i = 0; i < Math.min(x.length, y.length); i++) diff += Math.abs(x[i] - y[i]);
    if (!(diff / x.length > 1e-4)) same++;
  }
  ok(same === 0, 'the variants of a sound differ from each other (' + same + ' identical)');
  const n3 = SOUND_NAMES.filter((n) => VARIANTS[n] >= 3).length;
  ok(n3 >= 20, `${n3} sounds have 3 or 4 variants`);
  const lib = makeLibrary(22050, (n, sr) => ({ length: n, getChannelData: () => new Float32Array(n), sr })); const seq = [];
  for (let i = 0; i < 12; i++) seq.push(lib.pick('splash_big'));
  ok(seq.every((x, i) => i === 0 || x !== seq[i - 1]) && new Set(seq).size === VARIANTS.splash_big, 'the library never plays the same variant twice in a row, and uses them all');
}

// loops must not click where they wrap, and the piston engines hold the firing note of their cylinder count
{
  const loops = ['engine_radial', 'engine_inline', 'ship_engine', 'turbine', 'cavitation', 'turret_motor', 'wind', 'bow_wave', 'fire', 'gurgle', 'swell', 'siren'];
  let worst = 0, wn = '';
  for (const n of loops) {
    const d = renderSound(n, 22050);
    let mean = 0; for (let i = 1; i < d.length; i++) mean += Math.abs(d[i] - d[i - 1]); mean /= d.length - 1;
    const jump = Math.abs(d[0] - d[d.length - 1]) / mean;
    if (jump > worst) { worst = jump; wn = n; }
  }
  ok(worst < 6, `loops wrap without a click (worst ${wn}: jump ${worst.toFixed(1)} times the mean step)`);
  const goertzel = (d, sr, f) => { const w = 2 * Math.PI * f / sr; let c = 0, s1 = 0; for (let i = 0; i < d.length; i++) { c += d[i] * Math.cos(w * i); s1 += d[i] * Math.sin(w * i); } return Math.hypot(c, s1) / d.length; };
  for (const cyl of [9, 14, 18]) {
    const d = renderSound('engine_radial', 22050, cyl), f = cyl * 20;      // rpm * cylinders / 120 at the reference 2400 rpm
    const peak = goertzel(d, 22050, f), off = (goertzel(d, 22050, f * 0.8) + goertzel(d, 22050, f * 1.15)) / 2;
    ok(peak > 2 * off, `a ${cyl}-cylinder radial has its firing note at ${f} Hz (${(peak / off).toFixed(1)}x the neighbouring bands)`);
  }
}

// the shock wave of a shell: an N-wave whose length grows with the calibre (Whitham), a deep thump for a 406 mm, a snap for a 20 mm
{
  const firstZero = (d, sr) => { let i = 0; while (i < d.length && d[i] <= 0) i++; while (i < d.length && d[i] > 0) i++; return i / sr; };
  const t406 = firstZero(renderSound('shell_crack', 44100, 406), 44100), t20 = firstZero(renderSound('shell_crack', 44100, 20), 44100);
  ok(t406 > 6 * t20 && t406 > 0.002 && t406 < 0.02, `N-wave: positive phase ${(t406 * 1000).toFixed(1)} ms for 406 mm, ${(t20 * 1000).toFixed(2)} ms for 20 mm`);
}

// air absorption (ISO 9613-1): values of the standard at 20 deg C, 70 % humidity, and a low-pass that closes with distance
{
  const k = (f) => airAbsorption(f, 20, 70) * 1000;
  ok(k(1000) > 3 && k(1000) < 7 && k(4000) > 15 && k(4000) < 40 && k(8000) > 50 && k(8000) < 130 && k(125) < 1, `absorption at 20 C / 70 %: 125 Hz ${k(125).toFixed(2)}, 1 kHz ${k(1000).toFixed(1)}, 4 kHz ${k(4000).toFixed(1)}, 8 kHz ${k(8000).toFixed(0)} dB/km`);
  ok(airAbsorption(4000, 20, 70) < airAbsorption(4000, 20, 20), 'dry air absorbs more than humid air at 4 kHz');
  ok(airCutoff(200) > airCutoff(1000) && airCutoff(1000) > airCutoff(3000) && airCutoff(3000) >= 500, `the air low-pass closes with distance (200 m ${airCutoff(200).toFixed(0)}, 1 km ${airCutoff(1000).toFixed(0)}, 3 km ${airCutoff(3000).toFixed(0)} Hz)`);
  const e1 = seaEchoDelay(300, 15, 40), e2 = seaEchoDelay(3000, 15, 40);
  ok(e1 > e2 && e1 < 0.02 && e2 > 0, `the sea reflection lags the direct sound by less when the source is far (${(e1 * 1000).toFixed(1)} ms at 300 m, ${(e2 * 1000).toFixed(2)} ms at 3 km)`);
}

// a German + Japanese carrier battle drives the audio engine
const w = new World(21);
w.addTeam(0); w.addTeam(1);
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
[parse('graf_zeppelin:1,bismarck:1,type1936a_mob:1'), parse('shokaku:1,yamato:1,kagero:1')].forEach((f, i) => { const s = teamStart(i, 2, 9000); spawnFleet(w, i, f, s.x, s.z, s.heading); });
for (const s of w.ships) s.cmd.throttle = 0.7;
w.start();
const cam = { x: 0, y: 40, z: 0, yaw: 0, pitch: 0 };
const game = { world: w, engine: { cam }, timeScale: 1, paused: false, state: 'running', camera: { mode: 'free', target: null, plane: null } };
const a = new GameAudio(game);
a.unlock();
const names = new Set();
const orig = a.play.bind(a);
a.play = (name, ...rest) => { names.add(name); return orig(name, ...rest); };
let events = 0, loopsMax = 0, bowSeen = false;
const seenKinds = new Set();
for (let i = 0; i < 6000; i++) {
  w.update(0.1);
  const ev = w.drainEvents();
  events += ev.length;
  cam.x = (w.ships[0].x + w.ships[w.ships.length - 1].x) / 2; cam.z = (w.ships[0].z + w.ships[w.ships.length - 1].z) / 2;
  if (i >= 300 && i < 400) { cam.x = w.ships[0].x + 120; cam.z = w.ships[0].z; }        // a camera close to a ship under way
  a.onEvents(ev); a.update(0.1);
  a.active = Math.min(a.active, 20);          // the stub never ends a sound
  loopsMax = Math.max(loopsMax, a.loops.size);
  for (const k of a.loops.keys()) { seenKinds.add(k.slice(0, 2)); if (k.startsWith('sb')) bowSeen = true; }
}
ok(events > 5000, `${events} battle events went through the audio engine without error`);
for (const n of ['gun_big', 'gun_small', 'aa_burst', 'splash_big', 'impact_he', 'impact_pen']) ok(names.has(n), `sound used: ${n}`);
ok(bowSeen, 'the bow wave is heard along ships under way');
ok(seenKinds.has('st'), 'the turbines of a ship close to the camera whine');
console.log('voice kinds seen in the battle:', [...seenKinds].sort().join(' '));
ok(loopsMax > 0, `continuous voices followed their sources (up to ${loopsMax})`);
// the blast of a heavy gun next to the listener ducks and muffles the master bus, which then recovers
{
  a.shock = 0;
  const ship = w.ships[0];
  a.onEvents([{ type: 'muzzle', cal: 406, n: 3, x: cam.x + 60, y: cam.y, z: cam.z, mount: null, ship }]);
  ok(a.shock > 0.5, `a 406 mm gun 60 m away shocks the ears (${a.shock.toFixed(2)})`);
  for (let i = 0; i < 60; i++) a.update(0.1);
  ok(a.shock < 0.05, 'and the ringing fades in a few seconds');
  a.shock = 0;
  a.onEvents([{ type: 'muzzle', cal: 406, n: 3, x: cam.x + 5000, y: cam.y, z: cam.z, mount: null, ship }]);
  ok(a.shock === 0, 'a distant salvo does not');
  a.setHrtf(true);
  const before = a.ctx.panners || 0;
  a.play('gun_big', cam.x + 300, cam.y, cam.z, { pri: 3, ref: 2400 });
  ok((a.ctx.panners || 0) === before + 1, 'with headphones the loud sounds go through an HRTF panner');
  a.setHrtf(false);
}
// a shell passing close: the rush is timed to peak at the closest point, a supersonic shell adds its N-wave, a slow one does not
{
  const calls = [], keep = a.play;
  a.play = (name, x, y, z, o) => { calls.push({ name, o }); return null; };
  const c0 = { x: 0, y: 40, z: 0 };
  const shell = (id, vx) => ({ id, x: c0.x - 400, y: c0.y, z: c0.z - 80, vx, vy: 0, vz: 0, gun: { cal: 406 } });
  const fake = { shells: [shell(987001, 600), shell(987002, 250), { ...shell(987003, 600), x: 400 }], bombs: [] };
  a.scanT = 0; a.scan(fake, c0, 0.1);
  const rush = calls.filter((c) => c.name === 'shell_rush'), crack = calls.filter((c) => c.name === 'shell_crack');
  ok(rush.length === 2 && rush[0].o.offset > 0.5 && rush[0].o.when === 0, 'a shell that will pass in 0.7 s starts its rush 0.7 s into the sound, so that it peaks at the closest point');
  ok(crack.length === 1 && crack[0].o.arg === 406 && Math.abs(crack[0].o.when - (400 / 600 + 80 / (343 * 1.3))) < 0.02, 'a supersonic shell adds the N-wave of its shock cone just after the closest point; a subsonic one and a departing one do not');
  // a gun crew: the turret motor hums while a mount trains, the breech clunks when it has loaded
  calls.length = 0;
  const mount = { alive: true, gun: { cal: 406 }, trainRel: 0, reload: 2, rec: { x: 0, y: 5, z: 0 } };
  const ship = { id: 77, mounts: [mount], toWorld: (x, y, z, o) => { o[0] = 100; o[1] = 5; o[2] = 0; return o; } };
  a.game.engine.cam.x = 0; a.game.engine.cam.y = 40; a.game.engine.cam.z = 0;
  a.turrets(ship, 0, 0.1);
  mount.trainRel = 0.02; mount.reload = 0;
  const started = a.turrets(ship, 0, 0.1);
  ok(started === 1 && a.loops.has('sm77'), 'a turret that trains close to the camera hums');
  ok(calls.some((c) => c.name === 'breech'), 'the breech clunks when a mount finishes loading');
  a.play = keep;
  // the air closes the highs of a far sound (the low-pass of the voice follows ISO 9613-1) and the loud ones get the reflection off the sea
  const f0 = (a.ctx.filters || []).length;
  a.play('gun_big', 300, 40, 0, { pri: 3, ref: 2400 });
  const near = a.ctx.filters.slice(f0).filter((n) => n.frequency.value > 0).map((n) => n.frequency.value);
  const f1 = a.ctx.filters.length;
  a.play('gun_big', 3300, 40, 0, { pri: 3, ref: 2400 });
  const far = a.ctx.filters.slice(f1).filter((n) => n.frequency.value > 0).map((n) => n.frequency.value);
  ok(near.length >= 3 && far.length >= 3 && far[0] < near[0] * 0.5, `a gun 3 km away is low-passed much lower than at 300 m (${far[0].toFixed(0)} Hz against ${near[0].toFixed(0)} Hz)`);
}
console.log('sounds played:', [...names].sort().join(' '));
console.log(fail ? `${fail} check(s) failed` : 'audio OK');
