// How many hits of each kind of round it takes to bring down each aircraft (against the published anchors: about 35 .50 API hits for an American fighter, 11 Hispano hits, 100 or more rifle-calibre
// ones; a four-engined bomber three to four times as many): node tools/hitstokill.mjs [trials=200]
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { hitPlane } from '../js/game/sim/planedamage.js';
import { AMMO, BELTS, UNIT, beltMean } from '../js/game/data/airguns.js';
const N = +(process.argv[2] || 200);
const rows = [];
for (const nat of ['USA', 'Japan', 'Germany']) {
  const seed = 3, w = new World(seed); w.addTeam(0); w.addTeam(1);
  const starts = [teamStart(0, 2, 12000), teamStart(1, 2, 12000)].map((q, i) => ({ ...q, nation: [nat, 'Japan'][i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], 17000, { bases: 1, starts });
  w.start();
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  const types = [...new Set(af.parked.filter(Boolean).map((p) => p.typeKey))];
  for (const t of types) {
    const proto = af.parked.find((p) => p && p.typeKey === t);
    for (const [name, a] of [['.303 inc', AMMO.inc303], ['7,7 ball', AMMO.ball303], ['.50 API', AMMO.api50], ['.50 ball', AMMO.ball50], ['13 mm MG131', AMMO.mg131], ['20 Type 99 HE-I', AMMO.hei20t99a], ['20 MG FF', AMMO.hei20ff], ['20 Minengesch.', AMMO.mine20], ['20 Hispano HEI', AMMO.hei20hs], ['20 AP-T', AMMO.ap20]]) {
      let tot = 0, fires = 0;
      for (let k = 0; k < N; k++) {
        // a fresh aircraft: the parts and the state of the parked one, in the air
        const p = { ...proto, parts: null, dying: false, fire: 0, fireOut: false, ctlOut: null, lost: { wingL: false, wingR: false, tail: false, engine: false }, smoke: 0, ground: false, base: null, phase: 'cruise', owner: null, x: 0, y: 800, z: 0, heading: 0, cond: 1, fd: null };
        const w2 = w; w2.events.length = 0; w2.debris.length = 0;
        let hits = 0;
        while (!p.dying && hits < 4000) { { w2.events.length = 0; hitPlane(w2, null, p, UNIT * a.dmg * (0.8 + 0.4 * w.rng()), a.cal, 'gun', a); hits++; }}
        tot += hits; if (p.cause === 'fire') fires++;
      }
      rows.push({ plane: t, ammo: name, hits: tot / N, fire: fires / N });
    }
  }
}
const planes = [...new Set(rows.map((r) => r.plane))], ammos = [...new Set(rows.map((r) => r.ammo))];
console.log('hits to bring down'.padEnd(18), planes.map((p) => p.padStart(8)).join(''));
for (const a of ammos) console.log(a.padEnd(18), planes.map((p) => { const r = rows.find((x) => x.plane === p && x.ammo === a); return (r.hits >= 4000 ? '>4000' : r.hits.toFixed(0)).padStart(8); }).join(''));
