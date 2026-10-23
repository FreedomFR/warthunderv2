// Carrier aircraft. A wave of dive bombers and torpedo bombers takes off from the flight deck, flies to the
// enemy, attacks (bombs are dropped from a steep dive, torpedoes from a low level run), is shot at by the
// ships' anti-aircraft guns (damaged aircraft smoke, burn and fall until they hit the sea or a ship), then
// returns and lands on the carrier. Bombs and torpedoes are simulated bodies, so where they hit decides the damage.
import { airTorpedoEq } from '../data/explosives.js';
import { clamp, wrapPi, D2R, G } from '../math.js';
import { planeTypeFor, PLANES, groundY, GROUND_PITCH, hookBack } from '../model/planes.js';
import { perfOf } from './airperf.js';
import { chooseApproach, aaSources, density, refugeShip } from './routing.js';
import { safeHeading, homeCourse } from './homeward.js';
import { chooseSite, divert } from './landing.js';
import { pickLoadout, bombsIn } from '../data/loadouts.js';
import { genericBomb } from '../data/ordnance.js';
import { fighterSteer, fighterFields, bomberDefense, markHunted } from './fighters.js';
import { deckOf, planLaunch, settleService, beginRecovery, launching, stepDeck, stepDeckShip, touchdown, clearToLand, deckClearFor, DECK_PHASES } from './deck.js';
import { segmentNearShip, segmentHit, resolveBombHit, resolveNearMiss } from './damage.js';
import { stepBasePlane } from './airfield.js';
import { bombHitsBase } from './baseops.js';
import { updateAA } from './planeaa.js';
import { hitPlane, stepDying, collideShips, ditch, crash, landCrash, tickPlaneDamage } from './planedamage.js';
import { setVel, guide, stallSpeed } from './flight.js';

