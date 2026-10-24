// The ports: where a ship goes when she is out of shells or too battered to fight. A port (a base of kind 'port', sim/bases.js) has a pier with a quay along both sides and an
// anchorage off its head. A ship that comes to the approach point is taken in (a tug-assisted manoeuvre: she is moved along a path to the quay, bow to the shore) and lies alongside;
// there she is replenished (shells, torpedoes, missiles, the aircraft of a carrier, the people) and repaired (fires put out, the water pumped, the holes patched, the machinery, the
// guns and the fire control put back in order, the stations manned) at the pace of the yard, then she is taken out again and the captain has her back.
//
// TIME IS COMPRESSED here, as everywhere in the game: a real battleship needed a day to take on her shells and weeks in a dockyard to be repaired; the times below (SERVICE) are what
// a player can wait for (minutes of battle time). They scale with the size of the yard (a large port: dockyard, cranes and warehouses) and fall as its buildings are destroyed.
import { clamp, wrapPi } from '../math.js';
import { initMissiles } from './missiles.js';

/** Seconds of battle time to take on a full load of shells (from nothing) at a port with its full means, and to repair a ship that is wrecked, by class. */
export const SERVICE = {
  rearm: { DD: 420, CL: 560, CA: 620, BB: 900, CV: 900 },
  repair: { DD: 600, CL: 900, CA: 1000, BB: 1400, CV: 1400 },
};
const CREW_FILL = 420;        // seconds to man the stations again
const PUMP = 480;             // seconds to pump a ship that is full of water dry
const PATCH = 75;             // seconds to patch one hole
const MODULE_REPAIR = { engine: 900, shaft: 700, steering: 500, magazine: 800, bridge: 600, director: 400, radar: 450, funnel: 300, mast: 260, avgas: 450, hangar: 500, flightdeck: 900, catapult: 300, crane: 250, tubes: 300, launcher: 400 };
const MOUNT_REPAIR = (cal) => (cal >= 300 ? 900 : cal >= 180 ? 600 : cal >= 120 ? 360 : 180);
const SPEED = 5.5;            // m/s: the speed of a tug-assisted manoeuvre

const hdgOf = (ang) => Math.atan2(Math.cos(ang), -Math.sin(ang));

// ---- the ports of a team -------------------------------------------------------------------------------------------------------------------------------------------

/** The ports that can serve `team` now (its own, standing, with their cranes and warehouses not all gone). */
export function portsOf(world, team) {
  const out = [];
  for (const b of world.bases) if (b.layout.kind === 'port' && !b.inert && b.team === team && b.alive && b.serviceFrac > 0.15) out.push(b);
  return out;
}

