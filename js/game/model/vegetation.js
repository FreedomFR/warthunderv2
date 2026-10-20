// Where the plants grow. Pure functions of an island (no GPU): the climate of the island, how much of the ground is covered at a point (used both to
// scatter trees and to darken the ground under them), and the list of plants of a square of ground. Everything comes from the seed: the same battle
// has the same forests, and a square of ground gives the same trees whenever it is asked for.
import { clamp } from '../math.js';

export const SP = { OAK: 0, FIR: 1, PALM: 2, JUNGLE: 3, ACACIA: 4, CYPRESS: 5, SHRUB: 6, BOULDER: 7 };
export const SPECIES = [
  // H: height range (m) of a grown plant; H0: height of the template mesh (the instance is scaled by H / H0)
  { name: 'oak', H: [8, 17], H0: 12 },
  { name: 'fir', H: [10, 26], H0: 16 },
  { name: 'palm', H: [7, 16], H0: 11 },
  { name: 'jungle', H: [16, 32], H0: 22 },
  { name: 'acacia', H: [4.5, 10], H0: 7 },
  { name: 'cypress', H: [7, 15], H0: 10 },
  { name: 'shrub', H: [0.9, 3.2], H0: 1.8 },
  { name: 'boulder', H: [0.7, 4], H0: 1.6 },
];
export const VARIANTS = 3;
export const STEP = 5;            // metres between the nodes of the planting grid

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
function fbm(x, z, s, oct = 3) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, z * f, s + i * 17); norm += a; a *= 0.5; f *= 2.03; }
  return sum / norm;
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** 'temperate', 'tropical', 'arid', 'alpine' or 'volcanic': what grows on the island. */
export function climateOf(is) {
  if (is._climate) return is._climate;
  let c;
  switch (is.biome) {
    case 'green': c = ihash(is.seed, 7, 99) < 0.5 ? 'temperate' : 'tropical'; break;
    case 'arid': c = 'arid'; break;
    case 'rock': c = 'alpine'; break;
    default: c = 'volcanic';
  }
  return (is._climate = c);
}

const CLIMATE = {
  temperate: { cover: 0.92, line: (top) => Math.min(top * 0.95, 380), minH: 1.8 },
  tropical: { cover: 1.0, line: (top) => Math.min(top * 0.97, 520), minH: 1.4 },
  arid: { cover: 0.3, line: (top) => Math.min(top * 0.8, 260), minH: 2.5 },
  alpine: { cover: 0.2, line: (top) => Math.min(top * 0.55, 130), minH: 2.2 },
  volcanic: { cover: 0.11, line: (top) => Math.min(top * 0.5, 120), minH: 2.5 },
};

/**
 * How much of the ground at (x, z) is wooded, 0..1 (h metres above the sea, slope = rise over run). It follows the climate, thins out with
 * altitude and steep ground, leaves the beach bare and opens clearings in patches.
 */
export function cover(is, x, z, h, slope) {
  const C = CLIMATE[climateOf(is)];
  if (h < C.minH) return 0;
  const line = C.line(is.top);
  const patch = smooth(0.28, 0.52, fbm(x / 150, z / 150, is.seed + 3, 3));
  const fine = 0.75 + 0.5 * vnoise(x / 28, z / 28, is.seed + 8);
  const alt = 1 - smooth(line * 0.62, line, h);
  const sl = 1 - smooth(0.5, 0.95, slope);
  const beach = smooth(C.minH, C.minH + 3.5, h);
  return clamp(C.cover * patch * fine * alt * sl * beach, 0, 1);
}

