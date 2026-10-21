// Water: what a flooding ship, a shore and a sinking hull sound like. A stream of water is not a tone: it is a roar of turbulence with
// a population of bubbles ringing in it, each a Minnaert resonance (f = 3.26 / radius, see bubble() in core.js), the small ones
// far more numerous than the big ones (van den Doel, "Physically based models for liquid sounds": the stochastic model of streams,
// pouring and breaking waves is bubbles with random radii at a rate that follows the flow). The earlier flooding loop was one
// sliding sine under a filtered noise, which is a cartoon bubbling pipe, not water.
import { TAU, prng, SVF, env, mk, normalize, jit, seamless, bubble, ring } from './core.js';

/** A bubble frequency (Hz) between lo and hi, the small ones (high) more often than the big ones. */
const bubF = (r, lo, hi) => lo * Math.pow(hi / lo, 1 - Math.pow(r(), 1.7));
/** A slow random level, 0..1, made of sines whose periods fit the loop `len` (s) exactly. */
const wander = (r, len, parts = 3, lo = 1, hi = 6) => {
  const w = []; for (let k = 0; k < parts; k++) w.push([Math.round(lo + (hi - lo) * r()) / len, r() * TAU, 0.5 + r()]);
  const tot = w.reduce((a, q) => a + q[2], 0);
  return (t) => { let v = 0; for (const [f, p, a] of w) v += a * Math.sin(TAU * f * t + p); return 0.5 + 0.5 * v / tot; };
};
/** Bubbles scattered in time: `rate` per second (a function of t, or a number), frequencies lo..hi, amplitude a * random. */
function bubbles(d, sr, r, len, rate, lo, hi, a, tmin = 0, tmax = len) {
  const step = 1 / 400;
  for (let t = tmin; t < tmax; t += step) {
    const q = typeof rate === 'function' ? rate(t) : rate;
    if (r() < q * step) bubble(d, sr, t, bubF(r, lo, hi), a * (0.25 + 0.75 * r()));
  }
}

