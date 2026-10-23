// Flight-deck operations of an aircraft carrier.
// Launch: a plane leaves the deck park or comes up from the hangar on a lift, unfolds its wings, starts its engine, taxis to the head of the
// queue and makes its take-off run. Recovery: it touches down behind the arrester wires, the hook catches one, the wire pays out and stops it,
// the wings fold and it taxis to a lift that takes it down to the hangar. Between the two the deck crew work too: the aircraft parked on deck
// are struck below before a recovery and the park is spotted again from the hangar afterwards.
// Aircraft on deck are placed in the ship's frame (lx forward, lz to starboard); the world position follows the ship.
import { clamp, wrapPi, G } from '../math.js';
import { perfOf } from './airperf.js';
import { groundY, GROUND_PITCH, hookBack, PLANES } from '../model/planes.js';

export const TAKEOFF_RUN = 100;      // distance before the bow where the take-off run starts (m)
const LIFT_DEPTH = 6.4;              // from the hangar deck up to the flight deck (m)
const LIFT_DOWN = 2.4, LIFT_UP = 2.9;  // seconds for the platform to go down / up
const UNFOLD = 2.8, FOLD = 3.4;      // seconds to spread / fold the wings
const TAXI = 7;                      // taxi speed (m/s)
const GAP = 14.5;                    // between aircraft in the queue (m)
const CLEAR_X = 75;                  // an aircraft that has rolled this far past the stern end has left the landing area (m)
const RUN_ACC = 5.8;                 // take-off acceleration (m/s^2)
const STRIKE_EVERY = 4.5;            // seconds between two aircraft of the park going below
const RESPOT_EVERY = 5.5;

/** Phases an aircraft is in while it is on a carrier's deck (or on its lifts). */
export const DECK_PHASES = new Set(['queue', 'takeoff', 'rollout', 'taxiIn']);

const smooth = (s) => { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); };
const _w = [0, 0, 0];
let nextServiceId = 5e6;

/** The deck state of a carrier: lifts, the queue of aircraft cleared to land, the wire in use, the deck crew's work. */
export function deckOf(ship) {
  if (ship._deck) return ship._deck;
  const m = ship.model;
  ship._deck = {
    lifts: (m.elevators || []).map((e) => ({ ...e, h: 1, tgt: 1, user: null })),
    pending: [],              // aircraft waiting for a lift, in order
    landing: [],              // aircraft cleared to land, in order
    wire: null,               // the arrester wire in use: { x, zs, ax, az, rel }
    recovering: false,        // aircraft are landing or taxiing after a landing
    striking: false,          // the deck park is being struck below
    nextService: 0,
    circuit: 0,               // aircraft of this ship on their way back
  };
  return ship._deck;
}

const SERVICE_TIME = 300;           // seconds a landed aircraft spends being refuelled and rearmed before it can fly again

/** An aircraft that has come down to the hangar is serviced (refuelled, rearmed, a crew rested) before it counts as ready. */
function recover(world, ship, p) {
  ship.air.servicing.push({ at: world.time + SERVICE_TIME * (0.8 + 0.4 * world.rng()), fighter: !!p.fighter });
}

/** Is any aircraft of the ship still waiting for, or on, its take-off run? */
export function launching(world, ship) {
  for (const p of world.planes) if (p.owner === ship && !p.service && (p.phase === 'queue' || p.phase === 'takeoff') && !p.gone) return true;
  return false;
}

/** Number of aircraft the ship keeps spotted on deck, from what is left of its air group. */
function wantParked(ship) {
  const slots = ship.model.deckSlots.length;
  return ship.air ? Math.round(slots * ship.air.ready / Math.max(1, ship.stats.air.capacity)) : 0;
}

// ---- launch --------------------------------------------------------------------------------------------------------
/** The deck crew stop what they are doing: the aircraft being respotted are already in their places, the ones being struck are gone. */
export function settleService(world, ship) {
  const D = deckOf(ship);
  for (const q of world.planes) {
    if (q.owner !== ship || !q.service) continue;
    if (q.service === 'respot') ship.parked = Math.min(ship.model.deckSlots.length, ship.parked + 1);
    q.kill = true;
  }
  D.pending = D.pending.filter((q) => !q.service);
  D.striking = false;
}

