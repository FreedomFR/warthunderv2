// Headless battle: node test/battle.mjs [seconds] [fleetA] [fleetB] [seed]
//   fleet = comma list of id[:count], e.g. iowa:1,fletcher:2
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

const secs = Number(process.argv[2] || 1500);
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });
const A = parse(process.argv[3] || 'iowa:1,baltimore:1,fletcher:2');
const B = parse(process.argv[4] || 'yamato:1,takao:1,kagero:2');
const seed = Number(process.argv[5] || 7);
const sep = Number(process.env.SEP || 12000);

const w = new World(seed);
w.addTeam(0); w.addTeam(1);
for (const [i, f] of [A, B].entries()) {
  const s = teamStart(i, 2, sep);
  spawnFleet(w, i, f, s.x, s.z, s.heading);
}
for (const s of w.ships) { s.cmd.throttle = 0.7; }
w.start();
const t0 = performance.now();
const dt = 0.1;
let nextReport = 0;
const typeCount = () => [0, 1].map((t) => w.ships.filter((s) => s.team === t && s.alive).map((s) => `${s.stats.id}:${Math.round(s.hpFrac * 100)}%`).join(' '));
while (w.time < secs && w.state !== 'finished') {
  w.update(dt);
  w.drainEvents();
  if (w.time >= nextReport) {
    nextReport += 60;
    const [a, b] = typeCount();
    console.log(String(Math.round(w.time)).padStart(5) + 's  shells', String(w.shells.length).padStart(3), 'torp', w.torpedoes.length, 'planes', w.planes.length, '| A:', a, '| B:', b);
  }
}
const ms = performance.now() - t0;
console.log(`finished state=${w.state} winner=${w.winner} t=${w.time.toFixed(0)}s sim cost ${ms.toFixed(0)} ms (${(ms / w.time).toFixed(2)} ms per sim second)`);
for (const s of w.ships) console.log(s.team, s.name.padEnd(28), s.state.padEnd(8), 'hp', String(Math.round(s.hp)).padStart(6), '/', s.stats.maxHp, 'shots', String(s.shotsFired).padStart(4), 'hits', String(s.shotsHit).padStart(3), 'kills', s.kills, 'dmg', Math.round(s.damageDealt));
