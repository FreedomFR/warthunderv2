// Plan views of the firing arcs of every ship: node tools/audit/arcs.mjs [ship,...] > arcs.json, then python3 tools/audit/arcs.py arcs.json out/audit
// (each mount's arc after the towers, funnels and the other mounts have been taken out of it, and the aircraft guns with their blind sectors).
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';

const only = (process.argv[2] || '').split(',').filter(Boolean);
const r1 = (v) => Math.round(v * 100) / 100;
const out = [];
for (const spec of ALL_SHIPS) {
  if (only.length && !only.includes(spec.id)) continue;
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  const hull = m.hull;
  const outline = [];
  for (let f = 0; f <= 1.0001; f += 0.02) { const x = hull.fracToX(f); outline.push([r1(x), r1(hull.halfBeamDeck(x))]); }
  out.push({
    id: spec.id, L: spec.loa, B: spec.beam, outline,
    solids: m.solids.map((s) => ({ b: s.map(r1), poly: s.poly ? s.poly.map((q) => q.map(r1)) : null, round: !!s.round })),
    mounts: m.mounts.map((r) => ({ g: r.group, l: r.label || '', x: r1(r.x), y: r1(r.y), z: r1(r.z), c: r1(r.arcC), a: r1(r.arcMin), b: r1(r.arcMax), h: r1(r.arcH), no: !!r.noArc, n: r.n, cal: r.cal })),
    aa: m.aaMounts.map((r) => ({ v: r.variant, x: r1(r.x), y: r1(r.y), z: r1(r.z), c: r1(r.arcC), a: r1(r.arcMin), b: r1(r.arcMax), no: !!r.noArc })),
  });
}
console.log(JSON.stringify(out));
