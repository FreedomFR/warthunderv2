// The islands. A few procedural islands sit in the sea, of every size and height: a rock a hundred metres wide, a hilly island, a mountain range ten kilometres long,
// a volcano with a crater. Each island has a height field (metres above the sea; below zero it is the depth of the water over its shelf), sampled on a grid for
// the simulation: ships run aground where the water is shallower than their draught, shells burst on the slopes and are stopped by them, torpedoes explode on the
// shore, aircraft fly into the mountains, and the line of sight is blocked. The render builds its mesh from the same function (model/islandMesh.js).
import { makeRng, clamp, TAU } from '../math.js';
import { placeBases } from './bases.js';

const SHELF_SLOPE = 0.12;          // the sea floor falls 12 m for every 100 m off the coast
const DEEP = -90;                  // the depth where the shelf ends (and the grid stops)
const SAFE_DEPTH = 32;             // the AI keeps to water deeper than this

// ---- noise ------------------------------------------------------------------------------------------------
function ihash(x, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = ihash(ix, iz, s), b = ihash(ix + 1, iz, s), c = ihash(ix, iz + 1, s), d = ihash(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, s, oct = 4) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, z * f, s + i * 17); norm += a; a *= 0.5; f *= 2.03; }
  return sum / norm;
}

/** The kinds of island: radius (m) of the coast, height (m), how stretched, how steep, how many ridges. */
const KINDS = {
  rock:  { r: [45, 150],    h: [7, 38],    e: [1, 1.7],   pw: 0.7,  ridge: 0.25 },
  small: { r: [260, 760],   h: [28, 120],  e: [1, 1.9],   pw: 0.95, ridge: 0.45 },
  large: { r: [1100, 2300], h: [140, 560], e: [1.1, 1.9], pw: 1.15, ridge: 0.9 },
};
const BIOMES = ['green', 'green', 'green', 'arid', 'rock', 'volcanic'];

/** The height function of an island (u, v in metres from its centre): metres above (positive) or below (negative) the sea. */
function makeHeight(sp) {
  const rng = makeRng(sp.seed * 7919 + 13);
  const harm = [];
  for (let k = 2; k <= 7; k++) harm.push({ k, a: rng.range(0.4, 1) * 0.36 / Math.pow(k, 0.72), p: rng.range(0, TAU) });
  const c = Math.cos(sp.phi), s = Math.sin(sp.phi), meanScale = (1 + sp.e) / 2;
  const crater = sp.biome === 'volcanic' && sp.kind !== 'rock';
  const raw = (u, v) => {
    const a = (u * c + v * s) / sp.e, b = -u * s + v * c;
    const q0 = Math.hypot(a, b) / sp.r0;
    const th = Math.atan2(b, a);
    let f = 1;
    for (const h of harm) f += h.a * Math.cos(h.k * th + h.p);
    f *= 1 + 0.14 * (fbm(u / (sp.r0 * 0.55) + 31, v / (sp.r0 * 0.55) - 17, sp.seed + 3, 3) - 0.5);
    f = Math.max(f, 0.35);
    const q = q0 / f;
    if (q >= 1) {
      const out = (q - 1) * sp.r0 * f * meanScale;
      return Math.max(DEEP, -out * SHELF_SLOPE);
    }
    const t = 1 - q;
    const x = u / (sp.r0 * 0.9), z = v / (sp.r0 * 0.9);
    const ridged = 1 - Math.abs(2 * fbm(x * 1.6 + 5, z * 1.6 + 9, sp.seed + 11, 4) - 1);
    const rough = fbm(u / 38 + 3, v / 38 + 1, sp.seed + 23, 3) - 0.5;
    let h = sp.H * Math.pow(t, sp.pw) * (1 - sp.ridge * 0.55 + sp.ridge * 0.9 * ridged);
    h += sp.H * 0.05 * t * (fbm(x * 5, z * 5, sp.seed + 41, 3) - 0.5) * 2;
    h += rough * Math.min(7, sp.H * 0.07) * Math.min(1, t * 6);
    if (crater) h -= sp.H * 0.55 * Math.exp(-(q * q) / 0.045);
    h = Math.min(h, sp.H * 1.2);
    return Math.max(h, 0);
  };
  if (!sp.pads || !sp.pads.length) return raw;
  // levelled ground (the sites of the bases): inside a rectangle the ground is at the height of the pad, round it the land blends back into the island
  return (u, v) => {
    let h = raw(u, v);
    for (const p of sp.pads) h += (p.y - h) * padWeight(p, sp.x + u, sp.z + v);
    return h;
  };
}

/**
 * How much of the ground at world (x, z) belongs to a pad: 1 inside its rectangle (centre p.x, p.z, axis angle p.ang in the x-z plane, half length hl along it, half width hw),
 * falling to 0 over `blend` metres outside.
 */