/**
 * Give each aircraft of a new wave (in launch order) its way onto the deck: the first ones leave the deck park (the highest slots, nearest the
 * start of the run, first), the others come up on the lifts.
 */
export function planLaunch(world, ship, planes) {
  const D = deckOf(ship), dp = ship.model.deckPoints, slots = ship.model.deckSlots;
  const startX = dp.x1 - TAKEOFF_RUN;
  const usable = D.lifts.filter((l) => l.x + l.hl < startX - 4);
  const parkedBefore = ship.parked;
  const nPark = clamp(parkedBefore, 0, planes.filter((q) => !q.fighter).length);       // the fighters come up on the lifts
  ship.parked = parkedBefore - nPark;
  planes.forEach((p, j) => {
    p.group = j;
    if (j < nPark && slots[parkedBefore - 1 - j]) {
      const sl = slots[parkedBefore - 1 - j];
      p.ds = 'spot'; p.hidden = false; p.fold = 1; p.lx = sl.x; p.lz = sl.z; p.lz0 = sl.z; p.lx0 = sl.x; p.yaw = sl.yaw || 0;
      p.ts = -(j * 2.8);        // the wings spread and the engine starts a little before its turn
    } else if (usable.length) {
      p.ds = 'pending'; p.hidden = true; p.fold = 1; D.pending.push(p);
    } else {
      // no lift behind the start of the run: the aircraft is simply there, in the queue
      p.ds = 'spot'; p.hidden = false; p.fold = 1; p.lx = startX - (planes.length - j) * GAP - 20; p.lz = 0; p.lz0 = 0; p.lx0 = p.lx; p.yaw = 0; p.ts = -(j * 2.8);
    }
    p.lift = null; p.eng = 0; p.hook = 0; p.gp = GROUND_PITCH; p.u = 0;
  });
}

/** A lift that is up and unoccupied for the plane at the head of the line: aft of the start of the run for a launch, nearest the slot for a respot. */
function freeLift(D, startX, p) {
  let best = null, bs = 1e9;
  for (const l of D.lifts) {
    if (l.user || l.h < 0.99) continue;
    if (!p.service && l.x + l.hl >= startX - 4) continue;
    // the deck crew tow an aircraft only so far: a lift well away from its place in the park is no use to it
    if (p.service === 'respot' && Math.abs(l.x - p.slotX) > 110) continue;
    const sc = p.service === 'respot' ? Math.abs(l.x - p.slotX) + (l.edge ? 30 : 0) : -l.x;
    if (sc < bs) { bs = sc; best = l; }
  }
  return best;
}

/** An aircraft of the deck crew's work: struck below out of the park, or spotted into it from the hangar. */
function servicePlane(world, ship, service, slotIdx) {
  const slot = ship.model.deckSlots[slotIdx], key = ship.parkType || 'sbd', spec = PLANES[key];
  const p = {
    id: nextServiceId++, owner: ship, team: ship.team, kind: null, typeKey: key, spec, wave: null, sec: null, service, slotIdx, slotX: slot.x,
    x: ship.x, y: ship.y, z: ship.z, vx: 0, vy: 0, vz: 0, heading: ship.heading, pitch: 0, roll: 0, bank: 0, speed: 0,
    phase: 'queue', ds: 'pending', t: 0, ts: 0, age: 0, target: null, cond: 1, ordnance: false,
    spin: 0, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
    lx: 0, lz: 0, u: 0, apOff: 0, jitter: 0, fold: 0, hook: 0, eng: 0, aoa: 0, gp: GROUND_PITCH, yaw: 0, hidden: false, lift: null,
    t0Air: 0, cruiseAlt: 0, relAlt: 0, fuel: 1e9, aimErr: [0, 0], diveAng: 0, group: -1, counted: true,
  };
  return p;
}

