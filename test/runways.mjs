// The traffic of the runways and the decks: node test/runways.mjs
// An island airfield sends its aircraft down the runway one behind the other (a rolling start, the next one rolling as soon as the one before is far enough ahead and never closing up on it);
// on a carrier the aircraft in the landing circuit and on the final keep their distance, and no two aircraft overlap.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const still = (sh) => { sh.controller = null; sh.cmd.throttle = 0; for (const a of sh.aaMounts) a.ammo = 0; return sh; };      // (the enemy ship does not shoot at the aircraft: they all come back)

// ---- an island airfield ----
{
  const gaps = []; let minD = 1e9, launches = 0;
  for (const seed of [1, 2]) {
    const w = new World(seed); w.addTeam(0); w.addTeam(1);
    const sep = 12000, starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] }));
    w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 1, starts });
    const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
    still(w.addShip('kagero', 1, af.layout.x + Math.cos(0.7) * 22000, af.layout.z + Math.sin(0.7) * 22000, 0)); still(w.addShip('fletcher', 0, af.layout.x - 20000, af.layout.z, 0));
    for (const b of w.bases) if (b.team === 1) for (const q of b.parked) if (q) q.svc = 1e9;
    w.start();
    let last = -1;
    while (w.time < 700) {
      w.update(0.1);
      for (const e of w.drainEvents()) if (e.type === 'planeLaunch' && e.plane.base === af) { if (last >= 0) gaps.push(w.time - last); last = w.time; launches++; }
      const on = w.planes.filter((p) => p.base === af && !p.dying && !p.gone && ['groundRun', 'lineup', 'climb', 'lroll'].includes(p.phase) && (p.y - af._fld?.y || 0) < 60);
      for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) minD = Math.min(minD, Math.hypot(on[i].x - on[j].x, on[i].z - on[j].z));
    }
  }
  const near = gaps.filter((g) => g < 90), mean = near.reduce((a, b) => a + b, 0) / Math.max(1, near.length);
  ok(launches >= 10, `${launches} take-offs from the airfields`);
  ok(mean < 24, `the aircraft take off one after the other, every ${mean.toFixed(1)} s on average (it was 26 s with a stop at the head of the runway)`);
  ok(minD > 40, `and never closer than ${minD.toFixed(0)} m on the runway or just off it`);
}

// ---- a carrier: the circuit, the final, the deck ----
{
  let landedAll = 0, minAll = 1e9;
  for (const seed of [1, 2]) {      // (a whole battle is chaotic: one seed can land 19 aircraft where the next lands 23; the mean of two is what is judged)
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const st = [teamStart(0, 2, 22000), teamStart(1, 2, 22000)];
  spawnFleet(w, 0, [{ id: 'essex', count: 1 }], st[0].x, st[0].z, st[0].heading); spawnFleet(w, 1, [{ id: 'kagero', count: 1 }], st[1].x, st[1].z, st[1].heading);
  for (const s of w.ships) if (s.team === 1) for (const a of s.aaMounts) a.ammo = 0;
  w.start();
  let minD = 1e9, landed = 0, finalPairs = 0;
  while (w.time < 1500) {
    w.update(0.1);
    if (w.state === 'finished') { w.state = 'running'; w.finishT = 0; }
    for (const e of w.drainEvents()) if (e.type === 'planeLand') landed++;
    const on = w.planes.filter((p) => p.owner && p.owner.stats.id === 'essex' && !p.dying && !p.hidden && (['takeoff', 'rollout'].includes(p.phase) || (p.phase === 'final' && p.y < 200)));
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) { const d = Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y, on[i].z - on[j].z); if (d < minD) { minD = d; if (process.env.WHO && d < 12) console.log(w.time.toFixed(1), d.toFixed(1), on[i].phase, on[i].ds, on[i].typeKey, on[i].id, on[i].y.toFixed(0), '|', on[j].phase, on[j].ds, on[j].typeKey, on[j].id, on[j].y.toFixed(0)); } if (on[i].phase === 'final' && on[j].phase === 'final') finalPairs++; }
  }
  landedAll += landed; minAll = Math.min(minAll, minD);
  }
  ok(landedAll >= 40, `${landedAll / 2} aircraft landed on the carrier (mean of two battles)`);
  ok(minAll > 30, `no two aircraft of the final or the deck closer than ${minAll.toFixed(0)} m (they overlapped, 9 m apart, when two came onto the final together)`);
}
process.exit(fail ? 1 : 0);
