// The machinery rooms of the specs (measured on cut-aways of reference models, or from published arrangements): in order, inside the hull, no overlap, and the damage
// modules of a ship sit where the rooms are.  node test/machinery.mjs
import { World } from '../js/game/sim/world.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
for (const spec of ALL_SHIPS) {
  const rooms = spec.machinery?.rooms;
  if (!rooms) continue;
  const sorted = [...rooms].sort((a, b) => a[1] - b[1]);
  ok(rooms.every((r) => r[1] >= 0 && r[2] <= 1 && r[1] < r[2] && ['boiler', 'engine'].includes(r[0])), `${spec.id}: ${rooms.length} rooms inside the hull`);
  // (rooms side by side, at other offsets from the centre line (r[3], r[4] their width), may share a stretch of the length)
  const clash = sorted.some((r, i) => sorted.some((q, j) => j < i && (r[3] || 0) === (q[3] || 0) && r[1] < q[2] - 1e-6));
  ok(!clash, `${spec.id}: the rooms on one line do not overlap`);
  ok(rooms.some((r) => r[0] === 'boiler') && rooms.some((r) => r[0] === 'engine'), `${spec.id}: boilers and engines`);
  const w = new World(1); w.addTeam(0); w.addTeam(1);
  const s = w.addShip(spec.id, 0, 0, 0, 0); w.start();
  const eng = s.modules.filter((m) => m.kind === 'engine');
  const L = spec.loa, xs = rooms.map((r) => L / 2 - L * (r[1] + r[2]) / 2);
  ok(eng.length > 0 && eng.every((m) => xs.some((x) => Math.abs(m.x - x) < 0.5 * L / rooms.length + 8)), `${spec.id}: the engine modules stand at the rooms`);
}
console.log(fail ? `${fail} FAILED` : 'ALL OK');
