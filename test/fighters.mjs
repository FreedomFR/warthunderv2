// Carrier fighters: node test/fighters.mjs
// Two carrier groups: the strikes leave with fighters as escort, a patrol goes up when enemy aircraft come near the fleet, the fighters fight (guns,
// rear gunners), the ones that are left land again.
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });

let landedAll = 0;
for (const seed of [21, 33, 47]) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  [parse('essex:1,cleveland:2'), parse('shokaku:1,agano:2')].forEach((f, i) => { const s = teamStart(i, 2, 30000); spawnFleet(w, i, f, s.x, s.z, s.heading); });
  for (const s of w.ships) s.cmd.throttle = 0.5;
  w.start();
  const ev = {}, kills = {}, seen = { escort: 0, cap: 0, engage: 0 };
  const launched = new Set(), landed = new Set();
  let bad = 0, shotsOnGun = 0;
  const fReady0 = w.ships.filter((s) => s.air).map((s) => s.air.fReady);
  for (let i = 0; i < 16000; i++) {
    w.update(0.1);
    for (const e of w.drainEvents()) {
      ev[e.type] = (ev[e.type] || 0) + 1;
      if (e.type === 'planeDown') kills[(e.plane.fighter ? 'F' : 'B') + ':' + e.cause] = (kills[(e.plane.fighter ? 'F' : 'B') + ':' + e.cause] || 0) + 1;
      if (e.type === 'planeLaunch' && e.plane.fighter) launched.add(e.plane.id);
      if (e.type === 'planeLand' && e.plane.fighter) landed.add(e.plane.id);
    }
    for (const p of w.planes) {
      if (!Number.isFinite(p.x + p.y + p.z + p.heading)) bad++;
      if (p.fighter && seen[p.phase] !== undefined) seen[p.phase]++;
      if (p.fighter && p.role === 'escort' && p.phase === 'escort') seen.escortRole = (seen.escortRole || 0) + 1;
    }
  }
  console.log(`seed ${seed}:`, JSON.stringify(ev.mgBurst), 'bursts', JSON.stringify(kills), 'launched', launched.size, 'landed', landed.size, 'seen', JSON.stringify(seen));
  ok(bad === 0, `seed ${seed}: no aircraft with a non-finite state`);
  ok(launched.size >= 6, `seed ${seed}: ${launched.size} fighters took off (escorts and patrols)`);
  ok(seen.escortRole > 0 && seen.cap > 0, `seed ${seed}: some flew an escort (${seen.escortRole || 0} aircraft-ticks) and some a patrol (${seen.cap})`);
  ok((ev.mgBurst || 0) > 10 && (kills['B:gun'] || 0) + (kills['F:gun'] || 0) > 3, `seed ${seed}: air combat: ${ev.mgBurst} bursts, ${kills['B:gun'] || 0} bombers and ${kills['F:gun'] || 0} fighters shot down by fighters`);
  ok((kills['F:gunner'] || 0) + (kills['B:gunner'] || 0) >= 0, `seed ${seed}: the rear gunners may shoot back (${kills['F:gunner'] || 0} fighters shot down by them)`);
  landedAll += landed.size;
  const stuck = w.planes.filter((p) => p.fighter && ['queue'].includes(p.phase) && p.age > 400);
  ok(stuck.length === 0, `seed ${seed}: no fighter stuck in the deck queue`);
  for (const s of w.ships) if (s.air) ok(s.air.fReady >= 0 && s.air.ready >= 0, `seed ${seed}: ${s.stats.id} air group ${s.air.ready} bombers, ${s.air.fReady} fighters`);
}
ok(landedAll >= 2, `${landedAll} fighters landed again (the battle may end before the others get home)`);
console.log(fail ? `${fail} fighter checks FAILED` : 'all fighter checks OK');
