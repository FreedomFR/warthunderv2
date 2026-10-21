// Reusable ship parts. All functions draw into a MeshBuilder in model space
// (+x bow, +y up from the waterline, +z starboard). `pal` is the ship palette
// { hull, deck, sup, dark, funnel, cap, mast, boat, glass }.
import { MAT, rgb, shade } from './meshbuilder.js';
import { drawPlane, floatplaneSpec } from './planes.js';
import { glyphIndex } from './glyphs.js';
import { roofRail } from './details.js';

const PI = Math.PI;

/** Build options: flags: false leaves out ensigns and pennants (the plan checks compare bare silhouettes). */
export const OPT = { flags: true };

/** Fixed barbette (the rotating turret sits on top of it). Returns the top y. */
export function barbette(b, x, z, r, y0, y1, col) {
  b.cylinder(x, y0, z, r, r * 0.98, y1, rgb(col), MAT.HULL, { seg: 20 });
  return y1;
}

/**
 * Oval funnel. o: { x, z, y0, h, lx, lz, topLx, topLz, rake, cap, col, capCol, band, seg, trunk, capSlope, pipes }
 * lx/lz are full lengths at the base; rake = how far the top is shifted aft (m); capSlope = how much lower the after edge of the top
 * is than its forward edge (a hooded cap, m); pipes: false leaves out the steam pipes.
 */
export function funnel(b, o, pal) {
  const col = rgb(o.col || pal.funnel), cap = rgb(o.capCol || pal.cap);
  const z = o.z || 0;
  const tlx = o.topLx ?? o.lx * 0.88, tlz = o.topLz ?? o.lz * 0.88;
  const capH = o.cap ?? Math.max(1.2, o.h * 0.1);
  const rake = o.rake || 0;
  // trunk (wider base blending into the deck house)
  if (o.trunk !== false) b.cyl(o.x, o.y0, z, o.lx * 0.6, o.lz * 0.6, o.lx * 0.5, o.lz * 0.5, o.y0 + o.h * 0.22, shade(col, 0.95), MAT.HULL, { seg: o.seg || 20, capTop: false, dx: -rake * 0.2 });
  b.cyl(o.x, o.y0 + o.h * 0.2, z, o.lx * 0.5, o.lz * 0.5, tlx * 0.5, tlz * 0.5, o.y0 + o.h - capH, col, MAT.HULL, { seg: o.seg || 20, capTop: false, dx: -rake * 0.8 });
  // black cap
  const cx = o.x - rake * 0.8;
  const topY = o.y0 + o.h - capH;
  if (o.capSlope) slopedTop(b, cx - rake * 0.2, z, tlx * 0.5, tlz * 0.5, topY - o.capSlope, o.y0 + o.h, o.capSlope, col, cap, o.seg || 20);
  else b.cyl(cx, topY, z, tlx * 0.5, tlz * 0.5, tlx * 0.5 * 0.98, tlz * 0.5 * 0.98, o.y0 + o.h, cap, MAT.DARK, { seg: o.seg || 20, dx: -rake * 0.2, topCol: shade(cap, 0.5) });
  // band (e.g. national / fleet marking)
  if (o.band) {
    const [f0, f1, bc] = o.band;
    const yb0 = o.y0 + o.h * f0, yb1 = o.y0 + o.h * f1;
    const t0 = (yb0 - (o.y0 + o.h * 0.2)) / (o.h * 0.8 - capH), t1 = (yb1 - (o.y0 + o.h * 0.2)) / (o.h * 0.8 - capH);
    const lerp = (a, c, t) => a + (c - a) * t;
    const r0x = lerp(o.lx * 0.5, tlx * 0.5, t0) * 1.01, r0z = lerp(o.lz * 0.5, tlz * 0.5, t0) * 1.01;
    const r1x = lerp(o.lx * 0.5, tlx * 0.5, t1) * 1.01, r1z = lerp(o.lz * 0.5, tlz * 0.5, t1) * 1.01;
    b.cyl(o.x - rake * 0.8 * t0, yb0, z, r0x, r0z, r1x, r1z, yb1, rgb(bc), MAT.HULL, { seg: o.seg || 20, capTop: false, dx: -rake * 0.8 * (t1 - t0) });
  }
  // steam pipes / siren platform on the after side
  if (o.pipes !== false && !o.capSlope) {
    for (const sz of [-1, 1]) b.cylinder(o.x - o.lx * 0.52 - rake * 0.4, o.y0 + o.h * 0.35, z + sz * o.lz * 0.18, 0.28, 0.24, o.y0 + o.h * 0.96, shade(col, 0.8), MAT.HULL, { seg: 6 });
  }
}

/** The top of a hooded funnel: an oval casing whose rim slopes down from the forward edge (yTop) to the after edge (yTop - drop),
 *  a dark band under the rim and the dark opening. */
