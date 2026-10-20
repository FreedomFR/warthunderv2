// Guns, anti-aircraft fire and shells in flight.
import { TAU, prng, SVF, env, mk, normalize, addEcho, friedlander, softclip, jit } from './core.js';

/**
 * A gun report by layers, as in published sound design (transient, body, sub weight, tail) and in measurements of muzzle blast
 * (a Friedlander pulse whose duration grows with the charge, energy centred on 30 to 300 Hz for the big guns and rising with
 * every step down in calibre): the crack, the blast body whose brightness dies away, a pitch-dropping boom, a thump, the mid
 * roar of the burning propellant and the rolling echoes off the sea. P holds the preset of a calibre family; every variant
 * jitters it, so two reports of the same gun are never the same sound.
 */
function gunReport(sr, seed, P) {
  const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
  const crackF = J(P.crackF, 0.12), blastF0 = J(P.blastF0, 0.1), blastK = J(P.blastK, 0.12), blastD = J(P.blastD, 0.15);
  const boomF0 = J(P.boomF0, 0.08), boomSw = J(P.boomSw, 0.1), boomK = J(P.boomK, 0.12), boomD = J(P.boomD, 0.15);
  const rumF = J(P.rumF, 0.1), rumD = J(P.rumD, 0.15), snapT = J(P.snapT, 0.2), midF = J(P.midF, 0.15), midD = J(P.midD, 0.2), lfo = J(1.9, 0.3), lfoPh = r() * 6;
  const d = mk(sr, P.dur, (d, n) => {
    const body = new SVF(sr), rum = new SVF(sr), cr = new SVF(sr), mid = new SVF(sr);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, nz = r() * 2 - 1;
      const crack = cr.step(nz, crackF, 0.6).hp * env(t, 0.0005, P.crackD) * P.crackG;
      const blast = body.step(nz, blastF0 + P.blastF1 * Math.exp(-t * blastK), 0.8).lp * env(t, 0.002, blastD) * P.blastG;
      ph += TAU * (boomF0 + boomSw * Math.exp(-t * boomK)) / sr;
      const boom = Math.sin(ph) * env(t, 0.005, boomD) * P.boomG + P.partial * Math.sin(ph * 2.01) * env(t, 0.004, boomD * 0.5);
      ph2 += TAU * (P.thumpF * Math.exp(-t * 1.2) + boomF0 * 1.5) / sr;
      const thump = Math.sin(ph2) * env(t, 0.01, 0.2) * P.thumpG;
      const rumble = rum.step(nz, rumF + 0.6 * rumF * Math.exp(-t), 0.7).lp * env(t, 0.05 + P.dur * 0.01, rumD) * P.rumG * (0.7 + 0.3 * Math.sin(TAU * lfo * t + lfoPh));
      const roar = mid.step(nz, midF, 1.1).bp * env(t, 0.004, midD) * P.midG;
      const snap = friedlander(t, snapT) * P.snapG * (t < snapT * 7 ? 1 : 0);
      d[i] = softclip(crack + snap + blast + boom + thump + rumble + roar);
    }
    // the blast bounces off the water and the hulls: an early reflection (the sea surface) and the rolling echoes
    const base = d.slice();
    addEcho(d, base, sr, J(0.013, 0.3), 0.22, 2600);
    for (const [t0, g, lp] of P.echoes) addEcho(d, base, sr, J(t0, 0.15), J(g, 0.2), lp);
  });
  return normalize(d);
}

