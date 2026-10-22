// The solid masses of a reference model as stacked footprints, to be redrawn as prisms in js/game/model/ships/<id>.js:
//   node tools/refs/footprints.mjs <refdir> <loa> <waterline> [--bow=1] [--mirror=1] [--x0=-60 --x1=60] [--y0=9 --y1=45] [--band=0.5] [--cell=0.4] [--eps=0.45] [--open=2] [--iou=0.9] [--mask=file.json] > masses.json
// Every height band of the model is drawn on a plan grid (x along the ship, bow +; z to starboard), the thin things (rails, wires, masts, ladders, barrels) are opened away, the holes closed,
// then runs of bands that keep the same footprint are one prism: [{ y0, y1, poly: [[x, z], ...] }] in game metres (y over the waterline). `--mask` = [{ x, z, r, y }, ...] cuts a disc out of
// every band above y (the mounts that the game draws by itself: turrets, cupolas, AA).
import fs from 'node:fs';
import { load, upright } from './gltf.mjs';

const a = process.argv.slice(2), pos = a.filter((x) => !x.startsWith('--')), fl = Object.fromEntries(a.filter((x) => x.startsWith('--')).map((x) => { const [k, v] = x.slice(2).split('='); return [k, v ?? '1']; }));
const [dir, loa, wl] = [pos[0], +pos[1], +pos[2]];
const X0 = +(fl.x0 ?? -60), X1 = +(fl.x1 ?? 60), Y0 = +(fl.y0 ?? 9), Y1 = +(fl.y1 ?? 45), BAND = +(fl.band ?? 0.5), CELL = +(fl.cell ?? 0.4), EPS = +(fl.eps ?? 0.45), OPEN = +(fl.open ?? 2), IOU = +(fl.iou ?? 0.9);
const ZH = +(fl.zh ?? 22);
const floorTab = fl.floor ? JSON.parse(fs.readFileSync(fl.floor, 'utf8')) : null;
const floorAt = (x) => { if (!floorTab) return -1e9; if (x <= floorTab[0][0]) return floorTab[0][1]; for (let i = 1; i < floorTab.length; i++) if (x <= floorTab[i][0]) { const [x0, y0] = floorTab[i - 1], [x1, y1] = floorTab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return floorTab[floorTab.length - 1][1]; };
const FLOOR = +(fl.margin ?? 0.25);
const masks = fl.mask ? JSON.parse(fs.readFileSync(fl.mask, 'utf8')) : [];
const m = upright(load(dir), { bow: fl.bow ? +fl.bow : undefined, mirror: !!+(fl.mirror || 0) }), k = loa / m.L;
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil(2 * ZH / CELL), NB = Math.ceil((Y1 - Y0) / BAND);
const grids = Array.from({ length: NB }, () => new Uint8Array(NX * NZ));
const HM = !!+(fl.hm || 0);                                                      // --hm=1: columns up to the highest surface of each cell (nothing floats; hollow things come out solid)
const top = new Float32Array(NX * NZ).fill(-1e9);
const mark = (x, y, z) => {
  if (y < floorAt(x) + FLOOR) return;
  if (HM) { const i = Math.floor((x - X0) / CELL), j = Math.floor((z + ZH) / CELL); if (i >= 0 && i < NX && j >= 0 && j < NZ && y > top[i * NZ + j]) top[i * NZ + j] = y; return; }
  const b = Math.floor((y - Y0) / BAND), i = Math.floor((x - X0) / CELL), j = Math.floor((z + ZH) / CELL);
  if (b < 0 || b >= NB || i < 0 || i >= NX || j < 0 || j >= NZ) return;
  grids[b][i * NZ + j] = 1;
};
// sample every triangle finely enough that no cell of a wall is missed
for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) {
  const V = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o] * k, p.V[o + 1] * k - wl, p.V[o + 2] * k]; });
  if (V.every((v) => v[1] < Y0) || V.every((v) => v[1] > Y1) || V.every((v) => v[0] < X0 - 1) || V.every((v) => v[0] > X1 + 1)) continue;
  const e = Math.max(...[[0, 1], [1, 2], [2, 0]].map(([i, j]) => Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2])));
  const n = Math.min(60, Math.max(1, Math.ceil(e / (Math.min(CELL, BAND) * 0.7))));
  for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
    const w = n - u - v, fu = u / n, fv = v / n, fw = w / n;
    mark(V[0][0] * fu + V[1][0] * fv + V[2][0] * fw, V[0][1] * fu + V[1][1] * fv + V[2][1] * fw, V[0][2] * fu + V[1][2] * fv + V[2][2] * fw);
  }
}

