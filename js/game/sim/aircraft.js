// Carrier aircraft. A wave of dive bombers and torpedo bombers takes off from the flight deck, flies to the
// enemy, attacks (bombs are dropped from a steep dive, torpedoes from a low level run), is shot at by the
// ships' anti-aircraft guns (damaged aircraft smoke, burn and fall until they hit the sea or a ship), then
// returns and lands on the carrier. Bombs and torpedoes are simulated bodies, so where they hit decides the damage.
import { clamp, wrapPi, approach, D2R, G } from '../math.js';
import { planeTypeFor, PLANES, groundY, GROUND_PITCH, hookBack, damageSites } from '../model/planes.js';
import { planeDmg } from '../data/balance.js';
import { AA, FLAK_RANGE } from './aadata.js';
import { clearElev, clearMax, inArcRel } from '../model/clearance.js';
import { perfOf, aeroOf, dragAcc, thrustAcc } from './airperf.js';
import { lightAAHitRate, extentToward } from './airhit.js';
import { chooseApproach, aaSources, density, refugeShip } from './routing.js';
import { safeHeading, homeCourse } from './homeward.js';
import { fighterSteer, fighterFields, bomberDefense, markHunted, FIGHT_PHASES } from './fighters.js';
import { deckOf, planLaunch, settleService, beginRecovery, launching, stepDeck, stepDeckShip, touchdown, clearToLand, deckClearFor, DECK_PHASES } from './deck.js';
import { segmentNearShip, segmentHit, resolveBombHit, resolveNearMiss, resolveCrashHit } from './damage.js';
import { spawnPlaneDebris, spawnScrap } from './debris.js';
import { stepBasePlane, killGroundPlane } from './airfield.js';
import { bombHitsBase } from './baseops.js';

let nextPlane = 1;
let nextBomb = 1;
/** New ids for the aircraft and the bombs made outside this file (sim/airfield.js). */
export const planeId = () => nextPlane++;
export const bombId = () => nextBomb++;



const rn = (world, a, b) => a + (b - a) * world.rng();

// ---- the circuit round a carrier ---------------------------------------------------------------------------------------
// Opposite course past the ship on the side away from the island, a 180-degree turn at a steady bank that ends on the ship's course about 1.5 km
// astern, then the groove down to the wires. All in the ship's frame (x forward, z to starboard).
const GROOVE_GATE = 3000;                 // the next aircraft turns in when the one ahead is this close behind its touchdown point (m)
function circuit(ship, p) {
  const dp = ship.model.deckPoints, isl = ship.model.island;
  const side = isl && isl.z < 0 ? 1 : -1;       // the circuit is on the side away from the island
  // the turn at the circuit speed of this aircraft and 28 degrees of bank (about 700 m for a fast one, 200 m for a Swordfish); the ship moves on
  // during the turn, so the turn is started that much sooner and the aircraft rolls out about 1.5 km astern, on the centre line
  const vt = p ? perfOf(p).vp * 0.9 : 52;
  const R = clamp(vt * vt / (G * Math.tan(28 * D2R)), 180, 800);
  const zDown = side * (2 * R + 80), turnX = dp.x0 - 1500 + Math.max(ship.speed, 8) * Math.PI * R / vt;
  return {
    side, zDown, turnX, turn: side, altDown: 200, altTurn: 135, R,
    point() { return ship.toWorld(dp.x1 + 800, 0, zDown, [0, 0, 0]); },
  };
}
/** May this aircraft turn in for the final approach: the deck is not launching or being cleared, and the aircraft ahead of it is well down its approach (or down)? */
function mayTurnIn(world, ship, p) {
  const D = deckOf(ship);
  if (D.striking || launching(world, ship)) return false;
  const q = D.landing.length ? D.landing[D.landing.length - 1] : null;
  if (!q || q === p) return true;
  if (q.phase === 'rollout' || q.phase === 'taxiIn') return true;
  if (q.phase === 'final' && q.tdPick) { ship.toLocal(q.x, q.y, q.z, _l3); return q.tdX - _l3[0] < GROOVE_GATE; }
  return false;
}
/** Heading of a direction given in the ship's frame (dxr forward, dzr to starboard). */
function relHeading(ship, dxr, dzr) {
  const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
  const wx = dxr * sh + dzr * ch, wz = -dxr * ch + dzr * sh;
  return Math.atan2(wx, -wz);
}

// ---- strike formations ---------------------------------------------------------------------------------------------
// A wave is split into sections of up to four aircraft of one kind (torpedo bombers, dive bombers). A section flies to the enemy in formation
// behind its leader (a vee, the fourth aircraft in the middle astern), then attacks together: the torpedo bombers on an approach bearing of their
// own, line abreast, the dive bombers peeling off one after the other at intervals. The sections of a strong wave come in from different bearings.
// A wave that has lost most of its aircraft before the attack closes up into one formation per kind and attacks on one axis; when too few
// are left to be worth the risk, it turns back.
const STRIKE_PHASES = new Set(['assemble', 'cruise', 'ip', 'run', 'rollin', 'dive', 'pullout', 'break', 'egress']);
const ATTACK_PHASES = new Set(['ip', 'run', 'rollin', 'dive']);
const live = (m) => !m.dying && !m.gone && (STRIKE_PHASES.has(m.phase) || m.phase === 'queue' || m.phase === 'takeoff');
const airborne = (m) => live(m) && m.phase !== 'queue' && m.phase !== 'takeoff';
/** the first aircraft of the section that is still flying the strike: the leader */
function leaderOf(sec) { for (const m of sec.members) if (live(m)) return m; return null; }
/** place of an aircraft in its section, by order among the living (0 = leader): { rank, pos (0 centre, 1 right, 2 left), row } */
function placeOf(p) {
  let rank = 0;
  for (const m of p.sec.members) { if (m === p) break; if (live(m)) rank++; }
  return { rank, pos: rank % 3, row: Math.floor(rank / 3) };
}
/** where a follower holds in the leader's frame: [metres astern, metres to starboard, metres of height] */
function slotOffset(kind, pl, k = 1) {
  const side = pl.pos === 0 ? 0 : pl.pos === 1 ? 1 : -1;
  const sp = kind === 'torp' ? 52 : 40;
  return [-(pl.row * 90 + (pl.pos ? 38 : 0)) * k, side * sp * k, pl.pos === 0 ? 0 : -6 * pl.pos];
}
const TIGHT = 0.55;                     // the spacing of a section that closes up under attack, against the loose one
const SECTION_SPREAD = 0.72;            // rad between the approach bearings of the torpedo sections

function bestTarget(world, team, fromX, fromZ) {
  let best = null, bs = -1e9;
  const srcs = aaSources(world, team);
  for (const s of world.ships) {
    if (s.team === team || !s.alive) continue;
    const d = Math.hypot(s.x - fromX, s.z - fromZ);
    if (d > 90000) continue;
    // prefer valuable ships, then near ones
    const sc = s.stats.score * 6000 - d + (s.hpFrac < 0.6 ? 3000 : 0) + world.rng() * 2500 - density(srcs, s) * 2200;
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}

/** the `n` most attractive enemy ships, best first */
function bestTargets(world, team, fromX, fromZ, n) {
  const out = [], srcs = aaSources(world, team);
  for (const sh of world.ships) {
    if (sh.team === team || !sh.alive) continue;
    const d = Math.hypot(sh.x - fromX, sh.z - fromZ);
    if (d > 90000) continue;
    out.push({ sh, sc: sh.stats.score * 6000 - d + (sh.hpFrac < 0.6 ? 3000 : 0) + world.rng() * 2500 - density(srcs, sh) * 2200 });
  }
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, n).map((q) => q.sh);
}

export function updateAir(world, dt) {
  const over = world.state === 'finished';
  if (!over) launches(world, dt);
  for (const ship of world.ships) if (ship.air && ship.alive) stepDeckShip(world, ship, dt);
  flight(world, dt);
  if (over) ceaseFire(world);
  else {
    markHunted(world);
    bomberDefense(world, dt, FIGHT_CTX);
    updateAA(world, dt);
  }
  stepBombs(world, dt);
}

/** The battle is over: the aircraft that were fighting or on their way to fight go home. */
const CEASE = new Set(['assemble', 'cruise', 'ip', 'run', 'rollin', 'dive', 'pullout', 'break', 'egress', 'escort', 'cap', 'engage', 'refuge']);
function ceaseFire(world) {
  for (const p of world.planes) {
    p.firing = false; p.gunFiring = false; p.prey = null; p.hunted = 0;
    if (!p.dying && CEASE.has(p.phase)) { p.phase = 'return'; p.asm = null; p.t = 0; }
  }
  for (const ship of world.ships) for (const a of ship.aaMounts) { a.target = null; a.flash = 0; }
}

