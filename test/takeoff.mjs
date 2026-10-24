// Take-off from a carrier: an aircraft that leaves the bow must not sink towards the sea (it sagged 12-15 m and skimmed the waves when it
// went down to build the speed of a cruise climb with its flaps still out).  node test/takeoff.mjs
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

for (const id of ['essex', 'enterprise', 'shokaku', 'illustrious', 'graf_zeppelin', 'aquila', 'bearn']) {
  const w = new World(5); w.addTeam(0); w.addTeam(1);
  const st = [teamStart(0, 2, 20000), teamStart(1, 2, 20000)];
  spawnFleet(w, 0, [{ id, count: 1 }], st[0].x, st[0].z, st[0].heading);
  spawnFleet(w, 1, [{ id: 'kagero', count: 1 }], st[1].x, st[1].z, st[1].heading);
  w.start();
  const rec = new Map();
  while (w.time < 150) {
    w.update(0.05); w.drainEvents();
    for (const p of w.planes) {
      if (!p.owner || p.owner.stats.id !== id) continue;
      let r = rec.get(p);
      if (!r && p.phase === 'takeoff') rec.set(p, r = { type: p.typeKey, y0: null, minY: Infinity, t0: 0 });
      if (!r || p.phase !== 'assemble') continue;
      if (r.y0 === null) { r.y0 = p.y; r.t0 = p.age; }
      if (p.age - r.t0 < 20) r.minY = Math.min(r.minY, p.y);
    }
  }
  const done = [...rec.values()].filter((r) => r.y0 !== null);
  let worst = done[0];
  for (const r of done) if (r.y0 - r.minY > worst.y0 - worst.minY) worst = r;
  ok(done.length >= 6, `${id}: ${done.length} aircraft took off`);
  ok(worst.y0 - worst.minY < 4 && worst.minY > 10, `${id}: the worst (${worst.type}) leaves at ${worst.y0.toFixed(1)} m and sinks to ${worst.minY.toFixed(1)} m (${(worst.y0 - worst.minY).toFixed(1)} m)`);
}
console.log(fail ? `${fail} FAILED` : 'ALL OK');
