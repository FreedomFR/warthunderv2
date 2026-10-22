// The ships drawn from baked reference meshes (tweaks `baked` / `bakedHull`): every one builds, its mesh is the model's (a few ten thousand triangles, inside the ship's own bounding box:
// no stray vertex of a bad simplification), its destroyable parts keep a mesh, its mounts take the model's houses, and the whole thing stays light enough to be read at the start.
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
import { getMountModel } from '../js/game/model/mounts.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
let ids = 0;
for (const spec of ALL_SHIPS) {
  const tw = TWEAKS[spec.id] || {};
  if (!tw.baked && !tw.bakedHull) continue;
  ids++;
  const t0 = Date.now();
  const m = buildShipModel(spec, tw);
  const ms = Date.now() - t0;
  const tris = (m.mesh.indexCount + m.parts.reduce((a, p) => a + (p.mesh ? p.mesh.indexCount : 0), 0)) / 3, bb = m.mesh.aabb;
  ok(tris > 20000, `${spec.id}: ${Math.round(tris / 1000)}k triangles in the hull and its pieces`);
  ok(bb[0] > -spec.loa / 2 - 4 && bb[3] < spec.loa / 2 + 4 && Math.abs(bb[2]) < spec.beam && Math.abs(bb[5]) < spec.beam && bb[4] < 80 && bb[1] > -25, `${spec.id}: the mesh stays inside the ship (x ${bb[0].toFixed(0)}..${bb[3].toFixed(0)}, y ${bb[1].toFixed(0)}..${bb[4].toFixed(0)}, z ${bb[2].toFixed(0)}..${bb[5].toFixed(0)})`);
  ok(m.parts.every((p) => p.mesh && p.mesh.indexCount > 0), `${spec.id}: every destroyable part has a mesh`);
  if (tw.baked) {
    const rec = m.mounts[0] || m.aaMounts[0];
    const mm = getMountModel({ kind: rec.kind, cal: rec.cal, n: rec.n, bore: rec.bore, col: m.pal.sup, variant: rec.variant, top: m.pal.top, look: rec.look });
    const plain = getMountModel({ kind: rec.kind, cal: rec.cal, n: rec.n, bore: rec.bore, col: m.pal.sup, variant: rec.variant, top: m.pal.top });
    ok(rec.look === spec.id && mm.house.indexCount !== plain.house.indexCount, `${spec.id}: the mounts take the model's own houses (${mm.house.indexCount / 3} triangles instead of ${plain.house.indexCount / 3})`);
  }
  ok(m.parts.filter((p) => p.kind === 'structure').length >= 20, `${spec.id}: ${m.parts.filter((p) => p.kind === 'structure').length} independent pieces (deckhouses, platforms, boats...)`);
  ok(ms < 6000, `${spec.id}: built in ${ms} ms`);
}
ok(ids >= 7, `${ids} ships are drawn from baked reference meshes`);
process.exit(fail ? 1 : 0);