// ---- fighters ----------------------------------------------------------------------------------------------------
/** The fighters of a launch: n aircraft, in the order of the deck queue after the ones already in wave.planes. */
function spawnFighters(world, ship, wave, n, role) {
  const typeKey = planeTypeFor(ship.stats.nation, 'fighter'), spec = PLANES[typeKey];
  for (let j = 0; j < n; j++) {
    const p = {
      id: nextPlane++, owner: ship, team: ship.team, kind: 'fighter', typeKey, spec, wave, sec: null,
      x: ship.x, y: ship.y, z: ship.z, vx: 0, vy: 0, vz: 0, heading: ship.heading, pitch: 0, roll: 0, bank: 0, speed: 0,
      phase: 'queue', ds: 'pending', t: 0, ts: 0, age: 0, target: null, hp: spec.hp, maxHp: spec.hp, ordnance: false,
      spin: 0, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
      lx: 0, lz: 0, u: 0, apOff: 0, jitter: (world.rng() - 0.5) * 2, fold: 1, hook: 0, eng: 0, aoa: 0, gp: GROUND_PITCH, yaw: 0, hidden: true, lift: null,
      t0Air: 0, cruiseAlt: 0, relAlt: 0, fuel: 1700 + world.rng() * 400, aimErr: [0, 0], diveAng: 0, group: wave.planes.length,
      ...fighterFields(spec), role,
    };
    wave.planes.push(p);
    world.planes.push(p);
  }
}

/** Enemy aircraft on their way to the fleet: in the air, not yet over it, within 70 km of the carrier. */
function inboundAircraft(world, ship) {
  let n = 0;
  for (const q of world.planes) {
    if (q.team === ship.team || q.dying || q.hidden || q.y < 40 || DECK_PHASES.has(q.phase) || q.phase === 'return' || q.phase === 'floating') continue;
    if (Math.hypot(q.x - ship.x, q.z - ship.z) < 70000) n++;
  }
  return n;
}

// ---- launch ------------------------------------------------------------------------------------------------------
function launches(world, dt) {
  for (const ship of world.ships) {
    const air = ship.air;
    if (!air || !ship.alive) continue;
    air.cooldown -= dt;
    ship._parkT = (ship._parkT || 0) - dt;
    if (ship._parkT <= 0) { ship._parkT = 1; ship.updateParked(); }
    air.capCooldown -= dt;
    if (ship.deckWrecked) continue;
    // the deck is either launching or recovering: not both at once
    const D = deckOf(ship);
    const deckBusy = D.landing.length || D.recovering || D.striking || D.circuit > 0 || D.pending.some((q) => !q.service) || launching(world, ship);
    // a patrol goes up when enemy aircraft come within reach of the fleet
    if (!deckBusy && air.fReady >= 2 && air.capCooldown <= 0 && inboundAircraft(world, ship) > 0) {
      let up = 0;
      for (const q of world.planes) if (q.owner === ship && q.fighter && q.role === 'cap' && !q.dying) up++;
      const n = Math.min(air.fReady, 4 - up);
      if (n >= 2) {
        settleService(world, ship);
        air.fReady -= n; air.capCooldown = 100;
        const cw = { ship, n: 0, id: ++air.wave, launched: 0, assessed: true, aborted: false, t0: world.time, planes: [], cap: true, sections: [] };
        spawnFighters(world, ship, cw, n, 'cap');
        planLaunch(world, ship, cw.planes);
        world.events.push({ type: 'airLaunch', ship, count: n, fighters: true });
        continue;
      }
    }
    if (!(ship.cmd.air.launch && air.cooldown <= 0 && air.ready >= 4) || deckBusy) continue;
    const target = bestTarget(world, ship.team, ship.x, ship.z);
    if (!target) continue;
    // a big deck load: about an eighth to a quarter of the air group (Essex 13-23 bombers, Illustrious 7-13, Béarn 5-9), so that more of the strike gets through the AA
    const n = Math.min(air.ready, Math.max(6, Math.round(ship.stats.air.capacity * (0.13 + world.rng() * 0.1))));
    settleService(world, ship);
    air.ready -= n;
    air.cooldown = 200 + n * 6 + world.rng() * 80;       // the next strike needs the aircraft serviced and a new deck load spotted
    air.wave++;
    const dp = ship.model.deckPoints;
    const wave = { ship, n, id: air.wave, launched: 0, assessed: false, aborted: false, t0: world.time, planes: [] };
    const order = wave.planes;
    const dive = planeTypeFor(ship.stats.nation, 'dive'), torp = planeTypeFor(ship.stats.nation, 'torp');
    // the composition: a little over half torpedo bombers; sections of three (a leftover pair, or a fourth aircraft in a section); dive bombers off the deck first
    const nT = Math.round(n * 0.55), nD = n - nT;
    const split = (c) => { const out = []; let r = c; while (r > 0) { const k = r === 4 ? 4 : Math.min(3, r); out.push(k); r -= k; } if (out.length > 1 && out[out.length - 1] === 1) { out.pop(); out[out.length - 1]++; } return out; };
    const plan = [...split(nD).map((k) => ['dive', k]), ...split(nT).map((k) => ['torp', k])];
    const targets = bestTargets(world, ship.team, ship.x, ship.z, 2);
    const torpSections = plan.filter((q) => q[0] === 'torp').length;
    wave.sections = [];
    let i = 0, tIdx = 0;
    for (const [kind, k] of plan) {
      const idx = kind === 'torp' ? tIdx++ : wave.sections.filter((q) => q.kind === 'dive').length;
      const sec = { id: wave.sections.length, kind, members: [], wave, target: targets[(wave.sections.length >= 2 && targets.length > 1 && wave.sections.length % 3 === 2) ? 1 : 0] || target, spread: kind === 'torp' ? (idx - (torpSections - 1) / 2) * Math.min(SECTION_SPREAD, 2.4 / Math.max(1, torpSections - 1)) : 0, dLat: (idx - 0.5) * 900, state: 'form', rollT: null };
      wave.sections.push(sec);
      for (let j = 0; j < k; j++, i++) {
        const typeKey = kind === 'torp' ? torp : dive;
        const spec = PLANES[typeKey];
        const p = {
          id: nextPlane++, owner: ship, team: ship.team, kind, typeKey, spec, wave, sec,
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: ship.heading, pitch: 0, roll: 0, bank: 0, speed: 0,
          phase: 'queue', ds: 'pending', t: 0, ts: 0, age: 0, target: sec.target, hp: spec.hp, maxHp: spec.hp, ordnance: true,
          spin: 0, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
          lx: 0, lz: 0, u: 0, apOff: 0, jitter: (world.rng() - 0.5) * 2, fold: 1, hook: 0, eng: 0, aoa: 0, gp: GROUND_PITCH, yaw: 0, hidden: true, lift: null,
          t0Air: 0, cruiseAlt: kind === 'dive' ? rn(world, 1500, 2000) : rn(world, 420, 650), relAlt: rn(world, 480, 620), fuel: 1700 + world.rng() * 400,
          aimErr: [world.rng.normal(), world.rng.normal()], diveAng: rn(world, 58, 70) * D2R, group: i,
        };
        p.x = ship.x; p.y = ship.y; p.z = ship.z;
        sec.members.push(p);
        order.push(p);
        world.planes.push(p);
      }
    }
    // the escort: fighters leave after the bombers (they are faster and catch up)
    const nF = air.fReady >= 2 ? Math.min(air.fReady, clamp(Math.round(n * 0.3), 2, 7)) : 0;
    if (nF) { air.fReady -= nF; spawnFighters(world, ship, wave, nF, 'escort'); }
    planLaunch(world, ship, order);
    ship.updateParked();
    world.events.push({ type: 'airLaunch', ship, count: n });
  }
}
const _w = [0, 0, 0];
export const FIGHT_CTX = { hit: (world, shooter, target, dmg, cal, cause = 'gun') => hitPlane(world, shooter, target, dmg, cal, cause) };

// ---- flight ------------------------------------------------------------------------------------------------------
function flight(world, dt) {
  const arr = world.planes;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.age += dt;
    p.t += dt;
    // the propeller turns with the engine: slowly while it starts up and idles on deck, at full speed from the take-off run on
    p.spin += dt * (p.lost.engine ? 0 : p.eng != null ? (p.eng < 0.02 ? 0 : 3 + 59 * Math.min(1, p.eng * 1.4)) : 62 + (p.speed - 60) * 0.3);
    p.harass = Math.max(0, p.harass - dt * 0.35);
    const keep = p.dead ? false : p.dying ? stepDying(world, p, dt) : p.base ? stepBasePlane(world, p, dt) : stepPlane(world, p, dt);
    p.roll = p.bank;
    if (!keep) { p.gone = true; arr.splice(i, 1); }
  }
}

export function setVel(p) {
  const cp = Math.cos(p.pitch);
  p.vx = Math.sin(p.heading) * cp * p.speed; p.vy = Math.sin(p.pitch) * p.speed; p.vz = -Math.cos(p.heading) * cp * p.speed;
}

