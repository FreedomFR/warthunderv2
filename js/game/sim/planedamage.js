// What happens to an aircraft that is hit and dies: damage and the place it smokes or burns from, the loss of an engine, the death throes (the fall, the pieces that come off),
// the collision with a ship, the ditching and the crash.
import { clamp, wrapPi, G } from '../math.js';
import { damageSites } from '../model/planes.js';
import { planeDmg } from '../data/balance.js';
import { DECK_PHASES } from './deck.js';
import { segmentNearShip, segmentHit, resolveCrashHit } from './damage.js';
import { spawnPlaneDebris, spawnScrap } from './debris.js';
import { killGroundPlane } from './airfield.js';
import { setVel } from './flight.js';
import { perfOf } from './airperf.js';

const _prev = [0, 0, 0];

// How much of the airframe each part is worth, against the type's `hp` (its toughness, as the spec sheets give it): a part is lost when it has taken that much.
const FRAC = { wing: 0.3, tail: 0.22, body: 0.5, fuel: 0.3, pilot: 0.3, ctl: 0.2, eng: 0.34 };

/**
 * The parts of an aircraft that can be hit: both wings, the tail, the fuselage, the engines, the fuel, the pilot and the controls, each with what it can take. An aircraft has no
 * pool of hit points: it falls when a wing or the tail comes off, the pilot is killed, the fuselage breaks up, the controls are gone, or a fire burns on.
 */
export function planeParts(p) {
  if (p.parts) return p.parts;
  const u = (p.spec.hp || 3) * 1.55, n = p.spec.engines ? p.spec.engines.length : 1, heavy = p.spec.role === 'level' ? 1 : 0;
  const mk = (f) => ({ hp: u * f, max: u * f });
  // (a heavy bomber's crew sit in several places, behind armour, and its controls are doubled)
  return (p.parts = { wingL: mk(FRAC.wing), wingR: mk(FRAC.wing), tail: mk(FRAC.tail * (1 + 0.3 * heavy)), body: mk(FRAC.body), fuel: mk(FRAC.fuel), pilot: mk(FRAC.pilot * (1 + 1.5 * heavy)), ctl: mk(FRAC.ctl * (1 + 0.6 * heavy)), eng: Array.from({ length: n }, () => mk(FRAC.eng * (n > 1 ? 0.8 : 1))) });
}
const frac = (q) => Math.max(0, q.hp / q.max);

/** How fit the aircraft is to go on, 0..1 (for the choices of the pilots: a hurt aircraft goes home): the worst of its parts. Not a pool of hit points. */
export function planeCondition(p) {
  const P = p.parts;
  if (!P) return 1;
  let worst = Math.min(frac(P.body), frac(P.pilot), frac(P.wingL) * 1.15, frac(P.wingR) * 1.15, frac(P.tail) * 1.15, frac(P.ctl) * 1.2);
  if (p.lost && p.lost.engine) worst = Math.min(worst, 0.4);
  if (p.fire > 0) worst = Math.min(worst, 0.35);
  return Math.max(0, Math.min(1, worst));
}

/** What the damage does to the flying: less lift, slower roll and pitch, a wing that drops. Read by sim/flight.js. */
function setFlightDamage(p) {
  const P = p.parts, l = frac(P.wingL), r = frac(P.wingR), t = frac(P.tail), c = frac(P.ctl);
  p.fd = { lift: 1 - 0.3 * (1 - l) - 0.3 * (1 - r), roll: Math.max(0.25, 1 - 0.55 * (1 - Math.min(l, r)) - 0.5 * (1 - c)), pitch: Math.max(0.3, 1 - 0.6 * (1 - t) - 0.5 * (1 - c)), bias: (r - l) * 0.22 };
  p.cond = planeCondition(p);
}

