// Parametric hull lofting.
//
// The hull is a parametric surface P(t, k): t runs from the bow (0) to the stern (1) along each
// horizontal "level" k (k < 0 below the waterline, k > 0 above, k = 1 at the deck edge). Each level has
// its own length (raked stem, cut-away forefoot, stern overhang), so clipper bows, flared bows and
// cruiser sterns come out of a handful of numbers. Frame: +x bow, +y up, +z starboard, y = 0 is the
// design waterline.
import { MAT, rgb } from './meshbuilder.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Monotone cubic interpolation (no overshoot) through [[x, y], ...] sorted by x. */
export function pchip(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-9));
  if (n === 1) return () => ys[0];
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * h: {
 *   L, B, D,                      overall length, waterline beam, draft
 *   fb: [[frac, freeboard], ...]  deck height above the waterline along the length (frac 0 = bow)
 *   bow: { rake, pr, forefoot, entrance, m, q, flare, flareLen }
 *   stern: { run, transom, overhang, rise, m }
 *   mid: { pb, flare, tumble }    section fullness exponent, deck flare, tumblehome
 *   planWL, planDeck: [[t, ratio], ...]  measured half-breadths (fraction of B/2) at the waterline and at the deck edge along the
 *                                 length (t = 0 at the stem); they replace the bow / stern formulas and the flare above water
 *   hullCol, deckCol, camber, bulwark, bulwarkCol, bulwarkF: [f0, f1] (the bulwark only runs between these fractions from the bow)
 * }
 */
