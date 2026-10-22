// gioberti: the tweaks of the gioberti model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// The helpers of the builder are passed to `extra(ctx)`.

// ---- small geometry helpers (plans are lists of [x, z] points, x along the ship, bow +, z to starboard) ----

/** convex hull of points (monotone chain), counter-clockwise in the (x, z) plane */
function hull2(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cr = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** a starboard half outline [[x, z >= 0], ...] mirrored to port and closed (convex hull of both halves) */
const sym = (half) => hull2(half.flatMap(([x, z]) => (z === 0 ? [[x, 0]] : [[x, z], [x, -z]])));
/** ellipse polygon */
function ellipse(cx, cz, rx, rz, n = 20) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); } return o; }
/** rectangle with rounded corners (x0 < x1, z0 < z1, corner radius r) */
function rrect(x0, x1, z0, z1, r, n = 4) {
  const o = [];
  for (const [cx, cz, a0] of [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, 90], [x0 + r, z0 + r, 180], [x1 - r, z0 + r, 270]]) for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * Math.PI / 180; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return o;
}

/**
 * A smooth skin through oval stations: rows = [{ y, xa, xf, hw, p }] (aft and fore extent, half width, super-ellipse exponent), each ring a super-ellipse of n points;
 * `topY(x, z)` optionally sets the height of the last ring (a sloped top). Normals come from the rings, so the surface shades as one piece.
 */
function loft(b, rows, col, mat, { n = 28, topY = null, flip = false } = {}) {
  const ring = (r, last) => {
    const o = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), p = 2 / (r.p || 2);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), p), sz = Math.sign(s) * Math.pow(Math.abs(s), p);
      const x = (r.xa + r.xf) / 2 + sx * (r.xf - r.xa) / 2, z = (r.z || 0) + sz * r.hw;
      o.push([x, r.yf ? r.yf(x, z) : last && topY ? topY(x, z) : r.y, z]);
    }
    return o;
  };
  const rings = rows.map((r, i) => ring(r, i === rows.length - 1));
  const ids = rings.map((rg, k) => rg.map((q, i) => {
    // the normal: across the ring and along the skin
    const nxt = rings[Math.min(k + 1, rings.length - 1)][i], prv = rings[Math.max(k - 1, 0)][i];
    const tu = [rg[(i + 1) % n][0] - rg[(i + n - 1) % n][0], rg[(i + 1) % n][1] - rg[(i + n - 1) % n][1], rg[(i + 1) % n][2] - rg[(i + n - 1) % n][2]];
    const tv = [nxt[0] - prv[0], nxt[1] - prv[1], nxt[2] - prv[2]];
    let nn = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
    const l = Math.hypot(...nn) || 1; nn = nn.map((v) => v / l * (flip ? -1 : 1));
    // outward: away from the ring centre
    const cx = rg.reduce((s, w) => s + w[0], 0) / n, cz = rg.reduce((s, w) => s + w[2], 0) / n;
    if (nn[0] * (q[0] - cx) + nn[2] * (q[2] - cz) < 0) nn = nn.map((v) => -v);
    return b.vert(q[0], q[1], q[2], nn[0], nn[1], nn[2], col, mat);
  }));
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; b.quadIdx(ids[k][i], ids[k + 1][i], ids[k + 1][j], ids[k][j]); b.quadIdx(ids[k][i], ids[k][j], ids[k + 1][j], ids[k + 1][i]); }
}

/** a prism whose top follows a function: sides from y0 to yf(x, z) at each corner of the plan, the top a fan from the centre */
function slabF(b, poly, y0, yf, col, mat) {
  const n = poly.length;
  let cx = 0, cz = 0; for (const q of poly) { cx += q[0] / n; cz += q[1] / n; }
  const ref = [cx, (y0 + yf(cx, cz)) / 2, cz];
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    b.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], yf(q[0], q[1]), q[1]], [p[0], yf(p[0], p[1]), p[1]], col, mat, ref);
    b.triFlat([cx, yf(cx, cz), cz], [p[0], yf(p[0], p[1]), p[1]], [q[0], yf(q[0], q[1]), q[1]], col, mat, ref);
  }
}

/**
 * A vertical-walled slab like `b.prism`, but the wall is shaded smoothly where the outline turns by less than `sharp` degrees (a rounded drum is not a many-sided box),
 * and it is recorded as a solid (the outline is convex) for the layout of the guns.
 */
function slabS(b, poly, y0, y1, col, mat, { sharp = 38, topCol = null } = {}) {
  const n = poly.length;
  let cx = 0, cz = 0; for (const q of poly) { cx += q[0] / n; cz += q[1] / n; }
  const en = poly.map((p, i) => {
    const q = poly[(i + 1) % n]; let nx = q[1] - p[1], nz = -(q[0] - p[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[1] + q[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  });
  const cs = Math.cos(sharp * Math.PI / 180);
  const vnorm = (i, e) => {                       // the normal at corner i of edge e (e is i or i-1)
    const a = en[(i + n - 1) % n], c = en[i % n];
    if (a[0] * c[0] + a[1] * c[1] < cs) return en[e];
    const sx = a[0] + c[0], sz = a[1] + c[1], l = Math.hypot(sx, sz) || 1; return [sx / l, sz / l];
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = poly[i], q = poly[j], na = vnorm(i, i), nb = vnorm(j, i);
    const v0 = b.vert(p[0], y0, p[1], na[0], 0, na[1], col, mat), v1 = b.vert(q[0], y0, q[1], nb[0], 0, nb[1], col, mat), v2 = b.vert(q[0], y1, q[1], nb[0], 0, nb[1], col, mat), v3 = b.vert(p[0], y1, p[1], na[0], 0, na[1], col, mat);
    // winding: the face must look along its outward normal
    const e1 = [q[0] - p[0], 0, q[1] - p[1]], e2 = [0, y1 - y0, 0], cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * en[i][0] + cr[2] * en[i][1] >= 0) b.quadIdx(v0, v1, v2, v3); else b.quadIdx(v0, v3, v2, v1);
  }
  const tc = topCol || col, c0 = b.vert(cx, y1, cz, 0, 1, 0, tc, mat);
  const ring = poly.map((q) => b.vert(q[0], y1, q[1], 0, 1, 0, tc, mat));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = poly[i], q = poly[j], up = (p[0] - cx) * (q[1] - cz) - (p[1] - cz) * (q[0] - cx);      // x-z plane: seen from above (+y) with x to the right and z down, a positive value is clockwise
    if (up > 0) b.tri(c0, ring[i], ring[j]); else b.tri(c0, ring[j], ring[i]);
  }
  if (b.solids) { const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]), r = [Math.min(...xs), Math.max(...xs), y0, y1, Math.min(...zs), Math.max(...zs)]; r.poly = poly.map((q) => [q[0], q[1]]); b.solids.push(r); }
}

/**
 * Bridge, funnel, masts, directors, tubes, platforms and every fitting that the generic builder does not draw (the ship is built with `own: true`).
 * Heights are metres over the waterline, x along the ship from its middle (bow +), z to starboard, all measured in metres on cuts and views of a reference model.
 */
