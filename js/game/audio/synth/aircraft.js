// Aircraft engines, falling aircraft and deck landings.
import { TAU, prng, SVF, env, mk, normalize, softclip, ring, jit, seamless } from './core.js';

/**
 * A piston engine and its propeller, built from the real frequencies. A four-stroke engine takes two crankshaft turns for a full
 * cycle and each cylinder fires once per cycle, so the firing frequency is rpm * cylinders / 120. At the reference speed of 2400 rpm
 * the cycle repeats at 20 Hz; the geared propeller turns at half the crank speed (20 Hz, three blades: 60 Hz blade-passing tone and
 * its harmonics). Everything is a multiple of 20 Hz, so the two-second loop is exact; the playback rate then scales the whole sound
 * with the engine speed. Radials fire unevenly (each cylinder breathes a little differently: the burble) and ring from the stacks;
 * a V-12 fires smoothly with a crackle of short stacks.
 */
function pistonEngine(sr, seed, cyl, radial) {
  const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
  const cycle = 20, dur = 2.0, x = 0.15;
  // per-cylinder amplitude and timing error, repeated every cycle: the signature of the engine
  const amp = Array.from({ length: cyl }, () => (radial ? 0.7 : 0.9) + (radial ? 0.45 : 0.2) * r());
  const tim = Array.from({ length: cyl }, () => (r() - 0.5) * (radial ? 0.25 : 0.06));
  const stackF = J(radial ? 520 : 800, 0.15), thumpF = J(radial ? 95 : 120, 0.1);
  const blades = 3, propF = blades * cycle;
  const d = mk(sr, dur + x, (d, n) => {
    const st = new SVF(sr), cl = new SVF(sr), sw = new SVF(sr);
    // the exhaust pulses
    for (let c = 0; c < Math.ceil((dur + x) * cycle); c++) {
      for (let k = 0; k < cyl; k++) {
        const t0 = (c + (k + tim[k]) / cyl) / cycle, i0 = Math.floor(t0 * sr);
        const len = Math.floor(sr * Math.min(0.03, 0.9 / (cyl * cycle)));
        const a = amp[k] * (0.85 + 0.3 * r());
        for (let i = 0; i < len && i0 + i < n; i++) {
          const t = i / sr, nz = r() * 2 - 1;
          d[i0 + i] += a * (st.step(nz, stackF, 1.3).bp * env(t, 0.0008, 0.004) * 1.6 + Math.sin(TAU * thumpF * t) * env(t, 0.001, 0.007) * 0.9);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const t = i / sr, nz = r() * 2 - 1;
      // blade-passing tone and harmonics, a swish of the tips, valve gear clatter (and the crackle of the short stacks of the V-12)
      let p = 0;
      for (let h = 1; h <= 5; h++) p += Math.sin(TAU * propF * h * t + h * 1.7) * 0.5 / Math.pow(h, 1.2);
      const swish = sw.step(nz, 1600, 1.2).bp * (0.6 + 0.4 * Math.cos(TAU * propF * t)) * 0.25;
      const clat = cl.step(nz, radial ? 3200 : 4600, 0.9).hp * (0.5 + 0.5 * Math.sin(TAU * cyl * cycle * t)) * (radial ? 0.06 : 0.11);
      d[i] = softclip(d[i] * 0.55 + p * 0.45 + swish + clat);
    }
  });
  return normalize(seamless(d, sr, x), 0.75, true);
}

export const AIRCRAFT = {
  /** Radial engine (arg: number of cylinders, 9 by default; two-row radials have 14 or 18). Loops. */
  engine_radial: (sr, seed, cyl = 9) => pistonEngine(sr, seed, cyl, true),
  /** Liquid-cooled V-12 (loops). */
  engine_inline: (sr, seed, cyl = 12) => pistonEngine(sr, seed, cyl, false),
  /** The Stuka's "Jericho trumpet": a howling siren (loops). */
  siren(sr, seed) {
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
    return normalize(d, 0.7, true);
  },
  /** A radial engine starting: the starter's whine, a few coughs, then a rough idle. */
  engine_start(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const catchT = J(0.9, 0.2);
    const d = mk(sr, 3.2, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let ph = 0, pe = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        // the starter: a rising whine that dies away as the engine catches
        const f = 140 + 260 * Math.min(1, t / 1.1);
        ph += TAU * f / sr;
        const starter = Math.sin(ph) * (0.5 + 0.5 * Math.sin(TAU * 11 * t)) * Math.min(1, t / 0.2) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.6)) * 0.28;
        // firing: pulses that come faster as it catches, then settle at idle
        const rate = t < catchT ? 3 + 2 * t : t < catchT + 0.8 ? 5 + 9 * (t - catchT) : 12 + 2 * Math.sin(TAU * 0.7 * t);
        pe += rate / sr;
        const pulse = Math.pow(0.5 + 0.5 * Math.cos(TAU * pe), 5);
        const fire = b.step(nz, 330 + 160 * pulse, 0.9).lp * pulse * Math.min(1, Math.max(0, (t - 0.55) / 0.5)) * (0.9 + 0.3 * Math.sin(TAU * 1.3 * t));
        d[i] = softclip(starter + fire * 1.4 + a.step(nz, 180, 0.7).lp * 0.12 * Math.min(1, t / 1.6));
      }
    });
    return normalize(d, 0.75);
  },
  /** Aircraft falling: engine howl dropping in pitch (one shot). */
  plane_fall(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f0 = J(520, 0.15), k = J(0.28, 0.2);
    const d = mk(sr, 4.0, (d, n) => {
      const a = new SVF(sr); let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const f = f0 * Math.exp(-t * k) + 160;
        ph += TAU * f / sr; ph2 += TAU * f * 2.01 / sr;
        d[i] = (Math.sin(ph) * 0.5 + Math.sin(ph2) * 0.22 + a.step(nz, 1500, 1.3).bp * 0.35) * Math.min(1, t / 0.15) * (1 - 0.3 * t / 4);
      }
    });
    return normalize(d, 0.7);
  },
  /** Main wheels hitting the deck: a thump and a short squeal of tyres. */
  touchdown(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const sf = J(2600, 0.15), tf = J(120, 0.15);
    const d = mk(sr, 0.9, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const squeal = a.step(nz, sf - 900 * Math.min(1, t / 0.5), 3).bp * env(Math.max(0, t - 0.01), 0.02, 0.2) * 0.5;
        const thump = Math.sin(TAU * (tf - 50 * Math.min(1, t / 0.15)) * t) * env(t, 0.002, 0.11) * 0.9 + b.step(nz, 320, 0.7).lp * env(t, 0.002, 0.07) * 0.8;
        d[i] = softclip(squeal + thump);
      }
    });
    return normalize(d, 0.8);
  },
  /** Arrester wire catching an aircraft: tyre squeal, a metallic twang, rolling. */
  arrest(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const sf = J(2000, 0.15), tw = J(300, 0.15);
    const d = mk(sr, 2.4, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, sf, 2).bp * env(t, 0.01, 0.15) * 0.8 + Math.sin(TAU * (tw - 120 * Math.min(1, t / 1.6)) * t) * env(Math.max(0, t - 0.1), 0.05, 1.0) * 0.4 * (t > 0.1 ? 1 : 0) + b.step(nz, 240, 0.8).lp * env(t, 0.02, 0.5) * 0.7;
      }
      ring(d, sr, 0.08, J(420, 0.15), 0.2, 0.4);
    });
    return normalize(d, 0.8);
  },
  /**
   * An engine failing (2.9 s): the firing becomes ragged, then misses (the note drops, gaps open), with backfires through the
   * exhaust, and the sound of an engine that has stopped being an engine runs down into the windmilling of the propeller.
   */
  engine_sputter(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 3;
    const d = mk(sr, L, (d, n) => {
      // firing strokes: first even, then more and more of them missing, the rate falling
      let t = 0.02;
      while (t < 2.5) {
        const run = Math.min(1, t / 2.5), miss = r() < 0.12 + 0.6 * run;
        const f = J(88 - 28 * run, 0.12), a = (miss ? 0.12 : 1) * (1 - 0.5 * run) * (0.6 + 0.4 * r());
        const i0 = Math.floor(t * sr), len = Math.floor(0.06 * sr);
        for (let i = 0; i < len && i0 + i < n; i++) d[i0 + i] += a * (Math.sin(TAU * f * i / sr) * 0.6 + (r() * 2 - 1) * 0.7) * Math.exp(-i / sr / 0.022);
        t += (1 / (24 - 14 * run)) * (0.7 + 0.6 * r()) * (miss ? 1.5 : 1);
      }
      // backfires: a sharp bang through the stack
      const bp = new SVF(sr);
      for (let k = 0; k < 4; k++) {
        const t0 = 0.5 + 2 * r(), i0 = Math.floor(t0 * sr), len = Math.floor(0.12 * sr), f = J(300, 0.4);
        for (let i = 0; i < len && i0 + i < n; i++) d[i0 + i] += (bp.step(r() * 2 - 1, f, 1.2).bp * 1.6 + Math.sin(TAU * 110 * i / sr) * 0.35) * Math.exp(-i / sr / 0.03) * 2.2;
      }
      // the propeller windmilling afterwards
      const lp = new SVF(sr);
      for (let i = Math.floor(2 * sr); i < n; i++) d[i] += lp.step(r() * 2 - 1, 180, 0.7).lp * 0.5 * Math.min(1, (i / sr - 2) / 0.3) * Math.exp(-(i / sr - 2) / 0.6);
    });
    return normalize(d, 0.85);
  },
  /** Tyres rolling on a runway or a deck (loops, 3 s): a low rumble, the hiss of the rubber, and a soft thump from each joint in the surface. */
  ground_roll(sr, seed) {
    const r = prng(seed), L = 3, joints = 6;
    const d = mk(sr, L, (d, n) => {
      const rum = new SVF(sr), hiss = new SVF(sr), th = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, q = (t * joints / L) % 1, joint = Math.exp(-q / 0.06);
        d[i] = rum.step(nz, 95, 0.8).lp * 1.3 + hiss.step(nz, 1500, 0.8).bp * 0.32 + th.step(nz, 140, 0.9).lp * joint * 1.1 * (0.8 + 0.2 * Math.sin(t * 3));
      }
    });
    return normalize(seamless(d, sr, 0.15), 0.7, true);
  },
  /** A bomb let go (0.9 s): the clack of the shackle, the clang of the rack, and the rush of air round the bay doors and the falling store. */
  bomb_drop(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 1.0;
    const d = mk(sr, L, (d, n) => {
      const w = new SVF(sr);
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = w.step(r() * 2 - 1, 900 + 1500 * Math.min(1, t / 0.6), 0.7).bp * 0.5 * Math.min(1, t / 0.12) * Math.exp(-t / 0.4); }
    });
    ring(d, sr, 0, J(1450), 1.0, 0.025); ring(d, sr, 0, J(2400), 0.6, 0.015); ring(d, sr, 0.004, J(620), 0.9, 0.05); ring(d, sr, 0.07, J(980), 0.4, 0.03);
    return normalize(d, 0.8);
  },
};
