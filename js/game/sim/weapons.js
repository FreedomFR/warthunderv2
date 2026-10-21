// Gunnery (fire control, turret slewing, salvos) and torpedo launching.
import { clamp, wrapPi, approach, D2R } from '../math.js';
import { gunBallistics, solve } from './ballistics.js';
import { V_EXP, effectiveThickness, spacedPlates, fuzeThickness } from './penetration.js';
import { mountDims } from '../model/mounts.js';
import { clearElev, clearMax, pathClear, inArcRel } from '../model/clearance.js';

/** how far a turret can depress below the horizontal (rad): a battleship has to shoot down at a destroyer that is close */
const DEPRESS = 4 * D2R;
const _p = [0, 0, 0];
const _q = [0, 0, 0];
const _sol = {};

/** Barrel recoil (0..1): the tube is thrown back in a few hundredths of a second and creeps forward again on the recuperators. */
export function recoilCurve(t) {
  if (t < 0.06) return Math.sin(t / 0.06 * Math.PI / 2);
  const x = 1 - (t - 0.06) / 1.6;
  return x <= 0 ? 0 : x * x * (3 - 2 * x);
}

function dimsOf(rec) { return rec._dims || (rec._dims = mountDims(rec)); }

function ball(m) {
  if (!m.ball) m.ball = gunBallistics({ cal: m.gun.cal, v0: m.gun.v0, shellKg: m.gun.shellKg, maxRange: m.gun.maxRange, maxElevDeg: Math.min(m.gun.maxElevDeg, 50) });
  return m.ball;
}

/** Aim height on a target (m above the waterline): belt for armoured ships, upperworks otherwise. */
function aimHeight(target) {
  // a base: the buildings and guns on the ground of the island, which stands at the height of the base
  if (target.isBase) return target.y + 3;
  return clamp(target.model.topY * 0.16, 2.5, 7);
}

/**
 * Fire-control solution of mount `m` against `target`. Lead is computed with the velocity of the
 * target relative to the firing ship (shells inherit the ship's own velocity).
 */
export function mountSolution(ship, m, target, out) {
  ship.toWorld(m.rec.x, m.rec.y + 1.2, m.rec.z, _p);
  const px = _p[0], py = _p[1], pz = _p[2];
  const rvx = target.vx - ship.vx, rvz = target.vz - ship.vz;
  const b = ball(m);
  const ay = aimHeight(target);
  let tof = 0, ax = target.x, az = target.z, sol = null;
  for (let i = 0; i < 4; i++) {
    ax = target.x + rvx * tof - 0 + 0; az = target.z + rvz * tof;
    const range = Math.hypot(ax - px, az - pz);
    sol = solve(b, range, ay - py, _sol);
    if (!sol) return null;
    tof = sol.tof;
  }
  out.bearing = Math.atan2(ax - px, -(az - pz));
  out.elev = sol.elev;
  out.range = Math.hypot(ax - px, az - pz);
  out.tof = sol.tof;
  out.px = px; out.py = py; out.pz = pz;
  return out;
}

const sol = {};

/** Slew one mount towards a bearing/elevation; returns true when aligned. */
function slew(m, bearingWorld, elev, heading, dt) {
  const rec = m.rec;
  // bearing relative to the arc centre, clamped to the arc
  const rel = inArcRel(rec, wrapPi(bearingWorld - heading - rec.arcC));
  const inArc = rel >= rec.arcMin && rel <= rec.arcMax;
  const want = clamp(rel, rec.arcMin, rec.arcMax);
  const rate = m.gun.trainRate * D2R * dt;
  m.trainRel = approach(m.trainRel, want, rate);
  // while it swings round the barrel rises over what stands in the way (a tower low on the horizon), then comes back to the elevation of the shot
  const swing = Math.abs(m.trainRel - want) > 1.5 * D2R ? Math.min(pathClear(rec, m.trainRel, want) + 0.03, 0.7) : 0;
  const er = approach(m.elev, clamp(Math.max(elev, swing), -DEPRESS, Math.min(m.gun.maxElevDeg, 50) * D2R), m.gun.trainRate * D2R * 1.4 * dt);
  m.elev = er;
  const trainErr = Math.abs(m.trainRel - rel);
  return inArc && trainErr < 1.0 * D2R && Math.abs(m.elev - Math.max(elev, -DEPRESS)) < 0.8 * D2R;
}

