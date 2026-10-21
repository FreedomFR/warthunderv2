// What the bases do during a battle: the coastal batteries shell the enemy ships in range, the anti-aircraft guns fire at the aircraft, the shells and the bombs that fall on a base
// wreck its buildings, guns and parked aircraft, and the airfields send their aircraft out (sim/airfield.js). The layouts are static (sim/bases.js); `BaseSim` is the live state of one.
import { clamp, wrapPi, approach, D2R } from '../math.js';
import { BaseState } from './bases.js';
import { BY_ID } from '../data/ships.js';
import { makeStats } from './shipdata.js';
import { gunBallistics, solve } from './ballistics.js';
import { AA } from './aadata.js';
import { lightAAHitRate } from './airhit.js';
import { recoilCurve } from './weapons.js';
import { spawnScrap } from './debris.js';
import { hitPlane } from './planedamage.js';
import { BALANCE } from '../data/balance.js';
import { initAirfield, stepAirfield, killGroundPlane } from './airfield.js';

/** The heavy cruiser whose main gun the coastal batteries of a nation use (the same guns, taken off the ships and put in a concrete emplacement). */
const COASTAL_GUN = { USA: 'baltimore', Japan: 'takao', UK: 'norfolk', Germany: 'admiral_hipper', Italy: 'zara', France: 'algerie' };
const AA_VARIANT = { 40: 'bofors', 37: 'bofors', 25: 'iijn25', 20: 'oerlikon' };
const gunCache = new Map();

/** The gun of the coastal batteries of a nation (the stats of the main gun of one of its heavy cruisers). */
export function coastalGunOf(nation) {
  let g = gunCache.get(nation);
  if (!g) {
    const spec = BY_ID[COASTAL_GUN[nation]] || BY_ID.baltimore;
    g = { ...makeStats(spec).main, group: 'coastal' };
    // a gun on a hill, in concrete: trained a little faster and ranged a little further than on the ship
    g.trainRate *= 1.3; g.maxElevDeg = Math.min(g.maxElevDeg + 5, 55); g.maxRange *= 1.08;
    gunCache.set(nation, g);
  }
  return g;
}

/** A stand-in for the `owner` of the shells and the bombs that a base fires: the fields that the damage code and the score board look at. */
function makeOwner(base) {
  const L = base.layout;
  return {
    id: -1 - L.id, isBase: true, base, team: base.team, name: base.name, alive: true, state: 'afloat', x: L.x, z: L.z, y: L.y, vx: 0, vz: 0, speed: 0, heading: 0,
    stats: { id: 'base', type: 'BASE', nation: base.nation, className: base.name },
    damageDealt: 0, shotsFired: 0, shotsHit: 0, torpHits: 0, planeKills: 0, aaKills: 0, lostPlanes: 0, kills: 0, gunAcc: 2.0,
  };
}