let nextPlane = 1;
let nextBomb = 1;
/** New ids for the aircraft and the bombs made outside this file (sim/airfield.js). */
export const planeId = () => nextPlane++;
export const bombId = () => nextBomb++;
/** A new world starts the numbering again: some aircraft behaviour (the weave of an escort) follows the id, so two battles of one process must not differ by the ids of the earlier ones. */
export const resetAirIds = () => { nextPlane = 1; nextBomb = 1; };



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
/** In the circuit of a carrier an aircraft keeps clear of the one ahead of it: the speed factor (1 down to 0.8) for the one that has another less than 450 m ahead (or beside it and older). */
function circuitGap(world, ship, p) {
  let f = 1;
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  for (const q of world.planes) {
    if (q === p || q.owner !== ship || q.phase !== 'pattern' || q.dying) continue;
    const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y, d = Math.hypot(dx, dz);
    if (d > 450 || Math.abs(dy) > 60) continue;
    const ahead = (dx * fx + dz * fz) / Math.max(d, 1);
    if (ahead < -0.2 || (ahead < 0.3 && q.id > p.id)) continue;       // (the one behind gives way; side by side, the newer)
    f = Math.min(f, 0.8 + 0.2 * clamp((d - 120) / 330, 0, 1));
  }
  return f;
}
/** Climbing away from the deck and circling to assemble, an aircraft keeps clear of the one ahead of it: the speed it may not exceed (m/s; Infinity when nobody is in the way). */
function assembleGap(world, ship, p) {
  let cap = Infinity;
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading), floor = stallSpeed(p, false) * 1.15;
  for (const q of world.planes) {
    if (q === p || q.owner !== ship || q.phase !== 'assemble' || q.dying) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > 240 || Math.abs(q.y - p.y) > 45) continue;
    const ahead = (dx * fx + dz * fz) / Math.max(d, 1);
    if (ahead < -0.2 || (ahead < 0.5 && q.id > p.id)) continue;
    cap = Math.min(cap, Math.max(floor, q.speed * (0.9 + 0.1 * clamp((d - 60) / 180, 0, 1))));
  }
  return cap;
}
/** Two aircraft of a wave that come within 160 m of each other at about the same height while assembling: the younger climbs out of the way (extra climb angle). */
function assembleLift(world, ship, p) {
  for (const q of world.planes) {
    if (q === p || q.id > p.id || q.owner !== ship || q.phase !== 'assemble' || q.dying) continue;
    if (Math.hypot(q.x - p.x, q.z - p.z) < 160 && Math.abs(q.y - p.y) < 32) return 0.07;
  }
  return 0;
}
/** May this aircraft turn in for the final approach: the deck is not launching or being cleared, and the aircraft ahead of it is well down its approach (or down)? */
function mayTurnIn(world, ship, p, force = false) {
  const D = deckOf(ship);
  if (!force && (D.striking || launching(world, ship))) return false;
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

// Dive angle (deg, centre of a +-5 range): measured against a screened fleet, 45 deg put no bomb on a ship, the old 58-70 about 15 %, 72-78 over 30 % and the losses stayed the same
// (the aircraft is shot in the approach, not in the pull-out); steeper than 80 the dive is too short to correct the aim.
const DIVE_ANGLE = 74;

/** Does the ship carry thick armour (a deck or a belt a general-purpose bomb cannot go through)? Then the crew hangs armour-piercing bombs, or a torpedo. */
export function armoredShip(t) {
  const a = t && t.stats && t.stats.armor;
  if (!a) return false;
  // (a carrier with a wooden or thin flight deck over its hangar is hurt by a bomb that bursts in the hangar; one with an armoured flight deck is not)
  if (t.stats.type === 'CV') return a.flight >= 50 || (a.flight === 0 && a.deck >= 50);
  return a.deck >= 50 || a.belt >= 150;
}

/** Gives the aircraft the load its crew chose for the target: what it is going to attack decides (the wiki lists the loads of every type). */
export function arm(p, target, noTorp = false) {
  const role = target && target.isBase ? 'base' : 'ship';
  let load = pickLoadout(p.typeKey, role, armoredShip(target));
  if (load && noTorp && load.stores.some((s) => s.torp)) load = pickLoadout(p.typeKey, role === 'ship' ? 'base' : role, false) || load;
  p.loadout = load;
  p.ords = load ? bombsIn(load) : [];
  return p;
}

function bestTarget(world, team, fromX, fromZ, withBases = false) {
  let best = null, bs = -1e9;
  const srcs = aaSources(world, team);
  for (const s of world.ships) {
    if (s.team === team || !s.alive) continue;
    const d = Math.hypot(s.x - fromX, s.z - fromZ);
    if (d > 90000) continue;
    // prefer valuable ships, then near ones
    const sc = s.stats.score * 6000 - d + (s.condition < 0.6 ? 3000 : 0) + world.rng() * 2500 - density(srcs, s) * 2200;
    if (sc > bs) { bs = sc; best = s; }
  }
  if (withBases) for (const b of baseTargets(world, team, fromX, fromZ, srcs)) if (b.sc > bs) { bs = b.sc; best = b.t; }
  return best;
}

/** The enemy bases worth a dive bomber's load, with a score comparable to a ship's: an airfield for the aircraft on its apron and its fuel, a battery for the guns that shoot at the ships. */
function baseTargets(world, team, fromX, fromZ, srcs) {
  const out = [];
  for (const b of world.bases || []) {
    if (b.team === team || b.inert || !b.alive) continue;
    const d = Math.hypot(b.layout.x - fromX, b.layout.z - fromZ);
    if (d > 90000) continue;
    const planes = b.layout.kind === 'airfield' ? b.groundPlanes().length : 0;
    const value = b.layout.kind === 'airfield' ? 1.1 + 0.09 * planes : 0.9;
    out.push({ t: b.target, sc: value * 6000 - d + world.rng() * 2500 - density(srcs, b.target) * 2200 });
  }
  return out;
}

/** the `n` most attractive enemy ships, best first */
function bestTargets(world, team, fromX, fromZ, n) {
  const out = [], srcs = aaSources(world, team);
  for (const sh of world.ships) {
    if (sh.team === team || !sh.alive) continue;
    const d = Math.hypot(sh.x - fromX, sh.z - fromZ);
    if (d > 90000) continue;
    out.push({ sh, sc: sh.stats.score * 6000 - d + (sh.condition < 0.6 ? 3000 : 0) + world.rng() * 2500 - density(srcs, sh) * 2200 });
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
      phase: 'queue', ds: 'pending', t: 0, ts: 0, age: 0, target: null, cond: 1, ordnance: false,
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
    const shipTarget = bestTarget(world, ship.team, ship.x, ship.z), target = bestTarget(world, ship.team, ship.x, ship.z, true);       // (an enemy field or battery may be the best target for the dive bombers)
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
    const nT = shipTarget ? Math.round(n * 0.55) : 0, nD = n - nT;
    const split = (c) => { const out = []; let r = c; while (r > 0) { const k = r === 4 ? 4 : Math.min(3, r); out.push(k); r -= k; } if (out.length > 1 && out[out.length - 1] === 1) { out.pop(); out[out.length - 1]++; } return out; };
    const plan = [...split(nD).map((k) => ['dive', k]), ...split(nT).map((k) => ['torp', k])];
    const targets = bestTargets(world, ship.team, ship.x, ship.z, 2);
    const torpSections = plan.filter((q) => q[0] === 'torp').length;
    wave.sections = [];
    let i = 0, tIdx = 0;
    for (const [kind, k] of plan) {
      const idx = kind === 'torp' ? tIdx++ : wave.sections.filter((q) => q.kind === 'dive').length;
      const sec = { id: wave.sections.length, kind, members: [], wave, target: kind === 'dive' && target.isBase && !wave.sections.some((q) => q.kind === 'dive') ? target : (targets[(wave.sections.length >= 2 && targets.length > 1 && wave.sections.length % 3 === 2) ? 1 : 0] || shipTarget || target), spread: kind === 'torp' ? (idx - (torpSections - 1) / 2) * Math.min(SECTION_SPREAD, 2.4 / Math.max(1, torpSections - 1)) : 0, dLat: (idx - 0.5) * 900, state: 'form', rollT: null };
      wave.sections.push(sec);
      for (let j = 0; j < k; j++, i++) {
        const typeKey = kind === 'torp' ? torp : dive;
        const spec = PLANES[typeKey];
        const p = {
          id: nextPlane++, owner: ship, team: ship.team, kind, typeKey, spec, wave, sec,
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: ship.heading, pitch: 0, roll: 0, bank: 0, speed: 0,
          phase: 'queue', ds: 'pending', t: 0, ts: 0, age: 0, target: sec.target, cond: 1, ordnance: true,
          spin: 0, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
          lx: 0, lz: 0, u: 0, apOff: 0, jitter: (world.rng() - 0.5) * 2, fold: 1, hook: 0, eng: 0, aoa: 0, gp: GROUND_PITCH, yaw: 0, hidden: true, lift: null,
          t0Air: 0, cruiseAlt: kind === 'dive' ? rn(world, 1500, 2000) : rn(world, 420, 650), relAlt: rn(world, 480, 620), fuel: 1700 + world.rng() * 400,
          aimErr: [world.rng.normal(), world.rng.normal()], diveAng: rn(world, (world.airOpts?.dang ?? DIVE_ANGLE) - 5, (world.airOpts?.dang ?? DIVE_ANGLE) + 5) * D2R, group: i,
        };
        p.x = ship.x; p.y = ship.y; p.z = ship.z;
        arm(p, sec.target);
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
const pf0 = (p) => perfOf(p);
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
    if (!p.dead && !p.dying) tickPlaneDamage(world, p, dt);
    const keep = p.dead ? false : p.dying ? stepDying(world, p, dt) : p.base ? stepBasePlane(world, p, dt) : stepPlane(world, p, dt);
    p.roll = p.bank;
    if (!keep) { p.gone = true; arr.splice(i, 1); }
  }
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
    p.target = tgt = st && st.alive ? st : bestTarget(world, p.team, p.x, p.z, p.kind === 'dive');
    if (p.sec && tgt) { p.sec.target = tgt; p.sec.apAng = null; }
    if (!tgt) p.phase = 'return';
  }
  if (p.fuel < 0 && p.phase !== 'ditch' && p.phase !== 'floating' && p.phase !== 'final' && p.phase !== 'pattern' && p.phase !== 'waveoff' && p.phase !== 'return') p.phase = 'return';
  const carrierOk = ship && ship.alive && !ship.deckWrecked;
  // a bomber that fighters are hunting on its way home takes shelter under the guns of the nearest friendly ships
  p.hunted = Math.max(0, (p.hunted || 0) - dt);
  if (p.hunted > 0 && !p.fighter && (p.phase === 'egress' || p.phase === 'return') && p.fuel > 200) { p.phase = 'refuge'; p.calm = 0; p.refuge = null; p.dirOrbit = world.rng() < 0.5 ? -1 : 1; }
  // (the gear and the flaps stay out until it is flying well clear of the stall, not just for a count of seconds: they are what lets it climb off the bow)
  if (p.gearDown && p.age > p.t0Air + 3 && (p.speed > 1.2 * stallSpeed(p, false) || p.age > p.t0Air + 14) && p.phase !== 'pattern' && p.phase !== 'final' && p.phase !== 'waveoff') p.gearDown = false;
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
        gam = (tA < 1.5 ? -0.015 : slow && tA < 9 ? 0.025 : 0.1) + (tA > 4 ? assembleLift(world, ship, p) : 0);
        const cap = assembleGap(world, ship, p);
        spd = Math.min(spd, cap);
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
      const ag = Math.min(1, assembleGap(world, ship, p) / vc);
      vx = vx / vl * vc * ag + ship.speed; vz = vz / vl * vc * ag;
      hdg = relHeading(ship, vx, vz);
      spd = Math.hypot(vx, vz);
      gam = clamp((deckY + pf.asm + (p.group % 4) * 40 - p.y) / 420 + assembleLift(world, ship, p), -0.05, 0.16);
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
      // (it lands wherever it can: its own deck if it is whole, else the nearest ship or field that has room for it)
      p.siteT = (p.siteT ?? 0) - dt;
      if (p.siteT <= 0) {
        p.siteT = 4;
        const site = chooseSite(world, p);
        if (site && ((site.kind === 'base') || site.ship !== ship) && divert(world, p, site)) break;
        p.noSite = !site;
      }
      if (!carrierOk) { if (p.noSite) p.phase = 'ditch'; break; }
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
      if (!carrierOk) { p.phase = 'return'; p.siteT = 0; break; }
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
        spd = pf.vp * circuitGap(world, ship, p);
        o = { bankMax: 28 * D2R };
        // abeam the turning point: turn in if the groove is free, else hold in a circle away from the ship
        // (on the opposite course and near the downwind line, or it would roll out of the turn far from the centre line)
        if (lx < cc.turnX && Math.abs(wrapPi(p.heading - (ship.heading + Math.PI))) < 0.45 && Math.abs(lz - cc.zDown) < 450) {
          // (one that has waited seven minutes comes in even if the deck is busy, but never into the aircraft ahead of it)
          if (mayTurnIn(world, ship, p, p.holdT > 420)) { p.leg = 2; p.t = 0; clearToLand(world, ship, p); }
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
        const cg = circuitGap(world, ship, p);
        vx = vx / vl * vc * cg + ship.speed; vz = vz / vl * vc * cg;
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
        spd = pf.vp * 0.9 * circuitGap(world, ship, p);
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
      // (no closer than 350 m astern of the aircraft ahead on the final: it eases off to keep the distance, and goes round when it would close up under 170 m)
      let gapAhead = Infinity, ahead = null;
      for (const q of deckOf(ship).landing) {
        if (q === p || q.phase !== 'final' || q.dying || q.tdX == null) continue;
        ship.toLocal(q.x, q.y, q.z, _l3);
        const g = behind - (q.tdX - _l3[0]);
        if (g > -60 && Math.abs(_l3[2] - lz) < 60 && g < gapAhead) { gapAhead = g; ahead = q; }
      }
      const deckY = ship.y + ship.model.fdY;
      const vrel = Math.max(12, p.speed - ship.speed);
      // line up on the centre line: steer at a point on it ahead of the aircraft, nearer as the deck comes up
      hdg = ship.heading + clamp(Math.atan2(-lz, clamp(behind * 0.5, 120, 800)), -0.45, 0.45);
      const wantY = deckY + gy + 0.18 + clamp(behind, 0, 1900) * 0.062;
      gam = clamp(-0.062 * vrel / Math.max(p.speed, 30) + (wantY - p.y) / 70, -0.1, 0.07);
      spd = Math.max(pf.va, ship.speed + 9) - clamp(1 - behind / 300, 0, 1) * 1.5;
      if (ahead && gapAhead < 350) spd = Math.max(stallSpeed(p, true) * 1.12, Math.min(spd, ahead.speed - 3 - (350 - gapAhead) * 0.03));
      if (ahead && gapAhead < 170 && behind > 260) { p.phase = 'waveoff'; p.t = 0; break; }
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

const _prev = [0, 0, 0];

/** The angle (deg, 0..180) between the course of an aircraft and that of its target: 0 coming up astern, 90 across her, 180 head on. */
function aspectOf(p, tgt) {
  const th = Math.atan2(tgt.vx, -tgt.vz), a = Math.abs(wrapPi(p.heading - (tgt.speed > 1 ? th : tgt.heading)));
  return a * 180 / Math.PI;
}

function dropBomb(world, p, tgt) {
  p.ordnance = false;
  // all that the aircraft carries falls together (the bomb of the centre line and the ones of the wing racks, a little apart across the wing)
  const ords = p.ords && p.ords.length ? p.ords : [genericBomb(p.spec.bombKg || 250)];
  const n = ords.length, rx = Math.cos(p.heading), rz = Math.sin(p.heading), asp = aspectOf(p, tgt);
  let first = null;
  ords.forEach((ord, i) => {
    // (the heavy one hangs on the centre line; the others in pairs on either side of it)
    const side = i === 0 ? 0 : (i % 2 ? -1 : 1) * (2.4 + 1.8 * Math.floor((i - 1) / 2)) * (n > 3 ? 0.7 : 1);
    const b = {
      id: nextBomb++, owner: p.owner, team: p.team, kg: ord.kg, ord, x: p.x + Math.sin(p.heading) * 3 + rx * side, y: p.y - 1.5, z: p.z - Math.cos(p.heading) * 3 + rz * side,
      vx: p.vx, vy: p.vy, vz: p.vz, age: 0, mesh: ord.kg >= 400 ? 'bomb500' : 'bomb250', target: tgt, plane: p, asp, kind: p.kind,
    };
    world.bombs.push(b);
    if (!first) first = b;
  });
  world.events.push({ type: 'bombDrop', plane: p, bomb: first, x: first.x, y: first.y, z: first.z });
}

export function dropTorpedo(world, p, tgt, range, count = 1) {
  p.ordnance = false;
  const a = p.heading, rx = Math.cos(a), rz = Math.sin(a);
  for (let k = 0; k < count; k++) {
    // (two torpedoes hang a few metres apart across the aircraft and run side by side)
    const off = count > 1 ? (k - (count - 1) / 2) * 7 : 0;
    world.spawnTorpedo({
      owner: p.owner, x: p.x + Math.sin(a) * 4 + rx * off, z: p.z - Math.cos(a) * 4 + rz * off, vx: Math.sin(a) * 21.5, vz: -Math.cos(a) * 21.5, speed: 21.5, range: 2600, warhead: airTorpedoEq(p.owner && p.owner.stats && p.owner.stats.nation), team: p.team,
      air: true, h: Math.max(8, p.y - 3), hv: p.vy, fallSpeed: p.speed * 0.85, fallDir: a, asp: aspectOf(p, tgt), drop: range,
    });
  }
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
      if (hit) { if (ship.state === 'afloat' || ship.sinkDepth < 3) resolveBombHit(world, ship, b, hit); world.events.push({ type: 'bombResult', hit: true, asp: b.asp, kind: b.kind, plane: b.plane }); done = true; break; }
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
      world.events.push({ type: 'bombResult', hit: false, asp: b.asp, kind: b.kind, plane: b.plane });
      for (const ship of world.ships) if (ship.team !== b.team && ship.state === 'afloat') resolveNearMiss(world, ship, b, wx, wz);
      done = true;
    }
    if (done || b.age > 40) arr.splice(i, 1);
  }
}
