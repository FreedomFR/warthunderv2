// The guided missiles of the ships: node test/missiles.mjs
// A launcher of a spec sheet has its mount on the model, the SAM is fired at enemy aircraft only and steers itself on them (a proximity burst, kills, two channels), the ASROC
// is fired at ships inside its window of range and drops a torpedo that hits.
import { World } from '../js/game/sim/world.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { getModel } from '../js/game/model/cache.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const parse = (s) => s.split(',').map((t) => { const [id, c] = t.split(':'); return { id, count: Number(c || 1) }; });

// ---- every missile system of a spec sheet is complete and has its mount (and its traverse) on the model ----
for (const spec of ALL_SHIPS) {
  if (!spec.missiles) continue;
  const model = getModel(spec);
  for (const m of spec.missiles) {
    ok(['sam', 'asroc'].includes(m.kind) && m.count > 0 && m.maxRangeM > m.minRangeM && m.speedMs > 100 && m.cycleS > 0, `${spec.id}: ${m.name}: ${m.count} missiles, ${m.minRangeM}-${m.maxRangeM} m, ${m.speedMs} m/s`);
    const mt = model.missileMounts.find((q) => q.kind === m.kind);
    ok(mt && mt.arcH > 0 && Math.abs(mt.z) < spec.beam, `${spec.id}: ${m.name}: its launcher is on the model (x ${mt && mt.x.toFixed(1)}, y ${mt && mt.y.toFixed(1)}) with a traverse of ${mt && Math.round(mt.arcH * 180 / Math.PI)} degrees either side`);
  }
}

// ---- the SAM against an air attack ----
{
  const w = new World(21); w.addTeam(0); w.addTeam(1);
  [parse('adams:1'), parse('shokaku:1')].forEach((f, i) => { const s = teamStart(i, 2, 38000); spawnFleet(w, i, f, s.x, s.z, s.heading); });
  for (const s of w.ships) s.cmd.throttle = 0.5;
  w.start();
  const a = w.ships.find((s) => s.stats.id === 'adams'), stock0 = a.msl.find((s) => s.def.kind === 'sam').left;
  let launched = 0, bursts = 0, kills0 = 0, maxChan = 0, wrong = 0, maxSpeed = 0;
  for (let t = 0; t < 1500 && a.state === 'afloat'; t += 0.1) {
    w.update(0.1);
    for (const ev of w.drainEvents()) { if (ev.type === 'missileLaunch' && ev.kind === 'sam') launched++; if (ev.type === 'flak' && ev.cal === 203) bursts++; }
    const live = new Set();
    for (const q of w.missiles) { if (q.kind !== 'sam' || q.age < 0) continue; live.add(q.target); if (q.target.team === a.team) wrong++; maxSpeed = Math.max(maxSpeed, Math.hypot(q.vx, q.vy, q.vz)); }
    maxChan = Math.max(maxChan, live.size);
  }
  kills0 = a.aaKills;
  const left = a.msl.find((s) => s.def.kind === 'sam').left;
  ok(launched >= 10 && left === stock0 - launched, `the Adams fires its Tartars at the aircraft of the strike (${launched} fired, ${left} left of ${stock0})`);
  ok(bursts >= 5 && kills0 >= 3, `the missiles steer on the aircraft and burst near them: ${bursts} proximity bursts, ${kills0} aircraft shot down`);
  ok(maxChan <= 2 && wrong === 0, `never more than two targets guided at once (${maxChan}) and never a friendly aircraft`);
  ok(maxSpeed > 450 && maxSpeed < 700, `the missile flies at Mach 1.4-2 (${maxSpeed.toFixed(0)} m/s at its fastest)`);
}

// ---- the ASROC at a ship: the window of range, the torpedo ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const a = w.addShip('adams', 0, 0, 0, 0);
  const near = w.addShip('fletcher', 1, 800, 0, Math.PI), far = w.addShip('fletcher', 1, 14000, 0, Math.PI);       // one inside the minimum range, one beyond the maximum
  w.start();
  for (const s of [near, far]) { s.controller = null; s.cmd.throttle = 0; }
  a.controller = null; a.cmd.throttle = 0;
  let fired = 0, torps = 0;
  const asroc = () => a.msl.find((s) => s.def.kind === 'asroc');
  for (let t = 0; t < 60; t += 0.1) { w.update(0.1); for (const ev of w.drainEvents()) if (ev.type === 'missileLaunch' && ev.kind === 'asroc') fired++; }
  ok(fired === 0 && asroc().left === 8, 'no ASROC at a ship inside the minimum range or beyond the maximum one');
  near.x = 6000; near.z = 0; near.vx = near.vz = 0;                                                                // now in the window
  let h0 = near.hp;
  for (let t = 0; t < 140; t += 0.1) {
    w.update(0.1);
    for (const ev of w.drainEvents()) if (ev.type === 'missileLaunch' && ev.kind === 'asroc') fired++;
    if (w.torpedoes.some((q) => q.owner === a)) torps++;
  }
  ok(fired >= 2 && asroc().left === 8 - fired, `at 6 km the Adams fires its ASROC (${fired} fired, ${asroc().left} left of 8)`);
  ok(torps > 0 && near.hp < h0, `each rocket drops a Mk 46 that runs to the ship: ${near.hp.toFixed(0)} of ${h0.toFixed(0)} points left`);
  ok(w.missiles.every((q) => q.owner === a), 'the missiles in flight belong to the Adams');
}

console.log(fail ? `${fail} FAILED` : 'ALL OK');