export class BaseSim extends BaseState {
  constructor(layout, world) {
    super(layout);
    this.world = world;
    this.nation = layout.nation;
    this.inert = layout.team == null;
    this.name = layout.kind === 'airfield' ? 'Aérodrome' : 'Batterie côtière';
    this.owner = makeOwner(this);
    this.gun = layout.guns.some((g) => g.kind === 'coastal') ? coastalGunOf(this.nation) : null;
    this.ball = this.gun ? gunBallistics({ cal: this.gun.cal, v0: this.gun.v0, shellKg: this.gun.shellKg, maxRange: this.gun.maxRange, maxElevDeg: Math.min(this.gun.maxElevDeg, 50) }) : null;
    this.fires = [];                       // burning ruins: { x, y, z, r, t, life, power } (drawn by render/fx/fires.js)
    this.lastShotT = -999;                 // when one of its guns last fired
    this.shotAt = new Map();               // ship id -> the time a coastal gun of this base last fired at it
    this.guns.forEach((s, i) => {
      const g = layout.guns[i];
      Object.assign(s, {
        id: i, kind: g.kind, x: g.x, y: g.y + (g.kind === 'coastal' ? 4.2 : 1.6), z: g.z, heading: g.heading, cal: g.cal, n: g.n,
        reload: g.kind === 'coastal' ? this.gun.reload * (0.4 + 0.6 * ((i * 0.37) % 1)) : 0, fireT: 99, target: null, retarget: (i * 0.173) % 0.6, aimOk: false, burstLeft: 0,
        ammo: g.kind === 'coastal' ? { AP: Math.round(this.gun.rpg * 0.5 * g.n), HE: Math.round(this.gun.rpg * 0.5 * g.n) } : null,
        variant: g.kind === 'aa' ? AA_VARIANT[g.cal] || 'bofors' : null, rec: { yaw0: g.heading, n: g.n },
        train: 0, elev: g.kind === 'aa' ? 0.5 : 0.1,      // train: relative to the heading of the emplacement, as drawn (render/baseVisual.js)
      });
    });
    this.maxHp = this.hp = layout.parts.reduce((a, p) => a + p.hp, 0) + this.guns.reduce((a, g) => a + g.hp, 0);
    // how far from the centre anything of the base lies (a shell or a bomb further away than this cannot touch it)
    this.reach = 40 + Math.max(0, ...layout.parts.map((p) => Math.hypot(p.x - layout.x, p.z - layout.z) + Math.max(p.w, p.l)), ...layout.guns.map((g) => Math.hypot(g.x - layout.x, g.z - layout.z)),
      ...layout.slots.map((q) => Math.hypot(q.x - layout.x, q.z - layout.z) + 20), layout.runway ? layout.runway.len / 2 + 60 : 0);
    // a stand-in for a ship, for the ships that shoot at the base (see sim/weapons.js and controllers/ai.js: `isBase`)
    const top = Math.max(0, ...layout.parts.map((p) => p.h));
    const base = this;
    this.target = {
      id: this.owner.id, isBase: true, base, team: this.team, x: layout.x, y: layout.y, z: layout.z, vx: 0, vz: 0, speed: 0, heading: 0, yawRate: 0,
      get alive() { return base.alive && !base.inert; }, get hpFrac() { return base.hpFrac; }, get hp() { return base.hp; }, model: { topY: top + 5, radius: 120 },
      stats: { type: 'BASE', id: 'base', nation: this.nation, armor: null, L: 300, B: 120, className: this.name, score: 1 }, name: this.name, _d: 0,
    };
    if (layout.kind === 'airfield') initAirfield(world, this);
  }

  get hpFrac() { return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0; }
  partsAlive(kind) { let n = 0; this.layout.parts.forEach((p, i) => { if (p.kind === kind && this.partState[i] < 2) n++; }); return n; }
  partsTotal(kind) { let n = 0; for (const p of this.layout.parts) if (p.kind === kind) n++; return n; }

  recount() {
    let hp = 0;
    for (let i = 0; i < this.partHp.length; i++) hp += Math.max(0, this.partHp[i]);
    for (const g of this.guns) hp += g.alive ? Math.max(0, g.hp) : 0;
    this.hp = hp;
    // a base that has lost most of what it had is not worth shooting at any more
    const was = this.alive;
    this.alive = hp > this.maxHp * 0.3;
    if (was && !this.alive) this.world.events.push({ type: 'baseDown', base: this, x: this.layout.x, z: this.layout.z });
  }

  /** The aircraft of this base that are on the ground (parked or taxiing) and still there. */
  groundPlanes() { return this.parked.filter((p) => p && !p.gone && !p.dying && p.ground); }
}

// ---- coastal guns ------------------------------------------------------------------------------------------------------------------------------------

/** Can the gun `g` of the base shoot at `ship`: in range, in sight, not behind a hill? Fills `out` with the firing solution. */
function solution(base, g, ship, out) {
  const T = base.world.terrain, b = base.ball, gun = base.gun;
  let tof = 0, ax = ship.x, az = ship.z, sol = null;
  const ay = clamp(ship.model.topY * 0.16, 2.5, 7);
  for (let i = 0; i < 3; i++) {
    ax = ship.x + ship.vx * tof; az = ship.z + ship.vz * tof;
    const range = Math.hypot(ax - g.x, az - g.z);
    if (range > gun.maxRange * 0.97) return false;
    sol = solve(b, range, ay - g.y);
    if (!sol) return false;
    tof = sol.tof;
  }
  const range = Math.hypot(ax - g.x, az - g.z);
  if (range < 1500) return false;
  if (T && T.arcBlocked(g.x, g.y, g.z, ax, az, Math.max(sol.elev, 0), gun.v0)) return false;
  out.bearing = Math.atan2(ax - g.x, -(az - g.z)); out.elev = sol.elev; out.range = range; out.tof = sol.tof;
  return true;
}