/** Flight dynamics step: heading, flight-path angle and speed towards the commanded values. */
const pf0 = (p) => perfOf(p);
export function guide(p, dt, hdgT, gamT, spdT, o = {}) {
  const pf = perfOf(p), A = aeroOf(p.typeKey, p.spec);
  const v = Math.max(p.speed, 20);
  // how much the wing can lift here: (v / vs)^2 times the weight, vs lower with the flaps down (gear down: the landing configuration) and in the denser air low down
  const flaps = !!p.gearDown;
  const rho = 1.225 * Math.exp(-Math.max(p.y, 0) / 9500);
  const vs = A.vs * Math.sqrt(1.0 / rho) * (flaps ? 0.79 : 1);
  const nLift = (v / vs) * (v / vs);
  const nAvail = Math.max(1.02, Math.min(A.nmax, nLift * 0.9));
  // the climb the engine can hold: the excess of thrust over drag; above the climb speed the aircraft may zoom (trade its speed for height), below it it cannot
  const power = (p.lost && p.lost.engine ? 0 : p.lost && p.lost.engines ? 1 - p.lost.engines.filter(Boolean).length / p.lost.engines.length : 1) * (o.powerMax ?? 1);
  const cosG = Math.cos(p.pitch);
  const k0 = flaps ? 2.0 : 1, brakes = !!(o.brakes && pf.brakes);
  // (what it could climb at in level flight: not at the load of the moment, which would feed back into the pull and make it swing)
  const excess = thrustAcc(A, v, power) - dragAcc(A, v, 1, k0, brakes);
  // (no slower than 1.1 times the stall in a climb; level or going down, only the stall is guarded against)
  // (a climb is flown at the speed it is told, but no faster than a cruise climb, between the best climb speed and the cruise: what is asked beyond comes once level)
  // (one that asks for more than the cruise, to catch up with its formation, a little faster)
  const cc = (pf.vcl + 0.4 * Math.max(0, pf.vc - pf.vcl)) * (spdT > pf.vc ? 1.3 : 1);
  const vKeep = gamT > 0 ? Math.max(vs * 1.1, Math.min(spdT, cc)) : vs * 1.15;
  const gamMax = Math.asin(clamp(excess / G, -0.5, 0.6)) + clamp((v - vKeep) / v * 1.2, -0.25, 0.35);
  const climbLimited = gamT > gamMax;
  const gamW = Math.min(gamT, Math.max(gamMax, -1.5));
  const pr = o.pitchRate ?? pf.pr;
  const bankPilot = Math.min(o.bankMax ?? pf.bank * D2R, pf.bank * D2R);
  const err = wrapPi(hdgT - p.heading);
  let yr, n;
  if (o.bankOverride != null) {
    // a manoeuvre flown by attitude (the roll-in of a dive bomber, the wings held level in the dive): the bank as told, the nose moved at the pilot's rate
    p.bank += clamp(o.bankOverride - p.bank, -A.roll * 1.5 * dt, A.roll * 1.5 * dt);
    yr = clamp(err * 1.7, -G * Math.tan(Math.min(bankPilot, 1.4)) / v, G * Math.tan(Math.min(bankPilot, 1.4)) / v);
    p.heading += yr * dt;
    const upMax = Math.max(0.02, (nAvail - cosG) * G / v), downMax = (cosG + 1) * G / v;
    p.pitch += clamp(gamW - p.pitch, -Math.min(pr, downMax) * dt, Math.min(pr, upMax) * dt);
    n = Math.max(0.2, Math.hypot(cosG, v * yr * cosG / G));
  } else {
    // the pilot asks for a turn rate and a rate of change of the path; the lift that makes both is one pull, tilted by the bank: its size no more than the wing
    // gives at this speed (or the pilot pulls), its tilt no steeper than he is told. The aircraft rolls to that bank at the rate of the type, then turns as its
    // lift, tilted as it actually is, makes it turn: a heavy bomber is slow to start a turn, a fighter quick
    const yrW = clamp(err * 1.7, -2, 2), grW = clamp((gamW - p.pitch) * 2.2, -pr, pr);
    let nv = cosG + v * grW / G, nh = v * yrW * cosG / G;
    nh = clamp(nh, -Math.abs(nv) * Math.tan(bankPilot) - 0.05, Math.abs(nv) * Math.tan(bankPilot) + 0.05);
    // (the path first, the turn with what is left: a turn at the limit is flown level, tighter only by trading height when the pilot asks to go down)
    // A push over is flown with the wings about level and the stick forward (a negative load, -1.5 g at most), not by rolling on to the back
    const nNeg = Math.min(1.5, nLift * 0.5);
    nv = clamp(nv, -nNeg, nAvail);
    const nTop = nv >= 0 ? nAvail : nNeg;
    const hLeft = Math.sqrt(Math.max(0, nTop * nTop - nv * nv));
    nh = clamp(nh, -hLeft, hLeft);
    const neg = nv < -0.05;
    const nw = Math.hypot(nv, nh) * (neg ? -1 : 1);
    const bankW = Math.abs(nw) > 0.05 ? (neg ? Math.atan2(-nh, -nv) : Math.atan2(nh, nv)) : 0;
    p.bank += clamp(wrapPi(bankW - p.bank), -A.roll * dt, A.roll * dt);
    // the lift actually flown: as much as wanted, along the bank the aircraft has (rolled part of the way, the pull is eased in proportion)
    const align = Math.max(0, Math.cos(wrapPi(bankW - p.bank)));
    // (while it rolls the pilot pulls what holds the path he wants: the vertical part of the lift, along the bank it has)
    const cb = Math.cos(p.bank);
    n = neg ? clamp(nw * align, -nNeg, 0) : clamp(Math.max(nw * align, cb > 0.25 ? nv / cb : 0), 0.05, nAvail);
    yr = n * Math.sin(p.bank) * G / (v * Math.max(cosG, 0.1));
    const gr = (n * Math.cos(p.bank) - cosG) * G / v;
    // (the last of the heading error is taken out without overshoot, as a pilot eases off the turn)
    p.heading += Math.abs(yr * dt) > Math.abs(err) && Math.sign(yr) === Math.sign(err) ? err : yr * dt;
    p.pitch += clamp(gr * dt, -1.5, 1.5);
    p.pitch = clamp(p.pitch, -1.55, 1.55);
  }
  // the speed: thrust (the throttle set for the speed wanted, within what the engine gives) less the drag and the weight along the path
  const drag = dragAcc(A, v, n, k0, brakes), full = thrustAcc(A, v, power);
  // (a climb that asks more than the engine has is flown at full power, the speed held with the nose)
  const thr = climbLimited ? 1 : clamp((drag + G * Math.sin(p.pitch) + (spdT - v) * 0.5) / Math.max(full, 1e-3), 0, 1);
  // (o.accMax: what the engine can give just after the take-off, flaps and gear still out, at full power and low speed)
  // (throttled right back the propeller windmills and brakes the aircraft: about half the drag of the airframe again)
  const mill = (1 - thr) * (1 - thr) * 0.5 * A.c0 * v * v;
  const acc = Math.min(thr * full - drag - mill - G * Math.sin(p.pitch), o.accMax ?? 99);
  p.thr = thr;
  p.load = n;
  p.speed = Math.max(vs * 0.8, p.speed + acc * dt);
  setVel(p);
}

/**
 * The look at the strike, once, when the first aircraft is 16 km from its target. Too few aircraft left to be worth the risk (a wave of six or
 * more under three, a smaller one under two, or under a third of the wave): the strike turns back. Few left (under five): the sections close up
 * into one formation per kind so that the survivors attack together on one axis, in trail for the dive bombers.
 */
function assessWave(world, wave) {
  wave.assessed = true;
  const strike = world.planes.filter((q) => q.wave === wave && live(q) && q.ordnance && q.phase !== 'queue' && q.phase !== 'takeoff');
  const need = wave.n >= 6 ? 3 : 2;
  if (strike.length < need || strike.length < wave.n * 0.3) {
    wave.aborted = true;
    world.events.push({ type: 'strikeAbort', ship: wave.ship, left: strike.length, planned: wave.n });
    return;
  }
  if (strike.length < Math.max(5, Math.round(wave.n * 0.55))) {
    wave.sections = [];
    for (const kind of ['dive', 'torp']) {
      const members = strike.filter((q) => q.kind === kind).sort((a, b) => a.id - b.id);
      if (!members.length) continue;
      const sec = { id: wave.sections.length, kind, members, wave, target: members[0].target, spread: 0, dLat: 0, state: 'form', rollT: null, apAng: members[0].sec ? members[0].sec.apAng : null };
      wave.sections.push(sec);
      for (const m of members) m.sec = sec;
    }
    world.events.push({ type: 'strikeMerged', ship: wave.ship, left: strike.length, planned: wave.n });
  }
}