const idx = (i, j) => i * NZ + j;
const dilate = (g, r) => { let src = g; for (let s = 0; s < r; s++) { const o = new Uint8Array(g.length); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { if (!src[idx(i, j)]) continue; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ) o[idx(ii, jj)] = 1; } } src = o; } return src; };
const erode = (g, r) => { let src = g; for (let s = 0; s < r; s++) { const o = new Uint8Array(g.length); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { let all = 1; for (let di = -1; di <= 1 && all; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii < 0 || ii >= NX || jj < 0 || jj >= NZ || !src[idx(ii, jj)]) { all = 0; break; } } o[idx(i, j)] = all; } src = o; } return src; };
// fill the inside of closed outlines: what the outside cannot reach
const fill = (g) => {
  const out = new Uint8Array(g.length), st = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if ((i === 0 || j === 0 || i === NX - 1 || j === NZ - 1) && !g[idx(i, j)]) { out[idx(i, j)] = 2; st.push([i, j]); }
  while (st.length) { const [i, j] = st.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ && !g[idx(ii, jj)] && !out[idx(ii, jj)]) { out[idx(ii, jj)] = 2; st.push([ii, jj]); } } }
  const r = new Uint8Array(g.length); for (let q = 0; q < r.length; q++) r[q] = out[q] === 2 ? 0 : 1; return r;
};
const solid = grids.map((g0, b) => {
  const y = Y0 + (b + 0.5) * BAND;
  let g;
  if (HM) { g = new Uint8Array(NX * NZ); for (let q = 0; q < g.length; q++) g[q] = top[q] >= y ? 1 : 0; }
  else { g = fill(dilate(g0, 1)); g = erode(g, 1); }
  g = dilate(erode(g, OPEN), OPEN);
  for (const mk of masks) if (y >= mk.y) for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (Math.hypot(X0 + (i + 0.5) * CELL - mk.x, -ZH + (j + 0.5) * CELL - mk.z) <= mk.r) g[idx(i, j)] = 0;
  return g;
});

// a cell kept only when its neighbours above or below agree (drops one-band slivers)
if (+(fl.vote || 0)) { const copy = solid.map((g) => g.slice()); for (let b = 0; b < NB; b++) for (let q = 0; q < NX * NZ; q++) { const n = (b > 0 ? copy[b - 1][q] : 0) + (b < NB - 1 ? copy[b + 1][q] : 0); if (copy[b][q] && n === 0) solid[b][q] = 0; else if (!copy[b][q] && n === 2) solid[b][q] = 1; } }
// runs of bands with the same footprint
const iou = (p, q) => { let i = 0, u = 0; for (let s = 0; s < p.length; s++) { if (p[s] && q[s]) i++; if (p[s] || q[s]) u++; } return u ? i / u : 1; };
const runs = [];
let cur = null;
for (let b = 0; b < NB; b++) {
  const cnt = solid[b].reduce((s, v) => s + v, 0);
  if (cnt === 0) { cur = null; continue; }
  if (cur && iou(solid[cur.first], solid[b]) >= IOU) { cur.last = b; continue; }
  cur = { first: b, last: b }; runs.push(cur);
}

