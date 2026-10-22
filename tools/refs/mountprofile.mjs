// The shape of one mount (a turret, a cupola, a gun shield) measured on a reference model, in the mount's own frame, to be redrawn by hand in js/game/model/mounts.js:
//   node tools/refs/mountprofile.mjs <refdir> <loa> <waterline> <cx> <cz> <R> [--bow=1] [--mirror=1] [--yaw=deg] [--y0=m] [--y1=m] [--step=0.25] [--sx=1]
// cx, cz = the training axis in model metres (x along the ship, bow +, z to starboard), R = the radius to take in (m), yaw = where the mount points (0 = ahead, 180 = astern, 90 = starboard),
// y0..y1 = the heights over the waterline. Prints, for each height: the extent along the mount (rear..front, from the axis) and its half-width across, both measured on the triangles within R;
// and the barrel: the pieces that run out of the front (a thin run: the extent beyond the house, the diameter at the root and at the muzzle).
import { load, upright } from './gltf.mjs';
const a = process.argv.slice(2), pos = a.filter((x) => !x.startsWith('--')), fl = Object.fromEntries(a.filter((x) => x.startsWith('--')).map((x) => { const [k, v] = x.slice(2).split('='); return [k, v ?? '1']; }));
const [dir, loa, wl, cx, cz, R] = [pos[0], +pos[1], +pos[2], +pos[3], +pos[4], +pos[5]];
const yaw = (+(fl.yaw || 0)) * Math.PI / 180, step = +(fl.step || 0.25), y0 = fl.y0 != null ? +fl.y0 : -1e9, y1 = fl.y1 != null ? +fl.y1 : 1e9;
const m = upright(load(dir), { bow: fl.bow ? +fl.bow : undefined, mirror: !!+(fl.mirror || 0) }), k = loa / m.L;
// local frame: u along the mount (front +), w across (starboard +); the model's x is the bow direction and z starboard, yaw turns clockwise seen from above (0 = ahead, 90 = starboard)
const cs = Math.cos(yaw), sn = Math.sin(yaw);
const loc = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * cs + dz * sn, -dx * sn + dz * cs]; };
const rows = new Map();
for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) {
  const V = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o] * k, p.V[o + 1] * k - wl, p.V[o + 2] * k]; });
  if (V.every((v) => Math.hypot(v[0] - cx, v[2] - cz) > R)) continue;
  // sample the triangle's edges and centre so that a big flat face fills its heights
  const pts = [...V, [(V[0][0] + V[1][0] + V[2][0]) / 3, (V[0][1] + V[1][1] + V[2][1]) / 3, (V[0][2] + V[1][2] + V[2][2]) / 3]];
  for (let e = 0; e < 3; e++) for (const f of [0.25, 0.5, 0.75]) pts.push([V[e][0] + (V[(e + 1) % 3][0] - V[e][0]) * f, V[e][1] + (V[(e + 1) % 3][1] - V[e][1]) * f, V[e][2] + (V[(e + 1) % 3][2] - V[e][2]) * f]);
  for (const [x, y, z] of pts) {
    if (Math.hypot(x - cx, z - cz) > R || y < y0 || y > y1) continue;
    const [u, w] = loc(x, z), key = Math.round(y / step);
    const r = rows.get(key) || { u0: 1e9, u1: -1e9, w: 0, n: 0 }; r.u0 = Math.min(r.u0, u); r.u1 = Math.max(r.u1, u); r.w = Math.max(r.w, Math.abs(w)); r.n++; rows.set(key, r);
  }
}
console.log(`mount at x ${cx}, z ${cz}, yaw ${fl.yaw || 0}, radius ${R}: y (m over the waterline) | rear | front | half-width`);
for (const key of [...rows.keys()].sort((p, q) => p - q)) { const r = rows.get(key); if (r.n < 3) continue; console.log((key * step).toFixed(2).padStart(7), r.u0.toFixed(2).padStart(7), r.u1.toFixed(2).padStart(7), r.w.toFixed(2).padStart(6)); }
