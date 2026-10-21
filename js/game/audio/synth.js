// Procedural sound effects (no sample files). Every sound is synthesised into an AudioBuffer from noise, filters, damped
// resonances and sweeps; they are built lazily the first time they are needed. `makeLibrary(sampleRate, createBuffer)`
// returns a library: lib.pick('gun_big') -> an AudioBuffer, one of several variants (never the same one twice in a row).
// The builders live by family in synth/*.js, the shared tools in synth/core.js, the loudness targets in synth/levels.js.
import { GUNS } from './synth/guns.js';
import { IMPACTS } from './synth/impacts.js';
import { EXPLOSIONS } from './synth/explosions.js';
import { ENGINES } from './synth/engines.js';
import { AIRCRAFT } from './synth/aircraft.js';
import { AMBIENCE } from './synth/ambience.js';
import { WATER } from './synth/water.js';
import { hashName, levelDb, limit } from './synth/core.js';
import { TARGET_DBA } from './synth/levels.js';
export { makeReverbIR } from './synth/core.js';

const BUILDERS = { ...GUNS, ...IMPACTS, ...EXPLOSIONS, ...ENGINES, ...AIRCRAFT, ...AMBIENCE, ...WATER };

export const SOUND_NAMES = Object.keys(BUILDERS);

// loops (one buffer each: they repeat anyway and their pitch moves with the source) and the long one-shots (3 variants: memory)
const LOOPS = new Set(['engine_radial', 'engine_inline', 'siren', 'wind', 'bow_wave', 'fire', 'ship_engine', 'inrush', 'slosh', 'surf', 'torpedo_run', 'air_raid', 'pump', 'steam_vent', 'ground_roll', 'turbine', 'cavitation', 'turret_motor', 'swell']);
const LONG = new Set(['gun_big', 'explosion_big', 'torpedo_hit', 'impact_pen', 'splash_big', 'rubble', 'water_rush', 'bubbles_big', 'engine_sputter']);
/** How many variants each sound has: the same recording heard twice in a row is the first thing that gives synthetic sound away. */
export const VARIANTS = Object.fromEntries(SOUND_NAMES.map((n) => [n, LOOPS.has(n) ? 1 : LONG.has(n) ? 3 : 4]));

/** One calibrated variant of a sound (a Float32Array). `arg` is a parameter of the sound (calibre, cylinder count, ...). */
function build(name, sr, arg, variant = 0, calibrate = true) {
  const seed = hashName(name) + variant * 7919 + (arg || 0) * 31;
  const d = BUILDERS[name](sr, seed, arg);
  // scale to the target A-weighted level (peaks may go beyond full scale: the master bus limits them), never past a sanity ceiling
  let target = TARGET_DBA[name];
  if (typeof target === 'function') target = target(arg);
  if (target != null && calibrate) {
    const k = Math.pow(10, (target - levelDb(d, sr)) / 20);
    for (let i = 0; i < d.length; i++) d[i] *= k;
    limit(d, 3);
  }
  return d;
}

/** Lazily-built sound library. createBuffer(len, sr) must return an object with getChannelData(0). */
export function makeLibrary(sr, createBuffer, pool = null) {
  const cache = new Map(), last = new Map();
  // the background build: a queue of [name, arg, variant], built one per timer tick (at once, with no delay, when `ready` has been asked for)
  const queue = [], queued = new Set(), waiters = [], listeners = [];
  let total = 0, done = 0, pumping = false, eager = false;
  // with a `pool` ({ size, run(name, sr, arg, variant) -> Promise<Float32Array> }: web workers, see audio/synthPool.js) the buffers are
  // built on other threads, several at a time, and the page never stops; without one (tests, a browser without workers) they are built
  // here, one per timer tick
  let inflight = 0;
  const finish = () => { pumping = false; listeners.length = 0; for (const r of waiters.splice(0)) r(); };
  const store = (j, data) => {
    const key = j[0] + ':' + (j[1] ?? '') + ':' + j[2];
    if (!cache.has(key)) { const b = createBuffer(data.length, sr); b.getChannelData(0).set(data); cache.set(key, b); }
    done++; for (const f of listeners) f(done, total);
  };
  const pumpPool = () => {
    while (pool && inflight < pool.size && queue.length) {
      const j = queue.shift();
      inflight++;
      pool.run(j[0], sr, j[1], j[2]).then((data) => store(j, data), () => { get(...j); done++; for (const f of listeners) f(done, total); }).then(() => { inflight--; pumpPool(); });
    }
    if (!queue.length && !inflight) finish();
  };
  const pump = (delay) => setTimeout(() => {
    if (pool) { pumpPool(); return; }
    const j = queue.shift();
    if (j) { get(...j); done++; for (const f of listeners) f(done, total); }
    if (queue.length) pump(0);
    else finish();
  }, eager ? 0 : delay);
  const get = (name, arg, variant = 0) => {
    const key = name + ':' + (arg ?? '') + ':' + variant;
    let b = cache.get(key);
    if (!b) {
      const data = build(name, sr, arg, variant);
      b = createBuffer(data.length, sr);
      b.getChannelData(0).set(data);
      cache.set(key, b);
    }
    return b;
  };
  return {
    get,
    /** A random variant, different from the last one handed out for this sound. */
    pick(name, arg) {
      const n = VARIANTS[name] || 1, key = name + ':' + (arg ?? '');
      let v = n > 1 ? Math.floor(Math.random() * n) : 0;
      if (n > 1 && v === last.get(key)) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n;
      last.set(key, v);
      return get(name, arg, v);
    },
    /**
     * Builds everything in the background, one buffer per timer tick, so that no sound has to be built in the middle of a fight.
     * Calling it again adds nothing (the jobs are queued once); the promise resolves when the queue is empty.
     */
    warm(list = SOUND_NAMES) {
      for (const n of list) {
        if (queued.has(n)) continue;
        queued.add(n);
        if (n === 'aa_burst') { for (const c of [20, 25, 40]) for (let v = 0; v < VARIANTS[n]; v++) queue.push([n, c, v]); }
        else for (let v = 0; v < VARIANTS[n]; v++) queue.push([n, undefined, v]);
      }
      total = queue.length + done;
      if (!pumping) { pumping = true; pump(400); }
      return new Promise((r) => { if (!queue.length) r(); else waiters.push(r); });
    },
    /**
     * Builds what is left now (the loading screen before a battle): no start delay, a tick per buffer so that the page can draw the
     * progress. `onProgress(done, total)` is called after each buffer; the promise resolves when everything is built.
     */
    ready(onProgress) {
      if (onProgress) listeners.push(onProgress);
      eager = true;
      const p = this.warm();
      if (onProgress) onProgress(done, total);
      return p.then(() => { eager = false; });
    },
    /** How many buffers are still to be built (0 when the library is complete). */
    pending: () => queue.length,
  };
}

/** Raw sample generation (for tests and tools): returns a Float32Array, calibrated like the game's. */
export function renderSound(name, sr = 22050, arg, variant = 0, calibrate = true) { return build(name, sr, arg, variant, calibrate); }
