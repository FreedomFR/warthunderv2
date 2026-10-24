// Fighter against fighter: node test/dogfight.mjs
// The turning performance comes out of the flight model (a light wing turns faster at a lower speed than a heavy one), the fighters use it (the one that is out-turned draws away,
// the other turns), and the fights are not sterile: shots are fired and aircraft fall (which of the two falls in a handful of duels is chance: tools/dogfight.mjs measures the balance over hundreds).
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { makeRng } from '../js/game/math.js';
import { PLANES } from '../js/game/model/planes.js';
import { turnPerf } from '../js/game/sim/airperf.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

const z = turnPerf('a6m', PLANES.a6m), h = turnPerf('f6f', PLANES.f6f), g = turnPerf('bf109t', PLANES.bf109t);
ok(z.wTurn > h.wTurn * 1.2 && z.vTurn < h.vTurn, `a Zero holds a faster turn (${(z.wTurn * 57.3).toFixed(1)} deg/s at ${z.vTurn} m/s) than a Hellcat (${(h.wTurn * 57.3).toFixed(1)} deg/s at ${h.vTurn} m/s), and at a lower speed`);
ok(z.wInst > h.wInst && h.vCorner > z.vCorner, `...and a faster turn for a moment (${(z.wInst * 57.3).toFixed(1)} against ${(h.wInst * 57.3).toFixed(1)} deg/s)`);
ok(g.wTurn > h.wTurn * 0.9 && g.wTurn < z.wTurn, 'a Bf 109 turns between the two');

// duels between the fighters of two carriers, each set-up flown twice with the sides swapped
const R = { fights: 0, kills: 0, zeroKills: 0, hellKills: 0, modes: new Set(), fired: 0, bad: 0 };
for (let s = 0; s < 12; s++) for (const swap of [0, 1]) {
  const w = new World(9000 + s); w.addTeam(0); w.addTeam(1);
  const ids = swap ? ['essex', 'shokaku'] : ['shokaku', 'essex'];
  spawnFleet(w, 0, [{ id: ids[0], count: 1 }], 0, 0, 90); spawnFleet(w, 1, [{ id: ids[1], count: 1 }], 40000, 0, 270);
  w.start();
  const mine = [null, null];
  for (let i = 0; i < 6000 && !(mine[0] && mine[1]); i++) {
    w.update(0.1); w.drainEvents();
    for (const p of w.planes) if (p.fighter && p.y > 120 && !p.dying && !mine[p.team]) mine[p.team] = p;
  }
  if (!mine[0] || !mine[1]) continue;
  const rnd = makeRng(s * 7 + 1), sep = rnd.range(2200, 3600), alt = rnd.range(1500, 2600), lat = rnd.range(-500, 500);
  mine.forEach((p, t) => {
    const dir = t ? -1 : 1;
    p.x = -dir * sep / 2; p.z = lat * (t ? 0.5 : -0.5); p.y = alt; p.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; p.pitch = 0; p.bank = 0; p.speed = 105 + rnd.range(0, 10);
    p.phase = 'cap'; p.hidden = false; p.gearDown = false; p.ds = 'air'; p.fuel = 2000; p.ammo = 520; p.cond = 1; p.age = 200; p.t0Air = 0; p.prey = null; p.preyT = 0; p.role = 'cap'; p.wave = { planes: [p] };
    p.vx = Math.sin(p.heading) * p.speed; p.vz = -Math.cos(p.heading) * p.speed; p.vy = 0;
  });
  const keep = new Set(mine);
  w.ships.forEach((sh) => { sh.x = sh.team ? 6000 : -6000; sh.z = 0; sh.heading = sh.team ? -Math.PI / 2 : Math.PI / 2; sh.speed = 0; });
  R.fights++;
  for (let i = 0; i < 1200; i++) {
    w.planes = w.planes.filter((p) => keep.has(p));
    w.update(0.1);
    for (const e of w.drainEvents()) {
      if (e.type === 'planeDown' && keep.has(e.plane)) { R.kills++; if (e.plane.typeKey === 'a6m') R.hellKills++; else R.zeroKills++; }
      if (e.type === 'mgFire' && keep.has(e.plane)) R.fired++;
    }
    for (const p of keep) { if (p.tac) R.modes.add(p.typeKey + ':' + p.tac); if (!Number.isFinite(p.x + p.y + p.z + p.heading)) R.bad++; }
    if ([...keep].some((p) => p.dying)) break;
  }
}
ok(R.bad === 0, 'no aircraft with a non-finite state');
ok(R.fights >= 20, `${R.fights} duels flown`);
ok(R.fired > 100, `shots are fired (${R.fired} bursts)`);
ok(R.kills >= 3, `aircraft fall (${R.kills} in ${R.fights} duels: ${R.hellKills} Zeros, ${R.zeroKills} Hellcats)`);
ok(['f6f', 'f4f', 'fm2'].some((k) => R.modes.has(k + ':extend') || R.modes.has(k + ':defend')), `the Hellcat (or the Wildcat the carrier flies) draws away from a fight it would lose by turning (${[...R.modes].sort().join(', ')})`);
ok(R.modes.has('a6m:defend') || R.modes.has('a6m:attack'), 'the Zero turns and fights');
if (fail) process.exit(1);
