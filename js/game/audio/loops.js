// Continuous voices that follow their sources every frame (aircraft engines with Doppler shift, ship machinery, fires,
// flooding) and the one-shot announcements of shells and bombs coming close.
import { C_SOUND, clampR } from './common.js';
import { airCutoff } from './propagation.js';

const rnd = Math.random;

export const loopMethods = {
  /** A looping voice that follows a moving source. Returns the voice (created on demand). */
  loop(key, name, o = {}) {
    let v = this.loops.get(key);
    if (v) { v.seen = true; return v; }
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.lib.get(name, o.arg); src.loop = true;
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
    v.lp.frequency.setTargetAtTime(Math.min(16000, airCutoff(m.d) * 1.5), t, 0.1);
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
      // a bigger engine has more cylinders (9 in a small radial, 14 in a two-row, 18 in the biggest), a V-12 has 12: the firing note follows
      const er = spec.engine.r || 0.7;
      const eng = this.loop('pe' + p.id, spec.engine.type === 'inline' ? 'engine_inline' : 'engine_radial', { arg: spec.engine.type === 'inline' ? 12 : er < 0.68 ? 9 : er < 0.85 ? 14 : 18 });
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

  /** Machinery of ships close to the camera, turret motors and breeches, fires, and water flooding in. */
  shipLoops(w, cam, dt = 0.016) {
    const near = [];
    for (const s of w.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
      if (d < 2500) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    let nEng = 0, nFire = 0, nFlood = 0, nTurb = 0, nCav = 0, nTurret = 0;
    const tgt = this.game.camera.target;
    for (const { s, d } of near) {
      const sp = Math.min(1, Math.abs(s.speed) / Math.max(1, s.stats.maxSpeed));
      if (s.state === 'afloat' && (nEng < 3 || s === tgt)) {
        nEng++;
        const v = this.loop('se' + s.id, 'ship_engine');
        this.setLoop(v, (0.22 + 0.55 * sp) * (s.propulsion > 0.2 ? 1 : 0.5), 0.8 + 0.5 * sp, s.x, 5, s.z, 320 + s.stats.L);
      }
      // the geared turbines whine higher with the shaft speed; the screws cavitate and hiss in the water once the ship is pushed hard
      if (s.state === 'afloat' && d < 900 && sp > 0.05 && s.propulsion > 0.2 && nTurb < 2) {
        nTurb++;
        const v = this.loop('st' + s.id, 'turbine');
        this.setLoop(v, 0.12 + 0.6 * sp, 0.6 + 0.75 * sp, s.x, 4, s.z, 200 + s.stats.L * 0.5);
      }
      if (s.state === 'afloat' && d < 600 && sp > 0.55 && nCav < 2) {
        nCav++;
        const h = s.heading, back = s.stats.L * 0.42;
        const v = this.loop('sc' + s.id, 'cavitation');
        this.setLoop(v, Math.pow((sp - 0.45) / 0.55, 1.5) * 0.9, 0.8 + 0.4 * sp, s.x - Math.sin(h) * back, -2, s.z + Math.cos(h) * back, 140 + s.stats.L * 0.3);
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
      if (d < 700 && s.state === 'afloat') nTurret += this.turrets(s, nTurret, dt);
    }
  },

  /**
   * What the gun crews do, heard from close by: the hum of a turret training (the motor's pitch follows the angular speed) and the
   * clunk of the breech when a mount has finished loading. Returns 1 if a turret motor was started for this ship.
   */
  turrets(s, nTurret, dt) {
    const mem = (this.mountMem ||= new WeakMap());
    let moving = 0, wx = 0, wy = 0, wz = 0, rate = 0, calMax = 0;
    for (const m of s.mounts) {
      if (!m.alive || !m.gun) continue;
      const st = mem.get(m) || { tr: m.trainRel, reload: m.reload };
      const dTrain = Math.abs(m.trainRel - st.tr) / Math.max(dt, 1e-3);
      // the breech closes when the reload timer runs out (not when the mount is simply idle)
      if (st.reload > 0 && m.reload <= 0 && m.gun.cal >= 100) {
        const p = s.toWorld(m.rec.x, m.rec.y, m.rec.z, _p);
        this.play('breech', p[0], p[1], p[2], { gain: clampR(m.gun.cal / 300, 0.35, 1.2), ref: 220 + m.gun.cal * 0.5, pri: 1, wet: 0.1, rate: 0.85 + Math.random() * 0.3 });
      }
      st.tr = m.trainRel; st.reload = m.reload; mem.set(m, st);
      if (m.gun.cal >= 100 && dTrain > 0.004 && dTrain < 1.5) {
        if (!moving) { const p = s.toWorld(m.rec.x, m.rec.y, m.rec.z, _p); wx = p[0]; wy = p[1]; wz = p[2]; }
        moving++; rate = Math.max(rate, dTrain); calMax = Math.max(calMax, m.gun.cal);
      }
    }
    if (!moving || nTurret >= 2) return 0;
    const v = this.loop('sm' + s.id, 'turret_motor');
    this.setLoop(v, Math.min(0.9, 0.25 + 0.15 * moving) * (calMax >= 250 ? 1 : 0.7), 0.85 + Math.min(0.5, rate * 4), wx, wy, wz, 120 + calMax * 0.5);
    return 1;
  },

  /**
   * Shells whistling past the camera and bombs coming down (announced once, when they get close). A shell that passes close gets the
   * rush of its passing, timed to peak at the closest point, and, if it flies faster than sound, the N-wave of its shock cone, whose
   * length and weight follow the calibre and the miss distance (see synth/guns.js shell_crack).
   */
  scan(w, cam, dt) {
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.06;
    for (const s of w.shells) {
      if (this.rushed.has('s' + s.id)) continue;
      const dx = s.x - cam.x, dy = s.y - cam.y, dz = s.z - cam.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 900) continue;
      const v2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz, closing = s.vx * dx + s.vy * dy + s.vz * dz;
      this.rushed.add('s' + s.id);
      const cal = s.gun.cal;
      if (closing >= 0 || cal < 100 || v2 < 1) continue;
      // the closest approach: where and when
      const tc = clampR(-closing / v2, 0, 8), px = s.x + s.vx * tc, py = s.y + s.vy * tc, pz = s.z + s.vz * tc;
      const b = Math.hypot(px - cam.x, py - cam.y, pz - cam.z), speed = Math.sqrt(v2);
      const lead = 1.4;                                      // the rush swells to its peak this far into the sound
      this.play('shell_rush', px, py, pz, { gain: Math.min(1.1, cal / 300 + 0.15), ref: 380, pri: 2, near: true, wet: 0.05, rate: 0.85 + Math.random() * 0.3, when: Math.max(0, tc - lead), offset: Math.max(0, lead - tc) });
      if (speed > 360 && b < 400 && cal >= 76) {
        const dd = b / (C_SOUND * 1.3);                      // the cone catches up with the ear a little after the closest point
        this.play('shell_crack', px, py, pz, { arg: cal, gain: clampR(Math.pow(cal / 406, 0.5) * Math.pow(100 / Math.max(b, 25), 0.75), 0.05, 1.5), ref: 700, pri: 3, near: true, wet: 0.08, when: tc + dd, rate: clampR(Math.pow(100 / Math.max(b, 25), 0.25), 0.6, 1.6) * (0.97 + 0.06 * Math.random()) });
      }
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

const _p = [0, 0, 0];
