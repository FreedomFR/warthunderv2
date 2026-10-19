// Ambience loops and damage creaks.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const AMBIENCE = {
  hull_groan(sr, seed = 21) {
    const r = prng(seed);
    const d = mk(sr, 3.6, (d, n) => {
      let ph = 0, ph2 = 0; const f0 = 62 + r() * 30;
      const lo = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const g = Math.sin(Math.PI * t / 3.6) ** 1.5;
        ph += TAU * (f0 + 22 * Math.sin(t * 1.9) + 14 * t) / sr; ph2 += TAU * (f0 * 1.51 + 9 * Math.sin(t * 2.7)) / sr;
        // stick-slip: the metal sticks and slips in bursts
        const slip = 0.55 + 0.45 * Math.sin(TAU * (7 + 3 * Math.sin(t)) * t) ** 2;
        d[i] = (Math.sin(ph) * 0.9 + Math.sin(ph * 2) * 0.35 + Math.sin(ph2) * 0.3 + lo.step(nz, 400, 1.5).bp * 0.5) * g * slip;
      }
    });
    return normalize(d, 0.75);
  },
  /** Wind and slipstream (loops). */
  wind(sr, seed = 28) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, 700 + 400 * Math.sin(TAU * t / 3), 0.9).bp * 0.9 + b.step(nz, 140, 0.7).lp * 0.5;
      }
      // crossfade the end into the start so that the loop is seamless
      const x = Math.floor(0.25 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.7);
  },
  /** Water along a moving hull: the hiss of the bow wave under a slow swell of the sea (loops). */
  bow_wave(sr, seed = 38) {
    const r = prng(seed);
    const d = mk(sr, 4.0, (d, n) => {
      const hiss = new SVF(sr), body = new SVF(sr), thud = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const swell = 0.55 + 0.3 * Math.sin(TAU * t / 4) + 0.15 * Math.sin(TAU * t * 0.75 + 1.3);       // whole periods in the loop length
        const slap = Math.max(0, Math.sin(TAU * t * 0.5 + 0.6 * Math.sin(TAU * t / 4))) ** 6;              // waves slapping the stem every two seconds
        d[i] = hiss.step(nz, 2600 + 900 * swell, 0.7).bp * 0.5 * swell + body.step(nz, 420, 0.8).lp * 0.8 * (0.5 + 0.5 * slap) + thud.step(nz, 90, 0.9).lp * slap * 1.2;
      }
      const x = Math.floor(0.3 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.7);
  },
  /** Fire: crackle, hiss and a low roar (loops). */
  fire(sr, seed = 29) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let pop = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        if (r() < 0.0016) pop = 0.55 + r() * 0.6;
        pop *= 0.992;
        d[i] = a.step(nz, 2400, 0.8).hp * 0.08 + b.step(nz, 170 + 60 * Math.sin(TAU * t / 3 * 2), 0.8).lp * 0.8 * (0.8 + 0.2 * Math.sin(TAU * 0.67 * t)) + (nz * pop) * 0.7;
      }
      const x = Math.floor(0.25 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.7);
  },
  /** Gurgling water in a flooding compartment (loops). */
  gurgle(sr, seed = 31) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (260 + 180 * Math.sin(TAU * 2.6 * t) + 120 * Math.sin(TAU * 7.3 * t)) / sr;
        d[i] = a.step(nz, 520, 1.3).bp * 0.6 * (0.6 + 0.4 * Math.sin(TAU * 5 * t)) + Math.sin(ph) * 0.2 * (0.5 + 0.5 * Math.sin(TAU * 3.4 * t) ** 2);
      }
      const x = Math.floor(0.2 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.6);
  },
};
