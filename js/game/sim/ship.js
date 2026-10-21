// A ship in the simulation: kinematics, wave response, damage state and weapon mounts.
// A ship never decides anything itself: it executes its `cmd` (ShipCommand), which is written by a
// controller (AI today, a human tomorrow — see controllers/).
import { clamp, wrapPi, approach, D2R, sat, smoothstep } from '../math.js';
import { createModules, createCompartments, AA_HP, AA_ROUNDS, blast } from './modules.js';
import { shipDmg } from '../data/balance.js';
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
    this.propAngle = 0;             // the screws, for the eye: turned by the speed (see render/shipVisual.js)
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
    this.sinkMode = null;           // how she goes down: roll (capsizes) | bow | stern | level (settles) | burn (burns out first) | blast (blown apart)
    this.burnT = 0;                 // seconds she burns before settling (mode burn)
    this._cookT = 0;
    this.exploded = false;
    this.split = null;              // broken in two: { cut, halves: [..] }

    // wave response (smoothed): heave, pitch, roll
    this.sh = { x: 0, v: 0 }; this.sp = { x: 0, v: 0 }; this.sr = { x: 0, v: 0 };
    this.heights = new Float32Array(model.floatPts.length);
    this.haveHeights = false;
    this.y = 0; this.pitch = 0; this.roll = 0;
    this.heel = 0; this.trimCur = 0; this.settleCur = 0; this.sinkDepth = 0; this.sinkRoll = 0; this.sinkPitch = 0; this.listCur = 0; this.fireLevel = 0;
    this.vx = 0; this.vz = 0;

    // statistics
    this.kills = 0; this.damageDealt = 0; this.shotsFired = 0; this.shotsHit = 0; this.torpHits = 0; this.torpFired = 0;
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
        ammo: { AP: Math.round(gun.rpg * rec.n * gun.apShare), HE: gun.rpg * rec.n - Math.round(gun.rpg * rec.n * gun.apShare) }, ammo0: gun.rpg * rec.n, loaded: null, alt: null, altT: 0,
        recoil: 0, aimOk: false, target: null, flash: 0, airTarget: null,
        trunnion: null, mount: null,
      };
    });
    // light AA mounts
    this.aaMounts = model.aaMounts.map((rec, i) => {
      const hp = AA_HP[rec.variant] * (rec.n >= 3 ? 1.5 : 1);
      const rounds = (AA_ROUNDS[rec.variant] || 1500) * rec.n;
      return { rec, idx: i, alive: true, hp, maxHp: hp, ammo: rounds, ammo0: rounds, train: 0, elev: 0.3, recoil: 0, flash: 0, reload: world.rng.range(0, 1), target: null, retarget: world.rng.range(0, 0.6), burstLeft: 0 };
    });
    this.tubes = model.tubes.map((t) => ({ ...t, ready: 0, left: t.n }));
    this.torpReload = 0; this.torpLeft = stats.torpedo ? stats.torpedo.tubes : 0;
    // carrier air group
    // the share of fighters in the air group (escort and patrol) depends on the navy (USN 1944: 36 of 91), the rest are bombers
    const nFight = stats.air ? Math.round(stats.air.capacity * ({ USA: 0.38, UK: 0.34, Germany: 0.4, Italy: 0.35 }[stats.nation] ?? 0.26)) : 0;
    this.air = stats.air ? { ready: stats.air.capacity - nFight, fReady: nFight, cooldown: world.rng.range(5, 25), capCooldown: 30, wave: 0, servicing: [] } : null;
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
  /** rounds left for the light AA: { left, frac } (all the mounts, the working ones or not) */
  aaAmmo() {
    let left = 0, all = 0;
    for (const a of this.aaMounts) { left += a.ammo; all += a.ammo0; }
    return { left, frac: all ? left / all : 0 };
  }
  /** shells left in the magazines of a battery ('main' | 'sec'): { AP, HE, frac } (frac of what the guns started with, working mounts only) */
  ammoLeft(group = 'main') {
    let AP = 0, HE = 0, all = 0;
    for (const m of this.mounts) {
      if (m.group !== group) continue;
      all += m.ammo0;
      if (m.noAmmo && m.ammo.AP + m.ammo.HE > 0 && !m.alive) continue;
      AP += m.ammo.AP; HE += m.ammo.HE;
    }
    return { AP, HE, frac: all ? (AP + HE) / all : 0 };
  }
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
  addFire(lx, ly, lz, power, inside = false) {
    if (this.state === 'sunk') return;
    if (this.fires.length >= 8) { this.fires[0].t += 6; return; }
    this.fires.push({ x: lx, y: Math.max(ly, 1), z: lz, t: this.world.rng.range(22, 55) * (0.7 + 0.5 * power), power, inside });
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
    if (this.state === 'afloat') this.listSide = lz >= 0 ? 1 : -1;        // (a ship going down keeps rolling the way she was rolling)
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

  /**
   * Chance that ammunition goes up when something sets it off, by class (the compact, lightly built hulls have their magazines closest to
   * the shell's path) and by navy: cordite in silk bags flashes far more readily than US single-base powder (a flash that lights one
   * unit of US powder lights 75 of cordite), German charges sat in brass cases, and the British anti-flash doors were often wedged open.
   */
  ammoRisk(base) { return base[this.stats.type] * this.stats.navy.flash; }

  /** Flash fire from a turret that has just been wrecked by a penetrating hit, travelling down the ammunition trunk. */
  turretFlash(mount, world, owner) {
    const mag = this.modules.find((m) => m.kind === 'magazine' && m.mount === mount.idx) || this.modules.find((m) => m.kind === 'magazine' && Math.abs(m.x - mount.rec.x) < 6);
    if (!mag || mag.flooded || mag.state === 2) return;
    // a turret that has fired off its ammunition has little to burn
    const stock = mount.ammo0 ? clamp((mount.ammo.AP + mount.ammo.HE) / mount.ammo0, 0.15, 1) : 1;
    const p = this.ammoRisk({ DD: 0.30, CL: 0.10, CA: 0.08, BB: 0.045, CV: 0.08 }) * (0.5 + 0.5 * stock);
    if (world.rng() < p) { this.explosionSource = 'flash'; this.world.magazineExplosion(this, owner, this.toWorld(mag.x, mag.y, mag.z, [0, 0, 0]), mag); }
  }

  /** A magazine was wrecked by a burst nearby. */
  magazineLost(m, world, owner, cause) {
    if (m.flooded) return;
    // a magazine wrecked from below (torpedo, near miss) is flooded far more often than it explodes
    const p = this.ammoRisk({ DD: 0.35, CL: 0.13, CA: 0.10, BB: 0.06, CV: 0.07 }) * (cause === 'torpedo' || cause === 'blast' ? 0.2 : 1);
    if (world.rng() < p) { this.explosionSource = 'blast'; world.magazineExplosion(this, owner, this.toWorld(m.x, m.y, m.z, [0, 0, 0]), m); return; }
    // the ammunition of that turret is lost; the rest burns out
    if (m.mount != null && this.mounts[m.mount]) { this.mounts[m.mount].noAmmo = true; }
    this.addFire(m.x, 1.5, m.z, 1.0, true);
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
    if (this.air) { this.air.ready = Math.floor(this.air.ready * 0.4); this.air.fReady = Math.floor(this.air.fReady * 0.4); }
    this.addFire(m.x, this.model.fdY ? this.model.fdY - 1 : 3, m.z, 1.2);
    this.addFire(m.x + 12, this.model.fdY ? this.model.fdY - 1 : 3, m.z + 3, 1.2);
    // fuelled and armed aircraft, fuel lines and bombs in the hangar: the American carriers kept their lines filled with inert gas and foamed the
    // hangars; at Midway the Japanese hangars were full of unstowed ordnance and three carriers were lost in minutes
    const hazard = (m.kind === 'avgas' ? 0.45 : 0.25) * (this.stats.avgas === 'closed' ? 0.65 : 1) * (1.35 - 0.45 * this.stats.navy.dc);
    if (world.rng() < hazard) {
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

  /** Aircraft drawn on the deck park: the full park to begin with, then whatever the deck crew have spotted (see sim/deck.js); never more than the air group allows. */
  updateParked() {
    const slots = this.model.deckSlots.length;
    if (!slots || !this.air) { this.parked = 0; return; }
    const cap = Math.round(slots * this.air.ready / Math.max(1, this.stats.air.capacity));
    this.parked = this.deckWrecked ? 0 : this._parkInit ? Math.min(this.parked, cap) : cap;
    this._parkInit = true;
  }

  /**
   * Fires inside the armoured citadel heat the magazines. The damage-control party floods a magazine that is heating up (it takes
   * 10-25 s and does not always succeed: the navies differed a lot), and one that is not flooded in time may cook off.
   * A flooded magazine saves the ship but the turret it fed is out of ammunition. Returns true when the ship blew up.
   */
  updateMagazines(dt) {
    const rng = this.world.rng, st = this.stats, dc = st.navy.dc;
    const cookRate = { DD: 0.03, CL: 0.008, CA: 0.006, BB: 0.005, CV: 0.008 }[st.type] * st.navy.flash;
    for (const m of this.modules) {
      if (m.kind !== 'magazine' || m.state === 2 || m.flooded) continue;
      let heat = 0;
      for (const f of this.fires) {
        if (!f.inside) continue;
        if (Math.abs(f.x - m.x) > m.hx + 4 || Math.abs(f.z - m.z) > m.hz + 4) continue;
        heat += f.power;
      }
      if (heat <= 0) { m.heat = Math.max(0, (m.heat || 0) - dt * 0.5); continue; }
      m.heat = (m.heat || 0) + heat * dt;
      if (m.heat > 5 && m.floodAt == null) {
        m.floodAt = this.world.time + 8 + rng() * 14;
        m.floodOk = rng() < 0.95 - 0.55 * (1 - dc);
      }
      if (m.floodAt != null && m.floodOk && this.world.time >= m.floodAt) {
        m.flooded = true;
        if (m.mount != null && this.mounts[m.mount]) this.mounts[m.mount].noAmmo = true;
        this.world.events.push({ type: 'magazineFlooded', ship: this, x: m.x, y: m.y, z: m.z });
        continue;
      }
      if (m.heat > 9 && rng() < dt * cookRate) {
        this.explosionSource = 'fire';
        this.world.magazineExplosion(this, this.lastAttacker, this.toWorld(m.x, m.y, m.z, [0, 0, 0]), m);
        return true;
      }
    }
    return false;
  }

  /**
   * Counter-flooding: with a list, the party opens valves to the empty compartments on the high side. It brings the list down by a share of
   * itself every few seconds, at the price of water in the hull (a ship near her limit of stability may be saved, one already low may not).
   * Destroyers have no compartments to spare.
   */
  counterFlood(dt) {
    const st = this.stats;
    if (st.type === 'DD' || Math.abs(this.floodList) < 0.05) return;
    this._cfT = (this._cfT ?? 6) - dt;
    if (this._cfT > 0) return;
    this._cfT = 8 + 10 / st.navy.dc;
    const rng = this.world.rng;
    if (this.waterFill > 0.5 || rng() > 0.9 * st.navy.dc) return;
    const high = this.floodList > 0 ? 1 : 0;       // the heavy side, so the water goes to the other one
    const low = 1 - high;
    const mid = this.comps.map((c, i) => ({ c, i })).filter(({ c }) => Math.abs(c.xc) < st.L * 0.3 && c.water[low] < 0.6).sort((a, b) => a.c.water[low] - b.c.water[low]).slice(0, 3);
    if (!mid.length) return;
    const want = Math.abs(this.floodList) * this.comps.length * 0.4 / mid.length;
    for (const { c } of mid) c.water[low] = Math.min(1, c.water[low] + want);
    this.world.events.push({ type: 'counterFlood', ship: this });
  }

  /**
   * A fuel line or tank of a carrier was holed: the vapour spreads through the hangars, and unless it is purged (the US system
   * kept its lines filled with CO2 and was foamed, the Japanese hangars were closed boxes) it finds a spark: Taiho and Shokaku were lost
   * hours after one torpedo hit, Lexington (CV-2) the same.
   */
  startAvgasLeak(m, world) {
    if (this.avgasLeak || this.state !== 'afloat') return;
    const rng = world.rng, dc = this.stats.navy.dc;
    const purged = rng() < (this.stats.avgas === 'closed' ? 0.75 : 0.25) * dc;
    this.avgasLeak = { t: 0, purge: purged ? 40 + rng() * 60 : Infinity, blow: 140 + rng() * 220, x: m.x, z: m.z };
  }

  updateAvgas(dt) {
    const lk = this.avgasLeak;
    lk.t += dt;
    if (lk.t > lk.purge) { this.avgasLeak = null; return; }
    if (lk.t > lk.blow && (this.fires.length > 0 || this.world.rng() < dt * 0.05)) {
      this.avgasLeak = null;
      const rng = this.world.rng, w = this.toWorld(lk.x, 0, lk.z, [0, 0, 0]);
      this.world.events.push({ type: 'explosion', x: w[0], y: w[1] + 3, z: w[2], size: 1.4, ship: this, stage: 'secondary', avgas: true });
      for (let i = 0; i < 3; i++) this.world.after(0.4 + i * 0.5 + rng() * 0.4, () => this.world.secondaryBlast(this, lk.x + (rng() - 0.5) * 60, 3 + rng() * 3, (rng() - 0.5) * 8, 0.6 + rng() * 0.5));
      blast(this.world, this, lk.x, 0, lk.z, 700, 'inside', this.lastAttacker, 'bomb');
      this.addFire(lk.x, 4, lk.z, 1.3, true);
      this.applyDamage(this.stats.maxHp * 0.35, this.lastAttacker, 'fire');
    }
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
    // a screw turns about five times a second at full speed (a turn per frame stays under a quarter of the angle between two blades)
    this.propAngle = (this.propAngle + this.speed / Math.max(1, st.maxSpeed) * 30 * dt) % (Math.PI * 2);
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
    const pump = st.maxHp * 0.00012 * dt * st.navy.dc;
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

    // the damage-control party floods compartments on the high side to bring the ship upright (the cost: she sits lower), when it has the time and the means
    if (afloat) this.counterFlood(dt);

    // heel in turns (outward), damage list, flooding trim
    const heelT = clamp(-this.yawRate * this.speed * (st.type === 'DD' ? 5.5 : st.type === 'BB' ? 2.2 : 3.2), -12, 12) * D2R;
    this.heel += (heelT - this.heel) * Math.min(1, dt * 0.9);
    const dmgF = 1 - this.hpFrac;
    const listT = (afloat ? 1 : 0) * clamp(this.listSide * dmgF * 0.05 + this.floodList * 0.9, -0.38, 0.38);
    this.listCur += (listT - this.listCur) * Math.min(1, dt * 0.3);
    // a ship that heels past the limit of her stability for long enough turns over
    if (afloat) {
      const lim = { DD: 0.26, CL: 0.28, CA: 0.30, BB: 0.33, CV: 0.30 }[st.type];
      this._capT = Math.abs(this.listCur) > lim ? (this._capT || 0) + dt : Math.max(0, (this._capT || 0) - dt * 0.5);
      if (this._capT > 12) { this.sinkMode = 'roll'; this.destroy(this.lastAttacker, 'flood'); this.sinkMode = 'roll'; this.sinkStyle = 'roll'; }
    }
    // the trim and the sag of a damaged hull ease in and out: when she is lost they must not vanish at once (the ship would stand up and rise out of the water
    // in one frame, the moment a torpedo finishes her), but give way slowly to the motion of the sinking
    const trimT = (afloat ? -dmgF * 0.015 - clamp(this.floodTrim * 0.9, -0.3, 0.3) : 0);
    this.trimCur += (trimT - this.trimCur) * Math.min(1, dt * (afloat ? 1.5 : 0.25));

    // ---- sinking: the way down follows the mode chosen when she was lost (see destroy) -----------------------------
    let sinkRollT = 0, sinkPitchT = 0;
    if (!afloat) {
      this.sinkT += dt;
      const full = st.D * 1.2 + (this.model.topY * 0.9);
      if (this.split) {
        this.updateSplit(dt, full);
        this.sinkDepth = this.split.depth0 || 0;        // what she had sunk before she broke in two; the sections go on from there
      } else {
        const mode = this.sinkMode || this.sinkStyle;
        // a burning ship first burns out dead in the water, cooking off ammunition, then settles
        let t = this.sinkT;
        if (mode === 'burn') {
          t = Math.max(0, this.sinkT - this.burnT);
          this._cookT -= dt;
          if (this.sinkT < this.burnT && this._cookT <= 0) {
            this._cookT = 3 + this.world.rng() * 7;
            const sz = (0.25 + this.world.rng() * 0.35) * Math.min(1.6, st.L / 130);
            this.world.secondaryBlast(this, (this.world.rng() - 0.5) * st.L * 0.7, 2 + this.world.rng() * 5, (this.world.rng() - 0.5) * st.B * 0.5, sz);
          }
          this.fireLevel = Math.max(this.fireLevel, this.sinkT < this.burnT ? 0.85 : 0.5);
        }
        const T = st.sinkTime * ({ roll: 1.1, bow: 1, stern: 1.05, level: 1.6, burn: 1.5, blast: 0.4 }[mode] || 1);
        const k = t / T;
        const kk = Math.min(k, 1.4);
        let depth;
        if (mode === 'roll') {
          // capsizes: rolls over to the keel and floats upside down for a while, then goes down
          const turn = smoothstep(0, 0.5, k);
          sinkRollT = this.listSide * Math.PI * 0.96 * turn;
          sinkPitchT = 0.05 * k;
          const inverted = st.D * 0.75 * smoothstep(1.3, 2.7, Math.abs(this.sinkRoll));
          depth = st.D * 0.25 * Math.min(1, k * 2) + inverted + full * Math.pow(Math.max(0, (k - 0.5) / 0.6), 1.7);
        } else if (mode === 'bow') {
          sinkPitchT = -Math.min(1.15, 0.12 + k * 1.5);
          sinkRollT = this.listSide * 0.12 * k;
          depth = full * Math.pow(kk, 2.1);
        } else if (mode === 'stern') {
          sinkPitchT = Math.min(1.1, 0.12 + k * 1.4);
          sinkRollT = this.listSide * 0.12 * k;
          depth = full * Math.pow(kk, 2.1);
        } else if (mode === 'blast') {
          sinkPitchT = this.listSide * 0.3 * Math.min(1, k * 1.4);
          sinkRollT = this.listSide * 0.35 * Math.min(1, k * 1.4);
          depth = full * Math.pow(kk, 1.5);
        } else {   // level, burn: settles on an even keel, the deck awash, the bow or stern a little low
          sinkPitchT = this.floodTrim * -0.12 * Math.min(1, k * 2);
          sinkRollT = this.listSide * 0.07 * Math.min(1, k * 2);
          depth = full * Math.pow(kk, 1.35);
        }
        this.sinkDepth = depth;
        if (this.sinkDepth > full) { this.state = 'sunk'; this.world.shipGone(this); }
      }
    }
    this.sinkRoll += (sinkRollT - this.sinkRoll) * Math.min(1, dt * 0.7);
    this.sinkPitch += (sinkPitchT - this.sinkPitch) * Math.min(1, dt * 0.6);

    this.roll = this.sr.x + this.heel + this.listCur + this.sinkRoll;
    this.pitch = this.sp.x + this.trimCur + this.sinkPitch;
    // settle lower in the water with damage / flooding
    const settleT = afloat ? Math.min(st.D * 0.4, dmgF * st.D * 0.25 + this.waterFill * st.D * 0.5) : 0;
    this.settleCur += (settleT - this.settleCur) * Math.min(1, dt * (afloat ? 1.5 : 0.12));
    this.y = this.sh.x - this.settleCur - this.sinkDepth;

    // ---- fires, magazine heating -------------------------------------------------------------------------
    if (afloat) {
      let burn = 0;
      const dc = st.navy.dc;
      // a carrier's hangar full of fuelled and armed aircraft, or a ship of wood and paint, feeds a fire; the damage-control parties put it out
      const feed = st.type === 'CV' ? 2.2 : st.navy.dc < 0.7 ? 1.3 : 1;
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        f.t -= dt * dc;
        burn += f.power;
        if (f.t <= 0) { this.fires.splice(i, 1); continue; }
        // a strong fire spreads to the next compartment
        if (f.power >= 0.7 && this.fires.length < 8 && this.world.rng() < dt * 0.012 * feed * (f.inside ? 1 : 0.6)) {
          this.addFire(f.x + (this.world.rng() - 0.5) * 14, f.y, f.z + (this.world.rng() - 0.5) * 4, f.power * 0.8, f.inside);
        }
      }
      if (this.updateMagazines(dt)) return;
      if (this.avgasLeak) this.updateAvgas(dt);
      this.fireLevel = sat(burn * 0.35);
      // a fire does less harm to a big, compartmented, armoured ship than to a destroyer or a carrier with fuel and aircraft aboard
      if (burn > 0) this.applyDamage(Math.min(burn, 3.5) * 0.00036 * st.maxHp * dt * { DD: 1.2, CL: 1.0, CA: 0.85, BB: 0.6, CV: 1.2 }[st.type], null, 'fire');
      if (this.floodRate > 0) this.applyDamage(this.floodRate * dt, null, 'flood');
      // structural failure: a long, battered ship whose neighbouring compartments are both full amidships breaks her back
      if (st.L > 110 && this.hpFrac < 0.3 && !this.split && this.state === 'afloat') {
        this._breakT = (this._breakT || 0) + dt;
        if (this._breakT > 1) {
          this._breakT = 0;
          for (let i = 0; i + 1 < this.comps.length; i++) {
            const a = this.comps[i], c = this.comps[i + 1];
            if (Math.abs(a.xc) > st.L * 0.32 || Math.min((a.water[0] + a.water[1]) / 2, (c.water[0] + c.water[1]) / 2) < 0.8) continue;
            if (this.world.rng() < 0.12) {
              this.sinkMode = 'split';
              this.destroy(this.lastAttacker, 'structure');
              this.sinkMode = 'split'; this.sinkStyle = 'split';
              this.world.breakInTwo(this, (a.xc + c.xc) / 2);
              return;
            }
          }
        }
      }
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
      // the section is thrown apart by the blast (a small hop), then floats on its own buoyancy: a spring towards the waterline it would
      // sit at, which falls as the section fills with water and takes it down
      const eq = -Math.pow(1 - h.buoy, 2.2) * full * 1.05;
      h.vy += (-6 * (h.dy - eq) - 3.2 * h.vy) * dt;
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
    amount *= shipDmg(cause);       // the multiplier of data/balance.js
    if (amount <= 0) return false;
    this.hp -= amount;
    if (attacker) { this.lastAttacker = attacker; this.lastHitT = this.world.time; this.world.lastCombatT = this.world.time; }
    if (this.hp <= 0) { this.hp = 0; this.destroy(attacker, cause); return true; }
    return false;
  }

  /**
   * How a ship that has been lost goes down, from what killed her and the state of her hull: a magazine blows her apart; a fire that
   * got out of hand burns her out first; a strongly one-sided flooding (a torpedo) capsizes her; a trim by the bow or stern takes her
   * down that way; an even flooding lets her settle on her keel; otherwise it depends on the class.
   */
  chooseSinkMode(cause, type, rng) {
    const r = rng();
    if (cause === 'magazine') return 'blast';
    if (cause === 'fire' || (this.fireLevel > 0.55 && cause !== 'torpedo' && r < 0.5)) return 'burn';
    const list = Math.abs(this.floodList), trim = this.floodTrim;
    if (list > 0.16 && type !== 'BB') return 'roll';
    if (list > 0.3) return 'roll';
    if (trim > 0.1) return 'bow';
    if (trim < -0.1) return 'stern';
    if (cause === 'flood' && this.waterFill > 0.55) return 'level';
    const w = { DD: [0.4, 0.2, 0.3, 0.1], CL: [0.25, 0.25, 0.3, 0.2], CA: [0.2, 0.25, 0.3, 0.25], BB: [0.1, 0.3, 0.3, 0.3], CV: [0.2, 0.2, 0.2, 0.4] }[type] || [0.3, 0.25, 0.25, 0.2];
    return ['roll', 'bow', 'stern', 'level'][r < w[0] ? 0 : r < w[0] + w[1] ? 1 : r < w[0] + w[1] + w[2] ? 2 : 3];
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
    const rng = this.world.rng;
    // she goes over to the side she was already leaning to, whatever hit her last
    if (Math.abs(this.listCur) > 0.04) this.listSide = this.listCur > 0 ? 1 : -1;
    this.sinkMode = this.chooseSinkMode(cause, t, rng);
    this.sinkStyle = this.sinkMode;
    if (this.sinkMode === 'burn') this.burnT = clamp(this.stats.L * 0.3 + rng() * 40, 30, 100);
    if (cause === 'magazine') this.exploded = true;
    for (const m of this.mounts) { m.alive = false; }
    this.cmd.throttle = 0; this.cmd.desiredHeading = null;
    this.world.events.push({ type: 'sinking', ship: this, magazine: cause === 'magazine', mode: this.sinkMode });
    this.world.onShipSunk(this, killer, cause);
  }
}