// ---- per ship, per tick: lifts, the landing queue, the deck crew ------------------------------------------------------------------
export function stepDeckShip(world, ship, dt) {
  const D = deckOf(ship), dp = ship.model.deckPoints, slots = ship.model.deckSlots;
  for (const l of D.lifts) {
    if (l.tgt !== l.moving && l.tgt !== l.h) {
      l.moving = l.tgt;
      ship.toWorld(l.x, ship.model.fdY, l.z, _w);
      world.events.push({ type: 'liftMove', ship, x: _w[0], y: _w[1], z: _w[2] });
    }
    const up = l.tgt > l.h;
    l.h = clamp(l.h + (up ? dt / LIFT_UP : -dt / LIFT_DOWN) * (l.tgt === l.h ? 0 : 1), 0, 1);
    if (up ? l.h > l.tgt : l.h < l.tgt) l.h = l.tgt;
  }
  const startX = dp.x1 - TAKEOFF_RUN;
  // the dispatcher: the next aircraft waiting takes a free lift
  while (D.pending.length) {
    const p = D.pending[0];
    if (p.gone || p.dying || p.kill) { D.pending.shift(); continue; }
    const l = freeLift(D, startX, p);
    if (!l) break;
    // a launching aircraft only comes up when its place in the queue is clear of the lift (or it would keep the lift for the others)
    if (!p.service && p.group > p.wave.launched && startX - (p.group - p.wave.launched) * GAP < l.x + l.hl + 9) break;
    D.pending.shift();
    l.user = p; l.tgt = 0; p.lift = l; p.ds = 'lower'; p.ts = 0;
    p.lx = l.x; p.lz = l.z; p.lx0 = l.x; p.lz0 = l.z; p.yaw = 0;
  }
  // landing queue: drop aircraft that are gone, have left the landing area or are no longer on their way down
  D.landing = D.landing.filter((q) => !q.gone && !q.dying && ((q.phase === 'pattern' || q.phase === 'final') || ((q.phase === 'rollout' || q.phase === 'taxiIn') && q.lx < dp.x0 + CLEAR_X)));
  let rec = D.landing.length > 0, circuit = 0, serviceN = 0, respotN = 0, strikeN = 0;
  for (const q of world.planes) {
    if (q.owner !== ship || q.gone) continue;
    if (q.service) { serviceN++; if (q.service === 'respot') respotN++; else strikeN++; continue; }
    if (q.phase === 'rollout' || q.phase === 'taxiIn') rec = true;
    if (q.phase === 'pattern' || q.phase === 'final' || q.phase === 'waveoff' || (q.phase === 'return' && Math.hypot(q.x - ship.x, q.z - ship.z) < 14000)) circuit++;
  }
  D.recovering = rec; D.circuit = circuit;
  if (ship.air && ship.air.servicing.length) {
    const sv = ship.air.servicing;
    for (let i = sv.length - 1; i >= 0; i--) if (sv[i].at <= world.time) { if (sv[i].fighter) ship.air.fReady++; else ship.air.ready++; sv.splice(i, 1); }
  }
  if (D.wire) D.wire.t += dt;

  // ---- the deck park: struck below when aircraft are coming back, spotted again from the hangar afterwards ----
  if (!slots.length || !ship.air || ship.deckWrecked) { D.striking = false; return; }
  if (D.striking) {
    if (ship.parked > 0 && strikeN < 3 && world.time >= D.nextService && D.lifts.length) {
      const idx = ship.parked - 1;
      const p = servicePlane(world, ship, 'strike', idx);
      ship.parked--;
      p.phase = 'taxiIn'; p.ds = 'wait'; p.ts = 0; p.lx = slots[idx].x; p.lz = slots[idx].z; p.lx0 = p.lx; p.lz0 = p.lz; p.yaw = slots[idx].yaw || 0; p.fold = 1;
      world.planes.push(p);
      D.nextService = world.time + STRIKE_EVERY;
    }
    if (ship.parked === 0 && strikeN === 0) D.striking = false;
  } else if (!rec && circuit === 0 && D.landing.length === 0 && !launching(world, ship) && !D.pending.some((q) => !q.service)) {
    const hangar = ship.air.ready - ship.parked - respotN;
    if (ship.parked + respotN < wantParked(ship) && hangar > 0 && respotN < 2 && world.time >= D.nextService && D.lifts.length) {
      const idx = ship.parked + respotN;
      const p = servicePlane(world, ship, 'respot', idx);
      p.ds = 'pending'; p.hidden = true; p.fold = 1;
      world.planes.push(p);
      D.pending.push(p);
      D.nextService = world.time + RESPOT_EVERY;
    }
  }
}

