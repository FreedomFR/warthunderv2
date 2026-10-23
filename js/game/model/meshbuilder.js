// Procedural mesh builder used to model the warships (no external assets).
//
// Model space: +x = towards the bow, +y = up, +z = starboard (right-handed). Triangles are wound
// counter-clockwise seen from outside. The convex primitives orient themselves automatically
// (they flip a face when it points towards the primitive's own centre), so winding mistakes
// cannot produce inside-out solids.
//
// Packed vertex (24 bytes): f32x3 position, snorm16x4 (normal xyz, ambient occlusion), unorm8x4 (sRGB rgb, material id).

export const MAT = {
  HULL: 0,      // painted steel
  DECK: 1,      // wood / linoleum planks
  GLASS: 2,     // bridge windows
  DARK: 3,      // gun barrels, funnel caps, black metal
  FLIGHT: 4,    // carrier flight deck
  SKIN: 5,      // hull plating: the shader paints boot-topping / anti-fouling bands from local height
  EMISSIVE: 6,  // lamps
  CANVAS: 7,    // canvas, rope, rubber
  FLAG: 8,      // pennants (double sided, unlit-ish)
  AIRCRAFT: 9,  // aircraft skins (slightly glossy)
  ENSIGN: 10,   // national ensign: rgb = (u, v, length) of the cloth, drawn and waved by the shader
  GLYPH: 11,    // hull number glyph: rgb = (glyph index, u, v) inside the glyph box
  TERRAIN: 12,  // the ground of an island: rgb is the colour of the soil, the shader adds the grain
  BARK: 13,     // trunks and branches: rgb is the bark, the shader adds the furrows
  LEAF: 14,     // the crown of a tree (lumps of foliage): r = family * 16 + shade, g = tone, b = how much the wind moves it; the shader erodes the edge into leaves
  CARD: 15,     // a card of leaves with a cut-out: r, g = position on the card, b = leaf shape; the vertex ambient occlusion is the wind amplitude
  ROCK: 16,     // boulders: rgb is the stone, the shader adds the speckle and the moss
  CANOPY: 17,   // what is seen from outside only (canopy frames, the pilot): not drawn from the cockpit
  GAUGE: 18,    // a dial of the instrument panel: r, g = position on the dial, b = the kind of dial; the shader draws it from the flight state
  SIGHT: 19,    // the glass of a reflector sight: the ring and the dot are drawn by the shader
  DISC: 20,     // the blur of a propeller seen from the cockpit: a dithered dark disc
  INTERIOR: 21, // the inside of a cockpit: lit mostly by the sky
  PAVEMENT: 22, // runways, taxiways, aprons and roads of a base: aggregate, patches, cracks, oil
  CONCRETE: 23, // the painted concrete of the buildings of a base: pores, rain streaks, form joints
  SHEET: 24,    // corrugated sheet metal: hangar walls and roofs
  TEAMBAND: 26, // the team colour on the fin of an aircraft: painted like the skin (tint = the team)
  PANE: 28,     // clear glass of an aircraft canopy: drawn after everything else, blended over what is behind it (the triangles of the material come last in the index buffer)
  AIRPAINT: 27, // the skin of an aircraft drawn from its model: the shader paints the scheme of the aircraft (model/airpaint.js), red = the scheme number
  GRAVEL: 25,   // packed earth and gravel of the yards, shoulders and roads of a base
};

import { triangulate } from './triangulate.js';
import { bakeAO } from './ao.js';

export const VERTEX_STRIDE = 24;

/** Geometric detail of the models (read by every builder): `rounding` scales the segment count of the large round parts, `bevel` is the
 *  edge chamfer of boxes as a fraction of their smallest dimension (0 = sharp edges). tools / tests may change it before building. */
export const DETAIL = { rounding: 1.75, bevel: 0.1, maxBevel: 0.5, minSeg: 12, maxSeg: 40 };

