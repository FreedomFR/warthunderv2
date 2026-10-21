// Carrier fighters. A wave of bombers is escorted by a section of fighters; when enemy aircraft come near the fleet a patrol (CAP) goes up from the
// carrier. A fighter flies its station (over the bombers it escorts, or in a circle over the fleet), picks the enemy aircraft that threatens most,
// closes on it with lead pursuit and fires its machine guns in bursts; the rear gunners of the bombers shoot back. When it has no ammunition left,
// is badly hurt or short of fuel it goes home and lands like the others (sim/aircraft.js, sim/deck.js).
import { clamp, wrapPi, D2R, mat4Ship } from '../math.js';
import { planeGuns, inArc, muzzleOf, GUN_RATE, GUN_DMG } from '../model/planeGuns.js';
import { aaSources, exposure } from './routing.js';
import { perfOf } from './airperf.js';
import { presentedArea, roundHitChance } from './airhit.js';

export const FIGHT_PHASES = new Set(['escort', 'cap', 'engage']);
const STRIKE = new Set(['assemble', 'cruise', 'ip', 'run', 'rollin', 'dive', 'pullout', 'break', 'egress']);
const AMMO = 520;                       // bursts of 1/14 s: about 37 s of fire
const BURST_RATE = 14;
const MG_ROUNDS = 78;                   // rounds a second of the guns of a fighter (six of 12.7 mm)
const MG_DMG = 0.17;

