// Shared bits of the base models: the palette of each nation, and small drawing helpers (smooth lofts, rings, ragged ground patches, vehicles, drums...).
// Everything is in a local frame: +x forward, +y up, +z to the right of +x (the frame of the ship models), the origin on the ground.
import { MAT, rgb, shade, mix } from './meshbuilder.js';

/** Paints of the buildings by nation (camouflage palette of the nation: USA olive drab, Japan dark green, UK green / brown, Germany grey-green, France khaki, Italy sand). */
export const BASE_PAL = {
  USA: { wall: '#65684d', roof: '#555a40', roof2: '#6b6e50', roof3: '#444935', door: '#454a38', trim: '#979589', conc: '#8c887f', tank: '#a2a49d', hut: '#8a7f60', hutRoof: '#5f6454', earth: '#566a3a', arch: true },
  Japan: { wall: '#49563d', roof: '#424f36', roof2: '#58603f', roof3: '#36412d', door: '#2f3629', trim: '#808375', conc: '#7f7d73', tank: '#626955', hut: '#7a6c52', hutRoof: '#585b49', earth: '#4d6034', arch: false },
  UK: { wall: '#565c3d', roof: '#4b5036', roof2: '#62603f', roof3: '#3f482a', door: '#3b4130', trim: '#928f81', conc: '#88847b', tank: '#7d8277', hut: '#837758', hutRoof: '#5a5e4a', earth: '#566a3a', arch: true },
  Germany: { wall: '#5f6759', roof: '#555d51', roof2: '#716f58', roof3: '#485144', door: '#3c423a', trim: '#99978c', conc: '#8a887f', tank: '#7c8279', hut: '#817b66', hutRoof: '#5b5f52', earth: '#566a3a', arch: true },
  France: { wall: '#79744f', roof: '#6e6a4a', roof2: '#6d6c4a', roof3: '#7e714d', door: '#4d4c36', trim: '#9e9989', conc: '#8f8d83', tank: '#8e917d', hut: '#90855f', hutRoof: '#6a6750', earth: '#5c6e3d', arch: false },
  Italy: { wall: '#938760', roof: '#8a7e5a', roof2: '#8f8460', roof3: '#9e8f68', door: '#5c553d', trim: '#aaa28f', conc: '#979283', tank: '#999a8c', hut: '#a49670', hutRoof: '#7a7058', earth: '#667540', arch: false },
};
export const palOf = (nation) => BASE_PAL[nation] || BASE_PAL.USA;
/** The colour of the earth banks and mounds, after the ground of the island they stand on. */
export const EARTH = { green: '#566a3a', arid: '#8a7a54', rock: '#6c735e', volcanic: '#4b4846' };
export const earthOf = (biome) => EARTH[biome] || EARTH.green;
/** Packed earth and gravel of the yards, shoulders and roads (drawn with the grain of the ground, which darkens them): [shoulder, yard, road]. */
export const DIRT = {
  green: ['#9d977f', '#8e8a72', '#a39d85'], arid: ['#bfa979', '#b09a6c', '#c8b383'],
  rock: ['#9b9a88', '#8c8c7a', '#a3a290'], volcanic: ['#6d6764', '#625c59', '#756f6b'],
};
export const dirtOf = (biome) => DIRT[biome] || DIRT.green;

export const C = rgb;
export const DARK = '#1b1d1f';
export const CHAR = '#26231f';
export const RUST = '#5b4332';

/** A cheap deterministic hash in [0, 1) of two numbers. */
export function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A box without the chamfers that the builder gives to metre-sized boxes. */
export function slab(b, cx, cy, cz, sx, sy, sz, col, mat = MAT.HULL, o = {}) { return b.box(cx, cy, cz, sx, sy, sz, col, mat, { bevel: 0, ...o }); }

/** A solid between two heights, with both its corners at x0..x1, z0..z1 (a block with sharp edges). */
export function bar(b, x0, x1, y0, y1, z0, z1, col, mat = MAT.HULL, o = {}) {
  return b.block({ x0, x1, hw: (z1 - z0) / 2, zc: (z0 + z1) / 2, y0, y1, bevel: 0, ...o }, col, mat);
}

/** A flat polygon (convex, points [x, y, z]) facing away from `ref`. */
export function poly(b, pts, col, mat, ref, ao = 1) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const c = [cx / pts.length, cy / pts.length, cz / pts.length];
  for (let i = 0; i < pts.length; i++) b.triFlat(c, pts[i], pts[(i + 1) % pts.length], col, mat, ref, ao);
}

/** A quad with a normal per corner (smooth shading): the winding is chosen so that the face looks along the average normal. */
export function smoothQuad(b, P, N, col, mat = MAT.HULL, ao = 1) {
  const ids = P.map((p, i) => b.vert(p[0], p[1], p[2], N[i][0], N[i][1], N[i][2], col, mat, ao));
  const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
  const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  let nx = 0, ny = 0, nz = 0;
  for (const n of N) { nx += n[0]; ny += n[1]; nz += n[2]; }
  if (g[0] * nx + g[1] * ny + g[2] * nz < 0) b.quadIdx(ids[0], ids[3], ids[2], ids[1]);
  else b.quadIdx(ids[0], ids[1], ids[2], ids[3]);
}

