// Game sound: positional playback of the procedurally synthesised sounds (see audio/synth.js). Every sound comes from
// somewhere in the world: it is attenuated and low-passed with the distance, arrives late (speed of sound), is panned
// according to the camera, and the loud ones ring in an open-sea reverb. Continuous sounds (aircraft engines, the Stuka
// siren, fires, ship machinery, wind) follow their sources every frame, with Doppler shift for aircraft.
import { makeLibrary, makeReverbIR } from './audio/synth.js';

const C_SOUND = 343;
const MAX_VOICES = 64;
const rnd = Math.random;

export class GameAudio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.muted = false;
    this.volume = 0.75;
    this.active = 0;
    this.loops = new Map();           // continuous voices by key
    this.rushed = new Set();          // shells / bombs already announced
    this.scanT = 0;
    try { this.muted = localStorage.getItem('naval-muted') === '1'; } catch (e) { /* storage unavailable */ }
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  unlock() {
    if (this.ctx || typeof AudioContext === 'undefined') { this.ctx?.resume?.(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.lib = makeLibrary(ctx.sampleRate, (n, sr) => ctx.createBuffer(1, n, sr));
    // open-sea reverb
    const ir = makeReverbIR(ctx.sampleRate, 2.4);
    const irb = ctx.createBuffer(1, ir.length, ctx.sampleRate); irb.getChannelData(0).set(ir);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = irb;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.9;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    // sea ambience
    const src = ctx.createBufferSource(); src.buffer = this.lib.get('wind'); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambient = g;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('naval-muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  get live() {
    const g = this.game;
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
   * wet (reverb send), when (extra delay, s), arg (buffer variant), near (no propagation delay).
   */
  play(name, x, y, z, o = {}) {
    if (!this.live) return null;
    const ref = o.ref ?? 600, pri = o.pri ?? 1;
    if (this.active >= MAX_VOICES && pri < 3) return null;
    if (this.active >= MAX_VOICES + 12) return null;
    const m = this.geo(x, y, z);
    const att = 1 / (1 + Math.pow(m.d / ref, 1.35));
    const gain = (o.gain ?? 1) * att;
    if (gain < 0.008) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.near ? 0 : m.delay) + (o.when || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.lib.get(name, o.arg);
    src.playbackRate.value = o.rate ?? 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = Math.max(260, Math.min(20000, 19000 / (1 + m.d / 650)));
    const g = ctx.createGain(); g.gain.value = Math.min(1.6, gain);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = m.pan;
    src.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    // reverb: big sounds ring over the water, more so from far away
    const wet = (o.wet ?? 0.15) * (0.4 + Math.min(1, m.d / 3500));
    let send = null;
    if (wet > 0.02) { send = ctx.createGain(); send.gain.value = wet; lp.connect(send); send.connect(this.reverb); }
    this.active++;
    src.onended = () => { this.active--; src.disconnect(); lp.disconnect(); g.disconnect(); if (pan) pan.disconnect(); if (send) send.disconnect(); };
    src.start(t0);
    return src;
  }

  // ---- events --------------------------------------------------------------------------------------------------------
  onEvents(events) {
    if (!this.live) return;
    const R = (a, b) => a + (b - a) * rnd();
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': {
          const cal = e.cal, v = e.mount ? (e.mount.idx % 3) : 0, nb = Math.min(e.n || 1, 4);
          const gm = 0.82 + 0.1 * nb;
          if (cal >= 300) this.play('gun_big', e.x, e.y, e.z, { arg: v, gain: gm, ref: 2400, pri: 3, wet: 0.4, rate: R(0.97, 1.03) });
          else if (cal >= 190) this.play('gun_med', e.x, e.y, e.z, { arg: v, gain: 0.95 * gm, ref: 1600, pri: 3, wet: 0.35, rate: R(0.96, 1.04) });
          else if (cal >= 100) this.play('gun_small', e.x, e.y, e.z, { arg: v, gain: 0.9 * gm, ref: 1000, pri: 2, wet: 0.3, rate: R(0.94, 1.06) * (cal >= 140 ? 0.92 : 1) });
          else this.play('gun_small', e.x, e.y, e.z, { arg: v, gain: 0.55, ref: 520, pri: 1, wet: 0.2, rate: R(1.25, 1.5) });
          break;
        }
        case 'splash': {
          const big = e.bomb || e.cal >= 300, mid = e.cal >= 150;
          if (big) this.play('splash_big', e.x, 1, e.z, { gain: e.bomb ? 1 : clamp01(e.cal / 406) * 0.9 + 0.2, ref: 650, pri: 2, wet: 0.3, rate: R(0.92, 1.08) });
          else if (mid) this.play('splash_big', e.x, 1, e.z, { gain: 0.45, ref: 380, pri: 1, wet: 0.2, rate: R(1.15, 1.35) });
          else this.play('splash_small', e.x, 1, e.z, { gain: 0.7, ref: 190, pri: 1, wet: 0.1, rate: R(0.9, 1.15) });
          break;
        }
        case 'impact': {
          const k = e.kind, cal = e.cal || 150;
          if (k === 'penetrate') {
            this.play('impact_pen', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 300, 0.45, 1.15), ref: 1500, pri: 3, wet: 0.35, rate: R(0.93, 1.08) * (cal < 200 ? 1.15 : 1) });
            if (cal >= 250) this.play('explosion_small', e.x, e.y, e.z, { gain: 0.45, ref: 1000, pri: 2, wet: 0.3, when: 0.08, rate: 0.8 });
          } else if (k === 'explode') this.play('impact_he', e.x, e.y, e.z, { arg: (Math.random() * 3) | 0, gain: clampR(cal / 250, 0.4, 1.1), ref: 1000, pri: 2, wet: 0.25, rate: R(0.94, 1.08) * (cal < 150 ? 1.2 : 1) });
          else if (k === 'bounce') this.play('ricochet', e.x, e.y, e.z, { gain: 0.85, ref: 700, pri: 2, wet: 0.2, rate: R(0.8, 1.2) });
          else if (k === 'through') this.play('impact_through', e.x, e.y, e.z, { gain: 0.8, ref: 600, pri: 2, wet: 0.15, rate: R(0.9, 1.15) });
          else if (k === 'torpedo') this.play('torpedo_hit', e.x, 0, e.z, { gain: 1.15, ref: 2400, pri: 4, wet: 0.4 });
          if (e.killed > 0) this.play('crash_metal', e.x, e.y, e.z, { gain: 0.6, ref: 900, pri: 2, when: 0.1 });
          break;
        }
        case 'explosion': {
          if (e.stage === 'secondary') this.play('explosion_med', e.x, e.y, e.z, { gain: 0.8 * Math.min(1.2, 0.5 + e.size), ref: 1900, pri: 3, wet: 0.4, rate: R(0.9, 1.1) });
          else if (e.stage === 'air') this.play('explosion_small', e.x, e.y, e.z, { gain: 0.9, ref: 1000, pri: 3, wet: 0.3, rate: R(0.85, 1.1) });
          else this.play('explosion_big', e.x, e.y, e.z, { gain: 1.35, ref: 5200, pri: 4, wet: 0.55, rate: R(0.94, 1.04) });
          break;
        }
        case 'mountKilled': {
          const w = e.ship.toWorld(e.mount.rec.x, e.mount.rec.y, e.mount.rec.z, [0, 0, 0]);
          this.play('explosion_med', w[0], w[1], w[2], { gain: 0.65, ref: 1300, pri: 2, wet: 0.3, rate: R(1, 1.25) });
          this.play('crash_metal', w[0], w[1], w[2], { gain: 0.5, ref: 800, pri: 2, when: 0.15 });
          break;
        }
        case 'moduleKilled': {
          const s = e.ship;
          if (e.kind === 'aa') { const w = s.toWorld(e.x, e.y, e.z, [0, 0, 0]); this.play('explosion_small', w[0], w[1], w[2], { gain: 0.35, ref: 450, pri: 1, rate: R(1.2, 1.5) }); break; }
          const w = s.toWorld(e.x, e.y, e.z, [0, 0, 0]);
          if (e.kind === 'engine') this.play('boiler_burst', w[0], w[1], w[2], { gain: 0.95, ref: 1100, pri: 3, wet: 0.3 });
          else if (e.kind === 'director' || e.kind === 'radar') { this.play('zap', w[0], w[1], w[2], { gain: 0.8, ref: 450, pri: 2 }); this.play('crash_metal', w[0], w[1], w[2], { gain: 0.4, ref: 600, pri: 1, when: 0.1, rate: 1.3 }); }
          else if (e.kind === 'tubes') this.play('explosion_small', w[0], w[1], w[2], { gain: 0.7, ref: 900, pri: 2 });
          else if (e.kind === 'hangar' || e.kind === 'avgas') this.play('explosion_med', w[0], w[1], w[2], { gain: 0.85, ref: 1700, pri: 3, wet: 0.4 });
          else if (e.kind === 'magazine' || e.kind === 'steering' || e.kind === 'shaft') this.play('bulkhead', w[0], w[1], w[2], { gain: 0.8, ref: 700, pri: 2, wet: 0.2 });
          else this.play('crash_metal', w[0], w[1], w[2], { gain: 0.85, ref: 1100, pri: 2, wet: 0.3, rate: R(0.9, 1.1) });
          break;
        }
        case 'magazineFlooded': {
          const w = e.ship.toWorld(e.x, e.y, e.z, [0, 0, 0]);
          this.play('bulkhead', w[0], w[1], w[2], { gain: 0.5, ref: 500, pri: 1, rate: 0.85 });
          break;
        }
        case 'shipBreak': {
          this.play('crash_metal', e.x, e.y, e.z, { gain: 1.2, ref: 3000, pri: 4, wet: 0.45, rate: 0.7 });
          this.play('explosion_med', e.x, e.y, e.z, { gain: 1.0, ref: 3500, pri: 4, wet: 0.5, rate: 0.85 });
          this.play('hull_groan', e.x, e.y, e.z, { gain: 1.0, ref: 2200, pri: 3, when: 0.5, rate: 0.75 });
          break;
        }
        case 'sinking': {
          const s = e.ship;
          this.play('hull_groan', s.x, 4, s.z, { gain: 0.9, ref: 1300, pri: 2, when: 0.6, rate: R(0.8, 1.05) });
          this.play('bulkhead', s.x, 2, s.z, { gain: 0.7, ref: 900, pri: 2, when: 1.6 });
          this.play('hull_groan', s.x, 4, s.z, { gain: 0.8, ref: 1300, pri: 2, when: 3.6, rate: R(0.6, 0.9) });
          if (!e.magazine) this.play('boiler_burst', s.x, 2, s.z, { gain: 0.7, ref: 1200, pri: 2, when: 5.5 + rnd() * 4, rate: 0.9 });
          break;
        }
        case 'debrisSplash': {
          if (e.size < 1.5 && rnd() > 0.35) break;
          this.play(e.size > 5 ? 'splash_big' : 'splash_small', e.x, 1, e.z, { gain: e.size > 5 ? 0.5 : 0.4, ref: e.size > 5 ? 420 : 200, pri: 1, rate: e.size > 5 ? R(1.2, 1.4) : R(0.9, 1.2) });
          break;
        }
        case 'torpedoLaunch': this.play('torpedo_launch', e.x, 1, e.z, { gain: 0.8, ref: 800, pri: 2 }); break;
        case 'torpedoDrop': this.play('splash_small', e.x, e.y, e.z, { gain: 0.5, ref: 300, pri: 1, rate: 0.8 }); break;
        case 'collision': this.play('collision', e.x, 4, e.z, { gain: 1.1, ref: 1300, pri: 3, wet: 0.3 }); break;
        // ---- anti-aircraft ----
        case 'aaFire': {
          if (rnd() > (this.active > 40 ? 0.3 : 0.7)) break;          // a lot of guns: sample the bursts
          const cb = e.cal >= 35 ? 40 : e.cal >= 22 ? 25 : 20;
          this.play('aa_burst', e.x, e.y, e.z, { arg: cb, gain: 0.55 + 0.08 * Math.min(e.n, 4), ref: cb >= 40 ? 700 : 450, pri: 1, wet: 0.12, rate: R(0.94, 1.08) });
          break;
        }
        case 'flak': this.play('flak_burst', e.x, e.y, e.z, { gain: 0.95, ref: 1100, pri: 2, wet: 0.3, rate: R(0.9, 1.1) }); break;
        // ---- aircraft ----
        case 'planeHit': this.play('ricochet', e.x, e.y, e.z, { gain: 0.4, ref: 300, pri: 1, rate: R(1.3, 1.9) }); break;
        case 'planeDown': {
          if (e.mode !== 'explode') this.play('plane_fall', e.x, e.y, e.z, { gain: 0.9, ref: 2000, pri: 2, wet: 0.2, rate: R(0.9, 1.1) });
          break;
        }
        case 'planeBreakup': this.play('crash_metal', e.x, e.y, e.z, { gain: 0.5, ref: 800, pri: 1, rate: R(1.2, 1.6) }); break;
        case 'planeCrash': {
          if (e.water) {
            this.play('splash_big', e.x, 1, e.z, { gain: 0.9, ref: 900, pri: 2, wet: 0.3, rate: R(0.95, 1.15) });
            this.play('explosion_small', e.x, 2, e.z, { gain: e.ordnance ? 0.95 : 0.6, ref: 1300, pri: 3, wet: 0.35, when: 0.05, rate: R(0.8, 1) });
          } else {
            this.play('explosion_med', e.x, e.y, e.z, { gain: 0.8, ref: 1700, pri: 3, wet: 0.35 });
            this.play('crash_metal', e.x, e.y, e.z, { gain: 0.7, ref: 1000, pri: 2, when: 0.1 });
          }
          break;
        }
        case 'planeDitch': this.play('splash_big', e.x, 1, e.z, { gain: 0.5, ref: 500, pri: 1, rate: 1.2 }); break;
        case 'planeTouchdown': this.play('arrest', e.plane.x, e.plane.y, e.plane.z, { gain: 0.7, ref: 700, pri: 1 }); break;
        default: break;
      }
    }
  }

  // ---- continuous sounds -------------------------------------------------------------------------------------------------
  /** A looping voice that follows a moving source. Returns the voice (created on demand). */
  loop(key, name, o = {}) {
    let v = this.loops.get(key);
    if (v) { v.seen = true; return v; }
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.lib.get(name); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    src.start(0, rnd() * src.buffer.duration);
    v = { key, src, lp, g, pan, seen: true, born: ctx.currentTime };
    this.loops.set(key, v);
    return v;
  }
  setLoop(v, gain, rate, x, y, z, ref) {
    const ctx = this.ctx, m = this.geo(x, y, z);
    const att = 1 / (1 + Math.pow(m.d / ref, 1.3));
    const t = ctx.currentTime;
    v.g.gain.setTargetAtTime(Math.min(1.4, gain * att), t, 0.12);
    v.src.playbackRate.setTargetAtTime(rate, t, 0.08);
    v.lp.frequency.setTargetAtTime(Math.max(300, Math.min(16000, 15000 / (1 + m.d / 700))), t, 0.1);
    if (v.pan) v.pan.pan.setTargetAtTime(m.pan, t, 0.08);
    return m;
  }

  update(dt) {
    if (!this.ctx) return;
    const live = this.live;
    for (const v of this.loops.values()) v.seen = false;
    if (live) {
      const w = this.game.world, cam = this.game.engine.cam;
      this.planeLoops(w, cam);
      this.shipLoops(w, cam);
      this.scan(w, cam, dt);
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
      if (t - (v.dead ??= t) > 0.6) { try { v.src.stop(); } catch (e) { /* stopped */ } v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); if (v.pan) v.pan.disconnect(); this.loops.delete(k); }
    }
    for (const v of this.loops.values()) if (v.seen) v.dead = undefined;
  }

  /** Engines (and the Stuka's siren) of the aircraft near the camera, with Doppler shift. */
  planeLoops(w, cam) {
    const near = [];
    for (const p of w.planes) {
      if (p.phase === 'queue' && p.t < -2.5) continue;
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      if (d < 8000) near.push({ p, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { p, d } of near.slice(0, 5)) {
      const spec = p.spec;
      const eng = this.loop('pe' + p.id, spec.engine.type === 'inline' ? 'engine_inline' : 'engine_radial');
      // Doppler: radial speed of the aircraft relative to the listener
      const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, L = Math.hypot(dx, dy, dz) || 1;
      const vr = (p.vx * dx + p.vy * dy + p.vz * dz) / L;                  // > 0 receding
      const doppler = C_SOUND / (C_SOUND + Math.max(-120, Math.min(120, vr)));
      let rate = (0.72 + (p.speed - 40) / 170) * doppler;
      const diving = p.phase === 'dive' || p.phase === 'rollin';
      if (diving) rate *= 1.18;
      if (p.dying) rate *= Math.max(0.45, 1 - p.dyingT * 0.12);
      if (p.lost.engine) rate *= 0.6;
      let gain = 0.62 * (p.lost.engine ? 0.35 : 1) * (p.phase === 'floating' ? 0 : 1);
      if (p.dying && p.dyingT > 5) gain *= 0.5;
      this.setLoop(eng, gain, Math.max(0.35, Math.min(2.2, rate)), p.x, p.y, p.z, 900);
      if (spec.siren && diving && p.ordnance !== undefined && !p.dying) {
        const sv = this.loop('ps' + p.id, 'siren');
        this.setLoop(sv, 0.8, Math.max(0.6, Math.min(1.6, (0.7 + (p.speed - 60) / 120) * doppler)), p.x, p.y, p.z, 1500);
      }
    }
  }

  /** Machinery of ships close to the camera, fires, and water flooding in. */
  shipLoops(w, cam) {
    const near = [];
    for (const s of w.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
      if (d < 2500) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    let nEng = 0, nFire = 0, nFlood = 0;
    const tgt = this.game.camera.target;
    for (const { s, d } of near) {
      const sp = Math.min(1, Math.abs(s.speed) / Math.max(1, s.stats.maxSpeed));
      if (s.state === 'afloat' && (nEng < 3 || s === tgt)) {
        nEng++;
        const v = this.loop('se' + s.id, 'ship_engine');
        this.setLoop(v, (0.22 + 0.55 * sp) * (s.propulsion > 0.2 ? 1 : 0.5), 0.8 + 0.5 * sp, s.x, 5, s.z, 320 + s.stats.L);
      }
      if (s.fires.length && nFire < 3) {
        nFire++;
        const v = this.loop('sf' + s.id, 'fire');
        this.setLoop(v, Math.min(0.9, 0.18 + s.fires.length * 0.13), 1, s.x, 6, s.z, 260 + s.stats.L * 0.5);
      }
      if ((s.waterFill > 0.06 || s.floodRate > 0) && nFlood < 2 && d < 900) {
        nFlood++;
        const v = this.loop('sw' + s.id, 'gurgle');
        this.setLoop(v, Math.min(0.7, 0.15 + (s.waterFill || 0) * 1.6), 0.9 + (s.waterFill || 0) * 0.3, s.x, 0, s.z, 200 + s.stats.L * 0.4);
      }
    }
  }

  /** Shells whistling past the camera and bombs coming down (announced once, when they get close). */
  scan(w, cam, dt) {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.06;
    for (const s of w.shells) {
      if (this.rushed.has('s' + s.id)) continue;
      const dx = s.x - cam.x, dy = s.y - cam.y, dz = s.z - cam.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 700) continue;
      const approaching = (s.vx * dx + s.vy * dy + s.vz * dz) < 0;
      this.rushed.add('s' + s.id);
      if (!approaching || s.gun.cal < 100) continue;
      this.play('shell_rush', s.x, s.y, s.z, { gain: Math.min(1.1, s.gun.cal / 300 + 0.15), ref: 380, pri: 2, near: true, wet: 0.05, rate: 0.85 + Math.random() * 0.3 });
    }
    for (const b of w.bombs) {
      if (this.rushed.has('b' + b.id)) continue;
      const d = Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z);
      if (d > 3500) continue;
      this.rushed.add('b' + b.id);
      this.play('bomb_whistle', b.x, b.y, b.z, { gain: 0.9, ref: 900, pri: 2, near: true, rate: 0.9 + Math.random() * 0.2 });
    }
    if (this.rushed.size > 800) {
      const live = new Set();
      for (const s of w.shells) live.add('s' + s.id);
      for (const b of w.bombs) live.add('b' + b.id);
      for (const k of this.rushed) if (!live.has(k)) this.rushed.delete(k);
    }
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampR = (v, a, b) => (v < a ? a : v > b ? b : v);
