// What keeps a ship afloat and fighting: node test/hull.mjs
// There are no hit points. A hole lets the water in once it is under the waterline; the compartments fill and pass the water on; the ship is lost when she has taken her
// reserve of buoyancy, and then goes down while the guns that are still above the water go on firing; the crew at the stations is lost to bursts, fires and water; a ship with nobody
// left is abandoned and scuttled.
import { World } from '../js/game/sim/world.js';
import { hullHit, SINK_FILL, blastCasualties, crewOf } from '../js/game/sim/hull.js';
import { blast } from '../js/game/sim/modules.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const mk = (id, seed = 3) => { const w = new World(seed); w.addTeam(0); w.addTeam(1); const s = w.addShip(id, 0, 0, 0, 0); const e = w.addShip('iowa', 1, 120000, 0, 0); w.start(); return { w, s, e }; };
const run = (w, secs, f) => { for (let i = 0; i < secs * 10; i++) { w.update(0.1); w.drainEvents(); if (f && f()) break; } };

// ---- no hit points ----
{
  const { s } = mk('cleveland');
  ok(s.hp === undefined && s.stats.crew > 0, `a ship has no hit points (hp ${s.hp}); she has a crew of ${s.stats.crew}`);
}
// ---- a hole above the waterline lets nothing in until the ship is down to it ----
{
  const { w, s } = mk('cleveland');
  hullHit(s, { lx: 0, ly: 6, lz: 3, energy: s.stats.hullStrength * 0.01, cause: 'shell', attacker: null });
  run(w, 60);
  ok(s.holes.length > 0 && s.waterFill < 0.001, `a shell hole six metres over the waterline of a cruiser lets no water in (${s.holes.length} hole, water ${(s.waterFill * 100).toFixed(2)} %)`);
  // the ship settles (heavy with water elsewhere): the same hole is under the water at last
  s.settleCur = 8; s.sinkDepth = 0;
  const f0 = s.floodRate;
  s.update(0.1);
  ok(s.floodRate > f0, 'but it leaks once she has settled down to it');
}
// ---- holes below the waterline: she fills, lists, and is lost at her limit ----
{
  const { w, s } = mk('cleveland');
  const lim = SINK_FILL[s.stats.type];
  for (let i = 0; i < 4; i++) hullHit(s, { lx: -20 + i * 15, ly: -2, lz: 4, energy: s.stats.hullStrength * 0.2, cause: 'torpedo', attacker: null });
  run(w, 400, () => s.state !== 'afloat');
  ok(s.state === 'sinking' && s.cause === 'flood', `four torpedo holes on one side: she takes ${(lim * 100).toFixed(0)} % of the water she can and goes down (${s.state}, ${s.cause})`);
}
// ---- damage control patches a small leak, and she lives ----
{
  const { w, s } = mk('iowa');
  hullHit(s, { lx: 0, ly: -2, lz: 4, energy: s.stats.hullStrength * 0.01, cause: 'torpedo', attacker: null });
  run(w, 600);
  ok(s.state === 'afloat' && s.holes.length === 0, `the damage-control parties patch a small hole in a battleship (${s.holes.length} left, water ${(s.waterFill * 100).toFixed(1)} %)`);
}
// ---- a sinking ship goes on firing ----
{
  const { w, s, e } = mk('iowa');
  s.x = 0; s.z = 0; e.x = 0; e.z = -12000;      // (this one is brought to gun range)
  s.cmd.main.target = e; s.cmd.main.fire = true; s.cmd.sec.fire = true;
  run(w, 25);                                   // (the fire control takes about 15 s to range in on a target first sighted: sim/accuracy.js)
  const shots0 = s.shotsFired;
  s.destroy(null, 'flood');
  run(w, 20);
  ok(s.state === 'sinking' && s.shotsFired > shots0, `a battleship that is going down fires on (${s.shotsFired - shots0} shells after she was lost, ${s.mounts.filter((m) => s.mountUsable(m)).length} mounts still usable)`);
  // when she is far over, or the mounts are under the water, they fall silent
  s.sinkRoll = 1.4; s.roll = 1.4;
  ok(s.mounts.every((m) => !s.mountUsable(m)), 'turned over on her side, none of her guns can be worked');
}
// ... but not one that blew up
{
  const { w, s } = mk('iowa');
  s.exploded = true; s.destroy(null, 'magazine');
  ok(s.mounts.every((m) => !s.mountUsable(m)), 'a ship whose magazine went up has no gun that works');
}
// ---- the crew at the stations ----
{
  const { w, s } = mk('baltimore');
  const m = s.mounts.find((q) => q.group === 'main'), a = s.aaMounts[0];
  ok(crewOf(m) === 1 && s.crewFrac === 1, 'at the start every station has its full crew');
  blast(w, s, a.rec.x, a.rec.y + 1, a.rec.z, 60, 'outside', null, 'shell');
  ok(crewOf(a) < 0.9, `an HE burst on an open AA mount kills its crew (${(crewOf(a) * 100).toFixed(0)} % left)`);
  const tur = s.mounts.find((q) => q.rec.kind === 'turret');
  blast(w, s, tur.rec.x, tur.rec.y + 1.5, tur.rec.z, 60, 'outside', null, 'shell');
  ok(crewOf(tur) > 0.9, `but a turret's crew are safe from a burst on its roof (${(crewOf(tur) * 100).toFixed(0)} % left)`);
  blast(w, s, tur.rec.x, tur.rec.y + 1.5, tur.rec.z, 400, 'inside', null, 'shell');
  ok(crewOf(tur) < 0.6, `a shell that bursts in the turret kills them (${(crewOf(tur) * 100).toFixed(0)} % left)`);
  // a gun with too few people does not fire, and is slow to reload
  tur.crew = tur.crew0 * 0.1;
  ok(!s.mountUsable(tur), 'a mount with a tenth of its crew cannot be worked');
}
// ---- fires kill, the damage-control parties replace ----
{
  const { w, s } = mk('cleveland');
  const m = s.mounts[0];
  s.addFire(m.rec.x, m.rec.y + 1, m.rec.z, 1.2);
  run(w, 30);
  ok(crewOf(m) < 1, `a fire at a mount burns its crew (${(crewOf(m) * 100).toFixed(0)} % left)`);
  s.fires.length = 0;
  m.crew = m.crew0 * 0.5;
  run(w, 120);
  ok(crewOf(m) > 0.7, `then the parties send people to it (${(crewOf(m) * 100).toFixed(0)} % after two minutes)`);
}
// ---- a ship with nobody left is abandoned and scuttled ----
{
  const { w, s } = mk('cleveland');
  for (const q of [...s.mounts, ...s.aaMounts, ...s.modules.filter((x) => x.crew0 != null), ...s.comps]) q.crew = q.crew0 * 0.05;
  run(w, 200, () => s.state !== 'afloat');
  ok(s.state === 'sinking' && s.sinkMode === 'scuttle', `a ship with a twentieth of her crew is abandoned and scuttled (${s.state} ${s.sinkMode}, ${s.cause})`);
}
// ---- a hulk with nothing that works is scuttled after a while ----
{
  const { w, s } = mk('fletcher');
  for (const m of s.mounts) { m.alive = false; m.crew = 0; }
  for (const a of s.aaMounts) { a.alive = false; a.crew = 0; }
  s.torpLeft = 0;
  for (const m of s.modules) if (m.kind === 'engine' || m.kind === 'shaft') { m.state = 2; m.hp = 0; }
  s.updatePropulsion();
  run(w, 400, () => s.state !== 'afloat');
  ok(s.state === 'sinking', `a ship with no gun and no way on is scuttled (${s.state} after ${w.time.toFixed(0)} s)`);
}
// ---- the water kills the people below ----
{
  const { w, s } = mk('cleveland');
  const eng = s.modules.find((m) => m.kind === 'engine');
  const c = s.comps.find((q) => Math.abs(q.xc - eng.x) <= (q.x1 - q.x0) / 2) || s.comps[0];
  c.water[0] = c.water[1] = 0.9;
  run(w, 60);
  ok(crewOf(eng) < 1, `an engine room under the water loses its crew (${(crewOf(eng) * 100).toFixed(0)} % left)`);
}
// ---- structure: two broken, flooded compartments amidships and a long ship breaks her back; a short one does not ----
{
  const { w, s } = mk('iowa', 9);
  const mid = () => { for (const c of s.comps) if (Math.abs(c.xc) < s.stats.L * 0.2) { c.water[0] = c.water[1] = 0.95; c.struct = 1.6; } };
  mid();
  for (let i = 0; i < 1200 && !s.split && s.state === 'afloat'; i++) { mid(); w.update(0.1); w.drainEvents(); }
  ok(!!s.split, 'a long ship whose middle is broken and flooded breaks in two');
}
console.log(fail ? `${fail} failed` : 'all passed');