/** Where a round lands on the aircraft, from where it is shot: the nose (engine, pilot) head on, the tail from behind, the wings from the side and below. */
function pickPart(world, p, shooter) {
  let w = { wingL: 0.2, wingR: 0.2, body: 0.22, eng: 0.16, tail: 0.1, pilot: 0.02, fuel: 0.05, ctl: 0.04 };
  if (shooter && shooter.x != null) {
    const dx = shooter.x - p.x, dz = shooter.z - p.z, d = Math.hypot(dx, dz) || 1;
    const c = (dx * Math.sin(p.heading) - dz * Math.cos(p.heading)) / d;        // > 0: in front of the aircraft
    const side = (dx * Math.cos(p.heading) + dz * Math.sin(p.heading)) / d;      // > 0: to starboard
    if (c > 0.55) w = { wingL: 0.12, wingR: 0.12, body: 0.2, eng: 0.36, tail: 0.04, pilot: 0.05, fuel: 0.05, ctl: 0.04 };
    else if (c < -0.55) w = { wingL: 0.11, wingR: 0.11, body: 0.3, eng: 0.07, tail: 0.24, pilot: 0.03, fuel: 0.06, ctl: 0.04 };
    else if (side > 0.3) w.wingR += 0.12; else if (side < -0.3) w.wingL += 0.12;
  }
  let r = world.rng() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) { r -= w[k]; if (r <= 0) return k; }
  return 'body';
}

/** The AA shot connects: it hits a part of the aircraft, which may be lost, and with it the aircraft. */
export function hitPlane(world, ship, p, dmg, cal, cause = 'aa', ammo = null) {
  if (p.dying || p.phase === 'floating') return;
  dmg *= planeDmg(cause);          // the multiplier of data/balance.js
  if (dmg <= 0) return;
  const P = planeParts(p);
  world.events.push({ type: 'planeHit', plane: p, ship, x: p.x, y: p.y, z: p.z, cal, dmg });
  if (p.invulnerable) return;
  if (ship) p.lastShooter = ship;
  hitPlanePart(world, ship, p, pickPart(world, p, ship), dmg, cause, -1, ammo);
}

