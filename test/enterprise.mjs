// USS Enterprise (CV-6, 1942 fit), drawn from a reference model: the fit is the real one (8 single 5 in/38, 4 quadruple 1.1 in/75, 37 single 20 mm), every gun is a real gun that fires in a battle
// (the 5 in as flak and at ships, the 1.1 in 'Chicago piano' and the Oerlikons at aircraft), the three lifts and the deck are where the model has them.   node test/enterprise.mjs
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { BY_ID } from '../js/game/data/ships.js';
import { AA } from '../js/game/sim/aadata.js';
import { AA_GUNS, AMMO } from '../js/game/data/airguns.js';
import { planeTypeFor } from '../js/game/model/planes.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

const spec = BY_ID.enterprise;
ok(spec && spec.type === 'CV' && spec.nation === 'USA' && spec.loa === 246.7 && spec.speedKn === 32.5 && spec.shp === 120000, 'the sheet: a US carrier of 246.7 m, 120 000 shp, 32.5 knots');
ok(spec.main.gunsTotal === 8 && spec.main.mounts.length === 8 && spec.main.mounts.every((m) => m.guns === 1) && spec.main.caliberMm === 127 && spec.main.boreCalibers === 38, 'eight single 5 in/38');
ok(spec.aircraft.capacity === 90 && spec.aircraft.catapults === 2, 'an air group of 90 aircraft, two flight-deck catapults');

// ---- the fit as the ship carries it ----
const w0 = new World(1); w0.addTeam(0); w0.addTeam(1);
const cv0 = w0.addShip('enterprise', 0, 0, 0, 0);
const mains = cv0.mounts.filter((m) => m.group === 'main');
ok(mains.length === 8 && mains.every((m) => m.rec.n === 1 && m.rec.cal === 127), `${mains.length} single 5 in mounts`);
ok(mains.filter((m) => m.rec.z > 0).length === 4 && mains.filter((m) => m.rec.z < 0).length === 4 && mains.filter((m) => m.rec.x > 0).length === 4, 'four a side, four forward and four aft (two at each corner of the flight deck)');
ok(mains.every((m) => m.rec.look === 'enterprise/s127'), 'every one is drawn as the copy of the model\'s own mount');
const quads = cv0.aaMounts.filter((m) => m.rec.gun === 'm1_28'), o20 = cv0.aaMounts.filter((m) => m.rec.gun === 'oerlikon20');
ok(quads.length === 4 && quads.every((m) => m.rec.n === 4 && m.rec.cal === 28 && m.rec.z > 0), `${quads.length} quadruple 1.1 in mounts, all on the starboard side (two ahead of the island, two abaft it)`);
ok(o20.length === 37 && o20.every((m) => m.rec.n === 1 && m.rec.cal === 20), `${o20.length} single 20 mm Oerlikons`);
ok(cv0.aaMounts.length === 41, 'no other light mount (the 40 mm Bofors came only in 1943)');
// the 1.1 in/75: 150 rounds a minute a barrel cyclic, 0.9 lb (417 g) round, 823 m/s
const g = AA_GUNS.m1_28, r = AMMO[g.round];
ok(g.cal === 28 && g.rpm === 150 && g.v0 === 823 && r.cal === 28 && r.dmg > AMMO.hei20ok.dmg && r.dmg < AMMO.hei37fl.dmg, 'the 1.1 in gun: 28 mm, 150 rpm a barrel, 823 m/s, a round between the 20 mm and the 37 mm');
ok(AA.m1_28.rps < g.rpm / 60 && AA.m1_28.turn === 30 && AA.m1_28.range > AA.oerlikon20.range * 0.8 && AA.m1_28.range < AA.bofors40.range, 'its data: a feed that jams (under the cyclic rate), 30 deg/s train, a range between the Oerlikon and the Bofors');

// the air group of 1942: Wildcats, Dauntlesses, Avengers (the Hellcat came in 1943)
ok(cv0.name === 'USS Enterprise' && planeTypeFor('USA', 'fighter', cv0.name) === 'f4f' && planeTypeFor('USA', 'dive', cv0.name) === 'sbd' && planeTypeFor('USA', 'torp', cv0.name) === 'tbf', `${cv0.name} flies the F4F, the SBD and the TBF`);

// ---- the deck ----
{
  const lifts = cv0.model.elevators, dp = cv0.model.deckPoints;
  ok(lifts.length === 3 && lifts.every((e) => !e.edge), 'three centre-line lifts, none on the deck edge');
  const L = spec.loa, xs = lifts.map((e) => (L / 2 - e.x) / L);
  ok(Math.abs(xs[0] - 0.1775) < 0.003 && Math.abs(xs[1] - 0.6034) < 0.003 && Math.abs(xs[2] - 0.8916) < 0.003, `the lifts at 0.178, 0.603 and 0.892 of the length as on the model (${xs.map((v) => v.toFixed(3)).join(', ')})`);
  ok(lifts.every((e) => e.hl > 6.4 && e.hl < 7.5 && e.hw > 6.4 && e.hw < 7.5) && Math.abs(lifts[1].z - 2.1) < 0.2, 'each 14.6 x 13.4 m (48 x 44 ft), the middle one 2 m to starboard');
  ok(dp.y > 15.5 && dp.y < 16.1 && dp.x1 - dp.x0 > 236 && dp.x1 - dp.x0 < 242, `a flight deck 15.8 m over the waterline and ${(dp.x1 - dp.x0).toFixed(0)} m long`);
}

// ---- a battle: the guns fire ----
const secs = 840, N = 3, tot = { quad: 0, o20: 0, five: 0, planesDown: 0, strikes: 0 };
for (let seed = 21; seed < 21 + N; seed++) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
  [parse('enterprise:1,cleveland:2,fletcher:2'), parse('shokaku:1,agano:2,kagero:2')].forEach((f, i) => { const s = teamStart(i, 2, 14000); spawnFleet(w, i, f, s.x, s.z, s.heading); });
  for (const s of w.ships) s.cmd.throttle = 0.7;
  w.start();
  let t = 0;
  while (t < secs && w.state !== 'finished') { w.update(0.1); t += 0.1; w.drainEvents(); }
  const cv = w.ships.find((s) => s.stats.id === 'enterprise');
  const used = (list) => list.reduce((a, m) => a + (m.ammo0 - m.ammo), 0);
  tot.quad += used(cv.aaMounts.filter((m) => m.rec.gun === 'm1_28')); tot.o20 += used(cv.aaMounts.filter((m) => m.rec.gun === 'oerlikon20'));
  tot.five += cv.mounts.filter((m) => m.group === 'main').reduce((a, m) => a + (m.ammo0 - m.ammo.HE - m.ammo.AP), 0);
  tot.planesDown += cv.planeKills || 0; tot.strikes += w.planes.filter((p) => p.owner && p.owner.stats.id === 'shokaku').length;
  console.log(`seed ${seed}: the Enterprise used ${Math.round(used(cv.aaMounts.filter((m) => m.rec.gun === 'm1_28')))} rounds of 1.1 in, ${Math.round(used(cv.aaMounts.filter((m) => m.rec.gun === 'oerlikon20')))} of 20 mm, her air group ${JSON.stringify(cv.air)}`);
}
ok(tot.five > 0, `the 5 in guns fired (${Math.round(tot.five)} rounds over ${N} battles)`);
ok(tot.quad > 0, `the quadruple 1.1 in mounts fired at aircraft (${Math.round(tot.quad)} rounds)`);
ok(tot.o20 > 0, `the Oerlikons fired at aircraft (${Math.round(tot.o20)} rounds)`);
if (fail) process.exit(1);
