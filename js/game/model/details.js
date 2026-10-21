// Fine detail for the ship models: lifelines, boats on their davits, life rafts, ventilators, anchors and hawse pipes, rigging,
// searchlight platforms, depth charge racks, carrier catwalks. Everything here is built into the 'fine' group of the model, which
// the renderer only draws when the ship is close enough for the detail to be visible (see ShipVisuals).
import { MAT, rgb, shade } from './meshbuilder.js';

const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);

/** Lifelines: stanchions every `step` metres and two wires, along the deck edge between x0 and x1. */
export function lifelines(b, hull, x0, x1, pal, o = {}) {
  const col = shade(rgb(pal.hull), 1.35);
  const step = o.step ?? 2.7, base = o.base ?? 0.9, h = o.h ?? 1.0;
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  for (const sg of [-1, 1]) {
    let p1 = null, p2 = null;
    for (let x = lo; x <= hi; x += step) {
      const hb = hull.halfBeamDeck(x) - 0.22;
      if (hb < 0.8) { p1 = p2 = null; continue; }
      const y = hull.deckY(x) - 0.3 + base;
      b.beam([x, y, hb * sg], [x, y + h, hb * sg], 0.05, 0.05, col, MAT.HULL, { caps: false });
      const a = [x, y + h * 0.5, hb * sg], c = [x, y + h, hb * sg];
      if (p1) { b.beam(p1, a, 0.03, 0.03, col, MAT.HULL, { caps: false }); b.beam(p2, c, 0.035, 0.035, col, MAT.HULL, { caps: false }); }
      p1 = a; p2 = c;
    }
  }
}

/** Railing around a rectangle on a roof / platform (centre x,z, half sizes, at height y). */
export function roofRail(b, x, y, z, hx, hz, col, o = {}) {
  const h = o.h ?? 0.9, n = o.n ?? Math.max(2, Math.round((hx + hz) / 0.9));
  const pts = [[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz], [x - hx, z - hz]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    if (o.skip === s) continue;
    b.beam([ax, y + h, az], [bx, y + h, bz], 0.05, 0.05, col, MAT.HULL, { caps: false });
    b.beam([ax, y + h * 0.5, az], [bx, y + h * 0.5, bz], 0.035, 0.035, col, MAT.HULL, { caps: false });
    const cnt = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.1));
    for (let i = 0; i < cnt; i++) {
      const t = i / cnt;
      b.beam([ax + (bx - ax) * t, y, az + (bz - az) * t], [ax + (bx - ax) * t, y + h, az + (bz - az) * t], 0.04, 0.04, col, MAT.HULL, { caps: false });
    }
  }
}

/** Ship's boat on cradles: flared hull, thwarts, an optional cabin, and a davit at each end. */
export function launch(b, o, pal) {
  const col = rgb(o.col || pal.boat || '#8b8f90'), inner = shade(col, 0.55);
  const l = o.len ?? 9, w = l * 0.17;
  b.push().translate(o.x, o.y, o.z || 0).rotateY(o.yaw || 0);
  const poly = [[-l / 2, -w * 0.8], [-l / 2, w * 0.8], [l * 0.18, w], [l / 2, 0.18 * w], [l * 0.18, -w]];
  b.prism(poly, 0, l * 0.13, shade(col, 0.95), MAT.HULL, { topScale: 1.1, bottom: true });
  // gunwale and inside
  b.prism(poly.map(([x, z]) => [x * 0.96, z * 0.78]), l * 0.12, l * 0.135, inner, MAT.CANVAS, { topScale: 1 });
  for (const tx of [-0.28, 0.0, 0.26]) b.box(l * tx, l * 0.145, 0, 0.16, 0.08, w * 1.5, shade(col, 1.15), MAT.HULL);
  if (o.cabin) b.block({ x0: -l * 0.18, x1: l * 0.14, hw: w * 0.62, y0: l * 0.13, y1: l * 0.13 + l * 0.12, tx1: l * 0.1, thw: w * 0.55 }, shade(col, 1.08), MAT.HULL);
  // cradle
  for (const tx of [-0.3, 0.25]) b.box(l * tx, -0.12, 0, 0.12, 0.24, w * 2.2, rgb(pal.dark), MAT.DARK);
  b.pop();
  // davit arms (two, curved inboard)
  if (o.davits) {
    const dc = shade(rgb(pal.sup), 0.85);
    for (const dx of [-0.36, 0.32]) for (const sg of [-1, 1]) {
      const px = o.x + Math.cos(o.yaw || 0) * l * dx, pz = (o.z || 0) + sg * w * 1.55;
      b.beam([px, o.y - 0.2, pz], [px, o.y + l * 0.24, pz], 0.1, 0.1, dc, MAT.HULL, { caps: false });
      b.beam([px, o.y + l * 0.24, pz], [px, o.y + l * 0.26, pz - sg * w * 1.1], 0.08, 0.08, dc, MAT.HULL, { caps: false });
    }
  }
}

