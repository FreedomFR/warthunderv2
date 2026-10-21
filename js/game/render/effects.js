// Visual effects driven by simulation events and ship state: muzzle flashes, shell splashes,
// impacts, fires, funnel smoke, sinking, anti-aircraft fire and wakes (foam stamps).
import { clamp, D2R } from '../math.js';
import { K } from './particles.js';
import { rnd, rr } from './fx/common.js';
import { addWakeStamps } from './fx/wake.js';
import { GunFx } from './fx/guns.js';
import { WaterFx } from './fx/water.js';
import { HitFx } from './fx/hits.js';
import { AirFx } from './fx/air.js';
import { FireFx } from './fx/fires.js';

export { addWakeStamps };

export class Effects {
  constructor(engine, particles, game) {
    this.engine = engine; this.p = particles; this.game = game;
    this.emitScale = 1;
    this.shake = 0;
    this._v = [0, 0, 0];
    this.rings = [];          // expanding shock waves on the water
    this.timers = [];         // delayed effects (the cap of a smoke column)
    this.flashes = [];        // the lights of the flashes of the moment (flashLight)
    this.acc = { planeSmoke: new Map() };
  }

  /**
   * The light of a flash (a salvo, an explosion) at (x, y, z): a fireball of radius r whose irradiance at r is `power` (the sun's units), rising in a hundredth of a
   * second and dying away over `life` seconds. The brightest of the moment, as seen from the camera, lights the scene (engine.setFlash).
   */
  flashLight(x, y, z, r, power, life, col = [1, 0.66, 0.36]) {
    this.flashes.push({ x, y, z, r, power, life, t: 0, col });
    if (this.flashes.length > 24) this.flashes.shift();
  }

  /** Run `fn` after `sec` simulated seconds (the cap of a smoke column, the second blast of an explosion). */
  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  distToCam(x, z) {
    const c = this.engine.cam;
    return Math.hypot(x - c.x, z - c.z);
  }

  addShake(amount, x, z) {
    const d = this.distToCam(x, z);
    this.shake = Math.min(1.6, this.shake + amount / (1 + d / 250));
  }

  /** The share of the usual number of particles that the effects emit: less and less as the pool fills (heavy fighting, many fires and splashes). */
  fillFactor() { const f = this.p.fill(); return clamp((0.9 - f) / 0.4, 0.12, 1); }

  process(events) {
    const base = this.emitScale;
    this.emitScale = base * this.fillFactor();
    try { this._process(events); } finally { this.emitScale = base; }
  }

  _process(events) {
    for (const e of events) {
      switch (e.type) {
        case 'muzzle': this.muzzle(e); break;
        case 'splash': this.splash(e); break;
        case 'landImpact': this.landImpact(e); break;
        case 'impact': this.impact(e); break;
        case 'explosion': this.explosion(e); break;
        case 'torpedoLaunch': this.torpedoLaunch(e); break;
        case 'aaFire': this.aaFire(e); break;
        case 'mgFire': this.mgFire(e); break;
        case 'flak': this.flak(e); break;
        case 'planeHit': this.planeHit(e); break;
        case 'planeDown': this.planeDown(e); break;
        case 'planeBreakup': this.planeBreakup(e); break;
        case 'planeCrash': this.planeCrash(e); break;
        case 'planeDitch': this.planeDitch(e); break;
        case 'planeTouchdown': this.touchdown(e); break;
        case 'wireCatch': this.wireCatch(e); break;
        case 'torpedoEntry': this.torpedoEntry(e); break;
        case 'wakeStamp': this.engine.foam.add(e.x, e.z, e.x - e.vx * 0.1, e.z - e.vz * 0.1, 5, 0.3, 0.8, 0.5); break;
        case 'collision': this.collision(e); break;
        case 'mountKilled': this.mountKilled(e); break;
        case 'moduleKilled': this.moduleKilled(e); break;
        case 'shipBreak': this.shipBreak(e); break;
        case 'debrisSplash': this.debrisSplash(e); break;
        default: break;
      }
    }
  }

  update(dt, world) {
    const base = this.emitScale;
    this.emitScale = base * this.fillFactor();
    try { this._update(dt, world); } finally { this.emitScale = base; }
  }

