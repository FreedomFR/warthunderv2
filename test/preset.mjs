// Run a preset scenario headless: node test/preset.mjs <presetId> [seconds] [seed]
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { PRESETS } from '../js/game/scenarios.js';

const preset = PRESETS.find((p) => p.id === process.argv[2]);
if (!preset) { console.log('presets:', PRESETS.map((p) => p.id).join(', ')); process.exit(1); }
const secs = Number(process.argv[3] || 2400), seed = Number(process.argv[4] || 3);
const w = new World(seed);
preset.teams.forEach((t, i) => {
  w.addTeam(i, t.name);
  const s = teamStart(i, preset.teams.length, Number(process.env.SEP || 12000));
  spawnFleet(w, i, t.entries, s.x, s.z, s.heading);
});
for (const s of w.ships) s.cmd.throttle = 0.7;
w.start();
const t0 = performance.now();
let next = 0;
while (w.time < secs && w.state !== 'finished') {
  w.update(0.1); w.drainEvents();
  if (w.time >= next) { next += 120; console.log(String(Math.round(w.time)).padStart(5) + 's', w.teams.map((t, i) => `${t.name}:${w.ships.filter((s) => s.team === i && s.alive).length}`).join('  '), 'shells', w.shells.length, 'torp', w.torpedoes.length, 'planes', w.planes.length); }
}
console.log(`state=${w.state} winner=${w.winner != null ? w.teams[w.winner].name : '-'} t=${w.time.toFixed(0)}s cost ${(performance.now() - t0).toFixed(0)}ms (${((performance.now() - t0) / w.time).toFixed(2)} ms per sim second)`);
for (const k of w.kills) console.log(String(Math.round(k.t)).padStart(5) + 's', k.victim.name, '<-', k.killer ? k.killer.name : '?', `(${k.cause})`);
