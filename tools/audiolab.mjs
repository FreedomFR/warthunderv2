// Offline look at the procedural sounds (nobody has to listen): renders each sound to a buffer and prints duration, peak, RMS,
// spectral centroid, the share of energy in four bands and how long the sound stays within 20 dB of its loudest point; optionally
// draws a waveform + spectrogram picture (PNG, no dependency).
//   node tools/audiolab.mjs                          table of every sound (variant 0)
//   node tools/audiolab.mjs gun_big splash_big       only these
//   node tools/audiolab.mjs gun_big --png out/audio  also writes out/audio/gun_big.png (waveform on top, spectrogram below)
//   node tools/audiolab.mjs --variants               table of every variant of every sound (shows how much they differ)
//   node tools/audiolab.mjs --json out/audio.json    machine-readable results, to compare before / after
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as synth from '../js/game/audio/synth.js';
const { SOUND_NAMES, renderSound } = synth;
import { levelDbA, levelDb } from '../js/game/audio/synth/core.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf('--' + k); if (i < 0) return false; args.splice(i, 1); return true; };
const pngDir = opt('png'), jsonOut = opt('json'), SR = Number(opt('sr', 44100)), all = flag('variants');
const names = args.length ? args : SOUND_NAMES;

// ---- analysis ---------------------------------------------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function spectrogram(d, sr, N = 1024, hop = 512) {
  const frames = [], win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  for (let s = 0; s + N <= d.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = d[s + i] * win[i];
    fft(re, im);
    const m = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) m[k] = Math.hypot(re[k], im[k]) / N;
    frames.push(m);
  }
  return { frames, N, hop, sr };
}
export function analyse(d, sr) {
  let peak = 0, e = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; e += d[i] * d[i]; }
  // the active part: from the start to the last time the 20 ms RMS is within 40 dB of the loudest 20 ms
  const w = Math.max(1, Math.floor(sr * 0.02)), rmsw = [];
  let top = 0;
  for (let s = 0; s + w <= d.length; s += w) { let q = 0; for (let i = 0; i < w; i++) q += d[s + i] * d[s + i]; q = Math.sqrt(q / w); rmsw.push(q); if (q > top) top = q; }
  let last = 0, within20 = 0;
  rmsw.forEach((q, i) => { if (q > top * 0.01) last = i + 1; if (q > top * 0.1) within20 = i + 1; });
  const act = Math.min(d.length, last * w);
  let ea = 0; for (let i = 0; i < act; i++) ea += d[i] * d[i];
  const sp = spectrogram(d, sr), band = [0, 0, 0, 0], edges = [150, 600, 2500];
  let cn = 0, cd = 0;
  for (const f of sp.frames) for (let k = 1; k < f.length; k++) {
    const hz = k * sr / sp.N, p = f[k] * f[k];
    cn += hz * p; cd += p; band[hz < edges[0] ? 0 : hz < edges[1] ? 1 : hz < edges[2] ? 2 : 3] += p;
  }
  const bt = band.reduce((a, b) => a + b, 0) || 1;
  return {
    dur: d.length / sr, active: act / sr, peak, dba: levelDbA(d, sr), lvl: levelDb(d, sr), rmsDb: 20 * Math.log10(Math.sqrt(ea / Math.max(1, act)) + 1e-9), crest: 20 * Math.log10(peak / (Math.sqrt(ea / Math.max(1, act)) + 1e-9)),
    centroid: cd ? cn / cd : 0, bands: band.map((b) => b / bt), loud: within20 * w / sr,
  };
}

