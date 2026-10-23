// Flat open patches of deck on the hit grid of a ship drawn from a model (for the launchers that are put by hand): node tools/refs/freepatch.mjs <ship> <L> <W> <xmin> <xmax> <clear>
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';
const [id, L, W, xmin, xmax, clear] = process.argv.slice(2);
const spec = ALL_SHIPS.find((s) => s.id === id), tw = TWEAKS[id] || {};
const model = buildShipModel(spec, { ...tw, launchers: undefined, aaAt: undefined });
const h = model.hit, c = h.cell;
const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= h.nx || j >= h.nz || k >= h.ny ? 0 : h.data[(j * h.nx + i) * h.ny + k]);
const top = new Int16Array(h.nx * h.nz).fill(-1);
for (let j = 0; j < h.nz; j++) for (let i = 0; i < h.nx; i++) for (let k = h.ny - 1; k >= 0; k--) if (at(i, j, k)) { top[j * h.nx + i] = k; break; }
const hl = Math.round(+L / 2 / c), hw = Math.round(+W / 2 / c), cl = Math.round(+clear / c);
const taken = model.mounts.map((m) => [m.x, m.z]);
const out = [];
for (let j = hw; j < h.nz - hw; j++) for (let i = hl; i < h.nx - hl; i++) {
  const x = h.x0 + i * c, z = h.z0 + j * c; if (x < +xmin || x > +xmax) continue;
  let lo = 1e9, hi = -1e9, ok = true;
  for (let dj = -hw; dj <= hw && ok; dj++) for (let di = -hl; di <= hl; di++) { const k = top[(j + dj) * h.nx + (i + di)]; if (k < 0) { ok = false; break; } lo = Math.min(lo, k); hi = Math.max(hi, k); }
  if (!ok || (hi - lo) * c > 0.35) continue;
  const k0 = hi + 1; let free = true;
  for (let dj = -hw; dj <= hw && free; dj++) for (let di = -hl; di <= hl && free; di++) for (let k = k0; k < k0 + cl; k++) if (at(i + di, j + dj, k)) { free = false; break; }
  if (!free) continue;
  if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3.5)) continue;
  out.push([+x.toFixed(1), +(h.y0 + (hi + 1) * c).toFixed(1), +z.toFixed(1)]);
}
// thin out: keep patches at least L apart
const keep = [];
for (const p of out) if (!keep.some((q) => Math.abs(q[0] - p[0]) < +L * 0.9 && Math.abs(q[2] - p[2]) < +W * 1.1)) keep.push(p);
console.log(keep.length, 'patches'); console.log(keep.map((p) => p.join(',')).join('  '));