/** The nearest port of `team` to (x, z) that can take the ship in (a free berth or mooring), or null. */
export function nearestPort(world, team, x, z, ship = null) {
  let best = null, bd = Infinity;
  for (const p of portsOf(world, team)) {
    if (ship && !findBerth(p, ship)) continue;
    const d = Math.hypot(p.layout.approach.x - x, p.layout.approach.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** What a port gives, 0..1: the share of its warehouses, workshops, cranes and tanks that still stand (the yard works at that pace). */
export function serviceFrac(base) {
  let w = 0, n = 0;
  base.layout.parts.forEach((p, i) => {
    const k = { warehouse: 1, dockyard: 2.5, crane: 1.5, tank: 1, depot: 1.2 }[p.kind];
    if (!k) return;
    n += k; w += k * (base.partState[i] >= 2 ? 0 : base.partState[i] === 1 ? 0.6 : 1);
  });
  return n ? w / n : 1;
}

// ---- the quay ------------------------------------------------------------------------------------------------------------------------------------------------------

/** The position, the heading and the length of the berth at metres `s` from the shore on `side` of the pier of `base`, for a ship of beam B: where her centre goes. */
function quayPose(base, side, s, B) {
  const L = base.layout, ca = Math.cos(L.ang), sa = Math.sin(L.ang), t = side * (L.pier.w / 2 + 2.5 + B / 2);
  const ss = 130 + s;
  return { x: L.x + ss * ca - t * sa, z: L.z + ss * sa + t * ca, heading: hdgOf(L.ang + Math.PI) };
}

/**
 * Where `ship` can lie in this port: along the pier, on the side and at the distance from the shore where her length fits between the ships already there and the water is deep
 * enough for her draught (the big ships take the outer, deepest places, the small ones the inner), else a mooring in the anchorage. Returns
 * { kind: 'quay', side, s, half, x, z, heading } | { kind: 'mooring', i, x, z, heading } | null.
 */
export function findBerth(base, ship) {
  const L = base.layout, st = ship.stats, half = st.L / 2 + 10, need = st.D + 2.6;
  const big = st.L >= 170;
  let best = null;
  for (const q of L.quay.sides) {
    const taken = base.moored.filter((m) => m.slot.kind === 'quay' && m.slot.side === q.side).map((m) => [m.slot.s - m.slot.half, m.slot.s + m.slot.half]);
    for (let s = L.quay.s0 + half; s <= L.quay.s1 - st.L * 0.35; s += 10) {
      const a = s - half, b = s + half;
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      // the depth under the whole length of the ship
      let ok = true;
      for (const d of q.depth) if (d.s >= a - 10 && d.s <= b + 10 && d.depth < need) { ok = false; break; }
      if (!ok) continue;
      const score = big ? -s : s;
      if (!best || score < best.score) best = { score, side: q.side, s };
    }
  }
  if (best) return { kind: 'quay', side: best.side, s: best.s, half, ...quayPose(base, best.side, best.s, st.B) };
  for (let i = 0; i < L.moorings.length; i++) {
    if (base.moored.some((m) => m.slot.kind === 'mooring' && m.slot.i === i)) continue;
    const m = L.moorings[i];
    if (-base.world.terrain.heightAt(m.x, m.z) < need) continue;
    return { kind: 'mooring', i, x: m.x, z: m.z, heading: hdgOf(L.ang + Math.PI) + (i % 2 ? 0.3 : -0.3) };
  }
  return null;
}

// ---- going in and coming out ---------------------------------------------------------------------------------------------------------------------------------------

/** A path as a list of points with the cumulative length. */
function mkPath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { points, cum, len: cum[cum.length - 1] };
}
function onPath(path, d) {
  d = clamp(d, 0, path.len);
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < d) i++;
  const a = path.points[i - 1], b = path.points[i], seg = Math.max(1e-6, path.cum[i] - path.cum[i - 1]), f = (d - path.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg };
}
/** Round the corners of a polyline (a quadratic curve through each inner point, `r` metres each side): a ship does not turn on the spot. */
function rounded(points, r) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), ra = Math.min(r, la * 0.45), rc = Math.min(r, lc * 0.45);
    const p0 = [b[0] + (a[0] - b[0]) / la * ra, b[1] + (a[1] - b[1]) / la * ra], p1 = [b[0] + (c[0] - b[0]) / lc * rc, b[1] + (c[1] - b[1]) / lc * rc];
    for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p1[1]]); }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The waypoint off the head of the pier that a ship passes on her way to or from a place on the quay (so that she never crosses the pier). */
function offHead(base, side, B, slot) {
  const L = base.layout, ca = Math.cos(L.ang), sa = Math.sin(L.ang), t = side * (L.pier.w / 2 + 40 + B / 2), ss = 130 + 500 + 260;
  return [L.x + ss * ca - t * sa, L.z + ss * sa + t * ca];
}

/**
 * Take `ship` into `base`: she gets her place (a berth: see findBerth) and a path to it from where she is. Returns false when the port has no room for her.
 * `slot` can be given to use a place found before.
 */
