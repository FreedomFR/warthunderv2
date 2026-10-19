// The plants as meshes: eight species (oak, fir, palm, tropical canopy tree, acacia, cypress, shrub, boulder), three variants each, at four levels of detail.
//   level 0 (near): the trunk and the branches as tapered tubes, the crown as lumps of foliage whose edge the shader erodes into leaves, plus cards of leaves with a
//                   cut-out (leaflets, needles, palm fronds) scattered over the crown. Two meshes: the solid one (casts shadows) and the cards.
//   level 1: the trunk and the main limbs, the crown as 8-20 small lumps.   level 2: a trunk and a few lumps.   level 3 (far): one or two lumps.
// The way a tree grows follows the usual recipe of procedural trees (a trunk that tapers, recursive limbs with a tropism, foliage at the tips of the last
// generation; see the credits in the README): a plan is drawn once per species and variant, then emitted at each level of detail so that the silhouette stays the same.
import { MeshBuilder, MAT } from './meshbuilder.js';
import { makeRng } from '../math.js';
import { SP, SPECIES } from './vegetation.js';

// colour families of the foliage (index in the shader's table, 16 shades per family: r = family * 16 + shade)
export const FAM = { OAK: 0, FIR: 1, PALM: 2, JUNGLE: 3, ACACIA: 4, CYPRESS: 5, SHRUB: 6, COCONUT: 7, DRY: 8 };
// shapes of the leaf cards (shader: leafMask)
export const SHAPE = { BROAD: 0, NEEDLE: 1, FROND: 2, SHRUB: 3, FEATHER: 4, BIGLEAF: 5, DRY: 6 };

const BARK = { oak: [64, 54, 44], fir: [84, 54, 40], palm: [112, 100, 84], jungle: [74, 62, 50], acacia: [76, 62, 50], cypress: [84, 68, 52], shrub: [78, 62, 46] };

// ---- small vector helpers ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerpv = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hash3 = (x, y, z, s) => {
  let h = (Math.imul(Math.round(x * 997) | 0, 374761393) + Math.imul(Math.round(y * 991) | 0, 668265263) + Math.imul(Math.round(z * 983) | 0, 1274126177) + Math.imul(s | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** a random unit vector, `up` > 0 favouring the upward hemisphere */
function randDir(rng, up = 0) {
  const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return norm([r * Math.cos(a), z + up, r * Math.sin(a)]);
}
/** rotate v about the axis (unit) by angle a */
function rotAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v) * (1 - c), kv = cross(k, v);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}
const perp = (t) => norm(Math.abs(t[1]) < 0.9 ? cross(t, [0, 1, 0]) : cross(t, [1, 0, 0]));

// ---- icospheres ----
const icoCache = [];
function ico(detail) {
  if (icoCache[detail]) return icoCache[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a * 4096 + b : b * 4096 + a;
      if (cache.has(k)) return cache.get(k);
      v.push(norm(lerpv(v[a], v[b], 0.5)));
      cache.set(k, v.length - 1);
      return v.length - 1;
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return (icoCache[detail] = { v, f });
}

/**
 * A lump of foliage: an ellipsoid (radii rx, ry, rz; rotated by pitch about z then yaw about y) of which the vertices are shaken, so that the crown is not made of balls.
 * The normals lean towards the outside of the crown (cc, cr: centre and radius of the whole crown) and the ambient occlusion darkens the inside and the underside.
 * o: { detail, disp, fam, shade, tone, sway, yaw, pitch, seed, mat, col, soft }
 */
function lump(b, cx, cy, cz, rx, ry, rz, cc, cr, o) {
  const { v, f } = ico(o.detail);
  const cy_ = Math.cos(o.yaw || 0), sy_ = Math.sin(o.yaw || 0), cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0);
  const mat = o.mat || MAT.LEAF;
  const base = b.p.length / 3;
  const R = o.fam * 16 + Math.round(clamp01(o.shade ?? 0.5) * 15);
  for (let i = 0; i < v.length; i++) {
    const u = v[i];
    const dsp = 1 + (o.disp ?? 0.14) * (hash3(u[0], u[1], u[2], o.seed | 0) - 0.5) * 2;
    let lx = u[0] * rx * dsp, ly = u[1] * ry * dsp, lz = u[2] * rz * dsp;
    let nx = u[0] / rx, ny = u[1] / ry, nz = u[2] / rz;
    // pitch (about z), then yaw (about y)
    let t = lx * cp - ly * sp; ly = lx * sp + ly * cp; lx = t;
    t = nx * cp - ny * sp; ny = nx * sp + ny * cp; nx = t;
    let px = lx * cy_ + lz * sy_, pz = -lx * sy_ + lz * cy_;
    let qx = nx * cy_ + nz * sy_, qz = -nx * sy_ + nz * cy_;
    px += cx; ly += cy; pz += cz;
    const wx = px - cc[0], wy = ly - cc[1], wz = pz - cc[2];
    const wl = Math.hypot(wx, wy, wz) || 1;
    const nl = Math.hypot(qx, ny, qz) || 1;
    const soft = o.soft ?? 0.5;
    let n = norm([qx / nl * (1 - soft) + wx / wl * soft, ny / nl * (1 - soft) + wy / wl * soft, qz / nl * (1 - soft) + wz / wl * soft]);
    const d = Math.min(1.1, wl / Math.max(cr, 0.01));
    const ao = clamp01((0.42 + 0.58 * Math.pow(clamp01((d - 0.1) / 0.9), 0.8)) * (0.72 + 0.28 * (n[1] * 0.5 + 0.5)));
    const col = o.col || [R, Math.round(clamp01(o.tone ?? 0.5) * 255), Math.round(clamp01((o.sway ?? 0) / 0.6) * 255)];
    b.vert(px, ly, pz, n[0], n[1], n[2], col, mat, ao);
  }
  for (const [a, c, d] of f) b.tri(base + a, base + c, base + d);
}

