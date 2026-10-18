// Proves that a ship can be driven by a human-style controller through the same ShipCommand as the AI:
//   node test/manual.mjs
import { World } from '../js/game/sim/world.js';
import { ManualController } from '../js/game/sim/controllers/manual.js';

const w = new World(5);
w.addTeam(0); w.addTeam(1);
const me = w.addShip('iowa', 0, -4000, 0, Math.PI / 2);
const foe = w.addShip('yamato', 1, 4000, 0, -Math.PI / 2);
// the target steams on and holds its fire: this test is about the controls, not about who wins the duel
foe.controller = { update(ship) { ship.cmd.throttle = 0.5; ship.cmd.main.fire = false; ship.cmd.sec.fire = false; ship.cmd.torpedo.fire = false; } };
const input = { up: true, down: false, left: false, right: false, aim: null, lockedTarget: null, fireMain: false, fireSec: false, fireTorpedo: false, launchAir: false };
me.controller = new ManualController(input);
w.start();

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
// 1. throttle up -> the ship accelerates
for (let i = 0; i < 600; i++) w.update(0.1);
ok(me.speed > 8, `throttle accelerates the ship (${(me.speed / 0.5144).toFixed(0)} kn)`);
// 2. rudder -> the heading changes (no autopilot)
const h0 = me.heading;
input.right = true;
for (let i = 0; i < 200; i++) w.update(0.1);
input.right = false;
ok(Math.abs(me.heading - h0) > 0.3, `starboard rudder turns the ship (${((me.heading - h0) * 57.3).toFixed(0)} deg)`);
// 3. aim at a ground point and fire the main battery: turrets slew and shells leave
input.aim = { x: foe.x, z: foe.z };
input.fireMain = true;
const before = me.shotsFired;
for (let i = 0; i < 900; i++) w.update(0.1);
ok(me.shotsFired > before, `aimed fire on a ground point launches shells (${me.shotsFired - before} fired)`);
// 4. locked target: the fire-control computer leads it
input.aim = null; input.lockedTarget = foe;
const b2 = me.shotsFired, hit0 = me.shotsHit;
for (let i = 0; i < 1800; i++) w.update(0.1);
ok(me.shotsFired > b2, 'locked target: salvos keep firing');
console.log(`hits so far: ${me.shotsHit - hit0} of ${me.shotsFired - b2}`);
