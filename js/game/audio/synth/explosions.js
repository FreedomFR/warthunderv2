// Explosions and torpedoes. Built as a timed stack, as in published layered-explosion design: the crack at ignition, the pressure
// body, a low weight that swells under it, then debris, secondary blasts and the rolling echo.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, jit, bubble } from './core.js';

/** Debris coming down: a shower of small impacts, ticks and the odd clank, thinning out from t0 on. */
function debrisRain(d, sr, r, t0, rate, tau, amp) {
  const n = d.length;
  for (let i = Math.floor(t0 * sr); i < n; i++) {
    const t = i / sr - t0;
    if (r() < rate / sr * Math.exp(-t / tau)) {
      const len = Math.floor(sr * (0.004 + 0.02 * r())), a = amp * (0.3 + 0.7 * r()), f = 800 + 4200 * r();
      for (let k = 0; k < len && i + k < n; k++) d[i + k] += a * Math.sin(TAU * f * k / sr) * Math.exp(-k / len * 5) * (r() * 0.5 + 0.5);
    }
  }
}

export const EXPLOSIONS = {
  torpedo_hit(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const pf = J(22, 0.1), bf = J(90, 0.15), gf = J(68, 0.1);
    const d = mk(sr, 5.4, (d, n) => {
      const bd = new SVF(sr), wt = new SVF(sr), rm = new SVF(sr), sn = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (pf + 32 * Math.exp(-t * 1.9)) / sr;
        const boom = Math.sin(ph) * env(t, 0.006, 1.0) * 1.9 + 0.5 * Math.sin(ph * 2.02) * env(t, 0.006, 0.5);
        const blast = bd.step(nz, bf + 520 * Math.exp(-t * 6), 0.8).lp * env(t, 0.004, 0.45) * 1.6;
        // an underwater blast is felt as much as heard: a sharp front, then the water column collapsing
        const water = wt.step(nz, 900 * Math.exp(-(t - 0.2) * 1.4) + 250, 0.7).lp * env(Math.max(0, t - 0.2), 0.25, 0.9) * 1.1 * (t > 0.2 ? 1 : 0);
        ph2 += TAU * (gf - 24 * Math.min(1, t / 3)) / sr;
        const groan = Math.sin(ph2) * env(Math.max(0, t - 0.4), 0.4, 1.3) * 0.4 * (t > 0.4 ? 1 : 0);
        const rumble = rm.step(nz, 70, 0.8).lp * env(t, 0.05, 2.0) * 1.2;
        const snap = sn.step(nz, 800, 0.6).hp * friedlander(t, 0.003) * (t < 0.02 ? 1 : 0) * 1.2;
        d[i] = softclip(boom + blast + water + groan + rumble + snap);
      }
      for (let t = 0.5; t < 2.2; t += 0.003) if (r() < 0.35 * Math.exp(-(t - 0.5) * 1.5)) bubble(d, sr, t, 120 + 700 * r(), 0.06);
      const base = d.slice(); addEcho(d, base, sr, J(0.4, 0.2), 0.25, 300); addEcho(d, base, sr, J(0.9, 0.2), 0.15, 220);
    });
    return normalize(d);
  },
  torpedo_launch(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const hf = J(3000, 0.2), pf = J(50, 0.15);
    const d = mk(sr, 1.5, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (110 * Math.exp(-t * 9) + pf) / sr;
        d[i] = a.step(nz, hf, 0.8).hp * env(t, 0.02, 0.2) * 0.7 + Math.sin(ph) * env(t, 0.003, 0.12) * 1.0 + l.step(nz, 700, 0.7).lp * env(Math.max(0, t - 0.15), 0.05, 0.3) * (t > 0.15 ? 0.5 : 0);
      }
    });
    return normalize(d, 0.85);
  },
  /** A magazine or a whole ship going up: shock front, fireball roar, sub boom, secondary blasts, debris and the rolling echo. */
  explosion_big(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const bf = J(140, 0.15), pf = J(17, 0.12), tf = J(62, 0.12), rf = J(80, 0.12), mf = J(420, 0.15), lfo = J(2.3, 0.3), snapT = J(0.004, 0.25);
    const d = mk(sr, 9.0, (d, n) => {
      const bd = new SVF(sr), rm = new SVF(sr), cr = new SVF(sr), mid = new SVF(sr), sn = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 700, 0.6).hp * env(t, 0.001, 0.05) * 1.0;
        const snap = sn.step(nz, 1100, 0.6).hp * friedlander(t, snapT) * (t < snapT * 7 ? 1 : 0) * 1.4;
        const blast = bd.step(nz, bf + 5200 * Math.exp(-t * 4.5), 0.8).lp * env(t, 0.003, 0.5) * 1.6;
        ph += TAU * (pf + 30 * Math.exp(-t * 1.0)) / sr;
        const boom = Math.sin(ph) * env(t, 0.01, 1.7) * 2.2 + 0.6 * Math.sin(ph * 2.0) * env(t, 0.01, 0.9);
        ph2 += TAU * (tf * Math.exp(-t * 0.5) + 30) / sr;
        const thump = Math.sin(ph2) * env(t, 0.02, 0.9) * 0.9;
        const rumble = rm.step(nz, rf + 60 * Math.exp(-t * 0.7), 0.8).lp * env(t, 0.1, 3.6) * 1.8 * (0.7 + 0.3 * Math.sin(TAU * lfo * t + 2));
        const roar = mid.step(nz, mf, 0.7).lp * env(t, 0.05, 1.8) * 1.2;
        d[i] = softclip(crack + snap + blast + boom + thump + rumble + roar);
      }
      // secondary detonations (their number and timing differ every time) and the crackle of burning debris
      const nSec = 3 + Math.floor(r() * 3);
      let ts = 0.5;
      for (let k = 0; k < nSec; k++) {
        ts += 0.5 + r() * 1.2;
        const g = 0.6 * Math.exp(-k * 0.28) * (0.8 + 0.4 * r()), sf = 200 + 1200 * r(), i0 = Math.floor(ts * sr), bl = new SVF(sr), pf2 = 40 + 20 * r();
        for (let i = 0; i < sr * 1.4 && i0 + i < n; i++) { const t = i / sr, nz = r() * 2 - 1; d[i0 + i] += (bl.step(nz, sf * Math.exp(-t * 7) + 200, 0.8).lp * env(t, 0.003, 0.28) * 1.2 + Math.sin(TAU * (pf2 + 20 * Math.exp(-t * 3)) * t) * env(t, 0.005, 0.4) * 1.0) * g; }
      }
      debrisRain(d, sr, r, 1.0, 60, 2.2, 0.3);
      for (let i = Math.floor(0.6 * sr); i < n; i++) { const t = i / sr; if (r() < 0.025 * Math.exp(-(t - 0.6) * 0.5)) d[i] += (r() - 0.5) * 0.7 * Math.exp(-(t - 0.6) * 0.3); }
      const base = d.slice(); addEcho(d, base, sr, J(0.55, 0.2), 0.2, 260); addEcho(d, base, sr, J(1.2, 0.2), 0.14, 200); addEcho(d, base, sr, J(2.1, 0.2), 0.09, 150);
    });
    return normalize(d);
  },
  explosion_med(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const bf = J(180, 0.15), pf = J(30, 0.12), rf = J(110, 0.12), cf = J(900, 0.15);
    const d = mk(sr, 4.2, (d, n) => {
      const bd = new SVF(sr), rm = new SVF(sr), cr = new SVF(sr), sn = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, cf, 0.6).hp * env(t, 0.0007, 0.03) * 1.0;
        const snap = sn.step(nz, 1200, 0.6).hp * friedlander(t, 0.0025) * (t < 0.015 ? 1 : 0) * 1.1;
        const blast = bd.step(nz, bf + 3500 * Math.exp(-t * 6), 0.8).lp * env(t, 0.003, 0.32) * 1.5;
        ph += TAU * (pf + 40 * Math.exp(-t * 2.2)) / sr;
        const boom = Math.sin(ph) * env(t, 0.006, 0.8) * 1.6;
        const rumble = rm.step(nz, rf, 0.8).lp * env(t, 0.06, 1.4) * 1.3;
        d[i] = softclip(crack + snap + blast + boom + rumble);
      }
      debrisRain(d, sr, r, 0.5, 40, 1.3, 0.25);
      for (let i = Math.floor(0.3 * sr); i < n; i++) { const t = i / sr; if (r() < 0.02 * Math.exp(-(t - 0.3) * 0.9)) d[i] += (r() - 0.5) * 0.6; }
      const base = d.slice(); addEcho(d, base, sr, J(0.35, 0.2), 0.22, 300);
    });
    return normalize(d);
  },
  explosion_small(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const bf = J(260, 0.15), pf = J(60, 0.15), cf = J(1400, 0.15);
    const d = mk(sr, 2.0, (d, n) => {
      const bd = new SVF(sr), cr = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, cf, 0.6).hp * env(t, 0.0005, 0.02) * 1.1;
        const blast = bd.step(nz, bf + 3600 * Math.exp(-t * 9), 0.8).lp * env(t, 0.002, 0.2) * 1.4;
        const boom = Math.sin(TAU * (pf + 70 * Math.exp(-t * 5)) * t) * env(t, 0.003, 0.3) * 1.1;
        d[i] = softclip(crack + blast + boom);
      }
      debrisRain(d, sr, r, 0.2, 25, 0.6, 0.2);
      const base = d.slice(); addEcho(d, base, sr, J(0.2, 0.2), 0.2, 800);
    });
    return normalize(d, 0.9);
  },
  boiler_burst(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const pf = J(40, 0.15), lf = J(700, 0.2), hf = J(4200, 0.15);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (pf + 50 * Math.exp(-t * 6)) * t) * env(t, 0.003, 0.3) * 1.3 + l.step(nz, lf, 0.7).lp * env(t, 0.003, 0.4) * 1.0 + a.step(nz, hf, 0.8).hp * env(t, 0.03, 1.1) * 0.55;
      }
    });
    return normalize(d, 0.92);
  },
};