function stepPlane(world, p, dt) {
  const ship = p.owner;
  const spec = p.spec;
  // ---- queue and deck run ----
  if (DECK_PHASES.has(p.phase)) return stepDeck(world, p, dt);
  // fuel
  p.fuel -= dt;
  let tgt = p.target;
  if (p.kind && (!tgt || !tgt.alive) && (p.phase === 'cruise' || p.phase === 'ip' || p.phase === 'run' || p.phase === 'dive')) {
    // the section keeps one target: the first of its aircraft to notice that it is gone picks the next
    const st = p.sec && p.sec.target;
    p.target = tgt = st && st.alive ? st : bestTarget(world, p.team, p.x, p.z);
    if (p.sec && tgt) { p.sec.target = tgt; p.sec.apAng = null; }
    if (!tgt) p.phase = 'return';
  }
  if (p.fuel < 0 && p.phase !== 'ditch' && p.phase !== 'floating' && p.phase !== 'final' && p.phase !== 'pattern' && p.phase !== 'waveoff' && p.phase !== 'return') p.phase = 'return';
  const carrierOk = ship && ship.alive && !ship.deckWrecked;
  // a bomber that fighters are hunting on its way home takes shelter under the guns of the nearest friendly ships
  p.hunted = Math.max(0, (p.hunted || 0) - dt);
  if (p.hunted > 0 && !p.fighter && (p.phase === 'egress' || p.phase === 'return') && p.fuel > 200) { p.phase = 'refuge'; p.calm = 0; p.refuge = null; p.dirOrbit = world.rng() < 0.5 ? -1 : 1; }
  if (p.gearDown && p.age > p.t0Air + 3 && p.phase !== 'pattern' && p.phase !== 'final' && p.phase !== 'waveoff') p.gearDown = false;
  // the hook is lowered with the gear for the landing; the nose is held high on the approach
  const landing = p.phase === 'pattern' || p.phase === 'final' || (p.phase === 'waveoff' && p.t < 9);
  p.hook = clamp(p.hook + (landing ? 1 : -1) * dt * 0.9, 0, 1);
  // (and just after the take-off, the nose held high while the speed is low)
  const climbing = p.phase === 'assemble' && p.asm !== 'orbit';
  p.aoa += ((p.phase === 'final' ? 0.15 : landing ? 0.07 : climbing ? clamp((pf0(p).vcl - p.speed) / pf0(p).vcl * 0.6, 0, 0.12) : 0) - p.aoa) * Math.min(1, dt * 1.8);

  const pf = perfOf(p);
  let hdg = p.heading, gam = 0, spd = pf.vc, o = {};
  switch (p.phase) {
    case 'assemble': {
      // after the take-off run: straight ahead and climbing until clear of the bow, then a circle over the sea ahead of the carrier (on the side away from the landing circuit)
      // until the whole wave is in the air; then the strike forms up and leaves
      const dp = ship.model.deckPoints, deckY = ship.y + ship.model.fdY;
      ship.toLocal(p.x, p.y, p.z, _l2);
      const lx = _l2[0], lz = _l2[2];
      const w = p.wave;
      if (p.asm !== 'orbit') {
        // off the bow just above the stall: the aircraft sinks a little, gathers speed low over the water, then climbs away
        const tA = p.age - p.t0Air, slow = p.speed < pf.vto * 1.25;
        hdg = ship.heading; spd = pf.vcl; o = { bankMax: 5 * D2R, accMax: p.fighter ? 3 : 2.4, pitchRate: 0.12 };
        gam = tA < 1.5 ? -0.015 : slow && tA < 9 ? 0.025 : 0.1;
        if (lx > dp.x1 + 150 && p.y > deckY + 60) {
          if (w.cap || !carrierOk) { p.phase = p.role || 'cap'; p.t = 0; break; }
          p.asm = 'orbit'; p.holdAng = 0; p.holdPrev = null; p.orbT = 0;
        }
        break;
      }
      p.orbT += dt;
      if (w._asmT !== world.time) {
        w._asmT = world.time;
        let all = true;
        for (const q of w.planes) if (!q.gone && !q.dying && (q.phase === 'queue' || q.phase === 'takeoff' || (q.phase === 'assemble' && (q.asm !== 'orbit' || q.orbT < 6)))) { all = false; break; }
        if (all || !carrierOk || world.time - w.t0 > 420) w.asmGo = true;
      }
      if (w.asmGo) {
        p.phase = p.fighter ? p.role : 'cruise'; p.t = 0; p.asm = null;
        break;
      }
      const cc = circuit(ship);
      const vc = pf.vp * 0.92, R = clamp(vc * vc / (G * Math.tan(27 * D2R)), 240, 760);
      const hx = dp.x1 + 1150 + R * 0.5, hz = -cc.side * R * 1.15;
      const rx = lx - hx, rz = lz - hz, rl = Math.hypot(rx, rz) || 1;
      const k = clamp((R - rl) / R * 2.2, -1.2, 1.2);
      let vx = cc.side * rz / rl + rx / rl * k, vz = -cc.side * rx / rl + rz / rl * k;
      const vl = Math.hypot(vx, vz) || 1;
      vx = vx / vl * vc + ship.speed; vz = vz / vl * vc;
      hdg = relHeading(ship, vx, vz);
      spd = Math.hypot(vx, vz);
      gam = clamp((deckY + pf.asm + (p.group % 4) * 40 - p.y) / 420, -0.05, 0.14);
      o = { bankMax: 30 * D2R };
      break;
    }
    case 'refuge': {
      // circle round a friendly ship (a ring of 1.1 km, 350 m up, within the reach of its light guns) until the fighters give up or are shot down
      p.refT = (p.refT || 0) - dt;
      if (!p.refuge || !p.refuge.alive || p.refT <= 0) { p.refT = 3; p.refuge = refugeShip(world, p.team, p.x, p.z); }
      const c = p.refuge;
      if (!c || p.fuel < 150) { p.phase = 'return'; break; }
      p.calm = p.hunted > 0 ? 0 : (p.calm || 0) + dt;
      if (p.calm > 15) { p.phase = 'return'; break; }
      const R = 1100, rx = p.x - c.x, rz = p.z - c.z, rl = Math.hypot(rx, rz) || 1;
      // still a long way off: there at full speed, coming down, before the circle
      if (rl > R * 2.2) {
        hdg = Math.atan2(-rx, rz); spd = Math.min(pf.vmax * 0.95, pf.vc * 1.2); gam = clamp((350 - p.y) / 600, -0.12, 0.05); o = { bankMax: 45 * D2R };
        break;
      }
      const dir = p.dirOrbit || 1, k = clamp((R - rl) / R * 1.6, -1.2, 1.2);
      let vx = dir * rz / rl + rx / rl * k, vz = -dir * rx / rl + rz / rl * k;
      const vl = Math.hypot(vx, vz) || 1;
      vx = vx / vl * pf.vp * 1.05 + c.vx; vz = vz / vl * pf.vp * 1.05 + c.vz;
      hdg = Math.atan2(vx, -vz); spd = Math.hypot(vx, vz); o = { bankMax: 50 * D2R };
      gam = clamp((350 - p.y) / 400, -0.1, 0.08);
      break;
    }
    case 'escort': case 'cap': case 'engage': {
      const r = fighterSteer(world, p, dt, FIGHT_CTX);
      hdg = r.hdg; gam = r.gam; spd = r.spd; o = r.o;
      break;
    }
    case 'cruise': {
      const sec = p.sec, lead = sec ? leaderOf(sec) : null;
      const dx = tgt.x + tgt.vx * 30 - p.x, dz = tgt.z + tgt.vz * 30 - p.z;
      const range = Math.hypot(dx, dz);
      // the strike is looked over once, 16 km from the target: too few left and it turns back, few left and it closes up
      if (range < 16000 && !p.wave.assessed && (p.wave.launched >= p.wave.n || world.time - p.wave.t0 > 150)) assessWave(world, p.wave);
      if (p.wave.aborted) { p.phase = 'return'; break; }
      // a section with enemy fighters on one of its aircraft closes up (the gunners cover each other), and opens out again when they have gone
      if (sec) {
        const want = sec.members.some((m) => live(m) && m.hunted > 0) ? TIGHT : 1;
        p.tightF = (p.tightF ?? 1) + (want - (p.tightF ?? 1)) * Math.min(1, dt * 0.5);
        p.tight = p.tightF < 0.8;
      }
      // ---- in formation behind the leader ----
      if (sec && lead && lead !== p && airborne(lead) && lead.phase === 'cruise') {
        const pl = placeOf(p), so = slotOffset(p.kind, pl, p.tightF ?? 1);
        const fx = Math.sin(lead.heading), fz = -Math.cos(lead.heading), rx = Math.cos(lead.heading), rz = Math.sin(lead.heading);
        const sx = lead.x + fx * so[0] + rx * so[1], sz = lead.z + fz * so[0] + rz * so[1];
        const ex = sx + lead.vx * 1.2 - p.x, ez = sz + lead.vz * 1.2 - p.z;
        const dS = Math.hypot(ex, ez);
        // far from the slot steer for it, near it fly the leader's heading
        hdg = lead.heading + wrapPi(Math.atan2(ex, -ez) - lead.heading) * clamp(dS / 70, 0, 1);
        const along = (p.x - sx) * fx + (p.z - sz) * fz;
        spd = clamp(lead.speed - along * 0.16, pf.vc * 0.55, pf.vc * 1.3);
        gam = clamp((lead.y + so[2] - p.y) / 260, -0.09, 0.12);
        break;
      }
      // ---- a follower whose leader has gone into the attack goes in on the section's order ----
      if (sec && lead && lead !== p && sec.state !== 'form') {
        if (p.kind === 'torp' && sec.state === 'ip') {
          const pl = placeOf(p);
          p.phase = 'ip'; p.t = 0; p.ipAngle = sec.apAng ?? sec.ang0; p.lat = (pl.pos === 0 ? 0 : pl.pos === 1 ? 1 : -1) * 135; p.row = pl.row;
          break;
        }
        if (p.kind === 'dive' && sec.rollT != null && world.time - sec.rollT >= placeOf(p).rank * 3.1) {
          p.phase = 'rollin'; p.t = 0; p.rollSide = placeOf(p).pos === 2 ? -1 : 1; p.diveAlt = p.y; break;
        }
      }
      // ---- the leader (or an aircraft on its own): to the target ----
      // the way in: the section picks, 24 km out, the bearing from which to come in with the least anti-aircraft fire on the way, apart from the other
      // sections; it flies by the entry point on that bearing (9.8 km out) and then straight at the ship
      if (sec && sec.apAng == null && range < 24000) {
        const taken = sec.wave.sections.filter((q) => q !== sec && q.apAng != null).map((q) => q.apAng);
        sec.apAng = chooseApproach(world, p.team, p, tgt, p.kind, taken);
      }
      let hx = dx, hz = dz;
      if (sec && sec.apAng != null && range > 9900) {
        const wx = tgt.x + tgt.vx * 30 + Math.sin(sec.apAng) * 9800 - p.x, wz = tgt.z + tgt.vz * 30 - Math.cos(sec.apAng) * 9800 - p.z;
        if (Math.hypot(wx, wz) > 1700) { hx = wx; hz = wz; }
      }
      hdg = Math.atan2(hx, -hz);
      // not yet formed up: the leader goes easy so that the section can join
      let formed = true;
      if (sec && lead === p && sec.state === 'form' && world.time - (sec.t0 ?? (sec.t0 = world.time)) < 75) {
        for (const m of sec.members) if (m !== p && live(m) && (!airborne(m) || Math.hypot(m.x - p.x, m.z - p.z) > 380)) { formed = false; break; }
      }
      if (p.kind === 'dive') {
        // climb to the attack altitude on the way
        gam = clamp((p.cruiseAlt - p.y) / 700, -0.1, 0.1);
        // roll in so that the dive line (about 60 degrees) passes through the ship: horizontal distance covered while
        // pushing over (~2.4 s) plus the descent from here to the release altitude
        const alt = Math.max(p.y, 600);
        const diveRange = (alt - p.relAlt) / Math.tan(p.diveAng) + p.relAlt / Math.tan(p.diveAng) * 0.55 + 330 + p.speed * 1.5;
        if (p.wave.assessed && range < diveRange && (p.y > 650 || range < 1300)) {
          p.phase = 'rollin'; p.t = 0; p.rollSide = p.jitter > 0 ? 1 : -1;
          p.diveAlt = p.y;
          if (sec && sec.state === 'form') { sec.state = 'roll'; sec.rollT = world.time; }
        }
        spd = formed ? pf.vc : pf.vc * 0.86;
      } else {
        const height = range > 15000 ? p.cruiseAlt : 55 + clamp((range - 5000) / 10000, 0, 1) * (p.cruiseAlt - 55);
        gam = clamp((height - p.y) / 500, -0.07, 0.09);
        // take position on an approach bearing around the target: each section has its own, the aircraft of a section line abreast
        if (range < 9500 && p.wave.assessed) {
          p.phase = 'ip'; p.t = 0;
          const a0 = Math.atan2(p.x - tgt.x, -(p.z - tgt.z));
          const pl = sec ? placeOf(p) : { pos: 0, row: 0 };
          if (sec && sec.state === 'form') { sec.state = 'ip'; sec.ang0 = sec.apAng ?? a0; }
          p.ipAngle = sec ? sec.ang0 : a0;
          p.lat = (pl.pos === 0 ? 0 : pl.pos === 1 ? 1 : -1) * 135; p.row = pl.row;
        }
        spd = formed ? pf.vc : pf.vc * 0.9;
      }
      // a leader with others in his section flies on less than full power, so that they have some to spare to keep up (above all in the climb)
      if (sec && lead === p && sec.members.some((m) => m !== p && live(m))) o = { ...o, powerMax: 0.85 };
      break;
    }
    case 'ip': {      // torpedo bombers: fly to a point on their approach bearing, dropping to wave height
      const D = 4200 + (p.row || 0) * 380, lat = p.lat || 0;
      const ipx = tgt.x + tgt.vx * 40 + Math.sin(p.ipAngle) * D + Math.cos(p.ipAngle) * lat, ipz = tgt.z + tgt.vz * 40 - Math.cos(p.ipAngle) * D + Math.sin(p.ipAngle) * lat;
      const dIp = Math.hypot(ipx - p.x, ipz - p.z);
      const rangeT = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      hdg = Math.atan2(ipx - p.x, -(ipz - p.z));
      gam = clamp((50 - p.y) / 300, -0.08, 0.06);
      spd = pf.vt;
      if (dIp < 700 || rangeT < 3300) { p.phase = 'run'; p.t = 0; }
      break;
    }
    case 'run': {     // straight and level torpedo run
      const range = Math.hypot(tgt.x - p.x, tgt.z - p.z);
      const tt = range / 21;       // torpedo running speed ~ 42 kn
      const ax = tgt.x + tgt.vx * (tt + 3.5) - p.x, az = tgt.z + tgt.vz * (tt + 3.5) - p.z;
      hdg = Math.atan2(ax, -az);
      gam = clamp((46 - p.y) / 160, -0.1, 0.1);
      spd = pf.vt;
      o = { bankMax: 25 * D2R };
      const aligned = Math.abs(wrapPi(hdg - p.heading)) < 0.07;
      if (p.ordnance && range < 1000 + p.jitter * 120 && p.y < 90 && (aligned || range < 650)) dropTorpedo(world, p, tgt, range);
      if (!p.ordnance) { p.phase = 'break'; p.t = 0; }
      if (range < 300) { p.phase = 'break'; p.t = 0; }
      break;
    }
    case 'rollin': {      // the dive bomber rolls over and pulls its nose down onto the target
      const dx = tgt.x + tgt.vx * 20 - p.x, dz = tgt.z + tgt.vz * 20 - p.z;
      hdg = Math.atan2(dx, -dz);
      const u = clamp(p.t / 2.4, 0, 1);
      gam = -p.diveAng * Math.min(1, p.t / 1.6);
      o = { bankOverride: p.rollSide * (1.9 * Math.sin(u * Math.PI) + 0.1 * (1 - u)), pitchRate: 0.55, brakes: true };
      spd = Math.min(pf.vmax * 0.95, pf.vc + 20);
      if (p.t > 2.4) { p.phase = 'dive'; p.t = 0; p.gearDown = false; }
      break;
    }
    case 'dive': {
      // aim point: the ship (+ a systematic error, bigger when the pilot is being shot at)
      const err = 14 + 36 * clamp(p.harass, 0, 1.5);
      const tof = Math.sqrt(2 * Math.max(p.y, 50) / G) * 0.55;
      const ax = tgt.x + tgt.vx * (tof + 1.5) + Math.sin(p.heading) * 22 + p.aimErr[0] * err * 0.5, az = tgt.z + tgt.vz * (tof + 1.5) - Math.cos(p.heading) * 22 + p.aimErr[1] * err * 0.5;
      const dx = ax - p.x, dz = az - p.z;
      const range = Math.hypot(dx, dz);
      hdg = Math.atan2(dx, -dz);
      gam = clamp(-Math.atan2(Math.max(p.y - 8, 20), Math.max(range, 30)), -1.25, -0.65);
      o = { bankOverride: 0, pitchRate: 0.5, brakes: true };
      spd = pf.vd;
      if (p.ordnance && p.y <= p.relAlt && range < 1100) dropBomb(world, p, tgt);
      else if (p.ordnance && p.y < 260) dropBomb(world, p, tgt);
      if (!p.ordnance) { p.phase = 'pullout'; p.t = 0; }
      break;
    }
    case 'pullout': {
      hdg = p.heading + p.rollSide * 0.0;
      gam = 0.04;
      o = { pitchRate: (4.6 - 1) * G / Math.max(p.speed, 60), bankOverride: p.rollSide * 0.35 * Math.max(0, 1 - p.t / 3) };
      spd = pf.vd * 0.78;
      if (p.pitch > -0.05 || p.t > 7) { p.phase = 'egress'; p.t = 0; }
      break;
    }
    case 'break': {
      // torpedo bomber: hard turn away low over the water
      const ang = p.ipAngle ?? p.heading;
      hdg = p.heading + (p.jitter >= 0 ? 1 : -1) * 0.9;
      gam = clamp((70 - p.y) / 200, -0.05, 0.08);
      o = { bankMax: 62 * D2R };
      spd = Math.min(pf.vmax * 0.92, pf.vt * 1.3);
      if (p.t > 5) { p.phase = 'egress'; p.t = 0; }
      break;
    }
    case 'egress': {
      // away from the enemy at low level, then climb; once clear of the target, home by a course that keeps out of the guns' reach
      const away = tgt ? Math.atan2(p.x - tgt.x, -(p.z - tgt.z)) : p.heading;
      hdg = away + p.jitter * 0.5;
      if (p.t > 8 && carrierOk) hdg = safeHeading(world, p, ship.x, ship.z, world.time).hdg;
      gam = p.t < 14 ? clamp((90 - p.y) / 200, -0.06, 0.06) : 0.1;
      spd = Math.min(pf.vmax * 0.9, pf.vc * 1.2);
      if (p.t > 22) p.phase = 'return';
      break;
    }
    case 'return': {
      if (!carrierOk) { p.phase = 'ditch'; break; }
      // to the start of the circuit, ahead of the carrier on the side away from the island; on the way the section closes up behind its leader,
      // and keeps out of the reach of the enemy's guns (sim/homeward.js)
      const cc = circuit(ship, p), pt = cc.point();
      const dx = pt[0] - p.x, dz = pt[2] - p.z, dHome = Math.hypot(dx, dz);
      const alt = ship.y + cc.altDown;
      if (dHome > 3500) {
        const group = p.sec ? p.sec.members.filter((m) => !m.dying && !m.gone && (m.phase === 'return' || m.phase === 'egress')) : [p];
        const c = homeCourse(world, p, p.sec || p, group.length ? group : [p], pt[0], pt[2], pf, alt);
        hdg = c.hdg; gam = c.gam; spd = c.spd;
        if (!c.lead) o = { bankMax: 45 * D2R };
      } else {
        hdg = Math.atan2(dx, -dz);
        gam = clamp((alt - p.y) / 700, -0.08, 0.1);
        spd = pf.vc;
      }
      if (Math.hypot(ship.x - p.x, ship.z - p.z) < 14000) beginRecovery(world, ship);      // the deck park goes below before the first one lands
      if (dHome < 900) {
        p.phase = 'pattern'; p.leg = 1; p.t = 0; p.gearDown = true; p.t0Air = p.age; p.holdT = 0;
      }
      break;
    }
    case 'pattern': {
      // the circuit: downwind past the carrier, then a descending turn to the groove
      if (!carrierOk) { p.phase = 'ditch'; break; }
      if (p.fuel < -90) { p.phase = 'ditch'; break; }
      const cc = circuit(ship, p), dp = ship.model.deckPoints;
      ship.toLocal(p.x, p.y, p.z, _l2);
      const lx = _l2[0], lz = _l2[2];
      p.gearDown = true;
      if (p.leg === 1) {
        // abeam the carrier on the opposite course, a little lower on the way
        // (a lateral correction with damping, so that it settles on the line instead of swinging across it)
        const vl = p.vx * Math.cos(ship.heading) + p.vz * Math.sin(ship.heading);
        const rz = clamp((cc.zDown - lz) * 0.0009 - vl * 0.011, -0.4, 0.4);
        hdg = relHeading(ship, -1, rz);
        // (onto the downwind leg the way of the circuit, as in the break over the ship: never a long turn the other way)
        if (wrapPi(hdg - p.heading) * cc.turn < -2.3) hdg = p.heading + cc.turn * 1.2;
        gam = clamp((ship.y + cc.altDown - p.y) / 500, -0.05, 0.05);
        spd = pf.vp;
        o = { bankMax: 28 * D2R };
        // abeam the turning point: turn in if the groove is free, else hold in a circle away from the ship
        // (on the opposite course and near the downwind line, or it would roll out of the turn far from the centre line)
        if (lx < cc.turnX && Math.abs(wrapPi(p.heading - (ship.heading + Math.PI))) < 0.45 && Math.abs(lz - cc.zDown) < 450) {
          if (mayTurnIn(world, ship, p) || p.holdT > 420) { p.leg = 2; p.t = 0; clearToLand(world, ship, p); }
          else { p.leg = 3; p.holdAng = 0; p.holdPrev = null; }
        }
      } else if (p.leg === 3) {
        // holding: a circle in the ship's frame on the far side of the downwind leg (the ship's own motion is allowed for), until it is the aircraft's turn
        p.holdT += dt;
        const vc = pf.vp * 0.94, R = clamp(vc * vc / (G * Math.tan(40 * D2R)), 260, 620), hx = cc.turnX, hz = cc.zDown + cc.side * R;
        const rx = lx - hx, rz = lz - hz, rl = Math.hypot(rx, rz) || 1;
        const k = clamp((R - rl) / R * 2.2, -1.2, 1.2);
        let vx = cc.side * rz / rl + rx / rl * k, vz = -cc.side * rx / rl + rz / rl * k;
        const vl = Math.hypot(vx, vz) || 1;
        vx = vx / vl * vc + ship.speed; vz = vz / vl * vc;
        hdg = relHeading(ship, vx, vz);
        spd = Math.hypot(vx, vz);
        gam = clamp((ship.y + cc.altDown - p.y) / 500, -0.05, 0.05);
        o = { bankMax: 45 * D2R };
        const th = Math.atan2(rz, rx);
        if (p.holdPrev != null) p.holdAng += wrapPi(th - p.holdPrev);
        p.holdPrev = th;
        if (Math.abs(p.holdAng) > 6.0) p.leg = 1;
      } else {
        // the turn: towards a point on the centre line a few hundred metres ahead of the aircraft (it rolls out on the line instead of across it), the way of the
        // circuit, losing height, until the nose is along the ship's course
        const behind = dp.x0 - lx;
        hdg = relHeading(ship, clamp(behind * 0.35, 250, 700), -lz);
        if (wrapPi(hdg - p.heading) * cc.turn < -1.75) hdg = p.heading + cc.turn * 1.2;
        gam = clamp((ship.y + cc.altTurn - p.y) / 400, -0.06, 0.03);
        spd = pf.vp * 0.9;
        o = { bankMax: 28 * D2R };
        if (Math.abs(wrapPi(p.heading - ship.heading)) < 0.3 && Math.abs(lz) < 350 + Math.max(0, behind) * 0.1) {
          // rolled out well off the centre line (or ahead of the ship): round the circuit again
          if (Math.abs(lz) > 900 || lx > dp.x0 - 400) { p.leg = 1; p.holdT = 0; break; }
          p.phase = 'final'; p.t = 0; p.tdPick = false;
        }
      }
      break;
    }
    case 'final': {
      if (!carrierOk) { p.phase = 'waveoff'; p.t = 0; break; }
      ship.toLocal(p.x, p.y, p.z, _l2);
      const lx = _l2[0], lz = _l2[2];
      const dp = ship.model.deckPoints, wires = ship.model.wires || [dp.x0 + 12];
      const gy = groundY(spec), back = hookBack(spec);
      if (!p.tdPick) {
        // where the hook is to come down: just short of one of the first wires, most often the second or third
        const k = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4][Math.floor(world.rng() * 12)];
        p.tdX = wires[Math.min(k, wires.length - 1)] - 2.2 + back + (world.rng() - 0.5) * 2; p.tdPick = true;
      }
      const behind = p.tdX - lx;                              // metres astern of the touchdown point
      const deckY = ship.y + ship.model.fdY;
      const vrel = Math.max(12, p.speed - ship.speed);
      // line up on the centre line: steer at a point on it ahead of the aircraft, nearer as the deck comes up
      hdg = ship.heading + clamp(Math.atan2(-lz, clamp(behind * 0.5, 120, 800)), -0.45, 0.45);
      const wantY = deckY + gy + 0.18 + clamp(behind, 0, 1900) * 0.062;
      gam = clamp(-0.062 * vrel / Math.max(p.speed, 30) + (wantY - p.y) / 70, -0.1, 0.07);
      spd = Math.max(pf.va, ship.speed + 9) - clamp(1 - behind / 300, 0, 1) * 1.5;
      o = { bankMax: 24 * D2R };
      p.gearDown = true;
      // the landing signal officer waves the aircraft off when the deck is not clear or the approach is bad
      if (behind < 230 && behind > 0 && (!deckClearFor(world, ship, p) || launching(world, ship))) { p.phase = 'waveoff'; p.t = 0; break; }
      if (behind < 150 && behind > 0 && Math.abs(lz) > dp.hw * 0.9) { p.phase = 'waveoff'; p.t = 0; break; }
      if (behind < 0 && lx < dp.x1 - 60 && p.y <= deckY + gy + 0.3 && Math.abs(lz) < dp.hw * 0.85) {
        touchdown(world, ship, p, lx, lz);
        return true;
      }
      if (behind < -35 || (behind < 40 && p.y < deckY + 0.9)) { p.phase = 'waveoff'; p.t = 0; }
      if (behind > 9000) p.phase = 'return';
      break;
    }
    case 'waveoff': {
      hdg = p.heading; gam = 0.09; spd = pf.vc * 0.9;
      o = { bankMax: 10 * D2R };
      p.gearDown = p.t < 9;
      if (p.t > 16) p.phase = 'return';
      break;
    }
    case 'ditch': {
      hdg = p.heading; gam = clamp(-(p.y - 2) / 260, -0.12, 0); spd = pf.va * 1.2;
      p.gearDown = false;
      if (p.y <= 3) { ditch(world, p); return true; }
      break;
    }
    case 'floating': {
      p.t2 = (p.t2 || 0) + dt;
      p.speed = Math.max(0, p.speed - 14 * dt);
      setVel(p);
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.y = 0.2 - Math.max(0, p.t2 - 7) * 0.6;
      p.pitch += (-0.06 - p.pitch) * dt; p.bank += (0.1 - p.bank) * dt;
      if (p.t2 < 8) world.events.push({ type: 'wakeStamp', x: p.x, z: p.z, vx: p.vx, vz: p.vz, kind: 'plane' });
      return p.t2 < 13;
    }
    default: break;
  }
  if (p.phase === 'return' && p.carrierOkLast !== carrierOk) p.carrierOkLast = carrierOk;
  const prev = _prev; prev[0] = p.x; prev[1] = p.y; prev[2] = p.z;
  const T = world.terrain;
  // an island ahead: the pilot climbs over it (not in a dive, on the approach to a deck or at the very low level of a torpedo run)
  if (T && !LAND_BLIND.has(p.phase)) {
    let top = -1e9;
    for (const d of [300, 750, 1300, 2000]) top = Math.max(top, T.heightAt(p.x + Math.sin(p.heading) * d, p.z - Math.cos(p.heading) * d));
    if (top + 35 > p.y) gam = Math.max(gam, clamp((top + 80 - p.y) / 420, 0.05, 0.3));
  }
  guide(p, dt, hdg, gam, spd, o);
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (T) {
    const gh = T.heightAt(p.x, p.z);
    if (gh > 0 && p.y < gh + 2.5 && !DECK_PHASES.has(p.phase)) { landCrash(world, p, gh); return false; }
  }
  // never below the sea: a low pass over the water stays at a few metres
  if (p.y < 4 && p.phase !== 'ditch' && p.phase !== 'floating') {
    p.y = 4; if (p.pitch < 0) p.pitch = 0;
    if (p.phase === 'dive' || p.phase === 'rollin') { crash(world, p, null); return false; }
  }
  return collideShips(world, p, prev);
}
const _l2 = [0, 0, 0], _l3 = [0, 0, 0];
const LAND_BLIND = new Set(['dive', 'rollin', 'pullout', 'ditch', 'floating', 'final', 'waveoff', 'pattern', 'run', 'ip', ...DECK_PHASES]);

