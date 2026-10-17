// Ship explosions and break-ups: the magazine detonation (primary blast, thrown turrets, secondary explosions
// running down the hull, the ship breaking in two), boiler explosions while sinking, burning oil afterwards.
import { clamp } from '../math.js';
import { blast } from './modules.js';
import { spawnMountDebris, spawnScrap } from './debris.js';
import { killPlane } from './aircraft.js';

/** Size scale of the explosion of a ship (a destroyer is 1, a battleship about 3). */
export function explosionScale(ship) { return clamp(Math.pow(ship.stats.L / 100, 0.8), 0.6, 3.0); }

/**
 * The ammunition of a ship detonates. `where` = world position [x, y, z], `mag` = the magazine module.
 */
export function magazineExplosion(world, ship, owner, where, mag) {
  if (ship.exploded || ship.state === 'sunk') return;
  const rng = world.rng, st = ship.stats;
  const S = explosionScale(ship);
  const lx = mag ? mag.x : 0, ly = mag ? mag.y : -2, lz = mag ? mag.z : 0;
  ship.exploded = true;
  world.events.push({ type: 'explosion', stage: 'primary', x: where[0], y: where[1] + 3, z: where[2], size: S, ship, magazine: true });

  // turrets nearest to the burst are thrown out of the ship, the others are wrecked
  const reach = 70 * S;
  for (const m of ship.mounts) {
    if (!m.alive) continue;
    const d = Math.hypot(m.rec.x - lx, m.rec.z - lz);
    if (d < reach && rng() < clamp(1.25 - d / reach, 0.2, 1) && m.rec.kind === 'turret' && m.rec.cal > 120) {
      m.gone = true;
      spawnMountDebris(world, ship, m.idx, clamp(S * 0.7, 0.6, 1.5));
    }
    m.wrecked = true;
  }
  for (const a of ship.aaMounts) if (Math.abs(a.rec.x - lx) < 60 * S && rng() < 0.85) { a.alive = false; }
  ship.destroy(owner, 'magazine');
  blast(world, ship, lx, ly, lz, 450 * S * S * S, 'inside', owner, 'magazine');

  // fires everywhere along the wreck
  for (let i = 0; i < 6; i++) ship.addFire((rng() - 0.5) * st.L * 0.7, 2 + rng() * 6, (rng() - 0.5) * st.B * 0.5, 1.2);
  // scrap and burning debris
  spawnScrap(world, where[0], where[1] + 4, where[2], Math.round(28 + 22 * S), 40 + 28 * S, ship.vx, ship.vz, 1);

  // secondary explosions running along the hull
  const n = 3 + Math.floor(S * 2);
  let t = 0.3;
  for (let i = 0; i < n; i++) {
    t += 0.3 + rng() * 0.5;
    const sx = lx + (rng() - 0.5) * st.L * 0.7, sz = (rng() - 0.5) * st.B * 0.5, sy = 2 + rng() * 5;
    world.after(t, () => secondaryBlast(world, ship, clamp(sx, -st.L * 0.45, st.L * 0.45), sy, sz, (0.35 + 0.45 * rng()) * S));
  }
  // the hull breaks in two
  if (st.L > 85 && rng() < 0.9) world.after(0.35 + rng() * 0.45, () => breakInTwo(world, ship, clamp(lx + (rng() - 0.5) * 12, -st.L * 0.3, st.L * 0.3)));

  // shock wave: neighbouring ships and aircraft
  const R = 140 * S;
  for (const o of world.ships) {
    if (o === ship || !o.alive) continue;
    const d = Math.hypot(o.x - ship.x, o.z - ship.z);
    if (d < R) {
      const f = 1 - d / R;
      o.applyDamage(o.stats.maxHp * 0.05 * f * f, owner, 'blast');
      // the blast also scours the topsides facing it
      const loc = o.toLocal(where[0], 0, where[2], [0, 0, 0]);
      blast(world, o, clamp(loc[0], -o.stats.L / 2, o.stats.L / 2), 6, clamp(loc[2], -o.stats.B / 2, o.stats.B / 2), 40 * f * S, 'outside', owner, 'blast');
    }
  }
  for (const p of world.planes) if (Math.hypot(p.x - where[0], p.z - where[2]) < R * 2.2 && p.dying !== true) killPlane(world, p, 'blast', owner);
  world.seaShock = { x: where[0], z: where[2], t: world.time, size: S };
}

