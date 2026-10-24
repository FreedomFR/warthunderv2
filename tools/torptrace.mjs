// What a torpedo bomber does after its drop: node tools/torptrace.mjs [carrier,carrier,...] [secs=700] [seed=1]
// For each torpedo aircraft: the phase it is in at the drop, how long until it turns (the heading change over the 8 s after the drop), its closest approach to the target afterwards,
// and whether it was shot down on the way out.
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';

const carriers = (process.argv[2] || 'essex,shokaku,illustrious,graf_zeppelin,bearn,aquila').split(',');
const SECS = Number(process.argv[3] || 700), SEED = Number(process.argv[4] || 1);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
for (const cv of carriers) {
  const w = new World(SEED); w.addTeam(0); w.addTeam(1);
  spawnFleet(w, 0, [{ id: cv, count: 1 }, { id: 'fletcher', count: 1 }], -20000, 0, Math.PI / 2);
  spawnFleet(w, 1, [{ id: 'iowa', count: 1 }, { id: 'baltimore', count: 1 }, { id: 'fletcher', count: 2 }], 20000, 0, -Math.PI / 2);
  for (const s of w.ships) if (s.team === 1 && s.air) s.air.ready = 0;
  w.start();
  const rec = new Map();
  let typ = '';
  while (w.time < SECS && w.state !== 'finished') {
    w.update(0.1);
    for (const e of w.drainEvents()) {
      if (e.type === 'torpedoDrop' && e.plane.team === 0 && !rec.has(e.plane.id)) { const p = e.plane; rec.set(p.id, { p, t: w.time, h0: p.heading, phase: p.phase, d0: Math.hypot(p.target.x - p.x, p.target.z - p.z), min: 1e9, dh8: null, down: null }); }
      if (e.type === 'planeDown' && rec.has(e.plane.id)) rec.get(e.plane.id).down = e.cause;
    }
    for (const r of rec.values()) {
      const p = r.p; if (p.dying || p.gone || !p.target) continue;
      r.min = Math.min(r.min, Math.hypot(p.target.x - p.x, p.target.z - p.z));
      if (r.dh8 === null && w.time - r.t >= 8) r.dh8 = Math.abs(wrap(p.heading - r.h0));
      r.last = p.phase;
    }
  }
  const rows = [...rec.values()];
  const types = {}; for (const r of rows) (types[r.p.typeKey] ||= []).push(r);
  for (const [k, list] of Object.entries(types)) {
    const turned = list.filter((r) => r.dh8 !== null && r.dh8 > 0.6).length, known = list.filter((r) => r.dh8 !== null).length;
    console.log(`${cv} ${k}: ${list.length} drops; ${turned}/${known} turned more than 35 degrees in 8 s; closest after the drop ${Math.round(Math.min(...list.map((r) => r.min)))} m (median ${Math.round(list.map((r) => r.min).sort((a, b) => a - b)[list.length >> 1])} m); drop at ${Math.round(list.reduce((a, r) => a + r.d0, 0) / list.length)} m, phases ${[...new Set(list.map((r) => r.phase))].join('/')}, shot down ${list.filter((r) => r.down).length}`);
  }
  if (!rec.size) console.log(`${cv}: no torpedo drop`);
}
