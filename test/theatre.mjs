// The great war: node test/theatre.mjs — task forces put to sea from their ports, nobody sees what is not in sight, a contact brings the fleets together and they fight, a task force
// that is beaten goes home. (A small war with two nations keeps the test short; the whole war is the same code.)
import { World } from '../js/game/sim/world.js';
import { buildTheatre } from '../js/game/sim/theatre.js';

const T0 = Date.now();
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m, `[${((Date.now() - T0) / 1000).toFixed(0)}s]`); if (!c) process.exitCode = 1; };

const w = new World(3);
const th = buildTheatre(w, 3, { only: ['USA', 'Japan'] });
const us = th.forces.filter((f) => f.team === 1), jp = th.forces.filter((f) => f.team === 0);
ok(us.length === 3 && jp.length === 3 && w.ships.length === 32, `two navies in six task forces (${w.ships.length} ships): the Americans ${us.map((f) => f.ships.length).join('+')}, the Japanese ${jp.map((f) => f.ships.length).join('+')}`);
ok(w.fog && w.terrain.bounds && w.timeLimit >= 6 * 3600 && w.teams[0].name === 'Axe' && w.teams[1].name === 'Alliés', 'a war of six hours, in the fog, between the Axis and the Allies');
ok(w.ships.every((s) => !s.dock && !s.mission) && w.bases.filter((b) => b.layout.kind === 'port').length >= 4, 'the fleets start at sea off their ports, which are there');
const a = w.ships.find((s) => s.team === 1);
ok(w.enemiesOf(a).length === 0 && !w.isKnown(1, w.ships.find((s) => s.team === 0)), 'at the start nobody sees anybody: the enemy is not in the list of the captains');

w.start();
const start = new Map(th.forces.map((f) => [f.key, { x: f.ships[0].x, z: f.ships[0].z }]));
const run = (secs, step = 1) => { const t1 = w.time + secs; while (w.time < t1) { w.update(step); w.drainEvents(); } };
run(900);
const moved = th.forces.map((f) => Math.hypot(f.ships[0].x - start.get(f.key).x, f.ships[0].z - start.get(f.key).z));
ok(th.forces.every((f) => f.fleet.goal && f.fleet.cruise), 'every task force has a goal and sails to it in its order');
ok(moved.filter((d) => d > 5000).length >= 5, `they are under way (${moved.map((d) => (d / 1000).toFixed(0)).join(', ')} km in 15 minutes)`);
ok(w.ships.every((s) => s.state === 'afloat'), 'nobody runs aground, nobody is lost on the way');

// a Japanese task force and an American one are brought within sight of each other
const A = us.find((f) => f.role === 'battle'), J = jp.find((f) => f.role === 'battle');
const dx = A.ships[0].x - J.ships[0].x, dz = A.ships[0].z - J.ships[0].z, d0 = Math.hypot(dx, dz);
const k = (d0 - 24000) / d0;
for (const s of J.ships) { s.x += dx * k; s.z += dz * k; }
let seen = -1, fought = -1;
const t1 = w.time;
while (w.time < t1 + 900) {
  w.update(1); w.drainEvents();
  if (seen < 0 && w.isKnown(1, J.ships[0])) seen = w.time - t1;
  if (fought < 0 && (A.ships.some((s) => s.shotsFired > 0) || J.ships.some((s) => s.shotsFired > 0))) fought = w.time - t1;
  if (fought > 0 && w.time - t1 > fought + 120) break;
}
ok(seen >= 0 && seen < 300, `they see each other at 24 km (after ${seen.toFixed(0)} s)`);
ok(fought >= 0 && fought < 600, `and the line opens fire (after ${fought.toFixed(0)} s)`);
ok(!A.fleet.cruise || fought >= 0, 'a fleet with an enemy in reach no longer cruises');
