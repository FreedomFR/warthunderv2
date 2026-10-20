// What turns on a ship: node test/spin.mjs — the screws and the rudders, the radars, the directors, and the matrix they are drawn with.
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
import { spinAbout } from '../js/game/render/shipVisual.js';
import { mat4YawPitchAt, mat4Point } from '../js/game/math.js';
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

// every ship has screws and a rudder to turn, every radar of the sweeping kinds a rate, every director its pivot
let noScrew = [], noMesh = [], radars = 0, dirs = 0;
for (const spec of ALL_SHIPS) {
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  if (!m.spinners.some((q) => q.kind === 'prop') || !m.spinners.some((q) => q.kind === 'rudder')) noScrew.push(spec.id);
  if (m.spinners.some((q) => !q.mesh || !(q.mesh.indexCount > 0))) noMesh.push(spec.id);
  radars += m.parts.filter((p) => p.spin).length; dirs += m.parts.filter((p) => p.track).length;
  for (const p of m.parts) if (p.spin) { if (!(p.spin.rate > 0)) ok(false, `${spec.id}: ${p.id} turns at no rate`); }
}
ok(noScrew.length === 0, `every ship has screws and a rudder${noScrew.length ? ' (missing: ' + noScrew.join(', ') + ')' : ''}`);
ok(noMesh.length === 0, `and they are drawn${noMesh.length ? ' (empty: ' + noMesh.join(', ') + ')' : ''}`);
ok(radars >= 30 && dirs >= 30, `radars that sweep (${radars}) and directors that follow the guns (${dirs})`);

// the damage model does not see the screws that were only drawn: the shafts of a class without a measured underwater body are as before
{
  const spec = ALL_SHIPS.find((s) => s.id === 'cleveland'), m = buildShipModel(spec, TWEAKS[spec.id] || {});
  ok(m.shafts.length === 0 && m.rudders.length === 0 && m.spinners.length >= 5, 'the drawn screws of a class without measured ones are not shafts of the damage model');
}

// the matrix: the pivot stays where it is, the rest turns round it (a vertical axis like the yaw of a mount; the screw about the shaft)
{
  const I = new Float64Array(16); I[0] = I[5] = I[10] = I[15] = 1;
  const out = new Float64Array(16), p = [0, 0, 0], q = [0, 0, 0], ref = new Float64Array(16);
  spinAbout(out, I, 'y', 0.7, 10, 5, -3);
  mat4Point(p, out, 10, 5, -3);
  ok(Math.hypot(p[0] - 10, p[1] - 5, p[2] + 3) < 1e-9, 'the pivot of a turning piece does not move');
  mat4Point(q, out, 12, 5, -3);
  mat4YawPitchAt(ref, 0, 0, 0, 0.7, 0); mat4Point(p, ref, 2, 0, 0);
  ok(Math.hypot(q[0] - 10 - p[0], q[1] - 5, q[2] + 3 - p[2]) < 1e-9, 'a piece turns the same way as the yaw of a mount');
  spinAbout(out, I, 'x', 1.1, 0, -6, 4);
  mat4Point(q, out, 0, -6, 6);
  ok(Math.abs(q[0]) < 1e-9 && Math.abs(Math.hypot(q[1] + 6, q[2] - 4) - 2) < 1e-9, 'a screw turns about its shaft (the tip stays at the same distance)');
}

// the screws turn with the speed of the ship
{
  const w = new World(5); w.addTeam(0); w.addTeam(1);
  const [a] = spawnFleet(w, 0, [{ id: 'iowa', count: 1 }], 0, 0, Math.PI / 2);
  spawnFleet(w, 1, [{ id: 'fletcher', count: 1 }], 0, 30000, 0);
  w.start();
  a.speed = 0; a.cmd.throttle = 0; a.controller = { update(sh) { sh.cmd.throttle = 0; sh.cmd.main.fire = false; sh.cmd.sec.fire = false; sh.cmd.torpedo.fire = false; } };
  const p0 = a.propAngle;
  for (let i = 0; i < 20; i++) w.update(0.1);
  ok(Math.abs(a.propAngle - p0) < 0.05, 'a ship that is stopped keeps its screws still');
  a.controller = { update(sh) { sh.cmd.throttle = 1; sh.cmd.main.fire = false; sh.cmd.sec.fire = false; sh.cmd.torpedo.fire = false; } };
  for (let i = 0; i < 300; i++) w.update(0.1);
  let turned = 0, last = a.propAngle;
  for (let i = 0; i < 10; i++) { w.update(0.1); turned += ((a.propAngle - last + Math.PI * 3) % (Math.PI * 2)) - Math.PI; last = a.propAngle; }
  ok(a.speed > 5 && Number.isFinite(a.propAngle) && Math.abs(turned) > 0.2, `under way the screws turn (speed ${(a.speed / 0.5144).toFixed(0)} kn)`);
}
