// adams: the tweaks of the adams model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// The helpers of the builder are passed to `extra(ctx)`.

// ---- small helpers: plans are starboard half outlines [[x, z >= 0], ...] from aft to fore (x along the ship, bow +, z to starboard), heights are metres over the waterline ----

const fnOf = (v) => (typeof v === 'function' ? v : () => v);
/** a starboard half outline mirrored to port as one closed polygon */
const full = (half) => [...half.map(([x, z]) => [x, -z]), ...half.slice().reverse().map(([x, z]) => [x, z])].filter((q, i, a) => !i || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-6);

/**
 * A vertical-walled solid on a plan, its foot yb and its top yt flat or sloped (numbers or functions of x: the decks of the ship follow the sheer). `half` is a starboard half outline
 * (mirrored), or with o.whole a full polygon. The solid is recorded for the audits.
 */
function sprism(c, half, yb, yt, col, o = {}) {
  const { b } = c, poly = o.whole ? half : full(half), fb = fnOf(yb), ft = fnOf(yt), n = poly.length, mat = o.mat ?? c.MAT.HULL;
  let cx = 0, cz = 0, lo = 1e9, hi = -1e9;
  for (const [x, z] of poly) { cx += x; cz += z; }
  cx /= n; cz /= n;
  for (const [x] of poly) { lo = Math.min(lo, fb(x)); hi = Math.max(hi, ft(x)); }
  const ref = [cx, (lo + hi) / 2, cz], sc = o.sideCol || col;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % n];
    b.quad([x0, fb(x0), z0], [x1, fb(x1), z1], [x1, ft(x1), z1], [x0, ft(x0), z0], sc, mat, ref);
    if (o.top !== false) b.triFlat([cx, ft(cx), cz], [x0, ft(x0), z0], [x1, ft(x1), z1], o.topCol || col, o.topMat ?? mat, ref);
  }
  if (b.solids && o.solid !== false) { const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]); b.solids.push([Math.min(...xs), Math.max(...xs), lo, hi, Math.min(...zs), Math.max(...zs)]); }
}

/** a round tube between two points (the legs of a mast, pipes, arms): a cylinder turned to the direction */
function tube(c, p0, p1, r0, r1, col, o = {}) {
  const { b } = c, dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], hl = Math.hypot(dx, dz), len = Math.hypot(hl, dy);
  if (len < 1e-6) return;
  b.push().translate(p0[0], p0[1], p0[2]).rotateY(Math.atan2(-dz, dx)).rotateZ(-Math.atan2(hl, dy));
  b.cyl(0, 0, 0, r0, r0, r1, r1, len, col, o.mat ?? c.MAT.HULL, { seg: o.seg || 8, capTop: o.capTop ?? true });
  b.pop();
}
/** a thin rod (rail, wire, stay) between two points */
function wire(c, p0, p1, w, col, mat) { c.b.beam(p0, p1, w, w, col, mat ?? c.MAT.HULL, { caps: false }); }
/** a guard rail along an outline [[x, z], ...] at height y (a number or a function of x): posts every `step` m, wires at the top, the middle (and low when o.low); o.open leaves the outline open, o.h the height */
function rail(c, pts, y, col, o = {}) {
  const h = o.h ?? 1.0, step = o.step ?? 1.5, n = pts.length, last = o.open ? n - 1 : n, yf = fnOf(y);
  for (let i = 0; i < last; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n], len = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(len / step)), ya = yf(x0), yb = yf(x1);
    wire(c, [x0, ya + h, z0], [x1, yb + h, z1], 0.055, col);
    if (o.low) { wire(c, [x0, ya + h * 0.68, z0], [x1, yb + h * 0.68, z1], 0.035, col); wire(c, [x0, ya + h * 0.36, z0], [x1, yb + h * 0.36, z1], 0.035, col); }
    else wire(c, [x0, ya + h * 0.5, z0], [x1, yb + h * 0.5, z1], 0.035, col);
    for (let j = 0; j < k; j++) { const t = j / k, px = x0 + (x1 - x0) * t; wire(c, [px, ya + (yb - ya) * t, z0 + (z1 - z0) * t], [px, ya + (yb - ya) * t + h, z0 + (z1 - z0) * t], 0.045, col); }
  }
  if (o.open) { const [x, z] = pts[n - 1]; wire(c, [x, yf(x), z], [x, yf(x) + h, z], 0.045, col); }
}
/** a grating platform on an outline with its edge toe-plate (a slab), railed */
function platform(c, half, y, col, o = {}) { sprism(c, half, y - 0.12, y, col, { solid: false, ...o }); }

/**
 * A skin through super-elliptic sections: rows = [{ y, x (centre), z (centre, 0), rx, rz, p (exponent: 2 = ellipse, large = rounded box) }], n points a ring; faceted like the plating of a stack.
 * o.cap: close the top (a flat face of colour o.topCol).
 */
function loft(c, rows, col, o = {}) {
  const { b } = c, n = o.n ?? 24, mat = o.mat ?? c.MAT.HULL, ring = (r) => { const q = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), p = 2 / (r.p ?? 2.6); q.push([r.x + Math.sign(ca) * Math.pow(Math.abs(ca), p) * r.rx, r.y, (r.z || 0) + Math.sign(sa) * Math.pow(Math.abs(sa), p) * r.rz]); } return q; };
  const rs = rows.map(ring);
  for (let k = 0; k + 1 < rs.length; k++) {
    const ref = [rows[k].x, (rows[k].y + rows[k + 1].y) / 2, rows[k].z || 0];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; b.quad(rs[k][i], rs[k][j], rs[k + 1][j], rs[k + 1][i], o.cols ? o.cols[k] : col, mat, ref); }
  }
  if (o.cap !== false) { const t = rs[rs.length - 1], r = rows[rows.length - 1], cc = [r.x, r.y, r.z || 0]; for (let i = 0; i < n; i++) b.triFlat(cc, t[i], t[(i + 1) % n], o.topCol || col, o.topMat ?? mat, [cc[0], cc[1] - 1, cc[2]]); }
  if (b.solids && o.solid !== false) { const all = rs.flat(); b.solids.push([Math.min(...all.map((q) => q[0])), Math.max(...all.map((q) => q[0])), rows[0].y, rows[rows.length - 1].y, Math.min(...all.map((q) => q[2])), Math.max(...all.map((q) => q[2]))]); }
}

// ---- the heights of the decks of the superstructure: they run parallel to the sheer of the main deck (about 5 cm per metre towards the bow) ----
const T1 = (x) => 5.85 + 0.054 * (x - 14);      // top of the first tier (the 01 level)
const T2 = (x) => 8.2 + 0.055 * (x - 14);       // top of the second tier (the 02 level)
const ROOF = 11.25;                              // the flat roof of the bridge level

