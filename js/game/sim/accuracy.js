// Accuracy of naval gunfire: where each shell of a salvo goes. Three kinds of error, as in the gunnery literature: what every shell of a salvo shares (the fire-control solution:
// a ranging that is off, the ballistic corrections, the lag of the computer behind a target that turns), what the shells of one mount share (laying), and what each shell has of its
// own (the gun, the powder, the shell: data/gunnery.js). The first is a bias that the ship corrects by watching her own splashes (`observeSplash`: ranging in, bracketing), so a
// first salvo is far off and a ship that holds her target for a few minutes shoots tightly. The dispersion of the guns and the fire-control systems of each ship are in
// data/gunnery.js; sim/sensors.js says what can be ranged at all.
import { gunProfile, SYSTEMS, RADARS, fitOf } from '../data/gunnery.js';
import { visualReach, radarOn } from './sensors.js';

/** Range error of a shell for a muzzle velocity error, as a ratio (dR/R per dv/v): a shell flies about the square of its velocity far. */
const KV = 2.1;
/** The share of the variance of a shell's own error that the guns of one mount have in common (same training, same elevation, same moment). */
const MOUNT_SHARE = 0.35;
/** The error of the range readings that changes salvo after salvo (seconds to forget it) and its size next to the ranging error. */
const FAST_TAU = 20, FAST_SHARE = 0.5;
/** What stays of the salvo-to-salvo scatter of the mean point of impact when the ship has ranged in (the splashes read late and roughly, powder lots, wind, own speed): a multiple of the gun's own dispersion. */
const FAST_GUN = 1.0;
/** Error (mrad, 1 sigma) of laying the guns of a battery, common to the whole salvo: the director holds the line of sight and the elevation at the instant of firing; a gyro-stabilised one holds it better. */
const layMrad = (sys) => 1.0 + 3.0 * (1 - sys.stab);
/** Error of ranging by reckoning only (no rangefinder or radar reaches), as a share of the range. */
const BLIND = 0.04;
/** Acuity of a rangefinder reading (radians): the range error is range^2 x acuity / base. */
const ACUITY = { stereo: 5e-6, coinc: 9e-6 };
const UPDATE = 0.25;

let nextId = 1;
const ids = new WeakMap();
const idOf = (t) => (t.id !== undefined && !t.isBase ? t.id : ids.get(t) || (ids.set(t, 1e6 + nextId++), ids.get(t)));

/** The fire-control system of a battery ('main' or 'sec') of the ship. */
export function systemOf(ship, group) {
  const c = ship._fcsys || (ship._fcsys = {});
  if (c[group]) return c[group];
  const fit = fitOf(ship.spec);
  return (c[group] = SYSTEMS[group === 'main' ? fit.main : fit.sec] || SYSTEMS.generic);
}

/** The dispersion entry of a gun of the ship. */
export function profileOf(ship, gun) {
  return gun._prof || (gun._prof = gunProfile(ship.stats.nation, gun.cal, [ship.spec.id, ship.spec.baseId]));
}

/** Standard deviation (m) of the range reading of the fire control on a target at `R`: the rangefinder (if the eye reaches), the best radar (if it reaches), combined; else dead reckoning. */
export function rangingSigma(ship, sys, target, R, world) {
  let inv = 0;
  if (sys.rf && R <= visualReach(world, ship, target)) { const so = R * R * ACUITY[sys.rf[1]] / sys.rf[0]; inv += 1 / (so * so); }
  const r = radarOn(ship, target, R, world);
  if (r) inv += 1 / (r.def.err * r.def.err);
  return inv > 0 ? Math.max(4, 1 / Math.sqrt(inv)) : BLIND * R;
}

/** Can the splashes of this battery be seen at this range: with the eye, or with the radar that ranges for it (the sets that cannot see splashes: 0)? Returns the gain of the ranging in. */
function spotGain(ship, sys, target, R, world) {
  if (R <= visualReach(world, ship, target)) return sys.gain;
  const r = sys.radar && RADARS[sys.radar];
  const up = r && radarOn(ship, target, R, world);
  return up && r.splash >= R ? sys.gain * 0.85 : 0;
}

const gauss = (world) => world.rng.normal();

function newTrack(world, ship, group, target, R, sys) {
  const sg = rangingSigma(ship, sys, target, R, world);
  const persist = Math.hypot(sg * (1 - FAST_SHARE * 0.5), (sys.bal / 100) * R) / R;       // a ranging that is off, ballistic corrections wrong: stays until the splashes are watched
  const sdef = Math.hypot(0.001, (sys.bal / 100) * 0.5);
  const e = sys.rate * ship.fcMult;
  return {
    id: idOf(target), group, t0: world.time, t: world.time, seen: world.time, target, sys,
    gsr: profileOf(ship, group === 'main' ? ship.stats.main : ship.stats.secs[0] || ship.stats.main).sr,
    lock: target.pseudo ? 0 : sys.lock * Math.min(1, Math.max(0.35, R / 12000)),
    brR: gauss(world) * persist, brD: gauss(world) * sdef, fR: 0, fD: 0,
    ex: gauss(world) * e, ez: gauss(world) * e, pvx: target.vx, pvz: target.vz, nObs: 0,
  };
}

/**
 * The firing state of a battery of the ship against a target (made at the first sight of it, kept while it is engaged, forgotten after 45 s): the bias of the fire-control solution, the
 * lag of the computer's estimate of the target's velocity, the salvo-to-salvo noise, and the time the system needs to lay the guns. Advanced here to the present.
 */
