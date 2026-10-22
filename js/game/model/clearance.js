// What each gun can bear on. A mount stands on a deck among towers, funnels, masts and other turrets, so the barrel cannot be trained or raised through
// them: for every mount the model gives the lowest elevation at which the barrel clears everything, bearing by bearing (`rec.clr`), and from it the
// arc the mount can be trained over (`rec.arcMin` .. `rec.arcMax`, relative to `rec.arcC`). The simulation reads both (sim/weapons.js, sim/aircraft.js).
import { mountDims } from './mounts.js';

const D2R = Math.PI / 180;
export const CLR_STEP = 3 * D2R;                 // bearing step of the clearance table
export const CLR_N = Math.round(2 * Math.PI / CLR_STEP);
const ELEVS = [];
for (let d = 0; d <= 90; d += 5) ELEVS.push(d * D2R);
/** the lowest elevation a gun is allowed to be trained at: when the table needs more than this, the bearing is blocked */
const BLOCKED = { main: 24 * D2R, sec: 40 * D2R, aa: 38 * D2R };

/** Is the plan point (x, z) inside the footprint of solid s (its outline for a prism or a cylinder, its box otherwise), grown by pad? */
export function inFoot(s, x, z, pad = 0) {
  if (x < s[0] - pad || x > s[1] + pad || z < s[4] - pad || z > s[5] + pad) return false;
  if (s.poly) return inPoly(s.poly, x, z);
  if (s.round) { const cx = (s[0] + s[1]) / 2, cz = (s[4] + s[5]) / 2, a = (s[1] - s[0]) / 2 + pad, c = (s[5] - s[4]) / 2 + pad; return ((x - cx) / a) ** 2 + ((z - cz) / c) ** 2 <= 1; }
  return true;
}

/** Is the point (x, z) inside the convex polygon? */
function inPoly(poly, x, z) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) { if (sign === 0) sign = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sign) return false; }
  }
  return true;
}

/** Does the segment (o + t d, 0 <= t <= len) meet the solid s (its box grown by `pad`; for a prism or a cylinder the outline, not the box)? */
function segHitsBox(ox, oy, oz, dx, dy, dz, len, s, pad) {
  const t = segBox(ox, oy, oz, dx, dy, dz, len, s, pad);
  if (!t) return false;
  if (!s.poly && !s.round) return true;
  const cx = (s[0] + s[1]) / 2, cz = (s[4] + s[5]) / 2, a = (s[1] - s[0]) / 2 + pad, c = (s[5] - s[4]) / 2 + pad;
  for (let u = t[0]; u <= t[1] + 1e-6; u += 0.3) {
    const x = ox + dx * u, z = oz + dz * u;
    if (s.poly ? inPoly(s.poly, x, z) : ((x - cx) / a) ** 2 + ((z - cz) / c) ** 2 <= 1) return true;
  }
  return false;
}

