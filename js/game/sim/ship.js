// A ship in the simulation: kinematics, wave response, damage state and weapon mounts.
// A ship never decides anything itself: it executes its `cmd` (ShipCommand), which is written by a
// controller (AI today, a human tomorrow — see controllers/).
import { clamp, wrapPi, approach, KN, D2R, sat } from '../math.js';
import { createModules, createCompartments, AA_HP, blast } from './modules.js';
import { planeTypeFor } from '../model/planes.js';

/**
 * ShipCommand: the only interface between a controller and a ship.
 * {
 *   throttle:        -0.33 .. 1      engine order (fraction of maximum speed)
 *   desiredHeading:  rad | null      autopilot target heading (0 = north = -Z, clockwise); null = use `rudder`
 *   rudder:          -1 .. 1         manual rudder (+1 = hard to starboard), used when desiredHeading is null
 *   main / sec:      { target: Ship|null, aim: {x, z} | null, fire: bool }
 *                    `target` = fire-control computer leads this ship; else `aim` = fixed ground point
 *   torpedo:         { target: Ship|null, fire: bool }
 *   air:             { launch: bool }
 * }
 */
export function makeCommand() {
  return {
    throttle: 0.5, desiredHeading: null, rudder: 0,
    main: { target: null, aim: null, fire: true },
    sec: { target: null, aim: null, fire: true },
    torpedo: { target: null, fire: false },
    air: { launch: false },
  };
}

let nextId = 1;

