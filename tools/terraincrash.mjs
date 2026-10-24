// How many aircraft fly into the ground that were not shot down: node tools/terraincrash.mjs [secs=7200] [seed=3] [nations=USA,Japan]
// A war is run without a camera; every aircraft that hits an island while it is whole (not on fire, not falling) is counted, by phase and by type.
import { World } from '../js/game/sim/world.js';
import { buildTheatre } from '../js/game/sim/theatre.js';
const SECS = Number(process.argv[2] || 7200), SEED = Number(process.argv[3] || 3), NAT = (process.argv[4] || 'USA,Japan').split(',');
const w = new World(SEED); buildTheatre(w, SEED, { only: NAT }); w.start();
const crashes = [], seen = new Set(); let flew = 0;
while (w.time < SECS && w.state !== 'finished') {
  w.update(0.5);
  for (const e of w.drainEvents()) {
    if (e.type === 'planeLaunch' && !seen.has(e.plane.id)) { seen.add(e.plane.id); flew++; }
    if (e.type === 'planeCrash' && e.land && e.plane && !e.plane.dying) crashes.push({ t: w.time, type: e.plane.typeKey, phase: e.plane.phase, y: Math.round(e.plane.y), gh: Math.round(e.y), v: Math.round(e.plane.speed), age: Math.round(e.plane.age ?? 0), ship: e.plane.owner && e.plane.owner.name, dock: !!(e.plane.owner && e.plane.owner.dock), mission: !!(e.plane.owner && e.plane.owner.mission), sv: e.plane.owner && Math.round(e.plane.owner.speed) });
  }
}
const by = {}; for (const c of crashes) by[`${c.type}/${c.phase}`] = (by[`${c.type}/${c.phase}`] || 0) + 1;
if (process.env.DETAIL) for (const c of crashes) console.log(JSON.stringify(c));
console.log(`${flew} aircraft launched, ${crashes.length} flew into an island whole in ${w.time.toFixed(0)} s:`, JSON.stringify(by));
