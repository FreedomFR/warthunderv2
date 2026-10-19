// Carrier fighters. A wave of bombers is escorted by a section of fighters; when enemy aircraft come near the fleet a patrol (CAP) goes up from the
// carrier. A fighter flies its station (over the bombers it escorts, or in a circle over the fleet), picks the enemy aircraft that threatens most,
// closes on it with lead pursuit and fires its machine guns in bursts; the rear gunners of the bombers shoot back. When it has no ammunition left,
// is badly hurt or short of fuel it goes home and lands like the others (sim/aircraft.js, sim/deck.js).
import { clamp, wrapPi, D2R } from '../math.js';
import { aaSources, exposure } from './routing.js';

export const FIGHT_PHASES = new Set(['escort', 'cap', 'engage']);
const STRIKE = new Set(['cruise', 'ip', 'run', 'rollin', 'dive', 'pullout', 'break', 'egress']);
const AMMO = 520;                       // bursts of 1/14 s: about 37 s of fire
const BURST_RATE = 14;
const V_COMBAT = { f6f: 150, a6m: 142, fulmar: 126, bf109t: 150, d520: 146, mc202: 150 };
const V_CRUISE_F = 108;

/** Enemy aircraft that are flying (not on a deck, not already falling). */
function hostiles(world, p) {
  const out = [];
  for (const q of world.planes) {
    if (q.team === p.team || q.dying || q.hidden || q.gone || q.y < 12 || q.phase === 'floating' || q.phase === 'queue' || q.phase === 'takeoff' || q.phase === 'rollout' || q.phase === 'taxiIn') continue;
    out.push(q);
  }
  return out;
}

/** How much an enemy aircraft is worth attacking now (the fighter p, at distance d from it). */
function value(world, p, q, d, anchor) {
  let sc = 0;
  if (q.fighter) sc += p.role === 'escort' ? 2.6 : 1.2;
  else sc += 1.4;
  if (q.phase === 'ip' || q.phase === 'run' || q.phase === 'rollin' || q.phase === 'dive') sc += 3.2;      // the ones that are about to drop
  if (q.ordnance) sc += 1;
  sc -= d / 3500;
  if (anchor) sc -= Math.hypot(q.x - anchor.x, q.z - anchor.z) / 9000;
  // an escort's first duty: the enemy that is going for the bombers it covers (a fighter whose prey is one of them), or is already among them
  if (p.role === 'escort' && q.fighter) {
    if (q.prey && q.prey.wave === p.wave) sc += 5;
    else if (anchor && Math.hypot(q.x - anchor.x, q.z - anchor.z) < 2500) sc += 2.5;
  }
  for (const f of world.planes) if (f !== p && f.fighter && f.prey === q && !f.dying) sc -= 1.8;      // two on one is enough
  // nobody likes to follow his prey into the guns of its friends
  if (!q.fighter && q.y < 2500) sc -= 2.2 * exposure(p._srcs || (p._srcs = aaSources(world, p.team, 0)), q.x, q.z, q.y < 1500);
  return sc;
}

/** The bombers this fighter escorts: their centre, heading and speed (null when none is left on the strike). */
function escorted(world, p) {
  let n = 0, x = 0, y = 0, z = 0, vx = 0, vz = 0;
  for (const q of world.planes) {
    if (q.wave !== p.wave || q.fighter || q.dying || q.gone || !STRIKE.has(q.phase)) continue;
    n++; x += q.x; y += q.y; z += q.z; vx += q.vx; vz += q.vz;
  }
  if (!n) return null;
  return { x: x / n, y: y / n, z: z / n, vx: vx / n, vz: vz / n, n };
}

/**
 * One tick of a fighter in its escort, patrol or combat phase. Returns the guidance { hdg, gam, spd, o }; may change the phase of the aircraft.
 * ctx: { hit(world, shooter, target, dmg, cal) } (damage to an aircraft).
 */
