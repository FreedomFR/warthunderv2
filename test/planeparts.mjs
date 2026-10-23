// Aircraft have no hit points: node test/planeparts.mjs
// An aircraft is made of parts (wings, tail, fuselage, engines, fuel, pilot, controls); it falls when a wing or the tail comes off, the pilot is killed, the fuselage breaks up, or a fire
// burns on; a hit that does not bring it down makes it fly worse (less lift, a slower roll, a wing that drops) and a holed tank burns.
import { PLANES } from '../js/game/model/planes.js';
import { hitPlane, hitPlanePart, planeParts, planeCondition, tickPlaneDamage, repairPlane } from '../js/game/sim/planedamage.js';
import { guide } from '../js/game/sim/flight.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const rng = (() => { let x = 11; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
rng.normal = () => 0; rng.range = (a, b) => a + (b - a) * rng();
const world = { rng, events: [], debris: [], planes: [], ships: [], addSeaFire() {} };
const mk = (key = 'f6f') => { const spec = PLANES[key]; return { typeKey: key, spec, cond: 1, phase: 'cruise', lost: { wingL: false, wingR: false, tail: false, engine: false }, smoke: 0, fire: 0, x: 0, y: 900, z: 0, vx: 0, vy: 0, vz: -80, speed: 80, heading: 0, pitch: 0, bank: 0, dying: false, ordnance: false, spin: 0 }; };

{
  const p = mk(), P = planeParts(p);
  ok(p.hp === undefined && P.wingL.hp > 0 && P.pilot.hp > 0 && P.eng.length === 1, 'an aircraft has parts, not hit points');
  hitPlanePart(world, null, p, 'wingL', P.wingL.max * 1.2, 'gun');
  ok(p.dying && p.mode === 'wing' && p.lost.wingL, `a wing that has taken all it can comes off and the aircraft spins down (${p.mode})`);
}
{
  const p = mk(); hitPlanePart(world, null, p, 'tail', planeParts(p).tail.max * 1.2, 'gun');
  ok(p.dying && p.lost.tail, `the tail shot off: it falls (${p.mode})`);
}
{
  const p = mk(); hitPlanePart(world, null, p, 'pilot', planeParts(p).pilot.max * 1.5, 'gun');
  ok(p.dying && p.mode === 'dive', 'a pilot killed: the aircraft dives on');
}
{
  const p = mk(); hitPlanePart(world, null, p, 'body', planeParts(p).body.max * 1.2, 'gun');
  ok(p.dying && p.mode === 'explode', 'the fuselage broken up: the aircraft breaks apart');
}
{
  // a hurt wing: it flies, worse
  const p = mk(), P = planeParts(p);
  hitPlanePart(world, null, p, 'wingL', P.wingL.max * 0.6, 'gun');
  ok(!p.dying && p.fd.lift < 1 && p.fd.roll < 1 && p.fd.bias > 0 || p.fd.bias < 0, `a wing half gone is not lost: lift ${p.fd.lift.toFixed(2)}, roll ${p.fd.roll.toFixed(2)}, drops ${p.fd.bias.toFixed(2)} rad/s`);
  ok(planeCondition(p) < 1 && p.cond < 1, `and the aircraft is worth less to its pilot (${p.cond.toFixed(2)}): it will go home`);
  // the roll it can make is slower
  const q = mk(); q.heading = 0;
  const bank = (a) => { for (let i = 0; i < 10; i++) guide(a, 0.1, 0.8, 0, 80, {}); return Math.abs(a.bank); };
  const b0 = bank(q), b1 = bank(Object.assign(mk(), { fd: p.fd }));
  ok(b1 < b0, `rolled into a turn, the hurt aircraft banks less in a second (${b1.toFixed(2)} against ${b0.toFixed(2)} rad)`);
}
{
  // a holed fuel tank burns; the fire burns the airframe out, or goes out
  let burnt = 0, out = 0, fell = 0;
  for (let i = 0; i < 60; i++) {
    const p = mk(), P = planeParts(p);
    hitPlanePart(world, null, p, 'fuel', P.fuel.max * 0.8, 'gun');
    if (p.fire > 0) burnt++;
    for (let t = 0; t < 600 && !p.dying; t++) tickPlaneDamage(world, p, 0.1);
    if (p.dying) fell++; else if (p.fireOut) out++;
  }
  ok(burnt > 25 && fell > 10 && out > 3, `a holed tank burns (${burnt} of 60); the fire brings ${fell} down and goes out in ${out}`);
}
{
  // the controls shot away: it goes out of control a few seconds later
  const p = mk(); hitPlanePart(world, null, p, 'ctl', planeParts(p).ctl.max * 1.5, 'gun');
  ok(!p.dying && p.ctlOut > 0, 'with the controls gone it still flies for a moment');
  for (let t = 0; t < 100 && !p.dying; t++) tickPlaneDamage(world, p, 0.1);
  ok(p.dying, 'then it is out of control');
}
{
  // on the deck or the ground it is mended
  const p = mk(), P = planeParts(p);
  hitPlanePart(world, null, p, 'wingR', P.wingR.max * 0.7, 'gun');
  P.fuel.hp = 0.1; p.fire = 0.5;
  repairPlane(p);
  ok(p.fire === 0 && planeCondition(p) > 0.7 && p.fd.lift > 0.9, 'a hurt aircraft repaired on the deck flies as before');
}
{
  // a heavy bomber takes much more than a fighter
  const hits = (key) => { let n = 0; for (let i = 0; i < 120; i++) { const p = mk(key); let h = 0; while (!p.dying && h < 200) { hitPlane(world, null, p, 0.5, 12.7, 'gun'); h++; } n += h; } return n / 120; };
  const f = hits('a6m'), b = hits('b17');
  ok(b > f * 2, `a B-17 takes ${b.toFixed(0)} hits of 12.7 mm to bring down, a Zero ${f.toFixed(0)}`);
}
console.log(fail ? `${fail} failed` : 'all passed');