function slopedTop(b, cx, z, rx, rz, y0, yTop, drop, col, cap, seg) {
  const rim = (c) => yTop - drop * (1 - c) / 2;                 // c = cos(angle): +1 forward, -1 aft
  const ring = [];
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; ring.push([Math.cos(a), Math.sin(a)]); }
  const ref = [cx, (y0 + yTop) / 2, z];
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = ring[i], [c1, s1] = ring[i + 1];
    const p0 = [cx + c0 * rx, y0, z + s0 * rz], p1 = [cx + c1 * rx, y0, z + s1 * rz];
    const t0 = [cx + c0 * rx, rim(c0) - 0.9, z + s0 * rz], t1 = [cx + c1 * rx, rim(c1) - 0.9, z + s1 * rz];
    const u0 = [cx + c0 * rx * 1.01, rim(c0), z + s0 * rz * 1.01], u1 = [cx + c1 * rx * 1.01, rim(c1), z + s1 * rz * 1.01];
    b.quad(p0, p1, t1, t0, col, MAT.HULL, ref);
    b.quad(t0, t1, u1, u0, cap, MAT.DARK, ref);
    b.triFlat([cx, (yTop + yTop - drop) / 2 - 0.05, z], u0, u1, shade(cap, 0.5), MAT.DARK, [cx, y0, z]);
  }
}

/** Wrecked funnel: a charred, torn stump on the uptake trunk. Same options as funnel(). */
export function funnelRuin(b, o, pal) {
  const z = o.z || 0;
  const burnt = shade(rgb(pal.dark), 1.2), rust = shade(rgb(pal.funnel), 0.45);
  b.cyl(o.x, o.y0, z, o.lx * 0.6, o.lz * 0.6, o.lx * 0.5, o.lz * 0.5, o.y0 + o.h * 0.22, rust, MAT.HULL, { seg: o.seg || 16, capTop: false, dx: -(o.rake || 0) * 0.2 });
  // jagged remains of the casing, torn open on one side
  const top = o.y0 + o.h * 0.22;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, h = o.h * (0.04 + 0.1 * ((i * 37) % 7) / 7);
    const px = o.x + Math.cos(a) * o.lx * 0.46, pz = z + Math.sin(a) * o.lz * 0.46;
    b.box(px, top + h / 2, pz, 0.5, h, 0.9, i % 2 ? burnt : rust, MAT.HULL);
  }
  b.cyl(o.x - (o.rake || 0) * 0.1, top, z, o.lx * 0.44, o.lz * 0.44, o.lx * 0.4, o.lz * 0.4, top + 0.25, shade(burnt, 0.5), MAT.DARK, { seg: o.seg || 16 });
}

/** Window strip along a face: thin dark boxes slightly proud of the surface. */
export function windowBand(b, x0, x1, hw, y, h, pal, front = true, sides = true) {
  const gl = rgb(pal.glass || '#101820');
  if (front) b.block({ x0: x1 - 0.02, x1: x1 + 0.07, hw: hw - 0.35, y0: y, y1: y + h }, gl, MAT.GLASS);
  if (sides) {
    for (const sg of [-1, 1]) b.block({ x0: x0 + 0.5, x1: x1 - 0.5, hw: 0.04, zc: sg * (hw + 0.02), y0: y, y1: y + h }, gl, MAT.GLASS);
  }
}

/**
 * Multi-tier bridge structure. tiers: [{ len, w, h, dx, dz, y0, rake, col, round, windows }]; each tier stands on the previous one
 * (or at y0 above the base when given).
 * o: { x, z, y0 } returns { topY, tops: [y per tier] }.
 */
export function tower(b, o, pal) {
  let y = o.y0;
  const tops = [];
  for (const t of o.tiers) {
    if (t.y0 != null) y = o.y0 + t.y0;   // a tier can start at a given height instead of on top of the previous one
    const x = o.x + (t.dx || 0), z = (o.z || 0) + (t.dz || 0);
    const col = rgb(t.col || pal.sup);
    const rake = t.rake ?? 0;
    if (t.round) {
      b.cyl(x, y, z, t.len / 2, t.w / 2, (t.len / 2) * (t.taper ?? 0.92), (t.w / 2) * (t.taper ?? 0.92), y + t.h, col, MAT.HULL, { seg: 16 });
    } else {
      b.block({ x0: x - t.len / 2, x1: x + t.len / 2, hw: t.w / 2, zc: z, y0: y, y1: y + t.h, tx1: x + t.len / 2 - rake, tx0: x - t.len / 2 + (t.rakeAft || 0), thw: t.w / 2 * (t.taperW ?? 1) }, col, MAT.HULL);
      if (t.windows !== false && t.h > 1.8) windowBand(b, x - t.len / 2, x + t.len / 2 - rake * 0.4, t.w / 2 * (t.taperW ?? 1), y + t.h * 0.42, Math.min(t.h * 0.34, 1.1), pal, true, true);
      // roof overhang / wing
      if (t.wings) b.block({ x0: x - t.len * 0.3, x1: x + t.len * 0.25, hw: t.w / 2 + t.wings, y0: y + t.h - 0.25, y1: y + t.h + 0.1 }, shade(col, 0.9), MAT.HULL);
    }
    y += t.h;
    tops.push(y);
  }
  return { topY: y, tops };
}