export function padWeight(p, x, z) {
  const dx = x - p.x, dz = z - p.z, ca = Math.cos(p.ang), sa = Math.sin(p.ang);
  const a = Math.abs(dx * ca + dz * sa) - p.hl, b = Math.abs(-dx * sa + dz * ca) - p.hw;
  const d = Math.hypot(Math.max(a, 0), Math.max(b, 0));
  if (d >= p.blend) return 0;
  const t = 1 - d / p.blend;
  return t * t * (3 - 2 * t);
}

export class Island {
  /** sp: { id, x, z, kind, seed, r0, H, e, phi, biome } */
  constructor(sp) {
    Object.assign(this, sp);
    this.sp = sp;
    this.pads = sp.pads || [];
    this.fn = makeHeight(sp);
    // the box that holds the coast and the shelf: a stretched, lobed island reaches 1.5 times its radius along its long axis
    this.R = sp.r0 * sp.e * 1.5 + 500;
    this.cell = clamp(this.R / 90, 5, 34);
    this.N = Math.min(420, Math.ceil(2 * this.R / this.cell) + 1);
    this.cell = 2 * this.R / (this.N - 1);
    const g = this.grid = new Float32Array(this.N * this.N);
    let top = 0;
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) {
      const h = this.fn(-this.R + i * this.cell, -this.R + j * this.cell);
      g[j * this.N + i] = h;
      if (h > top) top = h;
    }
    this.top = top;
    // how far from the centre the water is too shallow for a ship (the radius of the circle the AI goes round)
    let rs = 0;
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) if (g[j * this.N + i] > -SAFE_DEPTH) rs = Math.max(rs, Math.hypot(-this.R + i * this.cell, -this.R + j * this.cell));
    this.rSafe = rs;
  }

  /** A copy of this island with levelled pads (see padWeight): the same island, the same seed, with the ground flattened where the bases stand. */
  withPads(pads) {
    const is = new Island({ ...this.sp, pads });
    is.Rb = this.Rb;
    return is;
  }

  /** 0..1: how much the ground at world (x, z) is levelled ground of a base (trees do not grow there, the ground is paved or mown). */
  padAt(x, z) {
    let w = 0;
    for (const p of this.pads) w = Math.max(w, padWeight(p, x, z));
    return w;
  }

  /** The height at world (x, z) (sea level 0; negative under water). */
  heightAt(x, z) {
    const gx = (x - this.x + this.R) / this.cell, gz = (z - this.z + this.R) / this.cell;
    if (gx < 0 || gz < 0 || gx >= this.N - 1 || gz >= this.N - 1) return DEEP;
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, N = this.N, g = this.grid;
    const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /** The coast as a list of segments [x0, z0, x1, z1, ...] (the contour of height 0, marching squares on the grid). */
  coast() {
    if (this._coast) return this._coast;
    const N = this.N, g = this.grid, out = [];
    const px = (i) => this.x - this.R + i * this.cell, pz = (j) => this.z - this.R + j * this.cell;
    const cut = (ia, ja, ib, jb) => { const ha = g[ja * N + ia], hb = g[jb * N + ib], t = ha / (ha - hb); return [px(ia) + (px(ib) - px(ia)) * t, pz(ja) + (pz(jb) - pz(ja)) * t]; };
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const h00 = g[j * N + i] > 0, h10 = g[j * N + i + 1] > 0, h01 = g[(j + 1) * N + i] > 0, h11 = g[(j + 1) * N + i + 1] > 0;
      const n = (h00 ? 1 : 0) + (h10 ? 1 : 0) + (h01 ? 1 : 0) + (h11 ? 1 : 0);
      if (n === 0 || n === 4) continue;
      const pts = [];
      if (h00 !== h10) pts.push(cut(i, j, i + 1, j));
      if (h10 !== h11) pts.push(cut(i + 1, j, i + 1, j + 1));
      if (h01 !== h11) pts.push(cut(i, j + 1, i + 1, j + 1));
      if (h00 !== h01) pts.push(cut(i, j, i, j + 1));
      for (let k = 0; k + 1 < pts.length; k += 2) out.push(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
    }
    return (this._coast = Float32Array.from(out));
  }
}

export class Terrain {
  constructor(islands = []) {
    this.islands = islands;
    this.bases = [];             // the military bases on the islands (sim/bases.js)
  }

  get empty() { return this.islands.length === 0; }

  /** The highest ground at (x, z): above 0 land, below 0 the depth of the water. Far from any island: DEEP. */
  heightAt(x, z) {
    let h = DEEP;
    for (const is of this.islands) {
      const dx = x - is.x, dz = z - is.z;
      if (dx * dx + dz * dz > is.R * is.R) continue;
      const v = is.heightAt(x, z);
      if (v > h) h = v;
    }
    return h;
  }