export function fighterSteer(world, p, dt, ctx) {
  const ship = p.owner;
  const vC = V_COMBAT[p.typeKey] || 145;
  const out = { hdg: p.heading, gam: 0, spd: V_CRUISE_F, o: { bankMax: 70 * D2R, pitchRate: 0.7 } };
  // ---- going home: out of ammunition, hurt, or short of fuel ----
  if (p.ammo <= 0 || p.hp < p.maxHp * 0.3 || p.fuel < 260) { p.phase = 'return'; p.prey = null; return out; }
  if (!ship || !ship.alive || ship.deckWrecked) { p.phase = 'return'; p.prey = null; return out; }

  const anchor = p.role === 'escort' ? escorted(world, p) : null;
  if (p.role === 'escort' && !anchor && p.phase !== 'engage') { p.phase = 'return'; return out; }

  // ---- choose the prey ----
  p.preyT = (p.preyT ?? 0) - dt;
  if (p.prey && (p.prey.dying || p.prey.gone || p.prey.hidden || p.prey.y < 8)) { p.prey = null; p.preyT = 0; }
  if (p.preyT <= 0) {
    p.preyT = 0.8 + world.rng() * 0.6;
    p._srcs = null;
    const detect = p.phase === 'engage' ? 8500 : p.role === 'escort' ? 4800 : 15000;
    let best = null, bs = -1e9;
    for (const q of hostiles(world, p)) {
      const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (d > detect) continue;
      // a patrol only goes for aircraft that come near its fleet; an escort for those near the bombers
      if (p.role === 'cap' && Math.hypot(q.x - ship.x, q.z - ship.z) > 26000) continue;
      if (p.role === 'escort' && anchor && Math.hypot(q.x - anchor.x, q.z - anchor.z) > 6500) continue;
      const s = value(world, p, q, d, anchor) + (q === p.prey ? 1.2 : 0);
      if (s > bs) { bs = s; best = q; }
    }
    p.prey = best;
  }
  if (p.prey && p.phase !== 'engage') { p.phase = 'engage'; p.t = 0; }
  if (!p.prey && p.phase === 'engage') p.phase = p.role === 'escort' ? 'escort' : 'cap';

  // ---- station ----
  if (p.phase === 'escort' && !anchor) { p.phase = 'return'; return out; }
  if (p.phase === 'escort') {
    // above and a little ahead of the bombers, weaving so as to stay with them
    const sp = Math.hypot(anchor.vx, anchor.vz) || 80, fx = anchor.vx / sp, fz = anchor.vz / sp;
    const wv = Math.sin(world.time * 0.25 + p.id) * 380;
    const sx = anchor.x + fx * 250 - fz * wv, sz = anchor.z + fz * 250 + fx * wv, sy = anchor.y + 260 + (p.id % 3) * 50;
    const dx = sx - p.x, dz = sz - p.z, d = Math.hypot(dx, dz);
    out.hdg = d > 160 ? Math.atan2(dx, -dz) : Math.atan2(anchor.vx, -anchor.vz);
    out.spd = clamp(sp * 1.25 + d * 0.12, 70, vC);
    out.gam = clamp((sy - p.y) / 700, -0.12, 0.14);
    return out;
  }
  if (p.phase === 'cap') {
    // a circle over the fleet at 1400 m, a radius of 3 km, round the carrier
    const R = 3000, ang = Math.atan2(p.x - ship.x, -(p.z - ship.z));
    const dir = (p.id & 1) ? 1 : -1;
    const ta = ang + dir * 0.5;
    const tx = ship.x + Math.sin(ta) * R, tz = ship.z - Math.cos(ta) * R;
    out.hdg = Math.atan2(tx - p.x, -(tz - p.z));
    out.spd = V_CRUISE_F;
    out.gam = clamp((1400 - p.y) / 600, -0.1, 0.12);
    // a patrol that has seen no enemy for a long while, or has been up long enough, goes home
    if ((p.age - p.t0Air) > 900 || (world.time - (p.lastSeen ?? world.time) > 240)) p.phase = 'return';
    if (hostiles(world, p).some((q) => Math.hypot(q.x - ship.x, q.z - ship.z) < 45000)) p.lastSeen = world.time;
    return out;
  }

  // ---- combat ----
  const q = p.prey;
  const dx0 = q.x - p.x, dy0 = q.y - p.y, dz0 = q.z - p.z, d = Math.hypot(dx0, dy0, dz0);
  const tl = clamp(d / 720, 0, 1.4);
  const ax = q.x + q.vx * tl - p.vx * 0.0, ay = q.y + q.vy * tl + 0.5 * 9.8 * tl * tl * 0.3, az = q.z + q.vz * tl;
  const dx = ax - p.x, dy = ay - p.y, dz = az - p.z, dh = Math.hypot(dx, dz);
  out.hdg = Math.atan2(dx, -dz);
  out.gam = clamp(Math.atan2(dy, Math.max(dh, 1)), -1.0, 0.9);
  out.o = { bankMax: 78 * D2R, pitchRate: 0.85 };
  // speed: close in fast, but not so fast as to overshoot the slow ones
  const qs = Math.hypot(q.vx, q.vz);
  out.spd = d > 900 ? vC : clamp(qs * 1.3 + (d - 150) * 0.1, qs * 1.1 + 12, vC);
  // keep out of the sea
  if (p.y < 45 && out.gam < 0.05 && !(q.y < 70)) out.gam = 0.1;
  if (p.y < 25) out.gam = Math.max(out.gam, 0.12);
  // the angle between the nose and the aiming point
  const fx = Math.sin(p.heading) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.heading) * Math.cos(p.pitch);
  const al = Math.hypot(dx, dy, dz) || 1;
  const cone = Math.acos(clamp((fx * dx + fy * dy + fz * dz) / al, -1, 1));
  p.firing = d < 680 && cone < 0.075 && p.ammo > 0;
  if (p.firing) {
    p.ammo -= BURST_RATE * dt;
    p.burstT = (p.burstT ?? 0) + dt;
    if (!p.wasFiring) world.events.push({ type: 'mgBurst', plane: p, x: p.x, y: p.y, z: p.z });
    world.events.push({ type: 'mgFire', plane: p, target: q, x: p.x + fx * 3, y: p.y + fy * 3 - 0.3, z: p.z + fz * 3, dx: dx / al, dy: dy / al, dz: dz / al, range: d });
    // hits: more likely near, on a bomber, on an aircraft that does not break away
    const pHit = clamp(0.72 - d / 900, 0.05, 0.72) * (q.fighter ? 0.4 : 0.55) * (q.evade > 0 ? 0.5 : 1);
    if (world.rng() < pHit * BURST_RATE * dt) ctx.hit(world, ship, q, 0.3 + world.rng() * 0.15, 12.7);
  }
  p.wasFiring = p.firing;
  // an enemy fighter on our tail: break away
  p.evade = Math.max(0, (p.evade ?? 0) - dt);
  const chaser = q.fighter && q.prey === p && d < 600;
  if (chaser && p.evade <= 0 && world.rng() < dt * 0.6) { p.evade = 1.5 + world.rng() * 1.5; p.evadeSide = world.rng() < 0.5 ? -1 : 1; }
  if (p.evade > 0) {
    out.hdg = p.heading + p.evadeSide * 1.2;
    out.gam = clamp(-0.25 + (p.y < 400 ? 0.4 : 0), -0.3, 0.3);
    out.spd = vC;
    out.o = { bankMax: 80 * D2R, pitchRate: 0.9 };
  }
  // a long chase or no way to close: give up and go back to the station (an escort does not leave the bombers it covers alone for long)
  if (d > 9500 || (p.role === 'escort' && anchor && Math.hypot(p.x - anchor.x, p.z - anchor.z) > 7500)) { p.prey = null; p.phase = p.role === 'escort' ? 'escort' : 'cap'; }
  return out;
}

