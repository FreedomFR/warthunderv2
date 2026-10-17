// Audio engine smoke test with a stub Web Audio API: every sound is synthesised, every battle event is mapped, the
// continuous voices follow their sources.   node test/audio.mjs
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { SOUND_NAMES, renderSound } from '../js/game/audio/synth.js';

// ---- minimal Web Audio stub ----
const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} });
class Node { constructor() { this.gain = param(); this.frequency = param(); this.pan = param(); this.playbackRate = param(); this.buffer = null; } connect(n) { return n; } disconnect() {} start() { this.started = true; } stop() {} }
class Ctx {
  constructor() { this.sampleRate = 22050; this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
  createGain() { return new Node(); } createBiquadFilter() { return new Node(); } createDynamicsCompressor() { const n = new Node(); n.threshold = param(); n.knee = param(); n.ratio = param(); n.attack = param(); n.release = param(); return n; }
  createBufferSource() { const n = new Node(); this.sources = (this.sources || 0) + 1; return n; } createStereoPanner() { return new Node(); } createConvolver() { return new Node(); } createOscillator() { return new Node(); }
  createBuffer(ch, len, sr) { const d = new Float32Array(len); return { length: len, duration: len / sr, sampleRate: sr, getChannelData: () => d }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = Ctx;
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = () => {};

const { GameAudio } = await import('../js/game/audio.js');
let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// every sound synthesises without NaN and with a sane level
for (const n of SOUND_NAMES) {
  const d = renderSound(n, 22050, n === 'aa_burst' ? 20 : undefined);
  let peak = 0, bad = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (!(a <= 2)) bad++; if (a > peak) peak = a; }
  ok(bad === 0 && peak > 0.2 && peak <= 1.05, `sound ${n}: ${(d.length / 22050).toFixed(1)} s, peak ${peak.toFixed(2)}`);
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
let events = 0, loopsMax = 0;
for (let i = 0; i < 6000; i++) {
  w.update(0.1);
  const ev = w.drainEvents();
  events += ev.length;
  cam.x = (w.ships[0].x + w.ships[w.ships.length - 1].x) / 2; cam.z = (w.ships[0].z + w.ships[w.ships.length - 1].z) / 2;
  a.onEvents(ev); a.update(0.1);
  a.active = Math.min(a.active, 20);          // the stub never ends a sound
  loopsMax = Math.max(loopsMax, a.loops.size);
}
ok(events > 5000, `${events} battle events went through the audio engine without error`);
for (const n of ['gun_big', 'gun_small', 'aa_burst', 'splash_big', 'impact_he', 'impact_pen']) ok(names.has(n), `sound used: ${n}`);
ok(loopsMax > 0, `continuous voices followed their sources (up to ${loopsMax})`);
console.log('sounds played:', [...names].sort().join(' '));
console.log(fail ? `${fail} check(s) failed` : 'audio OK');
