// Baked ambient occlusion for the procedural ship meshes.
//
// All the triangles of a model are voxelised into a coarse occupancy grid, then every vertex shoots a few
// cosine-weighted rays over its hemisphere and darkens by how much (and how close) geometry blocks them. This
// puts contact shadows under turrets, along the base of the superstructure, in the corner of a deck and under
// every overhang without any per-pixel cost. The result is multiplied into the vertex AO channel.

const NDIR = 18;
const dirs = (() => {
  // cosine-weighted hemisphere samples around +z (Fibonacci spiral)
  const out = [];
  for (let i = 0; i < NDIR; i++) {
    const u = (i + 0.5) / NDIR, a = i * 2.399963;
    const r = Math.sqrt(u), z = Math.sqrt(1 - u);
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
})();

/**
 * meshes: [{ P: number[] positions, N: number[] (x,y,z,ao per vertex), IDX: number[] }, ...]
 * Updates each mesh's N[i*4+3] in place. opts: { cell, reach, strength }
 */
export function bakeAO(meshes, opts = {}) {
  // bounds of everything
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let nv = 0;
  for (const m of meshes) {
    nv += m.P.length / 3;
    for (let i = 0; i < m.P.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.P[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  }
  if (!nv) return;
  const reach = opts.reach ?? 7;
  // cell size: ~1 m, coarser for very large models so the grid stays under ~2.5 M cells
  let cell = opts.cell ?? 0.9;
  const dims = () => [Math.ceil((hi[0] - lo[0] + 2 * reach) / cell), Math.ceil((hi[1] - lo[1] + 2 * reach) / cell), Math.ceil((hi[2] - lo[2] + 2 * reach) / cell)];
  let d = dims();
  while (d[0] * d[1] * d[2] > 2.5e6) { cell *= 1.12; d = dims(); }
  const [nx, ny, nz] = d;
  const grid = new Uint8Array(nx * ny * nz);
  const ox = lo[0] - reach, oy = lo[1] - reach, oz = lo[2] - reach;
  const inv = 1 / cell;
  const mark = (x, y, z) => {
    const i = Math.floor((x - ox) * inv), j = Math.floor((y - oy) * inv), k = Math.floor((z - oz) * inv);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[(k * ny + j) * nx + i] = 1;
  };

  // voxelise: sample every triangle densely enough that no cell it crosses is missed
  const step = cell * 0.55;
  for (const m of meshes) {
    if (m.occluder === false) continue;
    const P = m.P, I = m.IDX;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ax = P[a], ay = P[a + 1], az = P[a + 2];
      const bx = P[b] - ax, by = P[b + 1] - ay, bz = P[b + 2] - az;
      const cx = P[c] - ax, cy = P[c + 1] - ay, cz = P[c + 2] - az;
      const lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
      const n = Math.max(1, Math.ceil(Math.max(lb, lc) / step));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        for (let j = 0; j <= n - i; j++) {
          const v = j / n;
          mark(ax + bx * u + cx * v, ay + by * u + cy * v, az + bz * u + cz * v);
        }
      }
    }
  }

  const strength = opts.strength ?? 0.78;
  const stepLen = cell * 0.8;
  const steps = Math.max(2, Math.ceil(reach / stepLen));
  const lift = cell * 1.05;           // rays start one cell off the surface, above its own voxel layer
  for (const m of meshes) {
    const P = m.P, N = m.N;
    const nvm = P.length / 3;
    for (let v = 0; v < nvm; v++) {
      let px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
      let nxn = N[v * 4], nyn = N[v * 4 + 1], nzn = N[v * 4 + 2];
      const nl = Math.hypot(nxn, nyn, nzn) || 1;
      nxn /= nl; nyn /= nl; nzn /= nl;
      px += nxn * lift; py += nyn * lift; pz += nzn * lift;
      // tangent frame
      let tx, ty, tz;
      if (Math.abs(nyn) < 0.9) { tx = nzn; ty = 0; tz = -nxn; } else { tx = 0; ty = -nzn; tz = nyn; }
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const bx = nyn * tz - nzn * ty, by = nzn * tx - nxn * tz, bz = nxn * ty - nyn * tx;
      // rotate the sample pattern per vertex a little so neighbouring vertices do not share banding
      const rot = ((v * 2654435761) >>> 0) / 4294967296 * 6.2831853;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      let occ = 0;
      for (let s = 0; s < NDIR; s++) {
        const dd = dirs[s];
        const dx0 = dd[0] * cr - dd[1] * sr, dy0 = dd[0] * sr + dd[1] * cr, dz0 = dd[2];
        const rx = tx * dx0 + bx * dy0 + nxn * dz0, ry = ty * dx0 + by * dy0 + nyn * dz0, rz = tz * dx0 + bz * dy0 + nzn * dz0;
        let w = 0;
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) * stepLen;
          const gi = Math.floor((px + rx * t - ox) * inv), gj = Math.floor((py + ry * t - oy) * inv), gk = Math.floor((pz + rz * t - oz) * inv);
          if (gi < 0 || gj < 0 || gk < 0 || gi >= nx || gj >= ny || gk >= nz) break;
          if (grid[(gk * ny + gj) * nx + gi]) { w = 1 - t / (reach + cell); break; }
        }
        occ += w;
      }
      occ /= NDIR;
      const ao = Math.max(0.28, 1 - strength * occ * 1.5);
      N[v * 4 + 3] *= ao;
    }
  }
}
