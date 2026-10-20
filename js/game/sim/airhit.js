// The hit volume of an aircraft. An aircraft is a body (an ellipsoid the size of its fuselage), the planes of its wings (a biplane has two) and its tail: what a gun sees of it
// is the area it presents along the line of fire, which depends on the type (a Swordfish is a big target, a Zero a small one) and on the aspect (head-on is the smallest, from
// above the largest). A burst of rounds that lands around the point aimed at (a Gaussian pattern: the dispersion of the gun, the laying error, the lead that does not
// match what the aircraft does) hits it with the chance that the area covers of the pattern at the place where the aircraft is.
import { PLANES } from '../model/planes.js';

const cache = new Map();
/** The dimensions that matter to a shot: { a, b, c: semi-axes of the fuselage, wing: plan area (m2), edge: area of the wing edge, tail: plan area of the tailplane, fin: area of the fin, ext: half extents for a burst } */
export function airframe(typeKey, spec = PLANES[typeKey]) {
  let f = cache.get(typeKey);
  if (f) return f;
  const w = spec.wing, t = spec.tail, bi = spec.kind === 'bi', eng = spec.engines;
  // a multi-engine aircraft's engines hang on the wings: the body is the fuselage alone, the nacelles add to what is seen from ahead (a disc each) and from above
  const b = Math.max(spec.fus.r, spec.engine && !eng ? spec.engine.r * 0.95 : 0), c = Math.max(spec.fus.r * spec.fus.ar, b);
  const a = spec.L / 2 * 0.92;
  const chord = (w.cr + w.ct) / 2;
  let wing = spec.span * chord * (bi ? (w.lowerShort ? 1.78 : 2) : 1) * 0.92;      // the two wings of a biplane, a little less than the box they span
  if (w.plan) {            // a wing drawn as panels: the area of the panels, the nacelles that stick out of its leading edge added
    wing = 0;
    for (let i = 0; i + 1 < w.plan.length; i++) wing += ((w.plan[i][2] - w.plan[i][1]) + (w.plan[i + 1][2] - w.plan[i + 1][1])) / 2 * (w.plan[i + 1][0] - w.plan[i][0]) * spec.span;
    wing *= 0.95;
  }
  let nac = 0, nacTop = 0;
  if (eng) for (const e of eng) if (!e.nose) { nac += Math.PI * e.r * e.r; nacTop += 2 * e.r * Math.max(0, (e.aft ?? e.d + e.len + 2.6) - e.d - 2.5) * 0.7; }
  const finN = t.fins ? t.fins.length : 1;
  const edge = (spec.span * (w.t ?? 0.3) * 0.6 + t.span * 0.12) * (bi ? 2 : 1) * 0.9 + (spec.gear === 'fixedbig' ? 1.2 : spec.gear === 'fixed' ? 0.7 : 0) + nac * 0.8;   // the thickness of the wings and the tailplane seen from ahead, the wheels of a fixed undercarriage, the engines
  f = { a, b, c, wing: wing + nacTop, edge, tail: t.span * t.chord * 0.9, fin: t.fin * t.finChord * 0.55 * finN, halfSpan: spec.span / 2, halfLen: spec.L / 2, strut: bi ? (w.gap || 1.5) * spec.span * 0.06 : 0 };
  cache.set(typeKey, f);
  return f;
}

const _f = [0, 0, 0], _r = [0, 0, 0], _u = [0, 0, 0];
/** The unit vectors of the aircraft's axes in the world: forward, right, up (bank is left out: it hardly changes the area). */
export function axes(p) {
  const sh = Math.sin(p.heading), ch = Math.cos(p.heading), sp = Math.sin(p.pitch || 0), cp = Math.cos(p.pitch || 0);
  _f[0] = sh * cp; _f[1] = sp; _f[2] = -ch * cp;
  _r[0] = ch; _r[1] = 0; _r[2] = sh;
  _u[0] = _r[1] * _f[2] - _r[2] * _f[1]; _u[1] = _r[2] * _f[0] - _r[0] * _f[2]; _u[2] = _r[0] * _f[1] - _r[1] * _f[0];
  return { f: _f, r: _r, u: _u };
}

