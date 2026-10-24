// The fixed guns of an aircraft: where each muzzle is (in the frame of the aircraft: x forward, y up, z to starboard) and how it is drawn. The table of data/airguns.js says what a
// type carries and how it is mounted (in the wings, over the engine, through the propeller hub...); this file turns that into places on the model, so that the rounds leave from the
// guns themselves and the barrels stick out of the leading edge where the real ones do. The sim (sim/fighters.js) lays each gun's line on the point where the guns are harmonised.
import { FIXED_GUNS } from '../data/airguns.js';
import { frameOf } from './heavy.js';
import { MAT, rgb } from './meshbuilder.js';
import { gunDims } from './planeGuns.js';
import { decodeBaked } from './bakedmesh.js';

/** The leading edge of the wing of a monoplane at the distance zAbs from the centre line: { x, y } on the mid-surface (the same planform as drawPlane). */
export function wingLE(s, zAbs) {
  const w = s.wing, hs = s.span / 2, u = Math.min(1, zAbs / hs), x0 = w.x, yr = w.y || 0, dih = w.dih || 0;
  if (w.gull) {
    const kz = hs * (w.kneeFrac ?? 0.3), drop = w.gull, rise = w.tipRise ?? 0.6;
    const root = { x: x0 + w.cr / 2, y: yr + 0.1 }, knee = { x: x0 + w.cr * 0.34 + 0.1, y: yr - drop * 0.5 }, tip = { x: x0 + w.ct / 2 + w.sweep * 0.5, y: yr - drop * 0.1 + rise };
    const a = zAbs <= kz ? root : knee, b = zAbs <= kz ? knee : tip, t = zAbs <= kz ? zAbs / kz : (zAbs - kz) / (hs - kz);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  if (w.elliptic) {
    const c = w.cr * Math.sqrt(1 - u * u) * 0.95 + w.ct * 0.05;
    return { x: x0 + c / 2 + w.sweep * u * 0.4, y: yr + dih * u };
  }
  return { x: x0 + w.cr / 2 + (w.ct / 2 + w.sweep - w.cr / 2) * u, y: yr + dih * u };
}

/** The calibre of each group of a type (mm): the table gives the gun, GUNS the calibre. Kept here so that the model needs nothing of the sim. */
const CAL = { m2: 12.7, b303: 7.7, t97: 7.7, t99: 20, mg17: 7.92, mgff: 20, mg151: 20, hs404: 20, hsm1: 20, mac: 7.5, breda127: 12.7, vya23: 23, shkas: 7.62, vickers: 7.7, darne: 7.5, safat77: 7.7 };

const wingPos = new Map();
/** The leading edge of a wing drawn from its model: measured on the vertices of its right wing (the most forward at that distance from the centre line, the height of the edge there). */
function modelLE(s, zAbs) {
  let P = wingPos.get(s);
  if (!P) { const piece = s.v4.PLANE.wingR; P = piece ? decodeBaked(piece, s.v4.SCALE, 40).pos : null; wingPos.set(s, P || false); }
  if (!P) return null;
  let best = -1e9;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - zAbs) < 0.12 && P[i] > best) best = P[i];
  if (best < -1e8) return null;
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - zAbs) < 0.12 && P[i] > best - 0.3) { if (P[i + 1] < lo) lo = P[i + 1]; if (P[i + 1] > hi) hi = P[i + 1]; }
  return { x: best, y: (lo + hi) / 2 };
}

/** How far the barrel of a gun of this calibre sticks out of the wing's leading edge (m). */
const stick = (cal) => (cal >= 20 ? 0.5 : cal >= 12 ? 0.36 : 0.2);

const cache = new Map();
/**
 * The muzzles of the fixed guns of a type, group by group in the order of its row in FIXED_GUNS: [{ conv, cal, mount, guns: [{ x, y, z, side }] }]. Empty for a type with none.
 * (The place of the muzzle: a wing gun at the end of the barrel that sticks out of the leading edge, a gun over the engine at the front edge of the upper cowling, a hub gun at the
 * tip of the spinner.)
 */
