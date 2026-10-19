// Procedural sound effects (no sample files). Every sound is synthesised into an AudioBuffer from noise, filters, damped
// resonances and sweeps; they are built lazily the first time they are needed. `makeLibrary(sampleRate, createBuffer)`
// returns a getter: lib.get('gun_big') -> AudioBuffer. The builders live by family in synth/*.js, the shared tools in synth/core.js.
import { GUNS } from './synth/guns.js';
import { IMPACTS } from './synth/impacts.js';
import { EXPLOSIONS } from './synth/explosions.js';
import { ENGINES } from './synth/engines.js';
import { AIRCRAFT } from './synth/aircraft.js';
import { AMBIENCE } from './synth/ambience.js';
export { makeReverbIR } from './synth/core.js';

const BUILDERS = { ...GUNS, ...IMPACTS, ...EXPLOSIONS, ...ENGINES, ...AIRCRAFT, ...AMBIENCE };

export const SOUND_NAMES = Object.keys(BUILDERS);

/** Lazily-built sound library. createBuffer(len, sr) must return an object with getChannelData(0). */
export function makeLibrary(sr, createBuffer) {
  const cache = new Map();
  return {
    get(name, arg) {
      const key = arg == null ? name : name + ':' + arg;
      let b = cache.get(key);
      if (!b) {
        const data = BUILDERS[name](sr, 1 + (arg || 0), arg);
        b = createBuffer(data.length, sr);
        b.getChannelData(0).set(data);
        cache.set(key, b);
      }
      return b;
    },
  };
}

/** Raw sample generation (for tests): returns a Float32Array. */
export function renderSound(name, sr = 22050, arg) { return BUILDERS[name](sr, 1, arg); }
