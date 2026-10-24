// The way in to the target. A strike does not fly straight at the enemy: it looks at where his anti-aircraft guns are (the light mounts and the dual-purpose
// guns of every ship, as many as are still alive and have rounds) and picks the bearing from which to come in with the least fire along the way (and
// the sections of a wave keep apart from each other, so that the defence is split). The same figures make a lonely, weakly armed ship a better target
// than one in the middle of the screen.
import { wrapPi } from '../math.js';
import { AA } from './aadata.js';
import { inArcRel } from '../model/clearance.js';

const R_LIGHT = 3200, R_HEAVY = 7000;

/** The anti-aircraft strength of the ships of the other teams (of `team` itself when own is true), ship by ship: { ship, x, z, light, heavy } (light: hits a second; heavy: flak guns). */
export function aaSources(world, team, ahead = 20, own = false) {
  const out = [];
  for (const s of world.ships) {
    if ((s.team === team) !== own || !s.alive) continue;
    let light = 0, heavy = 0;
    const lm = [], hm = [], sx = s.vx * ahead, sz = s.vz * ahead, w0 = [0, 0, 0];
    for (const a of s.aaMounts) if (a.alive && a.ammo > 0) { const c = AA[a.rec.variant]; if (c) { const w = c.dps / c.hit * a.rec.n * 0.5; light += w; s.toWorld(a.rec.x, 0, a.rec.z, w0); lm.push({ x: w0[0] + sx, z: w0[2] + sz, w, rec: a.rec }); } }
    for (const m of s.mounts) if (m.group === 'sec' && m.alive && m.gun.cal <= 140 && m.gun.maxElevDeg >= 55 && !m.noAmmo) { const w = m.n * 0.12; heavy += w; s.toWorld(m.rec.x, 0, m.rec.z, w0); hm.push({ x: w0[0] + sx, z: w0[2] + sz, w, rec: m.rec }); }
    out.push({ ship: s, x: s.x + s.vx * ahead, z: s.z + s.vz * ahead, light, heavy, lm, hm, heading: s.heading });
  }
  // the batteries of the island bases are anti-aircraft too: one source at the centre of the guns that are still alive and have their own fire
  if (!own && world.bases) {
    for (const b of world.bases) {
      if (b.inert || b.team === team) continue;
      let light = 0, x = 0, z = 0, n = 0;
      for (const g of b.guns) if (g.kind === 'aa' && g.alive) { const c = AA[g.variant]; if (c) { light += c.dps / c.hit * g.n * 0.5; x += g.x; z += g.z; n++; } }
      if (n) out.push({ ship: b.target, x: x / n, z: z / n, light, heavy: 0 });
    }
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

/**
 * The same, mount by mount: a gun counts only where its arc reaches (a ship is blind where her own superstructure and the other mounts are in the way: the sector over
 * the bow of a cruiser with her light guns on the beams, the stern of a ship with her guns forward). The sources without mounts (the batteries of a base) count as before.
 */
export function exposureArcs(srcs, x, z, low = true, skip = null) {
  let e = 0;
  for (const q of srcs) {
    if (q.ship === skip) continue;
    if (!q.lm) { const d = Math.hypot(q.x - x, q.z - z); if (low && d < R_LIGHT) e += q.light * Math.pow(1 - d / R_LIGHT, 1.3); if (d < R_HEAVY) e += q.heavy * (1 - d / R_HEAVY) * 0.5; continue; }
    if (low) for (const m of q.lm) {
      const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
      if (d >= R_LIGHT) continue;
      const rec = m.rec, rel = inArcRel(rec, wrapPi(Math.atan2(dx, -dz) - q.heading - rec.yaw0));
      if (rec.noArc || rel < rec.arcMin || rel > rec.arcMax) continue;
      e += m.w * Math.pow(1 - d / R_LIGHT, 1.3);
    }
    for (const m of q.hm) {
      const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
      if (d >= R_HEAVY) continue;
      const rec = m.rec, rel = inArcRel(rec, wrapPi(Math.atan2(dx, -dz) - q.heading - rec.arcC));
      if (rec.noArc || rel < rec.arcMin || rel > rec.arcMax) continue;
      e += m.w * (1 - d / R_HEAVY) * 0.5;
    }
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
  // how the ship is sailing: a torpedo has the most to hit on the beam of a ship (the aspect 90 degrees), a bomb falls best on one that is coming at the aircraft, along its length (the aspect 0:
  // from ahead); a base has no bow, and no penalty
  const spd = Math.hypot(target.vx || 0, target.vz || 0), th = spd > 1 ? Math.atan2(target.vx, -target.vz) : target.heading;
  const aspW = world.airOpts && world.airOpts.aspect === 0 ? 0 : kind === 'torp' ? 7 : 4;
  let best = null;
  for (let k = -9; k <= 9; k++) {
    const a = a0 + k * 0.3;
    const wx = tx + Math.sin(a) * W, wz = tz - Math.cos(a) * W;
    let cost = 0;
    const seg = (x0, z0, x1, z1, lowFrom) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
        const low = kind === 'torp' || Math.hypot(x - tx, z - tz) < 4500 || lowFrom;
        cost += exposureArcs(srcs, x, z, low, target) * (L / n) / 1000;
      }
    };
    seg(from.x, from.z, wx, wz, false);
    seg(wx, wz, tx, tz, false);
    cost += 0.35 * Math.abs(k);
    if (aspW && th != null) {
      const asp = Math.abs(wrapPi(a - th));      // 0: from the bow, PI: from the stern
      cost += kind === 'torp' ? aspW * Math.pow(Math.abs(asp - Math.PI / 2) / (Math.PI / 2), 2) : aspW * Math.pow(asp / Math.PI, 1.5);
    }
    for (const t of taken) cost += 1.4 * Math.max(0, 1 - Math.abs(wrapPi(a - t)) / 0.55);
    if (!best || cost < best.cost) best = { a, cost, k };
  }
  return best.a;
}

/**
 * The friendly ship an aircraft that is being hunted should circle round: the one with the most anti-aircraft guns within 28 km (the nearer the better).
 * Returns null when there is none.
 */
export function refugeShip(world, team, x, z) {
  let best = null, bs = 0;
  for (const q of aaSources(world, team, 0, true)) {
    const d = Math.hypot(q.x - x, q.z - z);
    if (d > 28000) continue;
    const sc = (q.light + q.heavy * 1.5 + 0.15) / (1 + d / 9000);
    if (sc > bs) { bs = sc; best = q.ship; }
  }
  return best;
}