export function trackFor(world, ship, group, target, R) {
  const map = ship.fcTracks || (ship.fcTracks = new Map());
  const key = group + ':' + idOf(target);
  let tr = map.get(key);
  const now = world.time;
  if (tr && now - tr.seen > 45) tr = null;                  // lost sight of it long ago: the solution starts again
  if (!tr) {
    if (map.size > 6) for (const [k, q] of map) if (now - q.seen > 45) map.delete(k);
    tr = newTrack(world, ship, group, target, R, systemOf(ship, group));
    map.set(key, tr);
    return tr;
  }
  tr.seen = now;
  const dt = now - tr.t;
  if (dt < UPDATE) return tr;
  tr.t = now;
  // the computer holds the course and speed it has worked out: when the target changes them, its estimate is off by the change, which it then forgets in `tau` seconds
  const k = Math.exp(-dt / tr.sys.tau);
  tr.ex = (tr.ex - (target.vx - tr.pvx)) * k; tr.ez = (tr.ez - (target.vz - tr.pvz)) * k;
  tr.pvx = target.vx; tr.pvz = target.vz;
  // the readings of each salvo do not repeat the last one's error for ever
  const a = Math.exp(-dt / FAST_TAU), sg = rangingSigma(ship, tr.sys, target, R, world) * FAST_SHARE;
  tr.fR = tr.fR * a + Math.sqrt(1 - a * a) * gauss(world) * Math.hypot(sg, FAST_GUN * tr.gsr / 100 * R) / R;
  tr.fD = tr.fD * a + Math.sqrt(1 - a * a) * gauss(world) * 0.0008;
  return tr;
}

/** Has the system found the range and the rate of the target and may the guns open fire? */
export const ready = (world, tr) => world.time - tr.t0 >= tr.lock;

/**
 * The errors of one firing of a mount at a range R (m): { cr, cd } what all its shells share, in metres along and across the line of fire (positive: over, to the right),
 * { ir, id } the sigma of each shell on its own, `sv` the muzzle velocity scatter, `split` the deliberate spread between the halves of the mount.
 * `tof` is the shell's flight time (the lag of the estimated velocity acts over it), `fall` its angle of fall, `ux, uz` the unit vector from the ship to the target.
 */
export function firingError(world, ship, m, tr, R, tof, fall, ux, uz, out) {
  const prof = profileOf(ship, m.gun), sys = tr.sys;
  // a turning ship holds the line of sight worse unless the director is stabilised
  const own = 1 + Math.abs(ship.yawRate) * 15 * (1 - 0.7 * sys.stab);
  const k = ship.fcMult * own;
  const srTot = Math.max(6, prof.sr / 100 * R), sdTot = Math.max(3, prof.sd / 100 * R);
  const vpart = KV * prof.sv / 100 * R;
  const other = Math.sqrt(Math.max(0, srTot * srTot - vpart * vpart));
  const mr = other * Math.sqrt(MOUNT_SHARE) * own, md = sdTot * Math.sqrt(MOUNT_SHARE) * own;
  // a shell lands where the computer aimed: at the target's position by its estimate, so off by the error of that estimate over the flight
  const lr = (tr.ex * ux + tr.ez * uz) * tof, ld = (tr.ex * -uz + tr.ez * ux) * tof;
  // the laying of the whole salvo: an error of elevation is worth R / tan(angle of fall) in range (a shell that comes down flat is far more sensitive)
  const lay = layMrad(sys) * 1e-3 * own;
  out.cr = R * (tr.brR + tr.fR) * k + lr * ship.fcMult + gauss(world) * mr + gauss(world) * lay * R / Math.tan(Math.max(fall, 0.06));
  out.cd = R * (tr.brD + tr.fD) * k + ld * ship.fcMult + gauss(world) * md + gauss(world) * lay * R * 0.7;
  out.ir = other * Math.sqrt(1 - MOUNT_SHARE); out.id = sdTot * Math.sqrt(1 - MOUNT_SHARE);
  out.sv = prof.sv / 100; out.split = (prof.split || 0) / 100 * R;
  return out;
}

/**
 * A shell of `owner` has fallen in the water at (x, z): the ship sees where it fell about the target and corrects the bias of that battery by a share of it (a salvo is
 * watched as a whole, so each shell counts for one over the number of barrels). Splashes that cannot be seen (too far for the eye and out of the radar's sight) teach nothing.
 */
export function observeSplash(owner, shell, x, z) {
  if (!owner.stats) return;
  const map = owner.fcTracks;
  const tg = shell.target;
  if (!map || !tg) return;
  const tr = map.get(shell.group + ':' + idOf(tg));
  if (!tr) return;
  const dx = tg.x - owner.x, dz = tg.z - owner.z, R = Math.hypot(dx, dz);
  if (R < 500) return;
  const ux = dx / R, uz = dz / R;
  const ox = x - tg.x, oz = z - tg.z;
  const or = ox * ux + oz * uz, od = -ox * uz + oz * ux;
  if (Math.abs(or) > 0.06 * R + 300 || Math.abs(od) > 0.04 * R + 200) return;      // a wild shell is no use for the correction
  const g = spotGain(owner, tr.sys, tg, R, owner.world);
  if (g <= 0) return;
  const n = salvoSize(owner, shell.group);
  const noise = Math.max(8, 0.0008 * R);
  tr.brR -= g / n * (or + owner.world.rng.normal() * noise) / R;
  tr.brD -= g / n * (od + owner.world.rng.normal() * noise) / R;
  tr.nObs++;
}

/** Barrels of a battery (the shells of a salvo whose splashes are watched together). */
function salvoSize(ship, group) {
  const c = ship._salvo || (ship._salvo = {});
  if (c[group] === undefined) { let n = 0; for (const m of ship.mounts) if (m.group === group) n += m.n; c[group] = Math.max(3, n); }
  return c[group];
}