function fireCoastal(world, base, g, ship, s) {
  const gun = base.gun, rng = world.rng;
  const heavy = ship.stats.armor && ship.stats.type !== 'DD' && ship.stats.type !== 'CL';
  const type = heavy && g.ammo.AP > 0 ? 'AP' : (g.ammo.HE > 0 ? 'HE' : 'AP');
  const nFire = Math.min(g.n, g.ammo[type]);
  if (nFire <= 0) { g.reload = 5; return; }
  g.ammo[type] -= nFire;
  // the dispersion of a fixed gun with a rangefinder and a fire-control post: a little better than a ship's in a seaway (the post destroyed: worse)
  const acc = base.partsAlive('post') || !base.partsTotal('post') ? 1.7 : 3.2;
  const sigR = 0.0085 * s.range * acc, sigA = 0.0030 * acc;
  const yaw = g.heading + g.train, ce = Math.cos(g.elev), se = Math.sin(g.elev);
  const fx = Math.sin(yaw) * ce, fy = se, fz = -Math.cos(yaw) * ce;
  const mx = g.x + fx * 7, my = g.y + 1.2 + fy * 7, mz = g.z + fz * 7;
  const barrels = [];
  for (let i = 0; i < g.n; i++) {
    const off = (i - (g.n - 1) / 2) * 1.7;
    const bx = mx + Math.cos(yaw) * off, bz = mz + Math.sin(yaw) * off;
    barrels.push(bx, my, bz);
    if (i >= nFire) continue;
    const r2 = clamp(s.range + rng.normal() * sigR, 600, gun.maxRange * 0.995);
    const so = solve(base.ball, r2, 0), nominal = solve(base.ball, s.range, 0);
    const e = g.elev + (so && nominal ? so.elev - nominal.elev : 0);
    const hy = yaw + rng.normal() * sigA, ce2 = Math.cos(e), se2 = Math.sin(e), v0 = gun.v0 * (1 + rng.normal() * 0.002);
    world.spawnShell({ owner: base.owner, gun, type, c: base.ball.c, x: bx, y: my, z: bz, vx: Math.sin(hy) * ce2 * v0, vy: se2 * v0, vz: -Math.cos(hy) * ce2 * v0, target: ship, aimX: ship.x, aimZ: ship.z, group: 'main' });
  }
  base.owner.shotsFired += nFire;
  g.reload = gun.reload * (0.92 + rng() * 0.16);
  g.fireT = 0; g.flash = 1; base.lastShotT = world.time;
  base.shotAt.set(ship.id, world.time);
  world.events.push({ type: 'muzzle', ship: null, base, mount: g, x: mx, y: my, z: mz, dx: fx, dy: fy, dz: fz, cal: gun.cal, n: g.n, group: 'main', barrels });
}

const _p = {};
function stepCoastal(world, base, g, dt, active) {
  g.fireT += dt; g.recoil = recoilCurve(g.fireT); g.flash = Math.max(0, g.flash - dt * 5);
  if (!active || !g.alive) return;
  g.reload = Math.max(0, g.reload - dt);
  g.retarget -= dt;
  if (g.retarget <= 0 || !g.target || g.target.state !== 'afloat' || !g.target.alive) {
    g.retarget = 1.0 + world.rng() * 0.6;
    g.target = null;
    let best = null, bs = 0;
    for (const s of world.ships) {
      if (s.team === base.team || s.state !== 'afloat' || !s.alive) continue;
      const d = Math.hypot(s.x - g.x, s.z - g.z);
      if (d > base.gun.maxRange) continue;
      if (!solution(base, g, s, _p)) continue;
      const v = ({ DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3 }[s.stats.type] || 1) * (1 + (1 - s.hpFrac) * 0.9) / (0.35 + d / base.gun.maxRange);
      if (v > bs) { bs = v; best = s; }
    }
    g.target = best;
  }
  const ship = g.target;
  const rate = base.gun.trainRate * D2R * dt;
  if (!ship || !solution(base, g, ship, _p)) { g.target = null; g.aimOk = false; g.elev = approach(g.elev, 0.1, rate); return; }
  g.train += clamp(wrapPi(_p.bearing - g.heading - g.train), -rate, rate);
  g.elev = approach(g.elev, clamp(_p.elev, 0, Math.min(base.gun.maxElevDeg, 50) * D2R), rate * 1.4);
  g.aimOk = Math.abs(wrapPi(_p.bearing - g.heading - g.train)) < 1.0 * D2R && Math.abs(g.elev - _p.elev) < 0.8 * D2R;
  if (g.aimOk && g.reload <= 0) fireCoastal(world, base, g, ship, _p);
}