  /** Slope of the ground at (x, z): [dh/dx, dh/dz]. */
  gradientAt(x, z, d = 12) {
    return [(this.heightAt(x + d, z) - this.heightAt(x - d, z)) / (2 * d), (this.heightAt(x, z + d) - this.heightAt(x, z - d)) / (2 * d)];
  }

  /** Is the straight line from (x0, y0, z0) to (x1, y1, z1) cut by the ground (y: metres above the sea)? */
  blocks(x0, y0, z0, x1, y1, z1) {
    for (const is of this.islands) {
      // does the segment reach the island's box (a circle of radius R)?
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      let t0 = 0;
      if (L2 > 1e-6) t0 = clamp(((is.x - x0) * dx + (is.z - z0) * dz) / L2, 0, 1);
      const cx = x0 + dx * t0 - is.x, cz = z0 + dz * t0 - is.z;
      if (cx * cx + cz * cz > is.R * is.R || is.top < Math.min(y0, y1) - 1) continue;
      const L = Math.sqrt(L2), n = Math.max(2, Math.ceil(L / (is.cell * 1.5)));
      for (let k = 0; k <= n; k++) {
        const f = k / n, x = x0 + dx * f, z = z0 + dz * f;
        if (is.heightAt(x, z) > y0 + (y1 - y0) * f) return true;
      }
    }
    return false;
  }

  /** Does the shell fired from (x0, y0, z0) at elevation `elev` and muzzle velocity v0 (no drag) meet the ground before it has covered the horizontal distance to (x1, z1)? */
  arcBlocked(x0, y0, z0, x1, z1, elev, v0) {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz, D = Math.sqrt(L2);
    if (D < 60) return false;
    const tanE = Math.tan(elev), cosE = Math.cos(elev), k = 4.905 / (v0 * v0 * cosE * cosE);
    for (const is of this.islands) {
      const t0 = clamp(((is.x - x0) * dx + (is.z - z0) * dz) / L2, 0, 1);
      const cx = x0 + dx * t0 - is.x, cz = z0 + dz * t0 - is.z;
      if (cx * cx + cz * cz > is.R * is.R) continue;
      const n = Math.max(2, Math.ceil(D / (is.cell * 1.5)));
      for (let i = 1; i < n; i++) {
        const f = i / n, sd = D * f;
        if (is.heightAt(x0 + dx * f, z0 + dz * f) > y0 + tanE * sd - k * sd * sd + 0.5) return true;
      }
    }
    return false;
  }

  /**
   * The way round an island that is in the way: when the straight line from (x, z) to (tx, tz) is cut by the ground, a point to head for instead
   * (beside the island, on the side that makes the shorter trip), or null.
   */
  detour(x, z, tx, tz) {
    let best = null, bt = 2;
    const dx = tx - x, dz = tz - z, L2 = dx * dx + dz * dz;
    if (L2 < 1) return null;
    for (const is of this.islands) {
      const t = clamp(((is.x - x) * dx + (is.z - z) * dz) / L2, 0, 1);
      const cx = x + dx * t - is.x, cz = z + dz * t - is.z;
      if (Math.hypot(cx, cz) > is.rSafe + 300) continue;
      if (!this.blocks(x, 0.5, z, tx, 0.5, tz) && Math.hypot(cx, cz) > is.rSafe * 0.6) continue;
      if (t < bt) { bt = t; best = is; }
    }
    if (!best) return null;
    const is = best, L = Math.sqrt(L2), nx = -dz / L, nz = dx / L, r = is.rSafe + 700;
    const a = [is.x + nx * r, is.z + nz * r], b = [is.x - nx * r, is.z - nz * r];
    const da = Math.hypot(a[0] - x, a[1] - z) + Math.hypot(tx - a[0], tz - a[1]), db = Math.hypot(b[0] - x, b[1] - z) + Math.hypot(tx - b[0], tz - b[1]);
    return da < db ? a : b;
  }

