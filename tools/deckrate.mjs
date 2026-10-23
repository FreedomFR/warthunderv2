// Launch and landing intervals on a carrier, and the closest two aircraft got on the deck or just behind it: node tools/deckrate.mjs [carrier=essex] [secs=1500] [seeds=3]
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
const id = process.argv[2] || 'essex', SECS = +(process.argv[3] || 1500), SEEDS = +(process.argv[4] || 3);
const L = [], A = [], minD = [];
for (let seed = +(process.env.S0 || 1); seed < +(process.env.S0 || 1) + SEEDS; seed++) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const st = [teamStart(0, 2, 22000), teamStart(1, 2, 22000)];
  spawnFleet(w, 0, [{ id, count: 1 }], st[0].x, st[0].z, st[0].heading); spawnFleet(w, 1, [{ id: 'kagero', count: 1 }], st[1].x, st[1].z, st[1].heading);
  for (const s of w.ships) if (s.team === 1) for (const a of s.aaMounts) a.ammo = 0;
  w.start();
  let lastL = -1, lastA = -1, md = 1e9; const lt = [], at = [];
  while (w.time < SECS) {
    w.update(0.1);
    if (w.state === 'finished') { w.state = 'running'; w.finishT = 0; }
    for (const e of w.drainEvents()) {
      if (e.type === 'planeLaunch' && e.ship && e.ship.stats.id === id) { if (lastL >= 0) lt.push(w.time - lastL); lastL = w.time; }
      if (e.type === 'planeLand' && e.plane.owner && e.plane.owner.stats.id === id) { if (lastA >= 0) at.push(w.time - lastA); lastA = w.time; }
    }
    const on = w.planes.filter((p) => p.owner && p.owner.stats.id === id && !p.dying && !p.hidden && (['takeoff', 'rollout'].includes(p.phase) || (['assemble', 'final', 'pattern'].includes(p.phase) && p.y < 120)));
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) { const d = Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y, on[i].z - on[j].z); if (process.env.DBG && d < 60 && Math.round(w.time * 10) % 10 === 0) console.log(w.time.toFixed(0), d.toFixed(0), on[i].id, on[i].asm, on[i].speed.toFixed(0), on[i].y.toFixed(0), '|', on[j].id, on[j].asm, on[j].speed.toFixed(0), on[j].y.toFixed(0)); if (d < md) { md = d; if (d < 45 && process.env.WHO) console.log(w.time.toFixed(1), d.toFixed(1), on[i].phase, on[i].ds, on[i].typeKey, on[i].id, '|', on[j].phase, on[j].ds, on[j].typeKey, on[j].id); } }
  }
  L.push(...lt); A.push(...at); minD.push(md);
}
const m = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
const near = (a) => a.filter((x) => x < 90);
console.log(`${id}: launch interval mean ${m(near(L))} s (n ${near(L).length}), landing interval mean ${m(near(A))} s (n ${near(A).length}); closest two aircraft on the deck / on the final (m): ${minD.map((x) => x.toFixed(0)).join(' ')}`);
