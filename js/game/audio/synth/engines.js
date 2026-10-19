// Ship machinery: engine rooms, turbines, propellers, gun turrets and lifts.
import { TAU, prng, SVF, env, mk, normalize, softclip, ring, jit, seamless } from './core.js';

export const ENGINES = {
  /** Ship engines and propellers: deep rumble with the beat of the screws (loops). */
  ship_engine(sr, seed) {
    const r = prng(seed);
    const dur = 2.0;
    const d = mk(sr, dur + 0.15, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const beat = 0.7 + 0.3 * Math.sin(TAU * 4 * t);
        let s = 0;
        for (let h = 1; h <= 6; h++) s += Math.sin(TAU * 24 * h * t + h) / h;
        // the engine room: boilers roaring, pumps and gear trains (mid-low band, so that it is heard on small speakers)
        const thrum = b.step(nz, 260, 1.4).bp * 0.35 * (0.8 + 0.2 * Math.sin(TAU * 6 * t));
        d[i] = (s * 0.5 * beat + a.step(nz, 90, 0.8).lp * 0.9 + thrum);
      }
    });
    return normalize(seamless(d, sr, 0.15), 0.7, true);
  },
  /**
   * The whine of geared steam turbines: a high tone (blade rate of the first stages, about 1.1 kHz) with the gear-mesh tone and the
   * sidebands the shaft rotation puts on them, over a thin hiss of steam (loops). Pitch follows the shaft speed through the playback rate.
   */
  turbine(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f0 = Math.round(J(1100, 0.1) / 0.5) * 0.5, shaft = 12;          // multiples of 0.5 Hz: whole cycles in the two-second loop
    const d = mk(sr, 2.2, (d, n) => {
      const hiss = new SVF(sr), low = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const am = 0.8 + 0.2 * Math.sin(TAU * shaft * t);
        let s = Math.sin(TAU * f0 * t) + 0.5 * Math.sin(TAU * (f0 + shaft) * t + 1) + 0.5 * Math.sin(TAU * (f0 - shaft) * t + 2) + 0.35 * Math.sin(TAU * 2 * f0 * t + 0.5) + 0.25 * Math.sin(TAU * 0.5 * f0 * t);
        d[i] = s * 0.25 * am + hiss.step(nz, 3200, 1.0).bp * 0.25 + low.step(nz, 200, 0.7).lp * 0.2;
      }
    });
    return normalize(seamless(d, sr, 0.2), 0.7, true);
  },
  /** Propeller cavitation at speed: a crackling hiss in the water that pulses at the blade rate (loops). */
  cavitation(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const blade = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.cos(TAU * 28 * t), 2);          // four blades on a shaft at 7 turns a second
        const crackle = r() < 0.006 ? (r() - 0.5) * 2 : 0;
        d[i] = (a.step(nz, 3400, 0.8).bp * 0.7 + b.step(nz, 900, 0.8).bp * 0.3) * blade + crackle * 0.6;
      }
    });
    return normalize(seamless(d, sr, 0.2), 0.7, true);
  },
  /** The training motor of a gun turret: a hum at twice the mains frequency, the whine of the gears and the pump (loops). */
  turret_motor(sr, seed) {
    const r = prng(seed);
    const d = mk(sr, 2.2, (d, n) => {
      const pump = new SVF(sr), gear = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const hum = Math.sin(TAU * 120 * t) + 0.5 * Math.sin(TAU * 240 * t + 1) + 0.3 * Math.sin(TAU * 360 * t + 2);
        const whine = Math.sin(TAU * 612 * t + 3 * Math.sin(TAU * 3 * t)) * 0.35 * (0.8 + 0.2 * Math.sin(TAU * 5 * t));
        d[i] = hum * 0.22 + whine * 0.4 + pump.step(nz, 420, 1.5).bp * 0.35 + gear.step(nz, 90, 0.8).lp * 0.4;
      }
    });
    return normalize(seamless(d, sr, 0.2), 0.7, true);
  },
  /** A gun breech: the rammer's clatter, the block swinging shut and the latch (one shot, a little under a second). */
  breech(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f1 = J(330, 0.15), f2 = J(720, 0.15), t2 = J(0.36, 0.12);
    const d = mk(sr, 1.1, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const rammer = b.step(nz, 900, 1.4).bp * env(t, 0.01, 0.12) * 0.25 * (t < 0.3 ? 1 : 0);
        const thud = a.step(nz, 240, 0.8).lp * (env(t, 0.002, 0.05) + 0.8 * env(Math.max(0, t - t2), 0.002, 0.06) * (t > t2 ? 1 : 0)) * 0.9;
        d[i] = softclip(rammer + thud);
      }
      ring(d, sr, 0.0, f1, 0.3, 0.12); ring(d, sr, 0.0, f1 * 2.3, 0.14, 0.07);
      ring(d, sr, t2, f2, 0.32, 0.1); ring(d, sr, t2, f2 * 2.7, 0.14, 0.05); ring(d, sr, t2 + 0.07, J(1500, 0.1), 0.12, 0.04);
    });
    return normalize(d, 0.85);
  },
  /** A flight-deck lift: the motor's rumble and whine, a clunk when it starts and when it stops. */
  lift_motor(sr, seed) {
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