/** Carley float (life raft): a flat oval ring with a net floor. */
export function raft(b, x, y, z, yaw, pal, s = 1) {
  const col = rgb('#b9a98a');
  b.push().translate(x, y, z).rotateY(yaw || 0);
  b.cyl(0, 0, 0, 1.15 * s, 0.55 * s, 1.15 * s, 0.55 * s, 0.34 * s, col, MAT.CANVAS, { seg: 10, capBottom: true });
  b.cyl(0, 0.34 * s, 0, 0.85 * s, 0.36 * s, 0.85 * s, 0.36 * s, 0.37 * s, shade(col, 0.5), MAT.CANVAS, { seg: 8 });
  b.pop();
}

/** Cowl ventilator. */
export function vent(b, x, y, z, yaw, pal, s = 1) {
  const col = shade(rgb(pal.sup), 0.95);
  b.cylinder(x, y, z, 0.26 * s, 0.22 * s, y + 0.75 * s, col, MAT.HULL, { seg: 6 });
  b.push().translate(x, y + 0.75 * s, z).rotateY(yaw || 0);
  b.cyl(0, 0, 0, 0.42 * s, 0.42 * s, 0.34 * s, 0.34 * s, 0.34 * s, shade(col, 0.8), MAT.DARK, { seg: 8, dx: 0.12 * s, capTop: false });
  b.cyl(0.1 * s, 0.34 * s, 0, 0.34 * s, 0.34 * s, 0.14 * s, 0.14 * s, 0.68 * s, col, MAT.HULL, { seg: 8 });
  b.pop();
}

/** Stockless anchor stowed in its hawse pipe on the side of the bow. */
export function anchorAndHawse(b, hull, x, y, pal) {
  const dark = rgb(pal.dark), steel = shade(rgb(pal.dark), 1.7);
  for (const sg of [-1, 1]) {
    const z = hull.sideZ(x, y) + 0.05;
    b.box(x, y, sg * z, 1.0, 1.0, 0.16, shade(dark, 0.7), MAT.DARK);                           // hawse pipe mouth
    b.box(x - 0.8, y - 0.9, sg * (z + 0.22), 0.34, 2.4, 0.34, steel, MAT.DARK);                // shank
    b.box(x - 0.8, y - 2.0, sg * (z + 0.22), 1.7, 0.3, 0.3, steel, MAT.DARK);                 // arms
    b.box(x - 1.55, y - 1.85, sg * (z + 0.22), 0.5, 0.5, 0.4, steel, MAT.DARK);               // flukes
    b.box(x + 0.05, y - 1.85, sg * (z + 0.22), 0.5, 0.5, 0.4, steel, MAT.DARK);
  }
}

/** Standing rigging: thin stays between two points. */
export function stay(b, p0, p1, col, w = 0.06) {
  b.beam(p0, p1, w, w, col, MAT.HULL, { caps: false });
}

/** Depth charge racks at the stern: two tracks of drums plus a couple of K-gun projectors. */
export function depthCharges(b, hull, x, pal) {
  const dark = rgb(pal.dark), body = rgb('#5a5e60');
  const y = hull.deckY(x);
  for (const sg of [-1, 1]) {
    const z = sg * hull.halfBeamDeck(x) * 0.55;
    b.box(x, y + 0.2, z, 4.2, 0.2, 0.9, dark, MAT.DARK);
    for (let i = 0; i < 6; i++) b.rod(x - 1.9 + i * 0.7, x - 1.9 + i * 0.7 + 0.55, y + 0.75, z, 0.27, 0.27, body, MAT.HULL, { seg: 6 });
  }
  for (const sg of [-1, 1]) {
    const z = sg * hull.halfBeamDeck(x - 4) * 0.8;
    for (let i = 0; i < 2; i++) {
      b.cylinder(x - 4 - i * 2.6, y, z, 0.3, 0.26, y + 0.55, dark, MAT.DARK, { seg: 6 });
      b.beam([x - 4 - i * 2.6, y + 0.55, z], [x - 4 - i * 2.6 + 0.2, y + 1.15, z + sg * 0.3], 0.14, 0.14, dark, MAT.DARK);
    }
  }
}