const BIG = {
  dur: 5.2, crackF: 900, crackD: 0.014, crackG: 1.1, blastF0: 180, blastF1: 2600, blastK: 8, blastD: 0.24, blastG: 1.6,
  boomF0: 26, boomSw: 46, boomK: 3.4, boomD: 0.62, boomG: 1.5, partial: 0.45, thumpF: 90, thumpG: 0.5,
  rumF: 120, rumD: 1.8, rumG: 1.4, snapT: 0.0016, snapG: 1.5, midF: 640, midD: 0.45, midG: 0.55,
  echoes: [[0.33, 0.34, 700], [0.61, 0.26, 420], [0.97, 0.2, 300], [1.48, 0.12, 220]],
};
const MED = {
  dur: 3.4, crackF: 1200, crackD: 0.011, crackG: 1.1, blastF0: 260, blastF1: 3200, blastK: 10, blastD: 0.17, blastG: 1.5,
  boomF0: 44, boomSw: 70, boomK: 4.5, boomD: 0.38, boomG: 1.2, partial: 0.25, thumpF: 110, thumpG: 0.25,
  rumF: 200, rumD: 1.0, rumG: 0.9, snapT: 0.0011, snapG: 1.4, midF: 800, midD: 0.3, midG: 0.45,
  echoes: [[0.27, 0.3, 900], [0.52, 0.2, 520], [0.85, 0.12, 350]],
};
const SMALL = {
  dur: 2.0, crackF: 1800, crackD: 0.008, crackG: 1.2, blastF0: 400, blastF1: 4000, blastK: 14, blastD: 0.1, blastG: 1.4,
  boomF0: 70, boomSw: 90, boomK: 6, boomD: 0.2, boomG: 1.0, partial: 0, thumpF: 0, thumpG: 0,
  rumF: 320, rumD: 0.55, rumG: 0.6, snapT: 0.0008, snapG: 1.3, midF: 1100, midD: 0.18, midG: 0.4,
  echoes: [[0.19, 0.24, 1100], [0.41, 0.14, 650]],
};

