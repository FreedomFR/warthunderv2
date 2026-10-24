// Where an aircraft lands: node test/landing.mjs
// It lands wherever it can: an aircraft of a field comes down on a nearer carrier, a carrier aircraft whose deck is wrecked goes to a field, a land-based bomber never goes to a carrier,
// a carrier that is full takes nobody more, and a field has far more places than a carrier hangar's worth of the same area.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { carrierCapable } from '../js/game/sim/landing.js';
import { PLANES } from '../js/game/model/planes.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const NAT = ['USA', 'Japan'];

function arena(carrierDx = -14000) {
  const seed = 3, w = new World(seed); w.addTeam(0); w.addTeam(1);
  const sep = 12000, starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: NAT[i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 1, starts });
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0), L = af.layout;
  const cv = w.addShip('essex', 0, L.x + carrierDx, L.z + 3000, 0); cv.controller = null; cv.cmd.throttle = 0; cv.speed = 0;
  const en = w.addShip('kagero', 1, L.x + 30000, L.z, 0); en.controller = null; en.cmd.throttle = 0;
  for (const b of w.bases) if (b.team === 1) for (const q of b.parked) if (q) q.svc = 1e9;
  w.start();
  return { w, af, cv, L };
}
/** Put a parked aircraft of the field in the air on its way home, `d` metres short of the carrier. */
function sendHome(w, p, cv, d) {
  p.ground = false; p.phase = 'return'; p.leg = null; p.hidden = false; p.gearDown = false;
  p.x = cv.x - d; p.z = cv.z; p.y = 800; p.heading = Math.PI / 2; p.speed = 100; p.vx = 100; p.vz = 0; p.vy = 0; p.fuel = 1500; p.wave = null; p.eng = null; p.pitch = 0;
}

ok(carrierCapable({ spec: PLANES.sbd }) && carrierCapable({ spec: PLANES.f6f }) && carrierCapable({ spec: PLANES.tbf }), 'carrier aircraft can land on a deck');
{
  // an aircraft of the field that has a nearer carrier lands on it, and becomes part of its air group
  const { w, af, cv } = arena();
  const f = af.parked.find((p) => p && p.fighter && carrierCapable(p)) || af.parked.find((p) => p && p.fighter);
  if (!carrierCapable(f)) { f.typeKey = 'f6f'; f.spec = PLANES.f6f; }      // (a field may fly only land-based types: lend it a Hellcat)
  sendHome(w, f, cv, 6000);
  const n0 = cv.air.fReady + cv.air.servicing.length;
  for (let i = 0; i < 7000 && !f.landedAt; i++) { w.update(0.1); w.drainEvents(); }
  for (let i = 0; i < 100; i++) { w.update(0.1); w.drainEvents(); }
  ok(f.landedAt && f.owner === cv && !f.base, `a fighter of the field that is 6 km from a carrier and 14 km from home lands on the carrier (phase ${f.phase})`);
  ok(cv.air.servicing.length >= 1 || cv.air.fReady + cv.air.servicing.length > n0 - 6, 'and is serviced there, in the air group of the carrier');
}
{
  // a land-based bomber has no hook: it goes home to its field
  const { w, af, cv } = arena();
  const b = af.parked.find((p) => p && p.spec.engines);
  sendHome(w, b, cv, 3000);
  let onShip = false;
  for (let i = 0; i < 1500; i++) { w.update(0.1); w.drainEvents(); if (!b.base || b.owner === cv) onShip = true; }
  ok(!onShip && b.base === af, `a bomber of the field keeps for its own field even with a carrier 3 km off (${b.phase})`);
}
{
  // a carrier aircraft whose carrier has lost its deck lands on the field
  const { w, af, cv } = arena(-9000);
  cv.cmd.air.launch = true;
  let p = null;
  for (let i = 0; i < 5000 && !p; i++) { w.update(0.1); w.drainEvents(); p = w.planes.find((q) => q.owner === cv && q.kind === 'dive' && q.phase === 'cruise'); }
  cv.deckWrecked = true; p.phase = 'return'; p.siteT = 0;
  let ditched = false;
  for (let i = 0; i < 9000 && !p.landedAt && !p.dying; i++) { w.update(0.1); w.drainEvents(); if (p.phase === 'ditch') ditched = true; }
  for (let i = 0; i < 300; i++) { w.update(0.1); w.drainEvents(); }
  ok(p.landedAt && p.base === af && !ditched, `a dive bomber whose carrier is wrecked lands on the airfield instead of ditching (${p.phase})`);
  ok(af.parked[p.slot] === p && af.groundPlanes().includes(p), 'and takes a place on the apron, among the aircraft of the field');
}
{
  // a carrier that is full takes nobody more
  const { w, af, cv } = arena();
  cv.air.ready = cv.stats.air.capacity; cv.air.fReady = 0;
  const f = af.parked.find((p) => p && p.fighter);
  sendHome(w, f, cv, 6000);
  for (let i = 0; i < 400; i++) { w.update(0.1); w.drainEvents(); }
  ok(f.base === af && f.owner !== cv, 'a carrier whose air group is at its capacity does not take another aircraft in: the fighter goes to its field');
}
{
  const { af, cv } = arena();
  ok(af.layout.slots.length >= 30 && af.layout.slots.length > cv.stats.air.capacity * 0.3, `an airfield has ${af.layout.slots.length} places on its apron`);
}
console.log(fail ? `${fail} FAILED` : 'ALL OK');