// ---- picture ------------------------------------------------------------------------------------------------------------------
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const heat = (v) => {                                  // 0..1 -> dark purple, red, yellow, white
  const s = [[0, 0, 0, 20], [0.25, 70, 10, 110], [0.5, 200, 40, 60], [0.75, 250, 170, 30], [1, 255, 255, 220]];
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < s.length; i++) if (v <= s[i][0]) { const k = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]); return [0, 1, 2].map((c) => s[i - 1][c + 1] + (s[i][c + 1] - s[i - 1][c + 1]) * k); }
  return [255, 255, 220];
};
function picture(d, sr, file) {
  const W = 900, HW = 120, HS = 360, H = HW + HS;
  const img = Buffer.alloc(W * H * 3, 18);
  const put = (x, y, c) => { if (x < 0 || x >= W || y < 0 || y >= H) return; const o = (y * W + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  // waveform: min / max per column
  for (let x = 0; x < W; x++) {
    const a = Math.floor(x * d.length / W), b = Math.max(a + 1, Math.floor((x + 1) * d.length / W));
    let lo = 0, hi = 0; for (let i = a; i < b; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
    for (let y = Math.round(HW / 2 - hi * HW / 2); y <= Math.round(HW / 2 - lo * HW / 2); y++) put(x, y, [120, 200, 255]);
  }
  // spectrogram: log frequency axis 30 Hz .. nyquist, dB scale 80 dB
  const sp = spectrogram(d, sr, 2048, Math.max(256, Math.floor(d.length / W / 1)));
  let mx = 1e-9; for (const f of sp.frames) for (const v of f) if (v > mx) mx = v;
  const fl = Math.log(30), fh = Math.log(sr / 2);
  for (let x = 0; x < W; x++) {
    const f = sp.frames[Math.min(sp.frames.length - 1, Math.floor(x * sp.frames.length / W))];
    for (let y = 0; y < HS; y++) {
      const hz = Math.exp(fh - (fh - fl) * y / HS), k = Math.min(f.length - 1, Math.round(hz * sp.N / sr));
      put(x, HW + y, heat((20 * Math.log10(f[k] / mx + 1e-9) + 80) / 80));
    }
  }
  // time ticks every second, frequency ticks at 100 / 1k / 10k
  for (let t = 1; t < d.length / sr; t++) for (let y = 0; y < 6; y++) put(Math.round(t * sr * W / d.length), H - 1 - y, [255, 255, 255]);
  for (const hz of [100, 1000, 10000]) { if (hz > sr / 2) continue; const y = HW + Math.round((fh - Math.log(hz)) / (fh - fl) * HS); for (let x = 0; x < 8; x++) put(x, y, [255, 255, 255]); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(W, H, img));
}

// ---- main ---------------------------------------------------------------------------------------------------------------------
const results = {};
const fmt = (n, w, p = 1) => n.toFixed(p).padStart(w);
console.log('sound                 var   dur  act  loud  peak   rmsdB   dBA   level rawlvl crest centroid   <150  <600 <2.5k  >2.5k');
for (const n of names) {
  const arg0 = n === 'aa_burst' ? 20 : undefined;
  const count = all ? (synth.VARIANTS?.[n] || 1) : 1;
  for (let v = 0; v < count; v++) {
    const d = renderSound(n, SR, arg0, v);
    const a = analyse(d, SR);
    const raw = levelDb(renderSound(n, SR, arg0, v, false), SR);
    results[count > 1 ? `${n}#${v}` : n] = a;
    console.log(`${(count > 1 ? `${n}#${v}` : n).padEnd(22)}  ${fmt(a.dur, 4)} ${fmt(a.active, 4)} ${fmt(a.loud, 5, 2)} ${fmt(a.peak, 5, 2)} ${fmt(a.rmsDb, 6)} ${fmt(a.dba, 6)} ${fmt(a.lvl, 6)} ${fmt(raw, 6)} ${fmt(a.crest, 5)} ${fmt(a.centroid, 7, 0)}  ${a.bands.map((b) => fmt(b * 100, 5, 0)).join(' ')}`);
    if (pngDir) picture(d, SR, path.join(pngDir, `${n}${count > 1 ? '_' + v : ''}.png`));
  }
}
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1)); }
