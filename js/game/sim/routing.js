// The way in to the target. A strike does not fly straight at the enemy: it looks at where his anti-aircraft guns are (the light mounts and the dual-purpose
// guns of every ship, as many as are still alive and have rounds) and picks the bearing from which to come in with the least fire along the way (and
// the sections of a wave keep apart from each other, so that the defence is split). The same figures make a lonely, weakly armed ship a better target
// than one in the middle of the screen.
import { wrapPi } from '../math.js';
import { AA } from './aadata.js';

const R_LIGHT = 3200, R_HEAVY = 7000;

/** The enemy anti-aircraft strength, ship by ship: { ship, x, z, light, heavy } (light: hits a second; heavy: flak guns). */
export function aaSources(world, team, ahead = 20) {
  const out = [];
  for (const s of world.ships) {
    if (s.team === team || !s.alive) continue;
    let light = 0, heavy = 0;
    for (const a of s.aaMounts) if (a.alive && a.ammo > 0) { const c = AA[a.rec.variant]; if (c) light += c.dps / c.hit * a.rec.n * 0.5; }
    for (const m of s.mounts) if (m.group === 'sec' && m.alive && m.gun.cal <= 140 && m.gun.maxElevDeg >= 55 && !m.noAmmo) heavy += m.n * 0.12;
    out.push({ ship: s, x: s.x + s.vx * ahead, z: s.z + s.vz * ahead, light, heavy });
  }
  return out;
}

/** The fire an aircraft meets at (x, z): the light guns count when it is low, the flak guns at any height. */
export function exposure(srcs, x, z, low = true, skip = null) {
  let e = 0;
  for (const q of srcs) {
    if (q.ship === skip) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (low && d < R_LIGHT) e += q.light * Math.pow(1 - d / R_LIGHT, 1.3);
    if (d < R_HEAVY) e += q.heavy * (1 - d / R_HEAVY) * 0.5;
  }
  return e;
}

/** How exposed a ship is to the fire of the others (a target in the middle of the screen is worse than one on its own). */
export function density(srcs, ship) { return exposure(srcs, ship.x, ship.z, true, ship); }

/**
 * Pick the bearing (from the target) of the way in, among those within about 100 degrees of the direct one: the path from `from` by the entry point
 * (9.8 km out on that bearing) to the target, low for a torpedo bomber (light guns count all the way), high for a dive bomber (they count in the last 4.5 km).
 * `taken` are the bearings the other sections of the wave have chosen: keeping 0.5 rad away from them costs less than the fire it avoids, or not.
 */
export function chooseApproach(world, team, from, target, kind, taken = []) {
  // where the ships will be when the strike gets there
  const eta = Math.min(300, Math.hypot(from.x - target.x, from.z - target.z) / 80);
  const srcs = aaSources(world, team, eta);
  const tx = target.x + (target.vx || 0) * eta, tz = target.z + (target.vz || 0) * eta;
  const a0 = Math.atan2(from.x - tx, -(from.z - tz));
  const W = 9800, step = 400;
  let best = null;
  for (let k = -6; k <= 6; k++) {
    const a = a0 + k * 0.3;
    const wx = tx + Math.sin(a) * W, wz = tz - Math.cos(a) * W;
    let cost = 0;
    const seg = (x0, z0, x1, z1, lowFrom) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
        const low = kind === 'torp' || Math.hypot(x - tx, z - tz) < 4500 || lowFrom;
        cost += exposure(srcs, x, z, low, target) * (L / n) / 1000;
      }
    };
    seg(from.x, from.z, wx, wz, false);
    seg(wx, wz, tx, tz, false);
    cost += 0.35 * Math.abs(k);
    for (const t of taken) cost += 1.4 * Math.max(0, 1 - Math.abs(wrapPi(a - t)) / 0.55);
    if (!best || cost < best.cost) best = { a, cost, k };
  }
  return best.a;
}