// ---- anti-aircraft guns ----------------------------------------------------------------------------------------------------------------------------

const STILL = { heading: 0, vx: 0, vz: 0, vy: 0, roll: 0 };
const crewOf = (base) => (base.partsTotal('barracks') ? 0.55 + 0.45 * base.partsAlive('barracks') / base.partsTotal('barracks') : 1);

function stepAA(world, base, g, dt, planes, active) {
  g.flash = Math.max(0, g.flash - dt * 6); g.recoil = Math.max(0, g.recoil - dt * 4);
  if (!active || !g.alive) return;
  const cfg = AA[g.variant], rng = world.rng;
  g.retarget -= dt;
  if (g.retarget <= 0 || !g.target || g.target.dying || g.target.gone) {
    g.retarget = 0.35 + rng() * 0.5; g.target = null;
    let bs = 1e9;
    for (const p of planes) {
      if (p.team === base.team || p.ground || p.gone) continue;
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d > cfg.range * 1.05) continue;
      const s = d * (p.dying ? 2.5 : 1);
      if (s < bs) { bs = s; g.target = p; }
    }
  }
  const p = g.target;
  if (!p) { g.elev = approach(g.elev, 0.5, dt * 1.2); return; }
  const t0 = Math.hypot(p.x - g.x, p.z - g.z) / 600;
  const dx = p.x + p.vx * t0 - g.x, dy = p.y + p.vy * t0 - (g.y + 1.2), dz = p.z + p.vz * t0 - g.z;
  const hd = Math.hypot(dx, dz), dist = Math.hypot(dx, dy, dz);
  const want = Math.atan2(dx, -dz), elevWant = Math.atan2(dy, hd), turn = cfg.turn * D2R * dt;
  g.train += clamp(wrapPi(want - g.heading - g.train), -turn, turn);
  g.elev += clamp(clamp(elevWant, 0, cfg.elevMax * D2R) - g.elev, -turn, turn);
  if (dist > cfg.range || elevWant > cfg.elevMax * D2R || Math.abs(wrapPi(want - g.heading - g.train)) > 0.12) return;
  const w = [g.x, g.y + 1.2, g.z];
  const fall = Math.pow(1 - dist / cfg.range, 1.5);
  // a mount that does not move, on ground that does not roll; the crew counts (the barracks)
  const hitRate = lightAAHitRate(STILL, g, p, cfg, w, dist) * crewOf(base);
  if (rng() < hitRate * dt) hitPlane(world, base.owner, p, cfg.hit * (0.7 + 0.6 * rng()), g.cal);
  g.burstLeft -= dt;
  if (g.burstLeft <= 0) {
    g.burstLeft = 0.26 + rng() * 0.16; g.flash = 1; g.recoil = 1;
    world.events.push({ type: 'aaFire', ship: null, base, mount: g, plane: p, x: w[0], y: w[1], z: w[2], cal: g.cal, n: g.n, variant: g.variant });
  }
  p.harass = Math.min(2, p.harass + dt * 0.1 * fall);
}

// ---- damage ------------------------------------------------------------------------------------------------------------------------------------------

/** Is the point (x, y, z) inside the box of the part (its heading as a ship's: `l` along it, `w` across it), a little enlarged? */
function inPart(p, x, y, z, grow = 0.6) {
  const dx = x - p.x, dz = z - p.z, sh = Math.sin(p.heading), ch = Math.cos(p.heading);
  const f = dx * sh - dz * ch, r = dx * ch + dz * sh;
  return Math.abs(f) <= p.l / 2 + grow && Math.abs(r) <= p.w / 2 + grow && y >= p.y - 2 && y <= p.y + p.h + grow;
}
const distToPart = (p, x, z) => Math.max(0, Math.hypot(x - p.x, z - p.z) - Math.min(p.w, p.l) * 0.5);