/** the sonar dome and the bridge superstructure */
function bridge(c) {
  const { b, X, Y, MAT, shade, rgb, pal, part, note } = c, steel = shade(rgb(pal.mast), 0.95), sup = rgb(pal.sup), hullc = rgb(pal.hull), deck = rgb(pal.deck), boot = rgb(pal.boot);
  // the AN/SQS-23 sonar dome under the forefoot: long and narrow (8.8 m by 2.8 m), 6.85 m under the waterline
  loft(c, [{ y: -3.9, x: 46.2, rx: 4.0, rz: 1.3, p: 2.4 }, { y: -4.3, x: 46.2, rx: 4.4, rz: 1.45, p: 2.4 }, { y: -6.1, x: 46.2, rx: 4.4, rz: 1.45, p: 2.4 }, { y: -6.6, x: 46.2, rx: 3.8, rz: 1.15, p: 2.4 }, { y: -6.85, x: 46.2, rx: 3.0, rz: 0.85, p: 2.4 }], boot, { mat: MAT.SKIN, n: 28, solid: false });
  const dk = (x) => Y(x) - 0.45;
  // tiers 1 and 2: one tall block, its flanks about a metre inside the edge of the deck
  sprism(c, [[9.0, 0.74], [11.9, 5.15], [14.2, 5.15], [20, 4.95], [25.6, 4.7], [26.9, 4.65]], dk, T2, sup);
  // the neck under the bridge, and the deck of the torpedo tubes round it
  sprism(c, [[26.9, 4.65], [28.5, 3.6], [30, 2.7], [32.03, 1.76]], dk, (x) => T2(x) + 0.05, sup);
  sprism(c, [[26.9, 6.0], [33.7, 5.7], [34.3, 5.1], [35.2, 4.23], [35.95, 3.64]], dk, (x) => 6.5 + 0.04 * (x - 27), shade(sup, 0.92));
  sprism(c, [[32.7, 4.0], [35.2, 4.23], [35.95, 3.64]], (x) => 6.4, (x) => 7.0 + 0.04 * (x - 32.7), sup);
  // the flange of the 02 level: a walkway outboard of the flanks, cantilevered
  sprism(c, [[12.2, 6.2], [26.0, 6.4], [26.0, 4.7], [12.2, 5.15]], (x) => T2(x) - 0.12, T2, shade(sup, 0.9));
  const glass = rgb(pal.glass);
  // the bridge level (tier 3, the wings, the roof): a part of its own, the 'bridge' of the damage model
  part('tower', 'bridge', 'Passerelle', () => {
    // tier 3: the bridge level, its flat roof
    sprism(c, [[11.1, 1.4], [14.2, 5.1], [25.6, 4.65], [28.95, 3.15], [30.15, 4.3], [32.03, 1.76]], (x) => T2(x) - 0.1, ROOF, sup);
    // the wings: the deck round the front of the bridge, closed by a low faceted wall
    sprism(c, [[25.1, 5.86], [29.05, 5.68], [32.03, 1.78]], (x) => T2(x) - 0.12, (x) => T2(x) + 0.03, shade(sup, 0.9), { solid: false });
    for (const sg of [-1, 1]) for (const [[xa, za], [xb, zb]] of [[[25.1, 5.86], [29.05, 5.68]], [[29.05, 5.68], [32.03, 1.78]]]) b.beam([xa, T2(xa) + 0.85, sg * za], [xb, T2(xb) + 0.85, sg * zb], 0.12, 1.7, shade(sup, 0.95), MAT.HULL);
    // windows: a dark band along the front faces of the pilot house, and along the wing walls
    const win = (x0, z0, x1, z1, y, h) => { for (const sg of [-1, 1]) c.b.beam([x0, y, sg * z0], [x1, y, sg * z1], 0.07, h, glass, MAT.GLASS, { caps: false }); };
    win(30.17, 4.34, 32.05, 1.8, 10.55, 0.5); win(32.05, 1.8, 32.05, -1.8, 10.55, 0.5);
    win(25.2, 5.9, 29.07, 5.72, 9.6, 0.4); win(29.1, 5.7, 32.06, 1.82, 9.6, 0.4);
    // the screen along the front of the roof: a low faceted wall
    for (const sg of [-1, 1]) c.b.beam([30.15, ROOF + 0.5, sg * 4.3], [32.1, ROOF + 0.5, sg * 1.77], 0.12, 1.1, shade(sup, 0.95), MAT.HULL);
    c.b.beam([32.1, ROOF + 0.5, -1.77], [32.1, ROOF + 0.5, 1.77], 0.12, 1.1, shade(sup, 0.95), MAT.HULL);
    // the pilot-house box on the roof and the Mk 68 director with its SPG-53 radar
    sprism(c, [[23.85, 1.3], [26.7, 1.3]], ROOF, 13.45, shade(sup, 0.97));
    c.b.block({ x0: 23.55, x1: 23.9, hw: 0.55, y0: 12.4, y1: 13.0 }, shade(sup, 0.9), MAT.HULL);
  }, () => sprism(c, [[11.1, 1.4], [14.2, 5.1], [25.6, 4.65], [32.03, 1.76]], (x) => T2(x) - 0.1, T2(20) + 1.0, rgb('#2a2a2a'), { mat: MAT.DARK, solid: false }));
  // on the roof: the raft bins at the edges, the thin fin amidships, the lamp posts, the searchlights on the wings
  { const bin = shade(rgb('#7a8082'), 0.95), cap = shade(bin, 1.12);
    for (const sg of [-1, 1]) for (const xc of [15.15, 18.0, 22.9]) {
      b.block({ x0: xc - 0.8, x1: xc + 0.8, hw: 0.45, zc: sg * 5.45, y0: ROOF - 0.05, y1: ROOF + 0.65, tx0: xc - 0.7, tx1: xc + 0.7, thw: 0.4 }, bin, MAT.HULL);
      b.block({ x0: xc - 0.03, x1: xc + 0.03, hw: 0.46, zc: sg * 5.45, y0: ROOF + 0.1, y1: ROOF + 0.66 }, cap, MAT.HULL);
    }
    b.block({ x0: 20.5, x1: 21.7, hw: 0.06, y0: ROOF, y1: 14.1, tx0: 20.7, tx1: 21.6 }, shade(sup, 0.7), MAT.HULL);
    tube(c, [19.8, ROOF, 0], [19.8, 12.9, 0], 0.06, 0.05, steel, { seg: 5 }); b.sphere(19.8, 12.95, 0, 0.1, 0.1, 0.1, rgb('#d8d8c8'), MAT.HULL, { seg: 6, rings: 4 });
    for (const sg of [-1, 1]) {
      tube(c, [30.4, ROOF, sg * 3.1], [30.4, 12.7, sg * 3.1], 0.07, 0.06, steel, { seg: 5 }); b.cylinder(30.4, 12.7, sg * 3.1, 0.13, 0.1, 13.0, shade(sup, 0.8), MAT.HULL, { seg: 6 });
      b.cylinder(30.9, T2(30.9) + 0.9, sg * 4.35, 0.1, 0.08, T2(30.9) + 1.15, steel, MAT.HULL, { seg: 5 });
      b.sphere(31.15, T2(30.9) + 1.3, sg * 4.2, 0.28, 0.25, 0.28, shade(sup, 0.78), MAT.HULL, { seg: 8, rings: 5 });
    }
  }
  const dirO = { x: 25.4, y: 14.5, z: 0 };
  part('director0', 'director', 'Directeur de tir Mk 68', () => {
    c.b.cylinder(25.45, 13.45, 0, 1.0, 1.0, 14.0, shade(sup, 0.85), MAT.HULL, { seg: 14 });
    c.b.block({ x0: 24.35, x1: 26.65, hw: 1.2, y0: 14.0, y1: 15.85, tx0: 24.45, tx1: 26.3, thw: 1.05 }, sup, MAT.HULL);
    c.b.cylinder(25.2, 15.8, 0, 0.55, 0.45, 16.15, shade(sup, 0.9), MAT.HULL, { seg: 10 });
    c.b.rodZ(25.45, 15.2, -1.9, 1.9, 0.14, 0.14, shade(sup, 0.88), MAT.HULL, { seg: 8 });                                          // the optical ears
    c.b.block({ x0: 26.4, x1: 26.72, hw: 0.45, y0: 14.5, y1: 15.2 }, glass, MAT.GLASS);
    c.b.cylinder(24.8, 16.1, 0, 0.14, 0.12, 17.3, shade(sup, 0.8), MAT.HULL, { seg: 6 });
    dish(c, 25.45, 17.2, 0, 0.95, 0, 1.4, shade(rgb('#9aa0a6'), 1.0), { seg: 16 });                                                  // the SPG-53 dish, nearly vertical, facing forward
  }, () => c.b.cylinder(25.45, 13.45, 0, 0.9, 0.7, 14.4, rgb('#2a2a2a'), MAT.DARK, { seg: 8 }), { track: { x: 25.45, y: 14.5, z: 0 }, fine: () => {
    rail(c, [[23.85, -1.55], [27.2, -1.55], [27.2, 1.55], [23.85, 1.55]], 14.05, shade(rgb(pal.mast), 0.95));
  } });
  note(18.2);
}

