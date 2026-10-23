// Where an aircraft smokes and burns: node test/damagesites.mjs — the sites lie on the aircraft, a hit engine of a multi-engine aircraft is one engine, smoke and fire have a place.
import { PLANES, damageSites } from '../js/game/model/planes.js';
import { hitPlane, hitPlanePart } from '../js/game/sim/planedamage.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
let off = [];
for (const [k, s] of Object.entries(PLANES)) {
  const D = damageSites(s), pts = [...D.engines, D.wings.L, D.wings.R, D.tail];
  for (const q of pts) if (Math.abs(q.x) > s.L * 0.6 || Math.abs(q.z) > s.span * 0.5 || Math.abs(q.y) > 4) off.push(k);
  if (D.engines.length !== (s.engines ? s.engines.length : 1)) off.push(k + ' engines');
  if (!(D.wings.L.z < 0 && D.wings.R.z > 0)) off.push(k + ' wings');
}
ok(!off.length, `the places of fire lie on every aircraft, one engine site per engine (${off.join(', ') || 'none off'})`);

const rng = (() => { let x = 5; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
const world = { rng, events: [], debris: [], planes: [], ships: [], addSeaFire() {} };
const mk = (key) => { const spec = PLANES[key]; return { typeKey: key, spec, cond: 1, phase: 'cruise', lost: { wingL: false, wingR: false, tail: false, engine: false }, smoke: 0, fire: 0, x: 0, y: 800, z: 0, vx: 0, vy: 0, vz: -50, speed: 50, heading: 0, pitch: 0, bank: 0, dying: false, ordnance: false }; };
// an aircraft hit again and again smokes from a place on it, and burns from an engine or the root of a wing (its fuel): the parts it can lose are the ones that smoke and burn
{
  let smoked = 0, burned = 0, bad = 0;
  for (let i = 0; i < 300; i++) {
    const q = mk('b17'); world.events.length = 0;
    for (let h = 0; h < 40 && !q.dying; h++) hitPlane(world, null, q, 0.2, 12.7, 'gun');
    if (q.dying) continue;      // (one that is falling smokes and burns from where it is: no site)
    if (q.smoke > 0) { smoked++; if (!(q.smokeSite && q.smokeSite.x > -20)) bad++; }
    if (q.fire > 0) { burned++; if (!(q.fireSite && Math.abs(q.fireSite.x) < PLANES.b17.L * 0.6 && (q.fireSite.eng >= 0 ? q.engFire && q.engFire[q.fireSite.eng] > 0 : true))) bad++; }
  }
  ok(smoked > 20 && burned > 0 && bad === 0, `a bomber that has taken damage smokes from a place on it (${smoked} that were still flying), and some burn from an engine, the root of a wing or the fuselage tank (${burned}); ${bad} with the site off the aircraft`);
}
// many lucky hits on the engines: one engine at a time, the aircraft is not left with no engine at the first
{
  let ones = 0, trials = 0;
  for (let i = 0; i < 400; i++) {
    const q = mk('b17'); world.events.length = 0;
    for (let h = 0; h < 80 && !q.lost.engines && !q.dying; h++) hitPlanePart(world, null, q, 'eng', 0.3, 'gun');
    if (q.lost.engines) { trials++; if (q.lost.engines.filter(Boolean).length === 1 && !q.lost.engine) ones++; }
  }
  ok(trials > 10 && ones === trials, `a hit on the engines of a B-17 puts out one of the four, not all (${ones} of ${trials})`);
}
{
  let lost = 0, ok0 = 0;
  for (let i = 0; i < 400; i++) {
    const t = mk('sbd'); world.events.length = 0;
    for (let h = 0; h < 200 && !t.lost.engine && !t.dying; h++) hitPlanePart(world, null, t, 'eng', 0.06, 'gun');
    if (t.lost.engine) { lost++; if (t.smokeSite && t.smokeSite.eng === 0) ok0++; }
  }
  ok(lost > 10 && ok0 === lost, `the single engine of a dive bomber, when it is hit, is lost and smokes from the nose (${ok0} of ${lost})`);
}
