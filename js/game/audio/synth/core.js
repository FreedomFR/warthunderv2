// Shared building blocks of the procedural sounds: random generator, filter, envelopes, echoes, the reverb impulse response.
export const TAU = Math.PI * 2;

export function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * State-variable filter (trapezoidal / TPT, stable at any cutoff): low-, band- and high-pass of the input at once. The coefficients
 * (a tangent each) are only recomputed every eight samples when the cutoff moves: sweeps are slow next to that, and a sound costs
 * a third of what it did.
 */
export class SVF {
  constructor(sr) { this.sr = sr; this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.fc = -1; this.q = -1; this.cnt = 0; this.k = 1; this.a1 = 0; this.a2 = 0; this.a3 = 0; }
  step(x, fc, q = 0.7) {
    if (q !== this.q || (fc !== this.fc && this.cnt-- <= 0)) {
      const g = Math.tan(Math.PI * Math.min(fc, this.sr * 0.45) / this.sr), k = 1 / q;
      this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
      this.fc = fc; this.q = q; this.cnt = 7;
    }
    const k = this.k, a1 = this.a1, a2 = this.a2, a3 = this.a3;
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
export function normalize(d, peak = 0.95, loop = false) {
  let m = 1e-9;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  const k = peak / m;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  if (loop) return d;                  // a loop must not dip where it wraps
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


/** Hash of a name, so that every sound gets its own noise sequence. */
export function hashName(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** x randomly varied by +-f (fraction): the variants of a sound differ in their parameters, not only in their noise. */
export const jit = (r, x, f = 0.1) => x * (1 + f * (r() * 2 - 1));

/**
 * A bubble ringing in water (Minnaert resonance f = 3.26 / radius, in Hz and metres): the damping and the rise of the pitch as the
 * bubble shrinks follow van den Doel's fit (damping d = 0.043 f + 0.0014 f^1.5 per second, pitch rise 0.13 d per second).
 */
export function bubble(d, sr, t0, f, amp) {
  const i0 = Math.floor(t0 * sr), damp = 0.043 * f + 0.0014 * Math.pow(f, 1.5), xi = 0.13 * damp;
  const n = Math.min(d.length - i0, Math.floor(sr * 5 / damp));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += TAU * f * (1 + xi * t) / sr;
    d[i0 + i] += amp * Math.sin(ph) * Math.exp(-damp * t) * Math.min(1, t * 4000);
  }
}

/** Soft limiter for building sounds: keeps the shape at low level, bends the peaks above `knee` towards `knee + 1`. */
export function limit(d, knee = 0.8) {
  const k = 1;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > knee) d[i] = Math.sign(d[i]) * (knee + k * Math.tanh((a - knee) / k)); }
  return d;
}

/**
 * Reverb impulse response (mono). 'sea': the open sea gives almost no late reflection, a short diffuse wash from the waves and the
 * hulls around plus a few early echoes; 'land': cliffs and a bay (or a big hull close by): denser, longer, with distinct slap-back echoes.
 */
export function makeReverbIR(sr, seconds = 2.4, kind = 'sea') {
  const land = kind === 'land';
  const r = prng(land ? 78 : 77);
  const n = Math.floor(sr * seconds);
  const d = new Float32Array(n);
  const lp = new SVF(sr);
  const decay = land ? 1.9 : 3.1, bright = land ? 2200 : 1600;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = r() * 2 - 1;
    d[i] = lp.step(nz, bright * Math.exp(-t * 1.1) + 300, 0.7).lp * Math.exp(-t * decay) * (i < 40 ? i / 40 : 1) * (land ? 1 : 0.8);
  }
  // distinct early reflections: from the surrounding ships (sea) or off the rock face (land: further out and louder)
  const early = land ? [[0.09, 0.8], [0.21, 0.65], [0.38, 0.5], [0.62, 0.38], [0.95, 0.25]] : [[0.045, 0.5], [0.11, 0.38], [0.19, 0.3], [0.31, 0.2]];
  for (const [t0, g] of early) { const i0 = Math.floor(t0 * sr); for (let k = 0; k < 90 && i0 + k < n; k++) d[i0 + k] += (r() * 2 - 1) * g * Math.exp(-k / (land ? 40 : 25)); }
  return d;
}