/** the forward stack-mast ("mack"): a tapered oval stack with its louvres, and the lattice mast with its tripod legs, platforms and yards on the bridge roof */
function mack1(c) {
  const { b, X, Y, MAT, shade, rgb, pal, part, PT, DT, model, note } = c, sup = rgb(pal.sup), dark = rgb('#26292d'), grey = shade(sup, 0.82), steel = shade(rgb(pal.mast), 0.95), cap = rgb('#1d1f22');
  const y0 = 11.25, cxB = 12.95;
  // the stack: a bulbous base, the body leaning aft, the capped top
  const stack = () => {
    loft(c, [{ y: 11.25, x: 13.05, rx: 2.0, rz: 1.5, p: 3.2 }, { y: 13.6, x: 12.85, rx: 2.05, rz: 1.47, p: 3.0 }, { y: 16, x: 12.6, rx: 2.08, rz: 1.42, p: 2.8 }, { y: 17.6, x: 12.5, rx: 1.98, rz: 1.38, p: 2.8 },
      { y: 17.8, x: 12.45, rx: 2.06, rz: 1.45, p: 2.8 }, { y: 18.45, x: 12.35, rx: 2.05, rz: 1.5, p: 2.8 }, { y: 19.3, x: 12.2, rx: 1.75, rz: 1.3, p: 2.8 }], shade(sup, 0.97), { topCol: cap, topMat: MAT.DARK });
  };
  part('funnel0', 'funnel', 'Cheminée avant', stack, () => b.cyl(cxB, y0, 0, 1.9, 1.45, 1.6, 1.2, y0 + 2.6, rgb('#2a2a2a'), MAT.DARK, { seg: 14 }), {
    fine: () => {
      for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) {            // the louvres of the uptakes, four panels on each side
        const x = 11.6 + i * 0.62, rzAt = 1.4 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x - 12.6) / 2.08, 2.8)), 1 / 2.8);
        b.block({ x0: x - 0.27, x1: x + 0.27, hw: 0.02, zc: sg * (rzAt + 0.01), y0: 14.3, y1: 17.2 }, dark, MAT.DARK);
      }
      DT.ladder(b, 10.6, 11.3, 17.4, 0, rgb('#3a3d42'));
    } });
  model.smoke.push([11.9, 19.4, 0]); note(19.4);
  const mastCol = steel;
  part('mast0', 'mast', 'Mât avant', () => {
    b.block({ x0: 15.1, x1: 17.4, hw: 1.2, y0: 11.25, y1: 13.95 }, shade(sup, 0.93), MAT.HULL);                         // the trunk the mast stands on
    for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) b.block({ x0: 15.35 + i * 0.7, x1: 15.9 + i * 0.7, hw: 0.02, zc: sg * 1.21, y0: 11.7, y1: 13.6 }, rgb('#2c2f33'), MAT.DARK);
    for (const sg of [-1, 1]) tube(c, [11.3, 8.6, sg * 4.7], [15.5, 26.6, sg * 0.45], 0.24, 0.17, mastCol, { seg: 8 });   // the two tripod legs
    tube(c, [15.55, 13.9, 0], [16.1, 28.2, 0], 0.4, 0.17, mastCol, { seg: 10 });                                         // the mast
    // the bracing between the legs and the pole
    const leg = (y, sg) => { const t = (y - 8.6) / 18; return [11.3 + 4.2 * t, y, sg * (4.7 - 4.25 * t)]; }, pole = (y) => [15.55 + 0.55 * (y - 13.9) / 14.3, y, 0];
    for (const y of [14.5, 17.5, 20.0, 22.5]) tube(c, leg(y, -1), leg(y, 1), 0.06, 0.06, mastCol, { seg: 5 });
    for (const [ya, yb] of [[14.5, 17.5], [17.5, 20.0], [20.0, 22.5]]) {
      tube(c, leg(ya, -1), leg(yb, 1), 0.04, 0.04, mastCol, { seg: 4 }); tube(c, leg(ya, 1), leg(yb, -1), 0.04, 0.04, mastCol, { seg: 4 });
      for (const sg of [-1, 1]) tube(c, leg(ya, sg), pole(yb), 0.04, 0.04, mastCol, { seg: 4 });
    }
    tube(c, [16.1, 28.2, 0], [16.15, 31.4, 0], 0.07, 0.05, mastCol, { seg: 5 });                                         // its whip
    b.rodZ(15.95, 26.8, -5.0, 5.0, 0.06, 0.04, mastCol, MAT.HULL, { seg: 5 });                                           // the two yards
    b.rodZ(16.3, 23.9, -5.2, 5.2, 0.06, 0.04, mastCol, MAT.HULL, { seg: 5 });
    platform(c, [[14.7, 1.2], [17.6, 1.2]], 14.0, dark);
    platform(c, [[16.0, 0.6], [17.2, 1.2], [18.6, 1.5], [19.1, 0.8]], 17.7, dark);
    platform(c, [[14.4, 0.7], [16.5, 1.2], [19.0, 1.0], [19.6, 0.4]], 21.5, dark);
    platform(c, [[15.3, 0.9], [17.0, 1.0], [19, 0.9], [19.9, 0.2]], 24.0, dark);
    platform(c, [[12.2, 0.15], [13.2, 0.6], [14.5, 1.1], [16, 1.2], [17.2, 1.0], [17.9, 0.4]], 26.9, dark);
    for (const sg of [-1, 1]) b.cylinder(18.5, 17.8, sg * 1.85, 0.58, 0.55, 19.9, shade(sup, 0.9), MAT.HULL, { seg: 10 });   // the two lamp cans
    b.cylinder(14.8, 21.6, 1.4, 0.4, 0.38, 23.5, shade(sup, 0.9), MAT.HULL, { seg: 8 });
  }, () => b.cylinder(15.9, 13.9, 0, 0.45, 0.3, 17.5, rgb('#2a2a2a'), MAT.DARK, { seg: 6 }), { fine: () => {
    const rc = steel;
    rail(c, [[14.7, -1.2], [17.6, -1.2], [17.6, 1.2], [14.7, 1.2]], 14.0, rc);
    rail(c, [[16.1, -1.4], [19.1, -1.4], [19.1, 1.4], [16.1, 1.4]], 17.7, rc);
    rail(c, [[14.4, -1.5], [19.6, -1.5], [19.6, 1.5], [14.4, 1.5]], 21.5, rc);
    rail(c, [[15.3, -1.6], [19.9, -1.6], [19.9, 1.6], [15.3, 1.6]], 24.0, rc);
    rail(c, [[12.4, -1.4], [18.0, -1.4], [18.0, 1.4], [12.4, 1.4]], 26.9, rc);
  } });
  note(31.4);
  // the AN/SPS-39 planar array at the head of the mast, the AN/SPS-10 reflector on the platform below
  part('radar0', 'radar', 'Radar de veille', () => { b.block({ x0: 15.8, x1: 16.6, hw: 2.25, y0: 28.1, y1: 30.8 }, shade(rgb('#8a9096'), 0.95), MAT.HULL); b.block({ x0: 15.7, x1: 16.7, hw: 2.3, y0: 30.8, y1: 31.0 }, steel, MAT.HULL); });
  part('radar3', 'radar', 'Radar de surface', () => {
    b.cylinder(18.3, 24.0, 0, 0.3, 0.25, 24.5, steel, MAT.HULL, { seg: 6 });
    // the reflector: a curved plate 3.6 m wide and 1.8 m high, concave to the front
    const pts = []; for (let i = 0; i <= 8; i++) { const t = (i / 8 - 0.5) * 2; pts.push([18.55 - 0.45 * (1 - t * t), t * 1.8]); }
    for (let i = 0; i < 8; i++) b.beam([pts[i][0], 25.4, pts[i][1]], [pts[i + 1][0], 25.4, pts[i + 1][1]], 0.06, 1.7, shade(rgb('#8a9096'), 0.9), MAT.HULL, { caps: false });
  }, undefined, { spin: { x: 18.3, y: 25.4, z: 0, rate: 1.2 } });
}

/** a parabolic dish (a flat dome) on a short stem, turned to face (yaw, pitch up from the horizon) */
function dish(c, x, y, z, r, yaw, pitch, col, o = {}) {
  const { b, MAT } = c;
  b.push().translate(x, y, z).rotateY(yaw).rotateZ(-(Math.PI / 2 - pitch));
  b.sphere(0, 0, 0, r, r * 0.3, r, col, MAT.HULL, { half: true, seg: o.seg || 14, rings: 6 });
  b.cylinder(0, 0, 0, 0.05, 0.05, r * 0.5, shade2(col, 0.7), MAT.HULL, { seg: 5 });
  b.pop();
}
const shade2 = (col, f) => col.map((v) => Math.min(255, v * f));