// the outline of each blob of a footprint, simplified
function blobs(g) {
  const seen = new Uint8Array(g.length), res = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (!g[idx(i, j)] || seen[idx(i, j)]) continue;
    const cells = [], st = [[i, j]]; seen[idx(i, j)] = 1;
    while (st.length) { const [ci, cj] = st.pop(); cells.push([ci, cj]); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = ci + di, jj = cj + dj; if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ && g[idx(ii, jj)] && !seen[idx(ii, jj)]) { seen[idx(ii, jj)] = 1; st.push([ii, jj]); } } }
    if (cells.length * CELL * CELL < 1.5) continue;
    res.push(cells);
  }
  return res;
}
function outline(cells) {
  const set = new Set(cells.map(([i, j]) => i * 100000 + j)), has = (i, j) => set.has(i * 100000 + j);
  const edges = new Map();                                                    // start vertex -> end vertex of each boundary edge, walking with the solid on the left
  const add = (a1, b1, a2, b2) => { const key = a1 * 100000 + b1; if (!edges.has(key)) edges.set(key, []); edges.get(key).push([a2, b2]); };
  for (const [i, j] of cells) {
    if (!has(i - 1, j)) add(i, j + 1, i, j);
    if (!has(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!has(i, j - 1)) add(i, j, i + 1, j);
    if (!has(i, j + 1)) add(i + 1, j + 1, i, j + 1);
  }
  const loops = [], used = new Set();
  for (const [key, outs] of edges) for (let q = 0; q < outs.length; q++) {
    if (used.has(key + ':' + q)) continue;
    const loop = []; let ci = Math.floor(key / 100000), cj = key % 100000, qi = q, kk = key;
    for (let guard = 0; guard < 100000; guard++) {
      used.add(kk + ':' + qi); loop.push([ci, cj]);
      const [ni, nj] = edges.get(kk)[qi];
      const nk = ni * 100000 + nj, nouts = edges.get(nk) || [];
      let pick = 0; if (nouts.length > 1) { const dx = ni - ci, dz = nj - cj; pick = nouts.findIndex(([a2, b2]) => (b2 - nj) * dx - (a2 - ni) * dz > 0); if (pick < 0) pick = 0; }
      ci = ni; cj = nj; kk = nk; qi = pick;
      if (used.has(kk + ':' + qi)) break;
    }
    if (loop.length > 3) loops.push(loop);
  }
  const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const [x1, z1] = l[i], [x2, z2] = l[(i + 1) % l.length]; s += x1 * z2 - x2 * z1; } return s / 2; };
  loops.sort((p, q) => Math.abs(area(q)) - Math.abs(area(p)));
  return loops[0];
}
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const d = (p, s, e) => { const dx = e[0] - s[0], dz = e[1] - s[1], L = Math.hypot(dx, dz) || 1e-9; return Math.abs((p[0] - s[0]) * dz - (p[1] - s[1]) * dx) / L; };
  let imax = 0, dmax = -1; for (let i = 1; i < pts.length - 1; i++) { const dd = d(pts[i], pts[0], pts[pts.length - 1]); if (dd > dmax) { dmax = dd; imax = i; } }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, imax + 1), eps).slice(0, -1), ...dp(pts.slice(imax), eps)];
}
function simplify(loop) {
  const pts = loop.map(([i, j]) => [X0 + i * CELL, -ZH + j * CELL]);
  // split the closed loop at its two farthest-apart corners so that both halves are open polylines
  let ia = 0; for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[ia][0]) ia = i;
  let ib = 0, best = -1; for (let i = 0; i < pts.length; i++) { const dd = Math.hypot(pts[i][0] - pts[ia][0], pts[i][1] - pts[ia][1]); if (dd > best) { best = dd; ib = i; } }
  const rot = [...pts.slice(ia), ...pts.slice(0, ia)], ibr = (ib - ia + pts.length) % pts.length;
  const h1 = dp(rot.slice(0, ibr + 1), EPS), h2 = dp([...rot.slice(ibr), rot[0]], EPS);
  const poly = [...h1.slice(0, -1), ...h2.slice(0, -1)];
  return poly.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]);
}
const out = [];
for (const r of runs) {
  const mid = Math.floor((r.first + r.last) / 2), g = solid[mid];
  for (const cells of blobs(g)) { const lp = outline(cells); if (!lp) continue; const poly = simplify(lp); if (poly.length >= 3) out.push({ y0: +(Y0 + r.first * BAND).toFixed(2), y1: +(Y0 + (r.last + 1) * BAND).toFixed(2), poly }); }
}
console.error(`${runs.length} runs, ${out.length} prisms, ${out.reduce((s, p) => s + p.poly.length, 0)} corners`);
process.stdout.write(JSON.stringify(out));
