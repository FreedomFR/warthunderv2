// How things move when they are hurt: node test/dynamics.mjs
// A ship's speed is thrust against drag (a ship with no machinery coasts, she does not brake like a car nor crawl on at a fixed speed), a sinking one is taken by the drag of her hull,
// and an aircraft that falls is held by the drag of the shape it has (terminal speeds of a few tens to a couple of hundred m/s), not by gravity alone.
import { World } from '../js/game/sim/world.js';
import { PLANES } from '../js/game/model/planes.js';
import { stepDying } from '../js/game/sim/planedamage.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

for (const id of ['fletcher', 'iowa']) {
  const w = new World(1); w.addTeam(0); w.addTeam(1);
  const s = w.addShip(id, 0, 0, 0, 0, { speed: 0, throttle: 1 });
  w.addShip('fletcher', 1, 60000, 0, 0, { speed: 0, throttle: 0 });
  w.start(); s.controller = null; s.cmd.throttle = 1;
  const vmax = s.stats.maxSpeed, run = (secs) => { for (let i = 0; i < secs * 10; i++) w.update(0.1); };
  const T = s.stats.accelSeconds;
  run(T * 1.5);
  ok(s.speed > 0.93 * vmax && s.speed <= 1.001 * vmax, `${id}: at full power she reaches her top speed in about the time of her class (${(s.speed / vmax).toFixed(2)} of it after ${(T * 1.5).toFixed(0)} s)`);
  for (const m of s.modules) if (m.kind === 'engine') { m.hp = 0; m.state = 2; }
  s.updatePropulsion();
  run(20);
  const v20 = s.speed / vmax;
  ok(v20 > 0.4 && v20 < 0.95, `${id}: twenty seconds after her machinery is gone she still has ${(v20 * 100).toFixed(0)} % of her speed (she coasts)`);
  run(900);
  const v900 = s.speed / vmax;
  ok(v900 < 0.12 && v900 >= 0, `${id}: a quarter of an hour later she is nearly stopped, with nothing holding her at a crawl (${(v900 * 100).toFixed(1)} %)`);
  // a ship that is going down is slowed by her hull
  const w2 = new World(2); w2.addTeam(0); w2.addTeam(1);
  const q = w2.addShip(id, 0, 0, 0, 0, { speed: 0, throttle: 1 });
  w2.addShip('fletcher', 1, 60000, 0, 0, { speed: 0, throttle: 0 });
  w2.start(); q.controller = null; q.cmd.throttle = 1;
  for (let i = 0; i < T * 15; i++) w2.update(0.1);
  const v0 = q.speed; q.destroy(null, 'flood');
  for (let i = 0; i < 600; i++) w2.update(0.1);
  ok(q.state !== 'afloat' && q.speed < 0.35 * v0, `${id}: sixty seconds after she is lost she has slowed from ${(v0 / vmax).toFixed(2)} to ${(q.speed / vmax).toFixed(2)} of her top speed`);
}

// ---- the fall of an aircraft ----
const w = new World(1); w.addTeam(0); w.addTeam(1);
const fall = (key, mode) => {
  const p = { spec: PLANES[key], typeKey: key, mode, x: 0, y: 3000, z: 0, vx: 100, vy: 0, vz: 0, heading: 0, pitch: 0, bank: 0, speed: 100, dyingT: 0, spinRate: 4, lost: {}, phase: 'cruise', owner: null };
  let t = 0, vmax = 0;
  while (p.y > 1 && t < 200) { if (stepDying(w, p, 0.05) === false) break; t += 0.05; vmax = Math.max(vmax, p.speed); }
  return { t, vmax };
};
for (const key of ['f6f', 'b17']) {
  const r = Object.fromEntries(['dive', 'spin', 'wing', 'tumble'].map((m) => [m, fall(key, m)]));
  ok(r.dive.vmax > 170 && r.dive.vmax < 270, `${key}: a diving wreck reaches ${r.dive.vmax.toFixed(0)} m/s at most (terminal speed of a fuselage)`);
  ok(r.spin.vmax < 120 && r.tumble.vmax < 120 && r.spin.t > 33 && r.spin.t < 70, `${key}: a spinning one falls from 3 000 m in ${r.spin.t.toFixed(0)} s at no more than ${r.spin.vmax.toFixed(0)} m/s`);
  ok(r.dive.t < r.wing.t && r.wing.t < r.spin.t, `${key}: it falls faster the cleaner the shape (${r.dive.t.toFixed(0)} s diving, ${r.wing.t.toFixed(0)} s with a wing off, ${r.spin.t.toFixed(0)} s spinning)`);
}
if (fail) process.exit(1);