/** the long 01-level deckhouse, the after tower with its two SPG-51 fire-control radars, the second stack-mast, the ASROC launcher, the boats */
function midships(c) {
  const { b, X, Y, MAT, shade, rgb, pal, part, PT, DT, model, note } = c, sup = rgb(pal.sup), dark = rgb('#26292d'), steel = shade(rgb(pal.mast), 0.95), grey = shade(sup, 0.86), cap = rgb('#1d1f22');
  const dk = (x) => Y(x) - 0.45, H1 = (x) => 5.33 + 0.0072 * (x + 30);
  // the long deckhouse (01 level), its after end angled
  sprism(c, [[-43.1, 3.2], [-35.8, 5.0], [-19.9, 5.43], [-8.0, 5.5], [8.0, 5.3], [11.9, 5.15]], dk, H1, sup);
  // the after tower: a hexagonal lower tier, a narrow upper one whose roof slopes with the sheer
  // the starboard half outlines of the two tiers, the aft ends rounded
  const tier1 = [[-20.9, 0], [-20.75, 0.95], [-20.1, 1.95], [-19.2, 2.52], [-18.2, 2.7], [-9.1, 2.7], [-8.8, 1.35]], tier2 = [[-20.9, 0], [-20.7, 0.5], [-20.2, 1.0], [-19.55, 1.35], [-9.4, 1.35]];
  sprism(c, tier1, 5.2, 7.8, shade(sup, 0.97));
  sprism(c, tier2, 7.6, (x) => 9.95 + 0.06 * (x + 19), sup);
  b.block({ x0: -11.6, x1: -9.1, hw: 0.7, zc: 2.05, y0: 7.7, y1: 10.4 }, shade(sup, 0.93), MAT.HULL);                        // the starboard annex of the tower
  // the second stack-mast (a lozenge column leaning aft, with the louvres and the flared cap)
  const stack2 = () => {
    loft(c, [{ y: 5.3, x: -7.0, rx: 1.75, rz: 1.35, p: 3 }, { y: 7.0, x: -7.15, rx: 1.75, rz: 1.35, p: 3 }, { y: 10.4, x: -7.6, rx: 2.0, rz: 1.38, p: 2.4 }, { y: 11, x: -8.0, rx: 2.07, rz: 1.4, p: 2.4 }, { y: 13, x: -8.28, rx: 2.06, rz: 1.4, p: 2.4 },
      { y: 16, x: -8.7, rx: 2.05, rz: 1.4, p: 2.4 }, { y: 16.3, x: -8.7, rx: 2.12, rz: 1.45, p: 2.4 }, { y: 16.7, x: -8.7, rx: 1.55, rz: 1.0, p: 2.4 }, { y: 17.9, x: -8.8, rx: 1.5, rz: 0.95, p: 2.4 }], shade(sup, 0.97), { topCol: cap, topMat: MAT.DARK });
  };
  part('funnel1', 'funnel', 'Cheminée arrière', stack2, () => b.cyl(-7.2, 5.3, 0, 1.7, 1.3, 1.5, 1.2, 8.2, rgb('#2a2a2a'), MAT.DARK, { seg: 12 }), { fine: () => {
    for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) { const x = -9.6 + i * 0.62; b.block({ x0: x - 0.27, x1: x + 0.27, hw: 0.02, zc: sg * 1.4, y0: 11.7, y1: 14.3 }, dark, MAT.DARK); }
  } });
  model.smoke.push([-8.8, 18.0, 0]); note(18);
  // the SPG-51 fire-control radars (Tartar): a drum with a rail, then a mount with a dish
  const rad = steel;
  b.cylinder(-15.1, 10.3, 0, 1.38, 1.38, 13.3, shade(sup, 0.92), MAT.HULL, { seg: 16 });
  b.cylinder(-15.1, 13.3, 0, 1.5, 1.4, 13.55, grey, MAT.HULL, { seg: 16 });
  b.cylinder(-19.9, 9.95, 0, 0.95, 0.9, 11.0, shade(sup, 0.92), MAT.HULL, { seg: 14 });
  const spg = (id, x, y, label) => part(id, 'radar', label, () => {
    b.cylinder(x, y, 0, 0.45, 0.4, y + 1.1, grey, MAT.HULL, { seg: 10 });
    b.block({ x0: x - 0.5, x1: x + 0.3, hw: 0.8, y0: y + 0.9, y1: y + 1.5 }, grey, MAT.HULL);
    dish(c, x + 0.1, y + 2.2, 0, 1.0, Math.PI, 0.95, shade(rgb('#9aa0a6'), 1.0));
  }, undefined, { spin: { x, y: y + 2.0, z: 0, rate: 1.9 } });
  spg('radar1', -15.1, 13.55, 'Radar de conduite de tir SPG-51 avant'); spg('radar2', -19.9, 11.0, 'Radar de conduite de tir SPG-51 arrière');
  note(16.6);
  // the ASROC (Mk 16) launcher: a drum, its support and the eight-cell box, the cells facing aft (the rockets leave from the face of the box)
  model.missileMounts.push({ kind: 'asroc', x: -0.16, y: 8.75, z: 0, arcC: 0, arcH: Math.PI });
  { const y = 5.5;
    b.cylinder(2.4, y, 0, 1.15, 1.05, y + 0.9, shade(sup, 0.9), MAT.HULL, { seg: 14 });
    b.block({ x0: 1.2, x1: 3.5, hw: 0.95, y0: y + 0.9, y1: 7.75, tx0: 1.5, tx1: 3.4, thw: 0.8 }, grey, MAT.HULL);
    b.block({ x0: -0.1, x1: 4.75, hw: 1.8, y0: 7.75, y1: 9.75 }, shade(sup, 0.94), MAT.HULL);
    for (const zz of [-1.35, -0.45, 0.45, 1.35]) for (const yy of [8.25, 9.25]) b.rod(-0.16, -0.04, yy, zz, 0.38, 0.38, dark, MAT.DARK, { seg: 10 });
  }
}

/** the two Mk 32 triple torpedo tube mounts, each in the open on the deck at the side of the bridge */
function tubes(c) {
  const { b, MAT, shade, rgb, pal, part, model } = c, sup = rgb(pal.sup), tubeCol = shade(rgb('#8a9096'), 0.85), dark = rgb('#26292d');
  model.tubes.length = 0;
  [-1, 1].forEach((sg, i) => {
    const x = 29.0, z = sg * 5.2, y0 = 6.5 + 0.04 * (x - 27);
    part('tubes' + i, 'tubes', 'Tubes lance-torpilles Mk 32', () => {
      b.cylinder(x, y0, z, 0.55, 0.5, y0 + 0.7, shade(sup, 0.85), MAT.HULL, { seg: 10 });
      b.block({ x0: x - 0.7, x1: x + 0.7, hw: 0.5, zc: z, y0: y0 + 0.65, y1: y0 + 0.85 }, shade(sup, 0.8), MAT.HULL);
      for (const [dz, dy] of [[-0.27, 0.95], [0.27, 0.95], [0, 1.4]]) {
        b.rod(x - 1.7, x + 1.7, y0 + dy + 0.12, z + dz, 0.23, 0.23, tubeCol, MAT.HULL, { seg: 10 });
        b.rod(x + 1.7, x + 1.76, y0 + dy + 0.12, z + dz, 0.17, 0.17, dark, MAT.DARK, { seg: 10 });
      }
      b.block({ x0: x - 0.6, x1: x + 0.5, hw: 0.28, zc: z, y0: y0 + 1.1, y1: y0 + 1.75, tx0: x - 0.5, tx1: x + 0.4, thw: 0.2 }, shade(sup, 0.78), MAT.HULL);
    }, () => b.box(x, y0 + 0.4, z, 3.4, 0.8, 1.4, rgb('#2a2a2a'), MAT.DARK));
    model.tubes.push({ x, y: y0 + 1.95, z, n: 3, side: sg });
  });
}

