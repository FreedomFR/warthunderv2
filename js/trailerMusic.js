// Procedural score for the trailer, rendered offline with Web Audio: drone, string pad, taiko / snare / hats, a brass motif,
// risers and big hits placed on the cuts. Everything comes from oscillators and filtered noise (no samples).
import { makeReverbIR } from './game/audio/synth.js';

const SR = 44100;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * spec: { dur, bpm, intro, riseAt, climaxAt, titleAt, hits: [times of big hits], cuts: [times of cuts] } (seconds)
 * Returns an AudioBuffer (stereo, 44.1 kHz).
 */
export async function renderMusic(spec) {
  const dur = spec.dur, bpm = spec.bpm || 92, beat = 60 / bpm, bar = beat * 4;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // ---- bus: dry + reverb -> compressor -> out
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp); comp.connect(ctx.destination);
  const ir = makeReverbIR(SR, 3.4);
  const irb = ctx.createBuffer(1, ir.length, SR); irb.getChannelData(0).set(ir);
  const rev = ctx.createConvolver(); rev.buffer = irb;
  const revG = ctx.createGain(); revG.gain.value = 0.55;
  rev.connect(revG); revG.connect(master);
  const send = (node, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(rev); };

  // noise buffer
  const nb = ctx.createBuffer(1, SR * 3, SR); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const noise = (t, len) => { const s = ctx.createBufferSource(); s.buffer = nb; s.start(t, rnd() * 1.5, len); return s; };

  // ---- instruments
  const env = (g, t, a, d, s, r, peak, hold) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * s, t + a + d);
    g.gain.setValueAtTime(peak * s, t + hold);
    g.gain.linearRampToValueAtTime(0, t + hold + r);
  };
  const drone = (t, len, midi, vol, sweep = 1) => {
    const g = ctx.createGain(); env(g, t, Math.min(2.5, len * 0.3), 0.5, 0.9, Math.min(3, len * 0.4), vol, len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(180 + 700 * sweep, t + len);
    for (const det of [-9, 0, 9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len + 3.2);
    }
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = mtof(midi - 12); sub.connect(lp); sub.start(t); sub.stop(t + len + 3.2);
    lp.connect(g); g.connect(master); send(g, 0.25);
  };
  const pad = (t, len, notes, vol, bright = 1) => {
    const g = ctx.createGain(); env(g, t, Math.min(1.6, len * 0.35), 0.4, 0.85, Math.min(2.2, len * 0.5), vol, len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 1700 * bright; lp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = 9; lfo.connect(lg);
    for (const m of notes) for (const det of [-8, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; lg.connect(o.detune);
      o.connect(lp); o.start(t); o.stop(t + len + 2.4);
    }
    lfo.start(t); lfo.stop(t + len + 2.4);
    lp.connect(g); g.connect(master); send(g, 0.5);
  };
  const brass = (t, len, midi, vol) => {
    const g = ctx.createGain(); env(g, t, 0.05, 0.15, 0.75, 0.22, vol, len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.14); lp.frequency.exponentialRampToValueAtTime(1500, t + len);
    for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + len + 0.3); }
    lp.connect(g); g.connect(master); send(g, 0.4);
  };
  const taiko = (t, vol, big = false) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 95 : 120, t); o.frequency.exponentialRampToValueAtTime(big ? 38 : 52, t + (big ? 0.5 : 0.22));
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.4 : 0.5));
    o.connect(g); o.start(t); o.stop(t + 1.5);
    const n = noise(t, 0.18), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = big ? 160 : 260; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.9, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp); bp.connect(ng); ng.connect(g);
    g.connect(master); send(g, big ? 0.7 : 0.3);
  };
  const snare = (t, vol) => {
    const n = noise(t, 0.3), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(bp); bp.connect(g); g.connect(master); send(g, 0.35);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.12);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.2);
  };
  const hat = (t, vol) => {
    const n = noise(t, 0.08), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(hp); hp.connect(g); g.connect(master);
  };
  const riser = (t, len, vol) => {
    const n = noise(t, len + 0.2), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    n.connect(bp); bp.connect(g); g.connect(master); send(g, 0.4);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(38), t); o.frequency.exponentialRampToValueAtTime(mtof(74), t + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(5000, t + len);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vol * 0.6, t + len); og.gain.linearRampToValueAtTime(0, t + len + 0.05);
    o.connect(lp); lp.connect(og); og.connect(master); o.start(t); o.stop(t + len + 0.1);
  };
  const reverseCrash = (t, len, vol) => {   // swell leading into a hit
    const n = noise(t, len), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(7000, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + len);
    n.connect(lp); lp.connect(g); g.connect(master); send(g, 0.6);
  };

  // ---- composition: D minor, Dm - Bb - F - C
  const chords = [[50, 53, 57, 62], [46, 53, 58, 62], [53, 57, 60, 65], [48, 55, 60, 64]];
  const bassNote = [38, 34, 41, 36];
  const motif = [[0, 0.75, 69], [0.75, 0.25, 69], [1, 1, 72], [2, 1.5, 74], [3.5, 0.5, 72], [4, 1, 69], [5, 1, 65], [6, 2, 62]];   // in beats, over 2 bars
  const nBars = Math.ceil(dur / bar);
  const intro = spec.intro ?? 6, rise = spec.riseAt ?? 36, climax = spec.climaxAt ?? 40, title = spec.titleAt ?? dur - 7;

  drone(0, Math.min(dur, intro + 8), 38, 0.5, 1.2);
  for (let b = 0; b < nBars; b++) {
    const t = b * bar, c = b % 4;
    if (t >= dur) break;
    const act = t >= intro ? (t >= rise && t < climax ? 2 : t >= climax && t < title ? 3 : t >= title ? 1 : 2) : 0;
    // string pad: from the intro on, one chord per bar
    if (t >= intro * 0.55) pad(t, bar * 1.02, chords[c], t >= title ? 0.12 : act >= 2 ? 0.2 : 0.14, act >= 3 ? 1.2 : 0.8);
    if (act >= 2 && t < title) drone(t, bar * 1.0, bassNote[c], act >= 3 ? 0.34 : 0.26, 0.5);
    // drums
    for (let q = 0; q < 8; q++) {
      const tt = t + q * beat / 2;
      if (tt >= dur) break;
      if (act === 0 && q === 0 && b % 2 === 0) taiko(tt, 0.35);
      if (act === 2) {
        if (q % 4 === 0) taiko(tt, 0.55);
        if (q === 2 || q === 6) snare(tt, 0.28);
        if (q % 2 === 1) hat(tt, 0.1);
      }
      if (act === 3) {
        if (q % 2 === 0) taiko(tt, 0.6 + (q === 0 ? 0.1 : 0));
        if (q === 2 || q === 6) snare(tt, 0.42);
        hat(tt, 0.12);
      }
    }
  }
  // brass motif over the action sections
  for (let b = 0; b < nBars; b += 2) {
    const t0 = b * bar;
    if (t0 < intro + bar * 2 || t0 >= title) continue;
    for (const [s, l, m] of motif) {
      const tt = t0 + s * beat;
      if (tt < dur) brass(tt, l * beat * 0.95, m - (b % 8 >= 4 ? 5 : 0), t0 >= climax ? 0.3 : 0.2);
    }
  }
  // riser and swell into the climax, hits on the requested moments
  if (rise < dur) { riser(rise, Math.max(1, climax - rise), 0.26); reverseCrash(Math.max(0, climax - 2.2), 2.2, 0.35); }
  for (const t of spec.hits || []) if (t < dur) taiko(t, 0.95, true);
  for (const t of spec.cuts || []) if (t < dur && t > 0.5) taiko(t, 0.4);
  if (title < dur) { taiko(title, 1.0, true); drone(title, dur - title, 38, 0.45, 1.5); pad(title, dur - title, chords[0], 0.18, 1.4); }
  // fade
  master.gain.setValueAtTime(0.0, 0); master.gain.linearRampToValueAtTime(0.9, 1.2);
  master.gain.setValueAtTime(0.9, Math.max(1.3, dur - 2.5)); master.gain.linearRampToValueAtTime(0, dur);
  return ctx.startRendering();
}

/** 16-bit stereo WAV (base64) of an AudioBuffer. */
export function wavBase64(buf, seconds) {
  const n = Math.min(buf.length, Math.ceil((seconds ?? buf.duration) * buf.sampleRate)), ch = buf.numberOfChannels;
  const bytes = new Uint8Array(44 + n * ch * 2), dv = new DataView(bytes.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