/** An aircraft flies into the ground of an island. */
function landCrash(world, p, gh) {
  if (!p.dying) {
    p.owner && (p.owner.lostPlanes = (p.owner.lostPlanes || 0) + 1);
    world.events.push({ type: 'planeDown', plane: p, mode: 'dive', x: p.x, y: p.y, z: p.z, cause: 'crash', hasOrdnance: p.ordnance, attacker: null });
  }
  world.events.push({ type: 'planeCrash', plane: p, x: p.x, y: gh, z: p.z, water: false, land: true, ship: null, speed: p.speed, ordnance: p.bomb ?? p.ordnance });
  spawnScrap(world, p.x, gh + 1, p.z, 7, 14, p.vx * 0.2, p.vz * 0.2, 0.9);
}
const _prev = [0, 0, 0];

function dropBomb(world, p, tgt) {
  p.ordnance = false;
  const kg = p.spec.bombKg || 250;
  const b = {
    id: nextBomb++, owner: p.owner, team: p.team, kg, x: p.x + Math.sin(p.heading) * 3, y: p.y - 1.5, z: p.z - Math.cos(p.heading) * 3,
    vx: p.vx, vy: p.vy, vz: p.vz, age: 0, mesh: kg >= 400 ? 'bomb500' : 'bomb250', target: tgt, plane: p,
  };
  world.bombs.push(b);
  world.events.push({ type: 'bombDrop', plane: p, bomb: b, x: b.x, y: b.y, z: b.z });
}