/** A smaller explosion somewhere on the ship (boilers, ammunition, fuel). */
export function secondaryBlast(world, ship, lx, ly, lz, size) {
  if (ship.state === 'sunk') return;
  const w = ship.toWorld(lx, ly, lz, [0, 0, 0]);
  world.events.push({ type: 'explosion', stage: 'secondary', x: w[0], y: w[1], z: w[2], size, ship });
  spawnScrap(world, w[0], w[1] + 1, w[2], Math.round(6 + 8 * size), 22 + 14 * size, ship.vx, ship.vz, 0.8);
  if (ship.state === 'afloat') blast(world, ship, lx, ly, lz, 120 * size * size, 'inside', null, 'shell');
  ship.addFire(lx, Math.max(ly, 1.5), lz, 1.0);
}

/** The hull breaks in two at local x = cutX. */
export function breakInTwo(world, ship, cutX) {
  if (ship.split || ship.state === 'sunk' || ship.sinkT > 10) return;
  const rng = world.rng, st = ship.stats;
  const S = explosionScale(ship);
  const bowHeavy = cutX > 0;       // which section keeps more of the buoyancy: the longer one
  const mk = (sign) => {
    const isBow = sign > 0;
    const longer = (isBow && !bowHeavy) || (!isBow && bowHeavy) ? 1 : 0;       // bow is longer when the cut is aft of centre
    return {
      sign, dx: 0, dy: 0, dz: 0,
      vx: sign * (1.5 + rng() * 3) * Math.min(S, 2), vy: 2 + rng() * 5, vz: (rng() - 0.5) * 2,
      yaw: 0, pitch: 0, roll: 0, wp: -sign * (0.15 + rng() * 0.25), wr: (rng() - 0.5) * 0.6, wy: (rng() - 0.5) * 0.12,
      // resting attitude: the broken ends point upwards while the section fills with water
      pitchT: isBow ? (0.25 + rng() * 0.45) * (longer ? 0.6 : 1) : -(0.2 + rng() * 0.45),
      rollT: (rng() < 0.5 ? -1 : 1) * (0.15 + rng() * 0.6),
      buoy: longer ? 0.95 : 0.7, leak: longer ? 0.05 + rng() * 0.04 : 0.09 + rng() * 0.06,
    };
  };
  ship.split = { cut: cutX, t: 0, halves: [mk(1), mk(-1)] };
  const w = ship.toWorld(cutX, 3, 0, [0, 0, 0]);
  world.events.push({ type: 'shipBreak', ship, x: w[0], y: w[1], z: w[2], size: S });
  spawnScrap(world, w[0], w[1] + 2, w[2], Math.round(10 + 10 * S), 20 + 10 * S, ship.vx, ship.vz, 1);
  for (let i = 0; i < 3; i++) ship.addFire(cutX + (rng() - 0.5) * 6, 2 + rng() * 3, (rng() - 0.5) * st.B * 0.4, 1.3);
}

/** The ship is gone: burning oil, wreckage. */
export function shipGone(world, ship) {
  const st = ship.stats;
  const burning = ship.exploded || ship.fires.length >= 2 || ship.fireLevel > 0.25;
  world.events.push({ type: 'shipGone', ship, x: ship.x, z: ship.z });
  if (burning) world.addSeaFire(ship.x, ship.z, clamp(st.L * 0.22, 12, 70), 55 + world.rng() * 70, clamp(st.L / 180, 0.5, 1.4));
}