/** Pole mast with yardarms. o: { x, z, y0, h, r, yards: [[fracHeight, span], ...], top } */
export function poleMast(b, o, pal) {
  const col = rgb(o.col || pal.mast);
  const r = o.r ?? 0.3;
  const sp = o.split ?? 0.62;
  b.cylinder(o.x, o.y0, o.z || 0, r * 1.5, r, o.y0 + o.h * sp, col, MAT.HULL, { seg: 8 });
  b.cylinder(o.x, o.y0 + o.h * sp, o.z || 0, r * 0.9, r * 0.35, o.y0 + o.h, col, MAT.HULL, { seg: 6 });
  for (const [f, span] of (o.yards || [])) b.rodZ(o.x, o.y0 + o.h * f, (o.z || 0) - span / 2, (o.z || 0) + span / 2, 0.07, 0.04, col, MAT.HULL, { seg: 5 });
  // masthead lamp
  b.sphere(o.x, o.y0 + o.h + 0.1, o.z || 0, 0.12, 0.12, 0.12, rgb('#ffe9b0'), MAT.EMISSIVE, { seg: 6, rings: 4 });
}

/** Tripod mast: o: { x, z, y0, h, legSpread, legBack, apexFrac, r, platforms } */
export function tripod(b, o, pal) {
  const col = rgb(o.col || pal.mast);
  const apexY = o.y0 + o.h * (o.apexFrac ?? 0.72);
  const z0 = o.z || 0;
  const sp = o.legSpread ?? 4.5, back = o.legBack ?? 6;
  const w = o.r ?? 0.55;
  const apex = [o.x, apexY, z0];
  const fy = o.feet || [o.y0, o.y0, o.y0];       // the height of the foot of each leg (they may stand on different roofs)
  b.beam([o.x + (o.legFront ?? 2), fy[0], z0 - sp], apex, w, w, col, MAT.HULL);
  b.beam([o.x + (o.legFront ?? 2), fy[1], z0 + sp], apex, w, w, col, MAT.HULL);
  b.beam([o.x - back, fy[2], z0], apex, w, w, col, MAT.HULL);
  b.cylinder(o.x, apexY - 0.5, z0, w * 0.9, w * 0.45, o.y0 + o.h, col, MAT.HULL, { seg: 8 });
  for (const f of (o.platforms || [])) {
    const py = o.y0 + o.h * f;
    b.cyl(o.x, py, z0, 1.7, 1.7, 1.7, 1.7, py + 0.35, shade(col, 1.1), MAT.HULL, { seg: 10 });
  }
  for (const [f, span] of (o.yards || [])) b.rodZ(o.x, o.y0 + o.h * f, z0 - span / 2, z0 + span / 2, 0.08, 0.04, col, MAT.HULL, { seg: 5 });
}

/** Lattice (cage) mast: four corner legs + rings + bracing. */
export function cageMast(b, o, pal) {
  const col = rgb(o.col || pal.mast);
  const z0 = o.z || 0;
  const r0 = o.r0 ?? 2.2, r1 = o.r1 ?? 1.0, h = o.h;
  const lv = 7;
  const pts = (t) => { const r = r0 + (r1 - r0) * t; return [[-r, -r], [r, -r], [r, r], [-r, r]].map(([a, c]) => [o.x + a, o.y0 + h * t, z0 + c]); };
  for (let i = 0; i < lv; i++) {
    const A = pts(i / lv), B2 = pts((i + 1) / lv);
    for (let k = 0; k < 4; k++) {
      b.beam(A[k], B2[k], 0.16, 0.16, col, MAT.HULL, { caps: false });
      b.beam(A[k], A[(k + 1) % 4], 0.1, 0.1, col, MAT.HULL, { caps: false });
      b.beam(A[k], B2[(k + 1) % 4], 0.07, 0.07, col, MAT.HULL, { caps: false });
    }
  }
  if (o.top !== false) b.cylinder(o.x, o.y0 + h, z0, 0.4, 0.12, o.y0 + h + o.h * 0.2, col, MAT.HULL, { seg: 6 });
}