export function beginDocking(world, ship, base, slot = null) {
  slot = slot || findBerth(base, ship);
  if (!slot || ship.dock) return false;
  const L = base.layout, B = ship.stats.B;
  const pts = [[ship.x, ship.z]];
  if (slot.kind === 'quay') {
    // from the approach point, in a straight line to a point off the head of the pier on her side, then along the pier to her place
    pts.push(offHead(base, slot.side, B, slot));
    const ca = Math.cos(L.ang), sa = Math.sin(L.ang), t = slot.side * (L.pier.w / 2 + 2.5 + B / 2);
    pts.push([L.x + (130 + slot.s + ship.stats.L * 0.7) * ca - t * sa, L.z + (130 + slot.s + ship.stats.L * 0.7) * sa + t * ca]);
    pts.push([slot.x, slot.z]);
  } else {
    pts.push([slot.x, slot.z]);
  }
  const path = mkPath(rounded(pts, 260));
  ship.dock = { base, slot, phase: 'in', d: 0, path, v: Math.max(ship.speed, 1), h0: ship.heading, hEnd: slot.heading, t: 0, service: null };
  base.moored.push({ ship, slot });
  ship.cmd.throttle = 0; ship.cmd.desiredHeading = null;
  world.events.push({ type: 'dockStart', ship, base });
  return true;
}

/** Order a moored ship out: the path reversed, to the exit point off the pier. */
export function beginUndocking(world, ship) {
  const dk = ship.dock;
  if (!dk || dk.phase !== 'moored') return;
  const base = dk.base, L = base.layout, B = ship.stats.B, slot = dk.slot;
  const pts = [[ship.x, ship.z]];
  if (slot.kind === 'quay') {
    const ca = Math.cos(L.ang), sa = Math.sin(L.ang), t = slot.side * (L.pier.w / 2 + 2.5 + B / 2);
    pts.push([L.x + (130 + slot.s + ship.stats.L * 0.7) * ca - t * sa, L.z + (130 + slot.s + ship.stats.L * 0.7) * sa + t * ca]);
    pts.push(offHead(base, slot.side, B, slot));
  }
  pts.push([L.approach.x, L.approach.z]);
  dk.path = mkPath(rounded(pts, 260)); dk.d = 0; dk.phase = 'out'; dk.v = 0; dk.h0 = ship.heading; dk.t = 0;
  dk.hEnd = Math.atan2(pts[pts.length - 1][0] - pts[pts.length - 2][0], -(pts[pts.length - 1][1] - pts[pts.length - 2][1]));
}

function release(world, ship) {
  const dk = ship.dock;
  if (!dk) return;
  const base = dk.base;
  base.moored = base.moored.filter((m) => m.ship !== ship);
  ship.dock = null;
  ship.mission = null;
  ship.speed = 3; ship.vx = Math.sin(ship.heading) * 3; ship.vz = -Math.cos(ship.heading) * 3;
  ship.cmd.throttle = 0.4;
  world.events.push({ type: 'dockEnd', ship, base });
}

/** Move a ship that is being taken in or out along her path (the engine is not in command: tugs). */
function drive(world, ship, dt) {
  const dk = ship.dock, path = dk.path;
  dk.t += dt;
  // the speed: eases in from where she was, eases off over the last 160 m when going in, and over the first 120 m when going out
  const remain = path.len - dk.d;
  let v = SPEED * (ship.stats.L > 200 ? 0.8 : 1);
  if (dk.phase === 'in') v = Math.min(v, Math.max(0.35, Math.sqrt(2 * 0.12 * remain)));
  else v = Math.min(v, 0.6 + dk.d * 0.03);
  dk.v += (v - dk.v) * Math.min(1, dt * 0.4);
  dk.d = Math.min(path.len, dk.d + dk.v * dt);
  const p = onPath(path, dk.d);
  ship.x = p.x; ship.z = p.z;
  const tangent = Math.atan2(p.tx, -p.tz);
  let h;
  if (dk.phase === 'in') {
    // she follows the path, and turns to lie along the pier over the last 220 m
    const k = clamp((path.len - dk.d) / 220, 0, 1);
    h = dk.hEnd + wrapPi(tangent - dk.hEnd) * k;
  } else {
    // backing off the quay: she keeps her heading for the first 200 m, then turns to the way out
    const k = clamp((dk.d - 200) / 320, 0, 1);
    h = dk.h0 + wrapPi(dk.hEnd - dk.h0) * k;
  }
  const dh = wrapPi(h - ship.heading);
  ship.yawRate = clamp(dh / Math.max(dt, 1e-3), -0.12, 0.12) * 0.8;
  ship.heading += ship.yawRate * dt;
  const backing = dk.phase === 'out' && dk.d < 200;
  ship.speed = backing ? -dk.v : dk.v;
  const fx = Math.sin(ship.heading), fz = -Math.cos(ship.heading);
  ship.vx = fx * ship.speed; ship.vz = fz * ship.speed;
  if (dk.d >= path.len - 0.01) {
    if (dk.phase === 'in') { dk.phase = 'moored'; ship.speed = 0; ship.vx = ship.vz = 0; ship.heading = dk.hEnd; ship.yawRate = 0; dk.t = 0; world.events.push({ type: 'moored', ship, base: dk.base }); }
    else release(world, ship);
  }
}

