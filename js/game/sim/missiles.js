// The guided missiles of the ships (the spec sheet's `missiles`): a surface-to-air missile (RIM-24 Tartar) that is fired at aircraft and steers itself on them, and a rocket-thrown
// torpedo (RUR-5 ASROC) that is fired at ships, flies a ballistic arc and drops its torpedo on a parachute near the target. A ship keeps a stock of each (ship.msl), fires
// when a target is in the window of range of the system, and the SAM is limited by the number of fire-control channels (targets guided at the same time).
import { clamp, KN } from '../math.js';
import { hitPlane } from './planedamage.js';
import { DECK_PHASES } from './deck.js';
import { interceptTime } from './weapons.js';
import { tntEquivalent } from '../data/explosives.js';

const _w = [0, 0, 0];
const SCAN = 0.5;                       // s between two looks for a target
const BURST_RADIUS = 25;                // m: the proximity fuze of the SAM
const MAX_TURN = 0.42;                  // rad/s: about 25 g at the speed of the missile
const ACCEL = 300;                      // m/s2 of the booster

/** The stock of each missile system of a ship: [{ def, left, nextT, scan }]. */
export function initMissiles(stats) {
  return (stats.missiles || []).map((def) => ({ def, left: def.count, nextT: 0, scan: 0 }));
}

/** Normalised stats of the `missiles` of a spec sheet. */
export function missileStats(spec) {
  return (spec.missiles || []).map((m) => ({
    kind: m.kind, name: m.name, count: m.count, salvo: m.salvo || 1, cycleS: m.cycleS || 10, channels: m.channels || 1, minRange: m.minRangeM || 500, maxRange: m.maxRangeM,
    ceiling: m.ceilingM || 12000, speed: m.speedMs || 400, killChance: m.killChance ?? 0.75, warhead: tntEquivalent(m.warheadKg || 40, m.explosive), filler: m.warheadKg || 40,
    torpSpeed: (m.torpedoSpeedKn || 40) * KN, torpRange: m.torpedoRangeM || 8000,
  }));
}

/** Can the launcher of `sys` bear on the point (px, pz)? A launcher without limits (arcH >= pi) bears on every bearing. */
function bears(ship, sys, px, pz) {
  const m = sys.arc;
  if (!m || m.arcH === undefined || m.arcH >= Math.PI) return true;
  let a = Math.atan2(px - ship.x, -(pz - ship.z)) - ship.heading - (m.arcC || 0);
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) <= m.arcH;
}

const mountOf = (ship, kind) => ship.model.missileMounts?.find((m) => m.kind === kind);

/** Per ship and per tick: look for a target and fire. */
export function updateMissileLaunchers(ship, world, dt) {
  if (!ship.msl || !ship.msl.length || ship.state !== 'afloat') return;
  for (const sys of ship.msl) {
    if (sys.left <= 0) continue;
    sys.scan -= dt;
    if (sys.scan > 0 || world.time < sys.nextT) continue;
    sys.scan = SCAN;
    const m = mountOf(ship, sys.def.kind);
    if (!m) continue;
    ship.toWorld(m.x, m.y, m.z, _w);
    const ox = _w[0], oy = _w[1], oz = _w[2];
    sys.arc = m;                                                   // the traverse of the launcher: arcC (bow = 0) and arcH either side of it, in the ship's frame
    if (sys.def.kind === 'sam') fireSam(ship, world, sys, ox, oy, oz);
    else if (sys.def.kind === 'asroc') fireAsroc(ship, world, sys, ox, oy, oz);
  }
}

function fireSam(ship, world, sys, ox, oy, oz) {
  const def = sys.def;
  // the targets already followed by a missile of this ship (the channels of the illuminators)
  const followed = new Map();
  for (const q of world.missiles) if (q.owner === ship && q.kind === 'sam' && q.target) followed.set(q.target, (followed.get(q.target) || 0) + 1);
  let best = null, bs = 1e18;
  for (const p of world.planes) {
    if (p.team === ship.team || p.dying || p.hp <= 0 || DECK_PHASES.has(p.phase) || p.ground || p.y < 25 || p.y > def.ceiling) continue;
    const d = Math.hypot(p.x - ox, p.y - oy, p.z - oz);
    if (d < def.minRange || d > def.maxRange || !bears(ship, sys, p.x, p.z)) continue;
    const n = followed.get(p) || 0;
    if (n >= 2) continue;                                          // two missiles on a target are enough
    if (n === 0 && followed.size >= def.channels) continue;        // no free channel
    // the aircraft that are after this ship come first, then the nearest
    const s = d * (p.target === ship ? 0.5 : 1) * (n ? 1.4 : 1);
    if (s < bs) { bs = s; best = p; }
  }
  if (!best) return;
  for (let i = 0; i < def.salvo && sys.left > 0; i++) {
    sys.left--;
    spawnSam(world, ship, def, best, ox, oy, oz + (i ? 0.3 : 0), i * 0.6);
  }
  sys.nextT = world.time + def.cycleS;
}

