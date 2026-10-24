// Carrier fighters. A wave of bombers is escorted by a section of fighters; when enemy aircraft come near the fleet a patrol (CAP) goes up from the
// carrier. A fighter flies its station (over the bombers it escorts, or in a circle over the fleet), picks the enemy aircraft that threatens most,
// closes on it, lays its guns on where it will be (the turn it is in included) and fires its machine guns in bursts, breaks away from the enemy on its tail; the rear gunners of the bombers shoot back. When it has no ammunition left,
// is badly hurt or short of fuel it goes home and lands like the others (sim/aircraft.js, sim/deck.js).
import { clamp, wrapPi, D2R, mat4Ship } from '../math.js';
import { planeGuns, inArc, muzzleOf, GUN_RATE } from '../model/planeGuns.js';
import { aaSources, exposure } from './routing.js';
import { perfOf, turnPerf } from './airperf.js';
import { presentedArea, roundHitChance } from './airhit.js';
import { armamentOf, drawRound, beltMean, beltForGun, UNIT, FIXED_GUNS } from '../data/airguns.js';
import { PLANES } from '../model/planes.js';
import { fixedMuzzles } from '../model/fixedGuns.js';

export const FIGHT_PHASES = new Set(['escort', 'cap', 'intercept', 'engage']);
/** What a fighter does when it has no prey: the phase of its role (an escort stays with its bombers, an interceptor flies at the raid, a patrol circles its fleet or its field). */
const idleOf = (p) => (p.role === 'escort' ? 'escort' : p.role === 'intercept' ? 'intercept' : 'cap');
const REACH_INTERCEPT = 60000;      // how far from its field an interceptor goes to meet a raid (m)
const STRIKE = new Set(['assemble', 'cruise', 'ip', 'run', 'rollin', 'dive', 'pullout', 'break', 'egress']);

/** Enemy aircraft that are flying (not on a deck, not already falling). */
function hostiles(world, p) {
  const out = [];
  for (const q of world.planes) {
    if (q.team === p.team || q.dying || q.hidden || q.gone || q.ground || q.y < 12 || q.phase === 'floating' || q.phase === 'queue' || q.phase === 'takeoff' || q.phase === 'rollout' || q.phase === 'taxiIn') continue;
    out.push(q);
  }
  return out;
}

/** The wingman of a fighter: the other of its pair (fighters of one wave and one role go in pairs, in the order they took off), or null when it has lost him. */
function mateOf(world, p) {
  if (p._mateT !== undefined && world.time < p._mateT) return p._mate;
  p._mateT = world.time + 1 + world.rng();
  const grp = p.wave ? p.wave.planes.filter((q) => q.fighter && q.role === p.role && !q.dying && !q.gone) : [];
  const i = grp.indexOf(p), m = i >= 0 ? grp[i ^ 1] : null;
  p._mate = m && m !== p && !m.hidden && m.y > 40 ? m : null;
  return p._mate;
}

