// Game sound: positional playback of the procedurally synthesised sounds (see audio/synth.js). Every sound comes from
// somewhere in the world: it is attenuated and low-passed with the distance, arrives late (speed of sound), is panned
// according to the camera, and the loud ones ring in an open-sea reverb. Continuous sounds (aircraft engines, the Stuka
// siren, fires, ship machinery, wind) follow their sources every frame, with Doppler shift for aircraft.
import { makeLibrary, makeReverbIR } from './audio/synth.js';
import { C_SOUND } from './audio/common.js';
import { airCutoff, seaEchoDelay, shadowed, enclosure } from './audio/propagation.js';
import { eventMethods } from './audio/events.js';
import { loopMethods } from './audio/loops.js';

const MAX_VOICES = 64;
const BLASTS = new Set(['gun_big', 'gun_med', 'gun_small', 'explosion_big', 'explosion_med', 'explosion_small', 'torpedo_hit', 'impact_pen', 'impact_he']);

export class GameAudio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.volume = 0.75;
    this.hrtf = false;                // binaural rendering of the loudest sounds (headphones): costs a little CPU
    try { this.hrtf = localStorage.getItem('naval-hrtf') === '1'; } catch (e) { /* storage unavailable */ }
    this.active = 0;
    this.loops = new Map();           // continuous voices by key
    this.rushed = new Set();          // shells / bombs already announced
    this.scanT = 0;
    this.land = 0;                    // 0 open sea .. 1 among cliffs and hulls (the reverb)
    this.envT = 0;
    try { this.muted = localStorage.getItem('naval-muted') === '1'; } catch (e) { /* storage unavailable */ }
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  unlock() {
    if (this.ctx || typeof AudioContext === 'undefined') { this.ctx?.resume?.(); return; }
    this.build(new AudioContext());
  }

  /**
   * Offline mode for the trailer recorder: the sounds are scheduled on an OfflineAudioContext whose clock is driven by hand
   * (offline.t = time of the frame being recorded) and rendered to a buffer at the end of a scene.
   */
  useOffline(ctx) {
    this.offline = { t: 0, on: false, ends: [] };
    Object.defineProperty(ctx, 'currentTime', { get: () => this.offline.t, configurable: true });
    this.build(ctx);
  }

  build(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // glue compressor, then a soft clipper as the last word: a salvo and a magazine explosion may go beyond full scale in the mix
    // (the sounds are calibrated to the loudness of their source, not squeezed under 1) and are rounded off instead of cracking
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    let limiter = null;
    if (ctx.createWaveShaper) {
      const pre = ctx.createGain(); pre.gain.value = 0.5;
      const ws = ctx.createWaveShaper(), curve = new Float32Array(2048), k = 1.95, norm = Math.tanh(k);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * (i / (curve.length - 1) * 2 - 1)) / norm;
      ws.curve = curve;
      comp.connect(pre); pre.connect(ws); limiter = ws;
    }
    // the cockpit canopy and the ringing that follows a blast close to the ears both muffle everything that comes out of the master bus
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.shock = 0;
    this.master.connect(this.muffle); this.muffle.connect(comp);
    if (limiter) limiter.connect(ctx.destination); else comp.connect(ctx.destination);
    this.lib = makeLibrary(ctx.sampleRate, (n, sr) => ctx.createBuffer(1, n, sr));
    if (!this.offline && typeof setTimeout !== 'undefined') this.lib.warm();       // build every variant in the background
    // two spaces: the open sea (a short wash and a few echoes off the ships) and the rock and steel around (a bay, a cliff, a big hull)
    const mkVerb = (seconds, kind, gain) => {
      const ir = makeReverbIR(ctx.sampleRate, seconds, kind);
      const irb = ctx.createBuffer(1, ir.length, ctx.sampleRate); irb.getChannelData(0).set(ir);
      const cv = ctx.createConvolver(); cv.buffer = irb;
      const g = ctx.createGain(); g.gain.value = gain;
      cv.connect(g); g.connect(this.master);
      return { cv, g };
    };
    const sea = mkVerb(2.0, 'sea', 0.85), land = mkVerb(3.0, 'land', 0);
    this.reverb = ctx.createGain();                   // the send bus of every voice feeds both
    this.reverb.connect(sea.cv); this.reverb.connect(land.cv);
    this.revGain = sea.g; this.landGain = land.g;
    // sea ambience
    const src = ctx.createBufferSource(); src.buffer = this.lib.get('wind'); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 0.048;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambient = g;
    // the swell of the sea underneath: long washes with a deep pressure
    const sw = ctx.createBufferSource(); sw.buffer = this.lib.get('swell'); sw.loop = true;
    const sg = ctx.createGain(); sg.gain.value = 0.3;
    sw.connect(sg); sg.connect(this.master); sw.start(0, Math.random() * 12);
    this.swell = sg;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('naval-muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  get live() {
    const g = this.game;
    if (this.offline) return this.offline.on && !this.muted;
    return this.ctx && !this.muted && !g.paused && g.timeScale <= 2.5 && this.ctx.state === 'running' && g.state !== 'setup';
  }

  // ---- geometry ------------------------------------------------------------------------------------------------------
  /** Distance, delay, pan of a world point relative to the camera (listener). */
  geo(x, y, z) {
    const c = this.game.engine.cam;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const d = Math.hypot(dx, dy * 0.5, dz);
    const ts = Math.max(0.5, this.game.timeScale);
    const brg = Math.atan2(dx, -dz) - c.yaw;
    const horiz = Math.hypot(dx, dz);
    return { d, delay: Math.min(d / C_SOUND / ts, 40), pan: Math.sin(brg) * Math.min(1, horiz / 40) * 0.85 };
  }

  /**
   * Play a sound at a world position. opts: gain, rate, ref (distance in m where it has dropped by 3 dB), pri (1 low .. 4 vital),
   * wet (reverb send), when (extra delay, s), arg (parameter of the sound: calibre, ...), variant (a given variant instead of a random
   * one), offset (start that far into the sound, s), near (no propagation delay), far (the sound is a blast: it lengthens with distance).
   */
  play(name, x, y, z, o = {}) {
    if (!this.live) return null;
    const ref = o.ref ?? 600, pri = o.pri ?? 1;
    if (this.offline) { const o = this.offline; o.ends = o.ends.filter((e) => e > o.t); this.active = o.ends.length; }
    if (this.active >= MAX_VOICES && pri < 3) return null;
    if (this.active >= MAX_VOICES + 12) return null;
    const m = this.geo(x, y, z);
    const att = 1 / (1 + Math.pow(m.d / ref, 1.35));
    const gain = (o.gain ?? 1) * att;
    if (gain < 0.008) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.near ? 0 : m.delay) + (o.when || 0);
    const src = ctx.createBufferSource();
    src.buffer = o.variant != null ? this.lib.get(name, o.arg, o.variant) : this.lib.pick(name, o.arg);
    // the positive phase of a blast wave lengthens as it travels (nonlinear steepening, and the highs lost), so a far gun is deeper
    const blast = o.far ?? BLASTS.has(name);
    const rate = (o.rate ?? 1) * (blast ? 1 / (1 + 0.05 * Math.min(3, m.d / 2500)) : 1);
    src.playbackRate.value = rate;
    // the air takes the highs away with distance (ISO 9613-1); an island in the way takes more
    const cam = this.game.engine.cam, w = this.game.world;
    const hid = m.d > 200 && shadowed(w?.terrain, cam, x, y, z);
    const fc = airCutoff(m.d) * (hid ? 0.4 : 1);
    const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.Q.value = 0.55; lp1.frequency.value = fc;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = Math.min(20000, fc * 2.3);
    lp1.connect(lp);
    const g = ctx.createGain(); g.gain.value = Math.min(1.6, gain * (hid ? 0.6 : 1));
    // headphones: the loud sounds go through an HRTF panner (front / back and height cues); the others (and the speakers) use the plain stereo pan
    const bin = this.hrtf && pri >= 2 && ctx.createPanner ? this.binaural(x, y, z) : null;
    const pan = bin ? null : ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = m.pan;
    src.connect(lp1); lp.connect(g);
    // the loud ones also reach the listener by a second path off the water, a little later: the comb of dips of a gun heard over the sea
    let refl = null;
    if (pri >= 3 && m.d > 120 && ctx.createDelay) {
      refl = [ctx.createDelay(0.05), ctx.createBiquadFilter(), ctx.createGain()];
      refl[0].delayTime.value = seaEchoDelay(m.d, y, cam.y); refl[1].type = 'lowpass'; refl[1].frequency.value = 900; refl[2].gain.value = 0.45;
      lp.connect(refl[0]); refl[0].connect(refl[1]); refl[1].connect(refl[2]); refl[2].connect(g);
    }
    if (bin) { g.connect(bin); bin.connect(this.master); } else if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    // reverb: big sounds ring over the water, more so from far away
    const wet = (o.wet ?? 0.15) * (0.4 + Math.min(1, m.d / 3500));
    let send = null;
    if (wet > 0.02) { send = ctx.createGain(); send.gain.value = wet; lp.connect(send); send.connect(this.reverb); }
    if (this.offline) this.offline.ends.push(t0 + (src.buffer.duration - (o.offset || 0)) / Math.max(0.1, rate));
    else {
      this.active++;
      src.onended = () => { this.active--; src.disconnect(); lp1.disconnect(); lp.disconnect(); g.disconnect(); if (pan) pan.disconnect(); if (bin) bin.disconnect(); if (send) send.disconnect(); if (refl) for (const n of refl) n.disconnect(); };
    }
    if (o.offset) src.start(t0, o.offset); else src.start(t0);
    return src;
  }

  /** A panner that places a source in the head: direction only (the distance is handled by the gain and the filter). */
  binaural(x, y, z) {
    const c = this.game.engine.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const brg = Math.atan2(dx, -dz) - c.yaw, hz = Math.hypot(dx, dz) || 1, el = Math.atan2(dy, hz) - (c.pitch || 0) * 0;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0;
    const ce = Math.cos(el);
    for (const [k, v] of [['positionX', Math.sin(brg) * ce], ['positionY', Math.sin(el)], ['positionZ', -Math.cos(brg) * ce]]) { if (p[k]) p[k].value = v; }
    return p;
  }

  setHrtf(on) {
    this.hrtf = !!on;
    try { localStorage.setItem('naval-hrtf', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  update(dt) {
    if (!this.ctx) return;
    // master bus: canopy and blast
    {
      const cockpit = this.game.camera?.mode === 'cockpit';
      this.shock *= Math.exp(-dt / 1.1);
      const sh = this.shock > 0.02 ? this.shock : 0;
      const t = this.ctx.currentTime;
      this.muffle.frequency.setTargetAtTime(Math.max(500, (cockpit ? 4500 : 20000) * (1 - 0.85 * sh)), t, sh > 0.5 ? 0.02 : 0.15);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * (1 - 0.4 * sh), t, 0.03);
    }
    // the space around the listener: open water, or rock and steel close by
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 0.4;
      const w = this.game.world, cam = this.game.engine.cam;
      this.land += (enclosure(w?.terrain, w?.ships, cam) - this.land) * 0.5;
      const t = this.ctx.currentTime;
      this.revGain.gain.setTargetAtTime(0.85 - 0.45 * this.land, t, 0.5);
      this.landGain.gain.setTargetAtTime(1.0 * this.land, t, 0.5);
    }
    const live = this.live;
    for (const v of this.loops.values()) v.seen = false;
    if (live) {
      const w = this.game.world, cam = this.game.engine.cam;
      this.planeLoops(w, cam);
      this.shipLoops(w, cam, dt);
      this.scan(w, cam, dt);
      this.baseLoops(w, cam);
      this.torpedoLoops(w, cam);
      this.shoreLoops(w, cam, dt);
      // wind in the cockpit
      const cp = this.game.camera.mode === 'cockpit' && this.game.camera.plane;
      const wv = this.loop('wind', 'wind');
      const speed = cp ? this.game.camera.plane.speed : 0;
      const t = this.ctx.currentTime;
      wv.g.gain.setTargetAtTime(cp ? Math.min(0.8, speed / 140) : 0.0, t, 0.2);
      wv.src.playbackRate.setTargetAtTime(0.7 + speed / 200, t, 0.2);
      wv.lp.frequency.value = 5000;
    }
    // stop voices that were not refreshed this frame
    const t = this.ctx.currentTime;
    for (const [k, v] of this.loops) {
      if (v.seen) continue;
      v.g.gain.setTargetAtTime(0, t, 0.1);
      if (t - (v.dead ??= t) > 0.6) { try { v.src.stop(t); } catch (e) { /* stopped */ } v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); if (v.pan) v.pan.disconnect(); this.loops.delete(k); }
    }
    for (const v of this.loops.values()) if (v.seen) v.dead = undefined;
  }
}

// the event mapping and the continuous voices live in audio/events.js and audio/loops.js
Object.assign(GameAudio.prototype, eventMethods, loopMethods);