/** The first aircraft of a recovery is on its way: the park must be cleared; returns the time the deck will be free of it. */
export function beginRecovery(world, ship) {
  const D = deckOf(ship);
  if (D.striking) return;
  // aircraft on their way up from the hangar to the park go back down
  for (const q of world.planes) if (q.owner === ship && q.service === 'respot') q.kill = true;
  D.pending = D.pending.filter((q) => !q.service);
  if (ship.parked > 0 && ship.model.deckSlots.length && D.lifts.length) {
    D.striking = true; D.nextService = Math.max(D.nextService, world.time);
  } else ship.parked = 0;
}

/** The first aircraft turns for the final approach: whatever is still on the park goes below at once. */
function clearPark(world, ship) {
  const D = deckOf(ship);
  if (!D.striking && ship.parked === 0) return;
  ship.parked = 0; D.striking = false;
  for (const q of world.planes) if (q.owner === ship && q.service) q.kill = true;
  D.pending = D.pending.filter((q) => !q.service);
}

// ---- landing: the queue and the slots ----------------------------------------------------------------------------------------
/** The aircraft is cleared for the final approach (it joins the landing queue). */
export function clearToLand(world, ship, p) {
  const D = deckOf(ship);
  clearPark(world, ship);
  if (!D.landing.includes(p)) D.landing.push(p);
}

/** Is the deck free for the aircraft to touch down: nobody ahead of it in the queue is still on the landing area? */
export function deckClearFor(world, ship, p) {
  const D = deckOf(ship), dp = ship.model.deckPoints;
  for (const q of world.planes) if (q.owner === ship && q.service === 'strike' && q.lx < dp.x0 + CLEAR_X) return false;
  for (const q of D.landing) {
    if (q === p) return true;
    if (q.phase === 'pattern' || q.phase === 'final') return false;
    if ((q.phase === 'rollout' || q.phase === 'taxiIn') && q.lx < dp.x0 + CLEAR_X) return false;
  }
  return true;
}

/** Called by the approach when the aircraft's wheels reach the deck. */
export function touchdown(world, ship, p, lx, lz) {
  p.phase = 'rollout'; p.ds = 'roll'; p.ts = 0; p.t = 0;
  p.lx = lx; p.lz = lz; p.lx0 = lx; p.lz0 = lz;
  const rx = p.vx - ship.vx, rz = p.vz - ship.vz;
  p.u = Math.max(12, Math.hypot(rx, rz));
  p.yaw = wrapPi(p.heading - ship.heading);           // (within half a turn: a heading a full turn out would otherwise be unwound on the deck, the aircraft spinning round)
  p.gp = (p.pitch + (p.aoa || 0)) - ship.pitch; p.aoa = 0;      // (the attitude goes over to the deck: the angle of attack is no longer added on top)
  p.hook = 1; p.gearDown = true; p.fold = 0; p.eng = 1; p.hidden = false;
  p.back = hookBack(p.spec);
  p.skip = world.rng() < 0.07;              // the hook skips the wires: a bolter
  p.wireIdx = -1; p.lastHx = lx - p.back;
  p.vy = 0; p.speed = p.u + ship.speed;
  p.squat = 0.22;
  world.events.push({ type: 'planeTouchdown', plane: p, ship, lx, lz, back: p.back });
}

// ---- the aircraft on the deck ----------------------------------------------------------------------------------------------------
function place(p, ship, lx, lz, yExtra = 0) {
  const gy = groundY(p.spec);
  ship.toWorld(lx, ship.model.fdY + gy + 0.04 + yExtra, lz, _w);
  p.x = _w[0]; p.y = _w[1]; p.z = _w[2]; p.lx = lx; p.lz = lz;
  p.heading = ship.heading + p.yaw;
  p.pitch = ship.pitch + p.gp; p.roll = ship.roll; p.bank = ship.roll;
  const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
  p.vx = ship.vx + sh * p.u; p.vz = ship.vz - ch * p.u; p.vy = 0;
  p.speed = Math.hypot(p.vx, p.vz);
}

