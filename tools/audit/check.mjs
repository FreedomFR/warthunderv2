// Geometric audit of the mounts of every ship: node tools/audit/check.mjs [ship,...]
// Reports the mounts that are buried in a structure, that float (nothing under them), that overlap each other, that cannot be trained at all or whose arc is cut
// a lot by what stands round them, and the ones that were moved. Exit code 1 when a mount is buried or overlaps another (those are model bugs).
import { ALL_SHIPS } from '../../js/game/data/ships.js';
import { buildShipModel } from '../../js/game/model/shipbuilder.js';
import { TWEAKS } from '../../js/game/model/tweaks.js';
import { mountDims } from '../../js/game/model/mounts.js';

const D = 180 / Math.PI;
const only = (process.argv[2] || '').split(',').filter(Boolean);
const verbose = process.argv.includes('-v');

function inPoly(poly, x, z) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) { if (sign === 0) sign = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sign) return false; }
  }
  return true;
}
/** is the plan point (x, z) inside the footprint of solid s (grown by pad)? */
function inFoot(s, x, z, pad = 0) {
  if (x < s[0] - pad || x > s[1] + pad || z < s[4] - pad || z > s[5] + pad) return false;
  if (s.poly) return inPoly(s.poly, x, z);
  if (s.round) { const cx = (s[0] + s[1]) / 2, cz = (s[4] + s[5]) / 2, a = (s[1] - s[0]) / 2 + pad, c = (s[5] - s[4]) / 2 + pad; return ((x - cx) / a) ** 2 + ((z - cz) / c) ** 2 <= 1; }
  return true;
}

let bugs = 0;
for (const spec of ALL_SHIPS) {
  if (only.length && !only.includes(spec.id)) continue;
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  const issues = [];
  const all = [...m.mounts.map((r, i) => ({ r, name: `${r.group}${r.label ? ':' + r.label : i}`, aa: false })), ...m.aaMounts.map((r, i) => ({ r, name: `aa${i}(${r.variant})`, aa: true }))];
  for (const { r, name, aa } of all) {
    // buried: the pivot inside the volume of a structure
    for (const s of m.solids) {
      if (!(s[2] < r.y - 0.2 && s[3] > r.y + 0.2)) continue;
      if (!inFoot(s, r.x, r.z, -0.1)) continue;
      issues.push({ bug: true, text: `${name} at (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) y=${r.y.toFixed(1)} is inside a structure (y ${s[2].toFixed(1)}..${s[3].toFixed(1)})` }); break;
    }
    // floating: nothing within 1.4 m under the pivot (a deck, a roof, a barbette or a sponson)
    let sup = r.y - (m.hull.deckY(r.x) - m.hull.camber) < 1.6 + (aa ? 0.5 : 1.2);
    for (const s of m.solids) if (!sup && s[3] > r.y - 1.4 && s[3] < r.y + 0.25 && inFoot(s, r.x, r.z, 1.0)) sup = true;
    if (!sup) issues.push({ bug: false, text: `${name} at (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) y=${r.y.toFixed(1)} floats` });
    if (r.noArc) issues.push({ bug: false, text: `${name} at (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) y=${r.y.toFixed(1)} has no free arc` });
    else if (!aa && verbose) { const w = r.arcMax - r.arcMin, full = 2 * r.arcH; if (w < full * 0.7) issues.push({ bug: false, text: `${name} arc ${(r.arcMin * D).toFixed(0)}..${(r.arcMax * D).toFixed(0)} of +-${(r.arcH * D).toFixed(0)}${r.moved ? ' (centre moved ' + (r.moved * D).toFixed(0) + ')' : ''}` }); }
  }
  // two gun mounts on the same spot or overlapping
  for (let i = 0; i < m.mounts.length; i++) for (let j = i + 1; j < m.mounts.length; j++) {
    const a = m.mounts[i], b = m.mounts[j];
    const ra = Math.max(1.4, a.cal / 1000 * (a.n >= 3 ? 11 : 9)), rb = Math.max(1.4, b.cal / 1000 * (b.n >= 3 ? 11 : 9));
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < (ra + rb) * 0.75 && Math.abs(a.y - b.y) < 2.4) issues.push({ bug: true, text: `${a.group}${a.label || i} and ${b.group}${b.label || j} overlap (${d.toFixed(1)} m apart, radii ${ra.toFixed(1)} + ${rb.toFixed(1)})` });
  }
  const bad = issues.filter((q) => q.bug).length;
  bugs += bad;
  console.log(`${spec.id.padEnd(16)} ${bad ? 'BUGS ' + bad : 'ok'}  (${issues.length} notes)`);
  for (const q of issues) if (verbose || q.bug) console.log('   ' + (q.bug ? '! ' : '  ') + q.text);
}
process.exit(bugs ? 1 : 0);
