// Free places for light mounts on the drawn model of a ship (its hit grid, model/v4hit.js): flat deck with open air above, away from the mounts that stand, near the edge of the deck.
//   node tools/refs/freespots.mjs <shipId> <AA_TYPES key>=<count>[,...] [--xmin=-80 --xmax=60] [--edge=0.8,3] [--clear=2.2] [--space=4] [--above=<y> --below=<y>]
// Prints the entries for the tweak `aaAt` ([{ k, x, y, z }]) as JSON, spread along the length, one side after the other.
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';

const args = process.argv.slice(2), F = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const [id, want] = args.filter((a) => !a.startsWith('--'));
const spec = ALL_SHIPS.find((s) => s.id === id), tw = TWEAKS[id] || {};
const model = buildShipModel(spec, { ...tw, aaAt: undefined });
const h = model.hit;
if (!h) { console.error('no hit grid: the ship is not drawn from a reference model'); process.exit(1); }
const [e0, e1] = (F.edge || '0.8,3').split(',').map(Number), CLEAR = Math.round((+F.clear || 2.2) / h.cell), SPACE = +F.space || 4;
const xmin = +(F.xmin ?? -1e9), xmax = +(F.xmax ?? 1e9), ymin = +(F.below ?? -1e9), ymax = +(F.above ?? 1e9);
const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= h.nx || j >= h.nz || k >= h.ny ? 0 : h.data[(j * h.nx + i) * h.ny + k]);
// the top surface of each column that has open air above it
const topK = new Int16Array(h.nx * h.nz).fill(-1);
for (let j = 0; j < h.nz; j++) for (let i = 0; i < h.nx; i++) {
  for (let k = h.ny - 1; k >= 0; k--) if (at(i, j, k)) { topK[j * h.nx + i] = k; break; }
}
const widest = new Float32Array(h.nx);      // the widest the ship is at each x (to know the edge)
for (let i = 0; i < h.nx; i++) { let m = 0; for (let j = 0; j < h.nz; j++) if (topK[j * h.nx + i] >= 0) m = Math.max(m, Math.abs(h.z0 + j * h.cell)); widest[i] = m; }
const taken = [...model.aaMounts, ...model.mounts].map((m) => [m.x, m.z]);
const cands = [];
const R = Math.round(1.0 / h.cell);
for (let j = R; j < h.nz - R; j++) for (let i = R; i < h.nx - R; i++) {
  const k = topK[j * h.nx + i];
  if (k < 0) continue;
  const x = h.x0 + (i + 0.5) * h.cell, z = h.z0 + (j + 0.5) * h.cell, y = h.y0 + (k + 1) * h.cell;
  if (x < xmin || x > xmax || y < ymin || y > ymax || y < 1) continue;
  const edge = widest[i] - Math.abs(z);
  if (edge < e0 || edge > e1) continue;
  let ok = true;
  for (let dj = -R; dj <= R && ok; dj++) for (let di = -R; di <= R && ok; di++) {
    const kk = topK[(j + dj) * h.nx + i + di];
    if (kk < 0 || Math.abs(kk - k) > 1) { ok = false; break; }
    for (let q = 1; q <= CLEAR; q++) if (at(i + di, j + dj, k + q)) { ok = false; break; }
  }
  if (!ok) continue;
  if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.8)) continue;
  cands.push({ x, y, z, edge });
}
const out = [];
for (const spec2 of want.split(',')) {
  const [k, n] = spec2.split('='); let left = +n, side = 1, guard = 0;
  const pick = [];
  while (left > 0 && guard++ < 400) {
    // the candidate on the wanted side that is farthest from everything already put, preferring the edge
    let best = null, bd = -1;
    for (const c of cands) {
      if (Math.sign(c.z) !== side) continue;
      const d = Math.min(1e9, ...[...taken, ...pick.map((p) => [p.x, p.z]), ...out.map((p) => [p.x, p.z])].map(([tx, tz]) => Math.hypot(tx - c.x, tz - c.z)));
      if (d >= SPACE && d > bd) { bd = d; best = c; }
    }
    if (!best) { side = -side; if (guard > 6 && !pick.length) break; if (guard > 200) break; continue; }
    pick.push({ k, x: +best.x.toFixed(2), y: +best.y.toFixed(2), z: +best.z.toFixed(2) }); left--; side = -side;
    cands.splice(cands.indexOf(best), 1);
  }
  if (left > 0) console.error(`only ${+n - left} of ${n} ${k} found`);
  out.push(...pick);
}
console.log(JSON.stringify(out));
