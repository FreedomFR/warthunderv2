// The guns of the aircraft and what they fire: node test/airguns.mjs
// Every fighter has the guns it really had (the number, the rounds each carries, the rate of fire), the belts are made of rounds that exist, and what a round does depends on what it is:
// the hits it takes to bring an aircraft down follow the published anchors (about 35 .50 API hits for an American fighter, 11 of the Hispano's 20 mm, more than 100 of a rifle calibre;
// three to four times as many for a four-engined bomber).
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { hitPlane } from '../js/game/sim/planedamage.js';
import { AMMO, BELTS, GUNS, FIGHTER_GUNS, UNIT, armamentOf, beltMean, beltForGun, drawRound } from '../js/game/data/airguns.js';
import { PLANES } from '../js/game/model/planes.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// ---- the data ----
{
  const bad = [];
  for (const [b, mix] of Object.entries(BELTS)) { let t = 0; for (const [k, w] of Object.entries(mix)) { if (!AMMO[k]) bad.push(b + ':' + k); t += w; } if (Math.abs(t - 1) > 1e-6) bad.push(b + ' (weights)'); }
  for (const [t, fit] of Object.entries(FIGHTER_GUNS)) for (const g of fit) if (!GUNS[g.gun] || !BELTS[g.belt] || !(g.rpg > 0)) bad.push(t + ':' + g.gun);
  ok(!bad.length, `the belts and the fits of ${Object.keys(FIGHTER_GUNS).length} fighters are made of rounds and guns that exist${bad.length ? ': ' + bad.join(', ') : ''}`);
  const z = armamentOf('a6m'), cannon = z.find((g) => g.cal === 20), mg = z.find((g) => g.cal < 10);
  ok(cannon.left / (cannon.rps / cannon.n) < 8 && mg.left / (mg.rps / mg.n) > 40, `a Zero's cannons run dry in ${(cannon.left / (cannon.rps / cannon.n)).toFixed(0)} s of fire, its machine guns last ${(mg.left / (mg.rps / mg.n)).toFixed(0)} s`);
  const f = armamentOf('f6f');
  ok(f[0].n === 6 && Math.abs(f[0].rps - 80) < 5, `a Hellcat has six .50s (${f[0].rps.toFixed(0)} rounds a second)`);
  const p40 = armamentOf('p40'), sp = armamentOf('spitfire'), cn = sp.find((g) => g.cal === 20), rf = sp.find((g) => g.cal < 10);
  ok(p40.length === 1 && p40[0].n === 6 && p40[0].rpg === 235 && Math.abs(p40[0].rps - 80) < 5 && beltMean('us50a').dmg > 0.8, `a P-40E has six .50s of 235 rounds (${p40[0].rps.toFixed(0)} rounds a second, an armour-piercing belt)`);
  ok(cn.n === 2 && cn.left === 120 && rf.n === 4 && rf.left === 350 && Math.abs(cn.rps / cn.n - 10) < 1 && Math.abs(rf.rps / rf.n - 19) < 1.5 && beltMean('uk20').dmg > beltMean('us50a').dmg && beltMean('uk20').dmg < beltMean('fr20').dmg + 0.01, 'a Spitfire Mk XII has two Hispano Mk II of 120 rounds (10 rounds a second each) and four .303 of 350 (19 a second)');
  ok(armamentOf('bf109t').some((g) => g.cal === 20) && armamentOf('d520').some((g) => g.cal === 20 && g.n === 1) && armamentOf('fulmar')[0].n === 8, 'a Bf 109T has cannons in the wings, a D.520 one through the hub, a Fulmar eight .303');
  ok(beltMean('us50').dmg > 0.9 && beltMean('us30').dmg < 0.25 && beltMean('fr20').dmg > beltMean('jp20').dmg, 'a belt of .50 is worth four rifle-calibre ones, a Hispano belt more than a Type 99 one');
  ok(beltForGun(20, 'Japan') === 'jp20' && beltForGun(12.7, 'USA') === 'us50' && beltForGun(7.62, 'USA') === 'us30' && beltForGun(7.92, 'Germany') === 'de792' && beltForGun(13, 'Germany') === 'mg131', 'the gunners of every nation fire the round of their gun');
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  let n20 = 0; for (let i = 0; i < 2000; i++) if (drawRound('jp20', rnd).cal === 20) n20++;
  ok(n20 === 2000, 'every round drawn from a cannon belt is a 20 mm one');
}

// ---- the hits it takes to bring an aircraft down ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const starts = [teamStart(0, 2, 12000), teamStart(1, 2, 12000)].map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] }));
  w.terrain = Terrain.generate(3, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], 17000, { bases: 1, starts });
  w.start();
  const kill = (team, typeKey, ammo, N = 60) => {
    const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === team), proto = af.parked.find((p) => p && p.typeKey === typeKey) || { typeKey, spec: PLANES[typeKey] };      // (an airfield flies one of the types of its nation: not always this one)
    let tot = 0;
    for (let k = 0; k < N; k++) {
      const p = { ...proto, parts: null, dying: false, fire: 0, fireOut: false, ctlOut: null, lost: { wingL: false, wingR: false, tail: false, engine: false }, smoke: 0, ground: false, base: null, phase: 'cruise', owner: null, x: 0, y: 800, z: 0, heading: 0, cond: 1, fd: null };
      let hits = 0;
      while (!p.dying && hits < 4000) { w.events.length = 0; w.debris.length = 0; hitPlane(w, null, p, UNIT * ammo.dmg * (0.8 + 0.4 * w.rng()), ammo.cal, 'gun', ammo); hits++; }
      tot += hits;
    }
    return tot / N;
  };
  const f50 = kill(0, 'f6f', AMMO.api50), fHis = kill(0, 'f6f', AMMO.hei20hs), f303 = kill(0, 'f6f', AMMO.ball303), fT99 = kill(0, 'f6f', AMMO.hei20t99a), bomber = kill(0, 'b17', AMMO.api50), zero = kill(1, 'a6m', AMMO.api50);
  ok(f50 > 25 && f50 < 70, `a Hellcat takes ${f50.toFixed(0)} .50 API hits to bring down (the published figure is about 35)`);
  ok(fHis > 6 && fHis < 18 && fHis < f50 * 0.4, `and ${fHis.toFixed(0)} Hispano 20 mm hits (about 11): a third of the .50`);
  ok(fT99 > fHis && fT99 < f50 * 0.6, `a Type 99 shell does less than a Hispano's (${fT99.toFixed(0)} hits) and more than two .50s`);
  ok(f303 > 100, `a rifle-calibre ball round takes ${f303.toFixed(0)} hits (more than a hundred)`);
  ok(bomber > f50 * 2.5, `a B-17 takes ${bomber.toFixed(0)} .50 API hits: three to four times a fighter's`);
  ok(zero < f50 * 0.7, `a Zero, with no armour and no self-sealing tanks, takes ${zero.toFixed(0)}: fewer than the Hellcat's ${f50.toFixed(0)}`);
}
console.log(fail ? `${fail} FAILED` : 'ALL OK');
