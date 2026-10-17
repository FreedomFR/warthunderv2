// A ship in the simulation: kinematics, wave response, damage state and weapon mounts.
// A ship never decides anything itself: it executes its `cmd` (ShipCommand), which is written by a
// controller (AI today, a human tomorrow — see controllers/).
import { clamp, wrapPi, approach, KN, D2R, sat } from '../math.js';

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
    this.floodRate = 0;             // hp/s lost to flooding
    this.listSide = world.rng() < 0.5 ? -1 : 1;
    this.engine = 1;                // 0..1 propulsion efficiency
    this.rudderJam = 0;
    this.lastHitT = -999;
    this.sinkT = 0; this.sinkStyle = 'roll';
    this.exploded = false;

    // wave response (smoothed): heave, pitch, roll
    this.sh = { x: 0, v: 0 }; this.sp = { x: 0, v: 0 }; this.sr = { x: 0, v: 0 };
    this.heights = new Float32Array(model.floatPts.length);
    this.haveHeights = false;
    this.y = 0; this.pitch = 0; this.roll = 0;
    this.heel = 0; this.sinkDepth = 0; this.sinkRoll = 0; this.sinkPitch = 0; this.listCur = 0; this.fireLevel = 0;
    this.vx = 0; this.vz = 0;

    // statistics
    this.kills = 0; this.damageDealt = 0; this.shotsFired = 0; this.shotsHit = 0; this.torpHits = 0;
    this.lastAttacker = null;

    // mounts (runtime state of the model's mount records)
    this.mounts = model.mounts.map((rec, i) => {
      const gun = rec.group === 'main' ? stats.main : (stats.secs.find((g) => g.specIndex === rec.si) || stats.secs[0] || stats.main);
      return {
        rec, idx: i, group: rec.group, gun, n: rec.n,
        trainRel: 0, elev: 0, reload: world.rng.range(0, gun.reload * 0.6),
        hp: stats.mountHp(rec.cal), alive: true,
        recoil: 0, aimOk: false, target: null, flash: 0,
        trunnion: null, mount: null,
      };
    });
    this.tubes = model.tubes.map((t) => ({ ...t, ready: 0, left: t.n }));
    this.torpReload = 0; this.torpLeft = stats.torpedo ? stats.torpedo.tubes : 0;
    // carrier air group
    this.air = stats.air ? { ready: stats.air.capacity, cooldown: world.rng.range(5, 25), wave: 0 } : null;
    // fire control
    this.gunAcc = 2.2; this.accTarget = -1; this.accT = 0;
    this.aaKills = 0;
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
      this.rudder = approach(this.rudder, clamp(rudderCmd, -1, 1), st.rudderRate * 2 * dt * 2.5);
      const turnLoss = 1 - 0.28 * Math.abs(this.rudder);
      const target = clamp(c.throttle, -0.33, 1) * st.maxSpeed * (0.25 + 0.75 * this.engine) * turnLoss;
      const a = target > this.speed ? st.accel * (0.4 + 0.6 * this.engine) : st.decel;
      this.speed = approach(this.speed, target, a * dt);
      const omegaTarget = this.speed / st.turnRadius * this.rudder;
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

    // heel in turns (outward), damage list, flooding trim
    const heelT = clamp(-this.yawRate * this.speed * (st.type === 'DD' ? 5.5 : st.type === 'BB' ? 2.2 : 3.2), -12, 12) * D2R;
    this.heel += (heelT - this.heel) * Math.min(1, dt * 0.9);
    const dmgF = 1 - this.hpFrac;
    const listT = this.listSide * (dmgF * 0.06 + Math.min(0.3, this.floodRate / st.maxHp * 14)) * (afloat ? 1 : 0);
    this.listCur += (listT - this.listCur) * Math.min(1, dt * 0.3);
    const trimT = (afloat ? -dmgF * 0.015 : 0);

    // ---- sinking ------------------------------------------------------------------------------------
    let sinkRollT = 0, sinkPitchT = 0;
    if (!afloat) {
      this.sinkT += dt;
      const T = st.sinkTime * (this.exploded ? 0.45 : 1);
      const k = this.sinkT / T;
      this.sinkDepth = (st.D * 1.2 + (this.model.topY * 0.9)) * Math.pow(Math.min(k, 1.4), 1.7);
      if (this.sinkStyle === 'roll') { sinkRollT = this.listSide * Math.min(1.9, k * 2.1); sinkPitchT = 0.08 * k; }
      else if (this.sinkStyle === 'stern') { sinkPitchT = Math.min(0.5, k * 0.65); sinkRollT = this.listSide * 0.15 * k; }
      else { sinkPitchT = -Math.min(0.4, k * 0.5); sinkRollT = this.listSide * 0.2 * k; }
      if (this.sinkDepth > st.D * 1.2 + this.model.topY * 0.9) this.state = 'sunk';
    }
    this.sinkRoll += (sinkRollT - this.sinkRoll) * Math.min(1, dt * 0.7);
    this.sinkPitch += (sinkPitchT - this.sinkPitch) * Math.min(1, dt * 0.6);

    this.roll = this.sr.x + this.heel + this.listCur + this.sinkRoll;
    this.pitch = this.sp.x + trimT + this.sinkPitch;
    // settle lower in the water with damage / flooding
    const settle = afloat ? Math.min(st.D * 0.35, dmgF * st.D * 0.3 + this.floodRate / st.maxHp * 30) : 0;
    this.y = this.sh.x - settle - this.sinkDepth;

    // ---- fires & flooding -----------------------------------------------------------------------------
    if (afloat) {
      let burn = 0;
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        f.t -= dt;
        // damage control: bigger ships have more crew; fire spreads a little
        burn += f.power;
        if (f.t <= 0) this.fires.splice(i, 1);
      }
      this.fireLevel = sat(burn * 0.35);
      if (burn > 0) this.applyDamage(Math.min(burn, 3.5) * 0.00036 * st.maxHp * dt, null, "fire");
      if (this.floodRate > 0) {
        this.applyDamage(this.floodRate * dt, null, 'flood');
        this.floodRate = Math.max(0, this.floodRate - st.maxHp * 0.00012 * dt);    // pumps and counter-flooding
      }
      // engine and rudder repairs
      if (this.engine < 1) this.engine = Math.min(1, this.engine + dt * 0.002);
      if (this.rudderJam !== 0 && this.world.time - this.lastHitT > 25) this.rudderJam = 0;
    } else {
      this.fireLevel = Math.max(0, (this.fireLevel || 0) - dt * 0.05);
    }
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
    this.sinkT = 0;
    const killer = attacker || this.lastAttacker;
    if (killer && killer !== this) killer.kills++;
    this.killedBy = killer || null;
    this.cause = cause;
    const t = this.stats.type;
    const r = this.world.rng();
    this.sinkStyle = t === 'DD' ? (r < 0.6 ? 'roll' : 'stern') : t === 'BB' ? (r < 0.5 ? 'roll' : r < 0.8 ? 'stern' : 'bow') : (r < 0.5 ? 'roll' : r < 0.75 ? 'stern' : 'bow');
    if (cause === 'magazine') { this.exploded = true; this.sinkStyle = r < 0.5 ? 'stern' : 'bow'; }
    for (const m of this.mounts) { m.alive = false; }
    this.cmd.throttle = 0; this.cmd.desiredHeading = null;
    this.world.events.push({ type: 'sinking', ship: this, magazine: cause === 'magazine' });
    this.world.onShipSunk(this, killer, cause);
  }
}
