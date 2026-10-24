// The defensive guns of an aircraft, one entry per gun position: where it pivots, what it can bear on, its calibre and its barrels. The same list draws the guns
// (each position is a mesh of its own that turns: planes.js part `gunN`, render/aircraftVisual.js) and fires them (sim/fighters.js, bomberDefense).
// Angles in the frame of the aircraft (x forward, y up, z to starboard): yaw 0 straight ahead, towards +z positive (pi = straight astern); pitch above the horizontal.
// A position: { id, t (kind), pivot [x, y, z], turret (a powered turret: it slews faster), arc { c, h } (yaw within h of c), lo / hi (pitch), fin (the fin is in the way
//   right astern and low), rest [yaw, pitch] (where the guns point with nothing to shoot at), cal (mm), n (barrels), gap (m between them), start (m from the pivot to the
//   breech: the receiver sits there, the barrels go on from it), dy (m: the guns above the pivot), win (a window that turns with the guns: ball and chin turrets), part ('body' | 'tail') }
import { frameOf } from './heavy.js';
import { GUN_MASKS } from '../data/gunmasks.js';
import { MAT, rgb, shade } from './meshbuilder.js';

const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The guns themselves, by calibre: the receiver (length, width, height) and the barrel (length out of it, radius: the cooling jacket of a .50 is a fat tube, the barrel of a
 * rifle-calibre gun a thin one). Measured: Browning M2 .50 (1.65 m overall, barrel 1.14 m in a perforated jacket of 4.5 cm), Browning .30 / Vickers K / MG 15 / Type 92
 * / MAC 34 (about 1.0-1.3 m overall, barrel 0.6 m, 2-3 cm), Hispano-Suiza 404 and Type 99 20 mm (2.4 m and 1.9 m overall, a muzzle brake).
 */
export const GUN_DIMS = {
  7.5: { recv: [0.5, 0.07, 0.11], len: 0.6, r: 0.014 },
  7.62: { recv: [0.55, 0.07, 0.11], len: 0.62, r: 0.015 },
  7.7: { recv: [0.5, 0.07, 0.12], len: 0.62, r: 0.015 },
  7.92: { recv: [0.55, 0.07, 0.11], len: 0.6, r: 0.014 },
  12.7: { recv: [0.62, 0.1, 0.14], len: 1.05, r: 0.024 },
  20: { recv: [0.8, 0.12, 0.16], len: 1.2, r: 0.021, brake: true },
};
export const gunDims = (cal) => GUN_DIMS[cal] || GUN_DIMS[cal >= 20 ? 20 : cal >= 12 ? 12.7 : 7.7];

/** The rounds a second one gun of a calibre fires (what a round that hits does to an aircraft is in data/airguns.js). */
export const GUN_RATE = (cal) => (cal >= 20 ? 9 : cal >= 12 ? 13 : 16);

// ---- the single-engine aircraft with a gunner: a flexible gun in the rear cockpit (the Avenger: a turret and a gun in the tunnel under the tail) ----
// x: the pivot along the fuselage (in the rear of the glazing); open: an open cockpit, the gun on a ring above the coaming. The fields of fire: a flexible gun swings wide but the
// fuselage and the tail stop it below and astern (lo), the fin right astern and low; a biplane's gunner is hemmed in by the lower wing.
const SINGLE = {
  sbd: [{ x: -0.75, cal: 7.62, n: 2, h: 1.5, hi: 1.3, lo: -0.35, fin: true }],                   // twin .30 Browning M2 on a flexible mount
  tbf: [{ x: -1.3, cal: 12.7, n: 1, turret: true, dome: 0.5, h: PI, hi: 1.45, lo: -0.04, fin: true },  // the Grumman 150SE turret
    { x: -3.1, cal: 7.62, n: 1, belly: true, h: 0.85, hi: -0.12, lo: -1.1 }],                     // the .30 in the tunnel under the tail
  d3a: [{ x: -0.7, cal: 7.7, n: 1, h: 1.2, hi: 1.2, lo: -0.3, fin: true }],                      // Type 92
  b5n: [{ x: 0.55, cal: 7.7, n: 1, h: 1.1, hi: 1.15, lo: -0.4, fin: true }],
  swordfish: [{ x: -1.8, cal: 7.7, n: 1, open: true, h: 1.5, hi: 1.3, lo: -0.5 }],                 // Vickers K
  il2: [{ x: -0.7, cal: 12.7, n: 1, h: 0.7, hi: 1.15, lo: -0.1, fin: true }],                       // the UBT 12.7 mm of the gunner, in the rear cockpit
  skua: [{ x: -1.6, cal: 7.7, n: 1, h: 1.05, hi: 1.2, lo: -0.3, fin: true }],
  ju87: [{ x: 0.3, cal: 7.92, n: 1, h: 1.2, hi: 1.25, lo: -0.45, fin: true }],                     // MG 15
  fi167: [{ x: 0.15, cal: 7.92, n: 1, h: 1.25, hi: 1.2, lo: -0.5 }],
  pl10: [{ x: -1.85, cal: 7.5, n: 2, open: true, h: 1.2, hi: 1.2, lo: -0.5 }],                     // Darne
};

