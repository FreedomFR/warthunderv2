// The cost of the simulation alone (no browser): node tools/simbench.mjs [scenario] [seconds] [seed] [islands] [bases]
// Runs the battle as the game would at time scale 4 (frames of 1/15 s) and prints the time spent per simulated second and a fingerprint of the
// outcome (the same fingerprint before and after a change = the change did not alter the battle).
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { makeRng, clamp } from '../js/game/math.js';
import { PRESETS as SCENARIOS } from '../js/game/scenarios.js';
import { BY_ID } from '../js/game/data/ships.js';

const [scn = 'allies', secs = '300', seed = '3', islands = '2', bases = '2'] = process.argv.slice(2);
const sc = SCENARIOS.find((s) => s.id === scn);
const sep = sc.sep || 12000;
const w = new World(+seed);
w.rng = makeRng(+seed);
const teams = sc.teams;
teams.forEach((t, i) => { w.addTeam(i, t.name, t.rgb); const s = teamStart(i, teams.length, sep); spawnFleet(w, i, t.entries, s.x, s.z, s.heading); });
const starts = teams.map((_, i) => teamStart(i, teams.length, sep));
const nation = (t) => { const c = {}; for (const e of t.entries) { const n = BY_ID[e.id]?.nation; if (n) c[n] = (c[n] || 0) + (e.count || 1); } return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'USA'; };
w.terrain = Terrain.generate(+seed, +islands, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], clamp(sep * 0.9 + 5000, 9000, 21000),
  { bases: +bases, starts: starts.map((q, i) => ({ x: q.x, z: q.z, nation: nation(teams[i]) })) });
for (const s of w.ships) s.cmd.throttle = 0.7;
w.start();
const t0 = performance.now();
let ev = 0, h = 0;
while (w.time < +secs && w.state !== 'finished') { w.update(4 / 60); const e = w.drainEvents(); ev += e.length; for (const x of e) if (x.type === 'impact') h = (h * 31 + Math.round((x.x || 0) * 10)) | 0; }
const ms = performance.now() - t0;
let fp = h;
for (const s of w.ships) fp = (fp * 31 + Math.round(s.hp * 10) + Math.round(s.x) * 7 + Math.round(s.z) * 13) | 0;
for (const p of w.planes) fp = (fp * 31 + Math.round(p.x)) | 0;
console.log(`${scn} seed ${seed}: ${w.time.toFixed(0)} s simulated in ${(ms / 1000).toFixed(1)} s = ${(ms / w.time).toFixed(2)} ms per sim second; ${ev} events; ships alive ${w.ships.filter((s) => s.alive).length}; planes ${w.planes.length}; fingerprint ${fp}`);