/** the forecastle: the anchor gear, the chocks, the rails along the edge, the jackstaff; the Mk 42 mount is a gun of the model */
function forecastle(c) {
  const { b, X, Y, hull, MAT, shade, rgb, pal, DT } = c, sup = rgb(pal.sup), dark = rgb('#2a2d31'), steel = shade(rgb(pal.mast), 0.9), chain = rgb('#30343a');
  const edge = (x) => Y(x) - 0.3;                                          // the deck at its edge
  c.fine(() => {
    // the rails along both edges, from the bridge to the stem
    for (const sg of [-1, 1]) {
      const pts = []; for (let x = 35.6; x < 66.0; x += 2.0) pts.push([x, sg * (hull.halfBeamDeck(x) - 0.08)]);
      pts.push([66.0, sg * (hull.halfBeamDeck(66.0) + 0.0)]);
      rail(c, pts, edge, steel, { open: true, h: 1.25, step: 1.9, low: true });
    }
    // the chocks (open fairleads) in the edge
    for (const x of [37.0, 42.0, 47.4, 51.0, 56.0, 59.3, 63.2]) for (const sg of [-1, 1]) {
      const z = sg * (hull.halfBeamDeck(x) - 0.3), y = edge(x);
      b.block({ x0: x - 0.5, x1: x + 0.5, hw: 0.28, zc: z, y0: y, y1: y + 0.5 }, shade(sup, 0.8), MAT.HULL);
      b.block({ x0: x - 0.3, x1: x + 0.3, hw: 0.3, zc: z, y0: y + 0.05, y1: y + 0.4 }, dark, MAT.DARK);
    }
    // the windlass and its capstan, the chain stoppers and the two chains to the hawse pipes
    const yd = Y(53.0);
    b.cylinder(52.7, yd, -0.3, 0.45, 0.4, yd + 0.85, shade(sup, 0.8), MAT.HULL, { seg: 10 });
    b.cylinder(52.7, yd + 0.85, -0.3, 0.5, 0.5, yd + 0.95, dark, MAT.DARK, { seg: 10 });
    for (const sg of [-1, 1]) {
      b.block({ x0: 57.0, x1: 57.55, hw: 0.2, zc: sg * 0.9, y0: Y(57.2), y1: Y(57.2) + 0.4 }, dark, MAT.DARK);
      const a = [55.2, Y(56) + 0.06, 0.1], m = [59.2, Y(59.2) + 0.06, sg * 0.9], d2 = [62.0, Y(62) + 0.06, sg * 1.7];
      DT.stay(c.b, a, m, chain, 0.11); DT.stay(c.b, m, d2, chain, 0.11);
    }
    b.cylinder(66.0, Y(66.0) - 0.1, 0, 0.12, 0.1, Y(66.0) + 0.5, steel, MAT.HULL, { seg: 6 });
    for (const sg of [-1, 1]) {            // the hawse pipes and the anchors stowed in the flare of the bow
      const x = 62.4, y = 5.5, z = hull.sideZ(x, y) + 0.05;
      b.block({ x0: x - 0.7, x1: x + 0.7, hw: 0.04, zc: sg * z, y0: y - 0.7, y1: y + 0.7 }, rgb('#202326'), MAT.DARK);
      b.block({ x0: x - 0.12, x1: x + 0.12, hw: 0.1, zc: sg * (z + 0.1), y0: y - 0.85, y1: y + 0.55 }, steel, MAT.HULL);
      b.block({ x0: x - 0.55, x1: x + 0.55, hw: 0.08, zc: sg * (z + 0.1), y0: y - 0.9, y1: y - 0.7 }, steel, MAT.HULL);
    }
  });
  // the jackstaff
  c.fine(() => { const y0 = Y(66.0) - 0.1; DT.stay(c.b, [66.05, y0, 0], [65.95, y0 + 6.4, 0], steel, 0.1); });
}

/** the Mk 11 twin-arm Tartar launcher on the fantail, its drum, and the stern with its rails and ensign staff */
function aftDeck(c) {
  const { b, X, Y, hull, MAT, shade, rgb, pal, DT, PT, model } = c, sup = rgb(pal.sup), dark = rgb('#26292d'), steel = shade(rgb(pal.mast), 0.9), grey = shade(sup, 0.84), white = rgb('#d9dcdc');
  const xc = -45.8, y1 = 6.0;
  model.missileMounts.push({ kind: 'sam', x: -46.0, y: 7.05, z: 0, arcC: 0, arcH: Math.PI });                                                  // the Tartar missiles leave the tips of the two arms
  // the drum (the magazine's barbette) with the hatches round its rim, the turntable, the central block and its arms
  b.cylinder(xc, 2.9, 0, 2.5, 2.47, y1, shade(sup, 0.9), MAT.HULL, { seg: 16 });
  b.cylinder(xc, y1, 0, 2.5, 2.4, y1 + 0.1, shade(sup, 0.8), MAT.HULL, { seg: 16 });
  for (const dx of [-2.1, 2.15]) b.sphere(xc + dx, y1 + 0.1, 0, 0.36, 0.2, 0.36, grey, MAT.HULL, { half: true, seg: 10, rings: 4 });
  b.cylinder(xc, y1 + 0.1, 0, 1.6, 1.55, y1 + 0.35, shade(sup, 0.86), MAT.HULL, { seg: 14 });
  sprism(c, [[-47.3, 0], [-47.0, 0.7], [-46.5, 1.0], [-44.1, 1.0]], y1 + 0.3, 7.7, grey);
  b.block({ x0: -46.5, x1: -43.9, hw: 0.95, y0: 7.7, y1: 8.55, tx0: -46.1, tx1: -44.4, thw: 0.7 }, shade(sup, 0.9), MAT.HULL);
  b.rodZ(-45.05, 8.05, -2.65, 2.65, 0.3, 0.3, shade(sup, 0.78), MAT.HULL, { seg: 10 });                                  // the pivot of the arms
  for (const sg of [-1, 1]) {
    b.block({ x0: -47.0, x1: -44.1, hw: 0.3, zc: sg * 1.65, y0: y1 + 0.35, y1: 7.75, tx0: -46.4, tx1: -44.3, thw: 0.25 }, grey, MAT.HULL);   // an arm
    b.rod(-48.3, -44.1, 7.05, sg * 1.65, 0.19, 0.19, white, MAT.HULL, { seg: 10 });                                          // its missile
    b.rod(-48.85, -48.3, 7.05, sg * 1.65, 0.01, 0.19, shade(white, 0.9), MAT.HULL, { seg: 10 });
    for (const f of [[0, 1], [0, -1], [1, 0], [-1, 0]]) b.block({ x0: -44.7, x1: -44.05, hw: 0.015, zc: sg * 1.65 + f[0] * 0.32, y0: 7.05 + f[1] * 0.3 - 0.015, y1: 7.05 + f[1] * 0.3 + 0.015 }, white, MAT.HULL);
  }
  // the stern: the rails round the deck, the chocks, the ensign staff
  c.fine(() => {
    const pts = [], rev = [];
    for (let x = -43.5; x > -62.6; x -= 2.0) { const z = hull.halfBeamDeck(x) - 0.08; pts.push([x, z]); rev.unshift([x, -z]); }
    const all = [...pts, [-63.15, 2.2], [-63.45, 0], [-63.15, -2.2], ...rev];
    rail(c, all, (x) => Y(x) - 0.3, steel, { open: true, h: 1.25, step: 1.9, low: true });
    for (const x of [-58.4, -53.5, -48.9, -44.4]) for (const sg of [-1, 1]) {
      const z = sg * (hull.halfBeamDeck(x) - 0.3), y = Y(x) - 0.3;
      b.block({ x0: x - 0.5, x1: x + 0.5, hw: 0.28, zc: z, y0: y, y1: y + 0.5 }, shade(sup, 0.8), MAT.HULL);
      b.block({ x0: x - 0.3, x1: x + 0.3, hw: 0.3, zc: z, y0: y + 0.05, y1: y + 0.4 }, dark, MAT.DARK);
    }
    for (const sg of [-1, 1]) {   // the double bitts on the fantail
      for (const dx of [0, 0.7]) b.cylinder(-58.2 + dx, Y(-58.2), sg * 1.1, 0.17, 0.2, Y(-58.2) + 0.55, shade(sup, 0.8), MAT.HULL, { seg: 6 });
    }
  });
  c.fine(() => { DT.stay(b, [-63.3, 3.5, 0], [-65.5, 9.3, 0], rgb('#d8d4c8'), 0.1); });
  PT.ensign(b, { x: -65.55, y: 9.3, z: 0, len: 2.6 });
}

