// Air operations from the airfields of the islands. The aircraft park on the apron; a sortie sends a wave of heavy bombers (and the fighters that escort them) down the taxiway to the
// head of the runway, one after the other; each makes its take-off run, climbs, joins the others in a circle over the field, flies to an enemy ship and bombs it from high
// level in a stick, then comes home, joins the circuit and lands. When enemy aircraft come near, a patrol of fighters goes up. All of it is on the ground of the base: the runway, the
// taxiway and the parking places come from the layout (sim/bases.js). The flight itself uses the same dynamics as the carrier aircraft (`guide` in sim/aircraft.js).
//
// Phases of an aircraft of a base (p.base is set):
//   on the ground (p.ground)   parked, taxiOut, holdshort, lineup, groundRun, lroll, taxiBack, park
//   in the air                 climb, assemble (the circle over the field), cruise, run (the bombing run), egress, return, hold, lfinal, goaround, and for the fighters escort / cap / engage
// The names of the air phases are those of the carrier aircraft where the meaning is the same, so that the fighters (sim/fighters.js) and the end of the battle treat them alike.
import { clamp, wrapPi, approach, D2R, G } from '../math.js';
import { planeTypeFor, PLANES, groundY, GROUND_PITCH } from '../model/planes.js';
import { perfOf } from './airperf.js';
import { fighterFields, fighterSteer } from './fighters.js';
import { guide, setVel, planeId, bombId, FIGHT_CTX } from './aircraft.js';

const GROUND_STATES = new Set(['parked', 'taxiOut', 'holdshort', 'lineup', 'groundRun', 'lroll', 'taxiBack', 'park']);
const AIR_BOMBER = new Set(['assemble', 'cruise', 'run', 'egress']);
const LANDING = new Set(['return', 'hold', 'lfinal', 'goaround']);
const TAXI = 9, TAXI_TURN = 0.5;          // taxi speed (m/s) and turn rate (rad/s)
const SERVICE = 200;                       // seconds a landed aircraft spends being refuelled and rearmed
const GLIDE = 0.056;                       // the glide slope of the final approach (about 3.2 degrees)
const FINAL_A = 3200;                      // metres from the threshold where the base leg turns onto the final

// ---- geometry of a field -----------------------------------------------------------------------------------------------------------------------------------

/** The frame of a field: s along the runway axis, t across it (to the right of the axis), and the directions of operation. */
function fieldOf(base) {
  if (base._fld) return base._fld;
  const L = base.layout, ca = Math.cos(L.ang), sa = Math.sin(L.ang), len = L.runway.len, hw = L.runway.hw;
  const D = L.id % 2 === 0 ? 1 : -1;                 // the runway is used from the -s end to the +s end (D = 1) or the other way
  const f = {
    L, ca, sa, len, hw, D, y: L.y,
    toW: (s, t) => [L.x + s * ca - t * sa, L.z + s * sa + t * ca],
    sOf: (x, z) => (x - L.x) * ca + (z - L.z) * sa,
    tOf: (x, z) => -(x - L.x) * sa + (z - L.z) * ca,
    rwHdg: D > 0 ? L.heading : wrapPi(L.heading + Math.PI),
    taxiT: hw + 35,
    sHold: -D * (len / 2 - 30),                       // where the taxiway meets the runway at the start end
    sStart: -D * (len / 2 - 60),                      // the head of the runway
    sExit: D * (len / 2 - 30),                        // and at the far end
    sThr: -D * len / 2,                               // the threshold
  };
  f.u = [Math.sin(f.rwHdg), -Math.cos(f.rwHdg)];       // the direction of take-off and landing
  f.r = [Math.cos(f.rwHdg), Math.sin(f.rwHdg)];        // to the right of it
  base._fld = f;
  return f;
}

// ---- the aircraft -----------------------------------------------------------------------------------------------------------------------------------------

/** A new aircraft parked in a slot of the base. role: 'level' (the heavy bomber) or 'fighter'. */
function makePlane(world, base, slot, role) {
  const typeKey = planeTypeFor(base.nation, role === 'fighter' ? 'fighter' : 'level') || planeTypeFor(base.nation, 'torp');
  const spec = PLANES[typeKey];
  if (!spec) return null;
  const q = base.layout.slots[slot], heavy = role !== 'fighter';
  const p = {
    id: planeId(), owner: base.owner, team: base.team, base, slot, kind: heavy ? 'level' : 'fighter', typeKey, spec, wave: null, sec: null,
    x: q.x, y: q.y + groundY(spec), z: q.z, vx: 0, vy: 0, vz: 0, heading: q.heading, pitch: GROUND_PITCH, roll: 0, bank: 0, speed: 0,
    phase: 'parked', ground: true, ds: null, t: 0, ts: 0, age: 0, target: null, hp: spec.hp, maxHp: spec.hp, ordnance: heavy,
    spin: world.rng() * 6, gearDown: true, lost: { wingL: false, wingR: false, tail: false, engine: false }, dying: false, smoke: 0, fire: 0, harass: 0,
    lx: 0, lz: 0, u: 0, apOff: 0, jitter: (world.rng() - 0.5) * 2, fold: 0, hook: 0, eng: 0, aoa: 0, gp: GROUND_PITCH, yaw: 0, hidden: false, lift: null,
    t0Air: 0, cruiseAlt: 0, relAlt: 0, fuel: heavy ? 5200 + world.rng() * 600 : 1700 + world.rng() * 400, aimErr: [world.rng.normal(), world.rng.normal()], diveAng: 0, group: 0,
    svc: 0, rs: 0, rt: 0, path: null, pi: 0, hold: 0,
  };
  if (!heavy) Object.assign(p, fighterFields(spec));
  else { p.stick = 0; p.stickT = 0; p.fighter = false; }
  base.parked[slot] = p;
  world.planes.push(p);
  return p;
}