/** a tapered tube along `pts` (radii `rad`), `sides` faces round, closed at the tip. col: [r, g, b]; o.mat */
function tube(b, pts, rad, sides, col, o = {}) {
  const n = pts.length, mat = o.mat ?? MAT.BARK;
  const base = b.p.length / 3;
  let u = null;
  for (let k = 0; k < n; k++) {
    const t = norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
    u = u ? norm(sub(u, mul(t, dot(u, t)))) : perp(t);
    const w = cross(t, u);
    const shade = 1 + (o.jitter ?? 0.08) * (hash3(pts[k][0], pts[k][1], pts[k][2], 5) - 0.5);
    const c = [col[0] * shade, col[1] * shade, col[2] * shade];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const d = [u[0] * ca + w[0] * sa, u[1] * ca + w[1] * sa, u[2] * ca + w[2] * sa];
      b.vert(pts[k][0] + d[0] * rad[k], pts[k][1] + d[1] * rad[k], pts[k][2] + d[2] * rad[k], d[0], d[1], d[2], c, mat, o.ao ?? 1);
    }
  }
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < sides; s++) {
    const s1 = (s + 1) % sides;
    const a = base + k * sides + s, c = base + k * sides + s1, d = base + (k + 1) * sides + s1, e = base + (k + 1) * sides + s;
    b.tri(a, e, d); b.tri(a, d, c);
  }
  const t = norm(sub(pts[n - 1], pts[n - 2]));
  const tip = b.vert(pts[n - 1][0] + t[0] * rad[n - 1] * 0.6, pts[n - 1][1] + t[1] * rad[n - 1] * 0.6, pts[n - 1][2] + t[2] * rad[n - 1] * 0.6, t[0], t[1], t[2], col, mat, o.ao ?? 1);
  for (let s = 0; s < sides; s++) b.tri(base + (n - 1) * sides + s, tip, base + (n - 1) * sides + (s + 1) % sides);
}

/** a card (quad) of leaves centred at c, spanned by half-axes a (width) and h (length); shading normal nrm; wind amplitude in the vertex ambient occlusion */
function card(b, c, a, h, nrm, shape, sway) {
  const ao = clamp01(sway / 0.6);
  const p = [[-1, -1, 0, 0], [1, -1, 255, 0], [1, 1, 255, 255], [-1, 1, 0, 255]].map(([sx, sy, u, v]) => b.vert(
    c[0] + a[0] * sx + h[0] * sy, c[1] + a[1] * sx + h[1] * sy, c[2] + a[2] * sx + h[2] * sy, nrm[0], nrm[1], nrm[2], [u, v, shape * 16], MAT.CARD, ao));
  b.tri(p[0], p[1], p[2]); b.tri(p[0], p[2], p[3]);
}

/** cards scattered over a lump: n cards of size s on and a little inside its surface */
function cardsOn(bc, rng, c, r, cc, cr, n, s, shape, sway, o = {}) {
  for (let i = 0; i < n; i++) {
    const d = randDir(rng, o.up ?? 0.15);
    const k = 0.86 + 0.42 * rng();
    const p = [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k];
    const out = norm(sub(p, cc));
    const nrm = norm(addv(mul(out, 0.75), mul(d, 0.25)));
    // the card lies along the surface with some droop and a random roll
    let a = norm(cross(d, o.axis || [0, 1, 0]));
    if (len(cross(d, o.axis || [0, 1, 0])) < 1e-3) a = perp(d);
    let h = cross(d, a);
    const roll = rng() * Math.PI * 2;
    const a2 = rotAxis(a, d, roll), h2 = rotAxis(h, d, roll);
    const w = s * (0.7 + 0.6 * rng());
    card(bc, p, mul(a2, w * (o.aspect ?? 1)), mul(h2, w), nrm, shape, sway * (0.5 + 0.5 * p[1] / Math.max(cc[1] + cr, 1)));
  }
}

