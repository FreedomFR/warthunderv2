// Sanity checks for all ship models: node test/models.mjs
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL', msg); } };
for (const spec of ALL_SHIPS) {
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  const f = new Float32Array(m.mesh.vertices);
  let bad = 0;
  for (let i = 0; i < m.mesh.vertexCount; i++) for (let k = 0; k < 3; k++) if (!Number.isFinite(f[i * 6 + k])) bad++;
  check(bad === 0, `${spec.id}: ${bad} non-finite vertex coordinates`);
  const main = m.mounts.filter((x) => x.group === 'main');
  const mainGuns = main.reduce((a, x) => a + x.n, 0);
  check(mainGuns === spec.main.gunsTotal, `${spec.id}: main guns ${mainGuns} != spec ${spec.main.gunsTotal}`);
  const bb = m.mesh.aabb;
  check(bb[3] - bb[0] >= spec.loa * 0.95, `${spec.id}: model shorter than the real ship (${(bb[3] - bb[0]).toFixed(1)} vs ${spec.loa})`);
  check(Math.abs(bb[5]) >= spec.beam / 2 * 0.9, `${spec.id}: model narrower than the real ship`);
  console.log(`${spec.id.padEnd(16)} ${String(m.mesh.indexCount / 3).padStart(6)} tris, ${main.length} main mounts (${mainGuns} guns), ${m.mounts.length - main.length} secondary, ${m.smoke.length} funnels`);
}
console.log(fail ? `${fail} check(s) failed` : 'all models OK');
process.exit(fail ? 1 : 0);
