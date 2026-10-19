// Aircraft engines, falling aircraft and deck landings.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const AIRCRAFT = {
  /** Radial engine drone (loops seamlessly): many harmonics of the firing frequency plus exhaust burble. */
  engine_radial(sr, seed = 25) {
    const r = prng(seed);
    const dur = 2.0, f0 = 88;                 // 176 cycles in two seconds: the loop is exact
    const d = mk(sr, dur, (d, n) => {
      const a = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (let h = 1; h <= 14; h++) s += Math.sin(TAU * f0 * h * t + h * 0.7) * (1 / Math.pow(h, 0.85)) * (h % 2 ? 1 : 0.6);
        // cylinder burble: slow amplitude modulation at integer cycles per loop
        const mod = 0.78 + 0.22 * Math.sin(TAU * 3 * t) * Math.sin(TAU * 5 * t + 1);
        const nz = r() * 2 - 1;
        d[i] = (s * 0.32 * mod + a.step(nz, 900, 1.2).bp * 0.28 + Math.sin(TAU * 2 * f0 * 0.5 * t) * 0.25);
      }
    });
    return normalize(d, 0.75);
  },
  engine_inline(sr, seed = 26) {
    const r = prng(seed);
    const dur = 2.0, f0 = 72;
    const d = mk(sr, dur, (d, n) => {
      const a = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (let h = 1; h <= 18; h++) s += Math.sin(TAU * f0 * h * t + h * 1.3) * (1 / Math.pow(h, 0.7));
        const nz = r() * 2 - 1;
        d[i] = s * 0.26 + a.step(nz, 1400, 1.0).bp * 0.2 + Math.sin(TAU * f0 * 18 * t) * 0.08;
      }
    });
    return normalize(d, 0.75);
  },
  /** The Stuka's "Jericho trumpet": a howling siren (loops). */
  siren(sr, seed = 27) {
    const r = prng(seed);
    const dur = 1.5;
    const d = mk(sr, dur, (d, n) => {
      const a = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const trem = 0.75 + 0.25 * Math.sin(TAU * 12 * t);
        const s = Math.sin(TAU * 1200 * t + 2 * Math.sin(TAU * 4 * t)) + 0.8 * Math.sin(TAU * 1236 * t) + 0.5 * Math.sin(TAU * 2400 * t) + 0.3 * Math.sin(TAU * 3600 * t);
        d[i] = (s * 0.3 * trem + a.step(nz, 2200, 2.5).bp * 0.45);
      }
    });
    return normalize(d, 0.7);
  },
  /** A radial engine starting: the starter's whine, a few coughs, then a rough idle. */
  engine_start(sr, seed = 35) {
    const r = prng(seed);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let ph = 0, pe = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        // the starter: a rising whine that dies away as the engine catches
        const f = 140 + 260 * Math.min(1, t / 1.1);
        ph += TAU * f / sr;
        const starter = Math.sin(ph) * (0.5 + 0.5 * Math.sin(TAU * 11 * t)) * Math.min(1, t / 0.2) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.6)) * 0.28;
        // firing: pulses that come faster as it catches, then settle at idle
        const rate = t < 0.9 ? 3 + 2 * t : t < 1.7 ? 5 + 9 * (t - 0.9) : 12 + 2 * Math.sin(TAU * 0.7 * t);
        pe += rate / sr;
        const pulse = Math.pow(0.5 + 0.5 * Math.cos(TAU * pe), 5);
        const fire = b.step(nz, 330 + 160 * pulse, 0.9).lp * pulse * Math.min(1, Math.max(0, (t - 0.55) / 0.5)) * (0.9 + 0.3 * Math.sin(TAU * 1.3 * t));
        d[i] = softclip(starter + fire * 1.4 + a.step(nz, 180, 0.7).lp * 0.12 * Math.min(1, t / 1.6));
      }
    });
    return normalize(d, 0.75);
  },
  /** Aircraft falling: engine howl dropping in pitch (one shot). */
  plane_fall(sr, seed = 33) {
    const r = prng(seed);
    const d = mk(sr, 4.0, (d, n) => {
      const a = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const f = 520 * Math.exp(-t * 0.28) + 160;
        ph += TAU * f / sr; ph2 += TAU * f * 2.01 / sr;
        d[i] = (Math.sin(ph) * 0.5 + Math.sin(ph2) * 0.22 + a.step(nz, 1500, 1.3).bp * 0.35) * Math.min(1, t / 0.15) * (1 - 0.3 * t / 4);
      }
    });
    return normalize(d, 0.7);
  },
  /** Main wheels hitting the deck: a thump and a short squeal of tyres. */
  touchdown(sr, seed = 34) {
    const r = prng(seed);
    const d = mk(sr, 0.9, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const squeal = a.step(nz, 2600 - 900 * Math.min(1, t / 0.5), 3).bp * env(Math.max(0, t - 0.01), 0.02, 0.2) * 0.5;
        const thump = Math.sin(TAU * (120 - 50 * Math.min(1, t / 0.15)) * t) * env(t, 0.002, 0.11) * 0.9 + b.step(nz, 320, 0.7).lp * env(t, 0.002, 0.07) * 0.8;
        d[i] = softclip(squeal + thump);
      }
    });
    return normalize(d, 0.8);
  },
  /** Arrester wire catching an aircraft: tyre squeal, a metallic twang, rolling. */
  arrest(sr, seed = 32) {
    const r = prng(seed);
    const d = mk(sr, 2.4, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, 2000, 2).bp * env(t, 0.01, 0.15) * 0.8 + Math.sin(TAU * (300 - 120 * Math.min(1, t / 1.6)) * t) * env(Math.max(0, t - 0.1), 0.05, 1.0) * 0.4 * (t > 0.1 ? 1 : 0) + b.step(nz, 240, 0.8).lp * env(t, 0.02, 0.5) * 0.7;
      }
      ring(d, sr, 0.08, 420, 0.2, 0.4);
    });
    return normalize(d, 0.8);
  },
};