/** Enemy aircraft that are flying (not on a deck, not already falling). */
function hostiles(world, p) {
  const out = [];
  for (const q of world.planes) {
    if (q.team === p.team || q.dying || q.hidden || q.gone || q.ground || q.y < 12 || q.phase === 'floating' || q.phase === 'queue' || q.phase === 'takeoff' || q.phase === 'rollout' || q.phase === 'taxiIn') continue;
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
  const pf = perfOf(p), vC = pf.vcomb || 145, vCruiseF = pf.vc * 1.25;
  const out = { hdg: p.heading, gam: 0, spd: vCruiseF, o: { bankMax: 70 * D2R, pitchRate: 0.7 } };
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
    out.spd = clamp(sp * 1.25 + d * 0.12, pf.vc * 0.8, vC);
    out.gam = clamp((sy - p.y) / 700, -0.12, 0.14);
    out.o = { bankMax: 42 * D2R, pitchRate: 0.5 };         // station keeping is flown gently (the fighter used to rock from bank to bank at 70 degrees)
    return out;
  }
  if (p.phase === 'cap') {
    // a circle over the fleet at 1400 m, a radius of 3 km, round the carrier
    const R = 3000, ang = Math.atan2(p.x - ship.x, -(p.z - ship.z));
    const dir = (p.id & 1) ? 1 : -1;
    const ta = ang + dir * 0.5;
    const tx = ship.x + Math.sin(ta) * R, tz = ship.z - Math.cos(ta) * R;
    out.hdg = Math.atan2(tx - p.x, -(tz - p.z));
    out.spd = vCruiseF;
    out.gam = clamp((1400 - p.y) / 600, -0.1, 0.12);
    out.o = { bankMax: 32 * D2R, pitchRate: 0.4 };
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
  p.firing = d < 680 && cone < 0.05 && p.ammo > 0;
  if (p.firing) {
    p.ammo -= BURST_RATE * dt;
    p.burstT = (p.burstT ?? 0) + dt;
    if (!p.wasFiring) world.events.push({ type: 'mgBurst', plane: p, x: p.x, y: p.y, z: p.z });
    world.events.push({ type: 'mgFire', plane: p, target: q, x: p.x + fx * 3, y: p.y + fy * 3 - 0.3, z: p.z + fz * 3, dx: dx / al, dy: dy / al, dz: dz / al, range: d });
    // hits: the rounds fly along the nose and land in a pattern round it (the guns are fixed: the pilot lays them by flying the aircraft); the target is where it will be when
    // they arrive, so a target that holds its course is hit and one that breaks away is not; what the pattern covers is the area the target shows
    const tof = d / 800, rx = q.x - p.x + (q.vx - p.vx) * tof, ry = q.y - p.y + (q.vy - p.vy) * tof, rz = q.z - p.z + (q.vz - p.vz) * tof;
    const rl = Math.hypot(rx, ry, rz) || 1, along = rx * fx + ry * fy + rz * fz;
    const miss = Math.hypot(rx - fx * along, ry - fy * along, rz - fz * along);
    // a target that is turning away is not where the straight line puts it
    const sigma = 3.6 * 0.001 * rl + 1.0 + (q.evade > 0 ? 12 * tof * tof : 0);
    const area = presentedArea(q, rx / rl, ry / rl, rz / rl);
    const hits = MG_ROUNDS * dt * roundHitChance(area, miss, sigma);
    const n = Math.floor(hits + world.rng());
    if (n > 0) ctx.hit(world, ship, q, MG_DMG * n * (0.8 + 0.4 * world.rng()), 12.7);
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
// Every gun position of a bomber (model/planeGuns.js: the turrets, the flexible guns at the windows and in the rear cockpits) is a gunner of its own: he takes the nearest
// enemy fighter in his field of fire, turns his guns onto where it will be when the rounds get there (a powered turret faster than a gun swung by hand), and fires once
// they are on it. The rounds leave from his muzzle. b.gun[i] = { yaw, pitch } is where his guns point, in the frame of the aircraft (the turrets turn to it in the picture).
const SLEW_TURRET = 1.5, SLEW_HAND = 2.2, SLEW_REST = 0.5;          // rad/s
const REACH = 520;                                                    // m: what a gunner shoots at
const M = new Float64Array(16), _mz = [0, 0, 0];

/** Turn an angle towards a goal by at most `step`. */
const toward = (a, goal, step) => { const d = wrapPi(goal - a); return Math.abs(d) <= step ? goal : a + Math.sign(d) * step; };

/** Every bomber's gunners fire at the enemy fighters within reach and in their fields of fire; ctx.hit applies the damage. */
export function bomberDefense(world, dt, ctx) {
  let fighters = null;
  for (const b of world.planes) {
    if (b.fighter || b.gone || b.hidden) continue;
    const guns = planeGuns(b.spec, b.typeKey);
    if (!guns.length) continue;
    if (!b.gun) b.gun = guns.map((g) => ({ yaw: g.rest[0], pitch: g.rest[1], firing: false }));
    const busy = !b.dying && b.y > 30;
    if (busy && !fighters) fighters = world.planes.filter((q) => q.fighter && !q.dying && !q.hidden && q.y > 30);
    mat4Ship(M, 0, 0, 0, b.heading, (b.pitch || 0) + (b.aoa || 0), b.roll || 0);
    let any = false;
    for (let i = 0; i < guns.length; i++) {
      const g = guns[i], st = b.gun[i];
      // the nearest enemy fighter this gunner can bear on, where it will be when his rounds get there
      let best = null, bd = REACH, by = 0, bp = 0;
      if (busy && fighters.length) {
        for (const f of fighters) {
          if (f.team === b.team) continue;
          const dx = f.x - b.x, dy = f.y - b.y, dz = f.z - b.z, d = Math.hypot(dx, dy, dz);
          if (d > bd) continue;
          const tof = d / 750, ax = dx + (f.vx - b.vx) * tof, ay = dy + (f.vy - b.vy) * tof + 4.9 * tof * tof, az = dz + (f.vz - b.vz) * tof;
          const al = Math.hypot(ax, ay, az) || 1, lx = (ax * M[0] + ay * M[1] + az * M[2]) / al, ly = (ax * M[4] + ay * M[5] + az * M[6]) / al, lz = (ax * M[8] + ay * M[9] + az * M[10]) / al;
          const yaw = Math.atan2(lz, lx), pitch = Math.asin(clamp(ly, -1, 1));
          if (!inArc(g, yaw, pitch)) continue;
          best = f; bd = d; by = yaw; bp = pitch;
        }
      }
      const rate = (best ? (g.turret ? SLEW_TURRET : SLEW_HAND) : SLEW_REST) * dt;
      st.yaw = toward(st.yaw, best ? by : g.rest[0], rate); st.pitch = toward(st.pitch, best ? bp : g.rest[1], rate * 0.8);
      st.firing = false;
      if (!best) continue;
      // he opens fire once his guns are nearly on it (he walks the tracers onto it)
      const err = Math.acos(clamp(Math.cos(st.pitch) * Math.cos(bp) * Math.cos(wrapPi(st.yaw - by)) + Math.sin(st.pitch) * Math.sin(bp), -1, 1));
      if (err > 0.12) continue;
      st.firing = true; any = true;
      const f = best;
      // the muzzle and the line of the guns, in the world
      const mz = muzzleOf(g, st.yaw, st.pitch, _mz), cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const ux = cy * cp, uy = sp, uz = sy * cp;
      const wx = M[0] * ux + M[4] * uy + M[8] * uz, wy = M[1] * ux + M[5] * uy + M[9] * uz, wz = M[2] * ux + M[6] * uy + M[10] * uz;
      world.events.push({ type: 'mgFire', plane: b, target: f, cal: g.cal, n: g.n, x: b.x + M[0] * mz[0] + M[4] * mz[1] + M[8] * mz[2], y: b.y + M[1] * mz[0] + M[5] * mz[1] + M[9] * mz[2],
        z: b.z + M[2] * mz[0] + M[6] * mz[1] + M[10] * mz[2], dx: wx, dy: wy, dz: wz, range: bd });
      // the gunner lays his guns by eye: the lead is never quite right, so a fighter that crosses fast is harder to hit; in a closed-up section the fields of fire overlap
      // (every gunner has a neighbour covering the same sky)
      const dx = f.x - b.x, dy = f.y - b.y, dz = f.z - b.z, tof = bd / 750, rvx = f.vx - b.vx, rvy = f.vy - b.vy, rvz = f.vz - b.vz;
      const rl = Math.hypot(dx, dy, dz) || 1, vx = dx / rl, vy = dy / rl, vz = dz / rl;
      const vc = rvx * vx + rvy * vy + rvz * vz;
      const vperp = Math.hypot(rvx - vc * vx, rvy - vc * vy, rvz - vc * vz);
      const miss = vperp * tof * 0.4;
      const sigma = 6 * 0.001 * rl + 1.2 + (f.evade > 0 ? 14 * tof * tof : 0);
      const area = presentedArea(f, vx, vy, vz);
      const hits = g.n * GUN_RATE(g.cal) * dt * roundHitChance(area, miss, sigma) * (b.tight && b.phase === 'cruise' ? 1.4 : 1);
      const n = Math.floor(hits + world.rng());
      if (n > 0) ctx.hit(world, b.owner, f, GUN_DMG(g.cal) * n * (0.8 + 0.4 * world.rng()), g.cal, 'gunner');
    }
    if (any && !b.gunFiring) world.events.push({ type: 'mgBurst', plane: b, x: b.x, y: b.y, z: b.z });
    b.gunFiring = any;
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