/** The air group of an airfield at the start of the battle: bombers in the row nearest the taxiway, fighters in the second row. */
export function initAirfield(world, base) {
  const L = base.layout, n = L.slots.length, rich = L.guns.length > 8;
  const nb = Math.min(n >> 1, rich ? 6 : 4), nf = Math.min(n >> 1, rich ? 6 : 4);
  base.air = { cd: 50 + world.rng() * 60, capCd: 20, chk: 1, queue: [], relT: 0, rwy: null, waveN: 0, nextClimb: 0, lastRoll: -99, launches: 0, bombers: nb, fighters: nf };
  if (base.inert) return;
  const half = n >> 1;
  for (let i = 0; i < nb; i++) makePlane(world, base, 1 + i, 'level');
  for (let i = 0; i < nf; i++) makePlane(world, base, half + 1 + i, 'fighter');
}

// ---- losses on the ground -----------------------------------------------------------------------------------------------------------------------------------

/** A parked or taxiing aircraft is destroyed by a bomb or a shell. */
export function killGroundPlane(world, base, p, attacker, cause) {
  if (p.gone || p.dead) return;
  p.dead = true; p.gone = true; p.dying = true; p.hp = 0;
  if (base.parked[p.slot] === p) base.parked[p.slot] = null;
  if (base.air.rwy === p) base.air.rwy = null;
  base.air.queue = base.air.queue.filter((q) => q !== p);
  base.owner.lostPlanes++;
  if (attacker && attacker !== base.owner) attacker.planeKills = (attacker.planeKills || 0) + 1;
  const big = p.ordnance ? 1.4 : 0.8;
  world.events.push({ type: 'explosion', stage: 'secondary', x: p.x, y: p.y + 1, z: p.z, size: 0.5 * big, plane: p, base });
  world.events.push({ type: 'planeDown', plane: p, mode: 'explode', x: p.x, y: p.y, z: p.z, cause: cause || 'bomb', hasOrdnance: p.ordnance, attacker: attacker || null, ground: true });
  base.fires.push({ x: p.x, y: base.layout.y + 0.4, z: p.z, r: 3.5, t: 45 + world.rng() * 40, life: 85, power: 1 });
  if (base.fires.length > 14) base.fires.shift();
}

// ---- the decisions of the airfield ---------------------------------------------------------------------------------------------------------------------------

const ready = (p, kind) => p && !p.gone && !p.dying && p.phase === 'parked' && p.svc <= 0 && p.fuel > 600 && (kind === 'fighter' ? p.fighter : !p.fighter);

/** The enemy ships worth bombing, best first: valuable, near, hurt. */
function bestTargets(world, base, n) {
  const out = [];
  for (const sh of world.ships) {
    if (sh.team === base.team || !sh.alive) continue;
    const d = Math.hypot(sh.x - base.layout.x, sh.z - base.layout.z);
    if (d > 80000) continue;
    out.push({ sh, sc: sh.stats.score * 6000 - d + (sh.hpFrac < 0.6 ? 3000 : 0) + world.rng() * 2500 });
  }
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, n).map((q) => q.sh);
}

function enemyAirNear(world, base, range) {
  let n = 0;
  for (const q of world.planes) if (q.team !== base.team && !q.ground && !q.dying && !q.gone && q.y > 60 && Math.hypot(q.x - base.layout.x, q.z - base.layout.z) < range) n++;
  return n;
}

function decide(world, base) {
  const air = base.air, F = fieldOf(base);
  const tanks = base.partsTotal('tank') ? base.partsAlive('tank') > 0 : true, depot = base.partsTotal('depot') ? base.partsAlive('depot') > 0 : true;
  const slow = base.partsTotal('tower') && !base.partsAlive('tower') ? 2 : 1;
  const busy = air.queue.length > 0;
  // a patrol goes up when enemy aircraft come within reach of the field (the radar sees them sooner)
  if (air.capCd <= 0 && !busy && tanks) {
    const reach = base.partsTotal('radar') && base.partsAlive('radar') ? 32000 : 9000;
    const fs = base.parked.filter((p) => ready(p, 'fighter'));
    if (fs.length >= 2 && enemyAirNear(world, base, reach) > 0) {
      const n = Math.min(fs.length, 4);
      const wave = { base, id: ++air.waveN, t0: world.time, planes: [], cap: true, n: 0, launched: 0, assessed: true, aborted: false, sections: [], asmGo: true };
      for (let i = 0; i < n; i++) { const p = fs[i]; p.wave = wave; p.role = 'cap'; wave.planes.push(p); air.queue.push(p); }
      air.capCd = 150 * slow;
      return;
    }
  }
  if (air.cd > 0 || busy || !tanks || !depot) return;
  const bs = base.parked.filter((p) => ready(p, 'level'));
  if (bs.length < Math.min(3, base.air.bombers)) return;
  const targets = bestTargets(world, base, 2);
  if (!targets.length) { air.cd = 25; return; }
  const n = Math.min(bs.length, 6);
  const wave = { base, id: ++air.waveN, t0: world.time, planes: [], n, launched: 0, assessed: false, aborted: false, sections: [], target: targets[0], asmGo: false };
  bs.sort((a, b) => a.slot - b.slot);
  for (let i = 0; i < n; i++) {
    const p = bs[i];
    p.wave = wave; p.target = targets[i >= 3 && targets[1] ? 1 : 0]; p.group = i;
    p.cruiseAlt = base.layout.y + Math.min(perfOf(p).bombAlt ?? 2800, 3500) - 600 + world.rng() * 600; p.role = 'level';
    wave.planes.push(p); air.queue.push(p);
  }
  const fs = base.parked.filter((p) => ready(p, 'fighter'));
  const nf = Math.min(fs.length, clamp(Math.round(n * 0.4), 2, 4));
  if (fs.length >= 2) for (let i = 0; i < nf; i++) { const p = fs[i]; p.wave = wave; p.role = 'escort'; p.group = n + i; wave.planes.push(p); air.queue.push(p); }
  air.cd = (420 + world.rng() * 160) * slow;
  world.events.push({ type: 'airLaunch', ship: base.owner, count: n });
}