function neutral(m, dt) {
  const rate = m.gun.trainRate * D2R * dt;
  m.trainRel = approach(m.trainRel, 0, rate);
  m.elev = approach(m.elev, Math.abs(m.trainRel) > 1.5 * D2R ? Math.min(pathClear(m.rec, m.trainRel, 0) + 0.03, 0.7) : 0, rate);
}

const TYPE_VALUE = { DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3, BASE: 1.4 };

/** Can mount `m` engage `target` now: a firing solution, the range, the sight and, above all, a bearing inside the mount's arc? Fills `out`. */
function feasible(ship, m, target, out) {
  if (!target || !target.alive) return false;
  if (!mountSolution(ship, m, target, out)) return false;
  if (out.range > m.gun.maxRange * 0.97 || out.range > ship.stats.visualRange) return false;
  const rel = inArcRel(m.rec, wrapPi(out.bearing - ship.heading - m.rec.arcC));
  if (m.rec.noArc || rel < m.rec.arcMin - 2 * D2R || rel > m.rec.arcMax + 2 * D2R) return false;
  // the barrel must clear the towers and the other mounts at the elevation the shot needs
  const phi = m.rec.arcC + clamp(rel, m.rec.arcMin, m.rec.arcMax);
  const lo = clearElev(m.rec, phi);
  if (!(out.elev >= (lo > 0.001 ? lo - 0.01 : -1) && out.elev <= clearMax(m.rec, phi) + 0.01)) return false;
  // an island between the guns and the target: the shell would burst on its slope
  const T = ship.world && ship.world.terrain;
  if (T && T.arcBlocked(out.px, out.py, out.pz, out.px + Math.sin(out.bearing) * out.range, out.pz - Math.cos(out.bearing) * out.range, Math.max(out.elev, 0), m.gun.v0)) return false;
  return true;
}