function singleGuns(spec, key) {
  const list = SINGLE[key];
  if (!list) return [];
  const ry0 = spec.fus.r * spec.fus.ar, yb = ry0 * 0.78;
  return list.map((g, i) => {
    const c = spec.canopy.find((q) => g.x >= q.x0 - 0.3 && g.x <= q.x1 + 0.3) || spec.canopy[spec.canopy.length - 1];
    const y = g.belly ? -ry0 * 0.8 : g.dome ? ry0 * 0.95 + 0.12 : g.open ? yb + 0.42 : yb + c.h * 0.5;
    return {
      id: i, t: g.turret ? 'dome' : g.belly ? 'tunnel' : 'flex', pivot: [g.x, y, 0], turret: !!g.turret, arc: { c: PI, h: g.h }, lo: g.lo, hi: g.hi, fin: !!g.fin,
      rest: g.belly ? [PI, -0.2] : g.turret ? [PI, 0.12] : [PI, 0.35], cal: g.cal, n: g.n, gap: 0.1, start: g.turret ? 0.25 : 0.0, dy: g.turret ? 0.12 : 0, part: 'body',
    };
  });
}

/** The calibre of the guns of each position of the land-based bombers, in the order of their sheet's `guns` (bomberdata.js). */
const HEAVY_CAL = {
  b29: [12.7, 12.7, 12.7, 12.7, 12.7, 20],                  // four remote turrets and the tail: .50 Browning, the tail also a 20 mm
  b17: [12.7, 12.7, 12.7, 12.7, 12.7, 12.7, 12.7, 12.7, 12.7],          // chin, port cheek, top, ball, two waist, tail, starboard cheek, radio room: all .50 Browning
  lancaster: [7.7, 7.7, 7.7],                              // FN5, FN50, FN20: .303 Browning
  g4m: [7.7, 7.7, 7.7, 7.7, 20],                           // nose, dorsal, the two side blisters: Type 92; the tail cone: a Type 99 20 mm cannon
  he111: [7.92, 7.92, 7.92, 7.92, 7.92],                   // MG 15 in the nose, the B-Stand, the gondola, the two side windows
  sm79: [12.7, 12.7, 7.7, 7.7],                            // the rear gun of the hump and the ventral one: 12.7 Breda-SAFAT; the side ones: 7.7
  leo451: [7.5, 20, 7.5],                                  // MAC 34 in the nose, the dorsal Hispano 404, the retractable ventral tub
};