// ---- what a ship needs ---------------------------------------------------------------------------------------------------------------------------------------------

/** How empty her magazines are, 0..1 (the shells of the main and the secondary guns, and the light AA, weighted). */
export function ammoMissing(ship) {
  let all = 0, have = 0;
  for (const m of ship.mounts) { all += m.ammo0 * (m.group === 'main' ? 1.4 : 0.5); have += (m.ammo.AP + m.ammo.HE) * (m.group === 'main' ? 1.4 : 0.5); }
  for (const a of ship.aaMounts) { all += a.ammo0 * 0.05; have += a.ammo * 0.05; }
  return all > 0 ? clamp(1 - have / all, 0, 1) : 0;
}

/** The list of what is wrong with a ship and how long each job takes (seconds at full means): the work of the yard. */
function jobsOf(ship) {
  const st = ship.stats, f = { DD: 0.6, CL: 0.8, CA: 0.9, BB: 1.2, CV: 1.2 }[st.type] || 1, jobs = [];
  for (const m of ship.modules) if (m.state > 0 || m.hp < m.maxHp) jobs.push({ kind: 'module', m, work: (MODULE_REPAIR[m.kind] || 300) * f * (m.state === 2 ? 1 : 0.4) });
  for (const m of ship.mounts) if (!m.alive || m.jam > 0 || m.hp < m.maxHp * 0.99) jobs.push({ kind: 'mount', m, work: MOUNT_REPAIR(m.rec.cal) * (m.alive ? 0.3 : 1) });
  for (const a of ship.aaMounts) if (!a.alive) jobs.push({ kind: 'aa', m: a, work: 120 });
  if (ship.deckWrecked) jobs.push({ kind: 'deck', work: 900 * f });
  jobs.sort((a, b) => a.work - b.work);
  return jobs;
}

/** Everything is as it should be: nothing to replenish or repair. */
export function serviceDone(ship) {
  if (ammoMissing(ship) > 0.02) return false;
  if (needsRepair(ship) > 0.03) return false;
  if (ship.torpLeft < (ship.stats.torpedo ? ship.stats.torpedo.tubes : 0)) return false;
  if (ship.air && ship.air.ready + ship.air.fReady < ship.air.cap0) return false;
  return true;
}

/** How much repair she needs, 0..1: the water in her, the holes, the machinery, the guns and the people she has lost. */
export function needsRepair(ship) {
  let n = 0, w = 0;
  const add = (x, k) => { n += k; w += clamp(x, 0, 1) * k; };
  add(ship.waterFill / 0.35, 2);
  add(ship.holes.length / 6, 1);
  add(ship.fires.length / 3, 1);
  const bad = ship.modules.filter((m) => m.state === 2).length / Math.max(1, ship.modules.length);
  add(bad * 3, 3);
  add(ship.mounts.filter((m) => !m.alive).length / Math.max(1, ship.mounts.length) * 1.5, 2);
  add((1 - ship.crewFrac) * 1.5, 1.5);
  add(ship.deckWrecked ? 1 : 0, 1);
  return n ? w / n : 0;
}

// ---- the work of the yard on a moored ship --------------------------------------------------------------------------------------------------------------------------

