// The time it takes to build every ship model, and a fingerprint of the result (the same fingerprint = the same models): node tools/modelbench.mjs
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
let fp = 0;
const mix = (v) => { fp = (fp * 31 + Math.round(v * 1000)) | 0; };
const t0 = performance.now(), each = [];
for (const spec of ALL_SHIPS) {
  const t = performance.now();
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  each.push([spec.id, performance.now() - t]);
  for (const r of m.mounts) { mix(r.x); mix(r.y); mix(r.z); }
  for (const r of m.aaMounts || []) { mix(r.x); mix(r.z); }
  const vs = new Float32Array(m.mesh.vertices), ix = m.mesh.indices;
  mix(vs.length); for (let i = 0; i < vs.length; i += 13) mix(vs[i]);
  mix(ix.length); for (let i = 0; i < ix.length; i += 7) mix(ix[i]);
  for (const q of m.solids) for (let i = 0; i < 6; i++) mix(q[i]);
  if (m.fine && m.fine.vertices) { const f = new Float32Array(m.fine.vertices); mix(f.length); for (let i = 0; i < f.length; i += 13) mix(f[i]); }
  mix(m.topY); mix(m.radius);
}
console.log(`${ALL_SHIPS.length} models in ${((performance.now() - t0) / 1000).toFixed(2)} s; fingerprint ${fp}`);
console.log(each.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', '));