/** How much an enemy aircraft is worth attacking now (the fighter p, at distance d from it). */
function value(world, p, q, d, anchor) {
  let sc = 0;
  if (q.fighter) sc += p.role === 'escort' ? 2.6 : p.interceptor ? -0.4 : 1.2;      // (an interceptor is built to kill bombers: it leaves the fighters to the ones that escort them)
  else sc += p.interceptor ? 3.4 : 1.4;
  if (q.phase === 'ip' || q.phase === 'run' || q.phase === 'rollin' || q.phase === 'dive') sc += 3.2;      // the ones that are about to drop
  if (q.ordnance) sc += 1;
  sc -= d / 3500;
  if (p.ban === q && world.time < p.banT) sc -= 8;      // the one it could not catch: for a while it looks elsewhere
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
  if (p.ammo <= 0 || p.cond < 0.3 || p.fuel < 260) { p.phase = 'return'; p.prey = null; return out; }
  if (!ship || !ship.alive || ship.deckWrecked) { p.phase = 'return'; p.prey = null; return out; }

  const anchor = p.role === 'escort' ? escorted(world, p) : null;
  if (p.role === 'escort' && !anchor && p.phase !== 'engage') { p.phase = 'return'; return out; }

  // ---- choose the prey ----
  p.preyT = (p.preyT ?? 0) - dt;
  if (p.prey && (p.prey.dying || p.prey.gone || p.prey.hidden || p.prey.y < 8)) { p.prey = null; p.preyT = 0; }
  if (p.preyT <= 0) {
    p.preyT = 0.8 + world.rng() * 0.6;
    p._srcs = null;
    const detect = p.phase === 'engage' ? 8500 : p.role === 'escort' ? 4800 : p.role === 'intercept' ? 22000 : 15000;
    let best = null, bs = -1e9;
    for (const q of hostiles(world, p)) {
      const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (d > detect) continue;
      // a patrol only goes for aircraft that come near its fleet; an escort for those near the bombers
      if (p.role === 'cap' && Math.hypot(q.x - ship.x, q.z - ship.z) > 26000) continue;
      if (p.role === 'intercept' && Math.hypot(q.x - ship.x, q.z - ship.z) > REACH_INTERCEPT) continue;
      if (p.role === 'escort' && anchor && Math.hypot(q.x - anchor.x, q.z - anchor.z) > 6500) continue;
      const s = value(world, p, q, d, anchor) + (q === p.prey ? 1.2 : 0);
      if (s > bs) { bs = s; best = q; }
    }
    p.prey = best;
  }
  if (p.prey && p.phase !== 'engage') { p.phase = 'engage'; p.t = 0; }
  if (!p.prey && p.phase === 'engage') p.phase = idleOf(p);

  // ---- station ----
  if (p.phase === 'escort' && !anchor) { p.phase = 'return'; return out; }
  if (p.phase === 'escort') {
    // above and a little ahead of the bombers, weaving so as to stay with them
    const sp = Math.hypot(anchor.vx, anchor.vz) || 80, fx = anchor.vx / sp, fz = anchor.vz / sp;
    const wv = Math.sin(world.time * 0.25 + p.id) * 380;
    const ex = anchor.x + fx * 250 - fz * wv, ez = anchor.z + fz * 250 + fx * wv, ey = anchor.y + 260 + (p.id % 3) * 50;
    // (the wingman keeps to his leader, a little behind and to one side, and looks to the side the leader does not)
    const mate = mateOf(world, p), wing = mate && p.id > mate.id && mate.phase === 'escort';
    let sx = ex, sz = ez, sy = ey;
    if (wing) { const mfx = Math.sin(mate.heading), mfz = -Math.cos(mate.heading), side = p.id & 1 ? 1 : -1; sx = mate.x - mfx * 170 + mfz * -side * 230; sz = mate.z - mfz * 170 + mfx * side * 230; sy = mate.y - 20; }
    const dx = sx - p.x, dz = sz - p.z, d = Math.hypot(dx, dz);
    out.hdg = d > 160 ? Math.atan2(dx, -dz) : wing ? mate.heading : Math.atan2(anchor.vx, -anchor.vz);
    out.spd = clamp((wing ? mate.speed : sp * 1.25) + d * 0.12, pf.vc * 0.8, vC);
    out.gam = clamp((sy - p.y) / 700, -0.12, 0.14);
    out.o = { bankMax: 42 * D2R, pitchRate: 0.5 };         // station keeping is flown gently (the fighter used to rock from bank to bank at 70 degrees)
    return out;
  }
  if (p.phase === 'intercept') {
    // an interceptor flies at the raid: the nearest enemy aircraft within reach of its field (the bombers first), led by where it will be, and climbs to be above it when it gets there
    p._intT = (p._intT ?? 0) - dt;
    if (p._intT <= 0 || !p._int || p._int.dying || p._int.gone) {
      p._intT = 2 + world.rng();
      let best = null, bs = 1e9;
      for (const q of hostiles(world, p)) {
        const dd = Math.hypot(q.x - ship.x, q.z - ship.z);
        if (dd > REACH_INTERCEPT) continue;
        const sc = Math.hypot(q.x - p.x, q.z - p.z) * (q.fighter ? 1.8 : 1);
        if (sc < bs) { bs = sc; best = q; }
      }
      p._int = best;
    }
    const q = p._int;
    if (q) {
      p.lastSeen = world.time;
      const dist = Math.hypot(q.x - p.x, q.z - p.z), tof = Math.min(90, dist / Math.max(60, vC * 1.1 + Math.max(0, -((q.vx * (q.x - p.x) + q.vz * (q.z - p.z)) / (dist || 1)))));
      out.hdg = Math.atan2(q.x + q.vx * tof - p.x, -(q.z + q.vz * tof - p.z));
      out.spd = vC * 1.1;
      out.gam = clamp((q.y + 450 - p.y) / Math.max(1500, dist * 0.5), -0.08, 0.2);
      out.o = { bankMax: 60 * D2R, pitchRate: 0.6 };
    } else {
      // nothing left in reach: back to the field
      if (world.time - (p.lastSeen ?? world.time) > 60) p.phase = 'return';
      out.hdg = Math.atan2(ship.x - p.x, -(ship.z - p.z)); out.spd = vCruiseF; out.gam = clamp((1800 - p.y) / 800, -0.1, 0.1); out.o = { bankMax: 35 * D2R, pitchRate: 0.4 };
    }
    if (p.age - p.t0Air > 1500) p.phase = 'return';
    return out;
  }
  if (p.phase === 'cap') {
    // a circle over the fleet at 1400 m, a radius of 3 km, round the carrier
    const R = 3000, ang = Math.atan2(p.x - ship.x, -(p.z - ship.z));
    const dir = (p.id & 1) ? 1 : -1;
    const ta = ang + dir * 0.5;
    let tx = ship.x + Math.sin(ta) * R, tz = ship.z - Math.cos(ta) * R;
    const mate = mateOf(world, p);
    if (mate && p.id > mate.id && mate.phase === 'cap') { const mfx = Math.sin(mate.heading), mfz = -Math.cos(mate.heading), side = p.id & 1 ? 1 : -1; tx = mate.x - mfx * 170 + mfz * -side * 230; tz = mate.z - mfz * 170 + mfx * side * 230; }
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
  return dogfight(world, p, dt, ctx, out, anchor, vC);
}

// ---- the fight itself ---------------------------------------------------------------------------------------------------------------------------------------------------
// A fighter flies one of three attitudes: it ATTACKS (closes on its prey, lays its guns on where the prey will be and fires), it DEFENDS (an enemy is on its tail: it turns hard, the
// ones who can out-turn him into him, so that he overshoots, the others dive away with their speed) or it EXTENDS (draws away from a fight it cannot win by turning, to come back
// with speed). Which of the two a type does is decided by its flight model (turnPerf): a Zero turns tighter than a Hellcat and the Hellcat is faster, so the Zero stays and turns and the
// Hellcat goes for the speed.
const MUZZLE_V = 800;            // m/s, the speed of the rounds along the barrel (the guns are fixed: the pilot lays them by flying the aircraft)
const _A = [0, 0, 0], _B = [0, 0, 0];

/** The acceleration of an aircraft (m/s2, smoothed), from the change of its velocity: what a pilot reads off the way the other one is turning. */
function motion(world, q) {
  const t = world.time;
  if (q._mT === undefined) { q._mT = t; q._mv = [q.vx, q.vy, q.vz]; q._ma = [0, 0, 0]; return q._ma; }
  const dt = t - q._mT;
  if (dt > 0.04) {
    const k = Math.min(1, dt * 3), ma = q._ma, lv = q._mv;
    ma[0] += ((q.vx - lv[0]) / dt - ma[0]) * k; ma[1] += ((q.vy - lv[1]) / dt - ma[1]) * k; ma[2] += ((q.vz - lv[2]) / dt - ma[2]) * k;
    lv[0] = q.vx; lv[1] = q.vy; lv[2] = q.vz; q._mT = t;
  }
  return q._ma;
}

/** The unit vector of the nose. */
const noseOf = (p, out) => { const cp = Math.cos(p.pitch || 0); out[0] = Math.sin(p.heading) * cp; out[1] = Math.sin(p.pitch || 0); out[2] = -Math.cos(p.heading) * cp; return out; };

/**
 * Where to point the guns (relative to the shooter: a vector): the rounds leave with the speed of the shooter added to theirs, so the target must be hit where it will be after the time
 * of flight, with its own motion (and the turn it is in: the acceleration `a`, believed by the pilot to the degree of his skill).
 */
function gunSolution(r, vr, a, skill, out) {
  let t = Math.hypot(r[0], r[1], r[2]) / MUZZLE_V;
  for (let k = 0; k < 2; k++) {
    out[0] = r[0] + vr[0] * t + 0.5 * a[0] * t * t * skill; out[1] = r[1] + vr[1] * t + 0.5 * a[1] * t * t * skill - 0.5 * 9.8 * t * t * 0.3; out[2] = r[2] + vr[2] * t + 0.5 * a[2] * t * t * skill;
    t = Math.hypot(out[0], out[1], out[2]) / MUZZLE_V;
  }
  return out;
}

/** The enemy fighter that has this one in its sights, if any: { f, d, cone }. */
function foeOf(world, p) {
  let best = null;
  for (const f of world.planes) {
    if (!f.fighter || f.team === p.team || f.dying || f.hidden || f.gone || f.prey !== p) continue;
    const dx = p.x - f.x, dy = p.y - f.y, dz = p.z - f.z, d = Math.hypot(dx, dy, dz);
    if (d > 1100) continue;
    const n = noseOf(f, _A), cone = Math.acos(clamp((n[0] * dx + n[1] * dy + n[2] * dz) / (d || 1), -1, 1));
    if (cone > 0.6 || (best && d >= best.d)) continue;
    // (one that is still coming at me from ahead is passed, not turned from: it counts once it is on my side of the beam)
    const n2 = noseOf(p, _B), back = Math.acos(clamp(-(n2[0] * dx + n2[1] * dy + n2[2] * dz) / (d || 1), -1, 1));
    if (back < 1.45) continue;
    best = { f, d, cone };
  }
  return best;
}

function dogfight(world, p, dt, ctx, out, anchor, vC) {
  const ship = p.owner, q = p.prey, pf = perfOf(p), rng = world.rng;
  const tp = turnPerf(p.typeKey, p.spec), isF = !!q.fighter, tq = isF ? turnPerf(q.typeKey, q.spec) : null;
  if (p.skill === undefined) p.skill = 0.7 + 0.3 * rng();
  const qa = motion(world, q);
  const rx = q.x - p.x, ry = q.y - p.y, rz = q.z - p.z, d = Math.hypot(rx, ry, rz) || 1, ux = rx / d, uy = ry / d, uz = rz / d;
  const vrx = q.vx - p.vx, vry = q.vy - p.vy, vrz = q.vz - p.vz, closure = -(ux * vrx + uy * vry + uz * vrz);
  const n = noseOf(p, [0, 0, 0]), ata = Math.acos(clamp(n[0] * ux + n[1] * uy + n[2] * uz, -1, 1));
  const qn = noseOf(q, [0, 0, 0]), aspect = Math.acos(clamp(qn[0] * ux + qn[1] * uy + qn[2] * uz, -1, 1));      // 0: I am dead astern of him
  const qs = Math.hypot(q.vx, q.vz), ps = p.speed;
  const turner = isF && tp.wTurn >= tq.wTurn * 1.03, outturned = isF && tp.wTurn < tq.wTurn * 0.97;

  // ---- who is on my tail ----
  p.foeT = (p.foeT ?? 0) - dt;
  if (p.foeT <= 0) { p.foeT = 0.3; p.foe = foeOf(world, p); }
  let foe = p.foe && p.foe.f.prey === p && !p.foe.f.dying ? p.foe : null;
  // he has to be seen first: a pilot looks ahead and about him, and only now and then over his shoulder; rounds past his tail are seen at once
  if (!foe) p.seen = null;
  else if (p.seen !== foe.f) {
    const lookout = foe.f.firing ? 5 : foe.d < 450 ? 0.9 : 0.35;
    if (rng() < lookout * dt) p.seen = foe.f; else foe = null;
  }
  p.tacT = (p.tacT ?? 0) - dt;
  if (!p.tac) p.tac = 'attack';
  if (foe && p.tac !== 'defend' && !(ata < 0.35 && d < 450 && aspect < 0.5)) {      // (unless I have him in my own sights)
    p.tac = 'defend'; p.tacT = 2.5 + 2 * rng();
    const fx = foe.f.x - p.x, fz = foe.f.z - p.z;
    p.defSide = Math.sin(Math.atan2(fx, -fz) - p.heading) >= 0 ? 1 : -1 ;      // the side he is on
    p.defSide = -Math.sign(wrapPi(p.heading - Math.atan2(fx, -fz))) || 1;
  } else if (p.tac === 'defend' && p.tacT <= 0) { p.tac = foe && foe.d < 480 ? 'defend' : (outturned ? 'extend' : 'attack'); p.tacT = p.tac === 'extend' ? 5 + 3 * rng() : 2 + rng(); }
  else if (p.tac === 'extend' && (p.tacT <= 0 || d > 2000)) { p.tac = 'attack'; p.tacT = 0; }
  // a head-on pass with a fighter that out-turns: draw away, do not turn with it
  if (p.tac === 'attack' && outturned && ps > qs + 12 && ata > 1.3 && d < 900 && aspect > 1.2 && closure < 0) { p.tac = 'extend'; p.tacT = 6 + 3 * rng(); }
  p.evade = p.tac === 'defend' ? Math.max(p.evade ?? 0, 0.4) : Math.max(0, (p.evade ?? 0) - dt);

  const bank = pf.bank * D2R, pr = pf.pr * 1.1;
  out.o = { bankMax: bank, pitchRate: pr };
  p.firing = false;
  if (p.tac === 'defend') {
    const fa = Math.atan2(foe ? foe.f.x - p.x : -rx, foe ? -(foe.f.z - p.z) : rz);
    if (!outturned) {
      // into him, level, at the speed the wing turns best at: he cannot hold his nose on me round the circle and goes by
      out.hdg = p.heading + p.defSide * 1.8; out.gam = p.y < 450 ? 0.1 : 0; out.spd = tp.vTurn + 6;
    } else {
      // he turns better: down and away with the speed (the Hellcat's answer to a Zero), a jink on the way
      out.hdg = fa + Math.PI + p.defSide * 0.7; out.gam = p.y > 700 ? -0.45 : 0.02; out.spd = pf.vmax * 0.95;
    }
    if (p.y < 25) out.gam = Math.max(out.gam, 0.12);
    return finishFight(world, p, out, q, d, anchor);
  }
  if (p.tac === 'extend') {
    out.hdg = Math.atan2(-rx, rz) + Math.sin(world.time * 0.7 + p.id) * 0.5;
    out.gam = ps > pf.vmax * 0.82 && p.y < 3200 ? 0.28 : (p.y > 900 ? -0.08 : 0.04);      // with the speed in hand, up (the zoom): height to come back from
    out.spd = pf.vmax * 0.95; out.o = { bankMax: 60 * D2R, pitchRate: pr };
    if (p.y < 25) out.gam = Math.max(out.gam, 0.12);
    return finishFight(world, p, out, q, d, anchor);
  }

  // ---- a chase that gains nothing is let go (the faster one is gone; the escort goes back to its bombers, the patrol to its fleet) ----
  p.chaseT = d > 450 && closure < 3 ? (p.chaseT ?? 0) + dt : 0;
  if (p.chaseT > 9) { p.chaseT = 0; p.ban = q; p.banT = world.time + 20; p.prey = null; p.tac = 'attack'; p.phase = idleOf(p); return out; }

  // ---- attack: the guns on where he will be ----
  const rel = [rx, ry, rz], vrel = [vrx, vry, vrz], aim = gunSolution(rel, vrel, qa, p.skill, [0, 0, 0]);
  const al = Math.hypot(aim[0], aim[1], aim[2]) || 1;
  // steering: far off, a course that meets him (the pursuit curve that closes); near, the gun solution itself
  let sx = aim[0], sy = aim[1], sz = aim[2];
  if (d > 500) {
    const k = clamp((d - 500) / 500, 0, 1), tl = clamp(d / Math.max(ps + 60, 80), 0.6, 2.6), hh = 0.5 * tl * tl * p.skill, mx = rx + q.vx * tl + qa[0] * hh - p.vx * tl * 0.1, my = ry + q.vy * tl + qa[1] * hh, mz = rz + q.vz * tl + qa[2] * hh - p.vz * tl * 0.1;
    sx += (mx - sx) * k; sy += (my - sy) * k; sz += (mz - sz) * k;
  }
  out.hdg = Math.atan2(sx, -sz);
  out.gam = clamp(Math.atan2(sy, Math.max(Math.hypot(sx, sz), 1)), -1.0, 0.9);
  // speed: close in fast; in the last hundreds of metres match him (a turning fight is flown at the speed the wing turns best at)
  const hard = isF && (q.load ?? 1) > 2.8;
  out.spd = d > 1100 ? vC : hard && (turner || !outturned) ? tp.vTurn + 8 : clamp(qs * 1.15 + (d - 250) * 0.06, Math.max(qs * 1.05 + 8, tp.vTurn), vC);
  // too fast for the range: over the top (the high yo-yo) instead of past him
  if (closure > 50 && d < 420 && ata < 0.8) { out.gam = Math.max(out.gam, 0.35); out.spd = tp.vTurn + 5; }
  if (p.y < 45 && out.gam < 0.05 && !(q.y < 70)) out.gam = 0.1;
  if (p.y < 25) out.gam = Math.max(out.gam, 0.12);
  // the guns
  const cone = Math.acos(clamp((n[0] * aim[0] + n[1] * aim[1] + n[2] * aim[2]) / al, -1, 1));
  // (he opens fire when the rounds would hit: the chance that the pattern, laid where the guns point, covers him)
  const guns = p.guns || (p.guns = armament(p.typeKey));
  let rps = 0;
  for (const g of guns) if (g.left > 0) rps += g.rps;
  if (d < 560 && d > 50 && cone < 0.12 && rps > 0) {
    const sg = 3.6 * 0.001 * d + 1.0 + 0.003 * d * Math.max(0, (p.load ?? 1) - 3), ar = presentedArea(q, ux, uy, uz);
    p.firing = rps * roundHitChance(ar, d * Math.sin(cone), sg) > 1.0;
  }
  if (p.firing) {
    if (!p.wasFiring) world.events.push({ type: 'mgBurst', plane: p, x: p.x, y: p.y, z: p.z });
    // where the target really is when the rounds arrive (with the turn it is in), against where the guns point: a target that holds its turn is hit by a pilot who read it, one that
    // changes it is not; the pattern is wider the harder the shooter is pulling, and for a target that is jinking
    const tof = d / MUZZLE_V, hx = rx + vrx * tof + 0.5 * qa[0] * tof * tof, hy = ry + vry * tof + 0.5 * qa[1] * tof * tof - 0.5 * 9.8 * tof * tof * 0.3, hz = rz + vrz * tof + 0.5 * qa[2] * tof * tof;
    shootFixed(world, p, q, dt, ctx, hx, hy, hz, tof, aim, al, d);
    p.ammo = ammoLeft(guns);
  }
  p.wasFiring = p.firing;
  return finishFight(world, p, out, q, d, anchor);
}

/** The fixed guns of a type with the place of every muzzle (model/fixedGuns.js): the groups of data/airguns.js, full. */
export function armament(typeKey) {
  const groups = armamentOf(typeKey), spec = PLANES[typeKey];
  if (!groups.length || !spec) return groups;
  const mz = fixedMuzzles(spec, typeKey);
  groups.forEach((g, i) => { g.mz = mz[i].guns; g.conv = mz[i].conv; });
  return groups;
}

const _FM = new Float64Array(16);
/**
 * Every fixed gun of p fires at q for dt seconds. Each gun has its own line: from its muzzle, in the wing or over the engine, to the point where the guns are harmonised on the axis of
 * the aircraft, so a wing gun's rounds cross the axis at that distance and pass to one side of it nearer and farther. The chance that a round hits is that of the pattern round this
 * gun's line (the same law as before: the area presented by the target against the spread of the rounds). (hx, hy, hz): where the target will be when the rounds get there, relative
 * to the shooter; aim: the pilot's solution (the event carries it as the general direction); d: the range.
 */
function shootFixed(world, p, q, dt, ctx, hx, hy, hz, tof, aim, al, d) {
  const rng = world.rng, guns = p.guns, ship = p.owner;
  mat4Ship(_FM, 0, 0, 0, p.heading, p.pitch || 0, p.roll || 0);
  const M = _FM;
  for (const g of guns) {
    if (g.left <= 0) continue;
    g.left = Math.max(0, g.left - g.rps / g.n * dt);
    const lines = [], perGun = g.rps / g.n * dt;
    let expect = 0;
    for (const m of g.mz || [[0, 0, 0]]) {
      const mx = m.x ?? m[0], my = m.y ?? m[1], mzz = m.z ?? m[2];
      // the muzzle in the world (relative to the aircraft's centre) and the line of this gun
      const wx = M[0] * mx + M[4] * my + M[8] * mzz, wy = M[1] * mx + M[5] * my + M[9] * mzz, wz = M[2] * mx + M[6] * my + M[10] * mzz;
      const lx = (g.conv || 250) - mx, ly = -my, lz = -mzz, ll = Math.hypot(lx, ly, lz) || 1;
      const dx = (M[0] * lx + M[4] * ly + M[8] * lz) / ll, dy = (M[1] * lx + M[5] * ly + M[9] * lz) / ll, dz = (M[2] * lx + M[6] * ly + M[10] * lz) / ll;
      const vx = hx - wx, vy = hy - wy, vz = hz - wz, along = vx * dx + vy * dy + vz * dz;
      lines.push(p.x + wx, p.y + wy, p.z + wz, dx, dy, dz);
      if (along <= 5) continue;
      const miss = Math.hypot(vx - dx * along, vy - dy * along, vz - dz * along);
      const sigma = 3.6 * 0.001 * along + 1.0 + (q.evade > 0 ? 9 * tof * tof : 0) + 0.003 * along * Math.max(0, (p.load ?? 1) - 3);
      const hl = Math.hypot(hx, hy, hz) || 1;
      expect += perGun * roundHitChance(presentedArea(q, hx / hl, hy / hl, hz / hl), miss, sigma);
    }
    world.events.push({ type: 'mgFire', plane: p, target: q, cal: g.cal, n: g.n, x: p.x, y: p.y, z: p.z, dx: aim[0] / al, dy: aim[1] / al, dz: aim[2] / al, range: d, guns: lines });
    const nh = Math.floor(expect + rng());
    for (let k = 0; k < nh; k++) { const a = drawRound(g.belt, rng); ctx.hit(world, ship, q, UNIT * a.dmg * (0.8 + 0.4 * rng()), a.cal, 'gun', a); }
  }
}

// ---- the fixed guns of the other aircraft -----------------------------------------------------------------------------------------------------
// A dive bomber, a torpedo bomber or a bomber with a fixed gun does not hunt: it flies its attack. But its guns fire ahead, so an enemy aircraft that crosses its nose within reach is
// shot at (the pilot pulls the trigger when the sight is on it, but never turns for it), and a dive bomber strafes the ship it dives on from the moment it is committed.
const STRAFE_FROM = 1500, STRAFE_TO = 380;          // m: the slant range at which a diving pilot opens and stops firing
const _SA = [0, 0, 0];

/** Fire the fixed guns of the strike aircraft: at an enemy aircraft ahead of the nose, else at the ship of the dive. */
export function strikeGuns(world, dt, ctx) {
  for (const p of world.planes) {
    if (p.fighter || p.dying || p.gone || p.hidden || p.y < 30 || !FIXED_GUNS[p.typeKey]) continue;
    const guns = p.guns || (p.guns = armament(p.typeKey));
    let rps = 0;
    for (const g of guns) if (g.left > 0) rps += g.rps;
    const was = p.firing;
    p.firing = false;
    if (!rps) continue;
    // an enemy aircraft in the sights: looked for a few times a second
    p.fxT = (p.fxT ?? 0) - dt;
    if (p.fxT <= 0) {
      p.fxT = 0.2 + world.rng() * 0.1; p.fxQ = null;
      const n = noseOf(p, _A);
      let best = 0.1;
      for (const q of world.planes) {
        if (q.team === p.team || q.dying || q.hidden || q.gone || q.ground || q.y < 12 || q.phase === 'floating' || q.phase === 'queue') continue;
        const rx = q.x - p.x, ry = q.y - p.y, rz = q.z - p.z, d = Math.hypot(rx, ry, rz);
        if (d > 520 || d < 40) continue;
        const aim = gunSolution([rx, ry, rz], [q.vx - p.vx, q.vy - p.vy, q.vz - p.vz], motion(world, q), 0.5, _SA), al = Math.hypot(aim[0], aim[1], aim[2]) || 1;
        const cone = Math.acos(clamp((n[0] * aim[0] + n[1] * aim[1] + n[2] * aim[2]) / al, -1, 1));
        if (cone < best) { best = cone; p.fxQ = q; }
      }
    }
    const q = p.fxQ;
    if (q && !q.dying && !q.gone && !q.hidden) {
      const rx = q.x - p.x, ry = q.y - p.y, rz = q.z - p.z, d = Math.hypot(rx, ry, rz) || 1;
      if (d < 560 && d > 40) {
        const vrx = q.vx - p.vx, vry = q.vy - p.vy, vrz = q.vz - p.vz, qa = motion(world, q);
        const aim = gunSolution([rx, ry, rz], [vrx, vry, vrz], qa, 0.5, [0, 0, 0]), al = Math.hypot(aim[0], aim[1], aim[2]) || 1, n = noseOf(p, _A);
        const cone = Math.acos(clamp((n[0] * aim[0] + n[1] * aim[1] + n[2] * aim[2]) / al, -1, 1));
        if (cone < 0.12) {
          p.firing = true;
          if (!was) world.events.push({ type: 'mgBurst', plane: p, x: p.x, y: p.y, z: p.z });
          const tof = d / MUZZLE_V, hx = rx + vrx * tof + 0.5 * qa[0] * tof * tof, hy = ry + vry * tof + 0.5 * qa[1] * tof * tof - 0.5 * 9.8 * tof * tof * 0.3, hz = rz + vrz * tof + 0.5 * qa[2] * tof * tof;
          shootFixed(world, p, q, dt, ctx, hx, hy, hz, tof, aim, al, d);
          continue;
        }
      }
      p.fxQ = null;
    }
    // the dive: the ship it is diving on, from far above, with the nose on it
    const t = p.target;
    if (p.phase === 'dive' && p.kind === 'dive' && t && t.alive && (p.pitch || 0) < -0.35) {
      const rx = t.x - p.x, ry = 12 - p.y, rz = t.z - p.z, d = Math.hypot(rx, ry, rz) || 1;
      const n = noseOf(p, _A), cone = Math.acos(clamp((n[0] * rx + n[1] * ry + n[2] * rz) / d, -1, 1));
      if (d < STRAFE_FROM && d > STRAFE_TO && cone < 0.1) {
        p.firing = true;
        if (!was) world.events.push({ type: 'mgBurst', plane: p, x: p.x, y: p.y, z: p.z });
        strafe(world, p, dt, rx / d, ry / d, rz / d, d);
      }
    }
  }
}

/** The guns of p fire along their lines (no target that takes damage: the rounds go on to the water, where they raise plumes). */
function strafe(world, p, dt, ux, uy, uz, d) {
  mat4Ship(_FM, 0, 0, 0, p.heading, p.pitch || 0, p.roll || 0);
  const M = _FM;
  for (const g of p.guns) {
    if (g.left <= 0) continue;
    g.left = Math.max(0, g.left - g.rps / g.n * dt);
    const lines = [];
    for (const m of g.mz || [{ x: 0, y: 0, z: 0 }]) {
      const wx = M[0] * m.x + M[4] * m.y + M[8] * m.z, wy = M[1] * m.x + M[5] * m.y + M[9] * m.z, wz = M[2] * m.x + M[6] * m.y + M[10] * m.z;
      const lx = (g.conv || 250) - m.x, ly = -m.y, lz = -m.z, ll = Math.hypot(lx, ly, lz) || 1;
      lines.push(p.x + wx, p.y + wy, p.z + wz, (M[0] * lx + M[4] * ly + M[8] * lz) / ll, (M[1] * lx + M[5] * ly + M[9] * lz) / ll, (M[2] * lx + M[6] * ly + M[10] * lz) / ll);
    }
    world.events.push({ type: 'mgFire', plane: p, target: null, cal: g.cal, n: g.n, x: p.x, y: p.y, z: p.z, dx: ux, dy: uy, dz: uz, range: d, guns: lines });
  }
}

/** The end of a tick of the fight: a long chase or no way to close, and the prey is let go. */
function finishFight(world, p, out, q, d, anchor) {
  if (d > 9500 || (p.role === 'escort' && anchor && Math.hypot(p.x - anchor.x, p.z - anchor.z) > 7500)) { p.prey = null; p.tac = 'attack'; p.phase = idleOf(p); }
  return out;
}

/** What is left to fire: the damage of the rounds that remain in the guns (it is 0 when the guns are empty: the fighter goes home). */
export function ammoLeft(guns) { let t = 0; for (const g of guns) t += g.left * g.n * beltMean(g.belt).dmg; return t; }

/** The fields of a fighter (see launches() in sim/aircraft.js): its guns are those of its type, full. */
export function fighterFields(spec, typeKey) {
  const guns = armament(typeKey);
  return { fighter: true, role: 'escort', prey: null, preyT: 0, guns, ammo: ammoLeft(guns), firing: false, evade: 0, ordnance: false };
}

/** The guns are filled again (the aircraft is serviced). */
export function rearm(p) { p.guns = armament(p.typeKey); p.ammo = ammoLeft(p.guns); }

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
      if (n > 0) {
        // (what a gunner's round does depends on the gun: a rifle-calibre ball round is a pinprick, a .50 API round a hit, a 20 mm cannon shell three)
        const belt = beltForGun(g.cal, b.spec.nation);
        for (let k = 0; k < n; k++) { const a = drawRound(belt, world.rng); ctx.hit(world, b.owner, f, UNIT * a.dmg * (0.8 + 0.4 * world.rng()), g.cal, 'gunner', a); }
      }
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