/** The fields of a fighter (see launches() in sim/aircraft.js). */
export function fighterFields(spec) {
  return { fighter: true, role: 'escort', prey: null, preyT: 0, ammo: AMMO, firing: false, evade: 0, ordnance: false };
}

// ---- the bombers defend themselves -----------------------------------------------------------------------------------------------------
/** Types with a gunner at the back (the torpedo bombers and the two- and three-seat dive bombers). */
const GUNNERS = new Set(['sbd', 'tbf', 'd3a', 'b5n', 'swordfish', 'skua', 'ju87', 'fi167', 'pl10']);

/**
 * Every bomber with a rear gunner fires at the nearest enemy fighter that is within reach and in the gun's field (the rear half-space): the closer it
 * comes, the likelier the hit. Aircraft of a tight formation cover each other. ctx.hit applies the damage.
 */
export function bomberDefense(world, dt, ctx) {
  let fighters = null;
  for (const b of world.planes) {
    if (b.fighter || b.dying || b.hidden || b.gone || b.y < 30 || !GUNNERS.has(b.typeKey)) continue;
    if (!fighters) { fighters = world.planes.filter((q) => q.fighter && !q.dying && !q.hidden && q.y > 30); if (!fighters.length) return; }
    let best = null, bd = 520;
    const fx = Math.sin(b.heading), fz = -Math.cos(b.heading);
    for (const f of fighters) {
      if (f.team === b.team) continue;
      const dx = f.x - b.x, dy = f.y - b.y, dz = f.z - b.z, d = Math.hypot(dx, dy, dz);
      if (d > bd) continue;
      const behind = -(dx * fx + dz * fz) / Math.max(1, d);          // 1: right astern, 0: abeam
      if (behind < 0.15) continue;
      best = f; bd = d;
    }
    if (!best) { b.gunFiring = false; continue; }
    const f = best, dx = f.x - b.x, dy = f.y - b.y, dz = f.z - b.z;
    if (!b.gunFiring) world.events.push({ type: 'mgBurst', plane: b, x: b.x, y: b.y, z: b.z });
    b.gunFiring = true;
    world.events.push({ type: 'mgFire', plane: b, target: f, x: b.x - fx * 3, y: b.y + 0.9, z: b.z - fz * 3, dx: dx / bd, dy: dy / bd, dz: dz / bd, range: bd });
    const pHit = clamp(0.42 - bd / 1300, 0.02, 0.4) * (f.evade > 0 ? 0.6 : 1);
    if (world.rng() < dt * 2.4 * pHit) ctx.hit(world, b.owner, f, 0.2 + world.rng() * 0.1, 7.7, 'gunner');
  }
}

/** The bombers that enemy fighters are after, for a few seconds: they may take shelter under the guns of friendly ships (sim/aircraft.js, phase 'refuge'). */
export function markHunted(world) {
  for (const f of world.planes) {
    const q = f.prey;
    if (!f.fighter || !q || f.dying || q.fighter || q.dying) continue;
    if (Math.hypot(q.x - f.x, q.z - f.z) < 1800) q.hunted = 3;
  }
}