/** Fire-control director. kind: 'box' (US/UK style) | 'drum' (Japanese hooded) | 'dome' */
export function director(b, o, pal) {
  const col = rgb(o.col || pal.sup);
  const x = o.x, y = o.y, z = o.z || 0, w = o.w ?? 3, l = o.l ?? 3, h = o.h ?? 2;
  if (o.kind === 'drum') {
    b.cyl(x, y, z, l / 2, w / 2, l / 2 * 0.9, w / 2 * 0.9, y + h, col, MAT.HULL, { seg: 12 });
    b.rodZ(x, y + h * 0.6, z - w * 0.9, z + w * 0.9, 0.35, 0.35, shade(col, 0.9), MAT.HULL);
  } else if (o.kind === 'dome') {
    b.cylinder(x, y, z, w / 2, w / 2, y + h * 0.5, col, MAT.HULL, { seg: 12 });
    b.sphere(x, y + h * 0.5, z, w / 2, h * 0.5, w / 2, col, MAT.HULL, { half: true, seg: 12, rings: 6 });
  } else {
    b.block({ x0: x - l / 2, x1: x + l / 2, hw: w / 2, zc: z, y0: y, y1: y + h, tx1: x + l / 2 - h * 0.2, thw: w / 2 * 0.92 }, col, MAT.HULL);
    b.block({ x0: x + l * 0.2, x1: x + l / 2 + 0.05, hw: w * 0.3, zc: z, y0: y + h * 0.5, y1: y + h * 0.82 }, rgb(pal.glass || '#101820'), MAT.GLASS);
    b.rodZ(x - l * 0.1, y + h * 0.55, z - w * 0.85, z + w * 0.85, 0.18, 0.18, shade(col, 0.85), MAT.HULL);   // rangefinder
  }
  if (o.radar !== false) b.box(x - l * 0.1, y + h + 0.2, z, l * 0.5, 0.4, w * 0.6, shade(col, 1.1), MAT.HULL);
}

/** Radar antennas. kind: 'bedspring' (air search), 'dish' (surface search), 'yagi', 'box' */
export function radar(b, o, pal) {
  const col = rgb(o.col || pal.dark);
  const x = o.x, y = o.y, z = o.z || 0;
  if (o.kind === 'dish') {
    b.cylinder(x, y, z, 0.18, 0.15, y + 0.9, col, MAT.HULL, { seg: 6 });
    b.sphere(x, y + 1.1, z, 0.9, 0.7, 0.9, shade(col, 1.3), MAT.HULL, { half: true, seg: 10, rings: 6 });
  } else if (o.kind === 'box') {
    b.box(x, y + 0.6, z, 1.6, 1.2, 2.4, shade(col, 1.4), MAT.HULL);
  } else if (o.kind === 'yagi') {
    b.cylinder(x, y, z, 0.1, 0.1, y + 1.2, col, MAT.HULL, { seg: 5 });
    b.beam([x - 0.8, y + 1.2, z], [x + 0.8, y + 1.2, z], 0.08, 0.08, col, MAT.HULL);
    for (let i = -2; i <= 2; i++) b.beam([x + i * 0.35, y + 1.2, z - 0.7], [x + i * 0.35, y + 1.2, z + 0.7], 0.05, 0.05, col, MAT.HULL);
  } else {   // bedspring: large frame with slats
    const w = o.w ?? 5.5, hgt = o.h ?? 2.4;
    b.cylinder(x, y, z, 0.2, 0.18, y + 0.8, col, MAT.HULL, { seg: 6 });
    const yy = y + 0.8;
    for (const sz of [-1, 1]) b.beam([x, yy, z + sz * w / 2], [x, yy + hgt, z + sz * w / 2], 0.1, 0.1, col, MAT.HULL, { caps: false });
    for (const sy of [0, 1]) b.beam([x, yy + sy * hgt, z - w / 2], [x, yy + sy * hgt, z + w / 2], 0.1, 0.1, col, MAT.HULL, { caps: false });
    for (let i = 1; i < 7; i++) b.beam([x, yy + hgt * i / 7, z - w / 2], [x, yy + hgt * i / 7, z + w / 2], 0.05, 0.05, col, MAT.HULL, { caps: false });
    b.block({ x0: x - 0.35, x1: x - 0.2, hw: w / 2 - 0.1, zc: z, y0: yy + 0.1, y1: yy + hgt - 0.1 }, shade(col, 0.8), MAT.HULL);
  }
}

/** Searchlight on a short pedestal */
export function searchlight(b, x, y, z, r, pal) {
  b.cylinder(x, y, z, r * 0.45, r * 0.4, y + r * 1.2, rgb(pal.dark), MAT.HULL, { seg: 6 });
  b.cyl(x, y + r * 1.2, z, r, r, r, r, y + r * 2.4, shade(rgb(pal.sup), 0.8), MAT.HULL, { seg: 10 });
}

/** Round gun tub / sponson. */
export function tub(b, x, y, z, r, h, pal) {
  b.cylinder(x, y, z, r, r * 1.05, y + h, shade(rgb(pal.sup), 0.92), MAT.HULL, { seg: 12 });
  b.cylinder(x, y + h, z, r * 1.08, r * 1.08, y + h + 0.18, shade(rgb(pal.sup), 0.8), MAT.HULL, { seg: 12 });
}

/**
 * Screw propeller on a horizontal shaft. o: { x, y, z, d (diameter), blades, hand (+1 / -1), col }
 * Hub with a cone aft, blades with a rounded outline, pitched about 30 degrees, drawn on both faces.
 */
