// What the game draws itself on a ship, as a JSON the baking reads (tools/refs/bakeship.mjs): node tools/refs/shiplayout.mjs <shipId> > refs/<id>/layout.json
// mounts: the oriented rectangles of the gun houses and of their barrels (in the mount frame: u forward, w to starboard, y over the pivot); spinners: the boxes of the screws and rudders;
// parts: the destroyable parts with their boxes (`bake`: the baked mesh gives their intact look; `keep`: the game draws them itself, they turn or track: radars, directors).
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';
import { houseBox } from '../../js/game/model/layout.js';
import { mountDims } from '../../js/game/model/mounts.js';

const id = process.argv[2];
const spec = ALL_SHIPS.find((s) => s.id === id);
const tw = { ...(TWEAKS[id] || {}) };
delete tw.baked;                                                                        // the procedural build, whatever the baked module says
const m = buildShipModel(spec, tw);
const r2 = (v) => Math.round(v * 100) / 100;
const mounts = [];
const add = (rec, aa, name) => {
  const hb = houseBox(m, rec, aa), yaw = aa ? (rec.arcC ?? rec.yaw0 ?? 0) : (rec.arcC || 0);
  const dims = mountDims({ kind: aa ? 'aa' : rec.kind, cal: rec.cal, n: rec.n, bore: rec.bore, variant: rec.variant });
  const reach = (dims.muzzle || 2) + (dims.trunnion ? dims.trunnion[0] : 0);
  mounts.push({ name, aa, group: aa ? 'aa' : rec.group, label: rec.label || '', variant: rec.variant || '', kind: rec.kind || (aa ? 'aa' : ''), cal: rec.cal, n: rec.n, x: r2(rec.x), z: r2(rec.z), y: r2(rec.y), yaw: r2(yaw),
    house: [r2(hb.x0), r2(hb.x1), r2(hb.z0), r2(hb.z1), r2(hb.y0), r2(hb.y1)], trun: dims.trunnion ? dims.trunnion.map(r2) : [0, 1], reach: r2(reach), spacing: r2(dims.spacing || 0) });
};
m.mounts.forEach((r, i) => add(r, false, `m${i}`));
m.aaMounts.forEach((r, i) => add(r, true, `a${i}`));
const spinners = m.spinners.map((s) => ({ id: s.id, kind: s.kind, bb: s.mesh && s.mesh.aabb ? s.mesh.aabb.map(r2) : null }));
const parts = m.parts.map((p) => ({ id: p.id, kind: p.kind, label: p.label, bb: p.bb.map(r2), keep: !!(p.spin || p.track) }));
process.stdout.write(JSON.stringify({ id, loa: spec.loa, mounts, spinners, parts }));