/** The path of a branch: n sections from p0 along d, bending by `bend` towards `toward` (a tropism: up, down...) and wandering a little */
function pathOf(rng, p0, d, length, n, bend, toward, wander = 0.08) {
  const pts = [p0];
  let dir = norm(d), p = p0;
  for (let i = 0; i < n; i++) {
    dir = norm(addv(addv(dir, mul(toward, bend / n)), mul(randDir(rng), wander)));
    p = addv(p, mul(dir, length / n));
    pts.push(p);
  }
  return pts;
}
const taper = (n, r0, r1, flare = 0) => Array.from({ length: n + 1 }, (_, i) => r0 + (r1 - r0) * (i / n) + flare * Math.pow(1 - i / n, 4));

// ---- the plans: a skeleton (tubes) and foliage clumps for each species ----
// clump: { c: [x, y, z], r: [rx, ry, rz], yaw, pitch, fam, shade, kind }

function planBroad(rng, sp, o) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [];
  const trunkH = H * o.trunk;
  const lean = norm([rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08)]);
  const tpts = pathOf(rng, [0, -0.3, 0], lean, trunkH, 7, 0, [0, 1, 0], 0.035);
  const tr = taper(7, o.r0, o.r0 * 0.62, o.r0 * 0.5);
  tubes.push({ pts: tpts, rad: tr, level: 0 });
  const nl = o.limbs + rng.int(0, 2);
  const golden = 2.399963 + rng.range(-0.2, 0.2);
  for (let i = 0; i < nl; i++) {
    const at = trunkH * (0.62 + 0.42 * (i / nl)) ;
    const k = Math.min(7, Math.floor(at / trunkH * 7));
    const p0 = lerpv(tpts[k], tpts[Math.min(7, k + 1)], (at / trunkH * 7) - k);
    const th = o.spread[0] + (o.spread[1] - o.spread[0]) * rng();             // angle from the vertical
    const az = i * golden;
    const dir = [Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)];
    const L = H * o.limbLen * (0.8 + 0.4 * rng());
    const pts = pathOf(rng, p0, dir, L, 5, o.droop, [0, -1, 0], 0.1);
    const rr = o.r0 * (0.5 - 0.1 * i / nl);
    tubes.push({ pts, rad: taper(5, rr, rr * 0.28), level: 1 });
    // twigs from the outer half of the limb, each ending in a clump
    const nt = o.twigs + rng.int(0, 1);
    for (let t = 0; t < nt; t++) {
      const f = 0.45 + 0.55 * (t + 0.5) / nt, kk = Math.min(4, Math.floor(f * 5));
      const q0 = lerpv(pts[kk], pts[kk + 1], f * 5 - kk);
      const ld = norm(sub(pts[kk + 1], pts[kk]));
      const td = norm(addv(rotAxis(ld, perp(ld), rng.range(0.4, 0.9)), mul(randDir(rng), 0.25)));
      const tl = L * rng.range(0.34, 0.5);
      const tp = pathOf(rng, q0, td, tl, 3, 0.1, [0, 1, 0], 0.12);
      tubes.push({ pts: tp, rad: taper(3, rr * 0.4, rr * 0.1), level: 2 });
      const e = tp[3];
      clumps.push({ c: e, r: mul([1, o.flat, 1], H * o.clump * rng.range(0.6, 1.3)), fam: o.fam, shade: rng.range(0.2, 0.9), yaw: rng() * 6.28, pitch: 0 });
    }
    const e = pts[5];
    clumps.push({ c: e, r: mul([1, o.flat, 1], H * o.clump * rng.range(1.0, 1.3)), fam: o.fam, shade: rng.range(0.25, 0.95), yaw: rng() * 6.28, pitch: 0 });
    if (rng() < 0.7) { const m = lerpv(pts[2], pts[3], rng()); clumps.push({ c: m, r: mul([1, o.flat, 1], H * o.clump * 0.8), fam: o.fam, shade: rng.range(0.2, 0.7), yaw: rng() * 6.28, pitch: 0 }); }
  }
  // the leader: a short extension of the trunk with a clump on top
  const top = tpts[7], ld = [rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)];
  const lp = pathOf(rng, top, ld, H * o.leader, 3, 0, [0, 1, 0], 0.08);
  tubes.push({ pts: lp, rad: taper(3, o.r0 * 0.5, o.r0 * 0.14), level: 1 });
  clumps.push({ c: addv(lp[3], [0, H * 0.04, 0]), r: mul([1, o.flat, 1], H * o.clump * 1.15), fam: o.fam, shade: rng.range(0.55, 1), yaw: 0, pitch: 0 });
  // a few clumps low in the crown, over the trunk, so that no daylight shows through the middle
  for (let i = 0; i < 3; i++) clumps.push({ c: addv(tpts[7], [rng.range(-1, 1) * H * 0.16, rng.range(-0.02, 0.12) * H, rng.range(-1, 1) * H * 0.16]), r: mul([1, o.flat, 1], H * o.clump * 0.9), fam: o.fam, shade: rng.range(0, 0.5), yaw: rng() * 6.28, pitch: 0 });
  return { tubes, clumps, H, bark: o.bark, sides: [7, 5, 4], card: { shape: o.shape, n: o.cards, size: o.cardSize, aspect: 1 }, sway: o.sway };
}

