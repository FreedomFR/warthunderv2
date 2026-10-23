// Random battles: node test/fuzz.mjs [count] — checks for exceptions, NaNs, runaway ships and stuck games.
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { makeRng } from '../js/game/math.js';

const N = Number(process.argv[2] || 20);
const rnd = makeRng(2024);
let bad = 0, stuck = 0;
const stats = { finished: 0, draws: 0, totalTime: 0 };
for (let g = 0; g < N; g++) {
  const w = new World(1000 + g);
  const nTeams = 2 + (rnd() < 0.2 ? rnd.int(1, 2) : 0);
  for (let t = 0; t < nTeams; t++) {
    w.addTeam(t);
    const entries = [];
    const k = rnd.int(1, 5);
    for (let i = 0; i < k; i++) entries.push({ id: rnd.pick(ALL_SHIPS).id, count: rnd.int(1, 2) });
    const s = teamStart(t, nTeams, rnd.range(5000, 20000));
    spawnFleet(w, t, entries, s.x, s.z, s.heading);
  }
  for (const s of w.ships) s.cmd.throttle = 0.7;
  w.start();
  let steps = 0;
  try {
    while (w.time < 2400 && w.state !== 'finished') {
      w.update(0.1); w.drainEvents(); steps++;
      if (steps % 100 === 0) {
        for (const s of w.ships) {
          if (![s.x, s.z, s.heading, s.speed, s.waterFill, s.crewFrac, s.y, s.roll, s.pitch].every(Number.isFinite)) { console.log(`game ${g}: NaN in ${s.name}`); bad++; }
          if (Math.hypot(s.x, s.z) > 60000) { console.log(`game ${g}: ${s.name} ran away (${Math.hypot(s.x, s.z).toFixed(0)} m)`); bad++; }
        }
        for (const sh of w.shells) if (![sh.x, sh.y, sh.z].every(Number.isFinite)) { console.log(`game ${g}: NaN shell`); bad++; w.shells.length = 0; break; }
      }
    }
  } catch (e) { console.log(`game ${g}: EXCEPTION ${e.stack.split('\n').slice(0, 3).join(' | ')}`); bad++; }
  if (w.state === 'finished') { stats.finished++; stats.totalTime += w.time; if (w.winner == null) stats.draws++; } else { stuck++; console.log(`game ${g}: not finished after ${w.time.toFixed(0)} s, alive:`, w.ships.filter((s) => s.alive).map((s) => s.stats.id + '@' + s.team).join(' ')); }
}
console.log(`${N} battles: ${stats.finished} finished (avg ${(stats.totalTime / Math.max(1, stats.finished) / 60).toFixed(1)} min, ${stats.draws} draws), ${stuck} unfinished, ${bad} problems`);
process.exit(bad ? 1 : 0);
