// Exterior ballistics: point-mass shells with altitude-dependent air drag.
// The drag coefficient of each gun is calibrated so that the range at maximum elevation matches
// the real maximum range from the spec sheet, then a firing table (range -> elevation, time of
// flight, impact speed) is built by simulation and inverted by interpolation.
import { G, D2R } from '../math.js';

const guns = new Map();
const H_SCALE = 8500;           // air density scale height (m)
const STEP = 0.1;               // table integration step (s)

/** Integrate a shot from the muzzle (y = 0) to sea level; returns { range, time, vImpact, fall }. */
function simulate(v0, elev, c, step = STEP) {
  let x = 0, y = 0, vx = v0 * Math.cos(elev), vy = v0 * Math.sin(elev), t = 0;
  for (let i = 0; i < 4000; i++) {
    const sp = Math.hypot(vx, vy);
    const rho = Math.exp(-Math.max(y, 0) / H_SCALE);
    const ax = -c * rho * sp * vx, ay = -G - c * rho * sp * vy;
    const nvx = vx + ax * step, nvy = vy + ay * step;
    const nx = x + (vx + nvx) * 0.5 * step, ny = y + (vy + nvy) * 0.5 * step;
    if (ny < 0 && i > 0) {
      const f = y / (y - ny);
      const tt = t + step * f;
      return { range: x + (nx - x) * f, time: tt, vImpact: Math.hypot(nvx, nvy), fall: Math.atan2(-nvy, nvx) };
    }
    x = nx; y = ny; vx = nvx; vy = nvy; t += step;
  }
  return { range: x, time: t, vImpact: Math.hypot(vx, vy), fall: 0 };
}

/** Drag coefficient c such that simulate(v0, maxElev).range == maxRange. */
function calibrate(v0, maxElev, maxRange) {
  const vacuum = simulate(v0, maxElev, 0).range;
  if (maxRange >= vacuum * 0.995) return 1e-8;
  let lo = 1e-8, hi = 3e-3;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (simulate(v0, maxElev, mid).range > maxRange) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * Ballistics for a gun. g: { cal (mm), v0 (m/s), shellKg, maxRange (m), maxElevDeg }
 * Returns a cached object with .c, .table and .solve(range, dh).
 */
export function gunBallistics(g) {
  const key = [g.cal, g.v0, g.maxRange, g.maxElevDeg].join('|');
  let b = guns.get(key);
  if (b) return b;
  const maxElev = Math.min(g.maxElevDeg || 45, 50) * D2R;
  const c = calibrate(g.v0, maxElev, g.maxRange);
  const N = Math.round(maxElev / (0.25 * D2R));
  const ranges = [0], elevs = [0], tofs = [0], vi = [g.v0], falls = [0];
  let lastR = 0;
  for (let i = 1; i <= N; i++) {
    const e = i * 0.25 * D2R;
    const r = simulate(g.v0, e, c);
    if (r.range <= lastR) break;      // past the peak range: keep the low-angle branch only
    ranges.push(r.range); elevs.push(e); tofs.push(r.time); vi.push(r.vImpact); falls.push(r.fall);
    lastR = r.range;
  }
  b = { c, v0: g.v0, maxRange: ranges[ranges.length - 1], maxElev, ranges, elevs, tofs, vi, falls, cal: g.cal, shellKg: g.shellKg };
  b.lookup = (range) => lookup(b, range);
  guns.set(key, b);
  return b;
}

/** Interpolate the firing table at `range`. Returns { elev, tof, vImpact, fall } or null when out of range. */
function lookup(b, range) {
  const R = b.ranges;
  if (range <= 0 || range > R[R.length - 1]) return null;
  let lo = 0, hi = R.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m] <= range) lo = m; else hi = m; }
  const f = (range - R[lo]) / (R[hi] - R[lo] || 1);
  const l = (a) => a[lo] + (a[hi] - a[lo]) * f;
  return { elev: l(b.elevs), tof: l(b.tofs), vImpact: l(b.vi), fall: l(b.falls) };
}

/**
 * Fire-control solution against a target at horizontal range `range` and height difference dh
 * (target - muzzle). Small correction on the elevation for the height difference.
 */
export function solve(b, range, dh = 0) {
  const s = lookup(b, range);
  if (!s) return null;
  s.elev += dh / Math.max(range, 200) * 0.9;
  return s;
}

/** Advance a shell state in place by dt (sub-stepped). Shell: { x, y, z, vx, vy, vz }. */
export function stepShell(s, c, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.05));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    const rho = Math.exp(-Math.max(s.y, 0) / H_SCALE);
    const k = c * rho * sp;
    s.vx += -k * s.vx * h;
    s.vy += (-G - k * s.vy) * h;
    s.vz += -k * s.vz * h;
    s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
  }
}