function heavyGuns(s, key) {
  const F = frameOf(s), cut = s.cutD ?? 1e9, cals = HEAVY_CAL[key] || [];
  const oneFin = s.tail.fins.length === 1 && Math.abs(s.tail.fins[0].z) < 0.01;
  const out = [];
  (s.guns || []).forEach((g, i) => {
    const d = g.d ?? (g.d0 + g.d1) / 2, x = F.X(d), q = F.at(x), cal = cals[i] || 7.7, side = g.side || 1;
    const base = { id: i, t: g.t, cal, n: g.n || 1, gap: 0.18, start: 0, dy: g.dy || 0, turret: false, fin: false, part: d > cut ? 'tail' : 'body' };
    switch (g.t) {
      case 'dome': {            // dorsal turret: all round, from the horizontal up; the fin is in the way right astern
        const yb = q.yc + q.ry * 0.97;
        out.push({ ...base, pivot: [x, yb + 0.1, 0], turret: true, arc: { c: PI, h: PI }, lo: -0.04, hi: 1.45, fin: oneFin, rest: [PI, 0.1], n: g.n || 2, gap: 0.2, start: g.r * 0.45, dy: g.r * 0.38 });
        break;
      }
      case 'cheek': {           // a gun at the side of the nose glazing: ahead and out to its own side
        out.push({ ...base, t: 'nose', pivot: [x, g.y ?? 0, side * q.rz * 0.8], arc: { c: side * 0.5, h: 0.95 }, lo: -0.65, hi: 0.5, rest: [side * 0.3, -0.05], start: 0.02 });
        break;
      }
      case 'hatch': {           // the gun of the radio room: through the roof, up and astern
        out.push({ ...base, t: 'hump', pivot: [x, q.yc + q.ry + 0.08, 0], arc: { c: PI, h: 1.35 }, lo: 0.0, hi: 1.35, fin: oneFin, rest: [PI, 0.5], start: 0.02 });
        break;
      }
      case 'ball': {            // the ball turret: all round, from the horizontal straight down
        out.push({ ...base, pivot: [x, q.yc - q.ry * 0.9 - g.r * 0.35, 0], turret: true, arc: { c: PI, h: PI }, lo: -1.57, hi: 0.03, rest: [PI, -0.05], n: 2, gap: 0.2, start: g.r * 0.6, win: g.r });
        break;
      }
      case 'chin': {            // the chin turret: ahead, and from a little above down to under the nose
        out.push({ ...base, pivot: [x, q.yc - q.ry * 0.95 - g.r * 0.25, 0], turret: true, arc: { c: 0, h: 1.1 }, lo: -0.8, hi: 0.3, rest: [0, -0.05], n: 2, gap: 0.18, start: g.r * 0.85, win: g.r });
        break;
      }
      case 'nose': {            // a gun in a ball socket in the glazing (the SM.79's: the rear gun of the hump, firing aft)
        const aft = !!g.aft;
        out.push({ ...base, t: aft ? 'hump' : 'nose', pivot: [x, g.y ?? 0, g.z || 0], arc: aft ? { c: PI, h: 1.3 } : { c: 0, h: 0.6 }, lo: aft ? -0.12 : -0.6, hi: aft ? 1.1 : 0.45,
          fin: aft && oneFin, rest: aft ? [PI, 0.2] : [0, -0.05], start: 0.02 });
        break;
      }
      case 'fturret': {         // a powered turret at the tip of the nose
        out.push({ ...base, pivot: [x, g.y ?? 0, 0], turret: true, arc: { c: 0, h: 1.3 }, lo: -0.7, hi: 0.9, rest: [0, 0], n: 2, gap: 0.2, start: g.r * 0.55 });
        break;
      }
      case 'tail': {            // the tail position: astern, a cone of 60-70 degrees each way
        out.push({ ...base, pivot: [x + g.r * 0.5, q.yc, 0], turret: (g.n || 1) >= 2, arc: { c: PI, h: 1.15 }, lo: -0.7, hi: 0.7, rest: [PI, 0], n: g.n || 1, gap: 0.17, start: g.r * 1.55 });
        break;
      }
      case 'beam': {            // a gun at a side window: out to that side, from ahead of the beam to well aft
        out.push({ ...base, pivot: [x + 0.15, g.y ?? 0.1, side * (q.rz + 0.04)], arc: { c: side * PI / 2, h: 1.0 }, lo: -0.75, hi: 0.85, rest: [side * (PI / 2 + 0.7), -0.05], start: -0.25 });
        break;
      }
      case 'blister': {         // a gun in a glazed blister on the side
        out.push({ ...base, pivot: [x, g.y ?? 0.2, side * q.rz * 0.95], arc: { c: side * (PI / 2 + 0.25), h: 1.05 }, lo: -0.6, hi: 0.9, rest: [side * (PI / 2 + 0.8), 0.05], start: -0.2 });
        break;
      }
      case 'gondola': {         // the gun at the back of a ventral gondola: astern and down
        const x0 = F.X(g.d0), x1 = F.X(g.d1), qm = F.at((x0 + x1) / 2), yb = qm.yc - qm.ry;
        out.push({ ...base, pivot: [lerp(x0, x1, 0.86), yb - g.ry * 0.3, 0], arc: { c: PI, h: 0.75 }, lo: -1.1, hi: 0.05, rest: [PI, -0.15], start: -0.2 });
        break;
      }
      default: break;
    }
    const o = out[out.length - 1];
    if (o && o.id === i) { if (g.pivot) o.pivot = g.pivot.slice(); if (g.nowin) delete o.win; }      // (a position measured on the model: where the guns come out of its turret, whose housing is the model's)
  });
  return out;
}

