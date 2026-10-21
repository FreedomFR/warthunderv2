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

const _prev = [0, 0, 0];

/** The AA shot connects: damage, smoke, fire, or the aircraft is lost. */
export function hitPlane(world, ship, p, dmg, cal, cause = 'aa') {
  if (p.dying || p.phase === 'floating') return;
  dmg *= planeDmg(cause);          // the multiplier of data/balance.js
  if (dmg <= 0) return;
  p.hp -= dmg;
  world.events.push({ type: 'planeHit', plane: p, ship, x: p.x, y: p.y, z: p.z, cal, dmg });
  const frac = p.hp / p.maxHp;
  // where it smokes and where it burns: an engine, or the root of a wing (the fuel); the smoke and the flames of the picture come from there (render/fx/air.js)
  if (frac < 0.65 && p.smoke < 0.4) { p.smoke = 0.4 + world.rng() * 0.3; p.smokeSite = damageSite(world, p, false); }
  if (frac < 0.4 && p.fire < 0.3) {
    p.fire = 0.4; p.fireSite = damageSite(world, p, true);
    // the nacelle that burns is drawn charred and glowing (render/aircraftVisual.js)
    if (p.fireSite.eng >= 0 && p.spec.engines) { p.engFire = p.engFire || new Array(p.spec.engines.length).fill(0); p.engFire[p.fireSite.eng] = 0.7; }
  }
  if (p.hp <= 0) { if (ship && cause === 'aa') ship.aaKills++; killPlane(world, p, cause, ship); return; }
  // a lucky hit: engine, pilot, wing
  const r = world.rng();
  if (r < 0.06 * dmg + 0.03 * dmg) { loseEngine(world, p); world.events.push({ type: 'planeEngineOut', plane: p }); }
  else if (r < 0.1 * dmg + 0.02 && dmg > 0.8) killPlane(world, p, cause, ship);
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
function loseEngine(world, p) {
  const D = damageSites(p.spec), n = D.engines.length;
  if (n > 1) {
    p.lost.engines = p.lost.engines || new Array(n).fill(false);
    const free = p.lost.engines.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    const k = free[Math.floor(world.rng() * free.length)];
    p.lost.engines[k] = true;
    p.smokeSite = { ...D.engines[k], eng: k };
    if (p.lost.engines.every(Boolean)) p.lost.engine = true;
  } else { p.lost.engine = true; p.smokeSite = { ...D.engines[0], eng: 0 }; }
  p.smoke = Math.max(p.smoke, 1);
}

/** Start the death throes of an aircraft: it falls and burns, and the crash is seen to the end. */
export function killPlane(world, p, cause, attacker) {
  const rng = world.rng;
  if (p.dying) return;
  if (p.ground && p.base) { killGroundPlane(world, p.base, p, attacker, cause); return; }
  p.dying = true; p.dyingT = 0; p.cause = cause;
  if (DECK_PHASES.has(p.phase)) { p.dying = false; return; }
  p.owner && (p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1);
  if (attacker && attacker !== p.owner) attacker.planeKills = (attacker.planeKills || 0) + 1;
  const r = rng();
  let mode;
  if (cause === 'blast') mode = r < 0.5 ? 'tumble' : 'explode';
  else mode = r < 0.27 ? 'spin' : r < 0.5 ? 'dive' : r < 0.7 ? 'wing' : r < 0.85 ? 'glide' : 'explode';
  if (mode === 'explode' && !p.ordnance && rng() < 0.5) mode = 'spin';
  p.mode = mode;
  p.smoke = 1; p.fire = mode === 'glide' ? 0.4 : 1;
  p.gearDown = false;
  p.spinRate = (rng() < 0.5 ? -1 : 1) * (2.5 + rng() * 4);
  if (mode === 'glide') p.lost.engine = true;
  p.bomb = p.ordnance;
  setVel(p);
  world.events.push({ type: 'planeDown', plane: p, mode, x: p.x, y: p.y, z: p.z, cause, hasOrdnance: p.ordnance, attacker: attacker || null });
  if (mode === 'wing') { const w = rng() < 0.5 ? 'wingL' : 'wingR'; breakPiece(world, p, w); p.spinRate = (w === 'wingL' ? -1 : 1) * (5 + rng() * 4); }
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
    // engine dead, aircraft still flying: a long glide towards the sea
    p.pitch += (-0.1 - p.pitch) * dt * 0.8;
    p.speed = Math.max(42, p.speed - 6 * dt);
    p.bank += (p.spinRate * 0.04 - p.bank) * dt;
    p.heading += p.bank * 0.1 * dt;
    setVel(p);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (world.terrain) { const gh = world.terrain.heightAt(p.x, p.z); if (gh > 0 && p.y <= gh + 1) { landCrash(world, p, gh); return false; } }
    if (p.y <= 1.5) { ditch(world, p, true); return true; }
    return collideShips(world, p, prev);
  }
  // uncontrolled: gravity, drag, tumbling or spinning
  p.vy -= G * dt * (p.mode === 'dive' ? 1.0 : 0.9);
  const dr = Math.exp(-(p.mode === 'tumble' || p.mode === 'wing' ? 0.35 : 0.12) * dt);
  p.vx *= dr; p.vz *= dr; p.vy *= (p.mode === 'tumble' || p.mode === 'wing' ? Math.exp(-0.05 * dt) : 1);
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