/** A-weighting filter (IEC 61672 poles, bilinear transform, 0 dB at 1 kHz) applied to a buffer: a copy, not in place. */
export function aWeight(d, sr) {
  const w = (f) => TAU * f, w1 = w(20.598997), w2 = w(107.65265), w3 = w(737.86223), w4 = w(12194.217);
  // s^2 / (s + w1)^2,  s / ((s + w2)(s + w3)),  s / (s + w4)^2  as [b2, b1, b0, a2, a1, a0] in s
  const secs = [[1, 0, 0, 1, 2 * w1, w1 * w1], [0, 1, 0, 1, w2 + w3, w2 * w3], [0, 1, 0, 1, 2 * w4, w4 * w4]];
  const c = 2 * sr, bq = secs.map(([b2, b1, b0, a2, a1, a0]) => {
    const A0 = a2 * c * c + a1 * c + a0;
    return { b0: (b2 * c * c + b1 * c + b0) / A0, b1: (2 * b0 - 2 * b2 * c * c) / A0, b2: (b2 * c * c - b1 * c + b0) / A0, a1: (2 * a0 - 2 * a2 * c * c) / A0, a2: (a2 * c * c - a1 * c + a0) / A0, x1: 0, x2: 0, y1: 0, y2: 0 };
  });
  // gain at 1 kHz
  const om = TAU * 1000 / sr, cr = Math.cos(om), ci = -Math.sin(om), c2r = Math.cos(2 * om), c2i = -Math.sin(2 * om);
  let g = 1;
  for (const q of bq) {
    const nr = q.b0 + q.b1 * cr + q.b2 * c2r, ni = q.b1 * ci + q.b2 * c2i, dr = 1 + q.a1 * cr + q.a2 * c2r, di = q.a1 * ci + q.a2 * c2i;
    g *= Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
  const out = new Float32Array(d.length), k = 1 / g;
  for (let i = 0; i < d.length; i++) {
    let x = d[i];
    for (const q of bq) { const y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2; q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y; x = y; }
    out[i] = x * k;
  }
  return out;
}

/**
 * Perceived level (dB re full scale) of the audible part of a sound: the A-weighted power plus a tenth (-10 dB) of the unweighted
 * power. A pure A-weighting ignores the deep bass of a gun or an explosion altogether (the ear is nearly deaf to 30 Hz at low level,
 * but a salvo is felt in the chest and heard on headphones), and would have them boosted into the limiter; a tenth of the raw power
 * counts that weight without letting it dominate. The audible part runs from the start to the last 20 ms window within 40 dB of the
 * loudest one (the silent tail of a decay would dilute a short loud sound).
 */
export function levelDb(d, sr, weighted = true) {
  const a = aWeight(d, sr), w = Math.max(1, Math.floor(sr * 0.02));
  const rms = []; let top = 0;
  for (let s = 0; s + w <= d.length; s += w) { let q = 0; for (let i = 0; i < w; i++) q += d[s + i] * d[s + i]; q = Math.sqrt(q / w); rms.push(q); if (q > top) top = q; }
  let last = 1;
  rms.forEach((q, i) => { if (q > top * 0.01) last = i + 1; });
  const n = Math.min(d.length, last * w);
  let ea = 0, ef = 0; for (let i = 0; i < n; i++) { ea += a[i] * a[i]; ef += d[i] * d[i]; }
  ea /= Math.max(1, n); ef /= Math.max(1, n);
  return 10 * Math.log10((weighted ? ea + 0.1 * ef : ea) + 1e-12);
}
export const levelDbA = (d, sr) => levelDb(d, sr, false);

/** Makes a buffer loop without a click: the last `sec` seconds are faded into the start and cut off. Returns a shorter array. */
export function seamless(d, sr, sec) {
  const x = Math.floor(sec * sr), n = d.length - x;
  const out = d.slice(0, n);
  for (let i = 0; i < x; i++) { const k = i / x; out[i] = d[i] * k + d[n + i] * (1 - k); }
  return out;
}
