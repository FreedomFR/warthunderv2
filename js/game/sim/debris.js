// Flying wreckage: funnels, masts, turrets and scrap torn off ships, pieces of broken aircraft. Simple ballistic
// bodies with spin; they splash into the sea. Drawn by game.js through the ship / aircraft visuals.
import { clamp } from '../math.js';

let nextDebris = 1;

function make(world, o) {
  const d = {
    id: nextDebris++, kind: o.kind, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz,
    heading: o.heading || 0, pitch: o.pitch || 0, roll: o.roll || 0,
    wh: o.wh ?? (world.rng() - 0.5) * 2, wp: o.wp ?? (world.rng() - 0.5) * 3, wr: o.wr ?? (world.rng() - 0.5) * 3,
    age: 0, ttl: o.ttl ?? 40, burn: o.burn ?? 0, size: o.size ?? 1, drag: o.drag ?? 0.02,
    model: o.model || null, index: o.index ?? 0, cx: o.cx || 0, cy: o.cy || 0, cz: o.cz || 0, piece: o.piece || null, typeKey: o.typeKey || null,
    scrap: o.scrap ?? 0, tint: o.tint || null, trail: 0,
  };
  if (world.debris.length > 260) world.debris.shift();
  world.debris.push(d);
  return d;
}

/** A visible ship part (funnel, mast, bridge...) breaks away. */
export function spawnPartDebris(world, ship, part, idx) {
  const rng = world.rng;
  const bb = part.bb;
  const cx = (bb[0] + bb[3]) / 2, cy = (bb[1] + bb[4]) / 2, cz = (bb[2] + bb[5]) / 2;
  const w = ship.toWorld(cx, cy, cz, [0, 0, 0]);
  const out = Math.sign(cz) || (rng() < 0.5 ? -1 : 1);
  const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
  const big = part.kind === 'bridge' || part.kind === 'funnel';
  const sp = big ? 5 + rng() * 6 : 8 + rng() * 10;
  make(world, {
    kind: 'part', model: ship.model, index: idx, size: Math.max(bb[3] - bb[0], bb[4] - bb[1]), cx, cy, cz,
    x: w[0], y: w[1], z: w[2],
    vx: ship.vx + ch * out * sp * (0.4 + rng() * 0.6) + (rng() - 0.5) * 4, vy: (big ? 6 : 10) + rng() * 10, vz: ship.vz + sh * out * sp * (0.4 + rng() * 0.6) + (rng() - 0.5) * 4,
    heading: ship.heading, pitch: ship.pitch, roll: ship.roll,
    wp: (rng() - 0.5) * 1.6, wr: out * (0.4 + rng() * 1.2), wh: (rng() - 0.5) * 0.8,
    burn: big ? 1 : 0.5, ttl: 30,
  });
}

/** A gun turret thrown out by an explosion (the house mesh of the mount). */
export function spawnMountDebris(world, ship, mountIdx, power = 1) {
  const rng = world.rng;
  const rec = ship.model.mounts[mountIdx];
  const w = ship.toWorld(rec.x, rec.y, rec.z, [0, 0, 0]);
  const a = rng() * 6.283, sp = (10 + rng() * 22) * power;
  make(world, {
    kind: 'mount', model: ship.model, index: mountIdx, size: Math.max(2, rec.cal / 90),
    x: w[0], y: w[1] + 1, z: w[2], vx: ship.vx + Math.cos(a) * sp, vy: (22 + rng() * 34) * power, vz: ship.vz + Math.sin(a) * sp,
    heading: ship.heading + rec.arcC + (ship.mounts[mountIdx] ? ship.mounts[mountIdx].trainRel : 0), pitch: ship.pitch, roll: ship.roll,
    wp: (rng() - 0.5) * 2.5, wr: (rng() - 0.5) * 3, wh: (rng() - 0.5) * 1.5, burn: 1, ttl: 40,
  });
}

/** Scrap metal: plates, beams, chunks. */
export function spawnScrap(world, x, y, z, n, speed, vx0 = 0, vz0 = 0, burn = 0.6, o = {}) {
  const rng = o.rng || world.rng, sz = o.size ?? 1;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, el = 0.3 + rng() * 1.15, sp = speed * (0.35 + 0.8 * rng());
    make(world, {
      kind: 'scrap', scrap: Math.floor(rng() * 3), size: (0.8 + rng() * 1.8) * sz,
      x, y, z, vx: vx0 + Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: vz0 + Math.sin(a) * Math.cos(el) * sp,
      wp: (rng() - 0.5) * 9, wr: (rng() - 0.5) * 9, wh: (rng() - 0.5) * 6, burn: burn * rng(), ttl: 20, drag: 0.04,
    });
  }
}

/** A piece of an aircraft (wing, tail). */
export function spawnPlaneDebris(world, plane, piece, vel = 1) {
  const rng = world.rng;
  const side = piece === 'wingL' ? -1 : piece === 'wingR' ? 1 : 0;
  const sh = Math.sin(plane.heading), ch = Math.cos(plane.heading);
  make(world, {
    kind: 'plane', typeKey: plane.typeKey, piece, x: plane.x, y: plane.y, z: plane.z,
    vx: plane.vx * 0.9 + ch * side * 8 * vel, vy: plane.vy * 0.5 + 2 + rng() * 6, vz: plane.vz * 0.9 + sh * side * 8 * vel,
    heading: plane.heading, pitch: plane.pitch, roll: plane.roll,
    wp: (rng() - 0.5) * 4, wr: side * (2 + rng() * 3) || (rng() - 0.5) * 4, wh: (rng() - 0.5) * 2, burn: 0.6, ttl: 25, size: 4, drag: 0.1,
  });
}

export function stepDebris(world, dt) {
  const arr = world.debris;
  for (let i = arr.length - 1; i >= 0; i--) {
    const d = arr[i];
    d.age += dt;
    const k = Math.exp(-d.drag * dt);
    d.vx *= k; d.vz *= k; d.vy = d.vy * k - 9.81 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.pitch += d.wp * dt; d.roll += d.wr * dt; d.heading += d.wh * dt;
    if (d.y < 0.3 || d.age > d.ttl) {
      if (d.y < 0.6 && d.age < d.ttl) world.events.push({ type: 'debrisSplash', x: d.x, z: d.z, size: clamp(d.size, 0.6, 12), kind: d.kind });
      arr.splice(i, 1);
    }
  }
}