/** Spend `dt` seconds of the yard's work on the ship moored at `base`. */
function service(world, base, ship, dt) {
  const dk = ship.dock, st = ship.stats;
  const at = dk.slot.kind === 'quay' ? 1 : 0.5;                       // lighters at the anchorage serve half as fast
  const rate = dt * at * base.layout.repair * Math.max(0.2, base.serviceFrac);
  if (!dk.service) { dk.service = { jobs: jobsOf(ship), fixed: 0 }; }
  const sv = dk.service;

  // fires: the port's fire parties put them out within a minute or two
  if (ship.fires.length) for (const f of ship.fires) f.t -= rate * 2.5 * 20;
  // the water: pumped out of every compartment; the holes: patched, three at a time
  if (ship.waterFill > 0.0005 || ship.holes.length) {
    const k = rate / PUMP;
    for (const c of ship.comps) { c.water[0] = Math.max(0, c.water[0] - k); c.water[1] = Math.max(0, c.water[1] - k); c.inflow = c.inflow || [0, 0]; }
  }
  if (ship.holes.length) {
    sv.patch = (sv.patch || 0) + rate * 3;
    while (sv.patch >= PATCH && ship.holes.length) { sv.patch -= PATCH; ship.holes.shift(); }
    if (!ship.holes.length) for (const c of ship.comps) { c.leaks = 0; c.struct = Math.max(0, c.struct - 0.4); }
  } else for (const c of ship.comps) if (c.struct > 0) c.struct = Math.max(0, c.struct - rate / 900);
  // the people: replacements come aboard
  if (ship.crewFrac < 1) {
    const k = rate / CREW_FILL;
    for (const s of [...ship.mounts, ...ship.aaMounts, ...ship.modules, ...ship.comps]) if (s.crew0 > 0 && s.crew < s.crew0) s.crew = Math.min(s.crew0, s.crew + s.crew0 * k);
  }
  // shells: every magazine is filled back to what she sailed with
  const kShells = rate / SERVICE.rearm[st.type];
  for (const m of ship.mounts) {
    const ap0 = Math.round(m.ammo0 * m.gun.apShare), he0 = m.ammo0 - ap0;
    if (m.ammo.AP < ap0) m.ammo.AP = Math.min(ap0, m.ammo.AP + m.ammo0 * kShells);
    if (m.ammo.HE < he0) m.ammo.HE = Math.min(he0, m.ammo.HE + m.ammo0 * kShells);
    if (m.ammo.AP + m.ammo.HE > 0.5) m.noAmmo = false;
  }
  for (const q of ship.modules) if (q.kind === 'magazine' && q.flooded && ship.mounts.every((m) => m.ammo.AP + m.ammo.HE > 0.5 || !m.alive)) { q.flooded = false; q.heat = 0; q.floodAt = null; q.floodOk = null; }
  for (const a of ship.aaMounts) if (a.ammo < a.ammo0) a.ammo = Math.min(a.ammo0, a.ammo + a.ammo0 * kShells * 2);
  // torpedoes and missiles
  if (st.torpedo) {
    sv.torp = (sv.torp || 0) + rate;
    if (sv.torp >= 90) { sv.torp = 0; if (ship.torpLeft < st.torpedo.tubes) { ship.torpLeft = Math.min(st.torpedo.tubes, ship.torpLeft + Math.max(1, Math.ceil(st.torpedo.tubes / 4))); for (const t of ship.tubes) t.left = Math.min(t.n, t.left + 1); } if (ship.torpSpare != null && st.torpedo.spare != null) ship.torpSpare = Math.min(st.torpedo.spare, ship.torpSpare + 1); }
  }
  if (ship.msl && ammoMissing(ship) < 0.5) sv.msl = (sv.msl || 0) + rate;
  if (sv.msl > SERVICE.rearm[st.type] * 0.5) { sv.msl = 0; ship.msl = initMissiles(st); }
  // the aircraft of a carrier: new aircraft are flown or lifted aboard, one every half minute
  if (ship.air && ship.air.ready + ship.air.fReady < ship.air.cap0) {
    sv.air = (sv.air || 0) + rate;
    if (sv.air >= 30) { sv.air = 0; if (ship.air.fReady < ship.air.fCap0) ship.air.fReady++; else if (ship.air.ready < ship.air.cap0 - ship.air.fCap0) ship.air.ready++; ship.updateParked?.(); }
  }
  // the repairs: the crews of the yard take the jobs one after the other, as many at a time as the yard has crews
  const crews = base.layout.size === 'large' ? 4 : 2;
  let busy = 0;
  for (const j of sv.jobs) {
    if (j.done) continue;
    if (busy >= crews) break;
    busy++;
    j.work -= rate * (1 + (j.kind === 'module' ? 0 : 0));
    if (j.work <= 0) { j.done = true; finish(world, ship, j); }
  }
  sv.jobs = sv.jobs.filter((j) => !j.done);
  // all fixed: the funnels, masts and boats that were shot away come back, the scars are painted over
  if (!sv.jobs.length && !ship.fires.length && !ship.holes.length && ship.waterFill < 0.002 && !sv.cleaned) {
    sv.cleaned = true;
    ship.partState.fill(0); ship.scars = [];
    ship.engine = 1; ship.rudderJam = 0; ship.rudderDead = false; ship.commandLoss = false;
    ship.updatePropulsion(); ship.updateFireControl(); ship.refreshArmament(); ship.updateParked?.();
  }
}