/** the guard rails of the roofs and decks of the superstructure (fine detail) */
function rails(c) {
  const { b, Y, shade, rgb, pal, hull } = c, steel = shade(rgb(pal.mast), 0.9);
  c.fine(() => {
    const H1 = (x) => 5.33 + 0.0072 * (x + 30);
    // the roof of the long deckhouse, both edges
    for (const sg of [-1, 1]) {
      const pts = []; for (const [x, z] of [[-43.1, 3.2], [-35.8, 5.0], [-19.9, 5.43], [-8.0, 5.5], [8.0, 5.3]]) pts.push([x, sg * (z - 0.1)]);
      rail(c, pts, H1, steel, { open: true, h: 1.2, step: 2.4 });
    }
    // the tiers of the after tower: the ledge of the lower one, the roof of the upper one, the railed platform of the drum
    const ring = (cx, cz, r, n = 16) => { const q = []; for (let i = 0; i < n; i++) q.push([cx + r * Math.cos(i / n * 6.2832), cz + r * Math.sin(i / n * 6.2832)]); return q; };
    for (const sg of [-1, 1]) {
      rail(c, [[-8.8, sg * 1.35], [-9.1, sg * 2.7], [-18.2, sg * 2.7], [-19.2, sg * 2.52], [-20.1, sg * 1.95], [-20.75, sg * 0.95], [-20.9, 0]], 7.8, steel, { open: true, h: 1.05, step: 1.6 });
      rail(c, [[-9.4, sg * 1.35], [-19.55, sg * 1.35], [-20.2, sg * 1.0], [-20.7, sg * 0.5], [-20.9, 0]], (x) => 9.95 + 0.06 * (x + 19), steel, { open: true, h: 1.05, step: 1.6 });
    }
    rail(c, ring(-15.1, 0, 1.55), 13.55, steel, { h: 1.05, step: 1.1 });
    rail(c, ring(-19.9, 0, 1.1, 12), 11.0, steel, { h: 1.0, step: 1.0 });
    // the open ends of the roofs at the after end
    rail(c, [[-43.1, 3.1], [-43.1, -3.1]], H1, steel, { open: true, h: 1.05, step: 1.9 });
    // the roof of the bridge level
    const T2 = (x) => 8.2 + 0.055 * (x - 14);
    for (const sg of [-1, 1]) rail(c, [[14.2, sg * 5.0], [25.6, sg * 4.6], [28.95, sg * 3.1]], 11.25, steel, { open: true, h: 1.05, step: 1.9 });
    // the walkway of the 02 level, outboard of the flanks
    for (const sg of [-1, 1]) rail(c, [[12.4, sg * 6.15], [26.0, sg * 6.35]], T2, steel, { open: true, h: 1.0, step: 1.9 });
    // the open wing deck and the tube deck
    for (const sg of [-1, 1]) rail(c, [[26.9, sg * 6.0], [33.7, sg * 5.7], [34.3, sg * 5.1], [35.2, sg * 4.23], [35.95, sg * 3.64]], (x) => 6.5 + 0.04 * (x - 27), steel, { open: true, h: 1.0, step: 1.9 });
    rail(c, [[35.95, -3.5], [35.95, 3.5]], 6.95, steel, { open: true, h: 1.0, step: 1.9 });
  });
}

/**
 * A ship's boat (a 7.8 m motor whaleboat, measured on the reference): a hull of 13 stations with a round bilge and a sheer that rises at both ends, an inner shell, the gunwale, thwarts;
 * o.cabin adds a canopy over the middle. Placed at (x, y of the keel, z); o.len stretches it.
 */
function boat(c, x, y, z, o = {}) {
  const { b, MAT, shade, rgb, pal } = c, col = rgb(o.col || pal.boat), inner = shade(col, 1.35), rim = shade(col, 1.15), len = o.len ?? 7.8, k = len / 7.8;
  // stations from the stern (-3.9) to the bow (+3.9): half beam at the gunwale, depth of the keel under the gunwale
  const st = [[-3.9, 0.85, 1.15], [-3.3, 1.02, 1.18], [-2.4, 1.16, 1.2], [-1.4, 1.24, 1.15], [-0.4, 1.27, 1.12], [0.6, 1.24, 1.12], [1.6, 1.12, 1.15], [2.5, 0.92, 1.25], [3.2, 0.62, 1.38], [3.65, 0.3, 1.5], [3.9, 0.04, 1.6]];
  const M = 5, sec = (s, off) => { const [px, hw, d] = s, pts = []; for (let j = 0; j <= M; j++) { const t = j / M; pts.push([x + px * k, y + d * Math.pow(t, 1.5) - off * 0.0, z + (hw - off) * Math.pow(t, 0.75)]); } return pts; };
  const rows = st.map((s) => sec(s, 0)), rowsI = st.map((s) => sec([s[0], s[1], s[2]], 0.1).map((q) => [q[0], q[1] + 0.12, q[2]]));
  const side = (sg) => (q) => [q[0], q[1], z + sg * (q[2] - z)];
  for (const sg of [-1, 1]) {
    const f = side(sg);
    for (let i = 0; i + 1 < st.length; i++) for (let j = 0; j < M; j++) {
      const a = f(rows[i][j]), a2 = f(rows[i][j + 1]), c2 = f(rows[i + 1][j + 1]), c1 = f(rows[i + 1][j]);
      b.quad(a, a2, c2, c1, col, MAT.HULL, [x, y + 0.6, z]);
      const ia = f(rowsI[i][j]), ia2 = f(rowsI[i][j + 1]), ic2 = f(rowsI[i + 1][j + 1]), ic1 = f(rowsI[i + 1][j]);
      b.quad(ia, ia2, ic2, ic1, inner, MAT.HULL, [x, y + 3, z]);
    }
    for (let i = 0; i + 1 < st.length; i++) b.quad(f(rows[i][M]), f(rows[i + 1][M]), f(rowsI[i + 1][M]), f(rowsI[i][M]), rim, MAT.HULL, [x, y - 2, z]);       // the gunwale
  }
  b.block({ x0: x - 3.95 * k, x1: x - 3.8 * k, hw: 0.85, zc: z, y0: y + 0.05, y1: y + 1.1 }, shade(col, 0.9), MAT.HULL);                                  // the transom
  for (const tx of [-1.9, -0.4, 1.1]) b.block({ x0: x + (tx - 0.12) * k, x1: x + (tx + 0.12) * k, hw: 1.15, zc: z, y0: y + 0.62, y1: y + 0.72 }, shade(col, 1.2), MAT.HULL);   // thwarts
  if (o.cabin) { b.block({ x0: x - 1.9 * k, x1: x + 0.9 * k, hw: 0.95, zc: z, y0: y + 1.1, y1: y + 1.95, tx0: x - 1.7 * k, tx1: x + 0.6 * k, thw: 0.8 }, shade(col, 1.05), MAT.HULL);
    b.block({ x0: x + 0.88 * k, x1: x + 0.93 * k, hw: 0.55, zc: z, y0: y + 1.3, y1: y + 1.75 }, rgb(pal.glass), MAT.GLASS); }
  else b.block({ x0: x - 0.2 * k, x1: x + 0.6 * k, hw: 0.4, zc: z, y0: y + 0.7, y1: y + 1.1 }, shade(col, 0.75), MAT.HULL);                              // the engine box
}

