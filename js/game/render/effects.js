// Visual effects driven by simulation events and ship state: muzzle flashes, shell splashes,
// impacts, fires, funnel smoke, sinking, anti-aircraft fire and wakes (foam stamps).
import { clamp, D2R } from '../math.js';
import { K } from './particles.js';

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

export class Effects {
  constructor(engine, particles, game) {
    this.engine = engine; this.p = particles; this.game = game;
    this.emitScale = 1;
    this.shake = 0;
    this._v = [0, 0, 0];
  }

  distToCam(x, z) {
    const c = this.engine.cam;
    return Math.hypot(x - c.x, z - c.z);
  }

  addShake(amount, x, z) {
    const d = this.distToCam(x, z);
    this.shake = Math.min(1.6, this.shake + amount / (1 + d / 250));
  }

  // ---- events -------------------------------------------------------------------------------------------
  process(events) {
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': this.muzzle(e); break;
        case 'splash': this.splash(e); break;
        case 'impact': this.impact(e); break;
        case 'explosion': this.explosion(e); break;
        case 'torpedoLaunch': this.torpedoLaunch(e); break;
        case 'aaFire': this.aaFire(e); break;
        case 'planeDown': this.planeDown(e); break;
        case 'collision': this.collision(e); break;
        case 'mountKilled': this.mountKilled(e); break;
        default: break;
      }
    }
  }

  muzzle(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 16000) return;
    const cs = clamp(e.cal / 200, 0.3, 2.3) * (1 + 0.12 * (e.n - 1));
    const p = this.p;
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 7 * cs, s1: 15 * cs, life: 0.1, r: 1, g: 0.8, b: 0.45, a0: 9, a1: 0 });
    for (let i = 0; i < 3; i++) p.add({ kind: K.FIRE, x: e.x + e.dx * rr(0, 5 * cs), y: e.y + e.dy * rr(0, 5 * cs), z: e.z + e.dz * rr(0, 5 * cs), vx: e.dx * 20 * cs, vy: e.dy * 20 * cs, vz: e.dz * 20 * cs, s0: 3 * cs, s1: 9 * cs, life: 0.28, r: 1, g: 0.62, b: 0.2, a0: 4, a1: 0 });
    const n = Math.round((5 + 4 * cs) * this.emitScale);
    for (let i = 0; i < n; i++) {
      const sp = rr(6, 24) * cs;
      p.add({
        kind: K.SMOKE, x: e.x + e.dx * rr(0, 6) * cs, y: e.y + e.dy * rr(0, 6) * cs, z: e.z + e.dz * rr(0, 6) * cs,
        vx: e.dx * sp + rr(-2, 2), vy: e.dy * sp + rr(0, 3), vz: e.dz * sp + rr(-2, 2),
        s0: 2.5 * cs, s1: rr(14, 26) * cs, life: rr(3, 6.5), r: 0.62, g: 0.57, b: 0.52, a0: 0.55, a1: 0, drag: 1.1, wind: 1, grav: -0.35,
      });
    }
    if (e.cal >= 150) this.addShake(0.045 * cs, e.x, e.z);
    // blast on the water surface in front of the muzzles
    if (d < 1000 && e.cal >= 120) this.engine.foam.add(e.x, e.z, e.x + e.dx * 20, e.z + e.dz * 20, 5 + 6 * cs, 0, 0.35, 0.3);
  }

  splash(e) {
    const d = this.distToCam(e.x, e.z);
    const cs = clamp(e.cal / 400, 0.18, 1.7);
    if (d > 22000 * (0.4 + cs)) return;
    this.addShake(0.02 * cs, e.x, e.z);
    const p = this.p;
    const n = Math.round((8 + 12 * cs) * this.emitScale);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, sp = rr(1, 6) * cs;
      p.add({ kind: K.SPRAY, x: e.x + Math.cos(a) * rr(0, 3) * cs, y: 0.4, z: e.z + Math.sin(a) * rr(0, 3) * cs, vx: Math.cos(a) * sp, vy: rr(16, 46) * Math.pow(cs, 0.7), vz: Math.sin(a) * sp, s0: 2.6 * cs, s1: rr(8, 13) * cs, life: rr(1.5, 3.2), r: 0.92, g: 0.96, b: 1, a0: 0.95, a1: 0, grav: 17, drag: 0.15, wind: 0.4 });
    }
    for (let i = 0; i < 3; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3) * cs, y: rr(2, 9) * cs, z: e.z + rr(-3, 3) * cs, vy: rr(1, 4), s0: 7 * cs, s1: rr(22, 34) * cs, life: rr(2.5, 4), r: 0.85, g: 0.9, b: 0.95, a0: 0.5, a1: 0, drag: 0.5, wind: 1 });
    if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 6 + 13 * cs, 0.0, 1.0, 0.95);
  }

  impact(e) {
    const d = this.distToCam(e.x, e.z);
    if (d > 20000) return;
    const cs = clamp(e.cal / 250, 0.25, 2.2);
    const p = this.p;
    const k = e.kind;
    if (k === 'torpedo') {
      // big water column
      const n = Math.round(34 * this.emitScale);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, sp = rr(1, 9);
        p.add({ kind: K.SPRAY, x: e.x + Math.cos(a) * rr(0, 5), y: 1, z: e.z + Math.sin(a) * rr(0, 5), vx: Math.cos(a) * sp, vy: rr(20, 62), vz: Math.sin(a) * sp, s0: 5, s1: rr(14, 22), life: rr(2.4, 4.4), r: 0.93, g: 0.96, b: 1, a0: 0.95, a1: 0, grav: 12, drag: 0.1, wind: 0.5 });
      }
      p.add({ kind: K.FLASH, x: e.x, y: 6, z: e.z, s0: 30, s1: 60, life: 0.35, r: 1, g: 0.75, b: 0.4, a0: 7, a1: 0 });
      for (let i = 0; i < 6; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-6, 6), y: rr(4, 30), z: e.z + rr(-6, 6), vy: rr(2, 6), s0: 14, s1: rr(40, 70), life: rr(5, 9), r: 0.9, g: 0.93, b: 0.97, a0: 0.55, a1: 0, drag: 0.4, wind: 1 });
      this.addShake(0.5, e.x, e.z);
      if (d < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 40, 0.8, 1, 1);
      return;
    }
    if (k === 'bounce') {
      for (let i = 0; i < 9; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-40, 40), vy: rr(10, 60), vz: rr(-40, 40), s0: 0.25 * cs, life: rr(0.3, 0.7), r: 1, g: 0.75, b: 0.35, a0: 3.5, a1: 0, grav: 20, stretch: 3 * cs });
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 3 * cs, s1: 7 * cs, life: 0.08, r: 1, g: 0.8, b: 0.5, a0: 6, a1: 0 });
      p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vy: 3, s0: 1.5 * cs, s1: 7 * cs, life: 2, r: 0.45, g: 0.43, b: 0.4, a0: 0.4, a1: 0, wind: 1, drag: 0.5 });
      this.addShake(0.03 * cs, e.x, e.z);
      return;
    }
    if (k === 'through') {
      p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 3, s1: 8, life: 0.1, r: 1, g: 0.8, b: 0.5, a0: 5, a1: 0 });
      p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vy: 2, s0: 2, s1: 9, life: 2.5, r: 0.3, g: 0.28, b: 0.26, a0: 0.5, a1: 0, wind: 1, drag: 0.5 });
      return;
    }
    // penetrate / explode
    const big = k === 'penetrate' ? 1.0 : 0.65;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 2, z: e.z, s0: 14 * cs * big, s1: 30 * cs * big, life: 0.22, r: 1, g: 0.72, b: 0.32, a0: 9, a1: 0 });
    const nf = Math.round(6 * big * this.emitScale + 2);
    for (let i = 0; i < nf; i++) p.add({ kind: K.FIRE, x: e.x + rr(-2, 2) * cs, y: e.y + rr(0, 3) * cs, z: e.z + rr(-2, 2) * cs, vx: rr(-6, 6), vy: rr(3, 14), vz: rr(-6, 6), s0: 4 * cs, s1: rr(10, 18) * cs, life: rr(0.5, 1.1), r: 1, g: 0.62, b: 0.2, a0: 4, a1: 0, drag: 1.2 });
    const ns = Math.round(7 * big * this.emitScale + 2);
    for (let i = 0; i < ns; i++) p.add({ kind: K.SMOKE, x: e.x + rr(-3, 3) * cs, y: e.y + rr(0, 4) * cs, z: e.z + rr(-3, 3) * cs, vx: rr(-3, 3), vy: rr(5, 13), vz: rr(-3, 3), s0: 4 * cs, s1: rr(18, 34) * cs, life: rr(7, 14), r: 0.07, g: 0.065, b: 0.06, a0: 0.78, a1: 0, drag: 0.35, wind: 1, grav: -0.25 });
    for (let i = 0; i < 12; i++) p.add({ kind: K.TRACER, x: e.x, y: e.y, z: e.z, vx: rr(-60, 60), vy: rr(10, 80), vz: rr(-60, 60), s0: 0.35 * cs, life: rr(0.4, 1.1), r: 1, g: 0.7, b: 0.3, a0: 3.5, a1: 0, grav: 20, stretch: 4 * cs });
    this.addShake(0.16 * cs * big, e.x, e.z);
  }

  explosion(e) {
    const s = e.size;
    const p = this.p;
    p.add({ kind: K.FLASH, x: e.x, y: e.y + 5, z: e.z, s0: 50 * s, s1: 150 * s, life: 0.7, r: 1, g: 0.72, b: 0.35, a0: 12, a1: 0 });
    const nf = Math.round(26 * this.emitScale + 10);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * 6.283, sp = rr(0, 16) * s;
      p.add({ kind: K.FIRE, x: e.x + Math.cos(a) * rr(0, 14) * s, y: e.y + rr(0, 18) * s, z: e.z + Math.sin(a) * rr(0, 14) * s, vx: Math.cos(a) * sp, vy: rr(8, 36) * s, vz: Math.sin(a) * sp, s0: 14 * s, s1: rr(36, 66) * s, life: rr(1.2, 2.8), r: 1, g: 0.6, b: 0.2, a0: 5, a1: 0, drag: 0.5 });
    }
    const ns = Math.round(40 * this.emitScale + 10);
    for (let i = 0; i < ns; i++) {
      const a = rnd() * 6.283, sp = rr(0, 10) * s;
      p.add({ kind: K.SMOKE, x: e.x + Math.cos(a) * rr(0, 10) * s, y: e.y + rr(0, 12) * s, z: e.z + Math.sin(a) * rr(0, 10) * s, vx: Math.cos(a) * sp, vy: rr(12, 40) * Math.sqrt(s), vz: Math.sin(a) * sp, s0: 16 * s, s1: rr(50, 90) * s, life: rr(14, 28), r: 0.07, g: 0.065, b: 0.06, a0: 0.85, a1: 0, drag: 0.25, wind: 1, grav: -0.15 });
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 6.283, sp = rr(15, 70);
      p.add({ kind: K.SMOKE, x: e.x, y: e.y + 6, z: e.z, vx: Math.cos(a) * sp, vy: rr(25, 95), vz: Math.sin(a) * sp, s0: 2.4, s1: 2.0, life: rr(3, 6), r: 0.1, g: 0.09, b: 0.08, a0: 1, a1: 1, grav: 14, drag: 0.05 });
    }
    this.addShake(1.0 * s, e.x, e.z);
    if (this.distToCam(e.x, e.z) < 1100) this.engine.foam.add(e.x, e.z, e.x, e.z, 90 * s, 0.9, 1, 1);
  }

  torpedoLaunch(e) {
    if (this.distToCam(e.x, e.z) > 6000) return;
    for (let i = 0; i < 6; i++) this.p.add({ kind: K.SPRAY, x: e.x, y: 0.5, z: e.z, vx: rr(-3, 3), vy: rr(4, 9), vz: rr(-3, 3), s0: 1.2, s1: 4, life: rr(0.8, 1.6), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
  }

  aaFire(e) {
    const s = e.ship, pl = e.plane;
    const d = this.distToCam(s.x, s.z);
    if (d > 7000) return;
    const w = s.toWorld(e.lx, e.ly, e.lz, this._v);
    const dx = pl.x - w[0], dy = pl.y - w[1], dz = pl.z - w[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    this.p.add({ kind: K.TRACER, x: w[0], y: w[1], z: w[2], vx: dx / L * 520, vy: dy / L * 520, vz: dz / L * 520, s0: 0.5, life: Math.min(L / 520, 1.2), r: 1, g: 0.8, b: 0.35, a0: 4, a1: 4, stretch: 22 });
    this.p.add({ kind: K.FLASH, x: w[0], y: w[1], z: w[2], s0: 2, s1: 4, life: 0.07, r: 1, g: 0.85, b: 0.5, a0: 4, a1: 0 });
    if (rnd() < 0.5) this.p.add({ kind: K.SMOKE, x: pl.x + rr(-25, 25), y: pl.y + rr(-15, 15), z: pl.z + rr(-25, 25), s0: 4, s1: 11, life: rr(2.5, 4), r: 0.08, g: 0.08, b: 0.08, a0: 0.85, a1: 0, wind: 1 });
  }

  planeDown(e) {
    const p = this.p;
    p.add({ kind: K.FLASH, x: e.x, y: e.y, z: e.z, s0: 12, s1: 26, life: 0.25, r: 1, g: 0.7, b: 0.3, a0: 8, a1: 0 });
    for (let i = 0; i < 4; i++) p.add({ kind: K.FIRE, x: e.x, y: e.y, z: e.z, vx: rr(-8, 8), vy: rr(-5, 5), vz: rr(-8, 8), s0: 5, s1: 12, life: rr(0.6, 1.2), r: 1, g: 0.6, b: 0.2, a0: 4, a1: 0 });
    for (let i = 0; i < 16; i++) {
      p.add({ kind: K.SMOKE, x: e.x, y: e.y, z: e.z, vx: rr(-6, 6) + e.plane.speed * Math.sin(e.plane.heading) * 0.5, vy: rr(-35, -8), vz: rr(-6, 6) - e.plane.speed * Math.cos(e.plane.heading) * 0.5, s0: 3, s1: rr(9, 15), life: rr(3, 7), r: 0.07, g: 0.07, b: 0.07, a0: 0.8, a1: 0, grav: 6, drag: 0.1 });
    }
    if (e.y < 600) this.splash({ x: e.x + e.plane.speed * 2, z: e.z, cal: 200 });
  }

  collision(e) {
    if (this.distToCam(e.x, e.z) > 4000) return;
    for (let i = 0; i < 10; i++) this.p.add({ kind: K.TRACER, x: e.x, y: 5, z: e.z, vx: rr(-30, 30), vy: rr(5, 35), vz: rr(-30, 30), s0: 0.3, life: rr(0.4, 0.9), r: 1, g: 0.7, b: 0.3, a0: 3, a1: 0, grav: 20, stretch: 3 });
    this.p.add({ kind: K.SMOKE, x: e.x, y: 6, z: e.z, vy: 4, s0: 6, s1: 28, life: 6, r: 0.3, g: 0.28, b: 0.26, a0: 0.6, a1: 0, wind: 1, drag: 0.4 });
    this.addShake(0.2, e.x, e.z);
  }

  mountKilled(e) {
    const s = e.ship, m = e.mount;
    const w = s.toWorld(m.rec.x, m.rec.y + 1.5, m.rec.z, this._v);
    this.impact({ kind: 'penetrate', x: w[0], y: w[1], z: w[2], cal: Math.max(m.rec.cal, 200) });
  }

  // ---- continuous ---------------------------------------------------------------------------------------
  update(dt, world) {
    const cam = this.engine.cam;
    const P = this.engine.P;
    const wa = P.windDir * D2R, ws = Math.min(8, P.windSpeed * 0.6);
    this.p.wind[0] = Math.cos(wa) * ws; this.p.wind[1] = Math.sin(wa) * ws;
    const foam = this.engine.foam;
    const t = world.time;

    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
      const speedF = Math.min(1, Math.abs(s.speed) / Math.max(1, s.stats.maxSpeed));
      const st = s.stats;
      const fxs = s._fx || (s._fx = { smoke: 0, fire: 0, steam: 0 });

      // ---- wakes (foam stamps) ----
      if (d < 1400) {
        const L = st.L, B = st.B;
        const sf = s.state === 'sinking' ? 0.5 : speedF;
        if (sf > 0.04 || s.state === 'sinking') {
          const bowX = s.x + fx * L * 0.46, bowZ = s.z + fz * L * 0.46;
          const sternX = s.x - fx * L * 0.46, sternZ = s.z - fz * L * 0.46;
          // bow wave
          foam.add(bowX, bowZ, bowX - fx * L * 0.14, bowZ - fz * L * 0.14, B * 0.62, 0.45 * sf, 0.95 * sf, 0.85 * sf);
          // hull sides
          const rx = -fz, rz = fx;
          for (const sg of [-1, 1]) {
            const o = sg * B * 0.5;
            foam.add(bowX - fx * L * 0.1 + rx * o, bowZ - fz * L * 0.1 + rz * o, sternX + rx * o, sternZ + rz * o, 2.4, 0.38 * sf, 0.35 * sf, 0.2 * sf);
          }
          // propeller wash
          foam.add(sternX, sternZ, sternX - fx * L * 0.3, sternZ - fz * L * 0.3, B * 0.5, 0.95 * sf, 0.8 * sf, 0.55 * sf);
          // diverging wake arms
          if (d < 700) for (let k = 1; k <= 4; k++) {
            const back = L * (0.5 + 0.8 * k), lat = back * 0.3;
            for (const sg of [-1, 1]) foam.add(s.x - fx * back + rx * lat * sg, s.z - fz * back + rz * lat * sg, s.x - fx * back + rx * lat * sg - fx * 6, s.z - fz * back + rz * lat * sg - fz * 6, 2.2 + k, 0.5 * sf / (0.6 + 0.4 * k), 0, 0);
          }
        }
      }

      // ---- funnel smoke ----
      if (d < 26000 && s.state === 'afloat' && s.model.smoke.length) {
        const rate = (1.2 + 5.5 * speedF) * (1 + (1 - s.hpFrac) * 0.8) * this.emitScale * (d > 8000 ? 0.7 : 1);
        fxs.smoke += rate * dt;
        const dark = 0.075 + 0.1 * (1 - speedF) + (s.engine < 0.6 ? 0 : 0.03);
        while (fxs.smoke >= 1) {
          fxs.smoke -= 1;
          const sp = s.model.smoke[Math.floor(rnd() * s.model.smoke.length)];
          const w = s.toWorld(sp[0], sp[1], sp[2], this._v);
          this.p.add({ kind: K.SMOKE, x: w[0] + rr(-0.5, 0.5), y: w[1], z: w[2] + rr(-0.5, 0.5), vx: s.vx * 0.6, vy: rr(2.5, 5), vz: s.vz * 0.6, s0: 2.4, s1: rr(26, 44), life: rr(8, 13), r: dark, g: dark * 0.98, b: dark * 0.96, a0: 0.5 + 0.2 * speedF, a1: 0, drag: 0.22, wind: 1, grav: -0.15 });
        }
      }

      // ---- fires ----
      if (s.fires.length && d < 22000) {
        for (const f of s.fires) {
          f.acc = (f.acc || 0) + dt * (7 + 6 * f.power) * this.emitScale;
          while (f.acc >= 1) {
            f.acc -= 1;
            const w = s.toWorld(f.x + rr(-1, 1), f.y + rr(0, 1), f.z + rr(-1, 1), this._v);
            if (rnd() < 0.5) this.p.add({ kind: K.FIRE, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5, vy: rr(3, 8), vz: s.vz * 0.5, s0: 2.2 + f.power, s1: 5 + 3 * f.power, life: rr(0.4, 0.9), r: 1, g: 0.62, b: 0.2, a0: 3, a1: 0, drag: 0.8 });
            this.p.add({ kind: K.SMOKE, x: w[0], y: w[1] + 2, z: w[2], vx: s.vx * 0.5, vy: rr(4, 9), vz: s.vz * 0.5, s0: 3.5, s1: rr(20, 34) * (0.7 + f.power * 0.4), life: rr(9, 16), r: 0.05, g: 0.048, b: 0.045, a0: 0.78, a1: 0, drag: 0.25, wind: 1, grav: -0.2 });
          }
        }
      }

      // ---- sinking: steam, bubbles, heavy smoke ----
      if (s.state === 'sinking' && d < 22000) {
        fxs.steam += dt * 16 * this.emitScale;
        while (fxs.steam >= 1) {
          fxs.steam -= 1;
          const lx = rr(-st.L * 0.4, st.L * 0.4), lz = rr(-st.B * 0.3, st.B * 0.3);
          const w = s.toWorld(lx, Math.max(2, s.model.hull.deckY(lx) - s.sinkDepth * 0.4), lz, this._v);
          this.p.add({ kind: K.SMOKE, x: w[0], y: w[1], z: w[2], vy: rr(4, 10), s0: 5, s1: rr(25, 45), life: rr(8, 15), r: 0.09, g: 0.09, b: 0.09, a0: 0.75, a1: 0, wind: 1, drag: 0.3 });
          if (rnd() < 0.4) this.p.add({ kind: K.SPRAY, x: w[0], y: 0.5, z: w[2], vx: rr(-3, 3), vy: rr(5, 15), vz: rr(-3, 3), s0: 2, s1: 6, life: rr(1, 2.2), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
        }
      }
    }

    // ---- torpedo tracks: a thin white wake ----
    for (const tp of world.torpedoes) {
      const d = Math.hypot(tp.x - cam.x, tp.z - cam.z);
      if (d < 1300) foam.add(tp.x, tp.z, tp.x - tp.vx * 0.12, tp.z - tp.vz * 0.12, 1.8, 0.75, 0.25, 0.1);
    }
  }
}
