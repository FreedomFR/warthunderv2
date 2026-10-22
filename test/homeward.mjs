// The way home: node test/homeward.mjs
// Aircraft that have attacked keep out of the reach of the enemy guns (ships' and bases') on the way back, and the aircraft of a group close up behind a leader.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { makeRng, clamp } from '../js/game/math.js';
import { PRESETS as SCENARIOS } from '../js/game/scenarios.js';
import { aaSources } from '../js/game/sim/routing.js';
import { safeHeading, formOn } from '../js/game/sim/homeward.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// ---- a gun between the aircraft and its home: the course bends round it ----
{
  const mount = { alive: true, ammo: 100, rec: { variant: 'bofors', n: 4 } };
  const world = { ships: [{ team: 1, alive: true, x: 6000, z: 0, vx: 0, vz: 0, aaMounts: Array(24).fill(mount), mounts: [] }] };
  const p = { team: 0, x: 0, z: 0, y: 300 };
  const e = safeHeading(world, p, 20000, 0, 0);       // heading 90 deg = towards +x
  ok(e.direct > e.risk, `the direct course is under fire (${e.direct.toFixed(2)}), the one chosen less (${e.risk.toFixed(2)})`);
  ok(Math.abs(e.hdg - Math.PI / 2) > 0.2, `it bends away from the guns (${((e.hdg - Math.PI / 2) * 57.3).toFixed(0)} deg off the direct course)`);
  const again = safeHeading(world, p, 20000, 0, 1);
  ok(again === e, 'the choice is kept for a couple of seconds');
  const clear = safeHeading({ ships: [] }, { team: 0, x: 0, z: 0, y: 300 }, 20000, 0, 0);
  ok(Math.abs(clear.hdg - Math.PI / 2) < 1e-9, 'with no guns about it goes straight home');
}

// ---- a follower goes to its place behind the leader and holds the leader's speed ----
{
  const lead = { x: 0, z: 0, y: 500, heading: 0, speed: 100, vx: 0, vz: -100 };
  const pf = { vc: 100, vmax: 150 };
  const near = formOn({ x: 40, z: 90, y: 500, speed: 100 }, lead, 1, pf);
  ok(near.d < 100 && near.spd > 50 && near.spd < 130, `a follower close behind steers for its slot (${near.d.toFixed(0)} m off)`);
  const far = formOn({ x: 5000, z: 12000, y: 200 }, lead, 2, pf);
  ok(far.spd > pf.vc * 1.1, 'one far behind goes faster to catch up');
}

// ---- in a battle: the guns of the bases count, and the groups on their way home are tight ----
// A whole battle is chaotic (any change of balance, of a model or of the AA layout of a ship moves its outcome), so the property is judged on the pooled samples of a few battles.
const battle = (seed) => {
  const sc = SCENARIOS.find((s) => s.id === 'allies'), sep = sc.sep || 12000;
  const w = new World(seed); w.rng = makeRng(seed);
  sc.teams.forEach((t, i) => { w.addTeam(i, t.name, t.rgb); const s = teamStart(i, 2, sep); spawnFleet(w, i, t.entries, s.x, s.z, s.heading); });
  const starts = sc.teams.map((_, i) => teamStart(i, 2, sep));
  w.terrain = Terrain.generate(seed, 2, starts.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [starts[0].x, starts[0].z, starts[1].x, starts[1].z], clamp(sep * 0.9 + 5000, 9000, 21000), { bases: 2, starts: starts.map((q) => ({ x: q.x, z: q.z, nation: 'USA' })) });
  for (const s of w.ships) s.cmd.throttle = 0.7;
  w.start();
  const spread = [];
  let baseGuns = false;
  while (w.time < 600) {
    w.update(0.1);
    if (Math.round(w.time * 10) % 20) continue;
    if (!baseGuns && w.bases && w.bases.length) { const n = aaSources(w, 0, 0).length; if (n > w.ships.filter((s) => s.alive && s.team !== 0).length) baseGuns = true; }
    const by = new Map();
    for (const p of w.planes) if (!p.dying && !p.gone && !p.fighter && p.phase === 'return') { const g = p.sec || p.wave; if (g) (by.get(g) || by.set(g, []).get(g)).push(p); }
    for (const m of by.values()) if (m.length >= 3) {
      const c = [m.reduce((a, q) => a + q.x, 0) / m.length, m.reduce((a, q) => a + q.z, 0) / m.length];
      spread.push(Math.max(...m.map((q) => Math.hypot(q.x - c[0], q.z - c[1]))));
    }
  }
  return { spread, baseGuns };
};
// the samples of three battles are pooled: one battle alone gives a handful of groups (or none), and where they are is chaotic
const spread = [];
let baseGuns = false;
for (const seed of [3, 12, 5]) { const r = battle(seed); spread.push(...r.spread); baseGuns = baseGuns || r.baseGuns; }
spread.sort((a, b) => a - b);
const med = spread[spread.length >> 1] ?? 0;
ok(spread.length > 10, `groups of three or more on their way home were seen (${spread.length} samples in three battles)`);
ok(med < 1600, `they come home close together (median radius ${med.toFixed(0)} m; scattered aircraft would be several kilometres apart)`);
ok(baseGuns, 'the batteries of the enemy bases count among the guns to keep away from');
process.exit(fail ? 1 : 0);