function planFir(rng, sp) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [], clumps1 = [];
  const lean = norm([rng.range(-0.04, 0.04), 1, rng.range(-0.04, 0.04)]);
  tubes.push({ pts: pathOf(rng, [0, -0.3, 0], lean, H * 0.9, 7, 0, [0, 1, 0], 0.02), rad: taper(7, 0.3, 0.03, 0.18), level: 0 });
  const tiers = 12, y0 = H * 0.12, y1 = H * 0.96;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = y0 + (y1 - y0) * f;
    const R = (H * 0.27 * Math.pow(1 - f, 0.92) + H * 0.02) * rng.range(0.9, 1.1);
    const n = Math.max(3, Math.round(3 + R / 0.85));
    const off = rng() * 6.28;
    for (let i = 0; i < n; i++) {
      const az = off + (i / n) * 6.28 + rng.range(-0.15, 0.15);
      const rr = R * rng.range(0.9, 1.05);
      const droop = 0.3 + 0.25 * (1 - f);
      const c = { c: [Math.cos(az) * rr * 0.5, y - rr * 0.08, Math.sin(az) * rr * 0.5], r: [rr * 0.55, H * 0.036 + rr * 0.07, rr * 0.3], yaw: -az, pitch: -droop, fam: FAM.FIR, shade: rng.range(0.1, 0.8), disp: 0.24 };
      clumps.push(c);
      if (t % 3 === 0 && i % 2 === 0) clumps1.push({ ...c, r: [c.r[0] * 1.15, c.r[1] * 1.5, c.r[2] * 1.9] });
    }
  }
  clumps.push({ c: [0, H * 0.93, 0], r: [H * 0.045, H * 0.1, H * 0.045], yaw: 0, pitch: 0, fam: FAM.FIR, shade: 0.9 });
  const c1 = [0.22, 0.38, 0.54, 0.7, 0.85].map((f, i) => {
    const R = H * 0.27 * Math.pow(Math.max(0, 1 - (f - 0.12) / 0.84), 0.92) + H * 0.035;
    return { c: [0, H * f, 0], r: [R, H * 0.17, R], yaw: i * 0.7, pitch: 0, fam: FAM.FIR, shade: 0.2 + 0.12 * (i % 3) };
  });
  const c2 = [0.2, 0.42, 0.66, 0.86].map((f, i) => ({ c: [0, H * f, 0], r: [H * 0.3 * (1 - f) + H * 0.07, H * 0.16, H * 0.3 * (1 - f) + H * 0.07], yaw: i, pitch: 0, fam: FAM.FIR, shade: 0.25 + 0.2 * i }));
  const c3 = [{ c: [0, H * 0.5, 0], r: [H * 0.2, H * 0.47, H * 0.2], yaw: 0, pitch: 0, fam: FAM.FIR, shade: 0.5 }];
  return { tubes, clumps, clumps1: c1, clumps2: c2, clumps3: c3, H, bark: BARK.fir, sides: [7, 5, 4], card: { shape: SHAPE.NEEDLE, n: 7, size: 0.55, aspect: 0.8 }, sway: 0.2, lumpDetail: 0, softCrown: 0.35 };
}

function planPalm(rng, sp) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [], clumps1 = [], cards = [], frondLumps = [];
  const lean = rng.range(0.1, 0.32), az = rng() * 6.28;
  const pts = [];
  const N = 12;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([Math.cos(az) * lean * H * t * t, H * t * (1 - 0.05 * t), Math.sin(az) * lean * H * t * t]); }
  // the rings of old leaf scars swell the trunk
  const rad = pts.map((_, i) => { const t = i / N; return (0.2 - 0.07 * t + 0.1 * Math.pow(1 - t, 6)) * (1 + 0.1 * Math.sin(i * 7.3)); });
  tubes.push({ pts, rad, level: 0 });
  const top = pts[N];
  const nf = 15;
  for (let i = 0; i < nf; i++) {
    const a = i * 2.399963 + rng.range(-0.15, 0.15), e = 0.35 + 1.1 * Math.pow(i / nf, 0.8) * rng.range(0.85, 1.1) * (i < 4 ? 1.1 : 1);
    const L = H * rng.range(0.4, 0.5), droop = rng.range(0.7, 1.1);
    const dirH = [Math.cos(a), 0, Math.sin(a)];
    const path = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      path.push([top[0] + dirH[0] * Math.cos(e) * L * t, top[1] + Math.sin(e) * L * t - droop * L * t * t * 0.9 + 0.2, top[2] + dirH[2] * Math.cos(e) * L * t]);
    }
    cards.push({ path, dirH, L });
    const mid = path[3], tip = path[6], tang = norm(sub(tip, path[0]));
    frondLumps.push({ c: mid, r: [L * 0.52, 0.16, L * 0.2], yaw: -a, pitch: Math.atan2(tang[1], Math.hypot(tang[0], tang[2])), fam: FAM.PALM, shade: rng.range(0.1, 0.9), kind: 'frond' });
    if (i % 2 === 0) clumps1.push({ c: lerpv(path[0], tip, 0.55), r: [L * 0.62, 0.3, L * 0.3], yaw: -a, pitch: Math.atan2(tang[1], Math.hypot(tang[0], tang[2])) - 0.1, fam: FAM.PALM, shade: rng.range(0.1, 0.9) });
  }
  // coconuts
  for (let i = 0; i < 5; i++) clumps.push({ c: addv(top, [rng.range(-0.3, 0.3), -0.35, rng.range(-0.3, 0.3)]), r: [0.2, 0.22, 0.2], yaw: 0, pitch: 0, fam: FAM.COCONUT, shade: rng(), kind: 'nut', disp: 0.05 });
  const c2 = [0, 1, 2, 3, 4].map((i) => { const a = i * 1.26 + rng(); return { c: addv(top, [Math.cos(a) * H * 0.13, H * 0.03, Math.sin(a) * H * 0.13]), r: [H * 0.2, 0.35, H * 0.1], yaw: -a, pitch: -0.1, fam: FAM.PALM, shade: rng.range(0.2, 0.8) }; });
  const c3 = [{ c: addv(top, [0, H * 0.04, 0]), r: [H * 0.3, H * 0.09, H * 0.3], yaw: 0, pitch: 0, fam: FAM.PALM, shade: 0.5 }];
  return { tubes, clumps, frondLumps, clumps1, clumps2: c2, clumps3: c3, H, bark: BARK.palm, sides: [7, 5, 4], frondCards: cards, sway: 0.5, lumpDetail: 0, softCrown: 0.1, noCrownAO: true, crownC: addv(top, [0, 0.3, 0]), crownR: H * 0.45 };
}