function spawnSam(world, ship, def, target, ox, oy, oz, delay) {
  const dx = target.x - ox, dz = target.z - oz, hd = Math.hypot(dx, dz) || 1, el = Math.max(0.35, Math.atan2(target.y - oy, hd)), ce = Math.cos(el);
  const q = {
    id: world.missileSeq = (world.missileSeq || 0) + 1, kind: 'sam', def, owner: ship, team: ship.team, target, x: ox, y: oy, z: oz,
    vx: dx / hd * ce * 60, vy: Math.sin(el) * 60, vz: dz / hd * ce * 60, speed: 60, age: -delay, life: def.maxRange / def.speed * 1.25 + 8, trail: 0,
  };
  world.missiles.push(q);
  world.events.push({ type: 'missileLaunch', kind: 'sam', x: ox, y: oy, z: oz, dx: dx / hd, dz: dz / hd });
}

function fireAsroc(ship, world, sys, ox, oy, oz) {
  const def = sys.def;
  let best = null, bs = 0;
  for (const e of world.enemiesOf(ship)) {
    if (!e.alive || e.state !== 'afloat') continue;
    const d = Math.hypot(e.x - ox, e.z - oz);
    if (d < def.minRange || d > def.maxRange || d > (ship.stats.visualRange || 1e9) || !bears(ship, sys, e.x, e.z)) continue;
    const T = world.terrain;
    if (T && T.blocks && T.blocks(ship.x, 0.4, ship.z, e.x, 0.4, e.z)) continue;            // an island between: the torpedo would run aground
    const s = (e.stats.type === 'DD' ? 1.0 : 1.4) * (1 + (1 - e.hpFrac) * 0.6) / (0.4 + d / def.maxRange);
    if (s > bs) { bs = s; best = e; }
  }
  if (!best) return;
  sys.left--;
  const d = Math.hypot(best.x - ox, best.z - oz), tf = d / def.speed + 4;               // the flight and the descent under the parachute
  // the splashdown point: where the target will be, a little short of it so that the torpedo runs on to meet it
  const px = best.x + best.vx * tf, pz = best.z + best.vz * tf, off = 260, k = Math.hypot(px - ship.x, pz - ship.z) || 1;
  const ax = px + (ship.x - px) / k * off, az = pz + (ship.z - pz) / k * off;
  const flight = Math.hypot(ax - ox, az - oz);
  world.missiles.push({
    id: world.missileSeq = (world.missileSeq || 0) + 1, kind: 'asroc', def, owner: ship, team: ship.team, target: best, x: ox, y: oy, z: oz, x0: ox, z0: oz, ax, az, flight, run: 0, speed: def.speed,
    vx: (ax - ox) / flight * def.speed, vz: (az - oz) / flight * def.speed, vy: 0, age: 0, life: flight / def.speed + 5, trail: 0,
  });
  world.events.push({ type: 'missileLaunch', kind: 'asroc', x: ox, y: oy, z: oz, dx: (ax - ox) / flight, dz: (az - oz) / flight });
  sys.nextT = world.time + def.cycleS;
}

/** The missiles in flight. */
export function stepMissiles(world, dt) {
  const arr = world.missiles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const q = arr[i];
    q.age += dt;
    if (q.age < 0) continue;                                       // the second missile of a salvo waits for its turn on the rail
    let done = false;
    if (q.kind === 'sam') done = stepSam(world, q, dt);
    else done = stepAsroc(world, q, dt);
    if (done) arr.splice(i, 1);
  }
}