export function buildHull(b, h) {
  const L = h.L, B = h.B, D = h.D;
  const bow = { rake: 3, pr: 1.5, forefoot: 4, entrance: 0.32, m: 2.2, q: 1.15, flare: 0.22, flareLen: 0.4, ...h.bow };
  const st = { run: 0.25, transom: 0.4, overhang: 2, rise: 4, m: 1.8, ...h.stern };
  const mid = { pb: 3, flare: 0.04, tumble: 0, ...h.mid };
  const camber = h.camber ?? 0.3;
  const hullCol = rgb(h.hullCol || '#555a60'), deckCol = rgb(h.deckCol || '#6a625a');
  const fbF = pchip(h.fb);
  const wlF = h.planWL ? pchip(h.planWL) : null, dkF = h.planDeck ? pchip(h.planDeck) : null;
  // keel line: full draft along the length, rising a little under the counter
  const dF = h.draftProfile ? pchip(h.draftProfile) : (f) => 1 - 0.4 * smooth(0.9, 1.0, f);

  const xs_wl = L / 2 - bow.rake, xa_wl = -L / 2 + st.overhang;
  const xStem = (k) => (k >= 0 ? xs_wl + bow.rake * Math.pow(k, bow.pr) : xs_wl - bow.forefoot * Math.pow(-k, 2.2));
  const xAft = (k) => (k >= 0 ? xa_wl - st.overhang * Math.pow(k, 1.4) : xa_wl + st.rise * Math.pow(-k, 2.0));

  // plan shape: 0 at the tips, 1 amidships
  const shape = (t) => {
    if (wlF) return Math.max(wlF(t), 0);
    let w = 1;
    if (t < bow.entrance) { const x = t / bow.entrance; w = Math.pow(1 - Math.pow(1 - x, bow.m), bow.q); }
    const sx = (1 - t) / st.run;
    if (sx < 1) w = Math.min(w, st.transom + (1 - st.transom) * (1 - Math.pow(1 - Math.max(sx, 0), st.m)));
    return w;
  };
  // section: width ratio at level k (k<0: under water)
  // under water the sections are full amidships and get finer towards the ends (a V-shaped run where the screws turn)
  const pbAt = (t) => mid.pb + ((mid.pbRun ?? 1.6) - mid.pb) * smooth(0.72, 0.96, t) + ((mid.pbEntry ?? 2.2) - mid.pb) * smooth(0.3, 0.04, t);
  const sec = (k, t) => {
    if (k <= 0) {
      const u = -k, pb = pbAt(t);
      return Math.max(Math.pow(Math.max(1 - Math.pow(u, pb), 0), 1 / pb), 0.02);
    }
    if (dkF) { const wl = Math.max(wlF ? wlF(t) : shape(t), 0.02); return 1 + (dkF(t) / wl - 1) * Math.pow(k, 1.4) - mid.tumble * k * k; }
    const bf = t < bow.flareLen ? Math.pow(1 - t / bow.flareLen, 2) : 0;
    return 1 + mid.flare * k + bow.flare * bf * Math.pow(k, 1.4) - mid.tumble * k * k;
  };

  // levels (keel .. deck)
  const levels = [-1, -0.9, -0.78, -0.66, -0.55, -0.46, -0.37, -0.29, -0.21, -0.15, -0.1, -0.05, 0, 0.06, 0.16, 0.24, 0.32, 0.42, 0.52, 0.62, 0.72, 0.8, 0.88, 0.95, 1];
  const NS = h.stations || 150;
  const ts = [];
  for (let i = 0; i <= NS; i++) ts.push(0.5 - 0.5 * Math.cos(Math.PI * i / NS));
  const NK = levels.length;

  // grid of positions (starboard half; port is mirrored)
  const P = new Array(NS + 1);
  for (let i = 0; i <= NS; i++) {
    P[i] = new Array(NK);
    const t = ts[i];
    for (let j = 0; j < NK; j++) {
      const k = levels[j];
      const xS = xStem(k), xA = xAft(k);
      const x = xS - t * (xS - xA);
      const f = (L / 2 - x) / L;
      const y = k >= 0 ? k * fbF(f) : k * D * dF(clamp(f, 0, 1));
      const hb = (B / 2) * shape(t) * sec(k, t);
      P[i][j] = [x, y, hb];
    }
  }
  // smooth normals (central differences on the grid), starboard outward = +z
  const N = new Array(NS + 1);
  for (let i = 0; i <= NS; i++) {
    N[i] = new Array(NK);
    for (let j = 0; j < NK; j++) {
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, NS), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, NK - 1);
      const ti = [P[i1][j][0] - P[i0][j][0], P[i1][j][1] - P[i0][j][1], P[i1][j][2] - P[i0][j][2]];
      const tj = [P[i][j1][0] - P[i][j0][0], P[i][j1][1] - P[i][j0][1], P[i][j1][2] - P[i][j0][2]];
      // outward (starboard) = tj x ti
      let nx = tj[1] * ti[2] - tj[2] * ti[1], ny = tj[2] * ti[0] - tj[0] * ti[2], nz = tj[0] * ti[1] - tj[1] * ti[0];
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { nx = 0; ny = 0; nz = 1; } else { nx /= l; ny /= l; nz /= l; }
      N[i][j] = [nx, ny, nz];
    }
  }

  // emit hull skin, both sides
  const idx = [[], []];
  for (let s = 0; s < 2; s++) {
    const sg = s === 0 ? 1 : -1;
    for (let i = 0; i <= NS; i++) {
      idx[s][i] = [];
      for (let j = 0; j < NK; j++) {
        const p = P[i][j], n = N[i][j];
        const ao = levels[j] < -0.6 ? 0.7 : 1;
        idx[s][i][j] = b.vert(p[0], p[1], p[2] * sg, n[0], n[1], n[2] * sg, hullCol, MAT.SKIN, ao);
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NK - 1; j++) {
        const a = idx[s][i][j], c = idx[s][i + 1][j], d = idx[s][i + 1][j + 1], e = idx[s][i][j + 1];
        // starboard (sg=+1): (i,j),(i,j+1),(i+1,j+1),(i+1,j) ; port is the mirror image -> reversed
        if (sg > 0) b.quadIdx(a, e, d, c); else b.quadIdx(a, c, d, e);
      }
    }
  }

  // transom (flat vertical plate closing the stern between the two sides)
  {
    const i = NS;
    const col = shade2(hullCol, 0.92);
    const rows = [];
    for (let j = 0; j < NK; j++) {
      const p = P[i][j];
      rows.push([b.vert(p[0], p[1], p[2], -1, 0, 0, col, MAT.SKIN, 0.9), b.vert(p[0], p[1], -p[2], -1, 0, 0, col, MAT.SKIN, 0.9)]);
    }
    for (let j = 0; j < NK - 1; j++) {
      // normal -x: (starboard j, port j, port j+1, starboard j+1)
      b.quadIdx(rows[j][0], rows[j + 1][0], rows[j + 1][1], rows[j][1]);
    }
  }

  // deck
  const top = NK - 1;
  const CK = 8;
  const deckRows = [];
  for (let i = 0; i <= NS; i++) {
    const p = P[i][top];
    const row = [];
    for (let k = -CK; k <= CK; k++) {
      const u = k / CK;
      const y = p[1] + camber * (1 - u * u);
      // slope of the camber -> normal tilts outward
      const nz = -2 * camber * u / (p[2] || 1) / CK * CK * 0.5;
      const nn = Math.hypot(nz, 1);
      row.push(b.vert(p[0], y, p[2] * u, 0, 1 / nn, nz / nn, deckCol, MAT.DECK, 1));
    }
    deckRows.push(row);
  }
  for (let i = 0; i < NS; i++) {
    for (let k = 0; k < 2 * CK; k++) {
      // normal +y: (i,k),(i,k+1),(i+1,k+1),(i+1,k)  -> (aft direction) x (+z) ... verify orientation below
      const a = deckRows[i][k], c = deckRows[i + 1][k], d = deckRows[i + 1][k + 1], e = deckRows[i][k + 1];
      b.quadIdx(a, c, d, e);
    }
  }

  // bulwark: a low wall along the deck edge
  const bw = h.bulwark ?? 0.9;
  const bwCol = rgb(h.bulwarkCol || h.hullCol || '#555a60');
  if (bw > 0) {
    for (const sg of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= NS; i++) {
        const p = P[i][top];
        const fi = (L / 2 - p[0]) / L;
        if (p[2] < 0.3 || (h.bulwarkF && (fi < h.bulwarkF[0] || fi > h.bulwarkF[1]))) { prev = null; continue; }
        const inw = Math.max(p[2] - 0.14, 0.05);
        const A = [p[0], p[1], p[2] * sg], Ai = [p[0], p[1], inw * sg];
        const Au = [p[0], p[1] + bw, p[2] * sg], Aiu = [p[0], p[1] + bw, inw * sg];
        if (prev) {
          const [pA, pAi, pAu, pAiu] = prev;
          b.quad(pA, A, Au, pAu, bwCol, MAT.HULL, [A[0], A[1] + bw / 2, 0], 1);                                     // outer face
          b.quad(pAu, Au, Aiu, pAiu, shade2(bwCol, 1.1), MAT.HULL, [A[0], A[1] - 1, A[2]], 1);                       // top
          b.quad(pAi, pAiu, Aiu, Ai, shade2(bwCol, 0.9), MAT.HULL, [A[0], A[1] + bw / 2, p[2] * sg + sg], 1);         // inner face
        }
        prev = [A, Ai, Au, Aiu];
      }
    }
  }

  /** starboard half-breadth of the hull skin at longitudinal position x and height y above the waterline (y >= 0) */
  const sideZ = (x, y) => {
    let prevY = null, prevZ = null;
    for (let j = 0; j < NK; j++) {
      const k = levels[j];
      if (k < 0) continue;
      const xS = xStem(k), xA = xAft(k);
      const t = clamp((xS - x) / (xS - xA || 1), 0, 1);
      const f = clamp((L / 2 - x) / L, 0, 1);
      const yy = k * fbF(f), zz = (B / 2) * shape(t) * sec(k, t);
      if (prevY !== null && y <= yy) return prevZ + (zz - prevZ) * clamp((y - prevY) / Math.max(yy - prevY, 1e-6), 0, 1);
      prevY = yy; prevZ = zz;
    }
    return prevZ ?? 0;
  };
  const half = (x) => {
    const f = clamp((L / 2 - x) / L, 0, 1);
    return (B / 2) * shape(f) * sec(1, f);
  };
  return {
    L, B, D,
    xBow: L / 2, xStern: -L / 2,
    /** deck height (above the design waterline) at longitudinal position x, at the centreline */
    deckY: (x) => fbF(clamp((L / 2 - x) / L, 0, 1)) + camber,
    /** half-breadth at the deck edge */
    halfBeamDeck: half,
    sideZ,
    /** half-breadth at the waterline */
    halfBeamWL: (x) => { const f = clamp((L / 2 - x) / L, 0, 1); return (B / 2) * shape(f); },
    fracToX: (f) => L / 2 - f * L,
    xToFrac: (x) => (L / 2 - x) / L,
    hullCol, deckCol,
  };
}

function shade2(c, f) { return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]; }