/** '#rrggbb' -> [r, g, b] (0-255, sRGB) */
export function rgb(hex) {
  if (Array.isArray(hex)) return hex;
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** scale brightness of an sRGB colour (simple multiply) */
export function shade(c, f) {
  c = rgb(c);
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}
export function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const M4_ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function m4mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

export class MeshBuilder {
  constructor() {
    this.p = [];      // x y z
    this.n = [];      // nx ny nz ao
    this.c = [];      // r g b mat
    this.idx = [];
    this.stack = [];
    this.m = M4_ID.slice();
    this.ao = 1;
    this.groups = new Map();
    this.solids = null;   // when an array: the bounding box [x0, x1, y0, y1, z0, z1] of every block, prism and cylinder (for placing cameras)
  }

  /** record the bounding box of a solid (through the current transform) in `solids` */
  _track(x0, x1, y0, y1, z0, z1) {
    const m = this.m;
    let a = [1e9, 1e9, 1e9], c = [-1e9, -1e9, -1e9];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
      const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      for (let i = 0; i < 3; i++) { if (p[i] < a[i]) a[i] = p[i]; if (p[i] > c[i]) c[i] = p[i]; }
    }
    this.solids.push([a[0], c[0], a[1], c[1], a[2], c[2]]);
  }

  // ---- transform stack ---------------------------------------------------------------------
  push() { this.stack.push(this.m); this.m = this.m.slice(); return this; }
  pop() { this.m = this.stack.pop(); return this; }
  translate(x, y, z) { this.m = m4mul(this.m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); return this; }
  scale(sx, sy = sx, sz = sx) { this.m = m4mul(this.m, [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]); return this; }
  rotateY(a) { const c = Math.cos(a), s = Math.sin(a); this.m = m4mul(this.m, [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); return this; }
  rotateZ(a) { const c = Math.cos(a), s = Math.sin(a); this.m = m4mul(this.m, [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return this; }
  rotateX(a) { const c = Math.cos(a), s = Math.sin(a); this.m = m4mul(this.m, [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); return this; }
  /** run fn with a temporary transform: b.at(x,y,z,yaw, () => {...}) */
  at(x, y, z, yaw, fn) {
    this.push().translate(x, y, z);
    if (yaw) this.rotateY(yaw);
    fn(this);
    return this.pop();
  }

  // ---- low level ---------------------------------------------------------------------------
  vert(x, y, z, nx, ny, nz, col, mat, ao = this.ao) {
    const m = this.m;
    this.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    let tx = m[0] * nx + m[4] * ny + m[8] * nz, ty = m[1] * nx + m[5] * ny + m[9] * nz, tz = m[2] * nx + m[6] * ny + m[10] * nz;
    const l = Math.hypot(tx, ty, tz) || 1;
    this.n.push(tx / l, ty / l, tz / l, ao);
    this.c.push(col[0], col[1], col[2], mat);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }

  /** Append ready-made geometry (a baked reference mesh): pos / nrm = x y z per vertex, rgb = 0..255 per vertex, idx = triangles; everything goes through the current transform. */
  raw(pos, nrm, rgb, idx, mat = MAT.HULL, ao = this.ao) {
    const base = this.p.length / 3, n = pos.length / 3;
    for (let i = 0; i < n; i++) this.vert(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]], mat, ao);
    for (let i = 0; i < idx.length; i++) this.idx.push(base + idx[i]);
    return this;
  }

  /** Run `fn` for its bounding boxes only (`solids`: the arcs and the clearances are read from them): what it draws is thrown away. */
  ghost(fn) {
    const L = [this.p.length, this.n.length, this.c.length, this.idx.length];
    fn();
    this.p.length = L[0]; this.n.length = L[1]; this.c.length = L[2]; this.idx.length = L[3];
    return this;
  }
  quadIdx(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /** world(position) of the last vertex pushed through the current transform (for oriented tests) */
  _pos(i) { return [this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]]; }

  /**
   * Flat quad (p0..p3 in local space). If `ref` (a local-space point inside the solid) is given the
   * winding is flipped when the face would point towards it.
   */
  quad(p0, p1, p2, p3, col, mat = MAT.HULL, ref = null, ao = this.ao) {
    let e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    let e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) {   // degenerate first triangle: try the other diagonal
      e1x = p2[0] - p0[0]; e1y = p2[1] - p0[1]; e1z = p2[2] - p0[2];
      e2x = p3[0] - p0[0]; e2y = p3[1] - p0[1]; e2z = p3[2] - p0[2];
      nx = e1y * e2z - e1z * e2y; ny = e1z * e2x - e1x * e2z; nz = e1x * e2y - e1y * e2x;
      l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return this;
    }
    nx /= l; ny /= l; nz /= l;
    if (ref) {
      const cx = (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25 - ref[0];
      const cy = (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25 - ref[1];
      const cz = (p0[2] + p1[2] + p2[2] + p3[2]) * 0.25 - ref[2];
      if (nx * cx + ny * cy + nz * cz < 0) { [p1, p3] = [p3, p1]; nx = -nx; ny = -ny; nz = -nz; }
    }
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, col, mat, ao);
    const b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, col, mat, ao);
    const c = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, col, mat, ao);
    const d = this.vert(p3[0], p3[1], p3[2], nx, ny, nz, col, mat, ao);
    this.quadIdx(a, b, c, d);
    return this;
  }
  /** flat triangle, same orientation rule as quad() */
  triFlat(p0, p1, p2, col, mat = MAT.HULL, ref = null, ao = this.ao) {
    const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return this;
    nx /= l; ny /= l; nz /= l;
    if (ref) {
      const cx = (p0[0] + p1[0] + p2[0]) / 3 - ref[0], cy = (p0[1] + p1[1] + p2[1]) / 3 - ref[1], cz = (p0[2] + p1[2] + p2[2]) / 3 - ref[2];
      if (nx * cx + ny * cy + nz * cz < 0) { [p1, p2] = [p2, p1]; nx = -nx; ny = -ny; nz = -nz; }
    }
    const a = this.vert(p0[0], p0[1], p0[2], nx, ny, nz, col, mat, ao);
    const b = this.vert(p1[0], p1[1], p1[2], nx, ny, nz, col, mat, ao);
    const c = this.vert(p2[0], p2[1], p2[2], nx, ny, nz, col, mat, ao);
    this.tri(a, b, c);
    return this;
  }

  /** segment count of a round part: the big ones (radius >= 0.45 m) get DETAIL.rounding times more, gun barrels and the like (>= 0.12 m) a half
   *  more up to 16, the rigging stays as it is */
  _seg(seg, r) {
    if (!(DETAIL.rounding > 1) || r < 0.12) return seg;
    if (r < 0.45) return Math.min(16, Math.max(seg, Math.round(seg * (1 + (DETAIL.rounding - 1) * 0.6))));
    return Math.min(DETAIL.maxSeg, Math.max(Math.round(seg * DETAIL.rounding), Math.min(DETAIL.minSeg, DETAIL.maxSeg)));
  }

  // ---- solids ------------------------------------------------------------------------------
  /**
   * Convex prism between a bottom and a top rectangle (a box when both are equal).
   * o: { x0, x1 (bottom, aft/fore), hw (bottom half width), y0, y1,
   *      tx0, tx1, thw (top, default = bottom), zc (lateral centre offset), tzc,
   *      bottom: bool, top: bool, topCol, sideCol, mat, topMat, ao }
   */
  block(o, col, mat = MAT.HULL) {
    const { x0, x1, hw, y0, y1 } = o;
    const tx0 = o.tx0 ?? x0, tx1 = o.tx1 ?? x1, thw = o.thw ?? hw;
    const zc = o.zc ?? 0, tzc = o.tzc ?? zc;
    if (this.solids) this._track(Math.min(x0, tx0), Math.max(x1, tx1), y0, y1, Math.min(zc - hw, tzc - thw), Math.max(zc + hw, tzc + thw));
    const B0 = [x0, y0, zc - hw], B1 = [x1, y0, zc - hw], B2 = [x1, y0, zc + hw], B3 = [x0, y0, zc + hw];
    const T0 = [tx0, y1, tzc - thw], T1 = [tx1, y1, tzc - thw], T2 = [tx1, y1, tzc + thw], T3 = [tx0, y1, tzc + thw];
    const ref = [(x0 + x1 + tx0 + tx1) * 0.25, (y0 + y1) * 0.5, (zc + tzc) * 0.5];
    const sc = o.sideCol || col, ao = o.ao ?? this.ao;
    // chamfer the vertical edges and the edges of the top: boxes of a metre or more only (the real superstructures have rounded corners)
    const dims = Math.min(x1 - x0, tx1 - tx0, 2 * hw, 2 * thw, y1 - y0);
    const cb = o.bevel ?? Math.min(DETAIL.bevel * dims, DETAIL.maxBevel);
    if (cb > 0.05 && dims > 1.2 && o.top !== false) return this._bevelBlock([B0, B1, B2, B3], [T0, T1, T2, T3], y0, y1, cb, col, sc, o, mat, ref, ao);
    this.quad(B3, B2, T2, T3, sc, mat, ref, ao);   // starboard
    this.quad(B0, T0, T1, B1, sc, mat, ref, ao);   // port
    this.quad(B1, T1, T2, B2, sc, mat, ref, ao);   // front
    this.quad(B3, T3, T0, B0, sc, mat, ref, ao);   // back
    if (o.top !== false) this.quad(T0, T3, T2, T1, o.topCol || col, o.topMat ?? mat, ref, ao);
    if (o.bottom) this.quad(B0, B1, B2, B3, sc, mat, ref, ao * 0.6);
    return this;
  }

  /** a block with its four vertical edges and the edges of its top cut at 45 degrees (cb = size of the chamfer) */
  _bevelBlock(B, T, y0, y1, cb, col, sc, o, mat, ref, ao) {
    // octagon outline of a rectangle (corner order B0..B3 = (x0,-z) (x1,-z) (x1,+z) (x0,+z)): two points per corner, cb along each edge
    const oct = (R, y) => {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const a = R[(i + 3) % 4], c = R[i], d = R[(i + 1) % 4];
        const la = Math.hypot(c[0] - a[0], c[2] - a[2]) || 1, ld = Math.hypot(d[0] - c[0], d[2] - c[2]) || 1;
        out.push([c[0] + (a[0] - c[0]) / la * cb, y, c[2] + (a[2] - c[2]) / la * cb], [c[0] + (d[0] - c[0]) / ld * cb, y, c[2] + (d[2] - c[2]) / ld * cb]);
      }
      return out;
    };
    const lo = oct(B, y0), hi = oct(T, y1 - cb);
    const cx = (T[0][0] + T[2][0]) / 2, cz = (T[0][2] + T[2][2]) / 2;
    const inset = hi.map((p) => [cx + (p[0] - cx) * (1 - cb / Math.max(Math.abs(T[2][0] - T[0][0]), Math.abs(T[2][2] - T[0][2]), 2 * cb) * 1.0), y1, cz + (p[2] - cz) * (1 - cb / Math.max(Math.abs(T[2][0] - T[0][0]), Math.abs(T[2][2] - T[0][2]), 2 * cb) * 1.0)]);
    const topCol = o.topCol || col, tm = o.topMat ?? mat, rim = o.topCol ? o.topCol : sc;
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      this.quad(lo[i], lo[j], hi[j], hi[i], sc, mat, ref, ao);                                   // the walls
      this.quad(hi[i], hi[j], inset[j], inset[i], rim, tm, ref, ao);                              // the chamfer under the roof
      this.triFlat([cx, y1, cz], inset[i], inset[j], topCol, tm, ref, ao);                        // the roof
    }
    if (o.bottom) for (let i = 1; i < 7; i++) this.triFlat(lo[0], lo[i], lo[i + 1], sc, mat, ref, ao * 0.6);
    return this;
  }
  /** axis aligned box centred at (cx,cy,cz) with sizes (sx,sy,sz) */
  box(cx, cy, cz, sx, sy, sz, col, mat = MAT.HULL, o = {}) {
    return this.block({ x0: cx - sx / 2, x1: cx + sx / 2, hw: sz / 2, zc: cz, y0: cy - sy / 2, y1: cy + sy / 2, ...o }, col, mat);
  }

  /** Extruded convex polygon (points [x,z]) from y0 to y1, top scaled by `topScale` around the centroid. */
  prism(poly, y0, y1, col, mat = MAT.HULL, o = {}) {
    const n = poly.length;
    let cx = 0, cz = 0;
    if (this.solids) {
      this._track(Math.min(...poly.map((q) => q[0])), Math.max(...poly.map((q) => q[0])), y0, y1, Math.min(...poly.map((q) => q[1])), Math.max(...poly.map((q) => q[1])));
      // the outline itself, in model space, for the tests that must not mistake a tapered house for its bounding box (gun clearance)
      const m = this.m;
      this.solids[this.solids.length - 1].poly = poly.map((q) => [m[0] * q[0] + m[8] * q[1] + m[12], m[2] * q[0] + m[10] * q[1] + m[14]]);
    }
    for (const p of poly) { cx += p[0]; cz += p[1]; }
    cx /= n; cz /= n;
    const ts = o.topScale ?? 1;
    const top = poly.map((p) => [cx + (p[0] - cx) * ts + (o.topDx || 0), cz + (p[1] - cz) * ts + (o.topDz || 0)]);
    const ref = [cx, (y0 + y1) / 2, cz];
    const ao = o.ao ?? this.ao;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad([poly[i][0], y0, poly[i][1]], [poly[j][0], y0, poly[j][1]], [top[j][0], y1, top[j][1]], [top[i][0], y1, top[i][1]], o.sideCol || col, mat, ref, ao);
    }
    if (o.top !== false) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.triFlat([cx + (o.topDx || 0), y1, cz + (o.topDz || 0)], [top[i][0], y1, top[i][1]], [top[j][0], y1, top[j][1]], o.topCol || col, o.topMat ?? mat, ref, ao);
      }
    }
    if (o.bottom) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.triFlat([cx, y0, cz], [poly[i][0], y0, poly[i][1]], [poly[j][0], y0, poly[j][1]], o.sideCol || col, mat, ref, ao * 0.6);
      }
    }
    return this;
  }

  /**
   * Extruded polygon with holes from y0 to y1 (any outline, concave too): rings = [outer, hole, ...] as [x, z] points, flat caps. The side faces face away from the solid on every ring.
   */
  slab(rings, y0, y1, col, mat = MAT.HULL, o = {}) {
    const outer = rings[0];
    if (this.solids) {
      this._track(Math.min(...outer.map((q) => q[0])), Math.max(...outer.map((q) => q[0])), y0, y1, Math.min(...outer.map((q) => q[1])), Math.max(...outer.map((q) => q[1])));
      const m = this.m;
      this.solids[this.solids.length - 1].poly = outer.map((q) => [m[0] * q[0] + m[8] * q[1] + m[12], m[2] * q[0] + m[10] * q[1] + m[14]]);
    }
    const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
    const rs = rings.map((r, k) => ((area(r) > 0) === (k === 0) ? r : r.slice().reverse()));       // outer counter-clockwise, holes clockwise: the solid is on the left of every edge
    const ao = o.ao ?? this.ao;
    for (const r of rs) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const ref = [(a[0] + b[0]) / 2 - dz / l * 0.3, (y0 + y1) / 2, (a[1] + b[1]) / 2 + dx / l * 0.3];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], o.sideCol || col, mat, ref, ao);
    }
    if (o.top !== false || o.bottom) {
      const flat = rs.flat();
      let cx = 0, cz = 0; for (const p of rs[0]) { cx += p[0]; cz += p[1]; }
      const ref = [cx / rs[0].length, (y0 + y1) / 2, cz / rs[0].length];
      for (const [i, j, k] of triangulate(rs)) {
        if (o.top !== false) this.triFlat([flat[i][0], y1, flat[i][1]], [flat[j][0], y1, flat[j][1]], [flat[k][0], y1, flat[k][1]], o.topCol || col, o.topMat ?? mat, [flat[i][0], y0, flat[i][1]], ao);
        if (o.bottom) this.triFlat([flat[i][0], y0, flat[i][1]], [flat[j][0], y0, flat[j][1]], [flat[k][0], y0, flat[k][1]], o.sideCol || col, mat, [flat[i][0], y1, flat[i][1]], ao * 0.6);
      }
      void ref;
    }
    return this;
  }

  /**
   * A convex polyhedron from its plane faces: verts = [[x, y, z], ...], faces = [[i, j, ...], ...] (each a loop of vertex indices round a flat face, either way round). The faces are oriented away from the centre.
   */
  poly3d(verts, faces, col, mat = MAT.HULL, o = {}) {
    const ao = o.ao ?? this.ao;
    let cx = 0, cy = 0, cz = 0;
    for (const v of verts) { cx += v[0]; cy += v[1]; cz += v[2]; }
    const ref = [cx / verts.length, cy / verts.length, cz / verts.length];
    if (this.solids) {
      this._track(Math.min(...verts.map((v) => v[0])), Math.max(...verts.map((v) => v[0])), Math.min(...verts.map((v) => v[1])), Math.max(...verts.map((v) => v[1])), Math.min(...verts.map((v) => v[2])), Math.max(...verts.map((v) => v[2])));
    }
    for (const f of faces) for (let i = 1; i + 1 < f.length; i++) this.triFlat(verts[f[0]], verts[f[i]], verts[f[i + 1]], col, mat, ref, ao);
    return this;
  }

  /**
   * Loft between two outlines of the same number of points (a tapered or leaning house): rA at y0, rB at y1, corresponding point to point, counter-clockwise; flat caps. Convex-ish
   * outlines only for the caps' orientation test (the sides are oriented by the edges, the caps by the loft's axis).
   */
  loft(rA, y0, rB, y1, col, mat = MAT.HULL, o = {}) {
    const n = rA.length, ao = o.ao ?? this.ao;
    if (this.solids) {
      const xs = [...rA, ...rB].map((q) => q[0]), zs = [...rA, ...rB].map((q) => q[1]);
      this._track(Math.min(...xs), Math.max(...xs), y0, y1, Math.min(...zs), Math.max(...zs));
      const m = this.m;
      this.solids[this.solids.length - 1].poly = rA.map((q) => [m[0] * q[0] + m[8] * q[1] + m[12], m[2] * q[0] + m[10] * q[1] + m[14]]);
    }
    let sgn = 0; for (let i = 0; i < n; i++) { const a = rA[i], b = rA[(i + 1) % n]; sgn += a[0] * b[1] - b[0] * a[1]; }
    const ccw = sgn > 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = rA[i], b = rA[j];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, s = ccw ? 1 : -1;
      const ref = [(a[0] + b[0]) / 2 - s * dz / l * 0.3, (y0 + y1) / 2, (a[1] + b[1]) / 2 + s * dx / l * 0.3];
      const A = [a[0], y0, a[1]], B = [b[0], y0, b[1]], C = [rB[j][0], y1, rB[j][1]], D = [rB[i][0], y1, rB[i][1]];
      this.triFlat(A, B, C, col, mat, ref, ao);                                   // two triangles: the side of a twisted loft is not flat
      this.triFlat(A, C, D, col, mat, ref, ao);
    }
    for (const [ring, y, ry] of [[rB, y1, y0], [rA, y0, y1]]) {
      if (y === y0 && !o.bottom) continue;
      if (y === y1 && o.top === false) continue;
      const flat = ring;
      for (const [i, j, k] of triangulate([ring])) this.triFlat([flat[i][0], y, flat[i][1]], [flat[j][0], y, flat[j][1]], [flat[k][0], y, flat[k][1]], o.topCol || col, o.topMat ?? mat, [flat[i][0], ry, flat[i][1]], y === y0 ? ao * 0.6 : ao);
    }
    return this;
  }

  /**
   * Elliptic frustum along +y (rotate the builder for other axes): bottom radii (rx0, rz0) at y0,
   * top radii (rx1, rz1) at y1, top centre shifted by (dx, dz) (funnel rake).
   * o: { seg, capTop, capBottom, smooth, topCol, ao, aoTop }
   */
  cyl(cx, y0, cz, rx0, rz0, rx1, rz1, y1, col, mat = MAT.HULL, o = {}) {
    const seg = this._seg(o.seg || 16, Math.max(rx0, rz0, rx1, rz1));
    const dx = o.dx || 0, dz = o.dz || 0;
    if (this.solids) {
      this._track(cx - Math.max(rx0, rx1) + Math.min(0, dx), cx + Math.max(rx0, rx1) + Math.max(0, dx), y0, y1, cz - Math.max(rz0, rz1) + Math.min(0, dz), cz + Math.max(rz0, rz1) + Math.max(0, dz));
      this.solids[this.solids.length - 1].round = true;       // an ellipse in its box
    }
    const ao = o.ao ?? this.ao;
    const ring0 = [], ring1 = [];
    const h = y1 - y0;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const P0 = [cx + rx0 * c, y0, cz + rz0 * s];
      const P1 = [cx + dx + rx1 * c, y1, cz + dz + rz1 * s];
      // normal from the generator and tangent
      const gx = P1[0] - P0[0], gy = h, gz = P1[2] - P0[2];
      const rxa = (rx0 + rx1) * 0.5, rza = (rz0 + rz1) * 0.5;
      const tx = -rxa * s, tz = rza * c;
      let nx = gy * tz, ny = gz * tx - gx * tz, nz = -gy * tx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      ring0.push(this.vert(P0[0], P0[1], P0[2], nx, ny, nz, col, mat, ao));
      ring1.push(this.vert(P1[0], P1[1], P1[2], nx, ny, nz, col, mat, o.aoTop ?? ao));
    }
    for (let i = 0; i < seg; i++) this.quadIdx(ring0[i], ring1[i], ring1[i + 1], ring0[i + 1]);
    if (o.capTop !== false && (rx1 > 1e-4 || rz1 > 1e-4)) {
      const tc = o.topCol || col, tm = o.topMat ?? mat;
      const c0 = this.vert(cx + dx, y1, cz + dz, 0, 1, 0, tc, tm, o.aoTop ?? ao);
      const ids = [];
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        ids.push(this.vert(cx + dx + rx1 * Math.cos(th), y1, cz + dz + rz1 * Math.sin(th), 0, 1, 0, tc, tm, o.aoTop ?? ao));
      }
      for (let i = 0; i < seg; i++) this.tri(c0, ids[i + 1], ids[i]);
    }
    if (o.capBottom) {
      const c0 = this.vert(cx, y0, cz, 0, -1, 0, col, mat, ao * 0.6);
      const ids = [];
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        ids.push(this.vert(cx + rx0 * Math.cos(th), y0, cz + rz0 * Math.sin(th), 0, -1, 0, col, mat, ao * 0.6));
      }
      for (let i = 0; i < seg; i++) this.tri(c0, ids[i], ids[i + 1]);
    }
    return this;
  }
  /** plain cylinder / cone along +y */
  cylinder(cx, y0, cz, r0, r1, y1, col, mat = MAT.HULL, o = {}) { return this.cyl(cx, y0, cz, r0, r0, r1, r1, y1, col, mat, o); }

  /** cylinder along +x (gun barrels, rangefinders): from x0 to x1 at (y, z) */
  rod(x0, x1, y, z, r0, r1, col, mat = MAT.DARK, o = {}) {
    this.push().translate(x0, y, z).rotateZ(-Math.PI / 2);
    this.cyl(0, 0, 0, r0, r0, r1, r1, x1 - x0, col, mat, { seg: o.seg || 8, capTop: o.capTop ?? true, ao: o.ao });
    return this.pop();
  }
  /** cylinder along +z (athwartships): from z0 to z1 at (x, y) */
  rodZ(x, y, z0, z1, r0, r1, col, mat = MAT.DARK, o = {}) {
    this.push().translate(x, y, z0).rotateX(Math.PI / 2);
    this.cyl(0, 0, 0, r0, r0, r1, r1, z1 - z0, col, mat, { seg: o.seg || 8, capTop: true, ao: o.ao });
    return this.pop();
  }

  sphere(cx, cy, cz, rx, ry, rz, col, mat = MAT.HULL, o = {}) {
    const seg = this._seg(o.seg || 12, Math.max(rx, rz)), rings = Math.round((o.rings || 7) * (seg / (o.seg || 12) > 1 ? 1.4 : 1));
    const top = o.half ? rings / 2 : rings;   // half: dome only (upper hemisphere)
    const idx = [];
    for (let j = 0; j <= top; j++) {
      const ph = (j / rings) * Math.PI;           // 0 at the top pole
      const row = [];
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
        row.push(this.vert(cx + rx * nx, cy + ry * ny, cz + rz * nz, nx / rx, ny / ry, nz / rz, col, mat, o.ao));
      }
      idx.push(row);
    }
    for (let j = 0; j < top; j++) for (let i = 0; i < seg; i++) {
      this.tri(idx[j][i], idx[j + 1][i], idx[j + 1][i + 1]);
      if (j > 0) this.tri(idx[j][i], idx[j + 1][i + 1], idx[j][i + 1]);
    }
    return this;
  }

  /** thin rectangular rod between two points (rails, stays, antennas, struts) */
  beam(p0, p1, w, h, col, mat = MAT.HULL, o = {}) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return this;
    const d = [dx / len, dy / len, dz / len];
    let up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    // s = up x d ; u = d x s
    let s = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
    const sl = Math.hypot(s[0], s[1], s[2]); s = [s[0] / sl, s[1] / sl, s[2] / sl];
    const u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
    const hw = w / 2, hh = h / 2;
    const corner = (base, a, b) => [base[0] + s[0] * hw * a + u[0] * hh * b, base[1] + s[1] * hw * a + u[1] * hh * b, base[2] + s[2] * hw * a + u[2] * hh * b];
    const A = [corner(p0, -1, -1), corner(p0, 1, -1), corner(p0, 1, 1), corner(p0, -1, 1)];
    const B = [corner(p1, -1, -1), corner(p1, 1, -1), corner(p1, 1, 1), corner(p1, -1, 1)];
    const ref = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const ao = o.ao ?? this.ao;
    if (this.solids && Math.max(w, h) >= 0.15) {     // legs and struts count as solids (stays and wires do not)
      const pts = [...A, ...B], m = this.m;
      const T = pts.map((q) => [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]]);
      const bb = [0, 1, 2].flatMap((k) => [Math.min(...T.map((q) => q[k])), Math.max(...T.map((q) => q[k]))]);
      this.solids.push([bb[0], bb[1], bb[2], bb[3], bb[4], bb[5]]);
      this.solids[this.solids.length - 1].strut = true;
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(A[i], A[j], B[j], B[i], col, mat, ref, ao);
    }
    if (o.caps !== false) { this.quad(A[0], A[1], A[2], A[3], col, mat, ref, ao); this.quad(B[0], B[1], B[2], B[3], col, mat, ref, ao); }
    return this;
  }

  /** Flat, double-sided-friendly decal quad on a deck: centre, half sizes along x and z, raised by `lift`. */
  decal(cx, y, cz, hx, hz, col, mat = MAT.HULL) {
    return this.quad([cx - hx, y, cz - hz], [cx - hx, y, cz + hz], [cx + hx, y, cz + hz], [cx + hx, y, cz - hz], col, mat, [cx, y - 1, cz], 1);
  }

  // ---- separable parts -----------------------------------------------------------------------
  /**
   * Build the geometry emitted by fn into its own mesh (same model space, current transform applies).
   * Calling it twice with the same name appends. Used for pieces that can be destroyed separately
   * (funnels, masts, directors...). Returns the AABB [x0,y0,z0,x1,y1,z1] of what fn emitted.
   */
  group(name, fn) {
    const saved = { p: this.p, n: this.n, c: this.c, idx: this.idx };
    let g = this.groups.get(name);
    if (!g) { g = { p: [], n: [], c: [], idx: [] }; this.groups.set(name, g); }
    const base = g.p.length / 3;
    this.p = g.p; this.n = g.n; this.c = g.c; this.idx = g.idx;
    const i0 = this.idx.length, s0 = this.solids ? this.solids.length : 0;
    fn(this);
    if (this.solids) for (let i = s0; i < this.solids.length; i++) this.solids[i].part = name;       // the structures of a destroyable piece know which one they belong to
    // an appended call restarts its vertex numbering at 0: shift the new indices
    if (base > 0) for (let i = i0; i < this.idx.length; i++) this.idx[i] += base;
    this.p = saved.p; this.n = saved.n; this.c = saved.c; this.idx = saved.idx;
    return this.groupBounds(name);
  }
  groupBounds(name) {
    const g = this.groups.get(name);
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    if (!g) return bb;
    for (let i = 0; i < g.p.length; i += 3) {
      for (let k = 0; k < 3; k++) { const v = g.p[i + k]; if (v < bb[k]) bb[k] = v; if (v > bb[k + 3]) bb[k + 3] = v; }
    }
    return bb;
  }

  // ---- output ------------------------------------------------------------------------------
  get vertexCount() { return this.p.length / 3; }
  get triangleCount() { return this.idx.length / 3; }

  /** Pack the main geometry (and, as `.groups`, every named group) into GPU-ready buffers. */
  build(opts = {}) {
    if (opts.ao !== false) {
      const list = [{ P: this.p, N: this.n, IDX: this.idx }];
      for (const [name, g] of this.groups) list.push({ P: g.p, N: g.n, IDX: g.idx, occluder: !name.endsWith('_ruin') });
      bakeAO(list, opts.aoOpts);
    }
    const out = packMesh(this.p, this.n, this.c, this.idx);
    out.groups = {};
    for (const [name, g] of this.groups) out.groups[name] = packMesh(g.p, g.n, g.c, g.idx);
    return out;
  }
}