/** the boats on their quadrantal davits, the tripod stub mast with its crescent platform, the SPS-37 on the second stack-mast, the rails of the main deck */
function midDetail(c) {
  const { b, X, Y, hull, MAT, shade, rgb, pal, part, DT, model } = c, sup = rgb(pal.sup), dark = rgb('#26292d'), steel = shade(rgb(pal.mast), 0.95), grey = shade(sup, 0.86);
  // the boats: a whaleboat to starboard, a gig with a canopy to port, each on two davits
  for (const sg of [-1, 1]) {
    const z = sg * 5.3, xm = -11.4;
    boat(c, xm, 6.0, z, { cabin: sg < 0 });
    for (const x of [-14.2, -8.0]) {
      tube(c, [x, 3.3, sg * 6.55], [x, 6.4, sg * 6.5], 0.24, 0.2, steel, { seg: 8 });
      tube(c, [x, 6.4, sg * 6.5], [x, 8.1, sg * 5.75], 0.2, 0.17, steel, { seg: 8 });
      tube(c, [x, 8.1, sg * 5.75], [x, 8.6, sg * 4.9], 0.13, 0.1, steel, { seg: 6 });
      b.block({ x0: x - 0.3, x1: x + 0.3, hw: 0.45, zc: sg * 6.45, y0: 3.2, y1: 3.45 }, grey, MAT.HULL);
    }
  }
  // the tripod stub mast abaft the second stack-mast: two stout legs and a ladder leg, a curved railed platform at the apex
  part('mast1', 'mast', 'Mât arrière', () => {
    for (const sg of [-1, 1]) tube(c, [-6.2, 5.35, sg * 3.1], [-4.1, 10.6, sg * 0.35], 0.24, 0.2, steel, { seg: 8 });
    tube(c, [-2.7, 5.35, 0], [-3.6, 10.6, 0], 0.26, 0.2, steel, { seg: 8 });
    b.cylinder(-2.7, 5.35, 0, 0.4, 0.38, 5.55, grey, MAT.HULL, { seg: 8 });
    const arc = (u, dx) => [-4.2 + 2.0 * u * u + dx, 10.95, 1.5 * u];
    for (let i = 0; i < 10; i++) {
      const u0 = -1 + i * 0.2, u1 = u0 + 0.2;
      b.quad(arc(u0, 0), arc(u1, 0), arc(u1, 0.6), arc(u0, 0.6), dark, MAT.HULL);
      b.quad(arc(u0, 0.6), arc(u1, 0.6), arc(u1, 0), arc(u0, 0), dark, MAT.HULL);
    }
  }, () => b.cylinder(-3.9, 5.35, 0, 0.4, 0.3, 7.6, rgb('#2a2a2a'), MAT.DARK, { seg: 6 }), { fine: () => {
    const pts = []; for (let i = 0; i <= 10; i++) { const u = -1 + i * 0.2; pts.push([-4.2 + 2.0 * u * u, 1.5 * u]); }
    rail(c, pts, 10.95, steel, { open: true, h: 1.05, step: 1.0 });
    DT.ladder(b, -2.55, 5.5, 10.2, 0, rgb('#3a3d42'));
  } });
  // the platform on the front of the second stack-mast and the SPS-37 on it
  b.cylinder(-4.4, 16.35, 0, 0.62, 0.6, 18.6, grey, MAT.HULL, { seg: 12 });
  c.fine(() => rail(c, [[-6.4, -1.3], [-3.1, -1.3], [-3.1, 1.3], [-6.4, 1.3]], 16.35, steel, { h: 1.05, step: 1.4 }));
  b.block({ x0: -6.4, x1: -3.1, hw: 1.3, y0: 16.2, y1: 16.35 }, dark, MAT.HULL);
  part('radar4', 'radar', 'Radar de veille SPS-37', () => {
    const P = (u, v) => [-3.3 - 1.7 * v - 0.8 * (1 - u * u), 18.7 + 2.9 * v, 1.65 * u], col = shade(rgb('#8e949a'), 1.0);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) {
      const u0 = -1 + i * 0.2, v0 = j * 0.25;
      b.quad(P(u0, v0), P(u0 + 0.2, v0), P(u0 + 0.2, v0 + 0.25), P(u0, v0 + 0.25), col, MAT.HULL);
      b.quad(P(u0, v0 + 0.25), P(u0 + 0.2, v0 + 0.25), P(u0 + 0.2, v0), P(u0, v0), shade(col, 0.8), MAT.HULL);
    }
    b.beam([-4.4, 18.6, 0], [-4.1, 19.4, 0], 0.35, 0.35, grey, MAT.HULL);
  }, undefined, { spin: { x: -4.4, y: 19.5, z: 0, rate: 0.5 } });
  // the rails of the main deck, both sides, along the walkway outboard of the deckhouse
  c.fine(() => {
    for (const sg of [-1, 1]) {
      const pts = []; for (let x = 26.0; x > -43.5; x -= 2.0) pts.push([x, sg * (hull.halfBeamDeck(x) - 0.08)]);
      rail(c, pts, (x) => Y(x) - 0.3, steel, { open: true, h: 1.25, step: 1.9, low: true });
    }
  });
}

// ---- small fittings of the walls and decks (fine detail): sg = the side (+1 starboard) the wall faces ----
/** a door in a wall: a panel standing proud with a dark frame line and a handle */
function door(c, x, y0, y1, w, z, sg, col, o = {}) {
  const { b, MAT, shade } = c, f = o.frame ?? 0.05;
  b.block({ x0: x - w / 2, x1: x + w / 2, hw: 0.025, zc: z + sg * 0.03, y0, y1 }, shade(col, 0.8), MAT.HULL);
  b.block({ x0: x - w / 2 + f, x1: x + w / 2 - f, hw: 0.025, zc: z + sg * 0.06, y0: y0 + f, y1: y1 - f }, shade(col, 1.04), MAT.HULL);
  b.block({ x0: x + w / 2 - 0.2, x1: x + w / 2 - 0.1, hw: 0.04, zc: z + sg * 0.1, y0: (y0 + y1) / 2 - 0.05, y1: (y0 + y1) / 2 + 0.05 }, shade(col, 0.5), MAT.DARK);
}
/** a ladder on a wall (the rails are along the ship, the rungs across them) */
function ladderW(c, x, y0, y1, z, sg, col) {
  for (const dx of [-0.2, 0.2]) wire(c, [x + dx, y0, z + sg * 0.1], [x + dx, y1, z + sg * 0.1], 0.04, col);
  for (let y = y0 + 0.3; y < y1; y += 0.3) wire(c, [x - 0.2, y, z + sg * 0.1], [x + 0.2, y, z + sg * 0.1], 0.03, col);
}
/** a lifebuoy hung on a wall */
function lifebuoy(c, x, y, z, sg) {
  const { b, MAT } = c;
  b.rodZ(x, y, z + sg * 0.02, z + sg * 0.14, 0.42, 0.42, [214, 112, 40], MAT.HULL, { seg: 12 });
  b.rodZ(x, y, z + sg * 0.1, z + sg * 0.16, 0.24, 0.24, [150, 154, 156], MAT.HULL, { seg: 10 });
}
/** a hose reel (a drum between two flanges) on a wall */
function reel(c, x, y, z, sg, col) {
  const { b, MAT, shade } = c;
  b.rodZ(x, y, z + sg * 0.05, z + sg * 0.5, 0.34, 0.34, shade(col, 0.8), MAT.HULL, { seg: 10 });
  for (const d of [0.08, 0.47]) b.rodZ(x, y, z + sg * d, z + sg * (d + 0.04), 0.5, 0.5, shade(col, 0.7), MAT.HULL, { seg: 10 });
}

/** the exposed shafts and their bearing struts under the stern */
function shafts(c) {
  const { b, X, MAT, shade, rgb, pal } = c, col = rgb('#6d6a66'), boss = shade(rgb(pal.boot), 1.5);
  for (const sg of [-1, 1]) {
    const z = sg * 2.25, a = [-55.6, -4.0, z], d = [-38.0, -3.25, z];
    tube(c, a, d, 0.27, 0.25, col, { seg: 10 });
    b.rod(-57.4, -54.3, -4.1, z, 0.3, 0.38, boss, MAT.HULL, { seg: 12 });                                           // the hub fairing and its cone
    b.rod(-58.0, -57.4, -4.1, z, 0.02, 0.3, boss, MAT.HULL, { seg: 12 });
    b.rod(-45.7, -44.4, -3.55, z, 0.36, 0.36, boss, MAT.HULL, { seg: 10 });                                         // the bearing
    b.block({ x0: -45.45, x1: -44.65, hw: 0.17, zc: sg * 2.7, y0: -3.55, y1: -2.35, tx0: -45.2, tx1: -44.8 }, shade(boss, 1.1), MAT.HULL);   // its strut
    b.block({ x0: -45.45, x1: -44.65, hw: 0.17, zc: sg * 1.8, y0: -3.55, y1: -2.45, tx0: -45.2, tx1: -44.8 }, shade(boss, 1.1), MAT.HULL);
  }
}

/** a cable through two points hanging with a sag (m) below the straight line, drawn as n straight lengths */
function cable(c, p0, p1, sag, w, col, n = 8) {
  let prev = p0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t];
    wire(c, prev, q, w, col); prev = q;
  }
}

/** the whip aerials and the long cables of the forward mast: to the second stack-mast, to the roof of the bridge */
function rigging(c) {
  const { b, MAT, shade, rgb, pal } = c, steel = shade(rgb(pal.mast), 1.0), thin = shade(steel, 0.9);
  // the whips
  for (const [x, y0, y1, z] of [[42.8, 9.6, 18.0, 0], [13.0, 26.6, 33.7, 0], [-9.8, 17.8, 26.6, 0], [-10.7, 17.0, 21.1, 0.3]]) tube(c, [x, y0, z], [x + 0.02, y1, z], 0.045, 0.025, thin, { seg: 4 });
  for (const sg of [-1, 1]) {
    // three wires each side from the end of the mast's upper yard to the yard of the second stack-mast
    [[4.5, 3.5], [3.8, 3.15], [3.1, 2.8]].forEach(([zm, zk]) => cable(c, [15.2, 26.7, sg * zm], [-7.6, 16.5, sg * zk], 1.3, 0.09, thin, 10));
    // the stays from the mast head down to the edge of the roof of the bridge
    [[1.2, 5.0], [1.6, 5.15], [2.0, 5.3]].forEach(([zm, zr]) => cable(c, [16.4, 27.0, sg * zm], [24.7, 11.4, sg * zr], 0.4, 0.07, thin, 8));
    b.rodZ(-7.6, 16.5, sg * 0, sg * 3.55, 0.05, 0.05, thin, MAT.HULL, { seg: 5 });                                  // the yard of the second stack-mast
  }
}

