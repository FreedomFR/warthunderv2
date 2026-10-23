// The hit volumes of a ship drawn from a reference model (model/v4ship.js), made from what is drawn: a grid of 0.5 m cells that holds the surfaces of the hull plating, of the structure
// and of every destroyable part (the cells of a part carry its number), without the rods, wires and rails (a cell with few neighbours is dropped). The shells stop on the surface they
// meet, so the scars lie on it; sim/damage.js `probeDrawn`. The mounts keep the volumes of their own houses.
import { decodeBakedGeometry } from './bakedmesh.js';
import { VERTEX_STRIDE } from './meshbuilder.js';

const CELL = 0.5, STEP = 0.3;       // cell (m); sampling step on the surfaces

/** Samples on a triangle, dense enough for every cell it crosses to hold one: calls put(x, y, z). */
function sampleTriangle(pos, a, b, c, put) {
  const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
  const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az, e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
  const n1 = Math.max(1, Math.ceil(Math.hypot(e1x, e1y, e1z) / STEP)), n2 = Math.max(1, Math.ceil(Math.hypot(e2x, e2y, e2z) / STEP));
  for (let i = 0; i <= n1; i++) {
    const u = i / n1;
    for (let j = 0; j <= n2; j++) {
      const v = j / n2;
      if (u + v > 1 + 1 / Math.max(n1, n2)) break;
      put(ax + e1x * u + e2x * v, ay + e1y * u + e2y * v, az + e1z * u + e2z * v);
    }
  }
}

/** { x0, y0, z0, cell, nx, ny, nz, data (Uint8Array: 0 empty, 1 plating or structure, 2.. a part), ids (the parts' ids) } for the module (SCALE, SHIP) of a ship. */
export function buildHitModel(data, drop = []) {
  const sc = data.SCALE, S = data.SHIP, ids = Object.keys(S.parts).filter((id) => !drop.includes(id));
  const src = [];
  for (const piece of Object.values(S.static)) src.push({ g: decodeBakedGeometry(piece, sc), lab: 1 });
  ids.forEach((id, n) => src.push({ g: decodeBakedGeometry(S.parts[id].mesh, sc), lab: 2 + n }));
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of src) { const p = s.g.pos; for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); } }
  x0 = Math.floor(x0 / CELL) * CELL - CELL; z0 = Math.floor(z0 / CELL) * CELL - CELL; y0 = Math.floor(y0 / CELL) * CELL - CELL;
  const nx = Math.ceil((x1 - x0) / CELL) + 2, nz = Math.ceil((z1 - z0) / CELL) + 2, ny = Math.ceil((y1 - y0) / CELL) + 2;
  const grid = new Uint8Array(nx * nz * ny);
  for (const s of src) {
    const { pos, idx } = s.g;
    for (let t = 0; t < idx.length; t += 3) {
      sampleTriangle(pos, idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3, (x, y, z) => {
        const o = (Math.floor((z - z0) / CELL) * nx + Math.floor((x - x0) / CELL)) * ny + Math.floor((y - y0) / CELL);
        if (s.lab > 1 || !grid[o]) grid[o] = s.lab;
      });
    }
  }
  // rods, wires and rails are no obstacle: a cell with fewer than 7 of its 26 neighbours filled is dropped (a plate or a block has many, a mast leg few)
  const thin = [];
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const base = (j * nx + i) * ny;
    for (let k = 1; k < ny - 1; k++) {
      if (!grid[base + k]) continue;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const b2 = ((j + dj) * nx + i + di) * ny + k; if (grid[b2 - 1]) n++; if (grid[b2]) n++; if (grid[b2 + 1]) n++; }
      if (n - 1 < 7) thin.push(base + k);
    }
  }
  for (const d of thin) grid[d] = 0;
  return { x0, y0, z0, cell: CELL, nx, ny, nz, data: grid, ids };
}

/**
 * Puts the surfaces of parts the procedural build adds to a ship drawn from a model (the missile launchers of a later fit) into its grid, each with its own label: `parts` are the
 * parts of the ship ({ id, mesh }); their ids are added to `h.ids`.
 */
export function addPartSurfaces(h, parts) {
  for (const p of parts) {
    if (!p.mesh) continue;
    const lab = 2 + h.ids.length;
    if (lab > 255) break;
    h.ids.push(p.id);
    const f = new Float32Array(p.mesh.vertices), stride = VERTEX_STRIDE / 4, idx = p.mesh.indices;
    const pos = (v) => [f[v * stride], f[v * stride + 1], f[v * stride + 2]];
    for (let t = 0; t < idx.length; t += 3) {
      const A = pos(idx[t]), B = pos(idx[t + 1]), C = pos(idx[t + 2]), flat = [...A, ...B, ...C];
      sampleTriangle(flat, 0, 3, 6, (x, y, z) => {
        const i = Math.floor((x - h.x0) / h.cell), j = Math.floor((z - h.z0) / h.cell), k = Math.floor((y - h.y0) / h.cell);
        if (i < 0 || j < 0 || k < 0 || i >= h.nx || j >= h.nz || k >= h.ny) return;
        h.data[(j * h.nx + i) * h.ny + k] = lab;
      });
    }
  }
  return h;
}

/** The surface normal of the drawn surface at a cell (i, j, k): the axis along which the filled cells round it are least spread (principal axes of the 5 x 5 x 5 block), turned to the empty side. */
export function hitNormalAt(h, i, j, k) {
  const R = 2, pts = [];
  let mx = 0, my = 0, mz = 0;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) for (let dk = -R; dk <= R; dk++) {
    const ii = i + di, jj = j + dj, kk = k + dk;
    if (ii < 0 || jj < 0 || kk < 0 || ii >= h.nx || jj >= h.nz || kk >= h.ny) continue;
    if (h.data[(jj * h.nx + ii) * h.ny + kk]) { pts.push(di, dk, dj); mx += di; my += dk; mz += dj; }
  }
  const n = pts.length / 3;
  if (n < 4) return [0, 1, 0];
  mx /= n; my /= n; mz /= n;
  const c = [0, 0, 0, 0, 0, 0];      // xx xy xz yy yz zz (x = di, y = up = dk, z = dj)
  for (let q = 0; q < pts.length; q += 3) { const x = pts[q] - mx, y = pts[q + 1] - my, z = pts[q + 2] - mz; c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z; }
  // the eigenvector of the smallest eigenvalue by inverse iteration on (C + eps I) from several starts
  const A = [[c[0], c[1], c[2]], [c[1], c[3], c[4]], [c[2], c[4], c[5]]];
  let best = null;
  for (const v0 of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    let v = v0.slice();
    for (let it = 0; it < 12; it++) {       // power iteration on (trace I - C): its largest eigenvector is the smallest one of C
      const tr = A[0][0] + A[1][1] + A[2][2];
      const w = [tr * v[0] - (A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2]), tr * v[1] - (A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2]), tr * v[2] - (A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2])];
      const l = Math.hypot(w[0], w[1], w[2]) || 1; v = [w[0] / l, w[1] / l, w[2] / l];
    }
    const rq = v[0] * (A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2]) + v[1] * (A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2]) + v[2] * (A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]);
    if (!best || rq < best.rq) best = { rq, v };
  }
  let [x, y, z] = best.v;
  if (x * mx + y * my + z * mz > 0) { x = -x; y = -y; z = -z; }      // turned away from the mass: towards the empty side
  return [x, y, z];      // (x, up, plan z) of the grid, i.e. the ship's local x, y, z
}