  _update(dt, world) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    const cam = this.engine.cam;
    // the flash that lights the scene: the one that looks brightest from the camera (its power, as it dies away, over its distance squared)
    let best = null, bs = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > f.life) { this.flashes.splice(i, 1); continue; }
      const k = Math.min(1, f.t / 0.012) * Math.exp(-3.2 * f.t / f.life), d2 = (f.x - cam.x) ** 2 + (f.y - cam.y) ** 2 + (f.z - cam.z) ** 2;
      const sc = f.power * k * f.r * f.r / Math.max(d2, f.r * f.r);
      if (sc > bs) { bs = sc; best = { f, k }; }
    }
    if (this.engine.setFlash) this.engine.setFlash(best ? { x: best.f.x, y: best.f.y, z: best.f.z, r: best.f.r, cr: best.f.power * best.k * best.f.col[0], cg: best.f.power * best.k * best.f.col[1], cb: best.f.power * best.k * best.f.col[2] } : null);
    const P = this.engine.P;
    const wa = P.windDir * D2R, ws = Math.min(8, P.windSpeed * 0.6);
    this.p.wind[0] = Math.cos(wa) * ws; this.p.wind[1] = Math.sin(wa) * ws;
    const foam = this.engine.foam;
    const t = world.time;

    if (world.terrain) this.updateShores(world.terrain, cam, foam);

    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
      const speedF = Math.min(1, Math.abs(s.speed) / Math.max(1, s.stats.maxSpeed));
      const st = s.stats;
      const fxs = s._fx || (s._fx = { smoke: 0, fire: 0, steam: 0 });

      // ---- wakes (foam stamps) ----
      if (d < 1400) addWakeStamps(foam, s, d);

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
      // Layers, after the way sooty oil fires look: tongues of flame that narrow to a flickering tip (they puff at a rate that falls with the size of the fire), a hotter core,
      // a glow at the foot, embers carried off by the wind, and a column of black smoke (a dense core inside a paler veil) lit orange from below at its base.
      if (s.fires.length && d < 22000) {
        const lod = d > 12000 ? 0.45 : d > 5000 ? 0.7 : 1;
        for (const f of s.fires) {
          if (f.ph === undefined) { f.ph = rnd() * 6.283; f.ph2 = rnd() * 6.283; f.ph3 = rnd() * 6.283; }
          const fq = 1.5 / Math.sqrt(2 + 4 * f.power);
          const flick = clamp(1 + 0.25 * Math.sin(6.283 * fq * t + f.ph) + 0.15 * Math.sin(6.283 * 3.7 * t + f.ph2) + 0.1 * Math.sin(6.283 * 9 * t + f.ph3), 0.45, 1.6);
          f.acc = (f.acc || 0) + dt * (7 + 6 * f.power) * this.emitScale * lod;
          f.accT = (f.accT || 0) + dt * (5 + 7 * f.power) * flick * this.emitScale * lod;
          f.accE = (f.accE || 0) + dt * 1.8 * f.power * this.emitScale * (d < 2500 ? 1 : 0);
          // the tongues
          while (f.accT >= 1) {
            f.accT -= 1;
            const w = s.toWorld(f.x + rr(-1.4, 1.4), f.y + rr(0, 0.6), f.z + rr(-1.4, 1.4), this._v);
            const sz = (1.4 + 1.7 * f.power) * rr(0.8, 1.3) * (0.8 + 0.4 * flick);
            this.p.add({ kind: K.FLAME, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5 + rr(-0.6, 0.6), vy: rr(3, 6) + 2 * f.power, vz: s.vz * 0.5 + rr(-0.6, 0.6), s0: sz, s1: sz * 0.5, life: rr(0.45, 0.95), rot: 0, rotV: 0, r: 1, g: 0.5, b: 0.12, a0: 15, a1: 0, drag: 0.8 });
            if (rnd() < 0.4) this.p.add({ kind: K.FLAME, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5, vy: rr(2, 4), vz: s.vz * 0.5, s0: sz * 0.5, s1: sz * 0.28, life: rr(0.25, 0.45), rot: 0, rotV: 0, r: 1, g: 0.8, b: 0.45, a0: 18, a1: 0, drag: 0.9 });
            if (rnd() < 0.3) this.p.add({ kind: K.FLASH, x: w[0], y: w[1] + 0.8, z: w[2], s0: 2.5 + 3 * f.power, s1: 4 + 5 * f.power, life: 0.22, r: 1, g: 0.5, b: 0.15, a0: 3.2 * flick, a1: 0 });
          }
          // embers rising and drifting off with the wind
          while (f.accE >= 1) {
            f.accE -= 1;
            const w = s.toWorld(f.x + rr(-1, 1), f.y + 1, f.z + rr(-1, 1), this._v);
            this.p.add({ kind: K.FLASH, x: w[0], y: w[1], z: w[2], vx: s.vx * 0.5 + rr(-1.5, 1.5), vy: rr(3, 8), vz: s.vz * 0.5 + rr(-1.5, 1.5), s0: rr(0.07, 0.16), s1: 0.05, life: rr(1.5, 3.5), r: 1, g: rr(0.45, 0.7), b: 0.15, a0: rr(6, 14), a1: 0, drag: 0.3, wind: 0.7, grav: -0.5 });
          }
          // the smoke is hot: it rises in a column (low drag, buoyancy) and leans with the wind, instead of piling up on the ship
          let smokeN = 0;
          while (f.acc >= 1) {
            f.acc -= 1;
            const w = s.toWorld(f.x + rr(-1, 1), f.y + rr(0, 1), f.z + rr(-1, 1), this._v);
            if ((smokeN++ & 1) === 0) {
              this.p.add({ kind: K.SMOKE, x: w[0], y: w[1] + 4, z: w[2], vx: s.vx * 0.5, vy: rr(7, 14), vz: s.vz * 0.5, s0: 3.2, s1: rr(34, 58) * (0.7 + f.power * 0.4), life: rr(14, 24), r: 0.05, g: 0.048, b: 0.045, a0: 0.6, a1: 0, drag: 0.07, wind: 1, grav: -0.9 });
              // a paler veil round it that gives the column a soft edge
              if (rnd() < 0.5) this.p.add({ kind: K.SMOKE, x: w[0], y: w[1] + 3, z: w[2], vx: s.vx * 0.5, vy: rr(6, 11), vz: s.vz * 0.5, s0: 6, s1: rr(60, 96) * (0.7 + f.power * 0.4), life: rr(18, 30), r: 0.09, g: 0.088, b: 0.085, a0: 0.11, a1: 0, drag: 0.07, wind: 1, grav: -0.7 });
            }
          }
        }
      }

      // ---- sinking: steam, bubbles, heavy smoke ----
      if (s.state === 'sinking' && d < 22000) {
        fxs.steam += dt * ({ burn: 14, roll: 5, level: 6, bow: 8, stern: 8, blast: 7 }[s.sinkMode] ?? (s.exploded ? 7 : 12)) * this.emitScale;   // a capsized or settling ship smokes less than a burning one
        while (fxs.steam >= 1) {
          fxs.steam -= 1;
          const lx = rr(-st.L * 0.4, st.L * 0.4), lz = rr(-st.B * 0.3, st.B * 0.3);
          const w = s.toWorld(lx, Math.max(2, s.model.hull.deckY(lx) - s.sinkDepth * 0.4), lz, this._v);
          this.p.add({ kind: K.SMOKE, x: w[0], y: w[1], z: w[2], vy: rr(6, 12), s0: 5, s1: rr(30, 52), life: rr(11, 19), r: 0.09, g: 0.09, b: 0.09, a0: 0.62, a1: 0, wind: 1, drag: 0.1, grav: -0.6 });
          if (rnd() < 0.4) this.p.add({ kind: K.SPRAY, x: w[0], y: 0.5, z: w[2], vx: rr(-3, 3), vy: rr(5, 15), vz: rr(-3, 3), s0: 2, s1: 6, life: rr(1, 2.2), r: 0.95, g: 0.97, b: 1, a0: 0.8, a1: 0, grav: 12 });
        }
      }
    }

    // ---- torpedo tracks: a thin white wake ----
    for (const tp of world.torpedoes) {
      if (tp.air && tp.h > 0) continue;
      const d = Math.hypot(tp.x - cam.x, tp.z - cam.z);
      if (d < 1300) foam.add(tp.x, tp.z, tp.x - tp.vx * 0.12, tp.z - tp.vz * 0.12, 1.8, 0.75, 0.25, 0.1);
    }

    this.updatePlanes(dt, world, cam);
    this.updateDebris(dt, world, cam);
    this.updateSeaFires(dt, world, cam);
    this.updateBaseFires(dt, world, cam);
    this.updateRings(dt, world, cam);
    this.updateWrecks(dt, world, cam);
  }
}

// the effects of each domain live in fx/: their methods are part of Effects
for (const C of [GunFx, WaterFx, HitFx, AirFx, FireFx]) {
  for (const k of Object.getOwnPropertyNames(C.prototype)) if (k !== 'constructor') Object.defineProperty(Effects.prototype, k, Object.getOwnPropertyDescriptor(C.prototype, k));
}