function segBox(ox, oy, oz, dx, dy, dz, len, s, pad) {
  let t0 = 0, t1 = len;
  const lo = [s[0] - pad, s[2] - pad, s[4] - pad], hi = [s[1] + pad, s[3] + pad, s[5] + pad], o = [ox, oy, oz], d = [dx, dy, dz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let a = (lo[k] - o[k]) / d[k], c = (hi[k] - o[k]) / d[k];
    if (a > c) { const t = a; a = c; c = t; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** The size of the house of a mount (half of the larger side, m): the obstacle it makes for the other barrels. */
function houseRadius(rec) {
  if (rec.kind === 'aa' || rec.label) return 0.9;
  const calM = rec.cal / 1000;
  return Math.max(1.4, calM * (rec.n >= 3 ? 12 : 10));
}

/**
 * Fill `clr`, `arcMin` and `arcMax` of every mount (main, secondary and light AA) of a model. `solids` are the boxes of the structures, `hull` the hull object (deck height).
 * The deck itself blocks the barrel only when it rises in front of the muzzle (the sheer at the bow).
 */
export function computeClearance(model, solids, hull, opts = {}) {
  // a mount that a structure built after it has swallowed (a platform, a director tower) stands on that structure instead: up to 2.4 m higher
  const settle = (rec) => {
    if (rec.look) return;                                  // copied from a reference model: it stands where the model has it
    let top = -1;
    for (const s of solids) if (s[2] < rec.y - 0.2 && s[3] > rec.y + 0.2 && s[3] - rec.y <= 2.4 && inFoot(s, rec.x, rec.z, -0.1)) top = Math.max(top, s[3]);
    if (top > 0) { rec.y = top; rec.settled = true; }
  };
  model.mounts.forEach(settle);
  model.aaMounts.forEach((a, i) => { settle(a); if (model.aa[i]) model.aa[i][1] = a.y + 1.2; });
  const mounts = [...model.mounts, ...model.aaMounts.map((a) => { a.kind = 'aa'; return a; })];
  // the houses of the gun mounts are obstacles for each other's barrels (a turret does not shoot through its neighbour)
  const houses = model.mounts.map((r) => {
    const rr = houseRadius(r), dm = mountDims(r);
    return { rec: r, box: [r.x - rr, r.x + rr, r.y - 0.5, r.y + (dm.height || 3), r.z - rr, r.z + rr] };
  });
  for (const rec of mounts) {
    const isAA = rec.kind === 'aa';
    // a casemate in the side of the hull fires through its port: the hull and the decks above are not an obstacle to be tested
    const db = hull.halfBeamDeck(rec.x);
    if (!isAA && Math.abs(rec.z) < db && rec.y < hull.deckY(rec.x) - hull.camber - 1.2) { rec.casemate = true; rec.arcMin = -rec.arcH; rec.arcMax = rec.arcH; continue; }
    if (isAA) { rec.arcC = rec.yaw0; rec.arcH = Math.PI; }
    const dm = mountDims(isAA ? { kind: 'aa', variant: rec.variant, cal: rec.cal, n: rec.n } : rec);
    const [tx, ty] = dm.trunnion, len = dm.muzzle + 0.3;
    // the structures within reach of the barrel
    const reach = len + tx + 2;
    const near = [];
    for (const s of solids) {
      if (s[1] < rec.x - reach || s[0] > rec.x + reach || s[5] < rec.z - reach || s[4] > rec.z + reach) continue;
      if (s[1] - s[0] < 1.3 && s[5] - s[4] < 1.3 && s[3] - s[2] < 1.2) continue;    // a bollard, a vent: a gun does not mind
      if (s[3] < rec.y + ty + 0.6 && inFoot(s, rec.x, rec.z, 0.2)) continue;       // its own tub or barbette
      if (s[3] <= rec.y + ty + 0.05) continue;             // below the trunnion: what the mount stands on (its own tub, the deck) cannot be in the way of a barrel that never points down
      near.push(s);
    }
    for (const h of houses) if (h.rec !== rec && !(h.box[1] < rec.x - reach || h.box[0] > rec.x + reach || h.box[5] < rec.z - reach || h.box[4] > rec.z + reach)) near.push(h.box);
    // per bearing, the band of elevations at which the barrel is clear: from `lo` up to `hi` (a deck edge or a flight deck above the mount stops it from rising)
    const clr = new Float32Array(CLR_N), clrHi = new Float32Array(CLR_N);
    for (let i = 0; i < CLR_N; i++) {
      const phi = i * CLR_STEP, c = Math.cos(phi), s = Math.sin(phi);
      const ox = rec.x + tx * c, oy = rec.y + ty, oz = rec.z + tx * s;
      let lo = Math.PI, hi = 0;
      for (const e of ELEVS) {
        const ce = Math.cos(e), se = Math.sin(e);
        let hit = false;
        for (const b of near) if (segHitsBox(ox, oy, oz, c * ce, se, s * ce, len, b, 0.12)) { hit = true; break; }
        if (!hit && deckInTheWay(hull, ox, oy, oz, c * ce, se, s * ce, len)) hit = true;
        if (!hit) { if (lo > e) lo = e; hi = e; } else if (lo <= e) break;       // the band ends at the first obstacle above its start
      }
      clr[i] = lo; clrHi[i] = lo > hi ? -1 : hi;
    }
    rec.clr = clr; rec.clrHi = clrHi;
    arcsFrom(rec, isAA ? BLOCKED.aa : rec.group === 'main' ? BLOCKED.main : BLOCKED.sec, !!opts.bothBeams);
    if (rec.look && rec.noArc) {                      // a mount copied from the reference model stands where the model has it, in a place the hand-made masses round it may close: it keeps the outward half circle
      rec.noArc = false; rec.arcC = isAA ? rec.yaw0 : rec.arcC; rec.arcH = Math.PI / 2; rec.arcMin = -Math.PI / 2; rec.arcMax = Math.PI / 2;
      rec.clr = new Float32Array(CLR_N).fill(0.05); rec.clrHi = new Float32Array(CLR_N).fill(1.4);
    }
    if (isAA) rec.yaw0 = rec.arcC;
  }
}

/** The deck rises towards the bow: a barrel pointing forward and low meets the forecastle. */
function deckInTheWay(hull, ox, oy, oz, dx, dy, dz, len) {
  for (let t = 0.5; t <= len; t += 1) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (Math.abs(z) < hull.halfBeamDeck(x) * 0.95 && y < hull.deckY(x) - hull.camber * Math.pow(z / (hull.halfBeamDeck(x) || 1), 2) + 0.2) return true;
  }
  return false;
}

/** Lowest elevation (rad) at which the barrel clears the ship when pointed at ship-relative bearing `phi` (from the bow, towards starboard). */
export function clearElev(rec, phi) {
  if (!rec.clr) return 0;
  let a = phi / CLR_STEP;
  a = ((a % CLR_N) + CLR_N) % CLR_N;
  const i = Math.floor(a);
  return Math.max(rec.clr[i], rec.clr[(i + 1) % CLR_N]);
}

/** Highest elevation (rad) at which the barrel is still clear on that bearing (the mount cannot rise above a flight deck that overhangs it). */
export function clearMax(rec, phi) {
  if (!rec.clrHi) return Math.PI / 2;
  let a = phi / CLR_STEP;
  a = ((a % CLR_N) + CLR_N) % CLR_N;
  const i = Math.floor(a);
  return Math.min(rec.clrHi[i], rec.clrHi[(i + 1) % CLR_N]);
}

/** Are there free stretches of at least 20 degrees on both sides of the declared arc (each wholly on its own side of the centre)? */
function both(rec, free, H, step) {
  let port = 0, star = 0, runP = 0, runS = 0;
  for (let rel = -H; rel <= H + 1e-9; rel += step) {
    const ok = free(rel);
    // the free run counts for the side that the bearing is on, seen from the ship (arcC + rel against the bow)
    const side = Math.sin(rec.arcC + rel) >= 0 ? 1 : -1;
    if (ok && side > 0) { runS += step; star = Math.max(star, runS); } else if (side > 0) runS = 0;
    if (ok && side < 0) { runP += step; port = Math.max(port, runP); } else if (side < 0) runP = 0;
  }
  return port >= 20 * D2R && star >= 20 * D2R;
}

/** Choose the arc: the stretch around `arcC` (inside the declared half-width `arcH`) where the barrel can be trained; if `arcC` itself is blocked, the widest free stretch of the declared arc. */
function arcsFrom(rec, limit, bothBeams = false) {
  const free = (rel) => clearElev(rec, rec.arcC + rel) <= limit && clearMax(rec, rec.arcC + rel) - clearElev(rec, rec.arcC + rel) >= 10 * D2R;
  const step = 1.5 * D2R, H = rec.arcH;
  if (free(0)) {
    let lo = 0, hi = 0;
    while (lo > -H && free(lo - step)) lo -= step;
    while (hi < H && free(hi + step)) hi += step;
    rec.arcMin = Math.max(lo, -H); rec.arcMax = Math.min(hi, H);
    return;
  }
  // the centre is blocked: take the widest free stretch of the declared arc and rest in its middle
  let best = null, cur = null;
  for (let rel = -H; rel <= H + 1e-9; rel += step) {
    if (free(rel)) { if (!cur) cur = { a: rel, b: rel }; else cur.b = rel; if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur }; } else cur = null;
  }
  if (!best || best.b - best.a < 6 * D2R) { rec.arcMin = rec.arcMax = 0; rec.noArc = true; return; }
  // (ships drawn from a reference model, `opts.bothBeams`) a mount on the centre line between two funnels or towers is free on both beams: it keeps the whole declared arc, and the table of elevations (`clr`) refuses the blocked bearings
  if (bothBeams && rec.kind !== 'aa' && Math.abs(rec.z) < 0.5 && both(rec, free, H, step)) { rec.arcMin = -H; rec.arcMax = H; rec.bothBeams = true; return; }
  const mid = (best.a + best.b) / 2;
  rec.arcC += mid; rec.arcMin = best.a - mid; rec.arcMax = best.b - mid; rec.moved = mid;
}

/** Would a light barrel at (x, y, z) (the pivot) pointing at bearing `phi` and elevation `e` meet a structure within 6 m? Quick test used to place the guns. */
export function barrelBlocked(solids, x, y, z, phi, e, len = 3) {
  const ox = x, oy = y + 1.2, oz = z, c = Math.cos(phi) * Math.cos(e), s = Math.sin(phi) * Math.cos(e), v = Math.sin(e);
  for (const b of solids) {
    if (b[1] < x - len - 1 || b[0] > x + len + 1 || b[5] < z - len - 1 || b[4] > z + len + 1) continue;
    if (b[3] <= oy + 0.05) continue;
    if (segHitsBox(ox, oy, oz, c, v, s, len, b, 0.12)) return true;
  }
  return false;
}

/** The highest clearance the barrel meets while it is trained from relative bearing `a` to `b` (both relative to the mount's centre, rad): it must rise to that to swing through without touching the ship. */
export function pathClear(rec, a, b) {
  if (!rec.clr) return 0;
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / CLR_STEP));
  let hi = 0;
  for (let i = 0; i <= n; i++) hi = Math.max(hi, clearElev(rec, rec.arcC + a + (b - a) * i / n));
  return hi;
}

