// The captain's choice of how to turn his ship to the enemy's fire (controllers/posture.js), and the escorts' stations relative to their carrier (fleet.js).
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { chooseOffset } from '../js/game/sim/controllers/posture.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

const w = new World(5); w.addTeam(0); w.addTeam(1);
spawnFleet(w, 0, [{ id: 'iowa', count: 1 }, { id: 'fletcher', count: 1 }, { id: 'baltimore', count: 1 }], 0, 0, 90);
spawnFleet(w, 1, [{ id: 'yamato', count: 1 }, { id: 'kgv', count: 1 }], 20000, 0, 270);
const mine = w.ships.filter((s) => s.team === 0), theirs = w.ships.filter((s) => s.team === 1);
let bad = 0, n = 0;
for (const s of mine) for (const e of theirs) for (const range of [8000, 14000, 20000]) for (const circle of [1, -1]) {
  const off = chooseOffset(s, e, range, circle, 0);
  n++;
  if (!Number.isFinite(off) || Math.abs(off) > 56) bad++;
}
ok(bad === 0, `${n} choices, all within 56 degrees of broadside`);
const iowa = mine.find((s) => s.stats.id === 'iowa'), yam = theirs.find((s) => s.stats.id === 'yamato');
const a = chooseOffset(iowa, yam, 14000, 1, 0), b = chooseOffset(iowa, yam, 14000, 1, a);
ok(Math.abs(a) > 0, `a battleship facing a battleship at 14 km does not stay broadside (${a} degrees)`);
ok(a === b, 'the choice is kept when asked again with what it gave (no swinging)');
const dd = mine.find((s) => s.stats.id === 'fletcher');
ok(Math.abs(chooseOffset(dd, yam, 14000, 1, 0)) <= 56, 'a destroyer gets an answer too');

// escorts keep with their carrier wherever she goes
const w2 = new World(6); w2.addTeam(0); w2.addTeam(1);
spawnFleet(w2, 0, [{ id: 'essex', count: 1 }, { id: 'fletcher', count: 2 }, { id: 'iowa', count: 1 }], 0, 0, 90);
spawnFleet(w2, 1, [{ id: 'kgv', count: 1 }], 30000, 0, 270);
w2.start();
w2.update(0.1);
const fl = w2.fleetOf(0), cv = w2.ships.find((s) => s.stats.id === 'essex'), esc = w2.ships.filter((s) => s.stats.id === 'fletcher');
cv.x += 4000; cv.z += 3000;
for (const e of esc) {
  const p = fl.stationPoint(e);
  ok(p && Math.hypot(p[0] - cv.x, p[1] - cv.z) < 2400, `an escort's station is within 2.4 km of the carrier (${p ? Math.hypot(p[0] - cv.x, p[1] - cv.z).toFixed(0) : '-'} m) even when the carrier is away from her place in the line`);
}
if (fail) process.exit(1);
