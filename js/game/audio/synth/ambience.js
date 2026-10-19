// Ambience loops and damage creaks.
import { TAU, prng, SVF, env, mk, normalize, jit, seamless } from './core.js';

export const AMBIENCE = {
  hull_groan(sr, seed) {
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
  wind(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 3.25, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, 700 + 400 * Math.sin(TAU * t / 3), 0.9).bp * 0.9 + b.step(nz, 140, 0.7).lp * 0.5;
      }
    });
    return normalize(seamless(d, sr, 0.25), 0.7, true);
  },
  /** Water along a moving hull: the hiss of the bow wave under a slow swell of the sea (loops). */
  bow_wave(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 4.3, (d, n) => {
      const hiss = new SVF(sr), body = new SVF(sr), thud = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const swell = 0.55 + 0.3 * Math.sin(TAU * t / 4) + 0.15 * Math.sin(TAU * t * 0.75 + 1.3);       // whole periods in the loop length
        const slap = Math.max(0, Math.sin(TAU * t * 0.5 + 0.6 * Math.sin(TAU * t / 4))) ** 6;              // waves slapping the stem every two seconds
        d[i] = hiss.step(nz, 2600 + 900 * swell, 0.7).bp * 0.5 * swell + body.step(nz, 420, 0.8).lp * 0.8 * (0.5 + 0.5 * slap) + thud.step(nz, 90, 0.9).lp * slap * 1.2;
      }
    });
    return normalize(seamless(d, sr, 0.3), 0.7, true);
  },
  /**
   * Fire (loops): a low roar that breathes, a bed of hiss, and the crackle that makes it fire: a lot of tiny ticks, mid pops
   * (some doubled) and a few big snaps of wood and paint, each a damped resonance at its own pitch.
   */
  fire(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 3.25, (d, n) => {
      const roar = new SVF(sr), hiss = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const flick = 0.75 + 0.25 * Math.sin(TAU * 0.67 * t) * Math.sin(TAU * 1.3 * t + 1);
        d[i] = roar.step(nz, 170 + 60 * Math.sin(TAU * t / 3), 0.8).lp * 0.8 * flick + hiss.step(nz, 1500, 0.7).bp * 0.12 * flick;
      }
      const pop = (t0, f, a, dec) => { const i0 = Math.floor(t0 * sr), len = Math.floor(sr * dec * 6); const f2 = f * (0.8 + 0.4 * r()); for (let i = 0; i < len && i0 + i < n; i++) d[i0 + i] += a * (Math.sin(TAU * f2 * i / sr) * 0.6 + (r() - 0.5)) * Math.exp(-i / sr / dec); };
      for (let t = 0; t < 3.25; t += 50 / sr) { if (r() < 40 * 50 / sr) pop(t, 3500 + 3500 * r(), 0.06 + 0.1 * r(), 0.0012); }       // ticks: about 40 a second
      for (let t = 0; t < 3.25; t += 0.01) { if (r() < 0.12) { const f = 900 + 1700 * r(), a = 0.12 + 0.2 * r(); pop(t, f, a, 0.004 + 0.006 * r()); if (r() < 0.2) pop(t + 0.015 + 0.02 * r(), f * 0.9, a * 0.6, 0.006); } }   // pops: about 12 a second
      for (let t = 0; t < 3.25; t += 0.05) { if (r() < 0.07) pop(t, 350 + 500 * r(), 0.35 + 0.3 * r(), 0.012 + 0.01 * r()); }                  // snaps: about one a second and a half
    });
    return normalize(seamless(d, sr, 0.25), 0.7, true);
  },
  /** Gurgling water in a flooding compartment (loops). */
  gurgle(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (260 + 180 * Math.sin(TAU * 2.6 * t) + 120 * Math.sin(TAU * 7.3 * t)) / sr;
        d[i] = a.step(nz, 520, 1.3).bp * 0.6 * (0.6 + 0.4 * Math.sin(TAU * 5 * t)) + Math.sin(ph) * 0.2 * (0.5 + 0.5 * Math.sin(TAU * 3.4 * t) ** 2);
      }
    });
    return normalize(seamless(d, sr, 0.2), 0.6, true);
  },
  /**
   * The sea itself (loops, 12 s): long swells washing past, each a slow rise and fall of a broad wash of noise, with a deep
   * pressure beneath it. The periods (12, 6 and 4 s) are whole numbers in the loop.
   */
  swell(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const d = mk(sr, 12.5, (d, n) => {
      const wash = new SVF(sr), deep = new SVF(sr), foam = new SVF(sr);
      const ph1 = r() * TAU, ph2 = r() * TAU, wf = J(600, 0.05);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const w = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 12 + ph1), 2) * 0.6 + Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 6 + ph2), 3) * 0.4;
        const crest = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 4 + 2 * w), 6);
        d[i] = wash.step(nz, wf + 700 * w, 0.7).bp * (0.15 + 0.85 * w) * 0.9 + deep.step(nz, 70, 0.8).lp * (0.4 + 0.6 * w) * 1.2 + foam.step(nz, 3000, 0.7).hp * crest * w * 0.12;
      }
    });
    return normalize(seamless(d, sr, 0.5), 0.7, true);
  },
};
