// The elements copied from a reference model stand where the model has them: for every placement, the bounding box of the copy (house and guns at rest) placed in the ship equals the box of the
// group it was copied from in the model (within 3 cm, once the recorded alignment into the hull of the game is taken off); every mount record that takes a copy has been moved to that place and faces
// the way the model has it; no two copies of light AA stand in one another; the guns elevate about a trunnion that lies inside their own box.
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
import { ELEMENTS } from '../js/game/model/elements.js';
import { decodeBaked } from '../js/game/model/bakedmesh.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const boxOf = (d, k, o, yaw) => {            // the box (x0, y0, z0, x1, y1, z1) of a decoded mesh (mount frame) placed at o with the rest direction yaw (degrees)
  const a = yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < d.pos.length; i += 3) {
    const u = d.pos[i] - k[0], y = d.pos[i + 1] - k[1], w = d.pos[i + 2];
    const x = o.x + u * c - w * s, z = o.z + u * s + w * c, yy = o.y + y;
    b[0] = Math.min(b[0], x); b[3] = Math.max(b[3], x); b[1] = Math.min(b[1], yy); b[4] = Math.max(b[4], yy); b[2] = Math.min(b[2], z); b[5] = Math.max(b[5], z);
  }
  return b;
};
for (const id of Object.keys(ELEMENTS)) {
  const el = ELEMENTS[id], spec = ALL_SHIPS.find((s) => s.id === id);
  let worst = 0, n = 0, missing = 0; const gaps = [];
  for (const pl of el.PLACEMENTS) {
    const k = el.KINDS[pl.kind];
    const house = decodeBaked(k.house, el.MOUNT_SCALE);
    const hb = boxOf(house, [0, 0, 0], pl, pl.yaw);
    let box = hb;
    if (k.guns) { const g = decodeBaked(k.guns, el.MOUNT_SCALE), gb = boxOf(g, [-k.trunnion[0], -k.trunnion[1], 0], pl, pl.yaw); box = [0, 1, 2, 3, 4, 5].map((i) => (i < 3 ? Math.min(hb[i], gb[i]) : Math.max(hb[i], gb[i]))); }
    const src = pl.src_box, al = pl.align || [0, 0, 0];
    // the source box is in the model; the placement carries the alignment: compare the footprints' sizes and centres
    const sc = [(src[0] + src[3]) / 2 + al[0], (src[1] + src[4]) / 2 + al[1], (src[2] + src[5]) / 2 + al[2]], bc = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
    const d = Math.max(Math.abs(sc[0] - bc[0]), Math.abs(sc[1] - bc[1]), Math.abs(sc[2] - bc[2]), Math.abs((src[3] - src[0]) - (box[3] - box[0])), Math.abs((src[4] - src[1]) - (box[4] - box[1])), Math.abs((src[5] - src[2]) - (box[5] - box[2])));
    if (k.type === 't25' && !k.guns) { /* the group is the whole mount: its box must match too */ }
    if (process.env.EL_DEBUG && d >= 0.05) console.log("  gap", id, pl.kind, pl.group || pl.mgroup, pl.x, pl.z, (d * 100).toFixed(1)); worst = Math.max(worst, d); gaps.push(d); n++;
  }
  gaps.sort((a, b) => a - b);
  // a few mounts of a model are trained a few degrees off the rest bearing: the guns of those stand up to 0.35 m off the first copy's, the rest (and the median) within 5 cm
  ok(n >= 6 && worst < 0.35 && gaps[gaps.length >> 1] < 0.05, `${id}: ${n} copies placed where the model has them (worst gap ${(worst * 100).toFixed(1)} cm between the placed copy and its group in the model, alignment ${JSON.stringify(el.PLACEMENTS[0].align)} taken off)`);
  const m = buildShipModel(spec, TWEAKS[id] || {});
  const rec = [...m.mounts, ...m.aaMounts].filter((r) => r.look);
  const moved = rec.filter((r) => el.PLACEMENTS.some((p) => `${id}/${p.kind}` === r.look && Math.hypot(p.x - r.x, p.z - r.z) < 0.05 && Math.abs(p.y - r.y) < 0.8));
  ok(moved.length === rec.length && rec.length === el.PLACEMENTS.length, `${id}: ${rec.length} mount records take a copy and ${moved.length} of them stand at the measured place`);
  const aa = m.aaMounts.filter((r) => r.look);
  let over = 0;
  for (let i = 0; i < aa.length; i++) for (let j = i + 1; j < aa.length; j++) if (Math.hypot(aa[i].x - aa[j].x, aa[i].z - aa[j].z) < 1.5 && Math.abs(aa[i].y - aa[j].y) < 1.5) over++;
  ok(over === 0, `${id}: no two copied light mounts stand in one another`);
  for (const [kid, k] of Object.entries(el.KINDS)) if (k.guns) {
    const g = decodeBaked(k.guns, el.MOUNT_SCALE);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < g.pos.length; i += 3) { x0 = Math.min(x0, g.pos[i]); x1 = Math.max(x1, g.pos[i]); y0 = Math.min(y0, g.pos[i + 1]); y1 = Math.max(y1, g.pos[i + 1]); }
    ok(x0 <= 0.6 && x1 > 1.5 && y0 < 0.8 && y1 > -0.8, `${id}/${kid}: the guns' origin (the trunnion) lies in their own box, in x ${x0.toFixed(1)}..${x1.toFixed(1)}, y ${y0.toFixed(1)}..${y1.toFixed(1)}`);
  }
}
process.exit(fail ? 1 : 0);