/** Move along the deck towards (goalX, goalZ), at most to limitX, in a smooth curve from where the aircraft started the move (backwards if it is behind it). */
function taxi(p, ship, dt, goalX, goalZ, limitX, vMax = TAXI) {
  const want = clamp((Math.min(goalX, limitX) - p.lx) * 0.7, -vMax * 0.8, vMax);
  p.u += clamp(want - p.u, -4.5 * dt, 2.8 * dt);
  const lx = p.lx + p.u * dt;
  const dz = goalZ - p.lz0, trans = Math.max(20, Math.abs(dz) * 3.4);
  const s = Math.abs(lx - p.lx0) / trans;
  const lz = goalZ - dz * (1 - smooth(s));
  const rev = goalX < p.lx0 ? -1 : 1;
  const slope = Math.abs(dz) > 0.01 && s > 0 && s < 1 ? rev * dz * 6 * s * (1 - s) / trans : 0;     // d lz / d lx
  const yawT = Math.atan(slope);
  p.yaw += (yawT - p.yaw) * Math.min(1, dt * 3.5);
  return [lx, lz];
}

const idleSpin = (p, dt, to) => { p.eng += clamp(to - p.eng, -dt / 3.2, dt / 1.8); };

/** The queue ahead of this aircraft: where it has to stop (m, in the ship's frame) and whether it may leave its spot at all. */
function queueLimit(world, ship, p, startX) {
  const w = p.wave;
  let limit = startX - Math.max(0, p.group - w.launched) * GAP;
  const ahead = w.planes.find((q) => q.group === p.group - 1) || null;
  if (ahead && ahead.phase === 'queue' && !ahead.hidden) limit = Math.min(limit, ahead.lx - GAP);
  const mayLeave = !ahead || ahead.phase !== 'queue' || ahead.ds === 'taxi' || ahead.ds === 'hold' || ahead.lx > p.lx + GAP;
  return [limit, mayLeave];
}

/** One tick of an aircraft on the deck. Returns false when it is no longer there (taken below, or lost with the ship). */
export function stepDeck(world, p, dt) {
  const keep = stepDeckInner(world, p, dt);
  if (!keep) leaveLift(p);
  return keep;
}