/** Where aircraft of the field go from the apron to the holding point, and from the exit back to a slot. */
function taxiPath(base, p, out) {
  const F = fieldOf(base), q = base.layout.slots[p.slot];
  const ss = F.sOf(q.x, q.z), st = F.tOf(q.x, q.z), pts = [];
  // the second row of parking places reaches the taxiway between the aircraft of the first row
  const row2 = st > F.hw + 110;
  const sGap = ss + (ss > 0 ? -22 : 22);
  if (out) {
    if (row2) pts.push([sGap, st]);
    pts.push([row2 ? sGap : ss, F.taxiT]);
    pts.push([F.sHold, F.taxiT]);
  } else {
    pts.push([F.sExit, 0], [F.sExit, F.taxiT]);
    pts.push([row2 ? sGap : ss, F.taxiT]);
    if (row2) pts.push([sGap, st]);
    pts.push([ss, st]);
  }
  return pts.map(([s, t]) => F.toW(s, t));
}

// ---- stepping the aircraft ---------------------------------------------------------------------------------------------------------------------------------

const _v = [0, 0, 0];
/** Drives along p.path; returns true when the last point is reached. */
function drive(world, base, p, dt, vmax) {
  const w = p.path[p.pi];
  if (!w) { p.speed = approach(p.speed, 0, 3 * dt); return true; }
  const dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz), want = Math.atan2(dx, -dz);
  const err = wrapPi(want - p.heading), last = p.pi === p.path.length - 1;
  // a plane ahead and close, going the same way: wait for it
  let hold = false;
  for (const q of world.planes) {
    if (q === p || !q.ground || q.base !== base || q.phase === 'parked') continue;
    const ex = q.x - p.x, ez = q.z - p.z, e = Math.hypot(ex, ez);
    if (e < 62 && (ex * Math.sin(p.heading) - ez * Math.cos(p.heading)) > 0.55 * e && Math.cos(wrapPi(q.heading - p.heading)) > 0.3) { hold = true; break; }
  }
  p.heading += clamp(err, -(TAXI_TURN + p.speed * 0.03) * dt, (TAXI_TURN + p.speed * 0.03) * dt);
  let vt = vmax * clamp(1.15 - Math.abs(err) * 0.9, 0.3, 1);
  if (last) vt = Math.min(vt, 1.5 + d * 0.22);
  if (hold) vt = 0;
  p.speed = approach(p.speed, vt, (vt > p.speed ? 1.6 : 3.2) * dt);
  p.x += Math.sin(p.heading) * p.speed * dt; p.z -= Math.cos(p.heading) * p.speed * dt;
  p.vx = Math.sin(p.heading) * p.speed; p.vz = -Math.cos(p.heading) * p.speed; p.vy = 0;
  if (d < Math.max(3.5, p.speed * 0.8) && !hold) { p.pi++; return p.pi >= p.path.length; }
  return false;
}

/** The aircraft sits on the ground of the field (taxiing, rolling): height and attitude. */
function onGround(base, p, pitch = p.gp) {
  p.y = fieldOf(base).y + groundY(p.spec) + 0.04;
  p.pitch = pitch; p.bank = 0; p.roll = 0;
}

function leaderOf(wave) {
  for (const q of wave.planes) if (!q.fighter && !q.dying && !q.gone && AIR_BOMBER.has(q.phase)) return q;
  return null;
}
const fmtOffset = (k, row) => [-(row * 62), (k % 2 ? 1 : -1) * row * 52, -row * 5];

/** The point on the extended centre line, `d` metres before the threshold, `h` metres above the field. */
function approachPoint(base, d, h) {
  const F = fieldOf(base), w = F.toW(F.sThr - F.D * d, 0);
  return [w[0], F.y + h, w[1]];
}

/** Metres before the threshold (negative past it) of an aircraft, along the extended centre line. */
function alongFinal(F, q) { const T0 = F.toW(F.sThr, 0); return -((q.x - T0[0]) * F.u[0] + (q.z - T0[1]) * F.u[1]); }

/** Is the final approach free for `p` to turn onto: no other aircraft on it within 2.6 km of the entry point? */
function finalClear(world, base, F, p) {
  const ap = alongFinal(F, p);
  for (const q of world.planes) {
    if (q === p || q.base !== base || q.dying || q.gone || (q.phase !== 'lfinal' && q.phase !== 'goaround')) continue;
    if (Math.abs(alongFinal(F, q) - Math.max(ap, FINAL_A)) < 2400) return false;
  }
  return true;
}

/** May the aircraft take the runway (to take off or to roll out after landing): nobody rolling on it? */
function takeRunway(base, p) {
  const air = base.air;
  if (air.rwy && air.rwy !== p && !air.rwy.gone && !air.rwy.dying) return false;
  air.rwy = p;
  return true;
}
const freeRunway = (base, p) => { if (base.air.rwy === p) base.air.rwy = null; };

function releaseNext(world, base, dt) {
  const air = base.air;
  air.relT -= dt;
  if (air.relT > 0 || !air.queue.length) return;
  // no more than three aircraft between the apron and the runway at a time
  let on = 0;
  for (const q of world.planes) if (q.base === base && (q.phase === 'taxiOut' || q.phase === 'holdshort' || q.phase === 'lineup')) on++;
  if (on >= 3) return;
  const p = air.queue.shift();
  if (p.gone || p.dying || p.phase !== 'parked') return;
  p.path = taxiPath(base, p, true); p.pi = 0; p.phase = 'taxiOut'; p.eng = 0.3; p.t = 0;
  air.relT = p.fighter ? 8 : 16;
}