/** `rel` (rad, wrapped to +-pi) taken round the circle into the arc of the mount when the arc runs across the back (an arc of -111..180 holds -177 as 183). */
export function inArcRel(rec, rel) {
  if (rel < rec.arcMin && rel + 2 * Math.PI <= rec.arcMax + 1e-6) return rel + 2 * Math.PI;
  if (rel > rec.arcMax && rel - 2 * Math.PI >= rec.arcMin - 1e-6) return rel - 2 * Math.PI;
  return rel;
}

/**
 * The bearings (ship relative, rad, clockwise from the bow) a launcher can fire on: the beam sectors of the side it stands on (both for a mount on the centre line),
 * taken 20 to 160 degrees off the bow, less what a structure at the height of the tubes stands in. `tube.cx` is the training axis when the tube entry is its muzzle,
 * `tube.reach` how far the tubes and the torpedoes leaving them reach from it, `tube.r0` the radius of the mount's own carriage (nothing within it is an obstacle). Sets `tube.sectors` ([[from, to], ...]), or `tube.noArc`.
 */
export function computeTubeArcs(model, solids, bowTubes = false) {
  if (bowTubes) return;
  const step = 2 * D2R;
  for (const t of model.tubes) {
    const ox = t.cx ?? t.x, oz = t.z, reach = t.reach ?? 5.5, r0 = t.r0 ?? 2.0;      // what stands within r0 of the axis is the mount's own carriage and cheeks
    const mirrored = model.tubes.some((u) => u !== t && Math.abs(u.z + t.z) < 0.8 && Math.abs(u.x - t.x) < 3);
    const sideOnly = Math.abs(t.z) > 1.4 && mirrored ? Math.sign(t.z) : 0;      // a pair of launchers, one on each side, fire to their own side
    const near = solids.filter((q) => !(q[1] - q[0] < 1.3 && q[5] - q[4] < 1.3 && q[3] - q[2] < 1.2) && !(q[3] - q[2] < 1.0 && Math.min(q[1] - q[0], q[5] - q[4]) < 1.0) && q[2] < t.y + 0.25 && q[3] > t.y - 0.25 && !inFoot(q, ox, oz, -0.1)
      && !(q[1] < ox - reach - 1 || q[0] > ox + reach + 1 || q[5] < oz - reach - 1 || q[4] > oz + reach + 1));
    const sectors = [];
    let cur = null;
    for (let a = -Math.PI; a <= Math.PI + 1e-9; a += step) {
      const off = Math.min(Math.abs(Math.abs(a) - Math.PI / 2));
      let ok = Math.abs(a) >= 20 * D2R && Math.abs(a) <= 160 * D2R && off <= 70 * D2R && (!sideOnly || Math.sign(a) === sideOnly);
      if (ok) { const c = Math.cos(a), sn = Math.sin(a); for (const q of near) if (segHitsBox(ox + c * r0, t.y, oz + sn * r0, c, 0, sn, reach - r0, q, 0.15)) { ok = false; break; } }
      if (ok) { if (!cur) cur = [a, a]; else cur[1] = a; } else if (cur) { sectors.push(cur); cur = null; }
    }
    if (cur) sectors.push(cur);
    t.sectors = sectors.filter((q) => q[1] - q[0] >= 6 * D2R);
    if (!t.sectors.length) t.noArc = true;
  }
}

/** Can launcher `t` fire on the ship relative bearing `rel` (rad, +-pi)? One without sectors (a model that did not compute them) fires 20 to 160 degrees off the bow on either beam. */
export function tubeBears(t, rel) {
  if (t.noArc) return false;
  if (!t.sectors) { const off = Math.min(Math.abs(rel - Math.PI / 2), Math.abs(rel + Math.PI / 2)); return off <= 70 * D2R; }
  for (const q of t.sectors) if (rel >= q[0] - 1e-6 && rel <= q[1] + 1e-6) return true;
  return false;
}