function spring(s, target, dt, omega, zeta) {
  const a = omega * omega * (target - s.x) - 2 * zeta * omega * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

export class Ship {
  constructor(world, spec, stats, model, team, x, z, heading, name) {
    this.id = nextId++;
    this.world = world;
    this.spec = spec; this.stats = stats; this.model = model;
    this.team = team;
    this.name = name;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0; this.yawRate = 0; this.rudder = 0;
    this.cmd = makeCommand();
    this.controller = null;

    this.state = 'afloat';          // afloat | sinking | sunk
    this.hp = stats.maxHp;
    this.fires = [];
    this.floodRate = 0;             // hp/s lost to flooding (sum of the compartment inflows)
    this.listSide = world.rng() < 0.5 ? -1 : 1;
    this.engine = 1;                // 0..1 temporary propulsion efficiency (shock, steam); repaired with time
    this.propulsion = 1;            // 0..1 from the surviving machinery, shafts and funnels
    this.thrustBias = 0;            // -1..1 asymmetric thrust (a shaft is out)
    this.rudderJam = 0; this.rudderDead = false;
    this.fcMult = 1;                // fire-control dispersion multiplier (directors / radar / bridge lost)
    this.commandLoss = false; this.deckWrecked = false;
    this.lastHitT = -999;
    this.sinkT = 0; this.sinkStyle = 'roll';
    this.exploded = false;
    this.split = null;              // broken in two: { cut, halves: [..] }

    // wave response (smoothed): heave, pitch, roll
    this.sh = { x: 0, v: 0 }; this.sp = { x: 0, v: 0 }; this.sr = { x: 0, v: 0 };
    this.heights = new Float32Array(model.floatPts.length);
    this.haveHeights = false;
    this.y = 0; this.pitch = 0; this.roll = 0;
    this.heel = 0; this.sinkDepth = 0; this.sinkRoll = 0; this.sinkPitch = 0; this.listCur = 0; this.fireLevel = 0;
    this.vx = 0; this.vz = 0;

    // statistics
    this.kills = 0; this.damageDealt = 0; this.shotsFired = 0; this.shotsHit = 0; this.torpHits = 0;
    this.planeKills = 0; this.lostPlanes = 0;
    this.lastAttacker = null;

    // mounts (runtime state of the model's mount records)
    this.mounts = model.mounts.map((rec, i) => {
      const gun = rec.group === 'main' ? stats.main : (stats.secs.find((g) => g.specIndex === rec.si) || stats.secs[0] || stats.main);
      const hp = stats.mountHp(rec.cal);
      return {
        rec, idx: i, group: rec.group, gun, n: rec.n,
        trainRel: 0, elev: 0, reload: world.rng.range(0, gun.reload * 0.6),
        hp, maxHp: hp, alive: true, jam: 0, noAmmo: false,
        recoil: 0, aimOk: false, target: null, flash: 0, airTarget: null,
        trunnion: null, mount: null,
      };
    });
    // light AA mounts
    this.aaMounts = model.aaMounts.map((rec, i) => {
      const hp = AA_HP[rec.variant] * (rec.n >= 3 ? 1.5 : 1);
      return { rec, idx: i, alive: true, hp, maxHp: hp, train: 0, elev: 0.3, recoil: 0, flash: 0, reload: world.rng.range(0, 1), target: null, retarget: world.rng.range(0, 0.6), burstLeft: 0 };
    });
    this.tubes = model.tubes.map((t) => ({ ...t, ready: 0, left: t.n }));
    this.torpReload = 0; this.torpLeft = stats.torpedo ? stats.torpedo.tubes : 0;
    // carrier air group
    this.air = stats.air ? { ready: stats.air.capacity, cooldown: world.rng.range(5, 25), wave: 0 } : null;
    this.parkType = this.air ? planeTypeFor(stats.nation, 'dive') : null;
    this.parked = 0;
    // fire control
    this.gunAcc = 2.2; this.accTarget = -1; this.accT = 0;
    this.aaKills = 0;

    // damage model
    this.modules = createModules(model, stats);
    this.partState = model.parts.map(() => 0);
    this.comps = createCompartments(stats);
    this.scars = [];
    this.mainAlive = this.mounts.filter((m) => m.group === 'main').length;
    this.updateParked();
  }

  get alive() { return this.state === 'afloat'; }
  get hpFrac() { return this.hp / this.stats.maxHp; }
  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return -Math.cos(this.heading); }

  /** local (x fwd, y up, z stbd) -> world, into out[0..2] */
  toWorld(lx, ly, lz, out) {
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    out[0] = this.x + lx * sh + lz * ch;
    out[1] = this.y + ly;
    out[2] = this.z - lx * ch + lz * sh;
    return out;
  }
  /** world point -> local ship coordinates */
  toLocal(wx, wy, wz, out) {
    const dx = wx - this.x, dz = wz - this.z;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    out[0] = dx * sh - dz * ch;
    out[1] = wy - this.y;
    out[2] = dx * ch + dz * sh;
    return out;
  }

  /** Feed wave heights sampled at model.floatPts (world positions come from floatPtWorld). */
  setWaterHeights(h) {
    for (let i = 0; i < this.heights.length; i++) this.heights[i] = h[i];
    this.haveHeights = true;
  }
  floatPtWorld(i, out) {
    const p = this.model.floatPts[i];
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    out[0] = this.x + p[0] * sh + p[1] * ch;
    out[1] = this.z - p[0] * ch + p[1] * sh;
    return out;
  }

  // ---- damage model helpers (called by modules.js / damage.js) --------------------------------------------------
  addFire(lx, ly, lz, power) {
    if (this.state === 'sunk') return;
    if (this.fires.length >= 8) { this.fires[0].t += 6; return; }
    this.fires.push({ x: lx, y: Math.max(ly, 1), z: lz, t: this.world.rng.range(22, 55) * (0.7 + 0.5 * power), power });
    this.world.events.push({ type: 'fireStart', ship: this, x: lx, y: ly, z: lz });
  }

  /** Water entering at local x (hp/s of flooding); the compartments nearby take it, with a bias to the damaged side. */
  flood(lx, lz, rate) {
    if (rate <= 0) return;
    const comps = this.comps;
    let wsum = 0;
    const w = comps.map((c) => { const d = Math.abs(c.xc - lx) / (this.stats.L / comps.length); const v = Math.exp(-d * d * 0.7); wsum += v; return v; });
    const side = lz >= 0 ? 1 : 0;
    comps.forEach((c, i) => {
      const share = rate * w[i] / wsum;
      c.inflow[side] += share * 0.8; c.inflow[1 - side] += share * 0.2;
    });
    this.listSide = lz >= 0 ? 1 : -1;
  }

  /** Recompute the speed factor from machinery, shafts and funnels. */
  updatePropulsion() {
    const engs = this.modules.filter((m) => m.kind === 'engine');
    let eng = 0;
    for (const m of engs) eng += m.state === 2 ? 0 : 0.25 + 0.75 * m.hp / m.maxHp;
    eng = engs.length ? eng / engs.length : 1;
    const shafts = this.modules.filter((m) => m.kind === 'shaft');
    let sp = 0, ss = 0, nP = 0, nS = 0;
    for (const m of shafts) {
      const a = m.state === 2 ? 0 : 1;
      if (m.side < 0) { sp += a; nP++; } else if (m.side > 0) { ss += a; nS++; }   // a centre shaft pushes straight ahead
    }
    const shaftShare = shafts.length ? shafts.filter((m) => m.state !== 2).length / shafts.length : 1;
    this.thrustBias = shafts.length ? ((nS ? ss / nS : 0) - (nP ? sp / nP : 0)) : 0;
    const funnels = this.modules.filter((m) => m.kind === 'funnel');
    const fd = funnels.length ? funnels.filter((m) => m.state === 2).length / funnels.length : 0;
    this.propulsion = clamp(eng * Math.max(0.12, shaftShare) * (1 - 0.3 * fd), 0, 1);
  }

  updateFireControl() {
    const dirs = this.modules.filter((m) => m.kind === 'director');
    const rad = this.modules.filter((m) => m.kind === 'radar');
    const dd = dirs.length ? dirs.filter((m) => m.state === 2).length / dirs.length : 0;
    const rd = rad.length ? rad.filter((m) => m.state === 2).length / rad.length : 0;
    this.fcMult = 1 + dd * 0.85 + rd * 0.22 + (this.commandLoss ? 0.25 : 0);
  }

  refreshArmament() { this.mainAlive = this.mounts.filter((m) => m.group === 'main' && m.alive).length; }

  /** Flash fire from a turret that has just been wrecked by a penetrating hit, travelling down the ammunition trunk. */
  turretFlash(mount, world, owner) {
    const mag = this.modules.find((m) => m.kind === 'magazine' && m.mount === mount.idx) || this.modules.find((m) => m.kind === 'magazine' && Math.abs(m.x - mount.rec.x) < 6);
    if (!mag || mag.flooded || mag.state === 2) return;
    const p = { DD: 0.35, CL: 0.2, CA: 0.15, BB: 0.07, CV: 0.1 }[this.stats.type];
    if (world.rng() < p) { this.explosionSource = 'flash'; this.world.magazineExplosion(this, owner, this.toWorld(mag.x, mag.y, mag.z, [0, 0, 0]), mag); }
  }

  /** A magazine was wrecked by a burst nearby. */
  magazineLost(m, world, owner, cause) {
    if (m.flooded) return;
    // a magazine wrecked from below (torpedo, near miss) is flooded far more often than it explodes
    const p = { DD: 0.4, CL: 0.25, CA: 0.2, BB: 0.12, CV: 0.08 }[this.stats.type] * (cause === 'torpedo' || cause === 'blast' ? 0.2 : 1);
    if (world.rng() < p) { this.explosionSource = 'blast'; world.magazineExplosion(this, owner, this.toWorld(m.x, m.y, m.z, [0, 0, 0]), m); return; }
    // the ammunition of that turret is lost; the rest burns out
    if (m.mount != null && this.mounts[m.mount]) { this.mounts[m.mount].noAmmo = true; }
    this.addFire(m.x, 1.5, m.z, 1.0);
  }

  /** The torpedo tubes were destroyed: warheads may go up. */
  tubesLost(m, world, owner) {
    const tp = this.stats.torpedo;
    if (!tp || this.torpLeft <= 0) return;
    const nTubes = Math.max(1, this.model.tubes.length);
    if (world.rng() < 0.45) {
      blast(world, this, m.x, m.y, m.z, tp.warhead * (this.torpLeft / tp.tubes) * 0.9, 'outside', owner, 'torpedo');
      world.events.push({ type: 'explosion', x: this.toWorld(m.x, m.y, m.z, [0, 0, 0])[0], y: this.y + m.y, z: this.toWorld(m.x, m.y, m.z, [0, 0, 0])[2], size: Math.min(1.5, tp.warhead / 250), ship: this, stage: 'secondary' });
      this.applyDamage(this.stats.maxHp * 0.03, owner, 'torpedo');
    }
    this.torpLeft = Math.floor(this.torpLeft * (1 - 1 / nTubes));
  }

  /** Hangar or aviation-fuel store destroyed: the aircraft below burn, fuel fires. */
  hangarLost(m, world, owner) {
    if (this.air) this.air.ready = Math.floor(this.air.ready * 0.4);
    this.addFire(m.x, this.model.fdY ? this.model.fdY - 1 : 3, m.z, 1.2);
    this.addFire(m.x + 12, this.model.fdY ? this.model.fdY - 1 : 3, m.z + 3, 1.2);
    if (world.rng() < (m.kind === 'avgas' ? 0.45 : 0.25)) {
      const w = this.toWorld(m.x, m.y, m.z, [0, 0, 0]);
      world.events.push({ type: 'explosion', x: w[0], y: w[1], z: w[2], size: 1.2, ship: this, stage: 'secondary' });
      this.applyDamage(this.stats.maxHp * 0.1, owner, 'bomb');
    }
  }

  /** Visible part destroyed: it breaks away. */
  onPartDestroyed(m, world) {
    const p = this.model.parts[m.part];
    world.spawnPartDebris(this, p, m.part);
  }

  addScar(lx, ly, lz, nx, ny, nz, r, k) {
    const l = Math.hypot(nx, ny, nz) || 1;
    const sc = { x: lx, y: ly, z: lz, nx: nx / l, ny: ny / l, nz: nz / l, r, k, spin: this.world.rng() * 6.28 };
    if (this.scars.length >= 54) this.scars.shift();
    this.scars.push(sc);
  }

  updateParked() {
    const slots = this.model.deckSlots.length;
    if (!slots || !this.air) { this.parked = 0; return; }
    this.parked = this.deckWrecked ? 0 : Math.round(slots * this.air.ready / Math.max(1, this.stats.air.capacity));
  }

  // ---- per tick ---------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.state === 'sunk') return;
    const st = this.stats;
    const afloat = this.state === 'afloat';

    // ---- motion -------------------------------------------------------------------------------
    if (afloat) {
      const c = this.cmd;
      // autopilot
      let rudderCmd = c.rudder;
      if (c.desiredHeading != null) {
        const err = wrapPi(c.desiredHeading - this.heading);
        // proportional + yaw-rate damping, saturating
        rudderCmd = clamp(err * 2.2 - this.yawRate * st.turnRadius / Math.max(this.speed, 3) * 2.0, -1, 1);
      }
      if (this.rudderJam !== 0) rudderCmd = this.rudderJam;
      const rr = st.rudderRate * 2 * dt * 2.5 * (this.commandLoss ? 0.6 : 1);
      this.rudder = approach(this.rudder, clamp(rudderCmd, -1, 1), rr);
      const turnLoss = 1 - 0.28 * Math.abs(this.rudder);
      const eff = clamp(this.engine * this.propulsion, 0, 1);
      const target = clamp(c.throttle, -0.33, 1) * st.maxSpeed * (0.16 + 0.84 * eff) * turnLoss;
      const a = target > this.speed ? st.accel * (0.35 + 0.65 * eff) : st.decel;
      this.speed = approach(this.speed, target, a * dt);
      const omegaTarget = this.speed / st.turnRadius * this.rudder + this.thrustBias * 0.012 * (this.speed / Math.max(1, st.maxSpeed)) * 8;
      this.yawRate += (omegaTarget - this.yawRate) * Math.min(1, dt * 1.6);
      this.heading += this.yawRate * dt;
    } else {
      this.speed = approach(this.speed, 0, st.decel * 0.35 * dt);
      this.yawRate *= Math.max(0, 1 - dt * 0.4);
      this.heading += this.yawRate * dt;
    }
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.vx = fx * this.speed; this.vz = fz * this.speed;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // ---- wave response -----------------------------------------------------------------------------------
    const pts = this.model.floatPts;
    let h0 = 0, sx = 0, sz = 0, sxx = 0, szz = 0;
    if (this.haveHeights) {
      for (let i = 0; i < pts.length; i++) {
        const hh = this.heights[i];
        h0 += hh; sx += hh * pts[i][0]; sz += hh * pts[i][1];
        sxx += pts[i][0] * pts[i][0]; szz += pts[i][1] * pts[i][1];
      }
      h0 /= pts.length;
      sx = sxx > 0 ? sx / sxx : 0; sz = szz > 0 ? sz / szz : 0;
    }
    const big = clamp(st.L / 250, 0.4, 1.2);
    const resp = 1.0 - 0.45 * clamp((st.L - 110) / 160, 0, 1);       // big ships follow the swell less
    const heaveT = h0 * (0.85 - 0.15 * big);
    const pitchT = Math.atan(sx) * resp;
    const rollT = -Math.atan(sz) * resp * 1.1;
    spring(this.sh, heaveT, dt, 2 * Math.PI / (5.5 + 3 * big), 0.8);
    spring(this.sp, pitchT, dt, 2 * Math.PI / (6 + 3.5 * big), 0.65);
    spring(this.sr, rollT, dt, 2 * Math.PI / (9 + 8 * big), 0.45);

    // ---- flooding compartments: water, list and trim -----------------------------------------------------
    let inflow = 0, wP = 0, wS = 0, moment = 0, filled = 0;
    const nC = this.comps.length;
    const cap = st.maxHp * 0.22 / nC;
    const pump = st.maxHp * 0.00012 * dt;
    let active = 0;
    for (const c of this.comps) if (c.inflow[0] > 0 || c.inflow[1] > 0) active++;
    for (const c of this.comps) {
      for (let s = 0; s < 2; s++) {
        if (c.inflow[s] > 0) {
          if (afloat) c.water[s] = Math.min(1, c.water[s] + c.inflow[s] * dt / cap);
          inflow += c.inflow[s];
          // pumps and damage-control parties patch the breaches over time
          if (afloat) c.inflow[s] = Math.max(0, c.inflow[s] - pump / Math.max(1, active) * 1.5);
        }
      }
      const f = (c.water[0] + c.water[1]) / 2;
      wP += c.water[0]; wS += c.water[1];
      moment += f * (c.xc / (st.L / 2));
      filled += f;
    }
    this.floodRate = inflow;
    this.floodTrim = moment / nC;                       // >0 = down by the bow
    this.floodList = (wS - wP) / nC;                    // >0 = to starboard
    this.waterFill = filled / nC;

    // heel in turns (outward), damage list, flooding trim
    const heelT = clamp(-this.yawRate * this.speed * (st.type === 'DD' ? 5.5 : st.type === 'BB' ? 2.2 : 3.2), -12, 12) * D2R;
    this.heel += (heelT - this.heel) * Math.min(1, dt * 0.9);
    const dmgF = 1 - this.hpFrac;
    const listT = (afloat ? 1 : 0) * clamp(this.listSide * dmgF * 0.05 + this.floodList * 0.9, -0.38, 0.38);
    this.listCur += (listT - this.listCur) * Math.min(1, dt * 0.3);
    const trimT = (afloat ? -dmgF * 0.015 - clamp(this.floodTrim * 0.9, -0.3, 0.3) : 0);

    // ---- sinking ------------------------------------------------------------------------------
    let sinkRollT = 0, sinkPitchT = 0;
    if (!afloat) {
      this.sinkT += dt;
      const T = st.sinkTime * (this.exploded ? 0.45 : 1);
      const k = this.sinkT / T;
      const full = st.D * 1.2 + (this.model.topY * 0.9);
      if (this.split) {
        this.updateSplit(dt, full);
        this.sinkDepth = 0;
      } else {
        this.sinkDepth = full * Math.pow(Math.min(k, 1.4), 1.7);
        if (this.sinkStyle === 'roll') { sinkRollT = this.listSide * Math.min(1.9, k * 2.1); sinkPitchT = 0.08 * k; }
        else if (this.sinkStyle === 'stern') { sinkPitchT = Math.min(0.5, k * 0.65); sinkRollT = this.listSide * 0.15 * k; }
        else { sinkPitchT = -Math.min(0.4, k * 0.5); sinkRollT = this.listSide * 0.2 * k; }
        if (this.sinkDepth > full) { this.state = 'sunk'; this.world.shipGone(this); }
      }
    }
    this.sinkRoll += (sinkRollT - this.sinkRoll) * Math.min(1, dt * 0.7);
    this.sinkPitch += (sinkPitchT - this.sinkPitch) * Math.min(1, dt * 0.6);

    this.roll = this.sr.x + this.heel + this.listCur + this.sinkRoll;
    this.pitch = this.sp.x + trimT + this.sinkPitch;
    // settle lower in the water with damage / flooding
    const settle = afloat ? Math.min(st.D * 0.4, dmgF * st.D * 0.25 + this.waterFill * st.D * 0.5) : 0;
    this.y = this.sh.x - settle - this.sinkDepth;

    // ---- fires, magazine heating -------------------------------------------------------------------------
    if (afloat) {
      let burn = 0;
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        f.t -= dt;
        burn += f.power;
        if (f.t <= 0) { this.fires.splice(i, 1); continue; }
        // a fire near ammunition heats the magazine; damage control may flood it in time
        for (const m of this.modules) {
          if (m.kind !== 'magazine' || m.state === 2 || m.flooded) continue;
          if (Math.abs(f.x - m.x) > m.hx + 3 || Math.abs(f.z - m.z) > m.hz + 3) continue;
          m.heat = (m.heat || 0) + f.power * dt;
          if (m.heat > 14 && !m.checked) {
            m.checked = true;
            if (this.world.rng() < 0.7) { m.flooded = true; this.world.events.push({ type: 'magazineFlooded', ship: this, x: m.x, y: m.y, z: m.z }); }
          }
          if (m.heat > 14 && !m.flooded && this.world.rng() < dt * 0.05 * (this.stats.type === 'DD' ? 2.5 : 1)) {
            this.explosionSource = 'fire';
            this.world.magazineExplosion(this, this.lastAttacker, this.toWorld(m.x, m.y, m.z, [0, 0, 0]), m);
            return;
          }
        }
      }
      this.fireLevel = sat(burn * 0.35);
      if (burn > 0) this.applyDamage(Math.min(burn, 3.5) * 0.00036 * st.maxHp * dt, null, 'fire');
      if (this.floodRate > 0) this.applyDamage(this.floodRate * dt, null, 'flood');
      // temporary engine disruption and rudder repairs; destroyed modules are gone for good
      if (this.engine < 1) this.engine = Math.min(1, this.engine + dt * 0.002);
      if (this.rudderJam !== 0 && !this.rudderDead && this.world.time - this.lastHitT > 25) this.rudderJam = 0;
      // damage-control crews slowly restore damaged (not destroyed) modules
      this._repairT = (this._repairT || 0) + dt;
      if (this._repairT > 6) {
        this._repairT = 0;
        let changed = false;
        for (const m of this.modules) {
          if (m.state === 1 && m.hp < m.maxHp * 0.85 && (m.kind === 'engine' || m.kind === 'shaft' || m.kind === 'steering' || m.kind === 'director' || m.kind === 'radar')) { m.hp = Math.min(m.maxHp * 0.85, m.hp + m.maxHp * 0.03); changed = true; }
        }
        if (changed) { this.updatePropulsion(); this.updateFireControl(); }
        this.updateParked();
      }
    } else {
      this.fireLevel = Math.max(0, (this.fireLevel || 0) - dt * 0.05);
    }
  }

  /** Sections of a ship broken in two: each one sinks on its own, tilting about the break. */
  updateSplit(dt, full) {
    const sp = this.split;
    sp.t += dt;
    let deep = 0;
    for (const h of sp.halves) {
      // the section is thrown apart by the blast, then drifts and sinks at its own pace
      h.vy += (h.buoy * 4.5 - 9.81 * (1 - h.buoy) * 0.6 * Math.min(1, sp.t / 2.5)) * dt;
      h.vy *= Math.exp(-dt * 0.6);
      h.dy += h.vy * dt;
      h.dx += h.vx * dt; h.vx *= Math.exp(-dt * 0.5);
      h.buoy = Math.max(0, h.buoy - dt * h.leak);
      if (h.dy < -full) h.dy = -full;
      // attitude: springs towards the section's resting pose
      const k = 2.2, c = 1.6;
      h.wp += (k * (h.pitchT - h.pitch) - c * h.wp) * dt; h.pitch += h.wp * dt;
      h.wr += (k * (h.rollT - h.roll) - c * h.wr) * dt; h.roll += h.wr * dt;
      h.yaw += h.wy * dt; h.wy *= Math.exp(-dt * 0.5);
      if (h.dy <= -full + 0.01) deep++;
    }
    if (deep === sp.halves.length) { this.state = 'sunk'; this.world.shipGone(this); }
  }

  /** Apply structural damage. Returns true if the ship was destroyed by it. */
  applyDamage(amount, attacker, cause) {
    if (this.state !== 'afloat' || amount <= 0) return false;
    this.hp -= amount;
    if (attacker) { this.lastAttacker = attacker; this.lastHitT = this.world.time; this.world.lastCombatT = this.world.time; }
    if (this.hp <= 0) { this.hp = 0; this.destroy(attacker, cause); return true; }
    return false;
  }

  destroy(attacker, cause) {
    if (this.state !== 'afloat') return;
    this.state = 'sinking';
    this.hp = 0;
    this.sinkT = 0;
    const killer = attacker || this.lastAttacker;
    if (killer && killer !== this) killer.kills++;
    this.killedBy = killer || null;
    this.cause = cause;
    const t = this.stats.type;
    const r = this.world.rng();
    // how it goes down follows the flooding: by the bow, by the stern, or capsizing
    this.sinkStyle = t === 'DD' ? (r < 0.6 ? 'roll' : 'stern') : t === 'BB' ? (r < 0.5 ? 'roll' : r < 0.8 ? 'stern' : 'bow') : (r < 0.5 ? 'roll' : r < 0.75 ? 'stern' : 'bow');
    if (this.floodTrim > 0.1) this.sinkStyle = 'bow';
    else if (this.floodTrim < -0.1) this.sinkStyle = 'stern';
    if (cause === 'magazine') { this.exploded = true; this.sinkStyle = r < 0.5 ? 'stern' : 'bow'; }
    for (const m of this.mounts) { m.alive = false; }
    this.cmd.throttle = 0; this.cmd.desiredHeading = null;
    this.world.events.push({ type: 'sinking', ship: this, magazine: cause === 'magazine' });
    this.world.onShipSunk(this, killer, cause);
  }
}