/** One tick of the aircraft of a base. Returns false when the aircraft is gone. */
export function stepBasePlane(world, p, dt) {
  const base = p.base, F = fieldOf(base), T = world.terrain, pf = perfOf(p);
  if (p.dead) return false;
  switch (p.phase) {
    case 'parked': {
      p.eng = 0; p.speed = 0; p.vx = p.vz = p.vy = 0;
      if (p.svc > 0) p.svc -= dt;
      return true;
    }
    case 'taxiOut': {
      p.eng = 0.3; onGround(base, p);
      if (drive(world, base, p, dt, TAXI)) { p.phase = 'holdshort'; p.speed = 0; p.t = 0; }
      return true;
    }
    case 'holdshort': {
      // on the taxiway beside the runway, until the runway is free and nobody is about to land
      p.eng = 0.4; onGround(base, p); p.speed = approach(p.speed, 0, 3 * dt);
      // an aircraft on its final approach has the right of way
      let inbound = false;
      for (const q of world.planes) if (q.base === base && !q.dying && !q.gone && (q.phase === 'lfinal' || q.phase === 'goaround' || q.phase === 'lroll') && alongFinal(F, q) < 5500) { inbound = true; break; }
      if (!inbound && world.state === 'running' && world.time - base.air.lastRoll > (p.fighter ? 6 : 9) && takeRunway(base, p)) {
        p.phase = 'lineup'; p.path = [F.toW(F.sHold, 0), F.toW(F.sStart, 0)]; p.pi = 0;
      }
      return true;
    }
    case 'lineup': {
      p.eng = 0.5; onGround(base, p);
      if (drive(world, base, p, dt, TAXI * 0.8)) {
        p.heading += clamp(wrapPi(F.rwHdg - p.heading), -0.6 * dt, 0.6 * dt);
        if (Math.abs(wrapPi(F.rwHdg - p.heading)) < 0.04) {
          p.phase = 'groundRun'; p.rs = F.sOf(p.x, p.z); p.rt = F.tOf(p.x, p.z); p.u = 0; p.speed = 0; p.t = 0; base.air.lastRoll = world.time;
          p.runLen = Math.abs(F.D * F.len / 2 - p.rs);
          world.events.push({ type: 'planeLaunch', plane: p, ship: base.owner });
        }
      }
      return true;
    }
    case 'groundRun': {
      // the run: the speed builds so as to be airborne after 60 to 70 per cent of the runway; the tail comes up, then the nose
      p.eng = 1;
      const vto = pf.vto ?? 38, L = clamp(Math.min(pf.runLen ?? p.runLen * 0.58, p.runLen * 0.85), 250, 2000), a = vto * vto / (2 * L);
      p.speed += a * dt;
      p.rs += F.D * p.speed * dt; p.rt += (0 - p.rt) * Math.min(1, dt * 1.5);
      const w = F.toW(p.rs, p.rt); p.x = w[0]; p.z = w[1];
      p.heading = F.rwHdg;
      const fv = p.speed / vto;
      p.gp = fv < 0.45 ? GROUND_PITCH : fv < 0.8 ? GROUND_PITCH * (1 - (fv - 0.45) / 0.35) : (fv - 0.8) * 0.5;
      p.vx = F.u[0] * p.speed; p.vz = F.u[1] * p.speed; p.vy = 0;
      p.y = F.y + groundY(p.spec) + 0.04 + Math.max(0, fv - 1) * 4;
      p.pitch = p.gp; p.bank = 0; p.roll = 0;
      if (p.speed >= vto) {
        // the attitude of the end of the run is kept: the flight path still level, the nose up
        p.phase = 'climb'; p.ground = false; p.eng = null; p.t = 0; p.t0Air = p.age; p.aoa = Math.max(0.05, p.gp); p.pitch = 0; p.gp = 0;
        if (base.parked[p.slot] === p) { /* the slot stays reserved for this aircraft */ }
        freeRunway(base, p);
        base.air.lastRoll = world.time;
        if (p.wave) p.wave.launched++;
        setVel(p);
      }
      return true;
    }
    case 'climb': {
      // straight ahead, climbing, the gear coming up
      // a few seconds low over the runway gathering speed, then the climb; the nose comes down as the speed builds
      const alt = p.y - F.y, tA = p.age - p.t0Air, slow = p.speed < pf.vto * 1.2;
      p.gearDown = p.age < p.t0Air + 6;
      guide(p, dt, F.rwHdg, slow && tA < 10 ? 0.025 : alt < 40 ? 0.06 : 0.09, pf.vcl, { bankMax: 6 * D2R, accMax: p.fighter ? 3 : 1.8, pitchRate: 0.1 });
      p.aoa += (clamp((pf.vcl - p.speed) / pf.vcl * 0.6, 0, 0.1) - p.aoa) * Math.min(1, dt * 1.5);
      advance(p, dt);
      if (alt > 150) {
        if (p.fighter) { p.phase = p.role || 'cap'; p.t = 0; }
        else { p.phase = 'assemble'; p.asm = null; p.t = 0; p.orbT = 0; p.dirOrbit = F.D; }
      }
      return airborneChecks(world, p, T, F);
    }
    case 'taxiBack': {
      p.eng = 0.25; onGround(base, p, GROUND_PITCH);
      if (p.path && drive(world, base, p, dt, TAXI)) {
        // the last turn on the spot, nose to the runway
        const q = base.layout.slots[p.slot];
        p.heading += clamp(wrapPi(q.heading - p.heading), -0.55 * dt, 0.55 * dt);
        if (Math.abs(wrapPi(q.heading - p.heading)) < 0.05) { p.phase = 'parked'; p.eng = 0; p.speed = 0; p.svc = SERVICE * (0.8 + 0.4 * world.rng()); servicePlane(p); }
      }
      return true;
    }
    default: break;
  }
  return stepAir(world, p, dt, base, F, pf, T);
}