  /**
   * What a ship moving at `speed` along `heading` has to steer away from: the shallow water and the land ahead (fan of probes) and near her (ring).
   * Returns { ax, az, slow }: a push (unit-ish vector, away from the ground) and a speed factor 0..1.
   */
  avoid(x, z, heading, speed, L) {
    let ax = 0, az = 0, slow = 1, near = false;
    for (const is of this.islands) {
      const dx = x - is.x, dz = z - is.z;
      const reach = is.R + 4000;
      if (dx * dx + dz * dz > reach * reach) { continue; }
      near = true;
    }
    if (!near) return { ax, az, slow };
    const look = clamp(speed * 80, 900, 3600);
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    for (const da of [-1.0, -0.5, 0, 0.5, 1.0]) {
      const s = Math.sin(heading + da), c = -Math.cos(heading + da);
      for (const k of [0.3, 0.6, 1]) {
        const d = look * k, px = x + s * d, pz = z + c * d;
        const depth = -this.heightAt(px, pz);
        if (depth >= SAFE_DEPTH) continue;
        const w = (1 - k * 0.7) * clamp((SAFE_DEPTH - depth) / SAFE_DEPTH, 0.15, 1.3) * (1 - Math.abs(da) * 0.25);
        // away from the probe, a little to the side of the course so that a head-on approach turns one way
        const sx = x - px, sz = z - pz, sl = Math.hypot(sx, sz) || 1;
        const side = (da === 0 ? 1 : -Math.sign(da)) * 0.35;
        ax += (sx / sl + -fz * side) * w; az += (sz / sl + fx * side) * w;
        if (k <= 0.6 && da * da < 0.3) slow = Math.min(slow, 0.35 + 0.65 * (d / look));
      }
    }
    // the ring round the ship: land close by pushes her off whatever she is doing
    const ring = L * 0.9 + 260;
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * TAU / 8) * ring, pz = z + Math.sin(a * TAU / 8) * ring;
      const depth = -this.heightAt(px, pz);
      if (depth < SAFE_DEPTH * 0.7) { const w = clamp((SAFE_DEPTH * 0.7 - depth) / SAFE_DEPTH, 0.2, 1.5) * 1.6; ax -= Math.cos(a * TAU / 8) * w; az -= Math.sin(a * TAU / 8) * w; }
    }
    return { ax, az, slow };
  }

  /**
   * A ship with these hull points (world [x, z] pairs) and draught: how deep she sits in the ground at the worst point and which way is out.
   * Returns null when she floats.
   */
  grounding(points, draught) {
    let worst = null;
    for (const [x, z] of points) {
      const h = this.heightAt(x, z);
      if (h > -draught) {
        const pen = h + draught;
        if (!worst || pen > worst.pen) worst = { pen, x, z, h };
      }
    }
    if (!worst) return null;
    const g = this.gradientAt(worst.x, worst.z);
    const gl = Math.hypot(g[0], g[1]) || 1e-3;
    worst.nx = -g[0] / gl; worst.nz = -g[1] / gl; worst.slope = gl;
    return worst;
  }

  /**
   * Islands for a battle. density 0 = none, 1 = a few, 2 = an archipelago; `keepOut`: [{ x, z, r }] circles to leave clear (the fleets at the start);
   * `axis`: [x0, z0, x1, z1], the line between the fleets: the big islands stay clear of it so that the fleets can meet.
   */
  static generate(seed, density = 1, keepOut = [], axis = null, radius = 21000, o = {}) {
    if (!density) return new Terrain([]);
    const rng = makeRng((seed | 0) * 2654435761 + 977);
    const plan = density === 1
      ? ['large', 'small', 'small', 'rock', 'rock', 'rock'].slice(0, rng.int(3, 6))
      : ['large', 'large', 'small', 'small', 'small', 'rock', 'rock', 'rock', 'rock', 'rock', 'rock'].slice(0, rng.int(8, 11));
    if (rng() < 0.5) plan.sort(() => rng() - 0.5);
    const islands = [];
    for (const kind of plan) {
      const K = KINDS[kind];
      for (let attempt = 0; attempt < 60; attempt++) {
        const sp = {
          id: islands.length, kind, seed: (rng() * 1e9) | 0, r0: rng.range(K.r[0], K.r[1]), H: rng.range(K.h[0], K.h[1]),
          e: rng.range(K.e[0], K.e[1]), phi: rng.range(0, Math.PI), pw: K.pw, ridge: K.ridge, biome: rng.pick(BIOMES),
        };
        if (kind === 'large') sp.H *= rng.range(0.7, 1);
        const Rb = sp.r0 * sp.e * 1.3 + 300;                     // what has to stay clear (the coast and a margin)
        const a = rng() * TAU, d = Math.sqrt(rng()) * (radius - Rb * 0.5);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.hypot(x, z) + Rb > radius + 3500) continue;
        if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + Rb)) continue;
        if (islands.some((o) => Math.hypot(x - o.x, z - o.z) < o.Rb + Rb + 700)) continue;
        if (axis && kind === 'large') {
          // distance from the axis segment
          const [x0, z0, x1, z1] = axis, dx = x1 - x0, dz = z1 - z0, t = clamp(((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1), 0, 1);
          if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < Rb + 2200) continue;
        }
        sp.x = x; sp.z = z;
        const is = new Island(sp);
        is.Rb = Rb;
        islands.push(is);
        break;
      }
    }
    const terrain = new Terrain(islands);
    // military bases: `o.bases` 0 none, 1 an airfield and a battery for every team that can have them, 2 more batteries; `o.starts` [{ x, z, nation }] the fleets
    if (o.bases && o.starts) placeBases(terrain, { seed, level: o.bases, starts: o.starts });
    return terrain;
  }
}