/** Which species grows at a point (r: a random number, u: how high up the wooded ground we are, 0..1). Returns [species, scale factor]. */
function pick(is, x, z, h, u, r, line) {
  const clim = climateOf(is);
  const stand = fbm(x / 210, z / 210, is.seed + 19, 3);
  switch (clim) {
    case 'temperate': {
      if (r < 0.13) return [SP.SHRUB, 1];
      const conifer = clamp(smooth(0.3, 0.8, u) * 0.85 + (stand > 0.58 ? 0.45 : 0), 0, 0.97);
      return [r * 7.7 % 1 < conifer ? SP.FIR : SP.OAK, 1];
    }
    case 'tropical':
      if (h < 7) return r < 0.7 ? [SP.PALM, 1] : r < 0.88 ? [SP.SHRUB, 1] : [SP.JUNGLE, 0.8];
      return r < 0.6 ? [SP.JUNGLE, 1] : r < 0.76 ? [SP.PALM, 1] : r < 0.84 ? [SP.OAK, 1.1] : [SP.SHRUB, 1];
    case 'arid':
      return r < 0.5 ? [SP.SHRUB, 1] : r < 0.85 ? [SP.ACACIA, 1] : [SP.CYPRESS, 1];
    case 'alpine':
      return r < 0.7 ? [SP.SHRUB, 1] : [SP.FIR, 0.5];
    default:
      return r < 0.85 || h > 12 ? [SP.SHRUB, 0.8] : [SP.PALM, 0.8];
  }
}

/**
 * The plants of the square [x0, x0 + size) x [z0, z0 + size) of the world: a Float32Array of records of 8 numbers,
 * x, y, z, yaw, height (m), species + 8 * variant, tone (0..1, the colour of this plant), rnd (0..1).
 * The nodes of a fixed grid (STEP metres) are shaken a little and kept or not by the cover, so that two adjacent squares agree.
 */
export function scatter(is, x0, z0, size) {
  const out = [];
  const C = CLIMATE[climateOf(is)];
  const line = C.line(is.top);
  const i0 = Math.floor(x0 / STEP), i1 = Math.ceil((x0 + size) / STEP), j0 = Math.floor(z0 / STEP), j1 = Math.ceil((z0 + size) / STEP);
  const seed = is.seed | 0;
  const g = 3.2;
  const dry = is.biome === 'rock' || is.biome === 'volcanic';
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x = (i + 0.12 + 0.76 * ihash(i, j, seed + 1)) * STEP, z = (j + 0.12 + 0.76 * ihash(i, j, seed + 2)) * STEP;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
    const h = is.heightAt(x, z);
    if (h < 0.5) continue;
    if (is.pads.length && is.padAt(x, z) > 0.04) continue;           // no trees on the ground of a base (nor in the way of its guns)
    // the slope from the sampled grid (a coarse estimate is enough to decide)
    const sx = (is.heightAt(x + g, z) - is.heightAt(x - g, z)) / (2 * g), sz = (is.heightAt(x, z + g) - is.heightAt(x, z - g)) / (2 * g);
    const slope = Math.hypot(sx, sz);
    const rr = ihash(i, j, seed + 3), rs = ihash(i, j, seed + 4);
    const cv = cover(is, x, z, h, slope);
    let sp = -1, sc = 1;
    if (rr < cv * 0.72) {
      const u = clamp(h / line, 0, 1);
      [sp, sc] = pick(is, x, z, h, u, rs, line);
    } else {
      // boulders: on the steep ground, along the shore and all over the bare islands
      const pb = 0.018 + 0.1 * smooth(0.35, 0.8, slope) + (h < 7 ? 0.045 : 0) + (dry ? 0.07 : 0);
      if (ihash(i, j, seed + 5) < pb && h < line * 1.3 + 30) { sp = SP.BOULDER; sc = 1; }
    }
    if (sp < 0) continue;
    const S = SPECIES[sp];
    const ge = ihash(i, j, seed + 6);
    // grown plants are rarer than young ones; high and exposed ground stunts them
    let H = S.H[0] + (S.H[1] - S.H[0]) * Math.pow(ge, 1.35);
    H *= sc * (0.62 + 0.38 * (1 - smooth(line * 0.45, line, h)));
    if (sp === SP.BOULDER) H = S.H[0] + (S.H[1] - S.H[0]) * Math.pow(ge, 3.2);
    const y = is.fn(x - is.x, z - is.z);
    const variant = Math.floor(ihash(i, j, seed + 7) * VARIANTS) % VARIANTS;
    out.push(x, Math.max(y, 0) - (sp === SP.BOULDER ? 0.12 * H : 0.25 + slope * 0.6), z, ihash(i, j, seed + 8) * Math.PI * 2, H, sp + 8 * variant, ihash(i, j, seed + 9), ihash(i, j, seed + 10));
  }
  return Float32Array.from(out);
}
