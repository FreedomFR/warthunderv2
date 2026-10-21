// The take-off and the landing of carrier aircraft, step by step: node tools/decktrace.mjs [seed] [seconds]
// For the first aircraft of each kind: every quarter of a second of the deck run and the climb (the distance along the deck, the speed over the deck, the height over the
// deck, the attitude as it is drawn: pitch + angle of attack), and every second of the circuit and the landing (heading against the ship's, place in the ship's frame).
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

const [seed = '5', secs = '1800'] = process.argv.slice(2);
const w = new World(+seed); w.addTeam(0); w.addTeam(1);
const st = [teamStart(0, 2, 20000), teamStart(1, 2, 20000)];
spawnFleet(w, 0, [{ id: 'essex', count: 1 }, { id: 'fletcher', count: 1 }], st[0].x, st[0].z, st[0].heading);
spawnFleet(w, 1, [{ id: 'shokaku', count: 1 }, { id: 'kagero', count: 1 }], st[1].x, st[1].z, st[1].heading);
w.start();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const D = (v) => (v * 57.3).toFixed(1).padStart(6);
const rec = { to: new Map(), ld: new Map() };
const l = [0, 0, 0];
while (w.time < +secs) {
  w.update(0.05); w.drainEvents();
  for (const p of w.planes) {
    const ship = p.owner;
    if (!ship || !ship.air || !ship.model.deckPoints) continue;
    const kind = p.fighter ? 'fighter' : p.kind;
    if (p.phase === 'takeoff' && !rec.to.has(kind)) rec.to.set(kind, { p, rows: [] });
    if (p.phase === 'pattern' && !rec.ld.has(kind)) rec.ld.set(kind, { p, rows: [] });
    for (const [m, R] of [['to', rec.to.get(kind)], ['ld', rec.ld.get(kind)]]) {
      if (!R || R.p !== p || R.done) continue;
      const step = m === 'to' ? 5 : 20;
      if (Math.round(w.time * 20) % step) continue;
      ship.toLocal(p.x, p.y, p.z, l);
      const h = p.y - (ship.y + ship.model.fdY);
      R.rows.push(`${w.time.toFixed(2).padStart(8)} ${(p.phase + (p.ds ? ':' + p.ds : '') + (p.leg ? ':' + p.leg : '')).padEnd(16)} lx ${l[0].toFixed(0).padStart(6)} lz ${l[2].toFixed(0).padStart(5)}  u ${(p.u ?? 0).toFixed(1).padStart(5)} v ${p.speed.toFixed(1).padStart(5)}  h ${h.toFixed(1).padStart(6)}  hdg-ship ${D(wrap(p.heading - ship.heading))}  drawn pitch ${D(p.pitch + (p.aoa || 0))} (aoa ${D(p.aoa || 0)})  bank ${D(p.bank || 0)}`);
      if (m === 'to' && (h > 200 || R.rows.length > 400)) R.done = true;
      if (m === 'ld' && (p.phase === 'taxiIn' || p.phase === 'queue' || p.gone || R.rows.length > 500)) R.done = true;
    }
  }
  if (rec.to.size >= 3 && rec.ld.size >= 2 && [...rec.to.values(), ...rec.ld.values()].every((r) => r.done)) break;
}
for (const [m, M] of [['take-off', rec.to], ['landing', rec.ld]]) for (const [k, R] of M) console.log(`\n=== ${m} of a ${k} (${R.p.typeKey}) from ${R.p.owner.name}\n` + R.rows.join('\n'));
