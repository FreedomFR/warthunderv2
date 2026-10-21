// The cockpits seen from the pilot's seat: node test/cockpit.mjs
import { PLANES, getPlaneModel, cockpitHole } from '../js/game/model/planes.js';
import { buildCockpit, cockpitEye, canopyFrame } from '../js/game/model/cockpit.js';
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
  // (a bomber's flight deck is wider, the seat is on the left, and the bulkhead behind the seats is made larger than the fuselage, to hide the inside of its skin)
  const zr = spec.engines ? 2.45 : 0.8, yLo = spec.engines ? 1.45 : 1.1, yHi = spec.engines ? 1.45 : 0.5;
  // (the frames of a canopy follow its glass: a long greenhouse runs further fore and aft)
  const cn = spec.canopy && spec.canopy[0], fx0 = Math.min(E.x - 1.5, cn && !spec.engines ? cn.x0 - 0.1 : 1e9), fx1 = Math.max(E.x + 1.2, cn && !spec.engines ? cn.x1 + 0.1 : -1e9);
  if (bb[0] < fx0 || bb[3] > fx1 || bb[1] < E.y - yLo || bb[4] > E.y + yHi || Math.abs(bb[2] - E.z) > zr || Math.abs(bb[5] - E.z) > zr) bad.push(`${k}: the cockpit is not round the eye (${bb.map((v) => v.toFixed(1)).join(' ')})`);
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

// the pilot sits under his canopy, and from his seat the fuselage is open over the cockpit (the tub fills the opening)
{
  const bad2 = [];
  for (const [k, spec] of Object.entries(PLANES)) {
    if (spec.engines || spec.canopy[0].open) continue;
    const E = cockpitEye(spec), C = canopyFrame(spec);
    if (!(E.y < C.roof - 0.1 && E.y > C.sill + 0.15)) bad2.push(`${k}: eye at ${E.y.toFixed(2)} (sill ${C.sill.toFixed(2)}, roof ${C.roof.toFixed(2)})`);
    if (!(E.x > C.x0 && E.x < C.x1)) bad2.push(`${k}: eye not under the canopy`);
    const m = getPlaneModel(k), hole = cockpitHole(spec);
    if (!m.meshes.cabin) { bad2.push(k + ': no cabin mesh'); continue; }
    // no skin of the cabin over the cockpit, between the back of the opening and the panel, above the sill
    const f = new Float32Array(m.meshes.cabin.vertices), I = m.meshes.cabin.indices, u = new Uint8Array(m.meshes.cabin.vertices);
    let over = 0;
    for (let t = 0; t < I.length; t += 3) {
      let cx = 0, cy = 0, cz = 0, sk = true;
      for (let j = 0; j < 3; j++) { const v = I[t + j]; cx += f[v * 6] / 3; cy += f[v * 6 + 1] / 3; cz += f[v * 6 + 2] / 3; if (u[v * 24 + 23] !== MAT.AIRCRAFT) sk = false; }
      if (sk && cx > hole.x0 + 0.05 && cx < E.x + 0.75 && cy > C.sill + 0.02 && Math.abs(cz) < C.hwS * 0.9) over++;
    }
    if (over) bad2.push(`${k}: ${over} triangles of skin over the cockpit`);
    if (m.meshes.cabin.indexCount < m.meshes.body.indexCount * 0.6) bad2.push(k + ': the cabin lost most of the fuselage');
  }
  ok(bad2.length === 0, `under a canopy the eye is below the roof and above the sill, and from the seat the fuselage is open over the cockpit${bad2.length ? ': ' + bad2.slice(0, 4).join('; ') : ''}`);
}