/** A hit on a named part ('wingL', 'wingR', 'tail', 'eng', 'pilot', 'fuel', 'ctl', 'body'): what it does to that part and to the ones behind it, and what comes of it. */
export function hitPlanePart(world, ship, p, key, dmg, cause = 'aa', engine = -1, ammo = null) {
  if (p.dying || p.phase === 'floating') return;
  const P = planeParts(p);
  const k = key === 'eng' ? (engine >= 0 ? engine : Math.floor(world.rng() * P.eng.length)) : 0;
  // a burst may touch several parts: the main one takes it all, the others what the airframe passes on (the fuselage to the pilot, the fuel and the controls; the wing to its tank)
  const give = (q, d, why) => { if (q.hp > 0) { q.hp -= d; return q.hp <= 0 ? why : null; } return null; };
  const lost = [];
  const note = (r) => { if (r) lost.push(r); };
  switch (key) {
    case 'wingL': note(give(P.wingL, dmg, 'wingL')); note(give(P.fuel, dmg * 0.3 * world.rng(), 'fuel')); note(give(P.ctl, dmg * 0.12, 'ctl')); break;
    case 'wingR': note(give(P.wingR, dmg, 'wingR')); note(give(P.fuel, dmg * 0.3 * world.rng(), 'fuel')); note(give(P.ctl, dmg * 0.12, 'ctl')); break;
    case 'tail': note(give(P.tail, dmg, 'tail')); note(give(P.ctl, dmg * 0.4, 'ctl')); break;
    case 'eng': note(give(P.eng[k], dmg, 'eng' + k)); note(give(P.fuel, dmg * 0.25 * world.rng(), 'fuel')); note(give(P.body, dmg * 0.2, 'body')); break;
    case 'pilot': note(give(P.pilot, dmg * 1.6, 'pilot')); note(give(P.body, dmg * 0.4, 'body')); break;
    case 'fuel': note(give(P.fuel, dmg * 1.4, 'fuel')); note(give(P.body, dmg * 0.4, 'body')); break;
    case 'ctl': note(give(P.ctl, dmg * 1.3, 'ctl')); note(give(P.body, dmg * 0.4, 'body')); break;
    default:
      note(give(P.body, dmg, 'body'));
      if (world.rng() < 0.2) note(give(P.pilot, dmg * 0.6, 'pilot'));
      if (world.rng() < 0.4) note(give(P.fuel, dmg * 0.6, 'fuel'));
      if (world.rng() < 0.3) note(give(P.ctl, dmg * 0.7, 'ctl'));
  }
  // what the round was (data/airguns.js): the filler of a high-explosive round hurts the parts next to the one it hit, and an incendiary or high-explosive round that lands in the fuel
  // (the tank, the roots of the wings, the feed of the engine) may set it alight: the chance of its kind, half as much with the self-sealing tanks of the American, British and
  // German aircraft, which close on the hole
  if (ammo && p.parts) {
    if (ammo.blast > 0) {
      const near = [P.body, P.fuel, P.ctl, P.wingL, P.wingR, P.tail][Math.floor(world.rng() * 6)];
      if (near && near.hp > 0) { near.hp -= ammo.blast * 0.012; if (near.hp <= 0 && near === P.body) lost.push('body'); }
    }
    const tank = key === 'fuel' ? 1 : key === 'wingL' || key === 'wingR' ? 0.3 : key === 'eng' ? 0.35 : key === 'body' ? 0.2 : 0;
    const sealed = p.spec.nation === 'USA' || p.spec.nation === 'UK' || p.spec.nation === 'Germany' ? 0.5 : 1;
    if (tank && !p.fire && !p.fireOut && world.rng() < ammo.fire * tank * sealed) ignite(world, p);
  }
  setFlightDamage(p);
  // where it smokes and where it burns: an engine, or the root of a wing (the fuel); the smoke and the flames of the picture come from there (render/fx/air.js)
  const f = p.cond;
  if (f < 0.75 && p.smoke < 0.4) { p.smoke = 0.4 + world.rng() * 0.3; p.smokeSite = damageSite(world, p, false); }
  if (frac(P.fuel) < 0.55 && !p.fire && !p.fireOut && world.rng() < 0.5 + 0.4 * (1 - frac(P.fuel))) ignite(world, p);
  for (const what of lost) {
    if (p.dying) break;
    p.lostTo = what;      // (what brought it down: the part it lost)
    if (what === 'wingL' || what === 'wingR') { killPlane(world, p, cause, ship, 'wing', what); if (ship && cause === 'aa') ship.aaKills++; }
    else if (what === 'tail') { breakPiece(world, p, 'tail'); killPlane(world, p, cause, ship, world.rng() < 0.6 ? 'spin' : 'tumble'); if (ship && cause === 'aa') ship.aaKills++; }
    else if (what === 'body') { killPlane(world, p, cause, ship, 'explode'); if (ship && cause === 'aa') ship.aaKills++; }
    else if (what === 'pilot') { killPlane(world, p, cause, ship, 'dive'); if (ship && cause === 'aa') ship.aaKills++; }
    else if (what === 'ctl') { p.ctlOut = p.ctlOut ?? world.rng() * 5 + 1.5; }
    else if (what === 'fuel') { if (!p.fire && !p.fireOut && world.rng() < 0.6) ignite(world, p); }
    else if (what.startsWith('eng')) { loseEngine(world, p, +what.slice(3)); world.events.push({ type: 'planeEngineOut', plane: p }); }
  }
}

/** A fire starts (the fuel, an engine): it grows, and unless it goes out it brings the aircraft down (see tickPlaneDamage). */
function ignite(world, p) {
  p.fire = 0.4; p.fireSite = damageSite(world, p, true); p.fireT = 0;
  p.fireKill = 14 + world.rng() * 26;                         // seconds the airframe lasts in it
  p.fireOutT = world.rng() < 0.4 ? 4 + world.rng() * 8 : Infinity;     // a pilot who dives and sideslips may blow it out
  if (p.fireSite.eng >= 0 && p.spec.engines) { p.engFire = p.engFire || new Array(p.spec.engines.length).fill(0); p.engFire[p.fireSite.eng] = 0.7; }
}

/** What goes on in a damaged aircraft that is still flying: the fire (it burns out the airframe, or goes out), the controls that fail. */
export function tickPlaneDamage(world, p, dt) {
  if (p.dying || !p.parts) return;
  if (p.fire > 0 && p.fireKill != null) {
    p.fireT += dt;
    p.fire = Math.min(1, 0.4 + p.fireT / p.fireKill * 0.6);
    if (p.fireT > p.fireOutT) { p.fire = 0; p.fireOut = true; p.fireKill = null; if (p.engFire) p.engFire.fill(0); p.smoke = Math.max(p.smoke, 0.6); }
    else if (p.fireT > p.fireKill) { p.lostTo = 'fire'; killPlane(world, p, 'fire', p.lastShooter || null, world.rng() < 0.5 ? 'explode' : 'spin'); return; }
  }
  if (p.ctlOut != null) { p.ctlOut -= dt; if (p.ctlOut <= 0) { p.ctlOut = null; p.lostTo = 'ctl'; killPlane(world, p, 'gun', null, 'spin'); } }
  // a bomber low on fuel from a holed tank goes home early: the range left falls with the fuel lost
  if (p.parts.fuel.hp < p.parts.fuel.max * 0.5) p.fuel -= dt * 0.6 * (1 - frac(p.parts.fuel));
}

