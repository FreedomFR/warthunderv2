// Explosions and torpedoes.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const EXPLOSIONS = {
  torpedo_hit(sr, seed = 14) {
    const r = prng(seed);
    const d = mk(sr, 5.4, (d, n) => {
      const bd = new SVF(sr), wt = new SVF(sr), rm = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (22 + 32 * Math.exp(-t * 1.9)) / sr;
        const boom = Math.sin(ph) * env(t, 0.006, 1.0) * 1.9 + 0.5 * Math.sin(ph * 2.02) * env(t, 0.006, 0.5);
        const blast = bd.step(nz, 90 + 520 * Math.exp(-t * 6), 0.8).lp * env(t, 0.004, 0.45) * 1.6;
        // water column collapsing
        const water = wt.step(nz, 900 * Math.exp(-(t - 0.2) * 1.4) + 250, 0.7).lp * env(Math.max(0, t - 0.2), 0.25, 0.9) * 1.1 * (t > 0.2 ? 1 : 0);
        ph2 += TAU * (68 - 24 * Math.min(1, t / 3)) / sr;
        const groan = Math.sin(ph2) * env(Math.max(0, t - 0.4), 0.4, 1.3) * 0.4 * (t > 0.4 ? 1 : 0);
        const rumble = rm.step(nz, 70, 0.8).lp * env(t, 0.05, 2.0) * 1.2;
        d[i] = softclip(boom + blast + water + groan + rumble);
      }
      const base = d.slice(); addEcho(d, base, sr, 0.4, 0.25, 300); addEcho(d, base, sr, 0.9, 0.15, 220);
    });
    return normalize(d);
  },
  torpedo_launch(sr, seed = 15) {
    const r = prng(seed);
    const d = mk(sr, 1.5, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (110 * Math.exp(-t * 9) + 50) / sr;
        d[i] = a.step(nz, 3000, 0.8).hp * env(t, 0.02, 0.2) * 0.7 + Math.sin(ph) * env(t, 0.003, 0.12) * 1.0 + l.step(nz, 700, 0.7).lp * env(Math.max(0, t - 0.15), 0.05, 0.3) * (t > 0.15 ? 0.5 : 0);
      }
    });
    return normalize(d, 0.85);
  },
  explosion_big(sr, seed = 16) {
    const r = prng(seed);
    const d = mk(sr, 9.0, (d, n) => {
      const bd = new SVF(sr), rm = new SVF(sr), cr = new SVF(sr), mid = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 700, 0.6).hp * env(t, 0.001, 0.05) * 1.0;
        const blast = bd.step(nz, 140 + 5200 * Math.exp(-t * 4.5), 0.8).lp * env(t, 0.003, 0.5) * 1.6;
        ph += TAU * (17 + 30 * Math.exp(-t * 1.0)) / sr;
        const boom = Math.sin(ph) * env(t, 0.01, 1.7) * 2.2 + 0.6 * Math.sin(ph * 2.0) * env(t, 0.01, 0.9);
        ph2 += TAU * (62 * Math.exp(-t * 0.5) + 30) / sr;
        const thump = Math.sin(ph2) * env(t, 0.02, 0.9) * 0.9;
        const rumble = rm.step(nz, 80 + 60 * Math.exp(-t * 0.7), 0.8).lp * env(t, 0.1, 3.6) * 1.8 * (0.7 + 0.3 * Math.sin(TAU * 2.3 * t + 2));
        const roar = mid.step(nz, 420, 0.7).lp * env(t, 0.05, 1.8) * 1.2;
        d[i] = softclip(crack + blast + boom + thump + rumble + roar);
      }
      // secondary detonations and the crackle of burning debris
      const sec = [[0.7, 0.55], [1.5, 0.42], [2.6, 0.3], [3.9, 0.22]];
      for (const [t0, g] of sec) { const i0 = Math.floor(t0 * sr); const bl = new SVF(sr); for (let i = 0; i < sr * 1.4 && i0 + i < n; i++) { const t = i / sr, nz = r() * 2 - 1; d[i0 + i] += (bl.step(nz, 200 + 1200 * Math.exp(-t * 7), 0.8).lp * env(t, 0.003, 0.28) * 1.2 + Math.sin(TAU * (40 + 20 * Math.exp(-t * 3)) * t) * env(t, 0.005, 0.4) * 1.0) * g; } }
      for (let i = Math.floor(0.6 * sr); i < n; i++) { const t = i / sr; if (r() < 0.025 * Math.exp(-(t - 0.6) * 0.5)) d[i] += (r() - 0.5) * 0.7 * Math.exp(-(t - 0.6) * 0.3); }
      const base = d.slice(); addEcho(d, base, sr, 0.55, 0.2, 260); addEcho(d, base, sr, 1.2, 0.14, 200);
    });
    return normalize(d);
  },
  explosion_med(sr, seed = 17) {
    const r = prng(seed);
    const d = mk(sr, 4.2, (d, n) => {
      const bd = new SVF(sr), rm = new SVF(sr), cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 900, 0.6).hp * env(t, 0.0007, 0.03) * 1.0;
        const blast = bd.step(nz, 180 + 3500 * Math.exp(-t * 6), 0.8).lp * env(t, 0.003, 0.32) * 1.5;
        ph += TAU * (30 + 40 * Math.exp(-t * 2.2)) / sr;
        const boom = Math.sin(ph) * env(t, 0.006, 0.8) * 1.6;
        const rumble = rm.step(nz, 110, 0.8).lp * env(t, 0.06, 1.4) * 1.3;
        d[i] = softclip(crack + blast + boom + rumble);
      }
      for (let i = Math.floor(0.3 * sr); i < n; i++) { const t = i / sr; if (r() < 0.02 * Math.exp(-(t - 0.3) * 0.9)) d[i] += (r() - 0.5) * 0.6; }
      const base = d.slice(); addEcho(d, base, sr, 0.35, 0.22, 300);
    });
    return normalize(d);
  },
  explosion_small(sr, seed = 18) {
    const r = prng(seed);
    const d = mk(sr, 2.0, (d, n) => {
      const bd = new SVF(sr), cr = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 1400, 0.6).hp * env(t, 0.0005, 0.02) * 1.1;
        const blast = bd.step(nz, 260 + 3600 * Math.exp(-t * 9), 0.8).lp * env(t, 0.002, 0.2) * 1.4;
        const boom = Math.sin(TAU * (60 + 70 * Math.exp(-t * 5)) * t) * env(t, 0.003, 0.3) * 1.1;
        d[i] = softclip(crack + blast + boom);
      }
      const base = d.slice(); addEcho(d, base, sr, 0.2, 0.2, 800);
    });
    return normalize(d, 0.9);
  },
  boiler_burst(sr, seed = 23) {
    const r = prng(seed);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (40 + 50 * Math.exp(-t * 6)) * t) * env(t, 0.003, 0.3) * 1.3 + l.step(nz, 700, 0.7).lp * env(t, 0.003, 0.4) * 1.0 + a.step(nz, 4200, 0.8).hp * env(t, 0.03, 1.1) * 0.55;
      }
    });
    return normalize(d, 0.92);
  },
};