function packMesh(P, N, C, IDX) {
  const vc = P.length / 3;
  const buf = new ArrayBuffer(vc * VERTEX_STRIDE);
  const dv = new DataView(buf);
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vc; i++) {
    const o = i * VERTEX_STRIDE;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    dv.setFloat32(o, x, true); dv.setFloat32(o + 4, y, true); dv.setFloat32(o + 8, z, true);
    for (let k = 0; k < 4; k++) {
      const v = Math.max(-1, Math.min(1, N[i * 4 + k]));
      dv.setInt16(o + 12 + k * 2, Math.round(v * 32767), true);
    }
    for (let k = 0; k < 4; k++) dv.setUint8(o + 20 + k, Math.max(0, Math.min(255, Math.round(C[i * 4 + k]))));
    if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
    if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
  }
  // the clear panes go last, so that the renderer draws the opaque part of the mesh first and the panes alone later, blended
  let idx = IDX, paneStart = IDX.length;
  const isPane = (v) => C[v * 4 + 3] === MAT.PANE;
  if (C.length && IDX.some((v, k) => k % 3 === 0 && isPane(v))) {
    const solid = [], pane = [];
    for (let t = 0; t < IDX.length; t += 3) (isPane(IDX[t]) ? pane : solid).push(IDX[t], IDX[t + 1], IDX[t + 2]);
    idx = solid.concat(pane); paneStart = solid.length;
  }
  return { vertices: buf, indices: new Uint32Array(idx), vertexCount: vc, indexCount: idx.length, paneStart, aabb: bb };
}