export const WATER = {
  /**
   * Water jetting into a flooded compartment, heard through the hull (loops, 4 s): the roar of the jet (a low rumble and a body of
   * mid noise that swells and eases as the flow wanders), the bubbles of the air it drives out, and a bed of fine spray.
   */
  inrush(sr, seed) {
    const r = prng(seed), L = 4, flow = wander(r, L, 4, 1, 7), gust = wander(r, L, 3, 2, 9);
    const d = mk(sr, L, (d, n) => {
      const rum = new SVF(sr), body = new SVF(sr), spray = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, f = 0.45 + 0.55 * flow(t), g = 0.7 + 0.3 * gust(t);
        d[i] = rum.step(nz, 110, 0.7).lp * 1.5 * f + body.step(nz, 300 + 350 * f, 0.6).bp * 0.9 * f * g + spray.step(nz, 3200, 0.7).hp * 0.09 * f * g;
      }
    });
    bubbles(d, sr, r, L, (t) => 10 + 35 * flow(t), 220, 1800, 0.55);
    return normalize(seamless(d, sr, 0.25), 0.7, true);
  },
  /**
   * Water moving in a half-flooded compartment (loops, 6 s): the slow sloshing of the free surface from one side to the other (a
   * low surge under each swing, the wash running along the plates), a few big bubbles, drips falling from the deckhead.
   */
  slosh(sr, seed) {
    const r = prng(seed), L = 6, ph = r() * TAU, swing = (t) => 0.5 + 0.5 * Math.sin(TAU * 2 * t / L + ph), cross = wander(r, L, 2, 2, 5);
    const d = mk(sr, L, (d, n) => {
      const surge = new SVF(sr), wash = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, s = Math.pow(swing(t), 2.2), c = 0.4 + 0.6 * cross(t);
        d[i] = surge.step(nz, 70 + 60 * s, 0.9).lp * 1.6 * (0.25 + s) + wash.step(nz, 380 + 500 * s, 0.7).bp * 0.5 * s * c;
      }
    });
    bubbles(d, sr, r, L, (t) => 1.2 + 4 * swing(t), 120, 600, 0.9);
    for (let k = 0; k < 14; k++) bubble(d, sr, r() * (L - 0.4), 1800 + 1700 * r(), 0.16 + 0.15 * r());          // drips
    return normalize(seamless(d, sr, 0.35), 0.7, true);
  },
  /**
   * A breach opening below the waterline (1.8 s): a thump as the plate gives, then the gush, a hard roar that fills out and eases
   * off, with a burst of bubbles at the start (the compartment's air going out the way the water comes in).
   */
  water_rush(sr, seed) {
    const r = prng(seed), J = (x, f = 0.12) => jit(r, x, f), L = 1.9;
    const d = mk(sr, L, (d, n) => {
      const rum = new SVF(sr), body = new SVF(sr), hiss = new SVF(sr), f0 = J(52);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        const swell = (1 - Math.exp(-t / 0.07)) * Math.exp(-t / 0.9), core = Math.exp(-t / 0.5);
        ph += TAU * f0 * (1 - 0.35 * Math.min(1, t / 0.4)) / sr;
        d[i] = Math.sin(ph) * 1.6 * Math.exp(-t / 0.12) + rum.step(nz, 140, 0.7).lp * 1.4 * swell + body.step(nz, J(500) * (0.8 + 0.5 * core), 0.6).bp * 1.1 * swell + hiss.step(nz, 3000, 0.7).hp * 0.16 * swell;
      }
    });
    bubbles(d, sr, r, L, (t) => 90 * Math.exp(-t / 0.5), 200, 1500, 0.5, 0.04, 1.6);
    return normalize(d, 0.9);
  },
  /**
   * Air driven out of a vent or a hole as a compartment fills (2.4 s): a whoosh with a thin whistle where it passes the edge, and
   * the last of it spat out in a gulp of a big bubble.
   */
  air_vent(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 2.4;
    const d = mk(sr, L, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr), c = new SVF(sr), f0 = J(1200, 0.2);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, e = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.9)), 1.2) * (t < 1.9 ? 1 : 0), sw = f0 * (0.75 + 0.5 * e);
        d[i] = a.step(nz, 700 * (0.6 + 0.6 * e), 0.8).bp * 0.9 * e + b.step(nz, sw, 7).bp * 0.5 * e + c.step(nz, 90, 0.7).lp * 0.8 * e * e;
      }
    });
    bubble(d, sr, 1.95 + 0.1 * r(), J(140, 0.25), 1.1);
    bubble(d, sr, 2.1 + 0.1 * r(), J(300, 0.25), 0.5);
    return normalize(d, 0.8);
  },
  /**
   * The valves of the counter-flooding system (2.6 s): the clank of a handwheel and a gate valve, then water running through the
   * pipes (a narrow band that gurgles and falls), and the knock of the pipe as it fills.
   */
  valve(sr, seed) {
    const r = prng(seed), J = (x, f = 0.1) => jit(r, x, f), L = 2.6;
    const d = mk(sr, L, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr), flow = wander(r, L, 3, 1, 5);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, e = (1 - Math.exp(-(t - 0.25) / 0.15)) * Math.exp(-Math.max(0, t - 0.25) / 1.2) * (t > 0.25 ? 1 : 0), f = flow(t);
        d[i] = a.step(nz, J(620) * (0.8 + 0.4 * f), 1.6).bp * 1.1 * e * (0.5 + 0.5 * f) + b.step(nz, 140, 0.8).lp * 0.8 * e;
      }
    });
    ring(d, sr, 0.0, J(190), 1.2, 0.09); ring(d, sr, 0.0, J(470), 0.7, 0.05); ring(d, sr, 0.0, J(1250), 0.4, 0.02);
    ring(d, sr, 0.18, J(240), 0.8, 0.12);
    for (let k = 0; k < 3; k++) ring(d, sr, 1.1 + 1.2 * r(), J(95), 0.5, 0.07);
    bubbles(d, sr, r, L, 12, 300, 1400, 0.3, 0.5, 2.2);
    return normalize(d, 0.85);
  },
  /**
   * Big bubbles of air coming up from a sinking hull (3.4 s): large slow-ringing bubbles (a few tens of Hz to 150) breaking the
   * surface one after another, and the boil of the water over them.
   */
  bubbles_big(sr, seed) {
    const r = prng(seed), L = 3.4;
    const d = mk(sr, L, (d, n) => {
      const a = new SVF(sr), b = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, e = Math.min(1, t / 0.3) * Math.exp(-t / 1.6);
        d[i] = a.step(nz, 240, 0.6).bp * 0.7 * e + b.step(nz, 90, 0.7).lp * 0.8 * e;
      }
    });
    let t = 0.1;
    for (let k = 0; k < 9 && t < L - 0.5; k++) { bubble(d, sr, t, 45 + 110 * r() * (1 - k / 14), (1.1 - k * 0.07)); t += 0.12 + 0.4 * r(); }
    bubbles(d, sr, r, L, (q) => 30 * Math.exp(-q / 1.5), 250, 1500, 0.35);
    return normalize(d, 0.85);
  },
  /**
   * Surf on a shore (loops, 8 s): each wave rises, breaks with a broadband crash that darkens as the foam settles, and runs back
   * up the beach as a long hiss; a low rumble of the sea on the shelf underneath.
   */
  surf(sr, seed) {
    const r = prng(seed), L = 8, crashes = [0.4, 3.1 + 0.5 * r(), 5.6 + 0.5 * r()].map((t) => [t, 0.7 + 0.4 * r()]);
    const d = mk(sr, L, (d, n) => {
      const crash = new SVF(sr), back = new SVF(sr), rum = new SVF(sr), foam = new SVF(sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1;
        let c = 0, bk = 0;
        for (const [t0, a] of crashes) { const q = t - t0; if (q > 0) { c += a * (1 - Math.exp(-q / 0.45)) * Math.exp(-q / 1.6); bk += a * (1 - Math.exp(-q / 1.4)) * Math.exp(-q / 3.2); } }
        d[i] = crash.step(nz, 700 + 2600 * c, 0.6).bp * 1.1 * c + foam.step(nz, 4500, 0.7).hp * 0.18 * c * c + back.step(nz, 1800, 0.7).bp * 0.45 * bk + rum.step(nz, 85, 0.8).lp * (0.35 + 0.9 * c);
      }
    });
    return normalize(seamless(d, sr, 0.6), 0.7, true);
  },
  /**
   * A torpedo running (loops, 3 s): the whine of its engine, the buzz of the two contra-rotating propellers beating against each
   * other, and the bubbles of its wake. Heard through the water and the surface, so mostly the low and mid parts.
   */
  torpedo_run(sr, seed) {
    const r = prng(seed), L = 3;
    const d = mk(sr, L, (d, n) => {
      const hiss = new SVF(sr), low = new SVF(sr);
      let p1 = 0, p2 = 0, p3 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, nz = r() * 2 - 1, vib = 1 + 0.004 * Math.sin(TAU * 3 * t);
        p1 += TAU * 540 * vib / sr; p2 += TAU * 580 * vib / sr; p3 += TAU * 1080 * vib / sr;
        d[i] = (Math.sin(p1) + Math.sin(p2)) * 0.45 + Math.sin(p3) * 0.18 + hiss.step(nz, 1600, 0.6).bp * 0.45 + low.step(nz, 120, 0.7).lp * 0.7;
      }
    });
    bubbles(d, sr, r, L, 22, 500, 2200, 0.15);
    return normalize(seamless(d, sr, 0.2), 0.6, true);
  },
};