/** The aircraft is repaired on the deck or the ground: parts are made good, the fire is out. */
export function repairPlane(p) {
  if (!p.parts) return;
  for (const q of [p.parts.wingL, p.parts.wingR, p.parts.tail, p.parts.body, p.parts.fuel, p.parts.pilot, p.parts.ctl, ...p.parts.eng]) q.hp = Math.max(q.hp, q.max * 0.85);
  p.fire = 0; p.fireOut = false; p.fireKill = null; p.ctlOut = null; p.lost = { ...p.lost, engine: false, engines: null, tail: false, wingL: false, wingR: false };
  setFlightDamage(p);
}

/**
 * A place on the aircraft that is hit: { x, y, z (the model's frame), eng (the index of the engine, or -1) }. Of a multi-engine aircraft the engine that is already lost, else
 * one of them (or the wing beside it); of a single-engine one, mostly the engine, else the root of a wing (the fuel), now and then the fuselage tank.
 */
function damageSite(world, p, fire) {
  const D = damageSites(p.spec), n = D.engines.length, r = world.rng();
  if (n > 1) {
    const lost = p.lost.engines ? p.lost.engines.findIndex(Boolean) : -1, k = lost >= 0 && r < 0.6 ? lost : Math.floor(world.rng() * n);
    const e = D.engines[k];
    if (r > 0.7) { const w = e.z < 0 ? D.wings.L : D.wings.R; return { x: w.x, y: w.y, z: w.z, eng: -1 }; }
    return { ...e, eng: k };
  }
  if (r < 0.6) return { ...D.engines[0], eng: 0 };
  if (r < 0.9) { const w = world.rng() < 0.5 ? D.wings.L : D.wings.R; return { x: w.x, y: w.y, z: w.z, eng: -1 }; }
  return { x: -0.3, y: 0.1, z: 0, eng: -1 };
}

/** An engine is lost: one of a multi-engine aircraft's (the others go on), the only one of a single-engine aircraft's. Smoke comes from it, and a fire that starts burns it. */
function loseEngine(world, p, which = -1) {
  const D = damageSites(p.spec), n = D.engines.length;
  if (n > 1) {
    p.lost.engines = p.lost.engines || new Array(n).fill(false);
    const free = p.lost.engines.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const k = which >= 0 && !p.lost.engines[which] ? which : free[Math.floor(world.rng() * free.length)];
    p.lost.engines[k] = true;
    p.smokeSite = { ...D.engines[k], eng: k };
    if (p.lost.engines.every(Boolean)) p.lost.engine = true;
  } else { p.lost.engine = true; p.smokeSite = { ...D.engines[0], eng: 0 }; }
  p.smoke = Math.max(p.smoke, 1);
}

