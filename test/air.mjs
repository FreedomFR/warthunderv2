// Air operations check: carriers launch strike waves, aircraft attack, are shot down or land again.
//   node test/air.mjs [seconds] [seed]
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

const secs = Number(process.argv[2] || 900), seed = Number(process.argv[3] || 11);
const w = new World(seed);
w.addTeam(0); w.addTeam(1);
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
[parse('essex:1,cleveland:2,fletcher:3'), parse('shokaku:1,agano:2,kagero:3')].forEach((f, i) => { const s = teamStart(i, 2, 12000); spawnFleet(w, i, f, s.x, s.z, s.heading); });
for (const s of w.ships) s.cmd.throttle = 0.7;
w.start();
const counts = {};
let t = 0, maxPlanes = 0, bad = 0;
while (t < secs && w.state !== 'finished') {
  w.update(0.1); t += 0.1;
  for (const e of w.drainEvents()) counts[e.type] = (counts[e.type] || 0) + 1;
  maxPlanes = Math.max(maxPlanes, w.planes.length);
  for (const p of w.planes) if (!isFinite(p.x + p.y + p.z + p.heading + p.pitch + p.bank)) bad++;
  if (Math.abs(t % 100) < 0.05) console.log(Math.round(t), 'planes', w.planes.length, 'bombs', w.bombs.length, 'torp', w.torpedoes.length, 'debris', w.debris.length, JSON.stringify(counts));
}
for (const s of w.ships) if (s.air) console.log(s.name, 'air', JSON.stringify(s.air), 'lost', s.lostPlanes, 'state', s.state, 'cause', s.cause, 'water', Math.round(s.waterFill * 100), 'parked', s.parked);
for (const s of w.ships) if (s.planeKills) console.log(s.name, 'plane kills', s.planeKills);
for (const k of w.kills) console.log('kill', Math.round(k.t), k.victim.name, 'by', k.killer && k.killer.name, k.cause);
console.log('max planes in the air', maxPlanes, 'non-finite plane states', bad);
if (bad) process.exit(1);
