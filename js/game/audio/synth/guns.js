// Guns, anti-aircraft fire and shells in flight.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const GUNS = {
  /** Battleship main gun: crack, blast, sub boom, rolling echo off the sea. */
  gun_big(sr, seed = 1) {
    const r = prng(seed);
    const d = mk(sr, 5.2, (d, n) => {
      const body = new SVF(sr), rum = new SVF(sr), cr = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 900, 0.6).hp * env(t, 0.0006, 0.014) * 1.1;
        const fc = 180 + 2600 * Math.exp(-t * 8);
        const blast = body.step(nz, fc, 0.8).lp * env(t, 0.002, 0.24) * 1.6;
        const f = 26 + 46 * Math.exp(-t * 3.4); ph += TAU * f / sr;
        const boom = Math.sin(ph) * env(t, 0.005, 0.62) * 1.5 + 0.45 * Math.sin(ph * 2.01) * env(t, 0.004, 0.3);
        const f2 = 90 * Math.exp(-t * 1.2) + 40; ph2 += TAU * f2 / sr;
        const thump = Math.sin(ph2) * env(t, 0.01, 0.2) * 0.5;
        const rumble = rum.step(nz, 120 + 80 * Math.exp(-t), 0.7).lp * env(t, 0.06, 1.8) * (0.7 + 0.3 * Math.sin(TAU * 1.9 * t + 1.2)) * 1.4;
        const snap = friedlander(t, 0.0011) * 1.5 * (t < 0.008 ? 1 : 0);
        d[i] = softclip(crack + snap + blast + boom + thump + rumble);
      }
      // reflections of the blast off the water and hull
      const base = d.slice();
      addEcho(d, base, sr, 0.33, 0.34, 700); addEcho(d, base, sr, 0.61, 0.26, 420); addEcho(d, base, sr, 0.97, 0.2, 300); addEcho(d, base, sr, 1.48, 0.12, 220);
    });
    return normalize(d);
  },
  gun_med(sr, seed = 2) {
    const r = prng(seed);
    const d = mk(sr, 3.4, (d, n) => {
      const body = new SVF(sr), rum = new SVF(sr), cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 1200, 0.6).hp * env(t, 0.0005, 0.011) * 1.1;
        const blast = body.step(nz, 260 + 3200 * Math.exp(-t * 10), 0.8).lp * env(t, 0.002, 0.17) * 1.5;
        const f = 44 + 70 * Math.exp(-t * 4.5); ph += TAU * f / sr;
        const boom = Math.sin(ph) * env(t, 0.004, 0.38) * 1.2;
        const rumble = rum.step(nz, 200, 0.7).lp * env(t, 0.04, 1.0) * 0.9;
        const snap = friedlander(t, 0.0008) * 1.4 * (t < 0.006 ? 1 : 0);
        d[i] = softclip(crack + snap + blast + boom + rumble);
      }
      const base = d.slice();
      addEcho(d, base, sr, 0.27, 0.3, 900); addEcho(d, base, sr, 0.52, 0.2, 520); addEcho(d, base, sr, 0.85, 0.12, 350);
    });
    return normalize(d);
  },
  /** 76-140 mm gun and dual-purpose 5-inch: sharp bark. */
  gun_small(sr, seed = 3) {
    const r = prng(seed);
    const d = mk(sr, 2.0, (d, n) => {
      const body = new SVF(sr), cr = new SVF(sr), rum = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 1800, 0.7).hp * env(t, 0.0004, 0.008) * 1.2;
        const blast = body.step(nz, 400 + 4000 * Math.exp(-t * 14), 0.9).lp * env(t, 0.0015, 0.1) * 1.4;
        const f = 70 + 90 * Math.exp(-t * 6); ph += TAU * f / sr;
        const boom = Math.sin(ph) * env(t, 0.003, 0.2) * 1.0;
        const tail = rum.step(nz, 320, 0.7).lp * env(t, 0.03, 0.55) * 0.6;
        const snap = friedlander(t, 0.0006) * 1.3 * (t < 0.005 ? 1 : 0);
        d[i] = softclip(crack + snap + blast + boom + tail);
      }
      const base = d.slice();
      addEcho(d, base, sr, 0.19, 0.24, 1100); addEcho(d, base, sr, 0.41, 0.14, 650);
    });
    return normalize(d);
  },
  /** One burst of light AA: a short rapid sequence. variant: 20 | 25 | 40 */
  aa_burst(sr, seed = 4, cal = 20) {
    const r = prng(seed + cal);
    const dur = 0.5;
    const d = mk(sr, dur, (d, n) => {
      const svf = new SVF(sr), lo = new SVF(sr); let ph = 0;
      const rate = cal >= 37 ? 5.5 : cal >= 25 ? 10 : 12;          // rounds per second inside a burst
      const pulses = cal >= 37 ? 3 : 5;
      for (let k = 0; k < pulses; k++) {
        const t0 = (k + r() * 0.2) / rate, i0 = Math.floor(t0 * sr);
        const f0 = cal >= 37 ? 120 : 190;
        for (let i = 0; i < sr * 0.11 && i0 + i < n; i++) {
          const t = i / sr, nz = r() * 2 - 1;
          const crack = svf.step(nz, cal >= 37 ? 1500 : 2400, 0.9).bp * env(t, 0.0003, 0.012) * 1.4;
          const thump = lo.step(nz, 240, 0.7).lp * env(t, 0.001, 0.03) * 0.8;
          ph += TAU * (f0 + 60 * Math.exp(-t * 60)) / sr;
          d[i0 + i] += crack + thump + Math.sin(ph) * env(t, 0.001, 0.04) * (cal >= 37 ? 0.9 : 0.5);
        }
      }
      const base = d.slice();
      addEcho(d, base, sr, 0.13, 0.18, 1500);
    });
    return normalize(d, 0.9);
  },
  flak_burst(sr, seed = 5) {
    const r = prng(seed);
    const d = mk(sr, 1.4, (d, n) => {
      const cr = new SVF(sr), lo = new SVF(sr), hs = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 1300, 0.6).hp * env(t, 0.0004, 0.02) * 1.2;
        ph += TAU * (70 + 80 * Math.exp(-t * 9)) / sr;
        const thump = Math.sin(ph) * env(t, 0.003, 0.17) * 1.0 + lo.step(nz, 260, 0.7).lp * env(t, 0.003, 0.14);
        const frag = hs.step(nz, 4200, 0.7).hp * env(t, 0.01, 0.25) * 0.25 * (r() < 0.5 ? 1 : 0.4);
        d[i] = softclip(crack + thump + frag);
      }
    });
    return normalize(d, 0.92);
  },
  shell_rush(sr, seed = 6) {
    const r = prng(seed);
    const d = mk(sr, 2.2, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const swell = Math.sin(Math.PI * Math.min(1, t / 2.0)) ** 1.6;
        const fc = 520 + 1300 * swell;
        const rush = a.step(nz, fc, 2.2).bp * 1.4 + b.step(nz, 300, 0.7).lp * 0.4;
        ph += TAU * (1050 + 700 * swell + 40 * Math.sin(t * 31)) / sr;
        d[i] = (rush + Math.sin(ph) * 0.08) * swell;
      }
    });
    return normalize(d, 0.8);
  },
  bomb_whistle(sr, seed = 7) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const u = t / 3.0;
        const f = 2600 - 1700 * u + 60 * Math.sin(t * 17);
        ph += TAU * f / sr;
        const amp = Math.min(1, t / 0.3) * (0.4 + 0.6 * u);
        d[i] = (Math.sin(ph) * 0.5 + Math.sin(ph * 1.52) * 0.18 + a.step(nz, 1800, 2).bp * 0.4) * amp;
      }
    });
    return normalize(d, 0.7);
  },
  /** A fighter's machine guns: a burst of sharp reports at about 15 a second, with the rattle of the breeches. */
  mg_burst(sr, seed = 37) {
    const r = prng(seed);
    const d = mk(sr, 1.1, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const ph = (t * 15.5) % 1, pulse = Math.exp(-ph * 14), shape = Math.min(1, t / 0.03) * Math.max(0, 1 - Math.max(0, t - 0.8) / 0.25);
        d[i] = softclip((a.step(nz, 2400, 1.1).bp * 0.9 + b.step(nz, 520, 0.8).lp * 0.7) * pulse * shape);
      }
    });
    return normalize(d, 0.7);
  },
};
