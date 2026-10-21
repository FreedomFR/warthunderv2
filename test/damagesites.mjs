// Where an aircraft smokes and burns: node test/damagesites.mjs — the sites lie on the aircraft, a hit engine of a multi-engine aircraft is one engine, smoke and fire have a place.
import { PLANES, damageSites } from '../js/game/model/planes.js';
import { hitPlane } from '../js/game/sim/planedamage.js';

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
const world = { rng, events: [] };
const mk = (key) => { const spec = PLANES[key]; return { typeKey: key, spec, hp: spec.hp, maxHp: spec.hp, phase: 'cruise', lost: { wingL: false, wingR: false, tail: false, engine: false }, smoke: 0, fire: 0, x: 0, y: 800, z: 0, dying: false }; };
const b = mk('b17');
hitPlane(world, null, b, b.maxHp * 0.4, 12.7, 'gun');
ok(b.smoke > 0 && b.smokeSite && b.smokeSite.x > -20, 'a bomber that has taken damage smokes from a place on it');
hitPlane(world, null, b, b.maxHp * 0.3, 12.7, 'gun');
ok(b.fire > 0 && b.fireSite && (b.fireSite.eng >= 0 ? b.engFire && b.engFire[b.fireSite.eng] > 0 : Math.abs(b.fireSite.z) > 1), `then it burns from an engine or the root of a wing (eng ${b.fireSite.eng})`);
// many lucky hits on engines: one engine at a time, the aircraft is not left with no engine at the first
let first = null, ones = 0, trials = 0;
for (let i = 0; i < 400; i++) {
  const q = mk('b17'); world.events.length = 0;
  for (let h = 0; h < 40 && !q.lost.engines; h++) { q.hp = q.maxHp; hitPlane(world, null, q, 0.05, 7.7, 'gun'); }
  if (q.lost.engines) { trials++; if (q.lost.engines.filter(Boolean).length === 1 && !q.lost.engine) ones++; }
}
ok(trials > 20 && ones === trials, `a hit on the engines of a B-17 puts out one of the four, not all (${ones} of ${trials})`);
const t = mk('sbd');
for (let i = 0; i < 400 && !t.lost.engine; i++) { t.hp = t.maxHp; hitPlane(world, null, t, 0.05, 7.7, 'gun'); }
ok(t.lost.engine && t.smokeSite && t.smokeSite.eng === 0, 'the single engine of a dive bomber, when it is hit, is lost and smokes from the nose');
