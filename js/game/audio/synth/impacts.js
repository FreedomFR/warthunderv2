// Impacts on water and steel, structural damage.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const IMPACTS = {
  splash_small(sr, seed = 8) {
    const r = prng(seed);
    const d = mk(sr, 1.2, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, 2600 * Math.exp(-t * 3) + 500, 0.7).lp * env(t, 0.006, 0.12) * 1.1 + l.step(nz, 180, 0.7).lp * env(t, 0.01, 0.16) * 0.8
          + (r() < 0.012 * Math.exp(-t * 3) ? (r() - 0.5) * 0.9 : 0);
      }
    });
    return normalize(d, 0.85);
  },
  splash_big(sr, seed = 9) {
    const r = prng(seed);
    const d = mk(sr, 3.6, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr), s = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (60 + 30 * Math.exp(-t * 2)) / sr;
        const roar = a.step(nz, 1700 * Math.exp(-t * 1.6) + 300, 0.7).lp * env(t, 0.02, 0.55) * 1.2;
        const body = l.step(nz, 110, 0.8).lp * env(t, 0.03, 0.9) * 1.1 + Math.sin(ph) * env(t, 0.01, 0.35) * 0.9;
        // water falling back: patter
        const patter = (r() < 0.05 * Math.exp(-(t - 0.4) * 1.1) && t > 0.35 ? (r() - 0.5) * 0.7 : 0) + s.step(nz, 3200, 0.7).hp * env(Math.max(0, t - 0.4), 0.2, 0.7) * 0.08 * (t > 0.4 ? 1 : 0);
        d[i] = softclip(roar + body + patter);
      }
    });
    return normalize(d, 0.92);
  },
  impact_he(sr, seed = 10) {
    const r = prng(seed);
    const d = mk(sr, 2.2, (d, n) => {
      const cr = new SVF(sr), bd = new SVF(sr), cl = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 1500, 0.6).hp * env(t, 0.0004, 0.018) * 1.3;
        const blast = bd.step(nz, 300 + 2800 * Math.exp(-t * 9), 0.8).lp * env(t, 0.002, 0.2) * 1.3;
        ph += TAU * (50 + 50 * Math.exp(-t * 5)) / sr;
        const boom = Math.sin(ph) * env(t, 0.004, 0.32) * 1.1;
        const clatter = (r() < 0.04 * Math.exp(-(t - 0.05) * 3) && t > 0.04 ? (r() - 0.5) * 0.9 : 0) + cl.step(nz, 5200, 0.8).hp * env(Math.max(0, t - 0.05), 0.02, 0.4) * 0.07;
        d[i] = softclip(crack + blast + boom + clatter);
      }
      // metal ringing of the struck plating
      ring(d, sr, 0.01, 410, 0.22, 0.18); ring(d, sr, 0.01, 830, 0.16, 0.12); ring(d, sr, 0.012, 1370, 0.1, 0.09); ring(d, sr, 0.012, 2250, 0.06, 0.06);
    });
    return normalize(d);
  },
  /** Armour-piercing shell detonating inside the hull: deep, muffled, long. */
  impact_pen(sr, seed = 11) {
    const r = prng(seed);
    const d = mk(sr, 3.6, (d, n) => {
      const cr = new SVF(sr), bd = new SVF(sr), rm = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 600, 0.6).hp * env(t, 0.0005, 0.02) * 0.7;
        const blast = bd.step(nz, 140 + 700 * Math.exp(-t * 6), 0.8).lp * env(t, 0.004, 0.32) * 1.7;
        ph += TAU * (32 + 40 * Math.exp(-t * 2.4)) / sr;
        const boom = Math.sin(ph) * env(t, 0.008, 0.75) * 1.7;
        const rumble = rm.step(nz, 90, 0.8).lp * env(t, 0.05, 1.5) * 1.2 * (0.7 + 0.3 * Math.sin(TAU * 3.1 * t));
        d[i] = softclip(crack + blast + boom + rumble);
      }
      ring(d, sr, 0.03, 130, 0.25, 0.5); ring(d, sr, 0.03, 267, 0.15, 0.3);
      const base = d.slice(); addEcho(d, base, sr, 0.22, 0.25, 400); addEcho(d, base, sr, 0.5, 0.15, 250);
    });
    return normalize(d);
  },
  /** Shell ricochet / bounce off armour: whine and clang. */
  ricochet(sr, seed = 12) {
    const r = prng(seed);
    const d = mk(sr, 1.4, (d, n) => {
      const cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (3400 * Math.exp(-t * 2.2) + 900) / sr;
        d[i] = cr.step(nz, 2600, 0.8).hp * env(t, 0.0003, 0.012) * 1.1 + Math.sin(ph) * env(t, 0.004, 0.32) * 0.5;
      }
      ring(d, sr, 0.002, 1240, 0.35, 0.25); ring(d, sr, 0.002, 2480, 0.2, 0.18); ring(d, sr, 0.002, 3350, 0.12, 0.14); ring(d, sr, 0.002, 520, 0.3, 0.3);
    });
    return normalize(d, 0.9);
  },
  /** AP shell passing right through thin structure: a whack and a fading whistle. */
  impact_through(sr, seed = 13) {
    const r = prng(seed);
    const d = mk(sr, 1.0, (d, n) => {
      const cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (2200 * Math.exp(-t * 3.5) + 600) / sr;
        d[i] = cr.step(nz, 1600, 0.7).hp * env(t, 0.0004, 0.022) * 1.1 + Math.sin(ph) * env(t, 0.01, 0.2) * 0.35 + Math.sin(TAU * 140 * t) * env(t, 0.002, 0.08) * 0.5;
      }
      ring(d, sr, 0.002, 760, 0.2, 0.1);
    });
    return normalize(d, 0.85);
  },
  /** Structure collapsing: tearing steel and a long crash. */
  crash_metal(sr, seed = 19) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const bd = new SVF(sr), hs = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const impact = bd.step(nz, 500 + 1800 * Math.exp(-t * 10), 0.8).lp * env(t, 0.003, 0.15) * 1.3;
        const scrape = hs.step(nz, 2200 + 600 * Math.sin(t * 7), 1.4).bp * env(Math.max(0, t - 0.05), 0.15, 0.7) * 0.5 * (t > 0.05 ? 1 : 0);
        d[i] = softclip(impact + scrape + Math.sin(TAU * 75 * t) * env(t, 0.004, 0.25) * 0.9);
      }
      for (let k = 0; k < 6; k++) { const t0 = 0.05 + r() * 1.4; ring(d, sr, t0, 300 + r() * 1800, 0.14, 0.05 + r() * 0.18); }
      for (let i = Math.floor(0.25 * sr); i < n; i++) { const t = i / sr; if (r() < 0.03 * Math.exp(-(t - 0.25) * 1.5)) d[i] += (r() - 0.5) * 0.9; }
    });
    return normalize(d, 0.9);
  },
  zap(sr, seed = 20) {
    const r = prng(seed);
    const d = mk(sr, 0.7, (d, n) => {
      const cr = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = cr.step(nz, 3500, 1.2).hp * env(t, 0.0003, 0.06) * (0.5 + 0.5 * Math.sin(t * 900)) + Math.sin(TAU * 220 * t) * env(t, 0.002, 0.1) * 0.4;
      }
    });
    return normalize(d, 0.7);
  },
  bulkhead(sr, seed = 22) {
    const r = prng(seed);
    const d = mk(sr, 2.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (48 + 30 * Math.exp(-t * 6)) * t) * env(t, 0.004, 0.25) * 1.3 + a.step(nz, 300 + 900 * Math.exp(-t * 4), 0.8).lp * env(t, 0.004, 0.4) * 1.1 + b.step(nz, 1500, 0.8).hp * env(Math.max(0, t - 0.05), 0.1, 0.6) * 0.25 * (t > 0.05 ? 1 : 0);
      }
      ring(d, sr, 0.003, 180, 0.3, 0.3);
    });
    return normalize(d, 0.9);
  },
  collision(sr, seed = 24) {
    const r = prng(seed);
    const d = mk(sr, 2.8, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (45 + 25 * Math.exp(-t * 4)) * t) * env(t, 0.01, 0.5) * 1.4 + a.step(nz, 260 + 900 * Math.exp(-t * 5), 0.8).lp * env(t, 0.006, 0.45) * 1.3 + b.step(nz, 2400 + 400 * Math.sin(t * 9), 1.5).bp * env(Math.max(0, t - 0.08), 0.2, 0.9) * 0.5 * (t > 0.08 ? 1 : 0);
      }
      for (let k = 0; k < 7; k++) ring(d, sr, 0.02 + r() * 1.1, 160 + r() * 900, 0.15, 0.1 + r() * 0.3);
    });
    return normalize(d, 0.92);
  },
};