/** Start the death throes of an aircraft: it falls and burns, and the crash is seen to the end. */
export function killPlane(world, p, cause, attacker, forceMode = null, piece = null) {
  const rng = world.rng;
  if (p.dying) return;
  if (p.ground && p.base) { killGroundPlane(world, p.base, p, attacker, cause); return; }
  p.dying = true; p.dyingT = 0; p.cause = cause;
  if (DECK_PHASES.has(p.phase)) { p.dying = false; return; }
  p.owner && (p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1);
  if (attacker && attacker !== p.owner) attacker.planeKills = (attacker.planeKills || 0) + 1;
  const r = rng();
  let mode;
  if (forceMode) mode = forceMode;
  else if (cause === 'blast') mode = r < 0.5 ? 'tumble' : 'explode';
  else mode = r < 0.27 ? 'spin' : r < 0.5 ? 'dive' : r < 0.7 ? 'wing' : r < 0.85 ? 'glide' : 'explode';
  if (mode === 'explode' && !p.ordnance && !forceMode && rng() < 0.5) mode = 'spin';
  p.mode = mode;
  p.smoke = 1; p.fire = mode === 'glide' ? 0.4 : 1;
  p.gearDown = false;
  p.spinRate = (rng() < 0.5 ? -1 : 1) * (2.5 + rng() * 4);
  if (mode === 'glide') p.lost.engine = true;
  p.bomb = p.ordnance;
  setVel(p);
  world.events.push({ type: 'planeDown', plane: p, mode, x: p.x, y: p.y, z: p.z, cause, hasOrdnance: p.ordnance, attacker: attacker || null });
  if (mode === 'wing') { const w = piece || (rng() < 0.5 ? 'wingL' : 'wingR'); breakPiece(world, p, w); p.spinRate = (w === 'wingL' ? -1 : 1) * (5 + rng() * 4); }
  if (mode === 'explode') {
    // the aircraft breaks up in the air: tail and wings come off, the burning fuselage falls on
    breakPiece(world, p, 'tail'); breakPiece(world, p, rng() < 0.5 ? 'wingL' : 'wingR');
    world.events.push({ type: 'explosion', stage: 'air', x: p.x, y: p.y, z: p.z, size: p.ordnance ? 0.42 : 0.28, plane: p });
    spawnScrap(world, p.x, p.y, p.z, 8, 16, p.vx, p.vz, 1);
    p.spinRate *= 1.4;
  }
  if (p.ordnance) { p.ordnance = false; }
}

function breakPiece(world, p, piece) {
  if (piece === 'tail') { if (p.lost.tail) return; p.lost.tail = true; }
  else if (piece === 'wingL') { if (p.lost.wingL) return; p.lost.wingL = true; }
  else if (piece === 'wingR') { if (p.lost.wingR) return; p.lost.wingR = true; }
  spawnPlaneDebris(world, p, piece);
  world.events.push({ type: 'planeBreakup', plane: p, piece, x: p.x, y: p.y, z: p.z });
}

/** Dying aircraft: ballistic fall with its own tumbling, until it hits the sea or a ship. */
export function stepDying(world, p, dt) {
  p.dyingT += dt;
  const prev = _prev; prev[0] = p.x; prev[1] = p.y; prev[2] = p.z;
  if (p.mode === 'glide' && p.y > 4) {
    // engine dead, aircraft still flying: a long glide towards the sea at the speed it is trimmed for (the climb speed, a glide ratio of about ten), the speed it had bled off slowly
    const vg = Math.max(40, (perfOf(p).vcl || 55) * 1.15);
    p.pitch += (-0.1 - p.pitch) * dt * 0.8;
    p.speed += clamp(vg - p.speed, -1.6 * dt, 1.6 * dt);
    p.bank += (p.spinRate * 0.04 - p.bank) * dt;
    p.heading += p.bank * 0.1 * dt;
    setVel(p);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (world.terrain) { const gh = world.terrain.heightAt(p.x, p.z); if (gh > 0 && p.y <= gh + 1) { landCrash(world, p, gh); return false; } }
    if (p.y <= 1.5) { ditch(world, p, true); return true; }
    return collideShips(world, p, prev);
  }
  // uncontrolled: gravity and the drag of the shape it has now (a diving fuselage slips through the air, a spinning or tumbling one falls like a leaf: terminal speeds of about 240,
  // 145, 115, 70 and 60 m/s for a fighter in a dive, with a wing gone, breaking up, in a spin and tumbling), so the fall has a speed that it cannot pass
  p.vy -= G * dt;
  const spec = p.spec, S = spec.S || spec.span * spec.span / 7, m = (spec.mass || 4) * 1000;
  const cda = S * ({ dive: 0.05, wing: 0.14, explode: 0.22, spin: 0.55, tumble: 0.8 }[p.mode] || 0.3);
  const rho = 1.225 * Math.exp(-Math.max(0, p.y) / 8500), v = Math.hypot(p.vx, p.vy, p.vz), kd = 0.5 * rho * cda / m * v * dt;
  p.vx -= p.vx * kd; p.vy -= p.vy * kd; p.vz -= p.vz * kd;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  p.speed = sp;
  if (p.mode === 'spin' || p.mode === 'wing' || p.mode === 'explode') {
    p.bank += p.spinRate * dt;
    const pit = Math.asin(clamp(p.vy / Math.max(sp, 1), -1, 1));
    p.pitch += clamp(pit - p.pitch, -1.2 * dt, 1.2 * dt);
    if (Math.hypot(p.vx, p.vz) > 4) p.heading += wrapPi(Math.atan2(p.vx, -p.vz) - p.heading) * Math.min(1, dt * 0.8);
  } else if (p.mode === 'tumble') {
    p.bank += p.spinRate * dt; p.pitch += p.spinRate * 0.4 * dt; p.heading += p.spinRate * 0.2 * dt;
  } else {   // dive: pilot dead, nose drops
    const pit = Math.asin(clamp(p.vy / Math.max(sp, 1), -1, 1));
    p.pitch += clamp(pit - p.pitch, -0.7 * dt, 0.7 * dt);
    p.bank += (Math.sin(p.dyingT * 1.3) * 0.5 - p.bank) * dt;
    if (Math.hypot(p.vx, p.vz) > 4) p.heading += wrapPi(Math.atan2(p.vx, -p.vz) - p.heading) * Math.min(1, dt * 0.6);
  }
  const T = world.terrain;
  if (T) { const gh = T.heightAt(p.x, p.z); if (gh > 0 && p.y <= gh + 0.8) { landCrash(world, p, gh); return false; } }
  if (p.y <= 0.8) { crash(world, p, null); return false; }
  const ok = collideShips(world, p, prev);
  return ok;
}