/**
 * A smooth surface along x: the profile (points [z, y], a polyline) swept from x0 to x1. `ref` = [y, z] of a point inside, normals point away from it.
 * colFn(i) gives the colour of the strip between profile points i and i + 1.
 */
export function loftX(b, x0, x1, prof, colFn, mat, ref, ao = 1) {
  const n = prof.length;
  const nrm = prof.map((p, i) => {
    const a = prof[Math.max(0, i - 1)], c = prof[Math.min(n - 1, i + 1)];
    let tz = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    let nz = ty / l, ny = -tz / l;
    if (nz * (p[0] - ref[1]) + ny * (p[1] - ref[0]) < 0) { nz = -nz; ny = -ny; }
    return [0, ny, nz];
  });
  for (let i = 0; i + 1 < n; i++) {
    const a = prof[i], c = prof[i + 1];
    smoothQuad(b, [[x0, a[1], a[0]], [x1, a[1], a[0]], [x1, c[1], c[0]], [x0, c[1], c[0]]], [nrm[i], nrm[i], nrm[i + 1], nrm[i + 1]], colFn(i), mat, ao);
  }
}

/** The end of a lofted surface: the closed profile as a flat face at x, looking towards +x (dir = 1) or -x (dir = -1). */
export function capX(b, x, prof, dir, col, mat, ao = 1) {
  const pts = prof.map((p) => [x, p[1], p[0]]);
  let cy = 0; for (const p of prof) cy += p[1];
  cy /= prof.length;
  poly(b, pts, col, mat, [x - dir * 5, cy, 0], ao);
}

/** A ring wall (axis y) between radii r0 and r1 from y0 to y1, `gap` = [angle, width] leaves an opening. */
export function ring(b, cx, cz, r0, r1, y0, y1, col, mat = MAT.CANVAS, o = {}) {
  const seg = o.seg || 24, topCol = o.topCol || col;
  const a0 = o.gap ? o.gap[0] + o.gap[1] / 2 : 0, span = o.gap ? Math.PI * 2 - o.gap[1] : Math.PI * 2;
  const ref = [cx, (y0 + y1) / 2, cz];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + span * i / seg, t1 = a0 + span * (i + 1) / seg, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const q = (rr, y) => [cx + rr * c0, y, cz + rr * s0];
    const w = (rr, y) => [cx + rr * c1, y, cz + rr * s1];
    smoothQuad(b, [q(r1, y0), w(r1, y0), w(r1, y1), q(r1, y1)], [[c0, 0, s0], [c1, 0, s1], [c1, 0, s1], [c0, 0, s0]], col, mat, 1);
    smoothQuad(b, [q(r0, y0), w(r0, y0), w(r0, y1), q(r0, y1)], [[-c0, 0, -s0], [-c1, 0, -s1], [-c1, 0, -s1], [-c0, 0, -s0]], col, mat, 0.8);
    b.quad(q(r0, y1), w(r0, y1), w(r1, y1), q(r1, y1), topCol, mat, [cx, y0 - 1, cz], 1);
  }
  if (o.gap) {   // the faces of the opening
    for (const t of [a0, a0 + span]) {
      const c = Math.cos(t), s = Math.sin(t);
      b.quad([cx + r0 * c, y0, cz + r0 * s], [cx + r1 * c, y0, cz + r1 * s], [cx + r1 * c, y1, cz + r1 * s], [cx + r0 * c, y1, cz + r0 * s], col, mat, ref, 0.9);
    }
  }
}

/** A flat disc on the ground (axis y), jagged when `rng` is given: scorch marks, oil, craters. */
export function disc(b, cx, y, cz, r, col, mat = MAT.CANVAS, rng = null, seg = 14, rz = r) {
  const ref = [cx, y - 1, cz];
  const rad = (i) => (rng ? 0.68 + 0.5 * hash2(i, Math.round(r * 100) + (rng.salt || 0)) : 1);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, k0 = rad(i), k1 = rad((i + 1) % seg);
    b.triFlat([cx, y, cz], [cx + Math.cos(a0) * r * k0, y, cz + Math.sin(a0) * rz * k0], [cx + Math.cos(a1) * r * k1, y, cz + Math.sin(a1) * rz * k1], col, mat, ref, 1);
  }
}