const cache = new Map();
/** The gun positions of an aircraft type (an empty list for the fighters and the aircraft without a gunner). */
export function planeGuns(spec, key) {
  let g = cache.get(key);
  if (!g) {
    g = spec.engines ? heavyGuns(spec, key) : singleGuns(spec, key);
    // (the directions that the aircraft's own structure blocks, measured on its drawn model: [pitch, yaw from, yaw to] in degrees, 5 degree cells)
    const masks = GUN_MASKS[key];
    if (masks) for (const q of g) {
      const list = masks[q.id];
      if (!list) continue;
      q.blocked = new Uint8Array(72 * 36);
      for (const [pd, y0, y1] of list) for (let y = y0; y < y1; y += CELL) q.blocked[cellOf(y * PI / 180 + 0.001, pd * PI / 180 + 0.001)] = 1;
    }
    cache.set(key, g);
  }
  return g;
}

/** The cells of the table of blocked directions: 5 degrees in yaw (72 round) by 5 in pitch (36 from straight down to straight up). */
const CELL = 5;
const cellOf = (yaw, pitch) => {
  const yi = ((Math.floor((yaw * 180 / PI + 180) / CELL) % 72) + 72) % 72, pi = Math.max(0, Math.min(35, Math.floor((pitch * 180 / PI + 90) / CELL)));
  return pi * 72 + yi;
};

/** The field of fire of position g as designed: the arc, the pitch limits and the fin, without what the aircraft's own structure blocks (see isBlocked). */
export function inField(g, yaw, pitch) {
  if (pitch < g.lo || pitch > g.hi) return false;
  let d = yaw - g.arc.c;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > g.arc.h) return false;
  if (g.fin) { const a = Math.atan2(Math.sin(yaw - PI), Math.cos(yaw - PI)); if (Math.abs(a) < 0.13 && pitch < 0.55) return false; }   // the fin and the tailplane are in the way
  return true;
}

/** Is the way from the muzzle along (yaw, pitch) stopped by the aircraft itself (its wing, its tail, its cockpit)? From data/gunmasks.js, made by tools/audit/gunarcs.mjs. */
export const isBlocked = (g, yaw, pitch) => !!g.blocked && g.blocked[cellOf(yaw, pitch)] === 1;

/** Can position g bear on the direction (yaw, pitch) in the frame of the aircraft? */
export function inArc(g, yaw, pitch) {
  return inField(g, yaw, pitch) && !isBlocked(g, yaw, pitch);
}

/** The muzzle of position g, in the frame of the aircraft, with its guns at (yaw, pitch). */
export function muzzleOf(g, yaw, pitch, out = [0, 0, 0]) {
  const L = g.start + gunDims(g.cal).len + gunDims(g.cal).recv[0] * 0.4, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  out[0] = g.pivot[0] + cy * cp * L - cy * sp * g.dy; out[1] = g.pivot[1] + sp * L + cp * g.dy; out[2] = g.pivot[2] + sy * cp * L - sy * sp * g.dy;
  return out;
}

/**
 * The guns of one position in its own frame (the origin on the pivot, the barrels along +x): the receiver, the barrels (a .50 in its jacket with a flash hider, a 20 mm with a
 * muzzle brake), and the window of a ball or chin turret, which turns with them. b: a MeshBuilder.
 */
export function drawGunHead(b, g) {
  const D = gunDims(g.cal), dark = rgb('#26282b'), steel = rgb('#3a3d40'), glass = rgb('#33485a');
  const [rl, rw, rh] = D.recv, x0 = g.start - rl * 0.6, x1 = g.start + rl * 0.4;
  for (let k = 0; k < g.n; k++) {
    const z = (k - (g.n - 1) / 2) * g.gap, y = g.dy;
    b.box((x0 + x1) / 2, y, z, rl, rh, rw, steel, MAT.DARK);
    b.rod(x1, x1 + D.len, y + rh * 0.12, z, D.r, D.r * 0.92, dark, MAT.DARK, { seg: 6 });
    if (D.brake) b.rod(x1 + D.len - 0.12, x1 + D.len + 0.02, y + rh * 0.12, z, D.r * 1.9, D.r * 1.9, dark, MAT.DARK, { seg: 6 });
    else if (g.cal >= 12) b.rod(x1 + D.len - 0.06, x1 + D.len + 0.03, y + rh * 0.12, z, D.r * 0.75, D.r * 1.05, dark, MAT.DARK, { seg: 6 });   // the flash hider
    if (g.n === 1 && !g.turret) b.box(x0 - 0.06, y - rh * 0.35, z, 0.12, rh * 0.5, 0.05, shade(steel, 0.8), MAT.DARK);     // the spade grips of a gun laid by hand
  }
  if (g.win) b.sphere(g.win * 0.55, 0, 0, g.win * 0.42, g.win * 0.38, g.win * 0.55, glass, MAT.GLASS, { seg: 8, rings: 5 });
}
