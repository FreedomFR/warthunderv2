// The anti-aircraft fire of the ships at the aircraft in the sky: who can shoot at whom (the arc of each mount, the lead on a fast target, the flak guns' burst), the hits it
// makes (the damage is resolved in sim/planedamage.js).
import { crewOf } from './hull.js';
import { clamp, wrapPi, D2R } from '../math.js';
import { AA, FLAK_RANGE } from './aadata.js';
import { clearElev, clearMax, inArcRel } from '../model/clearance.js';
import { lightAAHitRate, extentToward } from './airhit.js';
import { DECK_PHASES } from './deck.js';
import { hitPlane } from './planedamage.js';

export const ATTACK_PHASES = new Set(['ip', 'run', 'rollin', 'dive']);
const _w = [0, 0, 0];

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

export function updateAA(world, dt) {
  if (!world.planes.length) {
    // relax the guns
    for (const ship of world.ships) for (const a of ship.aaMounts) { a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4); }
    return;
  }
  const rng = world.rng;
  for (const ship of world.ships) {
    if (!ship.canFire) continue;
    const threats = planeThreats(world, ship);
    const lowAmmo = ship.aaAmmo().frac < 0.2;
    // light AA mounts
    for (const a of ship.aaMounts) {
      a.flash = Math.max(0, a.flash - dt * 6); a.recoil = Math.max(0, a.recoil - dt * 4);
      if (!a.alive || !ship.mountUsable(a)) { a.target = null; continue; }
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
      if (rng() < hitRate * dt * (0.3 + 0.7 * crewOf(a))) hitPlane(world, ship, p, cfg.hit * (0.7 + 0.6 * rng()), a.rec.cal);
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
      if (m.group !== 'sec' || !m.alive || !ship.mountUsable(m) || m.gun.cal > 140 || m.gun.maxElevDeg < 55 || m.noAmmo || m.jam > 0) continue;
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
      m.reload = m.reloadMax = m.gun.reload * (0.9 + rng() * 0.2) * 1.15;
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
