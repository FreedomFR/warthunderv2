// Small math helpers shared by the game code (no allocations in the hot helpers).
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const TAU = Math.PI * 2;
export const KN = 0.514444;          // knots -> m/s
export const G = 9.81;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const sign = (v) => (v < 0 ? -1 : 1);

/** Wrap an angle to (-PI, PI]. */
export function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Move `cur` towards `target` by at most `maxStep` (plain scalar). */
export function approach(cur, target, maxStep) {
  const d = target - cur;
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
}

/** Deterministic PRNG (mulberry32). `?seed=123` makes a whole battle reproducible. */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (a, b) => a + (b - a) * rnd();
  rnd.int = (a, b) => Math.floor(a + (b - a + 1) * rnd());
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  // Box-Muller, cached second value
  let spare = null;
  rnd.normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    v = rnd();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(TAU * v);
    return m * Math.cos(TAU * v);
  };
  return rnd;
}

/**
 * Model matrix for a body whose local axes are: +x forward (bow), +y up, +z starboard.
 * heading: ship heading (0 = -Z "north", clockwise), pitch: bow-up positive, roll: starboard-down positive.
 * Rotation order: heading (yaw) * pitch * roll, applied as R = Ry * Rz(pitch) * Rx(roll) in the local frame.
 * (tx, ty, tz) is the translation (already camera-relative when drawing).
 */
export function mat4Ship(out, tx, ty, tz, heading, pitch, roll, scale = 1) {
  // local basis vectors in world space
  const sh = Math.sin(heading), ch = Math.cos(heading);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const sr = Math.sin(roll), cr = Math.cos(roll);
  // forward/right on the horizontal plane
  const fx = sh, fz = -ch;     // forward (heading)
  const rx = ch, rz = sh;      // right (starboard)
  // pitch bow-up rotates forward towards +y
  // local x (forward) = f*cp + up*sp
  const xx = fx * cp, xy = sp, xz = fz * cp;
  // local y before roll = up*cp - f*sp
  const y0x = -fx * sp, y0y = cp, y0z = -fz * sp;
  // roll starboard-down: y' = y0*cr - right*sr ; z' = right*cr + y0*sr  (right tilts down => y component of z' negative)
  // starboard-down roll lowers +z, so z' = right*cr - up*sr -> use y0 for the up part
  const yx = y0x * cr + rx * sr, yy = y0y * cr, yz = y0z * cr + rz * sr;
  const zx = rx * cr - y0x * sr, zy = -y0y * sr, zz = rz * cr - y0z * sr;
  out[0] = xx * scale; out[1] = xy * scale; out[2] = xz * scale; out[3] = 0;
  out[4] = yx * scale; out[5] = yy * scale; out[6] = yz * scale; out[7] = 0;
  out[8] = zx * scale; out[9] = zy * scale; out[10] = zz * scale; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/** out = a * b (column-major, 4x4). */
export function mat4Mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** Rotation about X (propeller spin etc.), column-major. */
export function mat4RotX(out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = c; out[6] = s; out[7] = 0;
  out[8] = 0; out[9] = -s; out[10] = c; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/**
 * Matrix placing a mesh built on the XZ plane (normal +y) at p, with its +y axis along the unit normal n and a uniform scale.
 */
export function mat4Frame(out, px, py, pz, nx, ny, nz, scale = 1, spin = 0) {
  // a tangent perpendicular to n (helper axis: world Y, or X when n is nearly vertical)
  const ax = Math.abs(ny) < 0.9 ? 0 : 1, ay = Math.abs(ny) < 0.9 ? 1 : 0;
  let tx = ay * nz, ty = -ax * nz, tz = ax * ny - ay * nx;
  let l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
  let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  if (spin) { const c = Math.cos(spin), s = Math.sin(spin); const t2x = tx * c + bx * s, t2y = ty * c + by * s, t2z = tz * c + bz * s; bx = -tx * s + bx * c; by = -ty * s + by * c; bz = -tz * s + bz * c; tx = t2x; ty = t2y; tz = t2z; }
  out[0] = tx * scale; out[1] = ty * scale; out[2] = tz * scale; out[3] = 0;
  out[4] = nx * scale; out[5] = ny * scale; out[6] = nz * scale; out[7] = 0;
  out[8] = bx * scale; out[9] = by * scale; out[10] = bz * scale; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
}

/** Rotation about local Y (yaw of a turret) with a translation: used for turret/barrel sub-matrices. */
export function mat4YawPitchAt(out, tx, ty, tz, yaw, pitch) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  // Local frame: x forward, y up, z starboard. yaw turns the turret clockwise seen from above
  // (towards +z), pitch raises the barrels (towards +y).
  // x' = (cy*cp, sp, sy*cp)   y' = (-cy*sp, cp, -sy*sp)   z' = (-sy, 0, cy)
  out[0] = cy * cp; out[1] = sp; out[2] = sy * cp; out[3] = 0;
  out[4] = -cy * sp; out[5] = cp; out[6] = -sy * sp; out[7] = 0;
  out[8] = -sy; out[9] = 0; out[10] = cy; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/** Transform a point by a column-major matrix into `out` (array-like of 3). */
export function mat4Point(out, m, x, y, z) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

const _mA = new Float64Array(16), _mG = new Float64Array(16), _mT = new Float64Array(16);
/**
 * Matrices of an articulated mount.
 *  S: ship matrix, (x, y, z): training axis in ship space, yaw: training angle (relative to the bow, clockwise),
 *  pitch: barrel elevation, (trunX, trunY): trunnion in the house frame, recoil: barrel slide back (m).
 * outHouse = S * T(x,y,z) * Ry(yaw);  outGuns = outHouse * T(trunnion - recoil along the barrel) * Rz(pitch)
 */
export function mountMatrices(outHouse, outGuns, S, x, y, z, yaw, pitch, trunX, trunY, recoil = 0) {
  mat4YawPitchAt(_mA, x, y, z, yaw, 0);
  mat4Mul(outHouse, S, _mA);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  mat4YawPitchAt(_mG, trunX - recoil * cp, trunY - recoil * sp, 0, 0, pitch);
  mat4Mul(outGuns, outHouse, _mG);
}