function dropTorpedo(world, p, tgt, range) {
  p.ordnance = false;
  const a = p.heading;
  world.spawnTorpedo({
    owner: p.owner, x: p.x + Math.sin(a) * 4, z: p.z - Math.cos(a) * 4, vx: Math.sin(a) * 21.5, vz: -Math.cos(a) * 21.5, speed: 21.5, range: 2600, warhead: 230, team: p.team,
    air: true, h: Math.max(8, p.y - 3), hv: p.vy, fallSpeed: p.speed * 0.85, fallDir: a,
  });
  world.events.push({ type: 'torpedoDrop', plane: p, x: p.x, y: p.y, z: p.z, bearing: a });
}

// ---- bombs -------------------------------------------------------------------------------------------------------
function stepBombs(world, dt) {
  const arr = world.bombs;
  for (let i = arr.length - 1; i >= 0; i--) {
    const b = arr[i];
    const px = b.x, py = b.y, pz = b.z;
    b.vy -= G * dt;
    const k = Math.exp(-0.00035 * Math.hypot(b.vx, b.vy, b.vz) * dt);
    b.vx *= k; b.vz *= k; b.vy *= k;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.age += dt;
    let done = false;
    for (const ship of world.ships) {
      if (ship.team === b.team || ship.state === 'sunk') continue;
      if (!segmentNearShip(ship, px, py, pz, b.x, b.y, b.z)) continue;
      const hit = segmentHit(ship, px, py, pz, b.x, b.y, b.z);
      if (hit) { if (ship.state === 'afloat' || ship.sinkDepth < 3) resolveBombHit(world, ship, b, hit); done = true; break; }
    }
    // the ground of an island: a base is wrecked by it, bare ground only throws up earth
    if (!done && world.terrain && b.y < 120) {
      if (world.bases.length && bombHitsBase(world, b)) done = true;
      else if (world.terrain.heightAt(b.x, b.z) > 0 && b.y <= world.terrain.heightAt(b.x, b.z)) {
        const gh = world.terrain.heightAt(b.x, b.z);
        world.events.push({ type: 'landImpact', x: b.x, y: gh, z: b.z, cal: 130 + Math.sqrt(b.kg) * 7, shell: 'HE', dx: b.vx, dz: b.vz, bomb: true });
        done = true;
      }
    }
    if (!done && b.y <= 0) {
      const f = py / (py - b.y);
      const wx = px + (b.x - px) * f, wz = pz + (b.z - pz) * f;
      world.events.push({ type: 'splash', x: wx, z: wz, cal: 300, bomb: true });
      for (const ship of world.ships) if (ship.team !== b.team && ship.state === 'afloat') resolveNearMiss(world, ship, b, wx, wz);
      done = true;
    }
    if (done || b.age > 40) arr.splice(i, 1);
  }
}