function giobertiExtras(ctx) {
  const { b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, DT, note } = ctx;
  const sup = rgb(pal.sup), hullc = rgb(pal.hull), dark = rgb(pal.dark), deckc = rgb(pal.deck), glass = rgb(pal.glass), steel = shade(sup, 0.75), black = shade(dark, 1.2);
  const slab = (poly, y0, y1, col = sup, o = {}) => (o.topScale != null || o.bottom ? b.prism(poly, y0, y1, col, o.mat ?? MAT.HULL, o) : slabS(b, poly, y0, y1, col, o.mat ?? MAT.HULL, o));
  const fineFns = [], fine = (fn) => fineFns.push(fn);          // everything of the fine detail goes into one group (a group built twice would be numbered wrongly)
  const FD = 5.3, MD = 3.05;               // the forecastle deck and the main deck abaft it

  // a thin upright wall (a splinter screen, a bulwark) along a polyline, y0 to y0 + h
  const wall = (pts, y0, h, t = 0.08, col = sup, closed = false) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; b.beam([p[0], y0 + h / 2, p[1]], [q[0], y0 + h / 2, q[1]], t, h, col, MAT.HULL); } };
  const arc = (cx, cz, r, a0, a1, n = 8) => { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };
  // an oval life float standing on edge in its cradle: a racetrack ring with the net across it (x, y centre; z of its inner face; length, height, thickness)
  const raft = (cx, cy, z0, len, hgt, th, col = sup) => {
    const r = hgt / 2, n = 8, path = [];
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; path.push([cx + len / 2 - r + Math.cos(a) * (r - 0.2), cy + Math.sin(a) * (r - 0.2)]); }
    for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + Math.PI * i / n; path.push([cx - len / 2 + r + Math.cos(a) * (r - 0.2), cy + Math.sin(a) * (r - 0.2)]); }
    const zc = z0 + th / 2;
    for (let i = 0; i < path.length; i++) { const p = path[i], q = path[(i + 1) % path.length]; b.beam([p[0], p[1], zc], [q[0], q[1], zc], th * 0.8, 0.42, shade(col, 0.95), MAT.HULL); }   // the buoyant ring
    b.push().translate(0, cy, z0).rotateX(Math.PI / 2);
    b.prism(path.map(([x, y]) => [x, -(y - cy)]), th / 2 - 0.03, th / 2 + 0.03, shade(deckc, 0.75), MAT.CANVAS, { top: true });                                  // the net across it
    b.pop();
    for (const u of [-0.3, 0.3]) b.box(cx + u * len, cy - hgt / 2 - 0.2, zc, 0.1, 0.4, th * 0.7, steel, MAT.HULL);
  };
  // a ship's boat hanging on davits: a planked hull (the plan outline scaled in levels from the keel to the gunwale), open with thwarts or decked over with a shelter
  const boat = (cx, zc, len, beam, y0, y1, o = {}) => {
    const half = [[-0.5, 0.7], [-0.35, 0.9], [-0.1, 1.0], [0.15, 0.92], [0.32, 0.66], [0.44, 0.3], [0.5, 0.0]];
    const lev = [[0.12, 0.72, y0], [0.55, 0.88, y0 + (y1 - y0) * 0.25], [0.88, 0.97, y0 + (y1 - y0) * 0.6], [1.0, 1.0, y1]];
    const ring = (zs, xs, y) => { const r = []; for (const [u, w] of half) r.push([cx + u * len * xs, y, zc + w * beam / 2 * zs]); for (const [u, w] of half.slice(0, -1).reverse()) r.push([cx + u * len * xs, y, zc - w * beam / 2 * zs]); return r; };
    const rings = lev.map(([zs, xs, y]) => ring(zs, xs, y)), n = rings[0].length, col = rgb(pal.boat || '#8b8f90'), inner = shade(col, 0.6), ctr = [cx, (y0 + y1) / 2, zc];
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; b.quad(rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i], col, MAT.HULL, ctr); }
    const top = rings[rings.length - 1];
    if (o.decked) { for (let i = 0; i < n; i++) b.triFlat([cx, y1 + 0.08, zc], top[i], top[(i + 1) % n], shade(col, 1.05), MAT.HULL, ctr); }
    else {
      const inr = ring(0.86, 0.94, y1 - 0.05), flo = ring(0.5, 0.7, y0 + (y1 - y0) * 0.35);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, out = (q) => [q[0] + (q[0] - cx) * 5, q[1], q[2] + (q[2] - zc) * 5]; b.quad(inr[i], inr[j], flo[j], flo[i], inner, MAT.CANVAS, out([(inr[i][0] + inr[j][0]) / 2, 0, (inr[i][2] + inr[j][2]) / 2])); b.triFlat([cx, y0 + (y1 - y0) * 0.35, zc], flo[i], flo[j], inner, MAT.CANVAS, [cx, y1 + 2, zc]); }
      for (const u of [-0.3, 0.0, 0.26]) b.box(cx + u * len, y1 - 0.25, zc, 0.18, 0.08, beam * 0.8, shade(col, 1.15), MAT.HULL);
    }
    if (o.cabin) { slab([[cx - len * 0.12, zc - beam * 0.24], [cx + len * 0.1, zc - beam * 0.2], [cx + len * 0.12, zc + beam * 0.2], [cx - len * 0.12, zc + beam * 0.24]], y1 + 0.05, y1 + 0.95, shade(col, 1.08), { topScale: 0.85 }); }
    // the davits: a post at each end of the boat on the deck beside it, an arm bent in over the gunwale
    const sg = zc > 0 ? 1 : -1, ze = zc + sg * (beam / 2 + 0.25);
    if (o.davits !== false) for (const u of [-0.32, 0.3]) { const x = cx + u * len; b.cylinder(x, MD, ze, 0.07, 0.06, 6.0, shade(sup, 0.85), MAT.HULL, { seg: 6 }); b.beam([x, 6.0, ze], [x, 5.55, zc + sg * beam * 0.34], 0.07, 0.07, shade(sup, 0.85), MAT.HULL); b.cylinder(x, 5.5, zc + sg * beam * 0.34, 0.03, 0.03, 5.6, black, MAT.DARK, { seg: 4 }); }
  };
  const CS = 7.28;                          // the top of the casing and of the lower house

  // ---- the casing: the long narrow house from the funnel to the bridge (the funnel stands on it) ----
  // ---- the bridge ----
  const roofY = 9.65;
  const lower = sym([[14.95, 1.6], [16.3, 2.37], [17.4, 2.58], [22.1, 2.58], [23.0, 2.52], [23.6, 2.3], [24.1, 1.95], [24.55, 1.5], [24.8, 0.95], [24.95, 0.4], [24.98, 0]]);
  const stadium = hull2([...ellipse(15.7, 2.85, 1.55, 1.55, 14), ...ellipse(15.7, -2.85, 1.55, 1.55, 14)]);
  part('tower', 'bridge', 'Passerelle', () => {
    slab(sym([[-2.3, 0.5], [-2.1, 1.4], [-1.5, 2.0], [-0.8, 2.15], [10.45, 2.15]]), MD - 0.1, FD - 0.1);                           // the deckhouse on the main deck under the funnel, its roof level with the forecastle
    loft(b, [{ y: FD - 0.1, xa: 2.55, xf: 14.9, hw: 1.5, p: 2.6 }, { y: 6.0, xa: 3.0, xf: 14.9, hw: 1.6, p: 2.6 }, { y: 7.0, xa: 3.85, xf: 14.9, hw: 1.66, p: 2.6 }, { y: CS, xa: 4.0, xf: 14.9, hw: 1.66, p: 2.6 }], sup, MAT.HULL, { n: 32 });   // the casing, its foot sweeping out under the funnel
    slab(lower, FD - 0.2, CS);                                                                                                  // the lower house, 2 m high
    slab(sym([[14.53, 0], [15.0, 0.77], [16.4, 1.55], [21.0, 1.86], [21.6, 1.9]]), CS, roofY);                                  // the aft body of the lower bridge
    slab(sym([[22.0, 2.55], [23.2, 2.6], [24.1, 2.6], [24.6, 2.5], [24.9, 2.2], [25.1, 1.8], [25.2, 1.2], [25.23, 0]]), CS, roofY);                                 // the forward body, rounded in front
    slab(stadium, 9.5, roofY, sup);                                                                                             // the machine-gun platform across the tower foot: a lobe each side
    for (const sg of [-1, 1]) {                                                                                                 // the walls round the casing (the funnel's apron)
      wall([[10.0, sg * 1.65], [14.86, sg * 1.65], [15.32, sg * 2.05]], CS, 0.97);
      wall([[17.4, sg * 1.74], [19.52, sg * 1.75], [20.46, sg * 2.6], [22.0, sg * 2.58]], roofY, 0.8);                           // the roof screen of the lower bridge
    }
    wall([[22.05, -2.57], [24.3, -2.52], [25.07, -1.97], [25.26, -1.15], [25.26, 1.15], [25.07, 1.97], [24.3, 2.52], [22.05, 2.57]], roofY, 0.9, 0.13);   // the screen round the front of its roof
    slab(sym([[14.53, 0], [14.62, 0.4], [14.85, 0.72], [15.3, 1.08], [15.82, 1.26], [16.0, 1.21], [17.0, 0.7], [17.78, 0.29], [17.94, 0]]), roofY, 12.3);                // the tower, a teardrop pointing forward
    slab(sym([[14.07, 0], [14.59, 1.0], [15.4, 1.45], [16.5, 1.48], [16.78, 0.5]]), 12.3, 14.65);                               // the director house
    slabF(b, sym([[20.3, 0.4], [20.85, 1.18], [21.9, 1.4], [23.45, 1.0], [23.7, 0]]), roofY, (x) => Math.max(11.2, Math.min(12.25, 12.25 - (x - 21.2) * 0.34)), sup, MAT.HULL);   // the compass bridge, its roof sloping to the front
    b.cylinder(21.75, roofY, 0, 1.45, 1.45, 10.25, shade(sup, 0.9), MAT.HULL, { seg: 24 });                                      // the round base of the compass bridge
    slab(rrect(19.6, 21.85, -1.1, 1.1, 0.25), 11.25, 12.55);                                                                    // the box on top of it behind
    slab(rrect(20.2, 21.0, -0.75, 0.75, 0.15), roofY, 11.25);
    for (const sg of [-1, 1]) {                                                                                                 // the signal projectors: barrels with domed ends on the sides of the compass bridge and of the box behind it
      for (const [x, y, r] of [[22.2, 10.95, 0.33], [20.6, 11.9, 0.3]]) { b.rodZ(x, y, sg * 1.25, sg * 1.62, r, r, shade(sup, 0.88), MAT.HULL, { seg: 12 }); b.sphere(x, y, sg * 1.62, r, r, r * 0.55, shade(sup, 0.95), MAT.HULL, { seg: 12, rings: 6 }); }
    }
    slab(sym([[15.96, 1.07], [16.6, 1.54], [17.26, 1.53], [18.15, 0.73], [18.32, 0]]), 12.15, 12.4);                              // the gallery in front of the upper tower
    wall([[16.6, -1.54], [17.26, -1.53], [18.15, -0.73], [18.32, 0], [18.15, 0.73], [17.26, 1.53], [16.6, 1.54]], 12.4, 0.5, 0.06);
    slab(sym([[14.07, 0], [14.59, 1.0], [15.4, 1.45], [16.5, 1.48], [16.78, 0.5]]).map(([x, z]) => [15.4 + (x - 15.4) * 1.07, z * 1.07]), 14.45, 14.65);   // the overhanging roof of the director house
    b.cylinder(15.7, 14.65, 0, 0.26, 0.26, 15.5, shade(sup, 0.85), MAT.HULL, { seg: 8 });                                       // the director's pedestal
  }, () => slab(lower, FD - 0.2, 6.6, shade(black, 1.1), { mat: MAT.DARK }));
  model.bridge = { x: 23.5, y: 11.0, z: 0, towerX: 16, cands: [[25.6, 10.5, 0], [25.4, 10.6, 2.0], [25.4, 10.6, -2.0], [23.9, 12.3, 0]] };
  model.superBox = { x0: 14.5, x1: 25.3, hw: 2.6, y1: 14.7 };
  note(15);
  part('director0', 'director', 'Directeur de tir', () => {
    b.cylinder(15.5, 14.65, 0, 0.55, 0.45, 15.2, shade(sup, 0.85), MAT.HULL, { seg: 14 });                                      // the pedestal
    for (const sg of [-1, 1]) b.beam([15.5, 15.15, sg * 0.75], [15.75, 16.3, sg * 0.85], 0.16, 0.16, shade(sup, 0.85), MAT.HULL);   // the yoke
    b.rod(15.2, 16.25, 16.2, 0, 0.8, 0.8, shade(sup, 0.9), MAT.HULL, { seg: 16 });                                              // the projector drum
    b.rod(16.2, 16.32, 16.2, 0, 0.7, 0.7, glass, MAT.GLASS, { seg: 16 });
  }, () => b.cylinder(15.5, 14.65, 0, 0.5, 0.4, 15.4, shade(black, 1.1), MAT.DARK, { seg: 6 }), { track: { x: 15.8, y: 16.2, z: 0 } });

  // glass strips on the faces of a plan between two heights (the facets that are listed), laid a hair proud of the wall
  const glassStrip = (poly, y0, y1, facets) => {
    let cx = 0, cz = 0; for (const q of poly) { cx += q[0] / poly.length; cz += q[1] / poly.length; }
    for (const i of facets) {
      const p = poly[i], q = poly[(i + 1) % poly.length], m = [(p[0] + q[0]) / 2 - cx, (p[1] + q[1]) / 2 - cz], l = Math.hypot(m[0], m[1]) || 1, o = [m[0] / l * 0.03, m[1] / l * 0.03];
      b.quad([p[0] + o[0], y0, p[1] + o[1]], [q[0] + o[0], y0, q[1] + o[1]], [q[0] + o[0], y1, q[1] + o[1]], [p[0] + o[0], y1, p[1] + o[1]], glass, MAT.GLASS, [cx, (y0 + y1) / 2, cz]);
    }
  };
  // the bridge's windows, portholes, bands and ladders
  {
    const cb = sym([[20.3, 0.4], [20.85, 1.18], [21.9, 1.4], [23.45, 1.0], [23.7, 0]]);
    const fw = hull2(cb);
    // facets of the compass bridge that look forward and to the sides
    const idx = []; fw.forEach((q, i) => { const r = fw[(i + 1) % fw.length]; if ((q[0] + r[0]) / 2 > 21.0) idx.push(i); });
    glassStrip(fw, 10.35, 10.95, idx);
    { const bx = rrect(19.6, 21.85, -1.1, 1.1, 0.25), fi = []; bx.forEach((q, i) => { const r = bx[(i + 1) % bx.length]; if ((q[0] + r[0]) / 2 > 21.6) fi.push(i); }); glassStrip(bx, 11.5, 12.2, fi); }
    { const dh = hull2(sym([[14.07, 0], [14.59, 1.0], [15.4, 1.45], [16.5, 1.48], [16.78, 0.5]])), fi = []; dh.forEach((q, i) => { const r = dh[(i + 1) % dh.length]; if ((q[0] + r[0]) / 2 > 15.2) fi.push(i); }); glassStrip(dh, 14.0, 14.35, fi); }   // the window band under the roof of the director house
    // three round windows in the front of the compass bridge, a lifebuoy on a post in front of it, a searchlight on a stand each side of the drum roof
    for (const z of [-0.75, 0, 0.75]) b.rod(23.3 + (0.75 - Math.abs(z)) * 0.1, 23.45 + (0.75 - Math.abs(z)) * 0.1, 10.75, z, 0.2, 0.2, glass, MAT.GLASS, { seg: 10 });
    b.cylinder(24.75, roofY, 0, 0.04, 0.04, 11.0, steel, MAT.HULL, { seg: 6 });
    for (let i = 0; i < 14; i++) { const a0 = i / 14 * Math.PI * 2, a1 = (i + 1) / 14 * Math.PI * 2; b.beam([24.75 + Math.cos(a0) * 0.42, 11.45 + Math.sin(a0) * 0.42, 0], [24.75 + Math.cos(a1) * 0.42, 11.45 + Math.sin(a1) * 0.42, 0], 0.09, 0.1, shade(sup, 1.2), MAT.HULL); }
    for (const sg of [-1, 1]) {
      const zc = sg * 2.25;
      for (const [dx, dz] of [[0.35, 0.3], [-0.35, 0.3], [0, -0.35]]) b.beam([22.4 + dx, roofY, zc + dz], [22.4, 10.55, zc], 0.05, 0.05, steel, MAT.HULL);
      b.rod(22.2, 22.75, 10.75, zc, 0.3, 0.3, shade(sup, 0.9), MAT.HULL, { seg: 10 }); b.rod(22.72, 22.8, 10.75, zc, 0.24, 0.24, rgb('#cfd3c4'), MAT.EMISSIVE, { seg: 10 });
    }
    // the two bands round the drum of the lower bridge and the windows of the lower house
    const drum = sym([[22.0, 2.55], [23.2, 2.6], [24.1, 2.6], [24.6, 2.5], [24.9, 2.2], [25.1, 1.8], [25.2, 1.2], [25.23, 0]]);
    for (const y of [8.3, 9.0]) slab(drum.map(([x, z]) => [x + Math.sign(x - 23.6) * 0.04, z * 1.012]), y, y + 0.14, shade(sup, 0.82));
    fine(() => {
      for (const sg of [-1, 1]) {
        for (const x of [16.9, 17.9, 18.9, 19.9]) b.rodZ(x, 8.4, sg * 1.84, sg * 1.9, 0.14, 0.14, glass, MAT.GLASS, { seg: 8 });
        for (let x = 17.8; x < 22.1; x += 1.1) b.rodZ(x, 6.3, sg * 2.57, sg * 2.62, 0.14, 0.14, glass, MAT.GLASS, { seg: 8 });
        for (let x = 22.6; x < 25; x += 0.9) b.block({ x0: x, x1: x + 0.5, hw: 0.04, zc: sg * (2.58 + 0.03), y0: 8.55, y1: 9.0 }, glass, MAT.GLASS);
        DT.ladder(b, 15.2, 5.3, 9.4, sg * 2.5, steel);
        // the rail of the lobes and of the roof of the director house
        DT.roofRail(b, 15.7, 9.45, sg * 2.85, 1.0, 1.0, shade(sup, 0.9), { h: 0.6 });
      }
      DT.roofRail(b, 15.4, 14.65, 0, 1.3, 1.35, shade(sup, 0.95), { h: 0.9 });
    });
  }

  // ---- the funnel: a big oval, swept back, its foot flowing into the casing ----
  const frows = [
    { y: 7.28, xa: 4.05, xf: 12.76, hw: 1.62, p: 2.3 }, { y: 7.6, xa: 4.05, xf: 12.35, hw: 1.65, p: 2.3 },
    { y: 8.0, xa: 4.06, xf: 11.7, hw: 1.65, p: 2.3 }, { y: 8.5, xa: 4.0, xf: 10.9, hw: 1.65, p: 2.3 }, { y: 9.0, xa: 3.91, xf: 10.1, hw: 1.65, p: 2.3 },
    { y: 9.5, xa: 3.84, xf: 9.75, hw: 1.65, p: 2.3 }, { y: 10.0, xa: 3.77, xf: 9.61, hw: 1.66, p: 2.3 }, { y: 11.0, xa: 3.63, xf: 9.48, hw: 1.66, p: 2.3 }, { y: 11.4, xa: 3.6, xf: 9.45, hw: 1.66, p: 2.3 },
  ];
  const fTop = (x) => 11.4 + (x - 3.6) * (1.0 / 5.85);                      // the top is cut on a slope, higher in front
  const funnelCol = shade(sup, 0.96);
  part('funnel0', 'funnel', 'Cheminée', () => {
    loft(b, frows, funnelCol, MAT.HULL, { topY: (x) => fTop(x) });
    // the inside of the stack: a dark wall, the floor and the three uptake cones
    loft(b, frows.filter((r) => r.y >= 9.5).map((r) => ({ ...r, xa: r.xa + 0.06, xf: r.xf - 0.06, hw: r.hw - 0.06 })), shade(black, 0.8), MAT.DARK, { topY: (x) => fTop(x), flip: true });
    b.cyl(6.65, 9.55, 0, 2.9, 1.55, 2.9, 1.55, 9.7, shade(black, 0.7), MAT.DARK, { seg: 20 });
    for (const x of [5.35, 6.95, 8.55]) b.cylinder(x, 9.7, 0, 0.78, 0.05, 10.25, shade(steel, 0.8), MAT.HULL, { seg: 14 });
    // the collar of the rim and the hoop round the stack, both sloping with the top
    loft(b, [{ yf: (x) => fTop(x) - 0.22, xa: 3.55, xf: 9.5, hw: 1.7, p: 2.3 }, { yf: (x) => fTop(x) - 0.02, xa: 3.55, xf: 9.5, hw: 1.7, p: 2.3 }], shade(funnelCol, 1.12), MAT.HULL, { n: 28 });
    loft(b, [{ yf: (x) => fTop(x) - 1.28, xa: 3.58, xf: 9.48, hw: 1.69, p: 2.3 }, { yf: (x) => fTop(x) - 1.2, xa: 3.58, xf: 9.48, hw: 1.69, p: 2.3 }], shade(funnelCol, 1.15), MAT.HULL, { n: 28 });
    for (const z of [0.6, -0.66]) { let q = [9.6, 12.2, z]; for (const [y, x] of [[11, 9.62], [10, 9.75], [9.5, 9.89], [9, 10.24], [8.5, 11.04], [8, 11.84], [7.6, 12.5], [7.32, 12.9]]) { const p = [x, y, z]; b.beam(q, p, 0.28, 0.28, shade(funnelCol, 0.9), MAT.HULL); q = p; } }   // the two steam pipes down the front, following the foot of the stack
    b.cylinder(9.1, 12.15, -0.66, 0.07, 0.07, 12.95, steel, MAT.HULL, { seg: 8 });                                      // the siren on the front of the rim: a stem and a horn that points ahead
    b.rod(8.6, 9.77, 13.0, -0.66, 0.07, 0.4, shade(steel, 1.1), MAT.HULL, { seg: 12 });
    b.rod(9.7, 9.8, 13.0, -0.66, 0.42, 0.42, shade(steel, 0.9), MAT.HULL, { seg: 12 });
  }, () => b.cylinder(6.5, 7.28, 0, 1.6, 1.2, 9.2, shade(black, 1.1), MAT.DARK, { seg: 8 }), {
    fine: () => {
      // the two half hoops over the top of the stack and the cross bars
      for (const x of [5.3, 7.1, 8.7]) { let q = null; for (let i = 0; i <= 8; i++) { const z = -1.5 + 3.0 * i / 8, y = fTop(x) + 0.55 * (1 - (z / 1.5) ** 2); const p = [x, y, z]; if (q) DT.stay(b, q, p, shade(steel, 0.9), 0.05); q = p; } }
      DT.stay(b, [3.7, fTop(3.7) + 0.02, 0], [9.4, fTop(9.4) + 0.02, 0], shade(steel, 0.9), 0.06);
      DT.ladder(b, 9.62, 9.7, 12.2, 0.9, steel);                                                                         // the ladder up the front
      for (const z of [0.5, 0.62]) b.rod(9.62, 9.64, 9.7, z, 0.045, 0.045, steel, MAT.HULL, { seg: 6 });
    },
  });
  model.smoke.push([6.4, 12.4, 0]);
  note(12.7);

  // ---- the masts: the foremast is a pole from the funnel's front with two legs down to the roof of the director house, the mainmast a pole with a bipod of legs ----
  const sc = shade(dark, 1.3), mastc = rgb(pal.mast);
  const rod3 = (p, q, r, col = mastc) => b.beam(p, q, r * 2, r * 2, col, MAT.HULL);
  part('mast0', 'mast', 'Mât avant', () => {
    const apex = [12.62, 23.1, 0];
    rod3([12.42, 7.9, 0], [12.66, 23.4, 0], 0.11);                                                  // the pole: a thin, almost upright pole
    b.cylinder(12.66, 23.35, 0, 0.05, 0.02, 24.8, mastc, MAT.HULL, { seg: 6 });
    for (const sg of [-1, 1]) {                                                                          // the legs from the corners of the aerial frame down to the roof of the director house
      rod3([12.7, 23.0, sg * 2.4], [15.0, 14.7, sg * 1.45], 0.15);
      rod3([12.62, 23.0, sg * 1.3], [15.0, 14.7, sg * 0.62], 0.12);
    }
    rod3([14.5, 9.7, 0], [12.85, 21.0, 0], 0.1, shade(mastc, 0.9));                                  // the mast ladder
    // the spreaders of the aerial at the head: two bars, four hanging tubes
    b.rodZ(12.65, 23.3, -2.6, 2.6, 0.08, 0.08, mastc, MAT.HULL, { seg: 6 });
    b.rodZ(12.55, 20.0, -2.6, 2.6, 0.08, 0.08, mastc, MAT.HULL, { seg: 6 });
    for (const z of [-2.4, -1.3, 1.3, 2.4]) b.cylinder(12.6, 20.0, z, 0.15, 0.15, 23.3, mastc, MAT.HULL, { seg: 8 });
    for (const sg of [-1, 1]) { DT.stay(b, [12.45, 23.2, sg * 0.2], [12.5, 20.2, sg * 2.4], sc, 0.05); DT.stay(b, [12.45, 21.0, sg * 0.1], [12.5, 20.1, sg * 1.3], sc, 0.04); }
    b.box(12.9, 18.3, 0.0, 0.3, 0.5, 0.35, shade(sup, 0.85), MAT.HULL); b.box(13.1, 16.5, 0, 0.25, 0.35, 0.3, shade(sup, 0.85), MAT.HULL);   // lamps and boxes on the pole
  }, () => b.cylinder(12.0, 8.0, 0, 0.35, 0.2, 11.5, shade(black, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      // the shrouds: a fan of wires from the head to the foot of the mast
      for (const z of [0, 0.3, 0.55, 0.8, 1.1, 1.65]) for (const sg of z ? [-1, 1] : [1]) DT.stay(b, [12.43, 22.8, sg * z * 0.25], [12.3 + z * 0.15, 7.4 + (z > 1.5 ? 0.9 : 0), sg * z], sc, 0.045);
      // the long aerial to the mainmast, sagging, and the stays forward to the bridge
      let q = [12.65, 23.3, 0];
      for (let i = 1; i <= 12; i++) { const t = i / 12, x = 12.65 + (-29.7 - 12.65) * t, y = 23.3 + (20.0 - 23.3) * t - 1.1 * Math.sin(Math.PI * t), p = [x, y, 0]; DT.stay(b, q, p, sc, 0.09); q = p; }
      for (const sg of [-1, 1]) DT.stay(b, [12.4, 22.2, sg * 0.1], [18.2, 12.45, sg * 0.5], sc, 0.04);
    },
  });
  part('mast1', 'mast', 'Mât arrière', () => {
    rod3([-29.65, 5.8, 0], [-29.65, 20.0, 0], 0.12);                                                // the upright pole
    rod3([-26.65, 6.2, 0], [-29.55, 19.7, 0], 0.17);                                                // the strut that leans against it
    rod3([-29.6, 19.7, 0], [-30.25, 22.9, 0], 0.06);
    for (const sg of [-1, 1]) {
      rod3([-28.95, 5.9, sg * 1.65], [-29.55, 19.5, 0], 0.08);                                        // the legs of the bipod
      rod3([-27.0, 5.9, sg * 1.55], [-28.7, 18.2, sg * 0.2], 0.07);
    }
    rod3([-27.2, 6.3, 0], [-30.85, 14.8, 0], 0.14);                                                 // the gaff of the ensign
    b.rodZ(-29.0, 19.4, -2.2, 2.2, 0.04, 0.04, mastc, MAT.HULL, { seg: 6 });                          // the spreader
    PT.ensign(b, { x: -30.9, y: 14.8, z: 0, len: 2.5, h: 2.0 });
  }, () => b.cylinder(-27.0, 5.25, 0, 0.35, 0.2, 8.5, shade(black, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      DT.stay(b, [-29.5, 19.6, 0], [-18.8, 5.3, 0], sc, 0.12);                                         // the stay down to the torpedo banks
      DT.stay(b, [-30.25, 22.8, 0], [-39.6, 3.6, 0], sc, 0.12);                                        // and the backstay aft
    },
  });
  note(23);

  // ---- the machine-gun platform abaft the funnel: two lobes on a waist across the whole beam, held up by a pillar each ----
  for (const sg of [-1, 1]) {
    b.cylinder(-0.75, 5.1, sg * 3.1, 2.05, 2.05, 5.25, sup, MAT.HULL, { seg: 22 });
    b.cylinder(-0.9, MD, sg * 3.4, 0.3, 0.3, 5.1, shade(sup, 0.8), MAT.HULL, { seg: 8 });
    wall(arc(-0.75, sg * 3.1, 2.0, sg > 0 ? -40 : 140, sg > 0 ? 220 : 400, 14), 5.25, 0.95, 0.07);
  }
  slab([[-2.2, -3.1], [0.6, -3.1], [0.6, 3.1], [-2.2, 3.1]], 5.1, 5.25);

  // ---- the forecastle: the raised round deck of the gun, rails, windlass, chains, bollards, hawse holes, posts and the little boat ----
  {
    const clampZ = (x, z) => Math.sign(z) * Math.min(Math.abs(z), hull.halfBeamDeck(x) - 0.2);
    slab(hull2(ellipse(30.1, 0, 4.6, 4.6, 36).map(([x, z]) => [x, clampZ(x, z)])), Y(30) - 0.2, Y(30) + 0.12);               // the round deck the turret stands on
    for (let i = 0; i < 14; i++) {                                                                                           // the curved spray screen in front of the gun, highest on the centre line
      const a0 = (-70 + i * 10) * Math.PI / 180, a1 = a0 + 10 * Math.PI / 180, am = (a0 + a1) / 2, h = 0.25 + 1.0 * Math.cos(am * 1.25), r = 4.55;
      const p = [30.35 + Math.cos(a0) * r, Math.sin(a0) * r], q = [30.35 + Math.cos(a1) * r, Math.sin(a1) * r];
      if (Math.abs(p[1]) > hull.halfBeamDeck(p[0]) - 0.3 || Math.abs(q[1]) > hull.halfBeamDeck(q[0]) - 0.3) continue;
      b.beam([p[0], Y(30) + 0.12 + h / 2, p[1]], [q[0], Y(30) + 0.12 + h / 2, q[1]], 0.06, h, shade(sup, 0.8), MAT.HULL);
    }
    const ds = Y(42) - 0.05;
    for (const sg of [-1, 1]) {
      b.cylinder(42.2, ds, sg * 1.15, 0.55, 0.5, ds + 0.55, shade(black, 1.2), MAT.DARK, { seg: 14 });                       // the cable holders of the windlass
      b.cylinder(42.2, ds + 0.55, sg * 1.15, 0.35, 0.3, ds + 0.8, shade(steel, 1.0), MAT.HULL, { seg: 12 });
      for (const [x, z] of [[44.9, sg * 1.15], [37.0, sg * 3.15], [40.2, sg * 3.3], [31.6, sg * 3.9]]) b.cylinder(x, Y(x) - 0.05, z, 0.25, 0.22, Y(x) + 0.7, shade(sup, 0.7), MAT.HULL, { seg: 10 });   // bitts and bollards
      for (const x of [45.7, 47.8]) b.block({ x0: x - 0.25, x1: x + 0.25, hw: 0.25, zc: sg * (x > 47 ? 0.65 : 0.7), y0: Y(x) - 0.05, y1: Y(x) + 0.18 }, shade(black, 1.3), MAT.DARK);   // the chain stoppers
      b.cyl(48.9, Y(48.9) - 0.3, sg * 2.3, 0.2, 0.2, 0.5, 0.5, Y(48.9) + 0.02, shade(black, 1.1), MAT.DARK, { seg: 14 });   // the hawse hole: a bell mouth in the deck
      b.rodZ(35.05, 6.15, sg * 1.2, sg * 1.8, 0.5, 0.5, shade(sup, 0.7), MAT.HULL, { seg: 14 });                              // the two cable reels at the front of the turret deck
      b.rodZ(35.05, 6.15, sg * 1.17, sg * 1.22, 0.6, 0.6, shade(sup, 0.6), MAT.HULL, { seg: 14 }); b.rodZ(35.05, 6.15, sg * 1.78, sg * 1.83, 0.6, 0.6, shade(sup, 0.6), MAT.HULL, { seg: 14 });
    }
    // the little boat on the centre line forward of the turret
    boat(38.45, 0, 3.3, 0.95, Y(38.45) - 0.05, Y(38.45) + 0.55, { davits: false });
  }
  fine(() => {
    // three rails with stanchions round the forecastle and along the main deck, and the tall posts of the awning
    const rail3 = (x0, x1, step, h = [0.2, 0.5, 0.87]) => {
      for (const sg of [-1, 1]) {
        let prev = null;
        for (let x = x0; (x1 > x0 ? x <= x1 + 1e-6 : x >= x1 - 1e-6); x += x1 > x0 ? step : -step) {
          const hb = hull.halfBeamDeck(x) - 0.1, d = Y(x) - 0.06;
          if (hb < 0.15) { prev = null; continue; }
          b.beam([x, d, sg * hb], [x, d + h[2] + 0.03, sg * hb], 0.06, 0.06, shade(sup, 0.95), MAT.HULL, { caps: false });
          const cur = h.map((hh) => [x, d + hh, sg * hb]);
          if (prev) h.forEach((hh, k) => b.beam(prev[k], cur[k], 0.05, 0.05, shade(sup, 0.95), MAT.HULL, { caps: false }));
          prev = cur;
        }
      }
    };
    rail3(10.8, 52.2, 1.65);
    for (const [x, hh] of [[34.5, 2.5], [44.0, 2.5], [47.4, 2.6], [50.0, 2.7], [51.7, 2.8]]) for (const sg of [-1, 1]) b.cylinder(x, Y(x) - 0.06, sg * (hull.halfBeamDeck(x) - 0.12), 0.045, 0.03, Y(x) + hh, shade(sup, 0.95), MAT.HULL, { seg: 5 });
    b.cylinder(52.7, Y(52.7) - 0.1, 0, 0.05, 0.03, Y(52.7) + 3.4, shade(sup, 1.2), MAT.HULL, { seg: 6 });                        // the staff at the stem
    b.cylinder(50.6, Y(50.6) - 0.1, 0, 0.04, 0.03, Y(50.6) + 3.0, shade(sup, 1.2), MAT.HULL, { seg: 6 });
    // the anchor chains: two lines of links from each cable holder to the hawse hole
    for (const sg of [-1, 1]) for (const dz of [-0.17, 0.17]) { const p = [42.6, Y(42.6) + 0.06, sg * 1.15 + dz], q = [48.7, Y(48.7) + 0.06, sg * 2.2 + dz * 0.4]; b.beam(p, q, 0.07, 0.05, shade(sup, 0.65), MAT.HULL, { caps: false }); }
    // the stockless anchors lying in their recesses on each side of the bow
    for (const sg of [-1, 1]) {
      const hx = 48.0, hy = 5.1, hz = sg * (hull.sideZ(hx, hy) + 0.02), ac = shade(black, 1.9);
      b.rodZ(hx, hy, hz, hz + sg * 0.06, 0.34, 0.34, shade(black, 1.0), MAT.DARK, { seg: 14 });                            // the mouth of the hawse pipe
      const zz = hz + sg * 0.17;
      b.beam([hx + 0.25, hy + 0.1, zz], [hx - 1.25, hy - 1.1, zz], 0.17, 0.12, ac, MAT.DARK);                              // the shank
      b.beam([hx - 1.0, hy - 0.95, zz], [hx - 1.55, hy - 1.55, zz + sg * 0.06], 0.7, 0.1, ac, MAT.DARK);                    // the flukes
      b.beam([hx - 0.5, hy - 0.5, zz + sg * 0.02], [hx - 0.95, hy + 0.25, zz + sg * 0.02], 0.12, 0.1, ac, MAT.DARK);        // an arm
    }
  });

  // ---- the boats on their davits beside the funnel: a launch with a shelter to starboard, an open one to port ----
  boat(6.3, 3.78, 7.0, 2.45, 3.72, 5.2, { decked: true, cabin: true });
  boat(5.2, -3.85, 8.15, 2.1, 3.98, 5.2, {});
  for (const sg of [-1, 1]) {
    raft(20.7, 7.05, sg > 0 ? 4.62 : -5.18, 3.2, 1.9, 0.56);                                                      // the life floats on the sides of the bridge
    raft(-33.2, 4.9, sg > 0 ? 4.44 : -5.01, 3.8, 2.4, 0.57);                                                       // and on the wings of the aft house
  }

  // ---- the aft deckhouse: a rounded house with the turret on its roof, wings to the sides, a rail all round ----
  {
    const D = sym([[-28.61, 0], [-29.02, 1.28], [-30.1, 2.07], [-30.8, 2.18], [-36.1, 2.18], [-37.3, 2.03], [-38.5, 1.48], [-39.26, 0.78], [-39.58, 0]]);
    slab(D, MD - 0.1, 5.2);
    for (const sg of [-1, 1]) slab(hull2([[-35.84, sg * 2.18], [-33.81, sg * 4.23], [-31.17, sg * 4.38], [-29.73, sg * 3.24], [-29.16, sg * 2.79], [-30.1, sg * 2.07], [-35.0, sg * 2.1]]), 5.1, 5.25);
    slab(D, 5.15, 5.25);
    const path = [];
    for (const sg of [1, -1]) { const hp = [[-29.16, 2.79], [-31.17, 4.38], [-33.81, 4.23], [-35.84, 2.18], [-37.31, 2.03], [-38.48, 1.48], [-39.1, 0.8], [-39.3, 0]]; (sg > 0 ? hp : hp.slice().reverse()).forEach(([x, z]) => path.push([x, sg * z])); }
    wall(path, 5.25, 1.15, 0.08);
    wall([[-29.16, 2.79], [-28.8, 1.6], [-28.7, 0.7], [-28.7, -0.7], [-28.8, -1.6], [-29.16, -2.79]], 5.25, 1.0, 0.07);
    // the little deck of the mainmast between the house and the torpedo bank
    b.block({ x0: -26.9, x1: -26.6, hw: 1.63, y0: 5.2, y1: 6.3 }, shade(sup, 0.85), MAT.HULL);
  }
  // the roof of the aft house: two cable reels at the stern end, a row of lockers on the port side, the helm pedestal, the stairs up from the deck
  for (const sg of [-1, 1]) {
    b.rod(-37.9, -36.8, 5.7, sg * 0.7, 0.42, 0.42, shade(sup, 0.75), MAT.HULL, { seg: 14 });
    b.rod(-37.95, -37.85, 5.7, sg * 0.7, 0.55, 0.55, shade(sup, 0.65), MAT.HULL, { seg: 14 }); b.rod(-36.85, -36.75, 5.7, sg * 0.7, 0.55, 0.55, shade(sup, 0.65), MAT.HULL, { seg: 14 });
  }
  [[-36.3, 0.95], [-35.4, 0.85], [-34.5, 0.75], [-33.6, 0.65]].forEach(([x, h]) => b.block({ x0: x - 0.4, x1: x + 0.4, hw: 0.4, zc: -1.65, y0: 5.25, y1: 5.25 + h }, shade(sup, 0.88), MAT.HULL));
  b.cylinder(-29.8, 5.25, 0, 0.12, 0.1, 6.3, shade(sup, 0.7), MAT.HULL, { seg: 8 }); b.sphere(-29.8, 6.4, 0, 0.18, 0.18, 0.18, shade(sup, 0.75), MAT.HULL, { seg: 8, rings: 5 });
  fine(() => { for (const sg of [-1, 1]) DT.ladder(b, -28.6, MD, 5.25, sg * 2.0, steel); });

  // ---- the quarterdeck: winch platform, depth-charge throwers, vents, bollards, the staff ----
  {
    const d = MD - 0.02;
    slab(rrect(-42.7, -40.3, -1.05, 1.05, 0.12), d, d + 0.3, shade(sup, 0.8));
    for (const x of [-42.1, -40.9]) for (const sg of [-1, 1]) {                                                            // the four cable reels of the winch lie on their sides, a gear case between each pair
      b.rodZ(x, d + 0.75, sg * 0.18, sg * 0.98, 0.42, 0.42, shade(sup, 0.7), MAT.HULL, { seg: 14 });
      b.rodZ(x, d + 0.75, sg * 0.14, sg * 0.2, 0.52, 0.52, shade(sup, 0.6), MAT.HULL, { seg: 14 }); b.rodZ(x, d + 0.75, sg * 0.94, sg * 1.0, 0.52, 0.52, shade(sup, 0.6), MAT.HULL, { seg: 14 });
    }
    b.block({ x0: -42.5, x1: -40.5, hw: 0.17, y0: d + 0.3, y1: d + 1.15 }, shade(sup, 0.7), MAT.HULL);
    for (const sg of [-1, 1]) {
      b.cylinder(-45.0, d, sg * 1.9, 0.55, 0.65, d + 0.28, shade(sup, 0.8), MAT.HULL, { seg: 14 });                                 // the thrower: a ring and an inclined cradle of tubes
      b.cylinder(-45.0, d + 0.28, sg * 1.9, 0.3, 0.3, d + 0.55, shade(black, 1.2), MAT.DARK, { seg: 8 });
      b.beam([-45.0, d + 0.5, sg * 1.9], [-44.65, d + 1.35, sg * 2.15], 0.5, 0.4, shade(sup, 0.75), MAT.HULL);
      b.cylinder(-46.6, d, sg * 1.25, 0.15, 0.15, d + 1.2, shade(sup, 0.8), MAT.HULL, { seg: 8 });                                  // the bent vent pipes
      b.cyl(-46.6, d + 1.2, sg * 1.25, 0.15, 0.15, 0.3, 0.3, d + 1.55, shade(sup, 0.8), MAT.HULL, { seg: 10 });
      for (const [x, z] of [[-49.2, sg * 1.7], [-46.6, sg * 2.4], [-37.9, sg * 2.75]]) for (const dx of [-0.22, 0.22]) b.cylinder(x + dx, d, z, 0.16, 0.13, d + 0.55, shade(sup, 0.7), MAT.HULL, { seg: 8 });
    }
    b.beam([-51.9, d, 0], [-53.4, d + 4.4, 0], 0.08, 0.08, shade(sup, 1.2), MAT.HULL);                                   // the ensign staff, raked aft
  }
  fine(() => {
    const rail3b = (x0, x1, h) => {
      for (const sg of [-1, 1]) {
        let prev = null;
        for (let x = x0; x >= x1; x -= 1.65) {
          const hb = hull.halfBeamDeck(x) - 0.12, d = Y(x) - 0.06;
          if (hb < 0.2) { prev = null; continue; }
          b.beam([x, d, sg * hb], [x, d + h[2] + 0.03, sg * hb], 0.06, 0.06, shade(sup, 0.95), MAT.HULL, { caps: false });
          const cur = h.map((hh) => [x, d + hh, sg * hb]);
          if (prev) h.forEach((hh, k) => b.beam(prev[k], cur[k], 0.05, 0.05, shade(sup, 0.95), MAT.HULL, { caps: false }));
          prev = cur;
        }
      }
    };
    rail3b(10.2, -51.6, [0.3, 0.6, 1.0]);
    // across the stern
    { const x = -51.7, d = Y(x) - 0.06; for (const hh of [0.3, 0.6, 1.0]) b.beam([x, d + hh, -hull.halfBeamDeck(x) + 0.1], [x, d + hh, hull.halfBeamDeck(x) - 0.1], 0.035, 0.035, shade(sup, 1.1), MAT.HULL, { caps: false }); }
  });

  // the scuttles of the forecastle sides: two rows, 0.3 m across, about 1.6 m apart, the upper one following the sheer
  fine(() => {
    const port = (x, y) => { for (const sg of [-1, 1]) { const z = hull.sideZ(x, y) + 0.015; b.rodZ(x, y, sg * z, sg * (z + 0.05), 0.17, 0.17, shade(hullc, 1.18), MAT.HULL, { seg: 10 }); b.rodZ(x, y, sg * (z + 0.03), sg * (z + 0.07), 0.115, 0.115, shade(black, 0.8), MAT.DARK, { seg: 10 }); } };
    for (let x = 21.2; x < 49; x += 1.62) port(x, Y(x) - 0.55);
    for (let x = 23.4; x < 47.5; x += 1.62) port(x, 2.6 + (x - 24) * 0.012);
  });

  // ---- the sponsons of the machine guns beside the funnel, bulging past the sides of the forecastle deck, and the cowl vents on the main deck ----
  for (const sg of [-1, 1]) {
    b.cylinder(12.25, 5.0, sg * 3.75, 1.95, 1.95, 5.2, sup, MAT.HULL, { seg: 22 });
    for (const dx of [-1.0, 1.0]) b.beam([12.25 + dx, 4.55, sg * 4.9], [12.25 + dx, 5.05, sg * 5.5], 0.14, 0.18, shade(sup, 0.8), MAT.HULL);
    wall(arc(12.25, sg * 3.75, 1.9, sg > 0 ? 20 : 200, sg > 0 ? 160 : 340, 8), 5.2, 0.8, 0.06);
  }
  for (const x of [-3.45, -9.0, -18.4, -24.4]) for (const sg of [-1, 1]) {
    const z = sg * 2.05, y = MD;
    b.cylinder(x, y, z, 0.2, 0.17, y + 0.75, shade(sup, 0.78), MAT.HULL, { seg: 8 });
    b.cyl(x, y + 0.75, z, 0.17, 0.17, 0.3, 0.3, y + 1.15, shade(sup, 0.8), MAT.HULL, { seg: 12 });
  }

  for (const x of [-6.85, -4.65]) for (const sg of [-1, 1]) b.block({ x0: x - 0.82, x1: x + 0.82, hw: 0.22, zc: sg * 1.98, y0: MD - 0.05, y1: MD + 0.32 }, shade(sup, 0.85), MAT.HULL);   // the lockers abaft the funnel platform
  // ---- the two banks of triple torpedo tubes, each on a round carriage, and the round deckhouse of the star-shell gun between them ----
  const bank = (i, xc, dir) => {                // dir: which way the noses of the tubes point (the banks are mirror images of each other about the round deckhouse)
    part('tubes' + i, 'tubes', 'Tubes lance-torpilles', () => {
      b.cyl(xc, MD, 0, 1.75, 1.75, 1.3, 1.3, 4.2, shade(sup, 0.82), MAT.HULL, { seg: 20 });                          // the carriage ring
      slab(rrect(xc - 0.85, xc + 0.85, -1.7, 1.7, 0.15), 4.1, 4.25);
      for (const z of [-1.7, 1.7]) b.block({ x0: xc - 0.85, x1: xc + 0.85, hw: 0.04, zc: z, y0: 4.1, y1: 5.45 }, shade(sup, 0.9), MAT.HULL);
      for (const x of [xc - 0.85, xc + 0.85]) b.block({ x0: x - 0.04, x1: x + 0.04, hw: 1.7, y0: 4.1, y1: 5.45 }, shade(sup, 0.9), MAT.HULL);
      for (const z of [-0.69, 0, 0.69]) {
        const x0 = xc - dir * 3.65, x1 = xc + dir * 3.65, x2 = xc + dir * 4.7;
        b.rod(Math.min(x0, x1), Math.max(x0, x1), 4.8, z, 0.27, 0.27, shade(sup, 1.05), MAT.HULL, { seg: 12 });
        dir > 0 ? b.rod(x1, x2, 4.8, z, 0.27, 0.16, shade(sup, 0.95), MAT.HULL, { seg: 12 }) : b.rod(x2, x1, 4.8, z, 0.16, 0.27, shade(sup, 0.95), MAT.HULL, { seg: 12 });   // the nose
        const cap = dir > 0 ? [x0 - 0.1, x0] : [x0, x0 + 0.1];
        b.rod(cap[0], cap[1], 4.8, z, 0.2, 0.2, shade(sup, 0.8), MAT.HULL, { seg: 12 });
      }
    }, () => b.box(xc, 4.0, 0, 2.4, 1.0, 3.2, shade(black, 1.1), MAT.DARK));
    model.tubes.push({ x: xc, y: 4.8, z: 0, n: 3, side: 0 });
  };
  model.tubes.length = 0;
  bank(0, -8.875, 1); bank(1, -21.525, -1);
  {
    slab(rrect(-17.3, -13.73, -1.68, 1.68, 0.5), MD - 0.1, 5.2);                                                        // the round deckhouse's trunk
    const plate = [...ellipse(-15.65, 0, 3.0, 3.2, 28), [-13.15, 1.66], [-11.6, 1.66], [-11.6, -1.66], [-13.15, -1.66]];
    slab(hull2(plate), 5.15, 5.3);
    wall([...arc(-15.65, 0, 3.0, 62, 298, 20).map(([x, z]) => [x, z * 3.2 / 3.0]), [-13.15, -1.66], [-11.6, -1.66], [-11.6, 1.66], [-13.15, 1.66], [-14.2, 2.7]], 5.3, 1.1, 0.08);
  }
  b.group('fine', () => fineFns.forEach((fn) => fn()));
}

