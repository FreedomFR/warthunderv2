// Holes blown in the plating: node test/holes.mjs — which scars become holes, the holes of a damaged part, the scrap a burst throws out, and that none of it moves the dice of the battle.
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { ShipVisuals } from '../js/game/render/shipVisual.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const mk = (seed) => { const w = new World(seed); w.addTeam(0); w.addTeam(1); const [a] = spawnFleet(w, 0, [{ id: 'iowa', count: 1 }], 0, 0, Math.PI / 2); spawnFleet(w, 1, [{ id: 'fletcher', count: 1 }], 0, 30000, 0); w.start(); return { w, a }; };
const holesOf = (ship) => ShipVisuals.prototype.holesOf.call({}, ship);

{
  const { w, a } = mk(7);
  ok(holesOf(a) === null, 'a ship with no scar has no hole');
  a.addScar(10, 5, 8, 0, 0, 1, 1.4, 1);       // a burst
  a.addScar(-10, 4, 8, 0, 0, 1, 0.3, 1);      // a small splinter mark
  a.addScar(20, 4, 8, 0, 0, 1, 1.0, 0);       // a ricochet
  const h = holesOf(a);
  ok(h && h.n === 1, `only the burst opens a hole (${h ? h.n : 0})`);
  ok(h && h.list[3] > 1.4 && h.list[3] <= 3.4, `its radius is a little more than the scar (${h ? h.list[3].toFixed(2) : '-'} m, never more than 3.4 m)`);
  ok(a.scars[0]._hole === true && a.scars[1]._hole === false && a.scars[2]._hole === false, 'the scars that became holes are not drawn as decals as well');
  const again = holesOf(a);
  ok(again === h, 'the holes are not rebuilt while nothing changes');
  a.partState[0] = 1;
  const h2 = holesOf(a);
  ok(h2 && h2.n === 1 + 3, `a damaged part is riddled with three holes of its own (${h2 ? h2.n : 0})`);
  a.partState[0] = 2;
  ok(holesOf(a).n === 1, 'a part that is gone has none (its ruin is drawn)');
  for (let i = 0; i < 70; i++) a.addScar(i * 0.5, 5, 8, 0, 0, 1, 1.0, 1);
  ok(holesOf(a).n <= 54, `at most as many holes as scars a ship keeps (${holesOf(a).n})`);
}

// scrap thrown out by a burst, with a stream of random numbers of its own: the battle goes on as before
{
  const A = mk(11), B = mk(11);
  const d0 = A.w.debris.length;
  A.a.addScar(10, 5, 8, 0, 0, 1, 1.6, 1);
  B.a.addScar(10, 5, 8, 0, 0, 1, 0.3, 1);      // the same call that throws nothing
  ok(A.w.debris.length > d0 && A.w.debris.every((q) => Number.isFinite(q.x) && Number.isFinite(q.vy)), `a burst throws scrap (${A.w.debris.length - d0} pieces)`);
  ok(A.w.rng() === B.w.rng(), 'and the dice of the battle are not touched');
  const n = A.w.debris.length;
  A.a.addScar(10, 5, 8, 0, 0, 1, 0.3, 1);
  ok(A.w.debris.length === n, 'a splinter mark throws nothing');
}