// ---- anti-aircraft fire ---------------------------------------------------------------------------------------------
function planeThreats(world, ship) {
  const out = [];
  for (const p of world.planes) {
    if (p.team === ship.team || DECK_PHASES.has(p.phase) || p.y < 2 || p.ground) continue;
    const dx = p.x - ship.x, dz = p.z - ship.z, d = Math.hypot(dx, dz);
    if (d > FLAK_RANGE) continue;
    out.push({ p, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

/**
 * Can the light mount `a` of `ship` bear on aircraft `p` (a point of the sky, with a lead of `lead` s)? Inside the arc it can be trained over, between the
 * lowest elevation at which the barrel clears the ship and the highest it reaches (a flight deck above the sponson stops it, a mount tops out at its
 * own limit: an aircraft right overhead is safe from a 25 mm). Returns the aim { rel, elev } or null.
 */
function aaAim(ship, a, p, cfg, lead) {
  const w = ship.toWorld(a.rec.x, a.rec.y + 1.2, a.rec.z, _w);
  const dx = p.x + p.vx * lead - w[0], dy = p.y + p.vy * lead - w[1], dz = p.z + p.vz * lead - w[2];
  const rel = inArcRel(a.rec, wrapPi(Math.atan2(dx, -dz) - ship.heading - a.rec.yaw0)), elev = Math.atan2(dy, Math.hypot(dx, dz));
  return { rel, elev, dx, dy, dz, ok: aaCan(a.rec, rel, elev, cfg) };
}

function aaCan(rec, rel, elev, cfg) {
  if (rec.noArc || rel < rec.arcMin || rel > rec.arcMax) return false;
  const phi = rec.yaw0 + rel, lo = clearElev(rec, phi);
  return elev >= (lo > 0.001 ? lo : -0.2) && elev <= Math.min(cfg.elevMax * D2R, clearMax(rec, phi));
}

/** Can the dual-purpose mount `m` bear on aircraft `p` (its arc, the elevation range of the gun and of the ship around it)? */
function flakCan(ship, m, p) {
  const w = ship.toWorld(m.rec.x, m.rec.y + 1.2, m.rec.z, _w);
  const dx = p.x + p.vx * 2.2 - w[0], dy = p.y + p.vy * 2.2 - w[1], dz = p.z + p.vz * 2.2 - w[2];
  const rel = inArcRel(m.rec, wrapPi(Math.atan2(dx, -dz) - ship.heading - m.rec.arcC)), e = Math.atan2(dy, Math.hypot(dx, dz));
  if (m.rec.noArc || rel < m.rec.arcMin || rel > m.rec.arcMax) return false;
  const phi = m.rec.arcC + rel, lo = clearElev(m.rec, phi);
  return e >= (lo > 0.001 ? lo : -0.2) && e <= Math.min(m.gun.maxElevDeg * D2R, clearMax(m.rec, phi));
}

function updateAA(world, dt) {
  if (!world.planes.length) {
    // relax the guns
    for (const ship of world.ships) for (const a of ship.aaMounts) { a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4); }
    return;
  }
  const rng = world.rng;
  for (const ship of world.ships) {
    if (ship.state !== 'afloat') continue;
    const threats = planeThreats(world, ship);
    const lowAmmo = ship.aaAmmo().frac < 0.2;
    // light AA mounts
    for (const a of ship.aaMounts) {
      a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4);
      if (!a.alive) continue;
      if (a.ammo <= 0) { a.target = null; continue; }
      const cfg = AA[a.rec.variant];
      a.retarget -= dt;
      if (a.retarget <= 0 || !a.target || a.target.dying || !world.planes.includes(a.target)) {
        a.retarget = 0.35 + rng() * 0.5;
        a.target = null;
        // the plane threatening this ship first, within reach of the gun
        let best = null, bs = 1e9;
        for (const { p, d } of threats) {
          if (d > cfg.range * 1.05 || p.y > 3400) continue;
          if (!aaAim(ship, a, p, cfg, d / 600).ok) continue;      // not in its arc, or above or below what the barrel reaches
          // the aircraft that are going for this ship, and those already in their attack, come first; the dying ones last
          const attacking = ATTACK_PHASES.has(p.phase);
          // low on rounds a gun keeps them for the aircraft that are after its own ship
          if (lowAmmo && !(p.target === ship && attacking)) continue;
          const s = d * (p.target === ship ? 0.6 : 1) * (attacking ? 0.6 : 1) * (p.dying ? 2.5 : 1);
          if (s < bs) { bs = s; best = p; }
        }
        a.target = best;
      }
      const p = a.target;
      if (!p) { a.elev += (0.25 - a.elev) * Math.min(1, dt * 1.5); continue; }
      // slew towards the lead point
      const w = ship.toWorld(a.rec.x, a.rec.y + 1.2, a.rec.z, _w);
      const t0 = Math.hypot(p.x - w[0], p.z - w[2]) / 600;
      const dx = p.x + p.vx * t0 - w[0], dy = p.y + p.vy * t0 - w[1], dz = p.z + p.vz * t0 - w[2];
      const hd = Math.hypot(dx, dz);
      const want = Math.atan2(dx, -dz) - ship.heading - a.rec.yaw0;
      const elevWant = Math.atan2(dy, hd), full = a.rec.arcMax - a.rec.arcMin > 6.2;
      // a mount with a free circle takes the short way round; one with a blind sector is stopped by it (it cannot swing through the tower)
      const trainTo = full ? a.train + wrapPi(want - a.train) : clamp(inArcRel(a.rec, wrapPi(want)), a.rec.arcMin, a.rec.arcMax);
      a.train += clamp(trainTo - a.train, -cfg.turn * D2R * dt, cfg.turn * D2R * dt);
      a.elev += clamp(clamp(elevWant, -0.2, cfg.elevMax * D2R) - a.elev, -cfg.turn * D2R * dt, cfg.turn * D2R * dt);
      const dist = Math.hypot(dx, dy, dz);
      if (dist > cfg.range) continue;
      if (!aaCan(a.rec, inArcRel(a.rec, wrapPi(want)), elevWant, cfg)) continue;        // it follows the aircraft as far as it can, but cannot fire
      const aligned = Math.abs(wrapPi(want - a.train)) < 0.12;
      if (!aligned) continue;
      // the rounds that reach the aircraft: where the barrels point, against where the aircraft will be when the rounds get there; the pattern of the rounds is
      // wider the longer the range (dispersion and laying error), and what it covers of the aircraft is the area the aircraft shows along the line of fire
      const fall = Math.pow(1 - dist / cfg.range, 1.5);
      a.ammo = Math.max(0, a.ammo - cfg.rps * a.rec.n * dt * 0.6);      // every barrel fires at its rate while it has the aircraft in sight
      const hitRate = lightAAHitRate(ship, a, p, cfg, w, dist);       // hits a second
      if (rng() < hitRate * dt) hitPlane(world, ship, p, cfg.hit * (0.7 + 0.6 * rng()), a.rec.cal);
      // visible fire
      a.burstLeft -= dt;
      if (a.burstLeft <= 0) {
        a.burstLeft = 0.26 + rng() * 0.16;
        a.flash = 1; a.recoil = 1;
        world.events.push({ type: 'aaFire', ship, mount: a, plane: p, x: w[0], y: w[1], z: w[2], cal: a.rec.cal, n: a.rec.n, variant: a.rec.variant });
      }
      p.harass = Math.min(2, p.harass + dt * 0.1 * fall);
    }
    // heavy dual-purpose guns: flak bursts
    for (const m of ship.mounts) {
      if (m.group !== 'sec' || !m.alive || m.gun.cal > 140 || m.gun.maxElevDeg < 55 || m.noAmmo || m.jam > 0) continue;
      m.airT = (m.airT || 0) - dt;
      if (m.airT <= 0 || !m.airTarget || !world.planes.includes(m.airTarget)) {
        m.airT = 0.8 + rng() * 0.6; m.airTarget = null;
        let best = null, bs = 1e9;
        for (const { p, d } of threats) {
          if (d > FLAK_RANGE || p.y > 5500 || p.dying) continue;
          if (!flakCan(ship, m, p)) continue;                   // behind the superstructure, or higher than the guns rise
          const s = d * (p.target === ship ? 0.5 : 1);
          if (s < bs) { bs = s; best = p; }
        }
        m.airTarget = best;
      }
      const p = m.airTarget;
      if (!p) continue;
      m.busyAir = true;
      m.reload = Math.max(0, m.reload - dt);
      const w = ship.toWorld(m.rec.x, m.rec.y + 1.2, m.rec.z, _w);
      const dx = p.x + p.vx * 2.2 - w[0], dy = p.y + p.vy * 2.2 - w[1], dz = p.z + p.vz * 2.2 - w[2];
      const hd = Math.hypot(dx, dz), dist = Math.hypot(dx, dy, dz);
      const bearing = Math.atan2(dx, -dz);
      const rel = inArcRel(m.rec, wrapPi(bearing - ship.heading - m.rec.arcC));
      const needElev = Math.atan2(dy, hd), phi = m.rec.arcC + clamp(rel, m.rec.arcMin, m.rec.arcMax);
      // the arc the mount can be trained over (towers and other mounts are in the way elsewhere), and the elevations it can reach there
      const inArc = !m.rec.noArc && rel >= m.rec.arcMin && rel <= m.rec.arcMax && needElev <= Math.min(m.gun.maxElevDeg * D2R, clearMax(m.rec, phi)) && needElev >= (clearElev(m.rec, phi) > 0.001 ? clearElev(m.rec, phi) : -0.2);
      const rate = m.gun.trainRate * D2R * dt * 1.6;
      m.trainRel += clamp(clamp(rel, m.rec.arcMin, m.rec.arcMax) - m.trainRel, -rate, rate);
      m.elev += clamp(clamp(needElev, 0, Math.min(m.gun.maxElevDeg * D2R, 1.45)) - m.elev, -rate, rate);
      if (!inArc || m.reload > 0 || dist > FLAK_RANGE) continue;
      if (Math.abs(rel - m.trainRel) > 0.07) continue;
      // flak is high-explosive from the mount's own magazine
      if (m.ammo.HE < m.n) { if (m.ammo.HE + m.ammo.AP <= 0) m.noAmmo = true; continue; }
      m.ammo.HE -= m.n; m.loaded = 'HE';
      m.reload = m.gun.reload * (0.9 + rng() * 0.2) * 1.15;
      m.recoil = 0; m.fireT = 0; m.flash = 1;
      // fuze setting error grows with distance; the burst is lethal within ~20 m
      const sig = 12 + dist * 0.016 + 14 * p.harass;
      const ox = rng.normal() * sig, oy = rng.normal() * sig, oz = rng.normal() * sig;
      const off = Math.hypot(ox, oy, oz);
      // the burst is judged from the outline of the aircraft, not from its centre: a wide aircraft is hit by a burst further from its middle
      const offHull = Math.max(0, off - extentToward(p, ox / (off || 1), oy / (off || 1), oz / (off || 1)) * 0.45);
      const bx = p.x + p.vx * 0.2 + ox, by = p.y + oy, bz = p.z + p.vz * 0.2 + oz;
      world.events.push({ type: 'flak', ship, mount: m, x: bx, y: by, z: bz, cal: m.gun.cal, mx: w[0], my: w[1], mz: w[2], n: m.n });
      world.events.push({ type: 'muzzle', ship, mount: m, x: w[0] + Math.sin(ship.heading + m.rec.arcC + m.trainRel) * 4, y: w[1] + 2, z: w[2] - Math.cos(ship.heading + m.rec.arcC + m.trainRel) * 4, dx: 0, dy: 1, dz: 0, cal: m.gun.cal, n: m.n, group: 'aa' });
      p.harass = Math.min(2, p.harass + 0.25 * clamp(1 - off / 90, 0, 1));
      const lethal = 22 + m.gun.cal * 0.12;
      if (offHull < lethal * 1.5) hitPlane(world, ship, p, 1.6 * clamp(1 - offHull / (lethal * 1.5), 0.2, 1) * m.n * 0.7, m.gun.cal);
    }
  }
}

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
  if (p.dying) return;
  if (p.ground && p.base) { killGroundPlane(world, p.base, p, attacker, cause); return; }
  const rng = world.rng;
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
function stepDying(world, p, dt) {
  p.dyingT += dt;
  const rng = world.rng;
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
function collideShips(world, p, prev) {
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

function ditch(world, p, burning) {
  world.events.push({ type: 'planeDitch', plane: p, x: p.x, z: p.z });
  world.events.push({ type: 'splash', x: p.x, z: p.z, cal: 220 });
  p.phase = 'floating'; p.dying = false; p.t2 = 0; p.y = 0.2; p.pitch = 0; p.roll = 0; p.bank = 0.1; p.gearDown = false;
  p.lost.engine = true;
  p.speed = Math.min(p.speed, 36);
  setVel(p); p.vy = 0;
  if (burning) world.addSeaFire(p.x, p.z, 7, 18, 0.5);
}

/** The aircraft hits the water, or a ship. */
function crash(world, p, ship, hit) {
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