// Vincenzo Gioberti (Oriani class, 1937; hull, structures and positions measured in metres on cuts, plan slices and orthographic views of a reference model, about +-0.2 m): a forecastle 5.2-6.1 m
// over the waterline running to 0.402 and a main deck 3.05 m over the waterline abaft it, a transom stern, the twin 120 mm turrets at 0.2188 (on a round raised deck) and 0.8085 (on the roof of
// the after deckhouse), the bridge 0.24-0.40 (a lower house, a lower bridge with a rounded drum, the compass bridge, a round tower to 14.65 m with the director), the pole foremast at 0.3875
// (24.8 m) with its aerial frame, the big oval funnel at 0.4386 (8.4 x 3.3 m, its top cut on a slope, 11.4-12.4 m), the two torpedo banks at 0.5817 / 0.7003 round the deckhouse of the
// star-shell gun at 0.65, the machine-gun platforms, boats, rafts, the winch and depth-charge throwers aft and the mainmast at 0.7503 (22.9 m)
export const GIOBERTI = {
  mainVariant: 'it120o', dirKind: 'drum', own: true, ownTubes: true, aa: [{ k: 'm13', f: 0.3523, z: 2.85, y: 4.4, noTub: true }, { k: 'm13', f: 0.3877, z: 3.8, y: 0.1, noTub: true }, { k: 'm13', f: 0.5066, z: 3.1, y: 2.2, noTub: true }], bulwark: 0, camber: 0.03, bow: { rake: 2.45, forefoot: 1.1 }, mid: { pb: 1.4, pbRun: 0.9, pbEntry: 1.3 }, stern: { overhang: 3.75, tail: 2.8, oex: 0.3 },
  fb: [[0, 6.08], [0.025, 5.98], [0.05, 5.88], [0.075, 5.8], [0.1, 5.7], [0.15, 5.58], [0.2, 5.48], [0.25, 5.38], [0.3, 5.3], [0.35, 5.25], [0.4, 5.2], [0.4035, 3.04], [0.5, 3.04], [1, 3.04]],
  planDeck: [[0,0], [0.004,0.09], [0.01,0.193], [0.02,0.285], [0.03,0.364], [0.04,0.44], [0.05,0.503], [0.07,0.583], [0.09,0.655], [0.12,0.741], [0.15,0.794], [0.2,0.857], [0.25,0.89], [0.3,0.917], [0.35,0.938], [0.4,1.014], [0.45,0.984], [0.5,0.996], [0.55,1], [0.6,0.994], [0.65,0.985], [0.7,0.962], [0.75,0.93], [0.8,0.882], [0.85,0.816], [0.88,0.764], [0.91,0.7], [0.93,0.649], [0.95,0.583], [0.96,0.545], [0.97,0.503], [0.98,0.446], [0.99,0.391], [1,0.096]],
  planWL: [[0,0], [0.004,0.01], [0.01,0.031], [0.02,0.063], [0.03,0.094], [0.04,0.124], [0.05,0.15], [0.07,0.21], [0.09,0.262], [0.12,0.343], [0.15,0.419], [0.2,0.54], [0.25,0.653], [0.3,0.759], [0.35,0.843], [0.4,0.905], [0.45,0.95], [0.5,0.982], [0.55,0.989], [0.6,0.983], [0.65,0.971], [0.7,0.951], [0.75,0.924], [0.8,0.884], [0.85,0.826], [0.88,0.777], [0.91,0.717], [0.93,0.65], [0.95,0.516], [0.96,0.418], [0.97,0.326], [0.98,0.234], [0.99,0.138], [1,0.011]],
  keel: [[0, 0], [0.0229, 0.1], [0.0295, 0.14], [0.0335, 0.98], [0.05, 1], [0.8, 1], [0.825, 0.93], [0.85, 0.73], [0.875, 0.52], [0.9, 0.34], [0.925, 0.2], [0.95, 0.12], [1, 0]],
  props: [{ f: 0.944, z: 1.65, depth: 2.0, d: 2.6, blades: 3, toF: 0.86, strutF: 0.935 }],
  rudders: [{ f: 0.9677, z: 0, top: 0.1, bottom: 3.5, chord: 3.1, t: 0.2 }],
  extra: giobertiExtras,
};