function partDestroyed(world, base, i, attacker) {
  const p = base.layout.parts[i];
  base.partState[i] = 2; base.partHp[i] = 0;
  const big = p.kind === 'depot' ? 1.1 : p.kind === 'tank' ? 0.8 : p.kind === 'hangar' ? 0.65 : p.kind === 'bunker' ? 0.6 : 0.4;
  const y = p.y + p.h * 0.4;
  world.events.push({ type: 'explosion', stage: 'secondary', x: p.x, y, z: p.z, size: big, base });
  world.events.push({ type: 'baseHit', base, part: i, state: 2, x: p.x, y, z: p.z });
  base.fires.push({ x: p.x, y: p.y + 0.5, z: p.z, r: Math.max(3, Math.min(p.w, p.l) * 0.45), t: 70 + world.rng() * 60, life: 130, power: p.kind === 'tank' ? 1.6 : p.kind === 'depot' ? 1.2 : 0.9 });
  if (base.fires.length > 14) base.fires.shift();
  spawnScrap(world, p.x, p.y + 2, p.z, p.kind === 'hangar' ? 9 : 5, 14 + big * 6, 0, 0, 0.8);
  // what blows up takes the neighbourhood with it: the fuel, the shells in the depot and in the magazines
  if (p.kind === 'depot' || p.kind === 'tank' || p.kind === 'bunker') {
    const R = p.kind === 'depot' ? 48 : p.kind === 'bunker' ? 28 : 26, pw = p.kind === 'depot' ? 240 : p.kind === 'bunker' ? 150 : 90;
    world.after(0.4 + world.rng() * 0.5, () => damageBase(world, base, p.x, p.y, p.z, R, pw, attacker, 'chain', i));
  }
  base.recount();
}

/**
 * An explosion at (x, y, z): `power` hit points at the centre, falling off to nothing at `radius` metres. Wrecks buildings and guns, kills parked aircraft.
 * `skip`: a part that must not be hit again (the one that is blowing up).
 */
export function damageBase(world, base, x, y, z, radius, power, attacker, cause, skip = -1) {
  const L = base.layout;
  if (Math.hypot(x - L.x, z - L.z) > base.reach + radius) return 0;
  power *= BALANCE.bases.all;       // the multiplier of data/balance.js
  let dealt = 0;
  L.parts.forEach((p, i) => {
    if (i === skip || base.partState[i] >= 2) return;
    const d = distToPart(p, x, z);
    if (d > radius) return;
    const dmg = power * Math.pow(1 - d / radius, 1.4) * (p.kind === 'bunker' ? 0.45 : 1);
    if (dmg < 1) return;
    base.partHp[i] -= dmg; dealt += dmg;
    if (base.partHp[i] <= 0) partDestroyed(world, base, i, attacker);
    else if (base.partHp[i] < p.hp * 0.55 && base.partState[i] === 0) { base.partState[i] = 1; world.events.push({ type: 'baseHit', base, part: i, state: 1, x: p.x, y: p.y + p.h * 0.5, z: p.z }); }
  });
  base.guns.forEach((g, i) => {
    if (!g.alive) return;
    const d = Math.hypot(x - g.x, z - g.z);
    if (d > radius) return;
    // an emplacement is concrete: the blast has to be close, or big
    const dmg = power * Math.pow(1 - d / radius, 1.4) * (g.kind === 'coastal' ? 0.5 : 1);
    if (dmg < 1) return;
    g.hp -= dmg; dealt += dmg;
    if (g.hp <= 0) {
      g.alive = false; g.hp = 0; g.target = null;
      const gy = g.y + (g.kind === 'coastal' ? 2 : 0.8);
      world.events.push({ type: 'explosion', stage: 'secondary', x: g.x, y: gy, z: g.z, size: g.kind === 'coastal' ? 0.7 : 0.35, base });
      world.events.push({ type: 'baseHit', base, gun: i, state: 2, x: g.x, y: gy, z: g.z });
      base.fires.push({ x: g.x, y: g.y, z: g.z, r: g.kind === 'coastal' ? 4 : 2, t: 40 + world.rng() * 30, life: 70, power: 0.8 });
      if (base.fires.length > 14) base.fires.shift();
      spawnScrap(world, g.x, g.y + 2, g.z, g.kind === 'coastal' ? 7 : 4, 12, 0, 0, 0.8);
    }
  });
  for (const p of base.groundPlanes()) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > radius + 12) continue;
    const dmg = power * 0.08 * Math.pow(Math.max(0, 1 - (d - 12) / radius), 1.2);
    if (dmg <= 0) continue;
    p.hp -= dmg;
    if (p.hp <= 0) killGroundPlane(world, base, p, attacker, cause);
  }
  base.recount();
  if (attacker && dealt > 0) attacker.damageDealt = (attacker.damageDealt || 0) + dealt;
  return dealt;
}

const shellRadius = (s) => (s.type === 'HE' ? 4 + s.gun.cal * 0.045 : 2.5 + s.gun.cal * 0.02);
const shellPower = (s) => s.gun.shellKg * (s.type === 'HE' ? 1.0 : 0.5);