function stepDeckInner(world, p, dt) {
  const ship = p.owner;
  if (!ship || ship.state === 'sunk' || !ship.model.deckPoints.x1) { leaveLift(p); return false; }
  if (!ship.alive || ship.deckWrecked || p.kill) { leaveLift(p); return false; }
  const D = deckOf(ship), dp = ship.model.deckPoints;
  const startX = dp.x1 - TAKEOFF_RUN;
  p.ts += dt;

  // ---------------- launch (and the deck crew's respot) ----------------
  if (p.phase === 'queue') {
    switch (p.ds) {
      case 'pending': p.hidden = true; return true;
      case 'lower': {          // the lift goes down for it
        p.hidden = true;
        if (p.lift.h <= 0.001) { p.ds = 'rise'; p.ts = 0; p.lift.tgt = 1; }
        return true;
      }
      case 'rise': {           // up from the hangar, wings folded
        const l = p.lift;
        p.hidden = false; p.u = 0; p.yaw = 0;
        place(p, ship, l.x, l.z, -LIFT_DEPTH * (1 - l.h));
        if (l.h >= 0.999) { p.ds = 'spot'; p.ts = p.service ? 0.3 : -0.2; }
        return true;
      }
      case 'spot': {
        // unfolding and starting the engine (aircraft from the deck park have nothing to unfold)
        if (p.ts < 0) { place(p, ship, p.lx, p.lz); return true; }
        if (p.service) {
          // the deck crew tow it folded: no need to spread the wings
          p.u = 0; place(p, ship, p.lx, p.lz);
          if (p.ts > 1.0) { p.ds = 'taxi'; p.ts = 0; p.lx0 = p.lx; p.lz0 = p.lz; }
          return true;
        }
        p.fold = Math.max(0, p.fold - dt / UNFOLD);
        if (!p.started) { p.started = true; world.events.push({ type: 'engineStart', plane: p, ship }); }
        idleSpin(p, dt, 0.4);
        p.u = 0; p.yaw += (0 - p.yaw) * Math.min(1, dt * 3);
        place(p, ship, p.lx, p.lz);
        const [, mayLeave] = queueLimit(world, ship, p, startX);
        if (p.fold <= 0 && p.eng >= 0.38 && p.ts > 1.8 && mayLeave) { p.ds = 'taxi'; p.ts = 0; p.lx0 = p.lx; p.lz0 = p.lz; }
        return true;
      }
      case 'taxi':
      case 'hold': {
        if (p.service) {
          // the deck crew tow it, wings spread, to its place in the park
          const slot = ship.model.deckSlots[p.slotIdx];
          const [lx, lz] = taxi(p, ship, dt, slot.x, slot.z, 1e9, 4.5);
          place(p, ship, lx, lz);
          if (p.lift && Math.abs(lx - p.lift.x) > p.lift.hl + 6) { p.lift.user = null; p.lift = null; }
          if (Math.abs(lx - slot.x) < 0.3 && Math.abs(p.u) < 0.25) {
            p.yaw += (slot.yaw - p.yaw) * Math.min(1, dt * 3);
            // it takes its place when the aircraft before it in the park are there
            if (ship.parked === p.slotIdx || p.ts > 30) { ship.parked = Math.max(ship.parked, p.slotIdx) + 1; return false; }
          }
          return true;
        }
        idleSpin(p, dt, 0.4);
        const [limit] = queueLimit(world, ship, p, startX);
        const [lx, lz] = taxi(p, ship, dt, startX, 0, limit);
        place(p, ship, lx, lz);
        // the lift is free again once the aircraft has rolled clear of it
        if (p.lift && lx > p.lift.x + p.lift.hl + 6) { p.lift.user = null; p.lift = null; }
        p.ds = Math.abs(p.u) < 0.2 && Math.abs(lx - startX) < 2 ? 'hold' : 'taxi';
        if (p.ds === 'hold' && p.group === p.wave.launched && p.ts >= 0 && world.time - (p.wave.lastLaunch ?? -99) > 3.4 && p.eng > 0.35) {
          p.phase = 'takeoff'; p.ds = 'run'; p.t = 0; p.u = 0; p.wave.launched++; p.wave.lastLaunch = world.time;
          world.events.push({ type: 'planeLaunch', plane: p, ship });
        }
        return true;
      }
      default: return true;
    }
  }

  // ---------------- take-off run ----------------
  if (p.phase === 'takeoff') {
    const pf = perfOf(p);
    // the aircraft leaves the deck at its own lift-off speed (less the ship's speed: the deck is already moving through the air)
    const uL = p.uLift ?? (p.uLift = clamp(pf.vto - ship.speed, 14, 30));
    // (an acceleration that brings it to its lift-off speed at the bow: without a catapult the run takes the whole of the deck ahead of it, 6 to 10 s)
    const acc = p.runAcc ?? (p.runAcc = clamp(uL * uL / (2 * Math.max(30, dp.x1 - 3 - p.lx)), 1.6, RUN_ACC));
    p.u += acc * dt;
    idleSpin(p, dt, 1);
    const lx = p.lx + p.u * dt;
    // the tail comes up as the speed builds, then the nose
    p.gp = p.u < uL * 0.36 ? GROUND_PITCH : p.u < uL * 0.68 ? GROUND_PITCH * (1 - (p.u - uL * 0.36) / (uL * 0.32)) : Math.max(0, (p.u - uL * 0.8) * 0.02);
    p.lz += (0 - p.lz) * Math.min(1, dt * 2); p.yaw += (0 - p.yaw) * Math.min(1, dt * 3);
    place(p, ship, lx, p.lz, Math.max(0, p.u - uL * 0.84) * 0.18);
    if (p.u >= uL || lx > dp.x1 - 2) {
      p.phase = 'assemble'; p.asm = 'climb'; p.ds = null; p.t = 0; p.t0Air = p.age; p.eng = null;
      p.speed = Math.max(pf.vto * 0.9, ship.speed + p.u);
      // the attitude it had at the end of the run is kept: the flight path level, the nose up (the angle of attack)
      p.aoa = ship.pitch + p.gp; p.pitch = 0; p.bank = 0; p.roll = 0; p.gp = 0; p.runAcc = null;
      p.vx = Math.sin(p.heading) * p.speed; p.vz = -Math.cos(p.heading) * p.speed; p.vy = 0;
    }
    return true;
  }

  // ---------------- landing roll, wire, dwell ----------------
  if (p.phase === 'rollout') {
    p.gp += (GROUND_PITCH - p.gp) * Math.min(1, dt * 2.2);
    p.squat = Math.max(0, (p.squat || 0) - dt * 0.35);
    p.yaw += (0 - p.yaw) * Math.min(1, dt * 2);
    if (p.ds === 'roll') {
      p.lz += (0 - p.lz) * Math.min(1, dt * 0.35);
      p.u = Math.max(8, p.u - 2.2 * dt);
      const lx = p.lx + p.u * dt, nhx = lx - p.back;
      // does the hook cross a wire?
      if (!p.skip) {
        const wires = ship.model.wires || [];
        for (let k = 0; k < wires.length; k++) {
          const xw = wires[k];
          if (p.lastHx < xw && nhx >= xw) {
            p.ds = 'arrest'; p.ts = 0; p.wireIdx = k; p.u0 = p.u; p.xw = xw;
            // the hydraulic engine lets the wire pay out: the pull builds up and fades again (half a sine), about 1 g at its peak, over 20-70 m
            const peak = (0.7 + world.rng() * 0.3) * G;               // m/s2
            const pay = clamp(p.u * p.u * Math.PI / (4 * peak), 20, 70);   // pay-out before the aircraft stops (m)
            p.arT = 0; p.arDur = 2 * pay / Math.max(p.u, 1);
            D.wire = { x: xw, zs: dp.hw * 0.62, ax: nhx, az: p.lz, t: 0, rel: false };
            world.events.push({ type: 'wireCatch', plane: p, ship, wire: k });
            break;
          }
        }
      }
      p.lastHx = nhx;
      const last = ship.model.wires?.[ship.model.wires.length - 1] ?? dp.x0 + 40;
      if (p.ds === 'roll' && (nhx > last + 7 || (p.skip && nhx > dp.x0 + 40))) {
        // no wire: a bolter, full power and away off the bow
        p.ds = 'bolter'; p.ts = 0;
        world.events.push({ type: 'bolter', plane: p, ship });
      }
      place(p, ship, lx, p.lz, -p.squat * 0.5);
      return true;
    }
    if (p.ds === 'arrest') {
      p.arT += dt;
      const sa = clamp(p.arT / p.arDur, 0, 1);
      p.u = sa >= 1 ? 0 : p.u0 * (1 + Math.cos(Math.PI * sa)) / 2;
      const lx = p.lx + p.u * dt;
      if (D.wire) { D.wire.ax = lx - p.back; D.wire.az = p.lz; }
      // the nose dips as the wire bites, then settles back
      const dip = Math.sin(clamp(p.arT / p.arDur, 0, 1) * Math.PI) * 0.02;
      place(p, ship, lx, p.lz);
      p.pitch -= dip;
      if (p.u <= 0.05) { p.u = 0; p.ds = 'dwell'; p.ts = 0; if (D.wire) D.wire.rel = true; }
      return true;
    }
    if (p.ds === 'dwell') {
      // the wire is let go and runs back, the hook is raised, the engine idles
      idleSpin(p, dt, 0.4);
      if (D.wire && D.wire.rel) {
        D.wire.ax -= 22 * dt;
        if (D.wire.ax <= D.wire.x) D.wire = null;
      }
      if (p.ts > 0.6) p.hook = Math.max(0, p.hook - dt / 0.8);
      p.u = 0;
      place(p, ship, p.lx, p.lz);
      if (p.ts > 1.5) {
        p.phase = 'taxiIn'; p.ds = 'wait'; p.ts = 0; p.lx0 = p.lx; p.lz0 = p.lz; p.lift = null; p.hook = 0;
      }
      return true;
    }
    if (p.ds === 'bolter') {
      p.eng = 1; p.u += 8.5 * dt; p.hook = Math.max(0, p.hook - dt / 1.2);
      const lx = p.lx + p.u * dt;
      p.gp = p.u < 22 ? GROUND_PITCH * 0.4 : (p.u - 22) * 0.03;
      place(p, ship, lx, p.lz, Math.max(0, p.u - 30) * 0.2);
      if (p.u >= 35 || lx > dp.x1 - 4) {
        // off the bow and round again
        p.phase = 'waveoff'; p.ds = null; p.t = 0; p.eng = null; p.hook = 0.8;
        p.speed = Math.max(48, ship.speed + p.u); p.pitch = 0.1; p.bank = 0; p.roll = 0; p.gp = 0;
        p.vx = Math.sin(p.heading) * p.speed; p.vz = -Math.cos(p.heading) * p.speed; p.vy = 0;
        p.leg = 0;
      }
      return true;
    }
    return true;
  }

  // ---------------- taxi to a lift and down ----------------
  if (p.phase === 'taxiIn') {
    p.fold = Math.min(1, p.fold + dt / FOLD * (p.ts > 1.2 ? 1 : 0));
    p.gp += (GROUND_PITCH - p.gp) * Math.min(1, dt * 2);
    p.squat = 0;
    if (p.ds === 'wait') {
      // pick the lift ahead that is free soonest
      let best = null;
      for (const l of D.lifts) {
        if (l.x - l.hl * 0.3 < p.lx + 22) continue;
        const busy = (l.user ? 1 : 0) + (l.h < 0.99 ? 0.5 : 0);
        const sc = busy * 40 + (l.x - p.lx) * 0.05 + (l.edge ? 25 : 0);
        if (!best || sc < best.sc) best = { l, sc };
      }
      if (!best) {
        p.u = 0;
        if (p.ts > 6) { if (!p.counted && ship.air) recover(world, ship, p); world.events.push({ type: 'planeLand', plane: p, ship }); return false; }
        place(p, ship, p.lx, p.lz);
        return true;
      }
      p.dest = best.l; p.ds = 'taxi'; p.ts = 0; p.lx0 = p.lx; p.lz0 = p.lz;
    }
    if (p.ds === 'taxi') {
      const l = p.dest;
      idleSpin(p, dt, p.ts > 4 ? 0.3 : 0.4);
      // wait short of the lift while it is in use by another aircraft
      const free = (!l.user || l.user === p) && l.h >= 0.99;
      const limit = free ? l.x : l.x - l.hl - 13;
      // (the deck crew wave it on: clear of the wires at a brisk 8 m/s while the next aircraft is coming)
      const [lx, lz] = taxi(p, ship, dt, l.x, l.z, limit, D.landing.length > 1 || D.circuit > 0 ? 8 : 6);
      place(p, ship, lx, lz);
      if (free && Math.abs(lx - l.x) < 0.35 && p.u < 0.3) { l.user = p; l.tgt = 0; p.lift = l; p.ds = 'ride'; p.ts = 0; p.u = 0; }
      return true;
    }
    if (p.ds === 'ride') {
      const l = p.lift;
      p.u = 0; p.fold = Math.min(1, p.fold + dt / FOLD);
      idleSpin(p, dt, 0);
      place(p, ship, l.x, l.z, -LIFT_DEPTH * (1 - l.h));
      if (l.h <= 0.02) {
        if (!p.counted && ship.air) recover(world, ship, p);
        if (!p.service) world.events.push({ type: 'planeLand', plane: p, ship });
        l.user = null; l.tgt = 1; p.lift = null;
        return false;
      }
      return true;
    }
    return true;
  }
  return true;
}

function leaveLift(p) {
  if (p.lift) { p.lift.user = null; p.lift.tgt = 1; p.lift = null; }
}

export { LIFT_DEPTH, GAP };
