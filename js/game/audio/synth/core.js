// Shared building blocks of the procedural sounds: random generator, filter, envelopes, echoes, the reverb impulse response.
export const TAU = Math.PI * 2;

export function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** State-variable filter (trapezoidal / TPT, stable at any cutoff): low-, band- and high-pass of the input at once. */
export class SVF {
  constructor(sr) { this.sr = sr; this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  step(x, fc, q = 0.7) {
    const g = Math.tan(Math.PI * Math.min(fc, this.sr * 0.45) / this.sr), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
    return this;
  }
}
export const lpa = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);
/** attack / exponential decay envelope */
export const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

export function mk(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur));
  const d = new Float32Array(n);
  fn(d, n, sr);
  return d;
}
export function normalize(d, peak = 0.95) {
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
export function addEcho(dst, src, sr, delay, g, lp = 0) {
  const off = Math.floor(delay * sr);
  let y = 0;
  const a = lp ? lpa(lp, sr) : 1;
  for (let i = 0; i + off < dst.length && i < src.length; i++) { y += a * (src[i] - y); dst[i + off] += y * g; }
}
/** The front of a blast wave (Friedlander): a sharp positive pulse followed by a short negative phase, `T` seconds long. This is the click at the start of a gun report. */
export const friedlander = (t, T) => (1 - t / T) * Math.exp(-t / T);
export function softclip(x) { return Math.tanh(x * 1.25) / 1.25; }

/** Damped sinusoid ringing (metal, bells). */
export function ring(d, sr, t0, f, amp, decay, phase = 0) {
  const i0 = Math.floor(t0 * sr);
  const n = Math.min(d.length - i0, Math.floor(decay * 6 * sr));
  for (let i = 0; i < n; i++) d[i0 + i] += amp * Math.sin(TAU * f * i / sr + phase) * Math.exp(-i / sr / decay);
}

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