export function propeller(b, o) {
  const col = rgb(o.col || '#a8834a'), r = o.d / 2, hub = r * 0.2, n = o.blades || 4, hand = o.hand || 1;
  b.rod(o.x - r * 0.45, o.x - r * 0.12, o.y, o.z, hub * 0.25, hub, col, MAT.HULL, { seg: 12 });     // cone
  b.rod(o.x - r * 0.12, o.x + r * 0.22, o.y, o.z, hub, hub * 0.9, col, MAT.HULL, { seg: 12 });      // hub
  const pitch = 0.55, cp = Math.cos(pitch), sp = Math.sin(pitch) * hand;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (o.phase || 0);
    const ux = 0, uy = Math.cos(a), uz = Math.sin(a), vy = -Math.sin(a), vz = Math.cos(a);
    const secs = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, rr = hub * 0.9 + (r - hub * 0.9) * t;
      const c = r * 0.62 * Math.sin(Math.PI * (0.18 + 0.72 * t)) * (1 - 0.35 * t);   // chord: widest two thirds out, rounded tip
      const cx = o.x, cy = o.y + uy * rr, cz = o.z + uz * rr;
      const dx = sp * c / 2, dy = vy * cp * c / 2, dz = vz * cp * c / 2;
      secs.push([[cx + dx, cy + dy, cz + dz], [cx - dx, cy - dy, cz - dz]]);
    }
    for (let k = 0; k < 5; k++) {
      const [a0, b0] = secs[k], [a1, b1] = secs[k + 1];
      b.quad(a0, a1, b1, b0, col, MAT.HULL);
      b.quad(b0, b1, a1, a0, shade(col, 0.85), MAT.HULL);
    }
  }
}

/** Rudder: a thick plate with rounded leading and trailing edges. o: { x (centre), z, y0 (bottom), y1 (top), chord, t } */
export function rudder(b, o, pal) {
  const col = rgb(o.col || pal.boot || '#5a2a22'), t = o.t ?? 0.45;
  b.block({ x0: o.x - o.chord / 2, x1: o.x + o.chord / 2, hw: t, zc: o.z || 0, y0: o.y0, y1: o.y1, tx0: o.x - o.chord / 2 + Math.min(0.3, o.chord * 0.3), tx1: o.x + o.chord / 2 - Math.min(0.2, o.chord * 0.2) }, col, MAT.HULL);
  const sr = Math.min(0.35, t * 0.8);
  b.cylinder(o.x + o.chord * 0.25, o.y1, o.z || 0, sr, sr, o.y1 + (o.stock ?? 2.5), shade(col, 0.8), MAT.HULL, { seg: 8 });   // stock into the hull
}

/** Cargo / aircraft crane on the quarterdeck. */
export function crane(b, o, pal) {
  const col = rgb(pal.mast);
  const x = o.x, y0 = o.y0, z = o.z || 0;
  b.cylinder(x, y0, z, 0.5, 0.4, y0 + (o.h ?? 6), col, MAT.HULL, { seg: 8 });
  const ang = o.angle ?? 0.9;
  const top = [x, y0 + (o.h ?? 6), z];
  const tip = [x + (o.dir ?? -1) * Math.cos(ang) * (o.len ?? 14), y0 + (o.h ?? 6) + Math.sin(ang) * (o.len ?? 14) * 0.7, z + (o.side || 0) * (o.len ?? 14) * 0.3];   // dir: +1 = boom towards the bow
  b.beam(top, tip, o.w ?? 0.35, o.w ?? 0.35, col, MAT.HULL);
  b.beam([x - 0.3, y0 + 2, z], tip, 0.06, 0.06, rgb('#222'), MAT.DARK);
}

/** Aircraft catapult: two rails with a cradle. dir: heading of the rails in local space. */
export function catapult(b, o, pal) {
  const col = shade(rgb(pal.sup), 0.8);
  b.push().translate(o.x, o.y, o.z || 0).rotateY(o.yaw || 0);
  const l = o.len ?? 20;
  for (const sz of [-0.5, 0.5]) b.block({ x0: -l / 2, x1: l / 2, hw: 0.14, zc: sz, y0: 0, y1: 0.35 }, col, MAT.HULL);
  for (let i = 0; i <= 8; i++) b.box(-l / 2 + i * l / 8, 0.1, 0, 0.18, 0.2, 1.4, col, MAT.HULL);
  b.pop();
}

/** Catapult floatplane (Walrus, Seagull, Arado 196, Rufe...) at its launch position. */
export function floatplane(b, o, pal) {
  b.push().translate(o.x, o.y + 0.3, o.z || 0).rotateY(o.yaw || 0).scale(o.scale ?? 1);
  drawPlane(b, floatplaneSpec(o.nation), { part: 'whole' });
  b.pop();
}

/** Boat / liberty launch on its davits. */
export function boat(b, o, pal) {
  const col = rgb(o.col || pal.boat || '#8b8f90');
  const l = o.len ?? 9;
  b.push().translate(o.x, o.y, o.z || 0).rotateY(o.yaw || 0);
  b.block({ x0: -l / 2, x1: l / 2, hw: l * 0.17, y0: 0, y1: l * 0.14, tx0: -l / 2 + 0.2, tx1: l / 2 + 1.2, thw: l * 0.2 }, col, MAT.HULL);
  b.block({ x0: -l * 0.15, x1: l * 0.15, hw: l * 0.12, y0: l * 0.14, y1: l * 0.14 + 0.5 }, shade(col, 0.85), MAT.CANVAS);
  b.pop();
}

