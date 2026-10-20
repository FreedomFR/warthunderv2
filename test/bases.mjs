// Military bases on the islands: node test/bases.mjs — where they are put, how the ground is levelled, who owns them, that a seed gives the same bases.
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
import { scatter } from '../js/game/model/vegetation.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const make = (seed, dens, level = 1, nat = ['USA', 'Japan']) => {
  const sep = 12000, starts = [0, 1].map((i) => ({ ...teamStart(i, 2, sep), nation: nat[i] }));
  const keep = starts.map((q) => ({ x: q.x, z: q.z, r: 4800 }));
  return { T: Terrain.generate(seed, dens, keep, [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: level, starts }), starts };
};

let runs = 0, teamsWithAirfield = 0, teamsWithBattery = 0, teamSlots = 0;
let worstRunway = 0, worstPart = 0, inWater = 0, badOwner = 0, trees = 0, overlap = 0;
for (let seed = 1; seed <= 16; seed++) for (const dens of [1, 2]) {
  const { T, starts } = make(seed, dens, 2);
  runs++;
  for (let t = 0; t < 2; t++) {
    if (T.bases.some((b) => b.team === t && b.kind === 'airfield')) teamsWithAirfield++;
    if (T.bases.some((b) => b.team === t && b.kind === 'battery')) teamsWithBattery++;
  }
  for (const b of T.bases) {
    const is = T.islands.find((q) => q.id === b.island);
    if (b.team !== 0 && b.team !== 1) badOwner++;
    if (b.nation !== ['USA', 'Japan'][b.team]) badOwner++;
    if (is.heightAt(b.x, b.z) < 2) inWater++;
    if (b.kind === 'airfield') {
      const r = b.runway;
      // the runway is level: the ends and the middle are at the height of the pad
      for (const f of [0, 0.25, 0.5, 0.75, 1]) worstRunway = Math.max(worstRunway, Math.abs(is.heightAt(r.x0 + (r.x1 - r.x0) * f, r.z0 + (r.z1 - r.z0) * f) - r.y));
      for (const p of b.parts) worstPart = Math.max(worstPart, Math.abs(is.heightAt(p.x, p.z) - b.y));
      if (b.slots.length >= 12) teamSlots++;
    }
    // no tree on a pad
    const sq = scatter(is, is.x - 1600, is.z - 1600, 3200);
    for (let i = 0; i < sq.length; i += 8) if (is.padAt(sq[i], sq[i + 2]) > 0.2) trees++;
  }
  for (let i = 0; i < T.bases.length; i++) for (let j = i + 1; j < T.bases.length; j++) if (Math.hypot(T.bases[i].x - T.bases[j].x, T.bases[i].z - T.bases[j].z) < 250) overlap++;
}
ok(teamsWithAirfield >= runs * 2 * 0.75, `most teams get an airfield (${teamsWithAirfield} of ${runs * 2})`);
ok(teamsWithBattery >= runs * 2 * 0.8, `and a coastal battery (${teamsWithBattery} of ${runs * 2})`);
ok(badOwner === 0, 'every base belongs to a team and has the nation of its fleet');
ok(inWater === 0, 'no base has its centre in the sea');
ok(worstRunway < 0.6, `the runways are level (worst ${worstRunway.toFixed(2)} m off the pad)`);
ok(worstPart < 1.5, `the buildings stand on the pad (worst ${worstPart.toFixed(2)} m)`);
ok(trees === 0, 'no tree grows on the levelled ground');
ok(overlap === 0, 'no two bases on top of each other');

{
  const a = make(5, 2).T, b = make(5, 2).T, c = make(6, 2).T;
  ok(JSON.stringify(a.bases) === JSON.stringify(b.bases) && a.bases.length > 0, 'the same seed gives the same bases');
  ok(JSON.stringify(a.bases) !== JSON.stringify(c.bases), 'another seed gives other ones');
  ok(make(5, 0).T.bases.length === 0, 'no islands, no bases');
  const none = Terrain.generate(5, 2, [], null, 16000);
  ok(none.bases.length === 0, 'and no bases when none are asked for');
  const f = a.bases.find((x) => x.kind === 'airfield');
  ok(f && f.runway.len >= 700 && f.parts.filter((p) => p.kind === 'hangar').length >= 4 && f.guns.some((g) => g.kind === 'aa') && f.slots.length >= 12, 'an airfield has a runway, hangars, anti-aircraft guns and room for the aircraft');
  const bt = a.bases.find((x) => x.kind === 'battery');
  ok(bt && bt.guns.filter((g) => g.kind === 'coastal').length >= 3 && bt.parts.some((p) => p.kind === 'post'), 'a battery has heavy guns and a fire-control post');
}
