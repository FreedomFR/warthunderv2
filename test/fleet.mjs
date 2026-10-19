// The order of battle of a fleet: node test/fleet.mjs
import { World } from '../js/game/sim/world.js';
import { stationPlan } from '../js/game/sim/fleet.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// ---- the plan ----
{
  const items = [{ type: 'DD', L: 115 }, { type: 'CA', L: 205 }, { type: 'BB', L: 270 }, { type: 'DD', L: 115 }, { type: 'CV', L: 270 }, { type: 'DD', L: 115 }, { type: 'DD', L: 115 }, { type: 'CL', L: 186 }];
  const p = stationPlan(items, 1);
  ok(p[2].flag && p[2].f === 0, 'the battleship leads the line');
  ok(p[1].f < p[2].f && p[7].f < p[1].f && p[1].role === 'line' && p[7].role === 'line', 'the heavy cruiser follows the battleship, the light cruiser follows her');
  ok(p[1].f <= p[2].f - (270 + 205) / 2, 'the gap between two ships of the line is more than their lengths apart');
  const dd = [0, 3, 5, 6].map((i) => p[i]);
  ok(dd.filter((q) => q.role === 'screen').every((q) => q.f > 1000 && Math.abs(q.r) > 1000), 'the destroyers of the screen are ahead of the line and on both bows');
  ok(dd.filter((q) => q.role === 'escort').length === 2, 'two destroyers escort the carrier');
  ok(p[4].role === 'carrier' && p[4].f < p[7].f && p[4].r > 2000, 'the carrier is behind the line, on the side given');
  ok(stationPlan(items, -1)[4].r < -2000, 'and on the other side when the fleet circles the other way');
  const solo = stationPlan([{ type: 'DD', L: 115 }, { type: 'DD', L: 115 }, { type: 'DD', L: 115 }], 1);
  ok(solo[0].flag && solo[1].f < 0 && solo[2].f < solo[1].f, 'destroyers alone sail in column');
}

// ---- keeping the station (the fleets are far apart: nothing but the sailing) ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const s0 = teamStart(0, 2, 90000), s1 = teamStart(1, 2, 90000);
  const mine = spawnFleet(w, 0, [{ id: 'iowa', count: 1 }, { id: 'baltimore', count: 1 }, { id: 'cleveland', count: 1 }, { id: 'essex', count: 1 }, { id: 'fletcher', count: 4 }], s0.x, s0.z, s0.heading);
  spawnFleet(w, 1, [{ id: 'yamato', count: 1 }], s1.x, s1.z, s1.heading);
  w.start();
  let worst = 0, minGap = 1e9;
  for (let i = 0; i < 2400; i++) {
    w.update(0.1); w.drainEvents();
    if (i > 600 && i % 20 === 0) {
      const fl = w.fleetOf(0);
      for (const s of mine) { const p = fl.stationPoint(s); if (p && s.station.role !== 'escort') worst = Math.max(worst, Math.hypot(p[0] - s.x, p[1] - s.z) / s.station.tether); }
      for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) minGap = Math.min(minGap, Math.hypot(mine[a].x - mine[b].x, mine[a].z - mine[b].z) - (mine[a].stats.L + mine[b].stats.L) / 2);
    }
  }
  const fl = w.fleetOf(0);
  ok(fl.flag && fl.flag.stats.id === 'iowa', 'the flagship is the battleship');
  ok(worst < 2.2, `after four minutes every ship is within ${worst.toFixed(1)} tethers of her station`);
  ok(mine.every((s) => s.hpFrac > 0.99), 'nobody was hurt: no collision in the column');
  ok(minGap > 40, `the ships of the fleet stay clear of each other (${minGap.toFixed(0)} m between hulls at the closest)`);
  // the carrier is behind the line, on its side
  const cv = mine.find((s) => s.stats.type === 'CV'), fx = Math.sin(fl.flag.heading), fz = -Math.cos(fl.flag.heading);
  ok((cv.x - fl.flag.x) * fx + (cv.z - fl.flag.z) * fz < -1500, 'the carrier sails astern of the flagship');
  // a ship that is crippled leaves the order of battle
  const b = mine[1]; b.hp = b.stats.maxHp * 0.2;
  for (let i = 0; i < 25; i++) { w.update(0.1); w.drainEvents(); }
  ok(!b.station, 'a crippled ship is no longer held to her station');
}

// ---- one target for the line ----
{
  const w = new World(9); w.addTeam(0); w.addTeam(1);
  const a = teamStart(0, 2, 16000), b = teamStart(1, 2, 16000);
  spawnFleet(w, 0, [{ id: 'iowa', count: 1 }, { id: 'baltimore', count: 1 }, { id: 'fletcher', count: 2 }], a.x, a.z, a.heading);
  spawnFleet(w, 1, [{ id: 'yamato', count: 1 }, { id: 'takao', count: 1 }, { id: 'kagero', count: 2 }], b.x, b.z, b.heading);
  w.start();
  let same = 0, n = 0;
  for (let i = 0; i < 3000; i++) {
    w.update(0.1); w.drainEvents();
    if (i > 1200 && i % 20 === 0) {
      const fl = w.fleetOf(0), line = w.ships.filter((s) => s.team === 0 && s.alive && (s.stats.type === 'BB' || s.stats.type === 'CA'));
      if (line.length >= 2 && fl.focus) { n++; if (line.every((s) => s.cmd.main.target === fl.focus || !s.cmd.main.target)) same++; }
    }
  }
  ok(n > 20 && same / n > 0.55, `the ships of the line shoot at the fleet's target (${same} of ${n} samples)`);
}
console.log(fail ? `${fail} check(s) failed` : 'all fleet checks OK');