const _alt = {};
/** The best enemy that mount `m` can engage on its own: in its arc and range, valued by class, state and distance. */
function pickAlt(world, ship, m) {
  let best = null, bs = 0;
  for (const e of world.enemiesOf(ship).concat(world.baseTargetsOf(ship))) {
    if (!feasible(ship, m, e, _alt)) continue;
    const s = TYPE_VALUE[e.stats.type] * (1 + (e.isBase ? 0 : (1 - e.hpFrac) * 0.9)) / (0.35 + _alt.range / (m.gun.maxRange * 0.93));
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

export function updateGunnery(ship, world, dt) {
  const cmd = ship.cmd;
  let anyMainTarget = false;
  for (const m of ship.mounts) {
    m.fireT = (m.fireT ?? 99) + dt;
    m.recoil = recoilCurve(m.fireT);
    m.flash = Math.max(0, m.flash - dt * 5);
    if (m.jam > 0) m.jam = Math.max(0, m.jam - dt);
    if (!m.alive || !ship.alive) continue;
    // dual-purpose guns firing at aircraft are handled by the anti-aircraft step
    if (m.busyAir) { m.busyAir = false; continue; }
    if (m.noAmmo || m.jam > 0) { neutral(m, dt); m.aimOk = false; continue; }
    m.reload = Math.max(0, m.reload - dt);
    const grp = m.group === 'main' ? cmd.main : cmd.sec;
    let target = grp.target;
    // manual control: aim at a ground point when no ship is locked
    if (!target && grp.aim) target = pseudoTarget(grp.aim);
    // the battery's target when this mount can bear on it; otherwise (behind the superstructure, out of its arc, out of range, or the battery
    // has none) the mount picks an enemy of its own: the sectors of a ship fighting on both sides are never idle
    let ok = !!(target && target.alive && grp.fire) && feasible(ship, m, target, sol);
    if (!ok && grp.fire && !(grp.aim && !grp.target)) {
      m.altT = (m.altT || 0) - dt;
      if (m.altT <= 0 || !m.alt || !m.alt.alive) { m.altT = 1.0 + world.rng() * 0.7; m.alt = pickAlt(world, ship, m); }
      if (m.alt && feasible(ship, m, m.alt, sol)) { target = m.alt; ok = true; }
    } else if (ok) m.alt = null;
    if (!ok) { neutral(m, dt); m.aimOk = false; continue; }
    const aligned = slew(m, sol.bearing, sol.elev, ship.heading, dt);
    m.aimOk = aligned;
    m.target = target;
    if (m.group === 'main') anyMainTarget = true;
    if (aligned && m.reload <= 0) fireMount(world, ship, m, target, sol);
  }
  // fire-control accuracy improves while the same target is engaged (ranging in), decays when idle
  const t = cmd.main.target;
  if (t && t.id !== ship.accTarget) { ship.accTarget = t.id; ship.gunAcc = Math.max(ship.gunAcc, 2.4); }
}

const _pseudo = { id: -1, alive: true, x: 0, z: 0, vx: 0, vz: 0, model: { topY: 0 }, stats: { type: 'DD' } };
function pseudoTarget(aim) { _pseudo.x = aim.x; _pseudo.z = aim.z; return _pseudo; }

function randn(world) { return world.rng.normal(); }

function fireMount(world, ship, m, target, s) {
  const gun = m.gun;
  const b = ball(m);
  const yaw = ship.heading + m.rec.arcC + m.trainRel;
  const acc = ship.gunAcc * ship.fcMult;
  const maneuver = 1 + Math.abs(ship.yawRate) * 12 + (ship.stats.type === 'DD' ? 0.35 : 0);
  const sigR = 0.0085 * s.range * acc * maneuver * (gun.cal < 150 ? 1.25 : 1);
  const sigA = 0.0030 * acc * maneuver;
  // the shell: the better of AP and HE for this target at this range and aspect, from what is left in the magazine; changing the type means
  // unloading the breech (a long delay), so a mount keeps the shell it has loaded unless the other one is clearly better
  if (m.ammo.AP + m.ammo.HE <= 0) { m.noAmmo = true; return; }
  const ch = shellChoice(ship, m, target, s);
  let type = ch.type;
  if (m.loaded && m.loaded !== type && m.ammo[m.loaded] > 0 && ch.values[m.loaded] >= ch.values[type] * 0.7) type = m.loaded;
  if (m.loaded && m.loaded !== type) { m.loaded = type; m.reload = gun.reload * 1.25; return; }
  m.loaded = type;
  // the barrels that still have a round; a mount out of both kinds is dead weight
  const left = m.ammo[type];
  const nFire = Math.min(m.n, left);
  if (nFire <= 0) { m.noAmmo = true; return; }
  m.ammo[type] -= nFire;
  if (m.ammo.AP + m.ammo.HE <= 0) m.noAmmo = true;
  // barrel muzzles: the trunnion sits on the gun house, each tube runs from there along the elevation; spacing as drawn
  const dm = dimsOf(m.rec);
  const spacing = m.n >= 2 ? dm.spacing : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ce = Math.cos(m.elev), se = Math.sin(m.elev);
  const fwdx = sy * ce, fwdy = se, fwdz = -cy * ce;
  const rightx = cy, rightz = sy;
  const reach = dm.trunnion[0] + dm.muzzle * ce;
  const mx0 = s.px + sy * reach, my0 = s.py + dm.trunnion[1] + dm.muzzle * se, mz0 = s.pz - cy * reach;
  const barrels = [];
  for (let i = 0; i < m.n; i++) {
    const off = (i - (m.n - 1) / 2) * spacing;
    if (i >= nFire) { barrels.push(mx0 + rightx * off, my0, mz0 + rightz * off); continue; }
    const bx = mx0 + rightx * off, by = my0, bz = mz0 + rightz * off;
    barrels.push(bx, by, bz);
    // dispersion: perturb the range solution and the bearing
    const r2 = clamp(s.range + randn(world) * sigR, 300, b.maxRange * 0.995);
    const so = solve(b, r2, 0), nominal = solve(b, s.range, 0);
    const e = m.elev + (so && nominal ? so.elev - nominal.elev : 0);
    const hy = yaw + randn(world) * sigA;
    const ce2 = Math.cos(e), se2 = Math.sin(e);
    const v0 = gun.v0 * (1 + randn(world) * 0.002);
    world.spawnShell({
      owner: ship, gun, type, c: b.c,
      x: bx, y: by, z: bz,
      vx: Math.sin(hy) * ce2 * v0 + ship.vx, vy: se2 * v0, vz: -Math.cos(hy) * ce2 * v0 + ship.vz,
      target, aimX: target.x, aimZ: target.z, group: m.group,
    });
  }
  ship.shotsFired += nFire;
  m.reload = gun.reload * (0.92 + world.rng() * 0.16) * (1 + (1 - m.hp / m.maxHp) * 0.7);
  m.recoil = 0; m.fireT = 0; m.flash = 1;
  // the recoil of the salvo heels the ship away from the side it fires to (a few tenths of a degree for destroyers, about a degree for a full battleship broadside)
  if (ship.sr) {
    const lateral = fwdx * Math.cos(ship.heading) + fwdz * Math.sin(ship.heading);      // > 0: firing to starboard
    const disp = ship.spec.displacementFull || 30000;
    ship.sr.v -= lateral * m.n * 0.0007 * (gun.shellKg * gun.v0) / (1225 * 762) * (58000 / disp);
  }
  world.events.push({ type: 'muzzle', ship, mount: m, x: mx0, y: my0, z: mz0, dx: fwdx, dy: fwdy, dz: fwdz, cal: gun.cal, n: m.n, group: m.group, barrels });
}

/**
 * Which shell to fire: the expected damage per round of armour-piercing and of high-explosive, against where this target will probably be hit
 * (the belt, the deck, the unarmoured upperworks), at the range's impact speed and the angle the shell will arrive at. Returns { type, values: { AP, HE } }.
 * AP wins where it gets through the plate and bursts inside; it loses on a thin plate (it goes through without arming), on a thick one
 * (it bounces), at a grazing angle (it glances off) and against a target with little to wreck; HE wins against destroyers, cruisers' upperworks
 * and heavy plate it cannot hurt anyway. The state of the magazine decides when one kind is gone.
 */
export function shellChoice(ship, m, target, solu) {
  const g = m.gun, ts = target.stats;
  const hasAP = g.ap && m.ammo.AP > 0, hasHE = m.ammo.HE > 0;
  if (!g.ap || !ts || !ts.armor) return { type: m.ammo.HE > 0 || !hasAP ? 'HE' : 'AP', values: { AP: 0, HE: 1 } };
  const b = ball(m), lk = b.lookup(solu.range) || { vImpact: g.v0 * 0.7, fall: 0.15 };
  const kg = g.shellKg, cal = g.cal;
  const penAP = g.pen0 * Math.pow(lk.vImpact / g.v0, V_EXP);
  // the aspect: how square the target's side is to the line of fire
  const dx = target.x - ship.x, dz = target.z - ship.z, dl = Math.hypot(dx, dz) || 1;
  const along = Math.abs((dx * Math.sin(target.heading) - dz * Math.cos(target.heading)) / dl);
  const beam = Math.sqrt(Math.max(0, 1 - along * along));
  const ar = ts.armor, incl = (ar.incl || 0) * D2R;
  // an inclined belt faces a falling shell more squarely; a deck is struck at the angle of fall
  const cosBelt = clamp(beam * Math.cos(lk.fall) * Math.cos(incl) + Math.sin(lk.fall) * Math.sin(incl), 0.17, 1), cosDeck = Math.max(Math.sin(lk.fall), 0.17);
  const ang = (c) => Math.acos(Math.min(1, c)) * 57.3;
  const effBelt = effectiveThickness(Math.max(ar.belt, ar.skin), ang(cosBelt));
  const effDeck = spacedPlates([ar.weather, ar.deck].filter((x) => x > 0).map((x) => effectiveThickness(x, ang(cosDeck))));
  const sg = (x) => 1 / (1 + Math.exp(-x));
  const soft = ts.softness ?? 1;
  const deg = ang;
  // a plate: [expected damage of AP, of HE] per kg of shell
  const plate = (armor, eff, cosA, zone) => {
    const thin = armor < fuzeThickness(cal, deg(cosA));
    const glance = armor > cal * 0.08 ? clamp((deg(cosA) - 68) / 14, 0, 1) : 0;
    const pPen = sg((penAP - eff) / Math.max(0.12 * eff, 8));
    const ap = glance * 0.035 + (1 - glance) * (thin ? 0.06 * soft : pPen * 0.95 * zone + (1 - pPen) * 0.035);
    const he = 0.2 * soft * (eff > cal * 0.5 ? 0.1 : 0.55);
    return [ap, he];
  };
  const belt = plate(ar.belt, effBelt, cosBelt, 0.8), deck = plate(Math.max(ar.deck, ar.weather), effDeck, cosDeck, 0.7);
  // the upperworks: little armour, AP often goes through without bursting, HE bursts on them
  const superAP = ar.sup < fuzeThickness(cal, 45) ? 0.06 * soft : 0.95 * 0.25, superHE = 0.2 * soft;
  // where the hits will go: the belt in proportion to the beam aspect, the deck at long range (steep fall), the rest on the upperworks
  const wBelt = 0.4 * beam, wDeck = 0.1 + 0.4 * clamp((lk.fall - 0.12) / 0.4, 0, 1), wSup = Math.max(0.15, 1 - wBelt - wDeck);
  const wt = wBelt + wDeck + wSup;
  // doctrine: armour-piercing shells go through a destroyer's thin skin without arming, which the plate model above only half sees
  const AP = kg * (wBelt * belt[0] + wDeck * deck[0] + wSup * superAP) / wt * (ts.type === 'DD' ? 0.55 : 1);
  const HE = kg * (wBelt * belt[1] + wDeck * deck[1] + wSup * superHE) / wt;
  const type = !hasAP ? 'HE' : !hasHE ? 'AP' : AP > HE ? 'AP' : 'HE';
  return { type, values: { AP, HE } };
}

// ---- torpedoes ------------------------------------------------------------------------------------
/**
 * Intercept time of a straight-running torpedo of speed `vt` launched from (px,pz) against a target moving with (tvx,tvz).
 * Returns t > 0 or -1.
 */
export function interceptTime(px, pz, tx, tz, tvx, tvz, vt) {
  const dx = tx - px, dz = tz - pz;
  const a = tvx * tvx + tvz * tvz - vt * vt;
  const b = 2 * (dx * tvx + dz * tvz);
  const c = dx * dx + dz * dz;
  if (Math.abs(a) < 1e-6) return b !== 0 ? -c / b : -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return isFinite(t) ? t : -1;
}

export function updateTorpedoes(ship, world, dt) {
  const tp = ship.stats.torpedo;
  if (!tp || !ship.alive) return;
  if (ship.torpLeft <= 0 && ship.torpReload > 0) {
    ship.torpReload -= dt;
    if (ship.torpReload <= 0) { ship.torpLeft = Math.ceil(tp.tubes / 2); }
  }
  const cmd = ship.cmd.torpedo;
  if (!cmd.fire || !cmd.target || !cmd.target.alive || ship.torpLeft <= 0) return;
  const t = cmd.target;
  // tubes train to either beam: acceptable when the intercept bearing is within +-65 deg of a beam
  const tt = interceptTime(ship.x, ship.z, t.x, t.z, t.vx, t.vz, tp.speed);
  if (tt < 0 || tt * tp.speed > tp.range * 0.95) return;
  const ix = t.x + t.vx * tt, iz = t.z + t.vz * tt;
  const bearing = Math.atan2(ix - ship.x, -(iz - ship.z));
  const rel = wrapPi(bearing - ship.heading);
  const offBeam = Math.min(Math.abs(wrapPi(rel - Math.PI / 2)), Math.abs(wrapPi(rel + Math.PI / 2)));
  if (offBeam > 70 * D2R) return;
  // salvo: spread of torpedoes around the solution
  const n = Math.min(ship.torpLeft, Math.max(2, Math.min(5, Math.round(tp.tubes / 2))));
  const startTube = ship.tubes.length ? ship.tubes[Math.floor(world.rng() * ship.tubes.length)] : { x: 0, y: 2, z: 0 };
  ship.toWorld(startTube.x, 0, startTube.z, _q);
  const spread = clamp(t.stats.L / Math.max(tt * tp.speed, 500) * 1.3, 0.012, 0.06);
  for (let i = 0; i < n; i++) {
    const a = bearing + (i - (n - 1) / 2) * spread + (world.rng() - 0.5) * 0.004;
    world.spawnTorpedo({
      owner: ship, x: _q[0] + Math.sin(a) * 6, z: _q[2] - Math.cos(a) * 6, vx: Math.sin(a) * tp.speed, vz: -Math.cos(a) * tp.speed,
      speed: tp.speed, range: tp.range, warhead: tp.warhead, team: ship.team,
    });
  }
  ship.torpLeft -= n;
  ship.shotsFired += n; ship.torpFired = (ship.torpFired || 0) + n;
  if (ship.torpLeft <= 0) ship.torpReload = 300;
  world.events.push({ type: 'torpedoLaunch', ship, x: _q[0], z: _q[2], bearing });
  cmd.fire = false;
}