export const GUNS = {
  /** Battleship main gun (300 mm and up): crack, blast, sub boom, rolling echo off the sea. */
  gun_big: (sr, seed) => gunReport(sr, seed, BIG),
  gun_med: (sr, seed) => gunReport(sr, seed, MED),
  /** 76-190 mm gun and dual-purpose 5-inch: sharp bark. */
  gun_small: (sr, seed) => gunReport(sr, seed, SMALL),
  /** One burst of light AA: a short rapid sequence, each round a little different. arg: 20 | 25 | 40 (mm) */
  aa_burst(sr, seed, cal = 20) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const dur = 0.5, big = cal >= 37;
    const d = mk(sr, dur, (d, n) => {
      const svf = new SVF(sr), lo = new SVF(sr); let ph = 0;
      const rate = J(big ? 5.5 : cal >= 25 ? 10 : 12, 0.1);          // rounds per second inside a burst
      const pulses = big ? 3 : 5;
      for (let k = 0; k < pulses; k++) {
        const t0 = (k + r() * 0.25) / rate, i0 = Math.floor(t0 * sr);
        const f0 = J(big ? 120 : 190, 0.12), amp = 0.75 + 0.5 * r(), cf = J(big ? 1500 : 2400, 0.15);
        for (let i = 0; i < sr * 0.11 && i0 + i < n; i++) {
          const t = i / sr, nz = r() * 2 - 1;
          const crack = svf.step(nz, cf, 0.9).bp * env(t, 0.0003, 0.012) * 1.4;
          const thump = lo.step(nz, 240, 0.7).lp * env(t, 0.001, 0.03) * 0.8;
          ph += TAU * (f0 + 60 * Math.exp(-t * 60)) / sr;
          d[i0 + i] += (crack + thump + Math.sin(ph) * env(t, 0.001, 0.04) * (big ? 0.9 : 0.5)) * amp;
        }
      }
      const base = d.slice();
      addEcho(d, base, sr, J(0.13, 0.2), 0.18, 1500);
    });
    return normalize(d, 0.9);
  },
  /** An AA shell bursting: the crack of the fuse charge, a dull thump and the hiss of fragments. */
  flak_burst(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const cf = J(1300, 0.15), pf = J(70, 0.12), ff = J(4200, 0.15);
    const d = mk(sr, 1.4, (d, n) => {
      const cr = new SVF(sr), lo = new SVF(sr), hs = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, cf, 0.6).hp * env(t, 0.0004, 0.02) * 1.2;
        ph += TAU * (pf + 80 * Math.exp(-t * 9)) / sr;
        const thump = Math.sin(ph) * env(t, 0.003, 0.17) * 1.0 + lo.step(nz, 260, 0.7).lp * env(t, 0.003, 0.14);
        const frag = hs.step(nz, ff, 0.7).hp * env(t, 0.01, 0.25) * 0.25 * (r() < 0.5 ? 1 : 0.4);
        d[i] = softclip(crack + thump + frag);
      }
    });
    return normalize(d, 0.92);
  },
  // ---- shells in flight ---------------------------------------------------------------------------------------------
  /**
   * A shell passing close: the rush swells to its closest point at 1.4 s (the sound is started so that this instant coincides with
   * the closest approach), then the pitch falls as it goes away (Doppler).
   */
  shell_rush(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f0 = J(520, 0.15), f1 = J(1300, 0.15), tone = J(1050, 0.12), tc = 1.4;
    const d = mk(sr, 2.6, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const swell = t < tc ? Math.sin(Math.PI / 2 * t / tc) ** 1.8 : Math.exp(-(t - tc) / 0.38);
        const dop = t < tc ? 1 + 0.1 * (t / tc) ** 3 : 0.78 + 0.22 * Math.exp(-(t - tc) / 0.3);
        const fc = (f0 + f1 * swell) * dop;
        const rush = a.step(nz, fc, 2.2).bp * 1.4 + b.step(nz, 300, 0.7).lp * 0.4;
        ph += TAU * (tone + 700 * swell + 40 * Math.sin(t * 31)) * dop / sr;
        d[i] = (rush + Math.sin(ph) * 0.08) * swell;
      }
    });
    return normalize(d, 0.8);
  },
  /**
   * The shock wave of a supersonic shell passing close: an N-wave (sharp rise, linear fall, sharp return) whose length follows
   * Whitham's law for a body of diameter d and length l at Mach M and miss distance b:
   * T = 1.82 d M / (c (M^2 - 1)^(3/8)) (b / l)^(1/4). arg = calibre in mm, computed at b = 100 m (the game stretches it for other
   * distances: T grows as b^(1/4)). A 406 mm shell gives about 8 ms (a deep crack-thump), a 20 mm shell under 1 ms (a snap).
   */
  shell_crack(sr, seed, cal = 200) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const dd = cal / 1000, l = dd * 4.3, M = J(1.6, 0.12), b = 100;
    const T = 1.82 * dd * M / (343 * Math.pow(M * M - 1, 0.375)) * Math.pow(b / l, 0.25);
    const d = mk(sr, 0.9, (d, n) => {
      const lp = new SVF(sr), wake = new SVF(sr), wl = new SVF(sr);
      const rise = Math.min(0.0004, T * 0.05);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        // the N: positive front, linear decrease through zero to the negative peak, then a jump back to ambient
        const nw = t < T ? (1 - 2 * t / T) * Math.min(1, t / rise + 0.0) : 0;
        // the turbulent wake behind it and the shell's own tearing noise
        const w = wake.step(nz, J(900, 0.2) * (0.6 + 0.8 * Math.exp(-t * 6)), 1.2).bp * env(t, 0.004, 0.22) * 0.35 + wl.step(nz, 240, 0.7).lp * env(t, 0.006, 0.3) * 0.5;
        d[i] = softclip(lp.step(nw, 9000, 0.7).lp * 2.4 + w);
      }
    });
    return normalize(d, 0.9);
  },
  bomb_whistle(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const fa = J(2600, 0.1), fb = J(1700, 0.15), wob = J(17, 0.3), dur = J(3.0, 0.1);
    const d = mk(sr, dur, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const u = t / dur;
        const f = fa - fb * u + 60 * Math.sin(t * wob);
        ph += TAU * f / sr;
        const amp = Math.min(1, t / 0.3) * (0.4 + 0.6 * u);
        d[i] = (Math.sin(ph) * 0.5 + Math.sin(ph * 1.52) * 0.18 + a.step(nz, 1800, 2).bp * 0.4) * amp;
      }
    });
    return normalize(d, 0.7);
  },
  /** A fighter's machine guns: a burst of sharp reports at about 15 a second, with the rattle of the breeches. */
  mg_burst(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const rate = J(15.5, 0.12), f1 = J(2400, 0.15), f2 = J(520, 0.15);
    const amps = Array.from({ length: 24 }, () => 0.75 + 0.5 * r());
    const d = mk(sr, 1.1, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const cyc = t * rate, ph = cyc % 1, pulse = Math.exp(-ph * 14) * amps[Math.floor(cyc) % amps.length], shape = Math.min(1, t / 0.03) * Math.max(0, 1 - Math.max(0, t - 0.8) / 0.25);
        d[i] = softclip((a.step(nz, f1, 1.1).bp * 0.9 + b.step(nz, f2, 0.8).lp * 0.7) * pulse * shape);
      }
    });
    return normalize(d, 0.7);
  },
};