/** The area (m2) that an aircraft presents to a shooter looking along the unit vector (dx, dy, dz) (from the shooter to the aircraft). */
export function presentedArea(p, dx, dy, dz) {
  const F = airframe(p.typeKey, p.spec), A = axes(p);
  const df = Math.abs(dx * A.f[0] + dy * A.f[1] + dz * A.f[2]), dr = Math.abs(dx * A.r[0] + dy * A.r[1] + dz * A.r[2]), du = Math.abs(dx * A.u[0] + dy * A.u[1] + dz * A.u[2]);
  // the area of the shadow of an ellipsoid (semi-axes a along the nose, b across, c up): pi * sqrt((b c df)^2 + (a c dr)^2 + (a b du)^2)
  const body = Math.PI * Math.sqrt((F.b * F.c * df) ** 2 + (F.a * F.c * dr) ** 2 + (F.a * F.b * du) ** 2);
  return body + (F.wing + F.tail) * du + F.edge * df + (F.fin + F.strut) * dr;
}

/** The distance from the centre of an aircraft to its outline in the direction (qx, qy, qz) (a unit vector): how far from the centre a burst can be and still be on it. */
export function extentToward(p, qx, qy, qz) {
  const F = airframe(p.typeKey, p.spec), A = axes(p);
  const qf = qx * A.f[0] + qy * A.f[1] + qz * A.f[2], qr = qx * A.r[0] + qy * A.r[1] + qz * A.r[2], qu = qx * A.u[0] + qy * A.u[1] + qz * A.u[2];
  // an ellipsoid of the half length, the half span and the height of the body
  return 1 / Math.sqrt((qf / F.halfLen) ** 2 + (qr / F.halfSpan) ** 2 + (qu / Math.max(F.c, 0.8)) ** 2);
}

/** The chance that one round lands on a target of area `A` when the pattern is Gaussian (std. dev. `sigma`, in metres, both ways) and its centre misses the middle of the target by `miss` metres. */
export function roundHitChance(A, miss, sigma) {
  const s2 = sigma * sigma;
  return Math.min(1, A / (2 * Math.PI * s2) * Math.exp(-miss * miss / (2 * s2)));
}

/**
 * The hits a second that the light AA mount `a` of `ship` (with the settings `cfg` of its kind, see aadata.js) scores on the aircraft `p`, `dist` metres away, from the muzzle at `w`:
 * where the barrels point against where the aircraft will be when the rounds get there (the rounds leave with the speed of the ship); the pattern of the rounds grows with the range
 * (dispersion, laying error, the ship's roll) and what it covers of the aircraft is the area the aircraft shows along the line of fire.
 */
export function lightAAHitRate(ship, a, p, cfg, w, dist) {
  const brg = ship.heading + a.rec.yaw0 + a.train, ce = Math.cos(a.elev);
  const gdx = Math.sin(brg) * ce, gdy = Math.sin(a.elev), gdz = -Math.cos(brg) * ce;
  const tof = dist / (cfg.vb * 0.72);
  const fx = p.x - w[0] + (p.vx - ship.vx) * tof, fy = p.y - w[1] + p.vy * tof, fz = p.z - w[2] + (p.vz - ship.vz) * tof;
  const fl = Math.hypot(fx, fy, fz) || 1, along = fx * gdx + fy * gdy + fz * gdz;
  const miss = Math.hypot(fx - gdx * along, fy - gdy * along, fz - gdz * along);
  const area = presentedArea(p, fx / fl, fy / fl, fz / fl);
  const sigma = cfg.sig * 0.001 * fl + 1.2 + Math.abs(ship.roll) * 6;
  return cfg.rps * a.rec.n * 0.6 * roundHitChance(area, miss, sigma) * (a.rec.n >= 3 ? 1.1 : 1);
}
