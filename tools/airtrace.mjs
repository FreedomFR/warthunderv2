// The take-off and the landing of the aircraft of an island airfield, step by step: node tools/airtrace.mjs [seed] [seconds]
// For one bomber and one fighter: every half second of the take-off run and the climb, and of the approach and the landing roll: the phase, the speed, the height over the
// field, the heading against the runway's, the distance along the runway and off its centre line.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

const [seed = '3', secs = '1500'] = process.argv.slice(2);
const sep = 12000, st = [teamStart(0, 2, sep), teamStart(1, 2, sep)].map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] }));
const w = new World(+seed); w.addTeam(0); w.addTeam(1);
for (let t = 0; t < 2; t++) spawnFleet(w, t, [{ id: t ? 'yamato' : 'iowa', count: 1 }, { id: t ? 'kagero' : 'fletcher', count: 2 }], st[t].x, st[t].z, st[t].heading);
w.terrain = Terrain.generate(+seed, 2, st.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [st[0].x, st[0].z, st[1].x, st[1].z], Math.min(21000, sep * 0.9 + 5000), { bases: 2, starts: st });
w.start();
const fld = (b) => b._fld;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const watch = new Map();            // plane -> { kind: 'to' | 'ld', rows, done }
const out = { to: [], ld: [] };
let t = 0;
while (w.time < +secs) {
  w.update(0.05); w.drainEvents(); t += 0.05;
  for (const p of w.planes) {
    if (!p.base || p.gone) continue;
    const F = fld(p.base); if (!F) continue;
    let rec = watch.get(p);
    const kind = p.fighter ? 'fighter' : 'bomber';
    if (!rec && p.phase === 'groundRun' && !out.to.some((r) => r.kind === kind)) { rec = { mode: 'to', kind, rows: [], p }; watch.set(p, rec); out.to.push(rec); }
    // (every landing is followed; the first that ends on the ground for each kind is printed)
    if ((!rec || (rec.mode === 'ld' && rec.failed)) && p.phase === 'return' && !out.ld.some((r) => r.kind === kind && r.ok) && Math.hypot(p.x - F.L.x, p.z - F.L.z) < 14000) { rec = { mode: 'ld', kind, rows: [], p }; watch.set(p, rec); out.ld.push(rec); }
    if (rec && rec.mode === 'ld' && !rec.done && (p.dying || p.gone)) { rec.done = rec.failed = true; continue; }
    if (!rec || rec.done) continue;
    if (Math.round(w.time * 20) % 10 === 0) {
      rec.rows.push(`${w.time.toFixed(1).padStart(7)} ${(p.phase + (p.leg && p.base ? ":" + p.leg : "")).padEnd(12)} v ${p.speed.toFixed(1).padStart(5)}  h ${(p.y - F.y).toFixed(1).padStart(6)}  hdg-rwy ${(wrap(p.heading - F.rwHdg) * 57.3).toFixed(0).padStart(5)}°  s ${(F.D * F.sOf(p.x, p.z)).toFixed(0).padStart(6)}  t ${F.tOf(p.x, p.z).toFixed(0).padStart(6)}  pitch ${(p.pitch * 57.3).toFixed(1).padStart(5)} drawn ${((p.pitch + (p.aoa || 0)) * 57.3).toFixed(1).padStart(5)}  bank ${((p.bank || 0) * 57.3).toFixed(0).padStart(4)}`);
    }
    if (rec.mode === 'to' && (p.y - F.y > 400 || rec.rows.length > 200)) rec.done = true;
    if (rec.mode === 'ld' && (p.phase === 'taxiBack' || p.phase === 'parked' || rec.rows.length > 900)) { rec.done = true; rec.ok = p.phase === 'taxiBack' || p.phase === 'parked'; if (!rec.ok) rec.failed = true; }
  }
  if (out.to.length >= 2 && out.to.every((r) => r.done) && out.ld.filter((r) => r.ok).length >= 2) break;
}
for (const r of [...out.to, ...out.ld.filter((q) => q.ok || (!q.failed && q.rows.length))]) {
  const F = fld(r.p.base);
  console.log(`\n=== ${r.mode === 'to' ? 'take-off' : 'landing'} of a ${r.kind} (${r.p.typeKey}), runway ${F.len.toFixed(0)} m, threshold at s = ${(-F.len / 2).toFixed(0)}`);
  console.log(r.rows.join('\n'));
}