function planAcacia(rng, sp) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [];
  const trunkH = H * 0.42;
  const lean = norm([rng.range(-0.25, 0.25), 1, rng.range(-0.25, 0.25)]);
  const tp = pathOf(rng, [0, -0.2, 0], lean, trunkH, 5, 0, [0, 1, 0], 0.1);
  tubes.push({ pts: tp, rad: taper(5, 0.2, 0.13, 0.12), level: 0 });
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * 6.28 + rng.range(-0.3, 0.3), th = rng.range(0.5, 0.95);
    const L = H * rng.range(0.34, 0.5);
    const pts = pathOf(rng, tp[5], [Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)], L, 4, 0.1, [0, 1, 0], 0.1);
    tubes.push({ pts, rad: taper(4, 0.12, 0.04), level: 1 });
    const e = pts[4];
    clumps.push({ c: addv(e, [0, H * 0.05, 0]), r: [H * rng.range(0.3, 0.42), H * 0.085, H * rng.range(0.3, 0.42)], yaw: rng() * 6.28, pitch: rng.range(-0.1, 0.1), fam: FAM.ACACIA, shade: rng.range(0.2, 0.9) });
    clumps.push({ c: addv(lerpv(pts[2], e, 0.5), [0, H * 0.08, 0]), r: [H * 0.26, H * 0.07, H * 0.26], yaw: rng() * 6.28, pitch: 0, fam: FAM.ACACIA, shade: rng.range(0.1, 0.6) });
  }
  return { tubes, clumps, H, bark: BARK.acacia, sides: [6, 5, 4], card: { shape: SHAPE.FEATHER, n: 16, size: 0.42, aspect: 1.2 }, sway: 0.3, lumpDetail: 1, softCrown: 0.5, crownC: [0, H * 0.78, 0], crownR: H * 0.55 };
}

function planCypress(rng, sp) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [];
  tubes.push({ pts: pathOf(rng, [0, -0.2, 0], [rng.range(-0.03, 0.03), 1, 0], H * 0.4, 3, 0, [0, 1, 0], 0.02), rad: taper(3, 0.16, 0.1, 0.06), level: 0 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), y = H * (0.2 + 0.72 * f), w = H * 0.11 * (1 - Math.pow(f, 2.2) * 0.8) + H * 0.02;
    clumps.push({ c: [rng.range(-0.1, 0.1), y, rng.range(-0.1, 0.1)], r: [w, H * 0.12, w], yaw: rng() * 6.28, pitch: 0, fam: FAM.CYPRESS, shade: rng.range(0.1, 0.9) });
  }
  const c2 = [0.34, 0.62, 0.86].map((f, i) => ({ c: [0, H * f, 0], r: [H * 0.12 * (1.1 - f * 0.6), H * 0.2, H * 0.12 * (1.1 - f * 0.6)], yaw: i, pitch: 0, fam: FAM.CYPRESS, shade: 0.3 + 0.2 * i }));
  const c3 = [{ c: [0, H * 0.55, 0], r: [H * 0.12, H * 0.45, H * 0.12], yaw: 0, pitch: 0, fam: FAM.CYPRESS, shade: 0.5 }];
  return { tubes, clumps, clumps1: clumps.filter((_, i) => i % 2 === 0).map((c) => ({ ...c, r: [c.r[0] * 1.1, c.r[1] * 1.9, c.r[2] * 1.1] })), clumps2: c2, clumps3: c3, H, bark: BARK.cypress, sides: [6, 4, 4], card: { shape: SHAPE.NEEDLE, n: 7, size: 0.34, aspect: 0.6 }, sway: 0.1, lumpDetail: 1, softCrown: 0.55, crownC: [0, H * 0.55, 0], crownR: H * 0.4 };
}