/** Collision of an aircraft with a ship (it flew into it, or crashed on it). Returns false when the aircraft is gone. */
export function collideShips(world, p, prev) {
  if (p.y > 130) return true;
  for (const ship of world.ships) {
    if (ship.state === 'sunk' || p.phase === 'final' || DECK_PHASES.has(p.phase)) continue;
    if (p.owner === ship && !p.dying) continue;
    if (!segmentNearShip(ship, prev[0], prev[1], prev[2], p.x, p.y, p.z)) continue;
    const hit = segmentHit(ship, prev[0], prev[1], prev[2], p.x, p.y, p.z);
    if (!hit) continue;
    if (!p.dying && ship.team === p.team) continue;      // a healthy pilot does not hit his own ships
    crash(world, p, ship, hit);
    return false;
  }
  return true;
}

export function ditch(world, p, burning) {
  world.events.push({ type: 'planeDitch', plane: p, x: p.x, z: p.z });
  world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 220 });
  p.phase = 'floating'; p.dying = false; p.t2 = 0; p.y = 0.2; p.pitch = 0; p.roll = 0; p.bank = 0.1; p.gearDown = false;
  p.lost.engine = true;
  p.speed = Math.min(p.speed, 36);
  setVel(p); p.vy = 0;
  if (burning) world.addSeaFire(p.x, p.z, 7, 18, 0.5);
}

/** The aircraft hits the water, or a ship. */
export function crash(world, p, ship, hit) {
  const sp = p.speed;
  const ord = p.bomb ?? p.ordnance;
  world.events.push({ type: 'planeCrash', plane: p, x: p.x, y: Math.max(0.5, p.y), z: p.z, water: !ship, ship, speed: sp, ordnance: ord });
  if (ship) resolveCrashHit(world, ship, p, hit);
  else {
    world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 260 + (ord ? 120 : 0) });
    world.addSeaFire(p.x, p.z, 6 + (ord ? 4 : 0), 14 + world.rng() * 16, 0.55);
    spawnScrap(world, p.x, 1, p.z, 7, 14, p.vx * 0.2, p.vz * 0.2, 0.9);
  }
}

/** An aircraft flies into the ground of an island. */
export function landCrash(world, p, gh) {
  if (!p.dying) {
    p.owner && (p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1);
    world.events.push({ type: 'planeDown', plane: p, mode: 'dive', x: p.x, y: p.y, z: p.z, cause: 'crash', hasOrdnance: p.ordnance, attacker: null });
  }
  world.events.push({ type: 'planeCrash', plane: p, x: p.x, y: gh, z: p.z, water: false, land: true, ship: null, speed: p.speed, ordnance: p.bomb ?? p.ordnance });
  spawnScrap(world, p.x, gh + 1, p.z, 7, 14, p.vx * 0.2, p.vz * 0.2, 0.9);
}