function servicePlane(p) {
  p.fuel = p.fighter ? 1700 + 300 : 5400; p.ordnance = !p.fighter; if (p.fighter) p.ammo = 520;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35); p.smoke = 0; p.fire = 0; p.wave = null; p.target = null; p.prey = null; p.hunted = 0; p.stick = 0;
  p.ground = true; p.gearDown = true;
}

/** Position update of an aircraft in flight (the velocity is set by `guide`). */
function advance(p, dt) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }

const FLYING_LOW = new Set(['lfinal', 'goaround', 'climb']);
/** The ground, and the end of the aircraft that flies into it. Returns false when it is gone. */
function airborneChecks(world, p, T, F) {
  if (T) {
    const gh = T.heightAt(p.x, p.z);
    // over the field itself the ground is the pad: the aircraft comes down to its wheels there
    const s = F.sOf(p.x, p.z), t = F.tOf(p.x, p.z), onPad = Math.abs(s) < F.len / 2 + 150 && Math.abs(t) < 200;
    const lim = onPad ? F.y + groundY(p.spec) - 0.3 : gh + 2.5;
    if (gh > 0 && p.y < lim && !p.ground) {
      if (onPad && FLYING_LOW.has(p.phase)) { p.y = F.y + groundY(p.spec); }
      else { p.hp = 0; crashLand(world, p, gh); return false; }
    }
  }
  if (p.y < 4 && !p.ground && !(T && T.heightAt(p.x, p.z) > 0)) { p.y = 4; if (p.pitch < 0) p.pitch = 0; }
  return true;
}

function crashLand(world, p, gh) {
  if (!p.dying) {
    p.owner.lostPlanes++;
    world.events.push({ type: 'planeDown', plane: p, mode: 'dive', x: p.x, y: p.y, z: p.z, cause: 'crash', hasOrdnance: p.ordnance, attacker: null });
  }
  world.events.push({ type: 'planeCrash', plane: p, x: p.x, y: gh, z: p.z, water: false, land: true, ship: null, speed: p.speed, ordnance: p.ordnance });
  p.dead = true; p.gone = true;
}

/** An orbit about (cx, cz) of radius R, in direction dir (+1 clockwise seen from above): the heading and the speed to fly. */
function orbit(p, cx, cz, R, dir, v) {
  const rx = p.x - cx, rz = p.z - cz, rl = Math.hypot(rx, rz) || 1, k = clamp((R - rl) / R * 2.2, -1.2, 1.2);
  let vx = dir * rz / rl + rx / rl * k, vz = -dir * rx / rl + rz / rl * k;
  const vl = Math.hypot(vx, vz) || 1;
  return atan2h(vx / vl, vz / vl);
}
const atan2h = (vx, vz) => Math.atan2(vx, -vz);
/** The heading to command so that a turn of more than 100 degrees to the right towards `want` is flown to the left instead (guide() takes the short way round). */
function leftTurn(cur, want) {
  const err = wrapPi(want - cur);
  return err > 1.75 ? cur - 1.2 : want;
}

