// The traffic of the runways of the island airfields: intervals between two take-offs and two landings, the closest two aircraft got, go-arounds.  node tools/traffic.mjs [seeds=4] [secs=1800] [first seed=1]
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { teamStart } from '../js/game/sim/formation.js';
const NAT = ['USA', 'Japan'], SEEDS = +(process.argv[2] || 4), SECS = +(process.argv[3] || 1800);
const T = { takeoffs: [], landings: [], minD: [], goArounds: 0, crashes: 0, planes: 0, landed: 0 };
const S0 = +(process.argv[4] || 1);
for (let seed = S0; seed < S0 + SEEDS; seed++) {
  const w = new World(seed); w.addTeam(0); w.addTeam(1);
  const sep = 12000, starts = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: NAT[i] }));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 1, starts });
  const af = w.bases.find((b) => b.layout.kind === 'airfield' && b.team === 0);
  const still = (sh) => { sh.controller = null; sh.cmd.throttle = 0; for (const a of sh.aaMounts) a.ammo = 0; return sh; };      // (the enemy ship does not shoot at the aircraft: they all come back)
  still(w.addShip('kagero', 1, af.layout.x + Math.cos(0.7) * 22000, af.layout.z + Math.sin(0.7) * 22000, 0)); still(w.addShip('fletcher', 0, af.layout.x - 20000, af.layout.z, 0));
  for (const b of w.bases) if (b.team === 1) for (const q of b.parked) if (q) q.svc = 1e9;
  w.start();
  const lastTO = new Map(), lastLand = new Map(), seen = new Set(), phase = new Map();
  let minD = 1e9;
  while (w.time < SECS) {
    w.update(0.1);
    if (w.state === 'finished') { w.state = 'running'; w.finishT = 0; }
    for (const e of w.drainEvents()) {
      if (e.type === 'planeLaunch' && e.plane.base) { const b = e.plane.base; if (lastTO.has(b)) T.takeoffs.push(w.time - lastTO.get(b)); lastTO.set(b, w.time); T.planes++; }
    }
    const air = w.planes.filter((p) => p.base && !p.dying && !p.gone && !p.hidden);
    for (const p of air) {
      const prev = phase.get(p);
      if (prev !== p.phase) {
        if (p.phase === 'lroll') { T.landed++; const b = p.base; if (lastLand.has(b)) T.landings.push(w.time - lastLand.get(b)); lastLand.set(b, w.time); }
        if (p.phase === 'goaround') T.goArounds++;
        phase.set(p, p.phase);
      }
    }
    // closest approach of two aircraft of the same field that are both on the runway or low over it
    for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
      const a = air[i], b = air[j];
      if (a.base !== b.base || !(['groundRun', 'lroll', 'lfinal', 'climb', 'lineup'].includes(a.phase) && ['groundRun', 'lroll', 'lfinal', 'climb', 'lineup'].includes(b.phase))) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); if (d < minD) minD = d;
    }
  }
  T.minD.push(minD);
}
const mean = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
const near = (a) => a.filter((x) => x < 120);
console.log(`take-offs: ${T.planes}, interval on one field: mean ${mean(near(T.takeoffs))} s (n ${near(T.takeoffs).length}); landings: ${T.landed}, interval mean ${mean(near(T.landings))} s (n ${near(T.landings).length}); go-arounds ${T.goArounds}; closest two aircraft on or over a runway (m) per seed: ${T.minD.map((x) => x.toFixed(0)).join(' ')}`);
