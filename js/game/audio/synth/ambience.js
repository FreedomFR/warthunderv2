// Ambience loops and damage creaks.
import { TAU, prng, SVF, mk, normalize, jit, seamless, ring } from './core.js';

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
  /**
   * A gull (1.5 s): the "kyow kyow kyow" of a herring gull, three falling calls, each a breathy buzz with strong harmonics under a
   * pitch that jumps up and glides down, a throat formant that follows it, the last call weaker.
   */
  gull(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 1.6;
    const calls = [0.05, 0.5 + 0.06 * r(), 0.98 + 0.08 * r()].map((t0, k) => ({ t0, f: J(1350, 0.1) * (1 - 0.06 * k), len: J(0.3, 0.15) * (1 - 0.1 * k), a: 1 - 0.25 * k }));
    const d = mk(sr, L, (d, n) => {
      const hiss = new SVF(sr), form = new SVF(sr);
      for (const c of calls) {
        let ph = 0;
        const i0 = Math.floor(c.t0 * sr), len = Math.floor(c.len * sr);
        for (let i = 0; i < len && i0 + i < n; i++) {
          const q = i / len, t = i / sr;
          // up in the first fifth, then down; a fast shake (the voice breaking) on top
          const f = c.f * (q < 0.2 ? 0.8 + q * 1.5 : 1.1 - 0.45 * (q - 0.2)) * (1 + 0.025 * Math.sin(TAU * 38 * t));
          ph += TAU * f / sr;
          const e = Math.sin(Math.PI * Math.pow(q, 0.7)) * c.a;
          let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(ph * h) / (h * 0.9);
          const nz = r() * 2 - 1;
          d[i0 + i] += (form.step(v, 2300, 1.2).bp * 1.4 + v * 0.3 + hiss.step(nz, 3000, 1).bp * 0.5) * e;
        }
      }
    });
    return normalize(d, 0.8);
  },
  /** A hull creaking as it works in the swell (1.1 s): a short stick-slip of steel plate, higher and lighter than the groan of a ship in trouble. */
  creak(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 1.2, f0 = J(210, 0.25);
    const d = mk(sr, L, (d, n) => {
      let ph = 0, ph2 = 0; const bp = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, g = Math.sin(Math.PI * t / L) ** 2;
        const slip = Math.sin(TAU * (19 + 11 * t) * t) > -0.2 ? 1 : 0.25;
        ph += TAU * (f0 + 70 * Math.sin(t * 5.1) + 90 * t) / sr; ph2 += TAU * f0 * 2.76 * (1 + 0.05 * Math.sin(t * 7.3)) / sr;
        d[i] = (Math.sin(ph) * 0.7 + Math.sin(ph2) * 0.35 + bp.step(nz, 900, 3).bp * 0.5) * g * slip;
      }
    });
    return normalize(d, 0.75);
  },
  /**
   * The air-raid siren of a base (loops, 12 s): a rotor siren winding up and down, the pitch rising slowly (the motor spinning up)
   * and falling away again, with the harmonics and the roughness of the chopped air, a little slower to fall than to rise.
   */
  air_raid(sr, seed) {
    const r = prng(seed), L = 12;
    const d = mk(sr, L, (d, n) => {
      let ph = 0, ph2 = 0;
      const lp = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, c = 0.5 - 0.5 * Math.cos(TAU * t / L), rise = Math.pow(c, 0.85);
        const f = 330 + 330 * rise;
        ph += TAU * f / sr; ph2 += TAU * f * 2.003 / sr;
        const chop = 0.88 + 0.12 * Math.sin(ph * 12);                    // the rotor's blades chopping the air
        const v = Math.sin(ph) + 0.55 * Math.sin(ph2 + 0.5) + 0.3 * Math.sin(ph * 3) + 0.14 * Math.sin(ph * 5);
        d[i] = lp.step(v * chop + (r() * 2 - 1) * 0.08, 3200, 0.7).lp * (0.55 + 0.45 * rise);
      }
    });
    return normalize(d, 0.7, true);
  },
  /** A ship's steam whistle (2.6 s): a low note with a second a major third above, a slow attack and a breath of steam, cut off by the valve. */
  horn(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 2.6, f0 = J(100, 0.18), dur = J(1.9, 0.1);
    const d = mk(sr, L, (d, n) => {
      let a = 0, b = 0, c = 0; const lp = new SVF(sr), br = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const e = Math.min(1, t / 0.22) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.08));
        const f = f0 * (0.97 + 0.03 * Math.min(1, t / 0.3)) * (1 + 0.003 * Math.sin(TAU * 5.2 * t));
        a += TAU * f / sr; b += TAU * f * 1.26 / sr; c += TAU * f * 1.5 / sr;
        let v = 0; for (let h = 1; h <= 7; h++) v += (Math.sin(a * h) + 0.8 * Math.sin(b * h + 1) + 0.5 * Math.sin(c * h + 2)) / (h * 1.1);
        d[i] = (lp.step(v, 2000, 0.7).lp * 0.7 + br.step(nz, 1800, 0.9).bp * 0.18) * e;
      }
    });
    return normalize(d, 0.8);
  },
  /** The general-quarters alarm (2.4 s): the navy's rapid gong, a bronze bell struck about six times a second, each stroke ringing into the next. */
  gq_gong(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 2.4, f0 = J(690, 0.05);
    const d = mk(sr, L, (d, n) => {
      for (let t = 0.02; t < 2.0; t += 1 / J(6.2, 0.05)) {
        const a = 0.85 + 0.15 * r();
        ring(d, sr, t, f0, a, 0.16); ring(d, sr, t, f0 * 2.4, a * 0.45, 0.09); ring(d, sr, t, f0 * 4.1, a * 0.22, 0.05); ring(d, sr, t, f0 * 0.5, a * 0.3, 0.2);
        const i0 = Math.floor(t * sr); for (let i = 0; i < 160 && i0 + i < n; i++) d[i0 + i] += (r() * 2 - 1) * 0.5 * Math.exp(-i / 40);        // the click of the clapper
      }
    });
    return normalize(d, 0.8);
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