/**
 * A shell on its way through the base: does it strike a building, a gun or an aircraft here? Returns true when it bursts. (The burst on the bare ground of the base is
 * `shellGround`.)
 */
export function shellHitsBase(world, s, x, y, z) {
  const owner = s.owner;
  for (const base of world.bases) {
    if (base.inert || base.team === (owner && owner.team)) continue;
    const L = base.layout;
    if (Math.hypot(x - L.x, z - L.z) > base.reach) continue;
    let hit = false;
    for (let i = 0; i < L.parts.length && !hit; i++) if (base.partState[i] < 2 && inPart(L.parts[i], x, y, z)) hit = true;
    for (let i = 0; i < base.guns.length && !hit; i++) { const g = base.guns[i]; if (g.alive && Math.hypot(x - g.x, z - g.z) < (g.kind === 'coastal' ? 4.5 : 2.5) && y > g.y - 1 && y < g.y + 7) hit = true; }
    if (!hit) for (const p of base.groundPlanes()) if (Math.abs(x - p.x) < 9 && Math.abs(z - p.z) < 9 && y > p.y - 2 && y < p.y + 5) { hit = true; break; }
    if (!hit) continue;
    burst(world, base, s, x, y, z, 1.6);
    return true;
  }
  return false;
}

/** The shell bursts on the ground (or the pad) of a base: damages what is within the radius of its blast. */
export function shellGround(world, s, x, y, z) {
  const owner = s.owner;
  for (const base of world.bases) {
    if (base.inert || base.team === (owner && owner.team)) continue;
    if (Math.hypot(x - base.layout.x, z - base.layout.z) > base.reach) continue;
    burst(world, base, s, x, y, z, 1);
  }
}

function burst(world, base, s, x, y, z, k) {
  world.events.push({ type: 'explosion', stage: 'air', x, y: y + 1, z, size: clamp(s.gun.cal / 500, 0.2, 0.55) * (s.type === 'HE' ? 1 : 0.6), base });
  damageBase(world, base, x, y, z, shellRadius(s) * (k > 1 ? 1.2 : 1), shellPower(s) * k, s.owner, 'shell');
  if (s.owner && s.owner.shotsHit !== undefined) s.owner.shotsHit++;
}

/** A bomb falls on the base. Returns true when it bursts (on the ground or the roof of a building). */
export function bombHitsBase(world, b) {
  for (const base of world.bases) {
    if (base.inert || base.team === b.team) continue;
    const L = base.layout;
    if (Math.hypot(b.x - L.x, b.z - L.z) > base.reach) continue;
    const gh = world.terrain ? world.terrain.heightAt(b.x, b.z) : 0;
    let top = gh;
    for (let i = 0; i < L.parts.length; i++) if (base.partState[i] < 2 && inPart(L.parts[i], b.x, b.y, b.z, 1.5)) top = Math.max(top, L.parts[i].y + L.parts[i].h * 0.5);
    if (b.y > top + 0.5) continue;
    const R = 7 + Math.sqrt(b.kg) * 0.85, pw = b.kg * 0.95;
    world.events.push({ type: 'landImpact', x: b.x, y: top, z: b.z, cal: 130 + Math.sqrt(b.kg) * 7, shell: 'HE', dx: b.vx, dz: b.vz, bomb: true });
    world.events.push({ type: 'explosion', stage: 'air', x: b.x, y: top + 1, z: b.z, size: clamp(b.kg / 900, 0.3, 0.9), base });
    damageBase(world, base, b.x, top, b.z, R, pw, b.owner, 'bomb');
    return true;
  }
  return false;
}

// ---- the whole of it ---------------------------------------------------------------------------------------------------------------------------------

/** Builds the live state of every base of the terrain. */
export function buildBases(world, terrain) {
  return terrain.bases.map((layout) => new BaseSim(layout, world));
}

export function updateBases(world, dt) {
  const bases = world.bases;
  if (!bases.length) return;
  const running = world.state === 'running';
  for (const base of bases) {
    const active = running && !base.inert;
    for (const g of base.guns) {
      if (g.kind === 'coastal') stepCoastal(world, base, g, dt, active);
      else stepAA(world, base, g, dt, world.planes, active);
    }
    for (let i = base.fires.length - 1; i >= 0; i--) { base.fires[i].t -= dt; if (base.fires[i].t <= 0) base.fires.splice(i, 1); }
    if (base.layout.kind === 'airfield') stepAirfield(world, base, dt);
  }
}