function planShrub(rng, sp, dry) {
  const H = SPECIES[sp].H0;
  const tubes = [], clumps = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.28, d = rng.range(0, 0.5) * H * 0.55, y = H * rng.range(0.28, 0.62);
    const r = H * rng.range(0.26, 0.4);
    clumps.push({ c: [Math.cos(a) * d, y, Math.sin(a) * d], r: [r, r * 0.82, r], yaw: rng() * 6.28, pitch: 0, fam: dry ? FAM.DRY : FAM.SHRUB, shade: rng.range(0.1, 0.9) });
    tubes.push({ pts: [[Math.cos(a) * d * 0.3, 0, Math.sin(a) * d * 0.3], [Math.cos(a) * d * 0.7, y * 0.5, Math.sin(a) * d * 0.7], [Math.cos(a) * d, y, Math.sin(a) * d]], rad: [0.035, 0.025, 0.012], level: 2 });
  }
  return { tubes, clumps, H, bark: [96, 76, 54], sides: [4, 3, 3], card: { shape: dry ? SHAPE.DRY : SHAPE.SHRUB, n: 6, size: 0.22, aspect: 1 }, sway: 0.12, lumpDetail: 1, softCrown: 0.45, crownC: [0, H * 0.45, 0], crownR: H * 0.55 };
}

function planBoulder(rng) {
  return { rock: true, H: 1.6 };
}

const PLANS = {
  [SP.OAK]: (rng, dry) => planBroad(rng, SP.OAK, { trunk: 0.33, r0: 0.38, limbs: 6, spread: [0.5, 1.15], limbLen: 0.44, droop: 0.28, twigs: 3, flat: 0.78, clump: 0.145, leader: 0.12, fam: FAM.OAK, shape: SHAPE.BROAD, cards: 34, cardSize: 0.5, bark: BARK.oak, sway: 0.35 }),
  [SP.JUNGLE]: (rng) => planBroad(rng, SP.JUNGLE, { trunk: 0.5, r0: 0.55, limbs: 6, spread: [0.8, 1.35], limbLen: 0.4, droop: 0.12, twigs: 3, flat: 0.66, clump: 0.17, leader: 0.1, fam: FAM.JUNGLE, shape: SHAPE.BIGLEAF, cards: 44, cardSize: 0.7, bark: BARK.jungle, sway: 0.4 }),
  [SP.FIR]: (rng) => planFir(rng, SP.FIR), [SP.PALM]: (rng) => planPalm(rng, SP.PALM), [SP.ACACIA]: (rng) => planAcacia(rng, SP.ACACIA),
  [SP.CYPRESS]: (rng) => planCypress(rng, SP.CYPRESS), [SP.SHRUB]: (rng, dry) => planShrub(rng, SP.SHRUB, dry), [SP.BOULDER]: (rng) => planBoulder(rng),
};

/** Reduce a list of clumps to about k bigger ones (neighbours in the crown merged). */
function reduce(clumps, k, fam) {
  if (clumps.length <= k) return clumps;
  const sorted = clumps.slice().sort((a, b) => (Math.atan2(a.c[2], a.c[0]) + a.c[1] * 0.02) - (Math.atan2(b.c[2], b.c[0]) + b.c[1] * 0.02));
  const out = [], per = Math.ceil(sorted.length / k);
  for (let i = 0; i < sorted.length; i += per) {
    const g = sorted.slice(i, i + per);
    const c = [0, 0, 0];
    for (const q of g) { c[0] += q.c[0] / g.length; c[1] += q.c[1] / g.length; c[2] += q.c[2] / g.length; }
    let rx = 0, ry = 0, rz = 0;
    for (const q of g) { rx = Math.max(rx, Math.abs(q.c[0] - c[0]) + q.r[0]); ry = Math.max(ry, Math.abs(q.c[1] - c[1]) + q.r[1]); rz = Math.max(rz, Math.abs(q.c[2] - c[2]) + q.r[2]); }
    out.push({ c, r: [rx * 0.95, ry * 0.95, rz * 0.95], yaw: 0, pitch: 0, fam: g[0].fam, shade: g.reduce((s, q) => s + q.shade, 0) / g.length });
  }
  return out;
}