/** the doors, ladders and fittings of the walls of the long deckhouse (fine detail) */
function wallsFine(c) {
  const { b, Y, MAT, shade, rgb, pal, hull } = c, sup = rgb(pal.sup), steel = shade(rgb(pal.mast), 0.9);
  const wallZ = (x) => { const pl = [[-43.1, 3.2], [-35.8, 5.0], [-19.9, 5.43], [-8.0, 5.5], [8.0, 5.3]]; for (let i = 1; i < pl.length; i++) if (x <= pl[i][0]) { const t = (x - pl[i - 1][0]) / (pl[i][0] - pl[i - 1][0]); return pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * t; } return 5.3; };
  c.fine(() => {
    for (const sg of [-1, 1]) {
      // after end: the two oval doors, the louvre, a ladder
      for (const x of [-39.8, -36.2]) door(c, x, Y(x) + 0.1, Y(x) + 1.9, 1.0, sg * wallZ(x), sg, sup);
      ladderW(c, -29.5, Y(-29.5) + 0.1, 5.2, sg * wallZ(-29.5), sg, steel);
      door(c, -33.0, Y(-33) + 0.1, Y(-33) + 1.8, 0.8, sg * wallZ(-33), sg, sup);
      door(c, -23.0, Y(-23) + 0.1, Y(-23) + 1.9, 0.8, sg * wallZ(-23), sg, sup);
      lifebuoy(c, -24.7, 4.2, sg * wallZ(-24.7), sg); lifebuoy(c, -20.9, 4.3, sg * wallZ(-20.9), sg);
      for (const x of [-12.0, -3.0, 4.5]) door(c, x, Y(x) + 0.1, Y(x) + 1.9, 0.8, sg * wallZ(x), sg, sup);
      reel(c, 5.6, 4.3, sg * wallZ(5.6), sg, sup);
    }
  });
}

function adamsExtras(ctx) {
  const fines = [], c = { ...ctx, fine: (fn) => fines.push(fn) };   // the fine detail goes into the one 'fine' group (a group cannot be appended to)
  const { model } = c;
  model.bridge = { x: 30, y: 12.4, z: 0, towerX: 24, cands: [[30.6, 12.4, 0], [29.4, 12.4, 2.6], [29.4, 12.4, -2.6], [27.5, 10.3, 5.0], [27.5, 10.3, -5.0], [23.0, 11.9, 0]] };
  model.superBox = { x0: -43.1, x1: 36, hw: 5.5, y1: 11.3 };
  bridge(c);
  mack1(c);
  midships(c);
  tubes(c);
  forecastle(c);
  aftDeck(c);
  midDetail(c);
  shafts(c);
  rigging(c);
  wallsFine(c);
  rails(c);
  c.b.group('fine', () => fines.forEach((fn) => fn()));
}

// USS Adams (Charles F. Adams class, 1960): a post-war guided-missile destroyer, hull and structures measured in metres on cuts and views of a reference model.
import * as V4 from './adams_v4.js';

export const ADAMS = {
  v4: V4,
  own: true, camber: 0.28, stern: { overhang: 3.9, tail: 0.6, oex: 1.0 }, mainVariant: 'mk42', dirKind: 'drum', noRadar: true, ownTubes: true, aa: [], houseH: 0.1, bulwarkF: [0, 0.01], bulwark: 0.3,
  fb: [[0, 8.0], [0.02, 7.7], [0.035, 7.4], [0.08, 6.7], [0.14, 5.8], [0.215, 4.8], [0.312, 3.9], [0.425, 3.2], [0.5, 2.9], [0.575, 2.8], [0.763, 2.85], [0.838, 3.1], [0.913, 3.2], [0.965, 3.5], [1, 3.6]],
  planDeck: [[0, 0.025], [0.0133, 0.133], [0.0256, 0.231], [0.0379, 0.317], [0.0513, 0.348], [0.0646, 0.397], [0.0769, 0.446], [0.0892, 0.487], [0.1025, 0.527], [0.1159, 0.565], [0.1282, 0.598], [0.1415, 0.632], [0.1538, 0.662], [0.1671, 0.691], [0.1794, 0.719], [0.1928, 0.744], [0.2051, 0.765], [0.2174, 0.79], [0.2307, 0.809], [0.243, 0.844], [0.2564, 0.847], [0.2697, 0.862], [0.282, 0.875], [0.2943, 0.889], [0.3076, 0.902], [0.321, 0.914], [0.3333, 0.925], [0.3466, 0.933], [0.3589, 0.941], [0.3712, 0.951], [0.3845, 0.961], [0.3979, 0.972], [0.4102, 0.984], [0.4225, 0.99], [0.4358, 0.997], [0.4491, 1.003], [0.4614, 1.01], [0.4748, 1.014], [0.4871, 1.017], [0.4994, 1.02], [0.5127, 1.023], [0.525, 1.024], [0.5383, 1.024], [0.5506, 1.024], [0.564, 1.024], [0.5773, 1.024], [0.5896, 1.024], [0.6029, 1.024], [0.6152, 1.023], [0.6286, 1.019], [0.6409, 1.017], [0.6532, 1.014], [0.6665, 1.012], [0.6788, 1.01], [0.6921, 1.008], [0.7055, 1.006], [0.7178, 1.006], [0.7311, 1.002], [0.7434, 0.994], [0.7567, 0.989], [0.7691, 0.98], [0.7814, 0.97], [0.7947, 0.961], [0.807, 0.951], [0.8203, 0.94], [0.8337, 0.929], [0.846, 0.922], [0.8593, 0.902], [0.8716, 0.884], [0.8849, 0.864], [0.8972, 0.843], [0.9095, 0.82], [0.9229, 0.797], [0.9352, 0.797], [0.9485, 0.789], [0.9618, 0.716], [0.9741, 0.687], [0.9823, 0.64], [0.99, 0.6], [0.9946, 0.41], [0.9977, 0.18], [1, 0]],
  planWL: [[0, 0], [0.0125, 0.067], [0.025, 0.121], [0.0375, 0.169], [0.05, 0.209], [0.075, 0.293], [0.1, 0.372], [0.125, 0.451], [0.15, 0.505], [0.175, 0.593], [0.2, 0.655], [0.225, 0.699], [0.25, 0.765], [0.275, 0.828], [0.3, 0.855], [0.325, 0.895], [0.35, 0.931], [0.375, 0.956], [0.4, 0.981], [0.425, 0.991], [0.45, 1.009], [0.475, 1.013], [0.5, 1.023], [0.525, 1.022], [0.55, 1.025], [0.575, 1.022], [0.6, 1.023], [0.625, 1.013], [0.65, 1.01], [0.675, 0.997], [0.7, 0.997], [0.725, 0.978], [0.75, 0.977], [0.775, 0.958], [0.8, 0.949], [0.825, 0.927], [0.85, 0.891], [0.875, 0.87], [0.9, 0.82], [0.9125, 0.799], [0.925, 0.777], [0.9375, 0.733], [0.95, 0.709], [0.9625, 0.666], [0.975, 0.641], [0.988, 0.593], [0.994, 0.4], [0.998, 0.22], [1, 0]],
  keel: [[0, 0], [0.025, 0], [0.05, 0.96], [0.075, 0.99], [0.1, 1.01], [0.125, 1.03], [0.2, 1.03], [0.8, 1.02], [0.825, 0.95], [0.85, 0.75], [0.875, 0.61], [0.9, 0.48], [0.925, 0.38], [0.95, 0.28], [0.975, 0.2], [1, 0.15]],
  towerF: 0.30,
  props: [{ f: 0.9219, z: 2.25, depth: 4.1, d: 3.2, blades: 5, toF: 0.919, strutF: 0.9235 }],
  rudders: [{ f: 0.9544, z: 2.05, top: 1.2, bottom: 3.9, chord: 3.2, t: 0.22 }],
  extra: adamsExtras,
};
