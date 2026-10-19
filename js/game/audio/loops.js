// Continuous voices that follow their sources every frame (aircraft engines with Doppler shift, ship machinery, fires,
// flooding) and the one-shot announcements of shells and bombs coming close.
import { C_SOUND } from './common.js';

const rnd = Math.random;

export const loopMethods = {
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
  },
  setLoop(v, gain, rate, x, y, z, ref) {
    const ctx = this.ctx, m = this.geo(x, y, z);
    const att = 1 / (1 + Math.pow(m.d / ref, 1.3));
    const t = ctx.currentTime;
    v.g.gain.setTargetAtTime(Math.min(1.4, gain * att), t, 0.12);
    v.src.playbackRate.setTargetAtTime(rate, t, 0.08);
    v.lp.frequency.setTargetAtTime(Math.max(300, Math.min(16000, 15000 / (1 + m.d / 700))), t, 0.1);
    if (v.pan) v.pan.pan.setTargetAtTime(m.pan, t, 0.08);
    return m;
  },

  /** Engines (and the Stuka's siren) of the aircraft near the camera, with Doppler shift. */
  planeLoops(w, cam) {
    const near = [];
    for (const p of w.planes) {
      if (p.hidden || (p.eng != null && p.eng < 0.02)) continue;
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
      if (p.eng != null) rate = (0.5 + 0.42 * Math.min(1, p.eng)) * doppler;      // an engine starting, idling or at full power on deck
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
  },

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
      if (s.state === 'afloat' && sp > 0.08 && d < 700) {
        const v = this.loop('sb' + s.id, 'bow_wave');
        this.setLoop(v, 0.04 + 0.5 * sp * sp, 0.85 + 0.35 * sp, s.x, 1, s.z, 90 + s.stats.L * 0.35);
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
  },

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
  },
};