/** Deck railings (top rail + posts) following the deck edge between x0 and x1. */
export function deckRails(b, hull, x0, x1, height, pal, step = 5) {
  const col = shade(rgb(pal.hull), 1.15);
  for (const sg of [-1, 1]) {
    let prev = null;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += step) {
      const hb = Math.max(hull.halfBeamDeck(x) - 0.25, 0.1);
      const y = hull.deckY(x) - 0.25 + 0.9;
      const p = [x, y + height, hb * sg];
      if (prev) b.beam(prev, p, 0.06, 0.05, col, MAT.HULL, { caps: false });
      if (hb > 0.5) b.beam([x, y, hb * sg], p, 0.05, 0.05, col, MAT.HULL, { caps: false });
      prev = p;
    }
  }
}

/** Torpedo tube mount (rotatable in reality; modelled as a static bundle of tubes). */
export function torpedoTubes(b, o, pal) {
  const col = rgb(pal.sup);
  const n = o.n || 4, r = o.r ?? 0.33;
  b.push().translate(o.x, o.y, o.z || 0).rotateY(o.yaw || 0);
  b.block({ x0: -1.2, x1: 1.2, hw: 0.9, y0: 0, y1: 0.35 }, shade(col, 0.85), MAT.HULL);
  const cols = Math.ceil(Math.sqrt(n * 1.2));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols), c = i % cols;
    const zz = (c - (cols - 1) / 2) * r * 2.1, yy = 0.7 + row * r * 2.1;
    b.rod(-(o.len ?? 4.2) / 2, (o.len ?? 4.2) / 2, yy, zz, r, r, shade(col, 1.05), MAT.HULL, { seg: 8 });
  }
  b.pop();
}

/** Scatter small deck fittings (hatches, vents, bollards) between x0 and x1 using `rnd`. */
export function deckClutter(b, hull, x0, x1, count, rnd, pal, zMax = 0.8) {
  const col = shade(rgb(pal.sup), 0.9);
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * rnd();
    const hb = hull.halfBeamDeck(x) * zMax;
    const z = (rnd() * 2 - 1) * hb;
    const y = hull.deckY(x);
    const k = rnd();
    if (k < 0.45) b.box(x, y + 0.12, z, 1.3 + rnd(), 0.24, 1.0 + rnd() * 0.6, shade(rgb(pal.deck), 1.2), MAT.HULL);
    else if (k < 0.8) b.cylinder(x, y, z, 0.28, 0.22, y + 0.8 + rnd() * 0.5, col, MAT.HULL, { seg: 6 });
    else b.cylinder(x, y, z, 0.35, 0.12, y + 1.0, col, MAT.HULL, { seg: 6 });
  }
}

/** Anchor windlass + capstans + chain on the forecastle. */
export function forecastle(b, hull, xBow, pal) {
  const y = hull.deckY(xBow);
  b.cylinder(xBow, y, 0, 0.45, 0.4, y + 0.9, rgb(pal.dark), MAT.DARK, { seg: 8 });
  b.box(xBow - 3, y + 0.25, 0, 2.2, 0.5, 1.6, rgb(pal.dark), MAT.DARK);
  for (const sg of [-1, 1]) b.cylinder(xBow - 1.2, y, sg * 1.7, 0.3, 0.25, y + 0.5, rgb(pal.dark), MAT.DARK, { seg: 6 });
}

/** Flag staff with a team pennant at the stern and the masthead */
/**
 * Diagonal stripes across the weather deck between x0 and x1 (the recognition stripes painted on the forecastle and the quarterdeck of the Italian ships in 1940-42):
 * flat cells that follow the sheer and the camber of the deck. o = { x0, x1 (either order), cols: [a, b], w: stripe width (m), slope: stripe slant }.
 */
export function deckStripes(b, hull, o) {
  const xa = Math.max(o.x0, o.x1), xb = Math.min(o.x0, o.x1);
  if (xa - xb < 3) return;
  const cols = o.cols.map(rgb), w = o.w ?? 2.6, slope = o.slope ?? 0.9, dx = 1.5, SUB = 3;
  const hw = (x) => hull.halfBeamDeck(x) * 0.93;
  const vert = (x, z, col) => { const u = z / (hull.halfBeamDeck(x) || 1); return b.vert(x, hull.deckY(x) - hull.camber * u * u + 0.035, z, 0, 1, 0, col, MAT.DECK, 1); };
  // a stripe is the strip of the deck where s = (distance from the bow end) + slope * z lies in [j w, (j + 1) w]: one trapezoid per slice of the deck, so the edges stay straight
  const nx = Math.ceil((xa - xb) / dx);
  for (let i = 0; i < nx; i++) {
    const xe = xa - i * dx, xn = Math.max(xb, xe - dx);
    const h0 = hw(xe), h1 = hw(xn);
    const sLo = Math.min(xa - xe - slope * h0, xa - xn - slope * h1), sHi = Math.max(xa - xe + slope * h0, xa - xn + slope * h1);
    for (let j = Math.floor(sLo / w); j <= Math.floor(sHi / w); j++) {
      const col = cols[j & 1];
      const zAt = (x, h, sv) => Math.max(-h, Math.min(h, (sv - (xa - x)) / slope));
      const ze0 = zAt(xe, h0, j * w), ze1 = zAt(xe, h0, (j + 1) * w), zn0 = zAt(xn, h1, j * w), zn1 = zAt(xn, h1, (j + 1) * w);
      if (ze1 - ze0 < 0.02 && zn1 - zn0 < 0.02) continue;
      for (let k = 0; k < SUB; k++) {
        const t0 = k / SUB, t1 = (k + 1) / SUB, L = (a, c, t) => a + (c - a) * t;
        const a = vert(xe, L(ze0, ze1, t0), col), c = vert(xn, L(zn0, zn1, t0), col), d = vert(xn, L(zn0, zn1, t1), col), e = vert(xe, L(ze0, ze1, t1), col);
        b.quadIdx(a, c, d, e);
      }
    }
  }
}

