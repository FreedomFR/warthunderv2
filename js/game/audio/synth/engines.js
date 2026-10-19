// Ship machinery.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, ring } from './core.js';

export const ENGINES = {
  /** Ship engines and propellers: deep rumble with the beat of the screws (loops). */
  ship_engine(sr, seed = 30) {
    const r = prng(seed);
    const dur = 2.0;
    const d = mk(sr, dur, (d, n) => {
      const a = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const beat = 0.7 + 0.3 * Math.sin(TAU * 4 * t);
        let s = 0;
        for (let h = 1; h <= 6; h++) s += Math.sin(TAU * 24 * h * t + h) / h;
        d[i] = (s * 0.5 * beat + a.step(nz, 90, 0.8).lp * 0.9);
      }
    });
    return normalize(d, 0.7);
  },
  /** A flight-deck lift: the motor's rumble and whine, a clunk when it starts and when it stops. */
  lift_motor(sr, seed = 36) {
    const r = prng(seed);
    const d = mk(sr, 3.4, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const run = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (3.1 - t) / 0.3));
        ph += TAU * (72 + 14 * Math.sin(TAU * 0.3 * t)) / sr;
        const hum = (Math.sin(ph) + 0.5 * Math.sin(ph * 2) + 0.25 * Math.sin(ph * 3)) * 0.22;
        const rumble = a.step(nz, 150, 0.8).lp * 0.8;
        const clunk = Math.sin(TAU * 70 * t) * env(t, 0.003, 0.09) * 0.8 + Math.sin(TAU * 62 * (t - 3.1)) * env(Math.max(0, t - 3.1), 0.003, 0.1) * (t > 3.1 ? 0.9 : 0);
        d[i] = softclip((hum + rumble) * run + clunk);
      }
    });
    return normalize(d, 0.7);
  },
};
