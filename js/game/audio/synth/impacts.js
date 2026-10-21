// Impacts on water and steel, structural damage.
import { TAU, prng, SVF, env, mk, normalize, addEcho, softclip, ring, jit, bubble } from './core.js';

/**
 * Bubbles popping into existence over [t0, t1] at `rate` per second (thinning with time constant `tau`), radius log-uniform between
 * rMin and rMax metres: each rings at Minnaert's frequency 3.26 / radius, bigger ones louder. This is what makes water sound like water.
 */
function bubbleCloud(d, sr, r, t0, t1, rate, tau, rMin, rMax, amp) {
  const dt = 1 / (rate * 4);
  for (let t = t0; t < t1; t += dt) {
    if (r() > Math.exp(-(t - t0) / tau) / 4) continue;
    const rad = rMin * Math.pow(rMax / rMin, r());
    bubble(d, sr, t, 3.26 / rad, amp * Math.pow(rad / rMax, 0.5) * (0.5 + 0.5 * r()));
  }
}

export const IMPACTS = {
  /**
   * A small splash (an AA shell, a bullet, a bit of debris): the slap of the water, a short plosh that dies away and a few
   * bubbles of a few millimetres.
   */
  splash_small(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f0 = J(2600, 0.2), f1 = J(180, 0.2), tau = J(0.12, 0.2), rate = J(60, 0.3);
    const d = mk(sr, 1.2, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr), s = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = a.step(nz, f0 * Math.exp(-t * 3) + 500, 0.7).lp * env(t, 0.006, tau) * 0.9 + l.step(nz, f1, 0.7).lp * env(t, 0.01, 0.16) * 0.7
          + s.step(nz, 3500, 0.8).hp * env(t, 0.0008, 0.015) * 0.5;
      }
      bubbleCloud(d, sr, r, 0.01, 0.6, rate, 0.18, 0.0012, 0.006, 0.28);
    });
    return normalize(d, 0.85);
  },
  /**
   * A big splash (a heavy shell, a bomb, an aircraft): the slap and the cavity roar, the low body, the column of water that
   * rises and falls back in a second wave, bubbles of all sizes bursting and the patter of the drops coming down.
   */
  splash_big(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const f0 = J(1700, 0.15), roarD = J(0.55, 0.2), bodyF = J(110, 0.15), pf = J(60, 0.12), tFall = J(0.9, 0.25), rate = J(140, 0.25);
    const d = mk(sr, 3.6, (d, n) => {
      const a = new SVF(sr), l = new SVF(sr), sl = new SVF(sr), col = new SVF(sr), dp = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (pf + 30 * Math.exp(-t * 2)) / sr;
        const slap = sl.step(nz, 1800, 0.7).hp * env(t, 0.0008, 0.03) * 0.8;
        const roar = a.step(nz, f0 * Math.exp(-t * 1.6) + 300, 0.7).lp * env(t, 0.02, roarD) * 1.1;
        const body = l.step(nz, bodyF, 0.8).lp * env(t, 0.03, 0.9) * 1.0 + Math.sin(ph) * env(t, 0.01, 0.35) * 0.9;
        // the column collapsing back: a second, softer wash of broadband noise
        const dt = t - tFall;
        const fall = dt > 0 ? col.step(nz, 700 + 500 * Math.exp(-dt * 2), 0.8).bp * env(dt, 0.12, 0.5) * 0.9 : (col.step(0, 700, 0.8), 0);
        const rain = dt > -0.4 ? dp.step(nz, 4200, 0.7).hp * env(Math.max(0, t - 0.35), 0.25, 0.9) * 0.05 : 0;
        d[i] = softclip(slap + roar + body + fall + rain);
      }
      bubbleCloud(d, sr, r, 0.03, 2.2, rate, 0.8, 0.003, 0.05, 0.2);
      // falling drops: ticks and little bubbles, thinning out
      for (let t = 0.4; t < 3.4; t += 0.004) if (r() < 0.5 * Math.exp(-(t - 0.4) * 1.2)) bubble(d, sr, t, 700 + 3600 * r(), 0.05 + 0.08 * r());
    });
    return normalize(d, 0.92);
  },
  impact_he(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const cf = J(1500, 0.15), bf = J(300, 0.15), pf = J(50, 0.12), rf = J(410, 0.12);
    const d = mk(sr, 2.2, (d, n) => {
      const cr = new SVF(sr), bd = new SVF(sr), cl = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, cf, 0.6).hp * env(t, 0.0004, 0.018) * 1.3;
        const blast = bd.step(nz, bf + 2800 * Math.exp(-t * 9), 0.8).lp * env(t, 0.002, 0.2) * 1.3;
        ph += TAU * (pf + 50 * Math.exp(-t * 5)) / sr;
        const boom = Math.sin(ph) * env(t, 0.004, 0.32) * 1.1;
        const clatter = (r() < 0.04 * Math.exp(-(t - 0.05) * 3) && t > 0.04 ? (r() - 0.5) * 0.9 : 0) + cl.step(nz, 5200, 0.8).hp * env(Math.max(0, t - 0.05), 0.02, 0.4) * 0.07;
        d[i] = softclip(crack + blast + boom + clatter);
      }
      // metal ringing of the struck plating (a different set of modes every time)
      ring(d, sr, 0.01, rf, 0.22, 0.18); ring(d, sr, 0.01, rf * J(2.02, 0.05), 0.16, 0.12); ring(d, sr, 0.012, rf * J(3.34, 0.06), 0.1, 0.09); ring(d, sr, 0.012, rf * J(5.5, 0.08), 0.06, 0.06);
    });
    return normalize(d);
  },
  /** Armour-piercing shell detonating inside the hull: deep, muffled, long. */
  impact_pen(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const bf = J(140, 0.15), pf = J(32, 0.12), rf = J(90, 0.15), lfo = J(3.1, 0.3), rg = J(130, 0.1);
    const d = mk(sr, 3.6, (d, n) => {
      const cr = new SVF(sr), bd = new SVF(sr), rm = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const crack = cr.step(nz, 600, 0.6).hp * env(t, 0.0005, 0.02) * 0.7;
        const blast = bd.step(nz, bf + 700 * Math.exp(-t * 6), 0.8).lp * env(t, 0.004, 0.32) * 1.7;
        ph += TAU * (pf + 40 * Math.exp(-t * 2.4)) / sr;
        const boom = Math.sin(ph) * env(t, 0.008, 0.75) * 1.7;
        const rumble = rm.step(nz, rf, 0.8).lp * env(t, 0.05, 1.5) * 1.2 * (0.7 + 0.3 * Math.sin(TAU * lfo * t));
        d[i] = softclip(crack + blast + boom + rumble);
      }
      ring(d, sr, 0.03, rg, 0.25, 0.5); ring(d, sr, 0.03, rg * J(2.05, 0.05), 0.15, 0.3);
      const base = d.slice(); addEcho(d, base, sr, J(0.22, 0.2), 0.25, 400); addEcho(d, base, sr, J(0.5, 0.2), 0.15, 250);
    });
    return normalize(d);
  },
  /** Shell ricochet / bounce off armour: whine and clang. */
  ricochet(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const w0 = J(3400, 0.2), wd = J(2.2, 0.25), f1 = J(1240, 0.15);
    const d = mk(sr, 1.4, (d, n) => {
      const cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (w0 * Math.exp(-t * wd) + 900) / sr;
        d[i] = cr.step(nz, 2600, 0.8).hp * env(t, 0.0003, 0.012) * 1.1 + Math.sin(ph) * env(t, 0.004, 0.32) * 0.5;
      }
      ring(d, sr, 0.002, f1, 0.35, 0.25); ring(d, sr, 0.002, f1 * J(2, 0.03), 0.2, 0.18); ring(d, sr, 0.002, f1 * J(2.7, 0.05), 0.12, 0.14); ring(d, sr, 0.002, J(520, 0.2), 0.3, 0.3);
    });
    return normalize(d, 0.9);
  },
  /** AP shell passing right through thin structure: a whack and a fading whistle. */
  impact_through(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const w0 = J(2200, 0.2), cf = J(1600, 0.15), hf = J(140, 0.15), rf = J(760, 0.2);
    const d = mk(sr, 1.0, (d, n) => {
      const cr = new SVF(sr); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        ph += TAU * (w0 * Math.exp(-t * 3.5) + 600) / sr;
        d[i] = cr.step(nz, cf, 0.7).hp * env(t, 0.0004, 0.022) * 1.1 + Math.sin(ph) * env(t, 0.01, 0.2) * 0.35 + Math.sin(TAU * hf * t) * env(t, 0.002, 0.08) * 0.5;
      }
      ring(d, sr, 0.002, rf, 0.2, 0.1);
    });
    return normalize(d, 0.85);
  },
  /** Structure collapsing: tearing steel and a long crash. */
  crash_metal(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const bf = J(500, 0.2), sf = J(2200, 0.2), pf = J(75, 0.15);
    const d = mk(sr, 3.0, (d, n) => {
      const bd = new SVF(sr), hs = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const impact = bd.step(nz, bf + 1800 * Math.exp(-t * 10), 0.8).lp * env(t, 0.003, 0.15) * 1.3;
        const scrape = hs.step(nz, sf + 600 * Math.sin(t * 7), 1.4).bp * env(Math.max(0, t - 0.05), 0.15, 0.7) * 0.5 * (t > 0.05 ? 1 : 0);
        d[i] = softclip(impact + scrape + Math.sin(TAU * pf * t) * env(t, 0.004, 0.25) * 0.9);
      }
      for (let k = 0; k < 6; k++) { const t0 = 0.05 + r() * 1.4; ring(d, sr, t0, 300 + r() * 1800, 0.14, 0.05 + r() * 0.18); }
      for (let i = Math.floor(0.25 * sr); i < n; i++) { const t = i / sr; if (r() < 0.03 * Math.exp(-(t - 0.25) * 1.5)) d[i] += (r() - 0.5) * 0.9; }
    });
    return normalize(d, 0.9);
  },
  zap(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const cf = J(3500, 0.2), mf = J(900, 0.3), tf = J(220, 0.2);
    const d = mk(sr, 0.7, (d, n) => {
      const cr = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = cr.step(nz, cf, 1.2).hp * env(t, 0.0003, 0.06) * (0.5 + 0.5 * Math.sin(t * mf)) + Math.sin(TAU * tf * t) * env(t, 0.002, 0.1) * 0.4;
      }
    });
    return normalize(d, 0.7);
  },
  bulkhead(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const pf = J(48, 0.15), bf = J(300, 0.2), rf = J(180, 0.2);
    const d = mk(sr, 2.0, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (pf + 30 * Math.exp(-t * 6)) * t) * env(t, 0.004, 0.25) * 1.3 + a.step(nz, bf + 900 * Math.exp(-t * 4), 0.8).lp * env(t, 0.004, 0.4) * 1.1 + b.step(nz, 1500, 0.8).hp * env(Math.max(0, t - 0.05), 0.1, 0.6) * 0.25 * (t > 0.05 ? 1 : 0);
      }
      ring(d, sr, 0.003, rf, 0.3, 0.3);
    });
    return normalize(d, 0.9);
  },
  collision(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f);
    const pf = J(45, 0.15), bf = J(260, 0.2), sf = J(2400, 0.2);
    const d = mk(sr, 2.8, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        d[i] = Math.sin(TAU * (pf + 25 * Math.exp(-t * 4)) * t) * env(t, 0.01, 0.5) * 1.4 + a.step(nz, bf + 900 * Math.exp(-t * 5), 0.8).lp * env(t, 0.006, 0.45) * 1.3 + b.step(nz, sf + 400 * Math.sin(t * 9), 1.5).bp * env(Math.max(0, t - 0.08), 0.2, 0.9) * 0.5 * (t > 0.08 ? 1 : 0);
      }
      for (let k = 0; k < 7; k++) ring(d, sr, 0.02 + r() * 1.1, 160 + r() * 900, 0.15, 0.1 + r() * 0.3);
    });
    return normalize(d, 0.92);
  },
  /**
   * A building coming down (3.8 s): the crack of the frame, a collapse that sounds like a lot of different things falling (planks,
   * masonry, sheet metal, each a damped resonance of its own, closer together at first and then fewer), a low rumble of the mass
   * settling and the hiss of dust.
   */
  rubble(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 3.9;
    const d = mk(sr, L, (d, n) => {
      const rum = new SVF(sr), dust = new SVF(sr), crk = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, e = (1 - Math.exp(-t / 0.15)) * Math.exp(-t / 1.4);
        d[i] = rum.step(nz, 90, 0.8).lp * 1.6 * e + dust.step(nz, 2600, 0.7).hp * 0.16 * e * e + crk.step(nz, 1100, 1.1).bp * 1.4 * Math.exp(-t / 0.05);
      }
    });
    // the pieces: a rate that starts high and falls, each a different material (wood 250-600 Hz, masonry 700-1800, sheet metal 1500-3500, ringing)
    for (let t = 0.04; t < 3.4;) {
      const k = Math.exp(-t / 1.3), kind = r(), f = kind < 0.4 ? 250 + 350 * r() : kind < 0.8 ? 700 + 1100 * r() : 1500 + 2000 * r();
      ring(d, sr, t, f, (0.3 + 0.9 * r()) * (0.25 + k), kind < 0.4 ? 0.03 : kind < 0.8 ? 0.012 : 0.07);
      t += (0.012 + 0.2 * r()) / (0.25 + 1.6 * k);
    }
    return normalize(d, 0.92);
  },
};