function stepAir(world, p, dt, base, F, pf, T) {
  p.fuel -= dt;
  // the bomb bay doors are open from a little before the target until the stick has gone
  if (!p.fighter) p.bay = approach(p.bay || 0, p.phase === 'run' && (p.ordnance || p.stick > 0) && p._fs && Math.hypot((p.target ? p.target.x : 0) - p.x, (p.target ? p.target.z : 0) - p.z) < p._fs.d + 900 ? 1 : 0, 0.5 * dt);
  let hdg = p.heading, gam = 0, spd = pf.vc, o = {};
  const rng = world.rng, wave = p.wave;
  // the fuel, the battle is over, the wave is turned back: go home
  if (p.fuel < 500 && !LANDING.has(p.phase) && AIR_BOMBER.has(p.phase)) p.phase = 'return';
  if (p.gearDown && p.phase !== 'lfinal' && p.phase !== 'goaround' && p.age > p.t0Air + 6) p.gearDown = false;
  switch (p.phase) {
    case 'assemble': {
      // a circle over the field, climbing, until the whole wave is in the air
      p.orbT = (p.orbT || 0) + dt;
      if (wave && wave._asmT !== world.time) {
        wave._asmT = world.time;
        let all = true;
        for (const q of wave.planes) if (!q.fighter && !q.gone && !q.dying && (q.ground || q.phase === 'climb' || (q.phase === 'assemble' && q.orbT < 10))) { all = false; break; }
        if (all || world.time - wave.t0 > 540) wave.asmGo = true;
      }
      if (wave && wave.asmGo) { p.phase = 'cruise'; p.t = 0; break; }
      const R = clamp(pf.vp * pf.vp / (G * Math.tan(24 * D2R)), 500, 1600);
      hdg = orbit(p, F.L.x, F.L.z, R, p.dirOrbit || 1, pf.vc);
      spd = pf.vcl * 1.05; gam = clamp((F.y + 900 + (p.group % 4) * 40 - p.y) / 400, -0.05, 0.1);
      o = { bankMax: 26 * D2R };
      break;
    }
    case 'cruise': {
      let tgt = p.target;
      if (!tgt || !tgt.alive) {
        const sh = bestTargets(world, base, 1)[0];
        p.target = tgt = sh || null;
        if (wave && tgt) wave.target = tgt;
        if (!tgt) { p.phase = 'return'; break; }
      }
      const lead = wave ? leaderOf(wave) : null;
      const dx = tgt.x + tgt.vx * 40 - p.x, dz = tgt.z + tgt.vz * 40 - p.z, range = Math.hypot(dx, dz);
      // looked over once, 16 km out: too few left, and the raid turns back
      if (wave && !wave.assessed && range < 16000 && wave.asmGo) {
        wave.assessed = true;
        const live = wave.planes.filter((q) => !q.fighter && !q.dying && !q.gone && q.ordnance && AIR_BOMBER.has(q.phase)).length;
        if (live < Math.max(2, Math.round(wave.n * 0.4))) { wave.aborted = true; world.events.push({ type: 'strikeAbort', ship: base.owner, left: live, planned: wave.n }); }
      }
      if (wave && wave.aborted) { p.phase = 'return'; break; }
      if (lead && lead !== p && AIR_BOMBER.has(lead.phase) && lead.phase === 'cruise') {
        // in formation behind the leader
        const k = wave.planes.filter((q) => !q.fighter && !q.dying && !q.gone && AIR_BOMBER.has(q.phase)).indexOf(p);
        const so = fmtOffset(k, Math.ceil(k / 2));
        const fx = Math.sin(lead.heading), fz = -Math.cos(lead.heading), rx = Math.cos(lead.heading), rz = Math.sin(lead.heading);
        const sx = lead.x + fx * so[0] + rx * so[1], sz = lead.z + fz * so[0] + rz * so[1];
        const ex = sx + lead.vx * 1.2 - p.x, ez = sz + lead.vz * 1.2 - p.z, dS = Math.hypot(ex, ez);
        hdg = lead.heading + wrapPi(atan2h(ex, ez) - lead.heading) * clamp(dS / 90, 0, 1);
        const along = (p.x - sx) * fx + (p.z - sz) * fz;
        spd = clamp(lead.speed - along * 0.12, pf.vc * 0.6, pf.vc * 1.25);
        gam = clamp((lead.y + so[2] - p.y) / 320, -0.06, 0.08);
        break;
      }
      hdg = atan2h(dx, dz);
      gam = clamp((p.cruiseAlt - p.y) / 1100, -0.05, 0.07);
      spd = pf.vc;
      if (range < 12000 && (p.y > p.cruiseAlt - 350 || range < 7500) && (!wave || wave.assessed)) { p.phase = 'run'; p.t = 0; p.stick = 0; }
      else if (range < 12000 && p.t > 300) { p.phase = 'run'; p.t = 0; }
      break;
    }
    case 'run': {
      const tgt = p.target;
      if (!tgt || !tgt.alive) { p.phase = p.ordnance ? 'cruise' : 'egress'; p.t = 0; break; }
      // the bomb sight: the fall of a bomb from here (how long, how far it carries) gives the point to be over, with the target's own motion allowed for
      if (!p._fs || world.time - p._fs.at > 0.5) p._fs = { at: world.time, ...bombFall(p) };
      const fs = p._fs, H = p.y;
      const err = 22 + 0.016 * H + 55 * clamp(p.harass, 0, 1.5);
      const ax = tgt.x + tgt.vx * (fs.t + 1) + p.aimErr[0] * err, az = tgt.z + tgt.vz * (fs.t + 1) + p.aimErr[1] * err;
      const dx = ax - p.x, dz = az - p.z, range = Math.hypot(dx, dz);
      hdg = atan2h(dx, dz);
      gam = clamp((p.cruiseAlt - p.y) / 900, -0.05, 0.015);
      spd = pf.bombSpeed ?? pf.vc;
      o = { bankMax: (range > 3500 ? 28 : 12) * D2R };
      // the stick: released so that it is centred on the aim point, one bomb after the other
      const aligned = Math.abs(wrapPi(hdg - p.heading)) < 0.05, vh = Math.hypot(p.vx, p.vz), stickLen = 0.2 * Math.max(0, (p.spec.bombKg || 1000) / 260 - 1) * vh;
      if (p.ordnance && p.stick === 0 && range < fs.d + stickLen * 0.5 + 6 && range > fs.d - 400 && aligned && p.y > 600) beginStick(p);
      if (p.stick > 0) {
        p.stickT -= dt;
        while (p.stickT <= 0 && p.stick > 0) { dropOne(world, p, tgt); p.stick--; p.stickT += 0.2; }
        if (p.stick === 0) { p.ordnance = false; p.phase = 'egress'; p.t = 0; }
      }
      if (range > 25000 || p.t > 150) { p.phase = 'egress'; p.t = 0; }
      break;
    }
    case 'egress': {
      const tg = p.target;
      const away = tg ? Math.atan2(p.x - tg.x, -(p.z - tg.z)) : p.heading;
      hdg = p.t < 14 ? p.heading : away + p.jitter * 0.6;
      gam = 0.0; spd = pf.vc; o = { bankMax: 22 * D2R };
      if (p.t > 40) p.phase = 'return';
      break;
    }
    case 'escort': case 'cap': case 'engage': {
      const r = fighterSteer(world, p, dt, FIGHT_CTX);
      hdg = r.hdg; gam = r.gam; spd = r.spd; o = r.o;
      break;
    }
    case 'return': case 'hold': {
      // the circuit of the field, all turns to the left: the downwind leg beside the runway the other way, a base leg across, and the turn onto a final of about 3 km.
      // An aircraft that comes in already lined up goes straight in; one that has to wait goes round a circle beside the downwind leg and joins it again.
      p.gearDown = false;
      const T0 = F.toW(F.sThr, 0), px = p.x - T0[0], pz = p.z - T0[1];
      const a = -(px * F.u[0] + pz * F.u[1]), e = px * F.r[0] + pz * F.r[1];       // metres before the threshold, to the right of the centre line
      const vA = -(p.vx * F.u[0] + p.vz * F.u[1]), vE = p.vx * F.r[0] + p.vz * F.r[1];
      const W = p.fighter ? 1300 : 1700, hC = F.y + (p.fighter ? 280 : 330), aBase = FINAL_A;
      const downHdg = wrapPi(F.rwHdg + Math.PI), baseHdg = wrapPi(F.rwHdg + Math.PI / 2);
      if (p.phase === 'hold') {
        // a left-hand circle outside the downwind leg, abeam the middle of the runway; back on the downwind leg, going the right way, when the final is free
        const R = 900, c = F.toW(F.sThr + F.D * F.len * 0.5, 0), cx = c[0] - F.r[0] * (W + R), cz = c[1] - F.r[1] * (W + R);
        hdg = orbit(p, cx, cz, R, -1, pf.vp);
        spd = pf.vp; gam = clamp((hC - p.y) / 500, -0.05, 0.05); o = { bankMax: 28 * D2R };
        if (p.t > 20 && finalClear(world, base, F, p) && Math.abs(wrapPi(p.heading - downHdg)) < 0.5 && e < -W * 0.6) { p.phase = 'return'; p.leg = 'down'; p.t = 0; }
        break;
      }
      spd = pf.vc;
      if (!p.leg || p.leg === 'join') {
        // lined up already, a good way out: straight in
        if (a > aBase - 300 && a < 14000 && Math.abs(e) < 250 + a * 0.12 && Math.cos(wrapPi(p.heading - F.rwHdg)) > 0.7 && p.y - F.y < 250 + a * 0.12) {
          if (finalClear(world, base, F, p)) { p.phase = 'lfinal'; p.t = 0; p.gearDown = true; p.t0Air = p.age; p.leg = null; break; }
        }
        // to the start of the downwind leg: abeam the far end of the runway, out on the left, coming at it from outside the circuit
        const ja = -F.len - 900, je = -W;
        const tx = T0[0] - F.u[0] * ja + F.r[0] * (je - 500), tz = T0[1] - F.u[1] * ja + F.r[1] * (je - 500);
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        hdg = atan2h(dx, dz);
        gam = clamp((hC + 150 - p.y) / 700, -0.1, 0.1);
        if (d < 1500) p.leg = 'down';
        // already beside the runway on the left, going the downwind way: join the leg where it is
        if (e < -W * 0.5 && e > -W * 1.6 && a < aBase && Math.cos(wrapPi(p.heading - downHdg)) > 0.7) p.leg = 'down';
      }
      if (p.leg === 'down') {
        // along the runway the other way, the line held with a damped correction, down to the height of the circuit, slowing to the circuit speed
        hdg = downHdg + clamp((e + W) * 0.0011 + vE * 0.012, -0.5, 0.5);
        gam = clamp((hC - p.y) / 400, -0.1, 0.04);
        spd = pf.vp; o = { bankMax: 28 * D2R };
        // abeam the point where the base leg starts, at the height of the circuit: turn in if the final is free; else go round the holding circle
        // (one that comes in high goes on down the leg, losing height, before it turns)
        if (a > aBase && p.y < hC + 60) {
          if (finalClear(world, base, F, p)) { p.leg = 'base'; p.t = 0; }
          else if (a > aBase + 2500) { p.phase = 'hold'; p.t = 0; p.leg = null; }
        } else if (a > aBase + 6000) { p.phase = 'hold'; p.t = 0; p.leg = null; }
      }
      if (p.leg === 'base') {
        // across, towards the centre line, coming down; the gear goes down; the turn onto the final when the centre line is near
        hdg = baseHdg + clamp((a - aBase) * -0.0008 + vA * -0.01, -0.35, 0.35);
        gam = clamp((F.y + 25 + aBase * GLIDE - p.y) / 400, -0.07, 0.03);
        spd = pf.vp * 0.95; o = { bankMax: 28 * D2R };
        p.gearDown = true;
        const lead = Math.min(700, Math.max(250, p.speed * p.speed / (G * Math.tan(25 * D2R))));         // the radius of the turn to final
        if (e > -lead) { p.phase = 'lfinal'; p.t = 0; p.gearDown = true; p.t0Air = p.age; p.leg = null; }
      }
      // in the circuit every turn is to the left, away from the runway: a heading more than a quarter turn to the right is reached by turning left
      if (p.leg === 'down' || p.leg === 'base') hdg = leftTurn(p.heading, hdg);
      if (p.fuel < -200) { p.fuel = 0; }
      break;
    }
    case 'lfinal': {
      p.gearDown = true;
      const T0 = F.toW(F.sThr, 0);
      const px = p.x - T0[0], pz = p.z - T0[1];
      const a = -(px * F.u[0] + pz * F.u[1]);             // metres before the threshold (negative past it)
      const e = px * F.r[0] + pz * F.r[1];                // metres to the right of the centre line
      const gy = groundY(p.spec);
      hdg = F.rwHdg - clamp(e * 0.0035 + (p.vx * F.r[0] + p.vz * F.r[1]) * 0.03, -0.45, 0.45);
      const h = p.y - F.y, wantH = gy + 0.25 + Math.max(0, a + 130) * GLIDE;
      gam = clamp(-GLIDE + (wantH - h) / 90, -0.1, 0.06);
      if (h < 14) gam = Math.max(gam, -0.03);
      // the flare: in the last few metres the nose comes up to the attitude it will sit on its wheels with, and the sink rate falls off
      const flare = clamp((gy + 6 - h) / 5, 0, 1);
      if (flare > 0) gam = Math.max(gam, -0.035 + 0.013 * flare);
      spd = pf.va;
      o = { bankMax: 20 * D2R };
      const s = F.sOf(p.x, p.z);
      // the wheels meet the runway
      if (h <= gy + 0.3 && a < 500 && Math.abs(e) < F.hw && a > -F.len * 0.55) {
        // somebody else on the runway: round again
        if (!takeRunway(base, p)) { p.phase = 'goaround'; p.t = 0; break; }
        p.phase = 'lroll'; p.ground = true; p.eng = 0.2; p.t = 0;
        // the attitude of the flare goes over to the ground (the angle of attack is no longer added on top); the tail comes down
        p.rs = s; p.rt = F.tOf(p.x, p.z); p.gp = p.pitch + (p.aoa || 0); p.pitch = p.gp; p.aoa = 0; p.gearDown = true;
        p.u = p.speed;
        world.events.push({ type: 'planeTouchdown', plane: p, back: 4 });
        return true;
      }
      // a bad approach, the runway occupied, or the runway not reached: round again
      if (a < 700 && a > 0 && base.air.rwy && base.air.rwy !== p && !base.air.rwy.gone && !base.air.rwy.dying) { p.phase = 'goaround'; p.t = 0; break; }
      if ((a < 400 && Math.abs(e) > 45 + Math.max(0, a) * 0.05) || a < -F.len * 0.5) { p.phase = 'goaround'; p.t = 0; }
      if (a > 12000) p.phase = 'return';
      break;
    }
    case 'goaround': {
      hdg = F.rwHdg; gam = 0.08; spd = pf.vc * 0.9; o = { bankMax: 8 * D2R };
      p.gearDown = p.t < 8;
      if (p.t > 22) p.phase = 'return';
      break;
    }
    case 'lroll': {
      // the landing run: brakes on, the aircraft keeps the centre line and leaves the runway at the far end
      p.eng = 0.2;
      const dec = pf.vto > 40 ? 3.1 : 3.8;
      p.speed = Math.max(0, p.speed - dec * dt * (p.speed > 25 ? 0.6 : 1));
      p.rs += F.D * p.speed * dt; p.rt += (0 - p.rt) * Math.min(1, dt * 1.2);
      const w = F.toW(p.rs, p.rt); p.x = w[0]; p.z = w[1];
      p.heading = F.rwHdg;
      p.gp = approach(p.gp, GROUND_PITCH, 0.05 * dt);
      p.vx = F.u[0] * p.speed; p.vz = F.u[1] * p.speed; p.vy = 0;
      onGround(base, p);
      const toExit = F.D * (F.sExit - p.rs);
      if (p.speed < 11 || toExit < 40) {
        if (toExit > 120 && p.speed >= 11) break;
        p.phase = 'taxiBack'; p.path = taxiPath(base, p, false); p.pi = 0; freeRunway(base, p);
      }
      return true;
    }
    default: break;
  }
  const prev = [p.x, p.y, p.z];
  // an island ahead: the pilot climbs over it (not on the approach to the field or the take-off)
  if (T && p.phase !== 'lfinal' && p.phase !== 'goaround' && p.phase !== 'climb') {
    let top = -1e9;
    for (const d of [300, 750, 1300, 2000]) top = Math.max(top, T.heightAt(p.x + Math.sin(p.heading) * d, p.z - Math.cos(p.heading) * d));
    if (top + 35 > p.y) gam = Math.max(gam, clamp((top + 80 - p.y) / 420, 0.05, 0.3));
  }
  guide(p, dt, hdg, gam, spd, o);
  advance(p, dt);
  const flr = p.phase === 'lfinal' ? clamp((groundY(p.spec) + 6 - (p.y - F.y)) / 5, 0, 1) : 0;
  p.aoa += ((p.phase === 'lfinal' ? 0.1 + (GROUND_PITCH * 0.9 - 0.1) * flr : 0) - p.aoa) * Math.min(1, dt * (flr > 0 ? 3 : 1.8));
  return airborneChecks(world, p, T, F);
}