function stepSam(world, q, dt) {
  const def = q.def, tg = q.target;
  q.speed = Math.min(def.speed, q.speed + ACCEL * dt);
  let dx = q.vx, dy = q.vy, dz = q.vz;
  const sp = Math.hypot(dx, dy, dz) || 1;
  dx /= sp; dy /= sp; dz /= sp;
  const live = tg && !tg.dying && tg.hp > 0 && world.planes.includes(tg);
  if (live && q.age > 0.5) {
    const rx = tg.x - q.x, ry = tg.y - q.y, rz = tg.z - q.z, r = Math.hypot(rx, ry, rz);
    if (r < BURST_RADIUS) return burstSam(world, q, tg, r);
    const t = Math.min(25, r / Math.max(q.speed, 1));
    // the point to steer for: where the aircraft will be when the missile gets there
    let ax = rx + tg.vx * t, ay = ry + tg.vy * t, az = rz + tg.vz * t;
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    const dot = clamp(dx * ax + dy * ay + dz * az, -1, 1), ang = Math.acos(dot), step = Math.min(ang, MAX_TURN * dt * (0.4 + 0.6 * Math.min(1, q.speed / def.speed)));
    if (ang > 1e-4) {
      // rotate (dx,dy,dz) towards (ax,ay,az) by `step`
      const k = Math.sin(step) / Math.sin(ang), c = Math.cos(step) - dot * k;
      dx = dx * c + ax * k; dy = dy * c + ay * k; dz = dz * c + az * k;
      const n = Math.hypot(dx, dy, dz) || 1; dx /= n; dy /= n; dz /= n;
    }
  } else if (!live && q.age > 0.5) {
    q.lost = (q.lost || 0) + dt;                                   // the target is gone: the missile destroys itself soon
    if (q.lost > 1.5) { world.events.push({ type: 'flak', x: q.x, y: q.y, z: q.z, cal: 127 }); return true; }
  }
  q.vx = dx * q.speed; q.vy = dy * q.speed; q.vz = dz * q.speed;
  q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
  if (q.y < 1) { world.events.push({ type: 'splash', x: q.x, z: q.z, cal: 200, dx: q.vx, dz: q.vz, speed: q.speed, shell: 'HE' }); return true; }
  return q.age > q.life;
}

function burstSam(world, q, tg, r) {
  const def = q.def;
  world.events.push({ type: 'flak', x: q.x, y: q.y, z: q.z, cal: 203 });
  // the continuous-rod warhead: a kill from close by, less likely at the edge of the burst
  const pk = def.killChance * (r < 12 ? 1 : 1 - (r - 12) / 13 * 0.65);
  if (world.rng() < pk) hitPlane(world, q.owner, tg, 8, 127, 'aa');
  else hitPlane(world, q.owner, tg, 0.9, 127, 'aa');
  return true;
}

function stepAsroc(world, q, dt) {
  q.run += q.speed * dt;
  const u = clamp(q.run / q.flight, 0, 1);
  q.x = q.x0 + (q.ax - q.x0) * u; q.z = q.z0 + (q.az - q.z0) * u;
  // a ballistic arc: the rocket climbs, then dives to the point where the torpedo is released
  q.y = Math.max(0, 4 * (0.16 * q.flight) * u * (1 - u) + 8 * (1 - u));
  q.vx = (q.ax - q.x0) / q.flight * q.speed; q.vz = (q.az - q.z0) / q.flight * q.speed;
  q.vy = 4 * 0.16 * q.flight * (1 - 2 * u) * q.speed / q.flight;
  if (u < 1) return false;
  // release: the torpedo drops on its parachute and runs towards the target
  const def = q.def, tg = q.target, owner = q.owner;
  world.events.push({ type: 'splash', x: q.ax, z: q.az, cal: 330 });
  world.events.push({ type: 'torpedoEntry', x: q.ax, z: q.az });
  const tp = tg && tg.alive ? tg : null;
  if (tp) {
    const tt = interceptTime(q.ax, q.az, tp.x, tp.z, tp.vx, tp.vz, def.torpSpeed);
    const ix = tt > 0 ? tp.x + tp.vx * tt : tp.x, iz = tt > 0 ? tp.z + tp.vz * tt : tp.z, d = Math.hypot(ix - q.ax, iz - q.az) || 1;
    world.spawnTorpedo({ owner, x: q.ax, z: q.az, vx: (ix - q.ax) / d * def.torpSpeed, vz: (iz - q.az) / d * def.torpSpeed, speed: def.torpSpeed, range: def.torpRange, warhead: def.warhead, team: owner.team });
  }
  return true;
}
