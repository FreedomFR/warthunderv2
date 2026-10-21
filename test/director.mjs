// The automatic camera director: node test/director.mjs — what warms a ship, which moments cut the shot, that shots do not repeat, that a hidden ship is noticed.
import { World } from '../js/game/sim/world.js';
import { Terrain } from '../js/game/sim/terrain.js';
import { spawnFleet, teamStart } from '../js/game/sim/formation.js';
import { Director, formations, attacks } from '../js/game/ui/director.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const w = new World(4); w.addTeam(0); w.addTeam(1);
const st = [teamStart(0, 2, 9000), teamStart(1, 2, 9000)];
w.terrain = Terrain.generate(4, 2, st.map((q) => ({ x: q.x, z: q.z, r: 4800 })), [st[0].x, st[0].z, st[1].x, st[1].z], 14000, { bases: 1, starts: st.map((q, i) => ({ ...q, nation: ['USA', 'Japan'][i] })) });
for (let t = 0; t < 2; t++) spawnFleet(w, t, [{ id: t ? 'takao' : 'baltimore', count: 1 }, { id: t ? 'kagero' : 'fletcher', count: 1 }], st[t].x, st[t].z, st[t].heading);
w.start();
const D = new Director({ game: { world: w } });
const [a, b] = w.ships.filter((s) => s.team === 0), [c] = w.ships.filter((s) => s.team === 1);

// heat: a hit warms a ship, then it cools
D.note([{ type: 'impact', kind: 'penetrate', cal: 356, ship: a }], 10);
const h0 = D.heatOf(a, 10), h1 = D.heatOf(a, 22);
ok(h0 > 2 && h1 < h0 * 0.2 && D.heatOf(b, 10) === 0, `a hit warms a ship (${h0.toFixed(1)}) and it cools (${h1.toFixed(2)} twelve seconds later)`);
D.note([{ type: 'muzzle', ship: b, cal: 406 }], 10);
ok(D.heatOf(b, 10) > 1, 'a heavy salvo warms the shooter');
ok(D.interest(a, 11, null) > D.interest(c, 11, null) - 1.2 - 3, 'a hot ship is of more interest than a quiet one');

// moments
ok(D.interrupt(11, 5) === null, 'small events do not cut the shot');
D.note([{ type: 'explosion', stage: 'primary', ship: c, x: c.x, z: c.z, size: 1 }], 20);
ok(D.interrupt(20.5, 1.0) === null, 'a big moment waits until the shot has been seen for a moment');
const m = D.interrupt(21, 4);
ok(m && m.kind === 'magazine' && m.ship === c, 'a magazine blowing up cuts the shot');
m.seen = true;
ok(D.interrupt(21.5, 5) === null, 'and only once');
D.note([{ type: 'explosion', stage: 'primary', ship: c, x: c.x, z: c.z, size: 1 }], 21.8);
ok(D.moments.filter((q) => q.kind === 'magazine').length === 1, 'the same explosion is one moment');
D.note([{ type: 'baseDown', base: {}, x: 100, z: 200 }], 30);
ok(D.interrupt(31, 5).kind === 'basedown', 'a base put out of action is a moment');
D.note([{ type: 'sinking', ship: c, magazine: false }], 40);
ok(D.interrupt(41, 5) === null && D.moments.some((q) => q.kind === 'sinking'), 'a cruiser going down is remembered, a battleship cuts the shot');
D.note([{ type: 'sinking', ship: { stats: { type: 'BB' }, x: 0, z: 0 }, magazine: false }], 42);
ok(D.interrupt(43, 5).kind === 'sinking', 'a battleship going down is a moment');
D.moments.length = 0;
D.note([{ type: 'sinking', ship: c, magazine: true }], 50);
ok(D.moments.length === 0, '(a ship that blows up has had her moment already)');

// choice of shot
D.reset();
const seq = [];
for (let i = 0; i < 400; i++) {
  const ctx = D.weights(a, 100 + i * 8);
  const k = D.pickKind(ctx.weights);
  D.started(k, a, 100 + i * 8);
  seq.push(k);
}
let rep = 0;
for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) rep++;
ok(rep < seq.length * 0.12, `the same kind of shot is rarely repeated (${rep} of ${seq.length - 1})`);
const kinds = new Set(seq);
ok(kinds.size >= 5, `the director uses a variety of shots (${[...kinds].join(' ')})`);
ok(seq.every((k) => k !== 'versus' && k !== 'reverse'), 'no shot of one ship firing on another while nobody is shooting');
D.reset();
{
  // (the pick is random: count the opening shots of many battles)
  let wide = 0;
  for (let i = 0; i < 200; i++) if (D.pickKind(D.weights(a, 0).weights) === 'wide') wide++;
  ok(wide > 150, `the battle opens on a wide shot (${wide} of 200)`);
}

// the line of sight
{
  const isl = w.terrain.islands[0];
  const cam = { x: isl.x - isl.R * 1.2, y: 6, z: isl.z };
  const far = { x: isl.x + isl.R * 1.2, z: isl.z, model: { topY: 20 } };
  ok(D.hidden(cam, far), 'a ship on the far side of an island is hidden from a camera on the near side');
  ok(!D.hidden({ x: far.x - 400, y: 30, z: far.z }, far), 'and not from a camera next to her');
}

// aircraft in groups: formations in the air, attacks by several aircraft on one ship
{
  const wave = {}, sec = {};
  const pl = (o) => ({ id: Math.random(), team: 0, x: 0, y: 900, z: 0, vx: 0, vy: 0, vz: -110, speed: 110, phase: 'cruise', kind: 'torp', ordnance: true, ...o });
  const vee = [pl({ sec, x: 0 }), pl({ sec, x: 50, z: 40 }), pl({ sec, x: -50, z: 40 }), pl({ sec, x: 0, z: 90 })];
  const strag = [pl({ wave, x: 5000 }), pl({ wave, x: 5600 }), pl({ wave, x: 6200 })];
  const fake = { planes: [...vee, ...strag, pl({ sec: {}, x: -4000 })], ships: [] };
  const f = formations(fake);
  ok(f.length === 1 && f[0].planes.length === 4 && f[0].r < 120, 'four aircraft of a section flying in a vee are a formation');
  ok(!f.some((g) => g.planes.some((p) => strag.includes(p))), 'aircraft of one wave strung out over kilometres are not');
  vee[3].vx = 110; vee[3].vz = 0;
  ok(formations(fake)[0].planes.length === 3, 'an aircraft turning away is not of the formation any more');
  vee[0].phase = vee[1].phase = vee[2].phase = 'assemble';
  ok(formations(fake).length === 0, 'aircraft still forming up are not a formation yet');
  const tg = { alive: true, x: 0, y: 0, z: 0, stats: { score: 3 } };
  fake.planes = [pl({ target: tg, phase: 'run', x: 900, y: 40 }), pl({ target: tg, phase: 'run', x: 1000, z: 200, y: 40 }), pl({ target: tg, phase: 'dive', kind: 'dive', y: 1500, x: 300 }), pl({ target: tg, phase: 'cruise', x: 1200 })];
  const at = attacks(fake);
  ok(at.length === 1 && at[0].ship === tg && at[0].planes.length === 3, 'three aircraft attacking one ship are an attack to film (the one still on its way is not counted)');
  fake.planes = fake.planes.slice(0, 1);
  ok(attacks(fake).length === 0, 'one aircraft alone is not');
}