// the palm frond cards: a curved strip along the frond, split into segments
function frondStrip(bc, f, sway) {
  const { path, dirH, L } = f;
  const n = path.length - 1;
  const side = norm(cross(dirH, [0, 1, 0]));
  const base = bc.p.length / 3;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const w = L * 0.17 * Math.sin(Math.PI * Math.pow(t, 0.6)) + 0.03;
    const tg = norm(sub(path[Math.min(n, k + 1)], path[Math.max(0, k - 1)]));
    const nn = norm(cross(side, tg));
    // the leaflets hang down on both sides: the strip is a shallow V
    const hang = w * 0.45;
    const l = [path[k][0] - side[0] * w, path[k][1] - side[1] * w - hang, path[k][2] - side[2] * w];
    const r = [path[k][0] + side[0] * w, path[k][1] + side[1] * w - hang, path[k][2] + side[2] * w];
    const mid = path[k];
    const up = nn[1] < 0 ? mul(nn, -1) : nn;
    const aoSway = clamp01(sway * (0.35 + 0.65 * t) / 0.6);
    bc.vert(l[0], l[1], l[2], up[0], up[1], up[2], [0, t * 255, SHAPE.FROND * 16], MAT.CARD, aoSway);
    bc.vert(mid[0], mid[1], mid[2], up[0], up[1], up[2], [127, t * 255, SHAPE.FROND * 16], MAT.CARD, aoSway);
    bc.vert(r[0], r[1], r[2], up[0], up[1], up[2], [255, t * 255, SHAPE.FROND * 16], MAT.CARD, aoSway);
  }
  for (let k = 0; k < n; k++) for (let s = 0; s < 2; s++) {
    const a = base + k * 3 + s, b2 = base + k * 3 + s + 1, c = base + (k + 1) * 3 + s + 1, d = base + (k + 1) * 3 + s;
    bc.tri(a, b2, c); bc.tri(a, c, d);
  }
}

/** Emit a plan at a level of detail. Returns { solid, cards } (packed meshes; cards is null above level 0). */
function emit(plan, lod, seed) {
  const b = new MeshBuilder(), bc = lod === 0 ? new MeshBuilder() : null;
  const rng = makeRng(seed * 7 + 3);
  const H = plan.H;
  const swayAmp = (y) => (plan.sway ?? 0.3) * Math.pow(clamp01(y / H), 1.6) * Math.sqrt(H / 12);
  const cc = plan.crownC || [0, H * 0.7, 0];
  const cr = plan.crownR || H * 0.5;
  if (plan.rock) {
    const r = H * 0.5;
    lump(b, 0, r * 0.4, 0, r * 1.25, r * 0.78, r * 1.05, [0, r * 0.4, 0], r * 1.3, { detail: [0, 1, 2][Math.max(0, 2 - lod)] ?? 0, disp: 0.2, fam: 0, mat: MAT.ROCK, col: [128, 124, 116], soft: 0.15, seed: seed + 1 });
    return { solid: b.build({ ao: false }), cards: null };
  }
  // the skeleton
  const sides = plan.sides;
  let limb = 0;
  for (const t of plan.tubes) {
    if (lod >= 3) break;
    if (lod === 2 && t.level > 0) continue;
    if (lod === 1 && (t.level > 1 || (t.level === 1 && limb++ % 2))) continue;
    let pts = t.pts, rad = t.rad;
    if (lod === 2 && pts.length > 4) { const k = pts.map((_, i) => i).filter((i) => i % 3 === 0 || i === pts.length - 1); pts = k.map((i) => pts[i]); rad = k.map((i) => rad[i]); }
    tube(b, pts, rad, sides[Math.min(lod, 2)], plan.bark);
  }
  // the crown
  let clumps = plan.clumps;
  if (lod === 1) clumps = plan.clumps1 || reduce(plan.clumps, 10);
  else if (lod === 2) clumps = plan.clumps2 || reduce(plan.clumps, 3);
  else if (lod >= 3) clumps = plan.clumps3 || reduce(plan.clumps, 1);
  const detail = lod === 0 ? (plan.lumpDetail ?? 1) : 0;
  const ccrown = plan.crownC || (() => { const m = [0, 0, 0]; for (const c of plan.clumps) { m[0] += c.c[0] / plan.clumps.length; m[1] += c.c[1] / plan.clumps.length; m[2] += c.c[2] / plan.clumps.length; } return m; })();
  let crownR = plan.crownR;
  if (!crownR) { crownR = 1; for (const c of plan.clumps) crownR = Math.max(crownR, Math.hypot(c.c[0] - ccrown[0], c.c[1] - ccrown[1], c.c[2] - ccrown[2]) + Math.max(...c.r) * 0.8); }
  let i = 0;
  for (const c of clumps) {
    const sw = swayAmp(c.c[1]);
    lump(b, c.c[0], c.c[1], c.c[2], c.r[0], c.r[1], c.r[2], ccrown, crownR, { detail: c.kind === 'nut' ? 1 : detail, disp: c.disp ?? (lod === 0 ? 0.13 : 0.1), fam: c.fam, shade: c.shade, tone: 0.5, sway: sw, yaw: c.yaw, pitch: c.pitch, seed: seed * 31 + i++, soft: plan.softCrown ?? 0.5 });
  }
  if (lod === 0 && bc) {
    if (plan.frondCards) for (const f of plan.frondCards) frondStrip(bc, f, plan.sway);
    else if (plan.card) {
      for (const c of plan.clumps) {
        if (c.kind === 'nut') continue;
        const sw = swayAmp(c.c[1]) * 1.4;
        cardsOn(bc, rng, c.c, c.r, ccrown, crownR, plan.card.n, plan.card.size, plan.card.shape, sw, { aspect: plan.card.aspect, up: plan.card.shape === SHAPE.NEEDLE ? -0.2 : 0.15 });
      }
    }
  }
  return { solid: b.build({ ao: false }), cards: bc && bc.p.length ? bc.build({ ao: false }) : null };
}

