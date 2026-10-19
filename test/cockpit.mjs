// The cockpits seen from the pilot's seat: node test/cockpit.mjs
import { PLANES } from '../js/game/model/planes.js';
import { buildCockpit, cockpitEye } from '../js/game/model/cockpit.js';
import { MAT } from '../js/game/model/meshbuilder.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
let bad = [];
const kinds = (m) => { const u = new Uint8Array(m.vertices), s = new Set(); for (let i = 0; i < m.vertexCount; i++) s.add(u[i * 24 + 23]); return s; };
for (const [k, spec] of Object.entries(PLANES)) {
  const c = buildCockpit(spec), E = cockpitEye(spec);
  const f = new Float32Array(c.interior.vertices);
  for (let i = 0; i < c.interior.vertexCount * 6; i++) if (i % 6 < 3 && !Number.isFinite(f[i])) { bad.push(k + ' NaN'); break; }
  const tris = c.interior.indexCount / 3;
  if (tris < 150 || tris > 1500) bad.push(`${k}: ${tris} triangles`);
  const mats = kinds(c.interior);
  if (!mats.has(MAT.GAUGE) || !mats.has(MAT.INTERIOR)) bad.push(k + ': no dials or no interior');
  // everything stays within a couple of metres of the eye (the panel is under the nose, the rails round the seat)
  const bb = c.interior.aabb;
  if (bb[0] < E.x - 1.5 || bb[3] > E.x + 1.2 || bb[1] < E.y - 1.1 || bb[4] > E.y + 0.5 || Math.abs(bb[2]) > 0.8 || Math.abs(bb[5]) > 0.8) bad.push(`${k}: the cockpit is not round the eye (${bb.map((v) => v.toFixed(1)).join(' ')})`);
  // the panel is ahead of the pilot and below his eyes, the stick is under it
  const dials = [];
  const u = new Uint8Array(c.interior.vertices);
  for (let i = 0; i < c.interior.vertexCount; i++) if (u[i * 24 + 23] === MAT.GAUGE) dials.push([f[i * 6] - E.x, f[i * 6 + 1] - E.y]);
  if (dials.length < 24 || !dials.every((d) => d[0] > 0.3 && d[1] < 0.0)) bad.push(`${k}: the dials are not on a panel ahead of and below the eye`);
  if (!c.stick || c.stick.indexCount === 0) bad.push(k + ': no stick');
  if (spec.prop && (!c.disc || c.disc.indexCount === 0)) bad.push(k + ': no propeller disc');
}
ok(bad.length === 0, `the cockpits of the ${Object.keys(PLANES).length} types: dials on a panel, round the eye, a stick and a propeller disc${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
ok(PLANES.swordfish.canopy[0].open && cockpitEye(PLANES.swordfish).open && !cockpitEye(PLANES.a6m).open, 'the Swordfish has an open cockpit, the Zero a closed one');
process.exit(fail ? 1 : 0);