export function pennant(b, x, y, z, len, team, flagCol) {
  if (!OPT.flags) return;
  const col = rgb(flagCol);
  b.push().translate(x, y, z);
  b.cylinder(0, 0, 0, 0.06, 0.04, 2.2, rgb('#777'), MAT.HULL, { seg: 5 });
  // streaming pennant (double sided)
  const tip = [-len, 1.9, 0.05];
  const a = [0, 2.2, 0], c = [0, 1.7, 0];
  b.triFlat(a, c, tip, col, MAT.FLAG, null, 1);
  b.triFlat(a, tip, c, col, MAT.FLAG, null, 1);
  b.pop();
}

/**
 * National ensign: a cloth grid streaming aft (-x) from the hoist at (x, y, z), `y` being the top edge. The shader paints the
 * nation's flag from the (u, v) stored in the vertex colour and ripples it. staff: draws a flag staff up to the top edge.
 */
export function ensign(b, o) {
  if (!OPT.flags) return;
  const len = o.len, h = o.h ?? len * 2 / 3, z = o.z || 0;
  const NU = 8, NV = 2;
  const ids = [];
  for (let j = 0; j <= NV; j++) {
    const row = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = j / NV;
      row.push(b.vert(o.x - u * len, o.y - v * h, z, 0, 0, 1, [u * 255, v * 255, Math.min(255, len * 10)], MAT.ENSIGN, 1));
    }
    ids.push(row);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) b.quadIdx(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
  if (o.staff) {
    b.cylinder(o.x, o.y - h - 0.3, z, 0.07, 0.045, o.y + 0.5, rgb('#d8d4c8'), MAT.HULL, { seg: 6 });
    b.sphere(o.x, o.y + 0.55, z, 0.08, 0.08, 0.08, rgb('#c9a24a'), MAT.HULL, { seg: 6, rings: 4 });
  }
}

/**
 * Hull number on both sides of the bow. `text` is drawn with the bitmap font (see glyphs.js); the quads follow the flare of the hull.
 */
export function hullNumber(b, hull, text, o) {
  const chars = text.split('');
  const h = o.h, w = h * 5 / 7, gap = w * 0.38;
  const total = chars.length * w + (chars.length - 1) * gap;
  for (const sg of [1, -1]) {
    // starboard reads towards the bow (+x), port towards the stern
    chars.forEach((ch, ci) => {
      const gi = glyphIndex(ch);
      if (gi < 0) return;
      const u0 = ci * (w + gap), u1 = u0 + w;
      const x0 = o.x + sg * (u0 - total / 2), x1 = o.x + sg * (u1 - total / 2);
      const yt = o.y + h / 2, yb = o.y - h / 2;
      const zt = hull.sideZ((x0 + x1) / 2, yt) + 0.08, zb = hull.sideZ((x0 + x1) / 2, yb) + 0.08;
      const col = (u, v) => [gi, u * 255, v * 255];
      const a = b.vert(x0, yt, sg * zt, 0, 0.15, sg, col(0, 0), MAT.GLYPH, 1);
      const c = b.vert(x1, yt, sg * zt, 0, 0.15, sg, col(1, 0), MAT.GLYPH, 1);
      const d = b.vert(x1, yb, sg * zb, 0, 0.15, sg, col(1, 1), MAT.GLYPH, 1);
      const e = b.vert(x0, yb, sg * zb, 0, 0.15, sg, col(0, 1), MAT.GLYPH, 1);
      b.quadIdx(e, d, c, a);
    });
  }
}

/** A hoist of signal flags hanging from a yardarm. */
export function signalHoist(b, x, y, z, n, seed = 0) {
  const cols = ['#b3202a', '#e8e4d8', '#1d3f8a', '#e0b92a', '#202428', '#e8e4d8', '#2a7a3a', '#b3202a'];
  b.beam([x, y, z], [x, y - n * 0.62 - 0.2, z], 0.025, 0.025, rgb('#444'), MAT.HULL, { caps: false });
  for (let i = 0; i < n; i++) {
    const c = rgb(cols[(i * 3 + seed) % cols.length]);
    const y0 = y - 0.1 - i * 0.62;
    const ph = (i + seed) * 0.9;
    // a slightly rippled square flag
    b.quad([x, y0, z], [x - 0.55, y0 - 0.02, z + 0.05 * Math.sin(ph)], [x - 0.55, y0 - 0.5, z + 0.07 * Math.sin(ph + 1)], [x, y0 - 0.5, z], c, MAT.CANVAS, null, 1);
  }
}

