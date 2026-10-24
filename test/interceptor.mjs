// The interceptors of an airfield: node test/interceptor.mjs
// A nation that has an interceptor keeps a third of the fighters of its fields as such; they go up first and farthest when enemy aircraft are seen within reach, fly at the raid
// (not into a circle over the field like the patrol) and prefer the bombers to the fighters. The roster of the test lends the type of the fighters as the interceptor.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { ROSTER_BASE, planeTypeFor } from '../js/game/model/planes.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const saved = ROSTER_BASE.USA;
ROSTER_BASE.USA = { ...(saved || {}), interceptor: ['p40'] };
ok(planeTypeFor('USA', 'interceptor', 'x', 'base') === 'p40' && planeTypeFor('Japan', 'interceptor', 'x', 'base') === undefined, 'the roster knows the interceptors of a nation, and a nation without one has none');

const results = [];
for (const seed of [3, 4, 5]) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const starts = [teamStart(0, 2, 26000), teamStart(1, 2, 26000)].map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], 21000, { bases: 1, starts });
  w.start();
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  const mine = w.planes.filter((p) => p.base === af && p.fighter);
  const ints = mine.filter((p) => p.interceptor);
  const r = { seed, fighters: mine.length, ints: ints.length, typesOk: ints.every((p) => p.typeKey === 'p40'), scrambled: 0, far: 0, bomberPrey: 0, fighterPrey: 0 };
  const seen = new Set();
  for (let t = 0; t < 1500; t += 0.1) {
    w.update(0.1); w.drainEvents();
    for (const p of ints) {
      if (p.phase === 'intercept' && !seen.has(p.id)) { seen.add(p.id); r.scrambled++; }
      if (p.phase === 'intercept' && Math.hypot(p.x - af.layout.x, p.z - af.layout.z) > 9000) r.far++;
      if (p.phase === 'engage' && p.prey) { if (p.prey.fighter) r.fighterPrey++; else r.bomberPrey++; }
    }
  }
  results.push(r);
}
const tot = (k) => results.reduce((a, r) => a + r[k], 0);
ok(results.every((r) => r.ints > 0 && r.ints < r.fighters && r.typesOk), `a third of the fighters of a field are interceptors (${results.map((r) => r.ints + '/' + r.fighters).join(', ')})`);
ok(tot('scrambled') >= 1, `the interceptors go up when enemy aircraft are seen (${tot('scrambled')} over ${results.length} battles)`);
ok(tot('far') > 0, 'an interceptor flies out to meet the raid, well beyond the circle of a patrol (more than 9 km from its field)');
ok(tot('bomberPrey') >= tot('fighterPrey') || tot('bomberPrey') + tot('fighterPrey') === 0, `an interceptor goes for the bombers first (${tot('bomberPrey')} ticks on a bomber, ${tot('fighterPrey')} on a fighter)`);
ROSTER_BASE.USA = saved;
if (!saved) delete ROSTER_BASE.USA;
if (fail) process.exit(1);