/** Mooring bitts, fairleads and a capstan on a stretch of deck. */
export function mooring(b, hull, x0, x1, pal, count = 6) {
  const dark = rgb(pal.dark), col = shade(rgb(pal.sup), 0.85);
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * (i + 0.5) / count;
    for (const sg of [-1, 1]) {
      const z = sg * (hull.halfBeamDeck(x) - 0.65), y = hull.deckY(x);
      b.cylinder(x, y, z, 0.17, 0.2, y + 0.5, col, MAT.HULL, { seg: 6 });
      b.cylinder(x + 0.55, y, z, 0.17, 0.2, y + 0.5, col, MAT.HULL, { seg: 6 });
      b.box(x + 0.27, y + 0.5, z, 0.75, 0.1, 0.2, col, MAT.HULL);
    }
  }
  const xm = (x0 + x1) / 2, ym = hull.deckY(xm);
  b.cylinder(xm, ym, 0, 0.55, 0.45, ym + 0.8, dark, MAT.DARK, { seg: 8 });
}

/** Ship's side rubbing strake / fender: a thin projecting band along the hull between x0 and x1 at height y. */
export function rubbingStrake(b, hull, x0, x1, y, pal) {
  const col = shade(rgb(pal.hull), 0.7);
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  for (const sg of [-1, 1]) {
    let prev = null;
    for (let x = lo; x <= hi; x += 4) {
      const p = [x, y, sg * (hull.sideZ(x, y) + 0.09)];
      if (prev) b.beam(prev, p, 0.16, 0.1, col, MAT.HULL, { caps: false });
      prev = p;
    }
  }
}

/** Flight-deck safety nets / catwalks along both edges of a carrier deck. */
export function deckNets(b, x0, x1, hw, y, pal) {
  const col = rgb('#262b2e');
  for (const sg of [-1, 1]) {
    for (let x = x0 + 4; x < x1 - 8; x += 5) {
      b.beam([x, y - 0.2, sg * (hw + 0.05)], [x, y + 0.35, sg * (hw + 0.9)], 0.05, 0.05, col, MAT.HULL, { caps: false });
      b.beam([x, y + 0.35, sg * (hw + 0.9)], [x + 5, y + 0.35, sg * (hw + 0.9)], 0.04, 0.04, col, MAT.HULL, { caps: false });
    }
    b.block({ x0: x0 + 4, x1: x1 - 8, hw: 0.45, zc: sg * (hw + 0.45), y0: y - 0.3, y1: y - 0.18 }, col, MAT.CANVAS);
  }
}

/** Hangar-side openings (dark rectangles with a frame) on the hull of an open-hangar carrier. */
export function hangarOpenings(b, hull, x0, x1, y0, y1, pal) {
  const dark = shade(rgb(pal.dark), 0.6), frame = shade(rgb(pal.hull), 1.15);
  const n = Math.max(3, Math.round((x1 - x0) / 17));
  for (const sg of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i + 0.5) / n;
    const z = hull.sideZ(x, (y0 + y1) / 2) + 0.05;
    b.box(x, (y0 + y1) / 2, sg * z, (x1 - x0) / n * 0.7, y1 - y0, 0.14, dark, MAT.DARK);
    b.box(x, y1 + 0.12, sg * (z + 0.03), (x1 - x0) / n * 0.74, 0.18, 0.12, frame, MAT.HULL);
  }
}

/** A ladder up the side of a funnel / mast: two rails and rungs. */
export function ladder(b, x, y0, y1, z, col, side = 1) {
  b.beam([x, y0, z - 0.18], [x, y1, z - 0.18], 0.04, 0.04, col, MAT.HULL, { caps: false });
  b.beam([x, y0, z + 0.18], [x, y1, z + 0.18], 0.04, 0.04, col, MAT.HULL, { caps: false });
  for (let y = y0 + 0.4; y < y1; y += 0.5) b.beam([x, y, z - 0.18], [x, y, z + 0.18], 0.03, 0.03, col, MAT.HULL, { caps: false });
}