/** A truck: cab, bed and six wheels, pointing along +x; (x, z) the middle, standing on y. kind: 'truck' | 'bowser' | 'jeep' */
export function vehicle(b, x, y, z, yaw, kind, col, canvas = '#59553f') {
  b.push().translate(x, y, z);
  if (yaw) b.rotateY(-yaw);
  const body = C(col), dark = C('#17181a'), glass = C('#10181e');
  const wheel = (wx, wz, r = 0.5) => { b.push().translate(wx, r, wz).rotateX(Math.PI / 2); b.cylinder(0, -0.2, 0, r, r, 0.2, dark, MAT.CANVAS, { seg: 8 }); b.pop(); };
  if (kind === 'jeep') {
    slab(b, 0, 0.85, 0, 3.2, 0.5, 1.5, body); slab(b, -0.3, 1.2, 0, 1.2, 0.35, 1.4, shade(body, 0.9)); slab(b, 0.55, 1.35, 0, 0.1, 0.5, 1.3, glass, MAT.GLASS);
    for (const wx of [-1.0, 1.05]) for (const sz of [-1, 1]) wheel(wx, sz * 0.85, 0.38);
  } else {
    slab(b, 2.0, 1.1, 0, 2.0, 1.6, 2.3, shade(body, 1.05));                    // cab
    slab(b, 2.95, 1.55, 0, 0.1, 0.8, 2.0, glass, MAT.GLASS);
    slab(b, 0.2, 0.85, 0, 7.0, 0.35, 2.2, shade(body, 0.7));                    // chassis
    if (kind === 'bowser') { b.push().translate(-0.5, 0, 0).rotateZ(-Math.PI / 2); b.cyl(-1.9, -3.3, 0, 1.1, 1.1, 1.1, 1.1, 1.5, C('#6f7266'), MAT.HULL, { seg: 14 }); b.pop(); }
    else { slab(b, -1.2, 1.9, 0, 4.0, 1.9, 2.4, C(canvas), MAT.CANVAS); slab(b, -1.2, 0.95, 0, 4.4, 0.15, 2.4, shade(body, 0.75)); }
    for (const wx of [2.0, -0.8, -2.6]) for (const sz of [-1, 1]) wheel(wx, sz * 1.05);
  }
  b.pop();
}

/** A stack of fuel drums standing on a pallet: nx by nz drums. */
export function drums(b, x, y, z, nx, nz, yaw, col) {
  b.push().translate(x, y, z);
  if (yaw) b.rotateY(-yaw);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const dx = (i - (nx - 1) / 2) * 0.62, dz = (j - (nz - 1) / 2) * 0.62, c = ((i * 7 + j * 3) % 3) ? C(col) : shade(col, 0.8);
    b.cylinder(dx, 0, dz, 0.29, 0.29, 0.88, c, MAT.HULL, { seg: 7, capBottom: false });
  }
  b.pop();
}

/** A row of sandbags along a line (the bags are 0.9 x 0.4 x 0.45 boxes in a running bond), `rows` high. */
export function sandbags(b, x0, z0, x1, z1, y, rows, col, thick = 0.5) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 0.85));
  const yaw = Math.atan2(dz, dx);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0.5 : 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + off) / n; if (t > 1) continue;
      const k = 0.9 + 0.12 * Math.sin(i * 4.1 + r * 2.3);
      b.push().translate(x0 + dx * t, y + r * 0.34 + 0.2, z0 + dz * t).rotateY(-yaw);
      slab(b, 0, 0, 0, Math.min(1.0, len / n * 1.04), 0.36 * k, thick * k, shade(col, 0.9 + 0.12 * ((i + r) % 3 / 2)), MAT.CANVAS);
      b.pop();
    }
  }
}

/** A flag staff with the national ensign streaming along -x. */
export function flagStaff(b, x, y, z, h, len) {
  b.cylinder(x, y, z, 0.1, 0.06, y + h, C('#d8d4c8'), MAT.HULL, { seg: 6 });
  b.sphere(x, y + h + 0.1, z, 0.1, 0.1, 0.1, C('#c9a24a'), MAT.HULL, { seg: 6, rings: 4 });
  const w = len * 2 / 3, n = 8, m = 2;
  const ids = [];
  for (let j = 0; j <= m; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) { const u = i / n, v = j / m; row.push(b.vert(x - u * len - 0.1, y + h - v * w, z + 0.08, 0, 0, 1, [u * 255, v * 255, Math.min(255, len * 10)], MAT.ENSIGN, 1)); }
    ids.push(row);
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) b.quadIdx(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
}

/** A radio mast: a slim pole with cross-arms and stays. */
export function mast(b, x, y, z, h, col = '#8c8f86') {
  const c = C(col);
  b.cylinder(x, y, z, 0.1, 0.06, y + h, c, MAT.HULL, { seg: 6 });
  for (const f of [0.55, 0.82]) b.beam([x, y + h * f, z - 1.2], [x, y + h * f, z + 1.2], 0.07, 0.07, c, MAT.HULL, { caps: false });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.beam([x, y + h * 0.9, z], [x + dx * h * 0.35, y, z + dz * h * 0.35], 0.02, 0.02, shade(c, 0.6), MAT.DARK, { caps: false });
}

export { shade, mix, rgb };