/** The fall of a bomb let go from the aircraft: the time to the sea and the distance it carries (the same drag as in sim/aircraft.js, stepBombs). */
function bombFall(p) {
  let x = 0, z = 0, y = p.y - 2.2, vx = p.vx, vy = p.vy - 0.5, vz = p.vz, t = 0;
  const h = 0.25;
  while (y > 0 && t < 80) {
    vy -= G * h;
    const k = Math.exp(-0.00035 * Math.hypot(vx, vy, vz) * h);
    vx *= k; vy *= k; vz *= k;
    x += vx * h; y += vy * h; z += vz * h; t += h;
  }
  return { t, d: Math.hypot(x, z) };
}

function beginStick(p) {
  const spec = p.spec;
  p.stick = clamp(Math.round((spec.bombKg || 1000) / 260), 2, 12);
  p.stickKg = (spec.bombKg || 1000) / p.stick;
  p.stickT = 0;
}

function dropOne(world, p, tgt) {
  const kg = p.stickKg;
  const b = {
    id: bombId(), owner: p.owner, team: p.team, kg, x: p.x, y: p.y - 2.2, z: p.z, vx: p.vx, vy: p.vy - 0.5, vz: p.vz, age: 0, mesh: kg >= 400 ? 'bomb500' : 'bomb250', target: tgt, plane: p,
  };
  world.bombs.push(b);
  world.events.push({ type: 'bombDrop', plane: p, bomb: b, x: b.x, y: b.y, z: b.z });
}

/** Every tick: release the next aircraft of the queue and decide on sorties. */
export function stepAirfield(world, base, dt) {
  const air = base.air;
  if (!air || base.inert) return;
  if (world.state !== 'running') { air.queue.length = 0; return; }       // the battle is over: nobody else takes off
  releaseNext(world, base, dt);
  air.cd -= dt; air.capCd -= dt; air.chk -= dt;
  if (air.chk <= 0) { air.chk = 1.5; if (base.alive) decide(world, base); }
}
