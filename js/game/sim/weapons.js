// Gunnery (fire control, turret slewing, salvos) and torpedo launching.
import { clamp, wrapPi, approach, D2R, KN } from '../math.js';
import { gunBallistics, solve } from './ballistics.js';

const _p = [0, 0, 0];
const _q = [0, 0, 0];

function ball(m) {
  if (!m.ball) m.ball = gunBallistics({ cal: m.gun.cal, v0: m.gun.v0, shellKg: m.gun.shellKg, maxRange: m.gun.maxRange, maxElevDeg: Math.min(m.gun.maxElevDeg, 50) });
  return m.ball;
}

/** Aim height on a target (m above the waterline): belt for armoured ships, upperworks otherwise. */
function aimHeight(target) {
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
    sol = solve(b, range, ay - py);
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
  const rel = wrapPi(bearingWorld - heading - rec.arcC);
  const inArc = Math.abs(rel) <= rec.arcH;
  const want = clamp(rel, -rec.arcH, rec.arcH);
  const rate = m.gun.trainRate * D2R * dt;
  m.trainRel = approach(m.trainRel, want, rate);
  const er = approach(m.elev, clamp(elev, 0, Math.min(m.gun.maxElevDeg, 50) * D2R), m.gun.trainRate * D2R * 1.4 * dt);
  m.elev = er;
  const trainErr = Math.abs(m.trainRel - rel);
  return inArc && trainErr < 1.0 * D2R && Math.abs(m.elev - elev) < 0.8 * D2R;
}

function neutral(m, dt) {
  const rate = m.gun.trainRate * D2R * dt;
  m.trainRel = approach(m.trainRel, 0, rate);
  m.elev = approach(m.elev, 0, rate);
}

export function updateGunnery(ship, world, dt) {
  const cmd = ship.cmd;
  let anyMainTarget = false;
  for (const m of ship.mounts) {
    m.recoil = Math.max(0, m.recoil - dt * 1.6);
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
    if (m.group === 'sec' || (target && !target.alive)) {
      // secondary mounts choose their own target (nearest in range and arc); main falls back to idle
      m.retarget = (m.retarget || 0) - dt;
      if (m.group === 'sec' && (m.retarget <= 0 || !m.target || !m.target.alive)) {
        m.retarget = 1.2 + world.rng() * 0.8;
        m.target = grp.target && grp.target.alive ? grp.target : world.nearestEnemy(ship, m.gun.maxRange * 0.9);
      }
      if (m.group === 'sec') target = m.target;
    }
    if (!target || !target.alive || !grp.fire) { neutral(m, dt); m.aimOk = false; continue; }
    if (!mountSolution(ship, m, target, sol)) { neutral(m, dt); m.aimOk = false; continue; }
    if (sol.range > m.gun.maxRange * 0.97 || sol.range > ship.stats.visualRange) { neutral(m, dt); m.aimOk = false; continue; }
    const ok = slew(m, sol.bearing, sol.elev, ship.heading, dt);
    m.aimOk = ok;
    m.target = target;
    if (m.group === 'main') anyMainTarget = true;
    if (ok && m.reload <= 0) fireMount(world, ship, m, target, sol);
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
  const type = chooseShell(ship, target, gun);
  // barrel offsets across the mount (lateral spacing)
  const spacing = m.n >= 2 ? Math.max(0.5, m.rec.cal / 1000 * (m.n >= 3 ? 6.6 : 5.6)) : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ce = Math.cos(m.elev), se = Math.sin(m.elev);
  const fwdx = sy * ce, fwdy = se, fwdz = -cy * ce;
  const rightx = cy, rightz = sy;
  for (let i = 0; i < m.n; i++) {
    const off = (i - (m.n - 1) / 2) * spacing;
    const bx = s.px + fwdx * (gun.bore * gun.cal / 1000 * 0.75) + rightx * off;
    const by = s.py + fwdy * (gun.bore * gun.cal / 1000 * 0.75);
    const bz = s.pz + fwdz * (gun.bore * gun.cal / 1000 * 0.75) + rightz * off;
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
  ship.shotsFired += m.n;
  m.reload = gun.reload * (0.92 + world.rng() * 0.16) * (1 + (1 - m.hp / m.maxHp) * 0.7);
  m.recoil = 1; m.flash = 1;
  world.events.push({ type: 'muzzle', ship, mount: m, x: s.px + fwdx * 4, y: s.py + fwdy * 4, z: s.pz + fwdz * 4, dx: fwdx, dy: fwdy, dz: fwdz, cal: gun.cal, n: m.n, group: m.group });
}

function chooseShell(ship, target, gun) {
  if (!gun.ap) return 'HE';
  const t = target.stats ? target.stats.type : 'DD';
  if (t === 'BB' || t === 'CA' || t === 'CV') return 'AP';
  if (t === 'CL') return ship.world.rng() < 0.5 ? 'AP' : 'HE';
  return 'HE';
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
  ship.shotsFired += n;
  if (ship.torpLeft <= 0) ship.torpReload = 300;
  world.events.push({ type: 'torpedoLaunch', ship, x: _q[0], z: _q[2], bearing });
  cmd.fire = false;
}
