// The mesh of an island: the height field of sim/terrain.js turned into triangles, coloured by height and slope (beach, grass or forest, bare rock, ash),
// with smooth normals and a cheap ambient occlusion (the hollows are darker). Built in the frame of the island (origin at its centre, y = metres above the sea);
// the underwater shelf is only kept for the first metres (the sea hides the rest).
import { MeshBuilder, MAT } from './meshbuilder.js';
import { clamp } from '../math.js';

function ihash(x, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = ihash(ix, iz, s), b = ihash(ix + 1, iz, s), c = ihash(ix, iz + 1, s), d = ihash(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PAL = {
  green: { sand: [216, 198, 152], low: [84, 118, 52], forest: [38, 74, 36], high: [112, 108, 84], rock: [118, 108, 98], peak: [150, 146, 138] },
  arid: { sand: [222, 200, 148], low: [168, 148, 92], forest: [138, 120, 76], high: [150, 118, 84], rock: [132, 104, 80], peak: [168, 140, 108] },
  rock: { sand: [150, 146, 136], low: [110, 112, 98], forest: [86, 98, 70], high: [120, 118, 112], rock: [112, 110, 106], peak: [160, 158, 154] },
  volcanic: { sand: [58, 54, 52], low: [64, 60, 58], forest: [48, 52, 44], high: [78, 70, 66], rock: [46, 44, 44], peak: [110, 62, 46] },
};

/** The colour of the ground: h metres above the sea, slope = rise over run, rel = height as a fraction of the top of the island, n = a grain in 0..1. */
export function groundColour(biome, h, slope, rel, n, n2) {
  const P = PAL[biome] || PAL.green;
  let c;
  if (h < 2.4) c = mix(P.sand, P.low, clamp((h - 0.4) / 2.0, 0, 1));
  else {
    // lowland: grass with dark forest in the hollows and on the middle slopes
    const wood = clamp(0.25 + 0.9 * n2 - Math.abs(rel - 0.35) * 0.9, 0, 1);
    c = mix(P.low, P.forest, wood);
    if (biome === 'rock' || biome === 'volcanic') c = mix(P.low, P.forest, wood * 0.45);
    c = mix(c, P.high, clamp((rel - 0.5) * 3.2, 0, 1));
    c = mix(c, P.peak, clamp((rel - 0.82) * 5, 0, 1));
  }
  // steep ground is bare rock, whatever grows below
  c = mix(c, P.rock, clamp((slope - 0.5) * 2.4, 0, 0.95));
  const g = 0.86 + 0.28 * n;
  return [c[0] * g, c[1] * g, c[2] * g];
}

/** Build the mesh of `island` (an Island of sim/terrain.js): { vertices, indices, vertexCount, indexCount, aabb }. */
export function buildIslandMesh(island) {
  const fn = island.fn, R = island.R;
  // the box that holds the land and the first metres of shelf
  const G = island.grid, N = island.N;
  let i0 = N, i1 = 0, j0 = N, j1 = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (G[j * N + i] > -6) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  i0 = Math.max(0, i0 - 2); j0 = Math.max(0, j0 - 2); i1 = Math.min(N - 1, i1 + 2); j1 = Math.min(N - 1, j1 + 2);
  const x0 = -R + i0 * island.cell, z0 = -R + j0 * island.cell;
  const spanX = (i1 - i0) * island.cell, spanZ = (j1 - j0) * island.cell;
  const rc = clamp(Math.max(spanX, spanZ) / 250, 3.5, 22);           // metres between vertices
  const nx = Math.ceil(spanX / rc) + 1, nz = Math.ceil(spanZ / rc) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = fn(x0 + i * rc, z0 + j * rc);
  const b = new MeshBuilder();
  const top = island.top || 1;
  const seed = island.seed | 0;
  const vid = new Int32Array(nx * nz).fill(-1);
  const at = (i, j) => H[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
  const want = (i, j) => at(i, j) > -4 || at(i + 1, j) > -4 || at(i, j + 1) > -4 || at(i + 1, j + 1) > -4;
  const vertex = (i, j) => {
    const k = j * nx + i;
    if (vid[k] >= 0) return vid[k];
    const h = H[k];
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * rc), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * rc);
    const nl = Math.hypot(dx, 1, dz);
    const slope = Math.hypot(dx, dz);
    const x = x0 + i * rc, z = z0 + j * rc;
    const n = vn(x / 14, z / 14, seed) * 0.6 + vn(x / 3.7, z / 3.7, seed + 5) * 0.4;
    const n2 = vn(x / 90, z / 90, seed + 9);
    const col = groundColour(island.biome, h, slope, h / top, n, n2);
    // hollows are darker: the ground round a vertex higher than it is
    const lap = (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1)) / 4 - h;
    const ao = clamp(1 - lap / (rc * 1.2), 0.5, 1);
    // under the water the shelf is sand-coloured (the sea hides it)
    const v = b.vert(x, h, z, -dx / nl, 1 / nl, -dz / nl, h < 0 ? [190, 176, 134] : col, MAT.TERRAIN, ao);
    vid[k] = v;
    return v;
  };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!want(i, j)) continue;
    const a = vertex(i, j), c = vertex(i + 1, j), d = vertex(i + 1, j + 1), e = vertex(i, j + 1);
    // split along the diagonal that follows the ground best
    if (Math.abs(at(i, j) - at(i + 1, j + 1)) < Math.abs(at(i + 1, j) - at(i, j + 1))) { b.tri(a, e, d); b.tri(a, d, c); }
    else { b.tri(a, e, c); b.tri(c, e, d); }
  }
  return b.build({ ao: false });
}