const cache = new Map();
/** The template of a species at a level of detail: { solid, cards } of packed meshes (unit scale: the plant is SPECIES[sp].H0 high, base at the origin). */
export function getTemplate(sp, variant, lod, dry = false) {
  const key = ((sp * 4 + variant) * 4 + lod) * 2 + (dry ? 1 : 0);
  let t = cache.get(key);
  if (t) return t;
  const seed = sp * 131 + variant * 17 + 5;
  let plan = cache.get('plan' + sp + ':' + variant + ':' + dry);
  if (!plan) { plan = PLANS[sp](makeRng(seed), dry); cache.set('plan' + sp + ':' + variant + ':' + dry, plan); }
  t = emit(plan, lod, seed);
  cache.set(key, t);
  return t;
}

/** Colour multipliers of the boulders by biome (the template stone is a neutral grey). */
export const ROCK_TINT = { green: [1.0, 1.0, 0.95], arid: [1.2, 1.02, 0.8], rock: [0.95, 0.97, 1.02], volcanic: [0.42, 0.4, 0.4] };

/**
 * Stamp the plants of `rec` (records of vegetation.scatter) at a level of detail into one mesh, in the frame of the origin (ox, oz) with y = metres above the sea.
 * opt: { dry (shrubs of dry climates), rock: [r, g, b] multiplier of the stone, keep: fraction of the plants kept (far away: fewer, bigger) }.
 */
export function stampPlants(rec, ox, oz, lod, opt = {}) {
  const n = rec.length / 8;
  const keep = opt.keep ?? 1, grow = keep < 1 ? 1 / Math.sqrt(keep) : 1;
  const rock = opt.rock || [1, 1, 1];
  const items = [];
  let vc = 0, ic = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 8, code = rec[o + 5], sp = code & 7, variant = (code >> 3) % 3;
    if (keep < 1 && rec[o + 7] > keep) continue;
    if (lod >= 3 && sp === SP.BOULDER && rec[o + 4] < 1.6) continue;
    const t = getTemplate(sp, variant, lod, !!opt.dry && sp === SP.SHRUB).solid;
    items.push(i, t);
    vc += t.vertexCount; ic += t.indexCount;
  }
  const buf = new ArrayBuffer(vc * 24), idx = new Uint32Array(ic);
  const df = new Float32Array(buf), ds = new Int16Array(buf), du = new Uint8Array(buf);
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let v0 = 0, i0 = 0;
  for (let k = 0; k < items.length; k += 2) {
    const o = items[k] * 8, t = items[k + 1];
    const sp = rec[o + 5] & 7, H = rec[o + 4], s = H / SPECIES[sp].H0 * grow, yaw = rec[o + 3], tone = rec[o + 6];
    const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s, cn = Math.cos(yaw), snn = Math.sin(yaw);
    const tx = rec[o] - ox, ty = rec[o + 1], tz = rec[o + 2] - oz;
    const sf = new Float32Array(t.vertices), ss = new Int16Array(t.vertices), su = new Uint8Array(t.vertices);
    for (let v = 0; v < t.vertexCount; v++) {
      const a = v * 6, a2 = v * 12, a3 = v * 24, d = (v0 + v) * 6, d2 = (v0 + v) * 12, d3 = (v0 + v) * 24;
      const px = sf[a], py = sf[a + 1], pz = sf[a + 2];
      const x = px * c + pz * sn + tx, y = py * s + ty, z = -px * sn + pz * c + tz;
      df[d] = x; df[d + 1] = y; df[d + 2] = z;
      const nx = ss[a2 + 6], nz = ss[a2 + 8];
      ds[d2 + 6] = Math.round(nx * cn + nz * snn); ds[d2 + 7] = ss[a2 + 7]; ds[d2 + 8] = Math.round(-nx * snn + nz * cn); ds[d2 + 9] = ss[a2 + 9];
      const mat = su[a3 + 23];
      let r = su[a3 + 20], g = su[a3 + 21], b = su[a3 + 22];
      if (mat === MAT.LEAF) {
        g = Math.max(0, Math.min(255, g + (tone - 0.5) * 90));
        if (opt.dry && (r >> 4) === FAM.SHRUB) r = FAM.DRY * 16 + (r & 15);
      } else if (mat === MAT.BARK) {
        const f = 0.8 + 0.4 * tone; r *= f; g *= f; b *= f;
      } else if (mat === MAT.ROCK) {
        const f = 0.8 + 0.4 * tone; r *= f * rock[0]; g *= f * rock[1]; b *= f * rock[2];
      }
      du[d3 + 20] = r; du[d3 + 21] = g; du[d3 + 22] = b; du[d3 + 23] = mat;
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
      if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
    }
    for (let j = 0; j < t.indexCount; j++) idx[i0 + j] = t.indices[j] + v0;
    v0 += t.vertexCount; i0 += t.indexCount;
  }
  return { vertices: buf, indices: idx, vertexCount: vc, indexCount: ic, aabb: bb };
}