function finish(world, ship, j) {
  if (j.kind === 'module') {
    const m = j.m;
    m.hp = m.maxHp; m.state = 0; if (m.crew0 != null) m.crew = Math.max(m.crew, m.crew0 * 0.5);
    if (m.part != null) ship.partState[m.part] = 0;
    if (m.kind === 'steering') { ship.rudderDead = false; ship.rudderJam = 0; }
    if (m.kind === 'bridge') ship.commandLoss = false;
    if (m.kind === 'flightdeck') ship.deckWrecked = false;
    if (m.kind === 'avgas') ship.avgasLeak = false;
    if (m.kind === 'magazine') { m.flooded = false; m.heat = 0; m.floodAt = null; m.floodOk = null; }
    ship.updatePropulsion(); ship.updateFireControl();
  } else if (j.kind === 'mount') {
    const m = j.m;
    m.hp = m.maxHp; m.alive = true; m.wrecked = false; m.jam = 0;
    if (m.crew0 != null) m.crew = Math.max(m.crew, m.crew0 * 0.6);
    ship.refreshArmament();
  } else if (j.kind === 'aa') {
    j.m.alive = true; j.m.hp = j.m.maxHp; if (j.m.crew0 != null) j.m.crew = Math.max(j.m.crew, j.m.crew0 * 0.6);
  } else if (j.kind === 'deck') ship.deckWrecked = false;
}

// ---- per frame -----------------------------------------------------------------------------------------------------------------------------------------------------

/** Called every simulation step: moves the ships going in and out, serves the ones alongside, and sends them out when they are done. */
export function updatePorts(world, dt) {
  for (const base of world.bases) {
    if (base.layout.kind !== 'port') continue;
    base.serviceFrac = serviceFrac(base);
    for (const m of base.moored.slice()) {
      const ship = m.ship, dk = ship.dock;
      if (!ship.alive || !dk) { base.moored = base.moored.filter((q) => q !== m); continue; }
      if (dk.phase === 'in' || dk.phase === 'out') { drive(world, ship, dt); continue; }
      ship.speed = 0; ship.vx = ship.vz = 0;
      if (base.inert || !base.alive) { beginUndocking(world, ship); continue; }       // the port is lost: she gets out while she can
      service(world, base, ship, dt);
      dk.t += dt;
      // she leaves when she is whole and full, or when an enemy is near the port (she is needed at sea)
      if (!dk.leave && (serviceDone(ship) || dk.t > 3600) && dk.t > 20) dk.leave = true;
      if (dk.leave || ship.mission?.recall) beginUndocking(world, ship);
    }
  }
}