/** Detail of the bridge tower (drawn when close): window mullions, roof rails, searchlights, a ladder and flag hoists. */
export function towerDetail(b, o, pal) {
  const rail = shade(rgb(pal.sup), 1.25), mull = shade(rgb(pal.sup), 0.8);
  let y = o.y0;
  o.tiers.forEach((t, i) => {
    const x = o.x + (t.dx || 0), z = o.z || 0, hw = t.w / 2;
    // mullions between the panes of the window band
    if (t.windows !== false && t.h > 1.8 && !t.round) {
      const wy = y + t.h * 0.42, wh = Math.min(t.h * 0.34, 1.1);
      for (let mx = x - t.len / 2 + 1.0; mx < x + t.len / 2 - 0.8; mx += 1.15) for (const sg of [-1, 1]) b.box(mx, wy + wh / 2, z + sg * (hw + 0.06), 0.09, wh, 0.06, mull, MAT.HULL);
      for (let mz = -hw + 0.8; mz < hw - 0.5; mz += 1.0) b.box(x + t.len / 2 - (t.rake || 0) * 0.4 + 0.1, wy + wh / 2, z + mz, 0.06, wh, 0.08, mull, MAT.HULL);
    }
    const top = y + t.h;
    // open wings: railing + two searchlights
    if (t.wings) {
      const wl = t.len * 0.55, ww = hw + t.wings;
      roofRail(b, x - t.len * 0.025, top + 0.1, z, wl / 2, ww, rail, { h: 0.9 });
      for (const sg of [-1, 1]) {
        b.cylinder(x + t.len * 0.12, top + 0.1, z + sg * (ww - 0.5), 0.1, 0.08, top + 0.55, rgb(pal.dark), MAT.DARK, { seg: 5 });
        b.cyl(x + t.len * 0.12, top + 0.55, z + sg * (ww - 0.5), 0.36, 0.36, 0.36, 0.36, top + 1.05, shade(rgb(pal.sup), 0.85), MAT.HULL, { seg: 8 });
        b.box(x + t.len * 0.12 + 0.4, top + 0.8, z + sg * (ww - 0.5), 0.1, 0.34, 0.34, rgb('#cfd3c4'), MAT.EMISSIVE);
      }
    } else if (i === o.tiers.length - 1) {
      roofRail(b, x, top, z, t.len * 0.45, hw * 0.9, rail, { h: 0.85 });
    }
    y = top;
  });
  // vertical ladder on the front of the first tier
  const t0 = o.tiers[0], r1 = rgb(pal.dark);
  for (const sg of [-1, 1]) {
    const lx = o.x + (t0.dx || 0) - t0.len / 2 - 0.03;
    b.beam([lx, o.y0, sg * (t0.w / 2 - 0.9)], [lx, o.y0 + t0.h, sg * (t0.w / 2 - 0.9)], 0.04, 0.04, r1, MAT.HULL, { caps: false });
  }
}

/** Funnel detail: ladder up the after side, rungs, cap grating. */
export function funnelDetail(b, o, pal) {
  const z = o.z || 0, col = shade(rgb(pal.funnel), 0.7), rake = o.rake || 0;
  const lx = o.x - o.lx * 0.5 - rake * 0.2 - 0.04;
  const y0 = o.y0 + o.h * 0.22, y1 = o.y0 + o.h * 0.92;
  b.beam([lx - rake * 0.35, y0, z - 0.2], [lx - rake * 0.75, y1, z - 0.2], 0.045, 0.045, col, MAT.HULL, { caps: false });
  b.beam([lx - rake * 0.35, y0, z + 0.2], [lx - rake * 0.75, y1, z + 0.2], 0.045, 0.045, col, MAT.HULL, { caps: false });
  for (let y = y0 + 0.5; y < y1; y += 0.55) {
    const f = (y - y0) / (y1 - y0);
    b.beam([lx - rake * (0.35 + 0.4 * f), y, z - 0.2], [lx - rake * (0.35 + 0.4 * f), y, z + 0.2], 0.03, 0.03, col, MAT.HULL, { caps: false });
  }
  // grating across the mouth
  const cx = o.x - rake * 0.8, ty = o.y0 + o.h - 0.1 - (o.capSlope || 0) - (o.capSlope ? 0.4 : 0);
  for (let i = -2; i <= 2; i++) b.beam([cx - o.lx * 0.4, ty, z + i * o.lz * 0.17], [cx + o.lx * 0.4, ty, z + i * o.lz * 0.17], 0.05, 0.05, rgb('#0b0c0d'), MAT.DARK, { caps: false });
}