export function fixedMuzzles(spec, key) {
  let out = cache.get(key);
  if (out) return out;
  const fit = FIXED_GUNS[key] || [];
  const noseX = spec.L * 0.42, e = spec.engine, er = e ? e.r : 0.6;
  out = fit.map((g) => {
    const guns = [];
    const cal = CAL[g.gun] || 7.7;
    if (g.mount === 'wing') {
      for (const z of g.z) for (const sg of [-1, 1]) {
        const le = (spec.v4 && modelLE(spec, z)) || wingLE(spec, z);
        guns.push({ x: le.x + stick(cal), y: le.y, z: sg * z, side: sg });
      }
    } else if (g.mount === 'cowl') {
      for (const z of g.z) guns.push({ x: noseX - 0.4, y: Math.sqrt(Math.max(0.01, (er * 0.97) ** 2 - z * z)), z, side: Math.sign(z) });
    } else if (g.mount === 'hub') {
      guns.push({ x: noseX + 0.06, y: 0, z: 0, side: 0 });
    } else if (g.mount === 'fus') {
      for (const z of g.z) guns.push({ x: noseX - 0.9, y: er * 0.55, z, side: Math.sign(z) });
    } else if (g.mount === 'at') {
      const F = spec.engines ? frameOf(spec) : null;
      for (const [d, y, z] of g.at) guns.push({ x: F ? F.X(d) : noseX - d, y, z, side: 0 });
    }
    return { conv: g.conv ?? 250, mount: g.mount, guns };
  });
  cache.set(key, out);
  return out;
}

/** Draw the barrels of the fixed guns that belong to `part` ('whole', 'body', 'wingL', 'wingR') into the builder. */
export function drawFixedGuns(b, spec, key, part) {
  const fit = FIXED_GUNS[key];
  if (!fit) return;
  const mz = fixedMuzzles(spec, key), dark = rgb('#26282b'), steel = rgb('#3a3d40');
  fit.forEach((g, i) => {
    if (g.drawn) return;      // (the model has the barrels of its guns: they are one of its pieces)
    const cal = CAL[g.gun] || 7.7, D = gunDims(cal);
    for (const m of mz[i].guns) {
      const wing = g.mount === 'wing';
      if (part !== 'whole' && (wing ? part !== (m.side < 0 ? 'wingL' : 'wingR') : part !== 'body')) continue;
      if (wing) {
        // the barrel in its jacket comes out of the leading edge; a cannon has a muzzle brake, a .50 a flash hider
        const x1 = m.x, x0 = m.x - stick(cal) - 0.25;
        b.rod(x0, x1, m.y, m.z, D.r * 1.3, D.r * 1.15, steel, MAT.DARK, { seg: 6 });
        if (D.brake) b.rod(x1 - 0.1, x1 + 0.02, m.y, m.z, D.r * 2.0, D.r * 2.0, dark, MAT.DARK, { seg: 6 });
        else if (cal >= 12) b.rod(x1 - 0.06, x1 + 0.03, m.y, m.z, D.r * 0.8, D.r * 1.15, dark, MAT.DARK, { seg: 6 });
      } else if (g.mount === 'hub') {
        b.rod(m.x - 0.18, m.x + 0.1, m.y, m.z, D.r * 0.9, D.r * 0.8, dark, MAT.DARK, { seg: 6 });          // the barrel of the cannon comes out of the tip of the spinner
      } else {
        // a gun firing through the propeller: the muzzle in a trough of the upper cowling
        b.box(m.x - 0.12, m.y, m.z, 0.5, 0.05, 0.12, dark, MAT.DARK);
        b.rod(m.x - 0.3, m.x + 0.05, m.y + 0.03, m.z, D.r * 1.1, D.r, steel, MAT.DARK, { seg: 6 });
      }
    }
  });
}
