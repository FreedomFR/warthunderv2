// Procedural sound effects (no sample files). Every sound is synthesised into an AudioBuffer from noise, filters, damped
// resonances and sweeps; they are built lazily the first time they are needed. `makeLibrary(sampleRate, createBuffer)`
// returns a getter: lib.get('gun_big') -> AudioBuffer.
const TAU = Math.PI * 2;

function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** State-variable filter (Chamberlin): returns the low-, band- and high-pass of the input at once. */
class SVF {
  constructor(sr) { this.sr = sr; this.low = 0; this.band = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  step(x, fc, q = 0.7) {
    const f = Math.min(1.2, 2 * Math.sin(Math.PI * Math.min(fc, this.sr * 0.45) / this.sr));
    this.hp = x - this.low - (1 / q) * this.band;
    this.band += f * this.hp;
    this.low += f * this.band;
    this.lp = this.low; this.bp = this.band;
    return this;
  }
}
const lpa = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);
/** attack / exponential decay envelope */
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

function mk(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur));
  const d = new Float32Array(n);
  fn(d, n, sr);
  return d;
}
function normalize(d, peak = 0.95) {
  let m = 1e-9;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  const k = peak / m;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  // short fade-out so nothing clicks at the end
  const fade = Math.min(d.length >> 2, 800);
  for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  return d;
}
/** add `src` into `dst` delayed by `delay` seconds with gain g (simple echo / reflection) */
function addEcho(dst, src, sr, delay, g, lp = 0) {
  const off = Math.floor(delay * sr);
  let y = 0;
  const a = lp ? lpa(lp, sr) : 1;
  for (let i = 0; i + off < dst.length && i < src.length; i++) { y += a * (src[i] - y); dst[i + off] += y * g; }
}
function softclip(x) { return Math.tanh(x * 1.25) / 1.25; }

/** Damped sinusoid ringing (metal, bells). */
function ring(d, sr, t0, f, amp, decay, phase = 0) {
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(d.length - i0, Math.floor(decay * 6 * sr));
  for (let i = 0; i < n; i++) d[i0 + i] += amp * Math.sin(TAU * f * i / sr + phase) * Math.exp(-i / sr / decay);
}

const BUILDERS = {
  // ---- guns ------------------------------------------------------------------------------------------------------
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
        d[i] = softclip(crack + blast + boom + thump + rumble);
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
        d[i] = softclip(crack + blast + boom + rumble);
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
        d[i] = softclip(crack + blast + boom + tail);
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
  // ---- shells in flight ---------------------------------------------------------------------------------------------
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
  // ---- impacts ----------------------------------------------------------------------------------------------------
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
  // ---- explosions ------------------------------------------------------------------------------------------------------
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
  // ---- damage ambience -----------------------------------------------------------------------------------------------
  hull_groan(sr, seed = 21) {
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
  // ---- loops ----------------------------------------------------------------------------------------------------------
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
  /** Wind and slipstream (loops). */
  wind(sr, seed = 28) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, 700 + 400 * Math.sin(TAU * t / 3), 0.9).bp * 0.9 + b.step(nz, 140, 0.7).lp * 0.5;
      }
      // crossfade the end into the start so that the loop is seamless
      const x = Math.floor(0.25 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.7);
  },
  /** Fire: crackle, hiss and a low roar (loops). */
  fire(sr, seed = 29) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr); let pop = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        if (r() < 0.0016) pop = 0.55 + r() * 0.6;
        pop *= 0.992;
        d[i] = a.step(nz, 2400, 0.8).hp * 0.08 + b.step(nz, 170 + 60 * Math.sin(TAU * t / 3 * 2), 0.8).lp * 0.8 * (0.8 + 0.2 * Math.sin(TAU * 0.67 * t)) + (nz * pop) * 0.7;
      }
      const x = Math.floor(0.25 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.7);
  },
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
  /** Gurgling water in a flooding compartment (loops). */
  gurgle(sr, seed = 31) {
    const r = prng(seed);
    const d = mk(sr, 3.0, (d, n) => {
      const a = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (260 + 180 * Math.sin(TAU * 2.6 * t) + 120 * Math.sin(TAU * 7.3 * t)) / sr;
        d[i] = a.step(nz, 520, 1.3).bp * 0.6 * (0.6 + 0.4 * Math.sin(TAU * 5 * t)) + Math.sin(ph) * 0.2 * (0.5 + 0.5 * Math.sin(TAU * 3.4 * t) ** 2);
      }
      const x = Math.floor(0.2 * sr);
      for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    });
    return normalize(d, 0.6);
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
};

/** Echoing, open-sea reverb impulse response (stereo not needed). */
export function makeReverbIR(sr, seconds = 2.4) {
  const r = prng(77);
  const n = Math.floor(sr * seconds);
  const d = new Float32Array(n);
  const lp = new SVF(sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = r() * 2 - 1;
    d[i] = lp.step(nz, 1600 * Math.exp(-t * 1.1) + 300, 0.7).lp * Math.exp(-t * 2.3) * (i < 40 ? i / 40 : 1);
  }
  // a few distinct early reflections from the surrounding ships
  for (const [t0, g] of [[0.045, 0.5], [0.11, 0.38], [0.19, 0.3], [0.31, 0.2]]) { const i0 = Math.floor(t0 * sr); for (let k = 0; k < 90; k++) d[i0 + k] += (r() * 2 - 1) * g * Math.exp(-k / 25); }
  return d;
}

export const SOUND_NAMES = Object.keys(BUILDERS);

/** Lazily-built sound library. createBuffer(len, sr) must return an object with getChannelData(0). */
export function makeLibrary(sr, createBuffer) {
  const cache = new Map();
  return {
    get(name, arg) {
      const key = arg == null ? name : name + ':' + arg;
      let b = cache.get(key);
      if (!b) {
        const data = BUILDERS[name](sr, 1 + (arg || 0), arg);
        b = createBuffer(data.length, sr);
        b.getChannelData(0).set(data);
        cache.set(key, b);
      }
      return b;
    },
  };
}

/** Raw sample generation (for tests): returns a Float32Array. */
export function renderSound(name, sr = 22050, arg) { return BUILDERS[name](sr, 1, arg); }
