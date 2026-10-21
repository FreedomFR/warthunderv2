// The gunners of the bombers: node test/gunners.mjs — the fields of fire of each gun position, where the rounds leave from, the guns turning onto a fighter.
import { PLANES } from '../js/game/model/planes.js';
import { planeGuns, inArc, muzzleOf, gunDims } from '../js/game/model/planeGuns.js';
import { bomberDefense } from '../js/game/sim/fighters.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const D = Math.PI / 180;
const covers = (key, yaw, pitch) => planeGuns(PLANES[key], key).filter((g) => inArc(g, yaw * D, pitch * D)).map((g) => g.t);

// every position at rest points where it can fire, and its muzzle is beyond its pivot
for (const key of Object.keys(PLANES)) {
  const guns = planeGuns(PLANES[key], key);
  for (const g of guns) {
    if (!inArc({ ...g, fin: false }, g.rest[0], g.rest[1])) ok(false, `${key} ${g.t}: the rest is outside the field of fire`);
    const m = muzzleOf(g, g.rest[0], g.rest[1]);
    if (Math.hypot(m[0] - g.pivot[0], m[1] - g.pivot[1], m[2] - g.pivot[2]) < 0.3) ok(false, `${key} ${g.t}: the muzzle is at the pivot`);
  }
}
ok(true, 'every gun position at rest points inside its own field of fire (stowed astern over the fin), its muzzle out beyond the pivot');
ok(planeGuns(PLANES.f6f, 'f6f').length === 0 && planeGuns(PLANES.a6m, 'a6m').length === 0, 'a fighter has no gunner');

// the B-17: astern the tail guns (and the top turret above), ahead the chin, below the ball, to a side the waist gun of that side only
ok(covers('b17', 180, 0).includes('tail') && !covers('b17', 180, 0).includes('dome'), `B-17 right astern level: the tail guns, not the top turret through the fin (${covers('b17', 180, 0)})`);
ok(covers('b17', 180, 40).includes('dome'), 'B-17 astern and high: the top turret, over the fin');
ok(covers('b17', 0, -20).includes('chin') && !covers('b17', 0, -20).includes('tail'), `B-17 ahead and below: the chin turret (${covers('b17', 0, -20)})`);
ok(covers('b17', 60, -70).includes('ball') && !covers('b17', 60, 30).includes('ball'), 'B-17 below: the ball turret, which cannot fire upwards');
const stb = planeGuns(PLANES.b17, 'b17').filter((g) => g.t === 'beam' && inArc(g, 90 * D, 0));
ok(stb.length === 1 && stb[0].pivot[2] > 0, 'B-17 on the starboard beam: the starboard waist gun alone');
let gaps = 0, n = 0;
for (let y = -180; y < 180; y += 10) for (let p = -80; p <= 80; p += 10) { n++; if (!covers('b17', y, p).length) gaps++; }
ok(gaps / n < 0.08, `the B-17 covers nearly the whole sphere (${gaps} of ${n} directions without a gun)`);
// the single-engine bombers: astern only
ok(covers('sbd', 170, 20).length === 1 && !covers('sbd', 0, 0).length && !covers('sbd', 180, -60).length, 'SBD: the rear gunner covers astern and above, not ahead nor under the tail');
ok(covers('tbf', 180, -40).includes('tunnel') && covers('tbf', 90, 30).includes('dome'), 'TBF: the tunnel gun under the tail, the turret above');

// the size of the guns
ok(gunDims(12.7).len > 1 && gunDims(12.7).r < 0.03 && gunDims(7.7).len < 0.7 && gunDims(7.7).r < 0.02, 'a .50 has a barrel of a metre, a rifle-calibre gun 0.6 m, both a few centimetres thick');

// the guns turn onto a fighter coming from astern and fire from the tail
const spec = PLANES.b17, b = { typeKey: 'b17', spec, team: 0, x: 0, y: 3000, z: 0, vx: 0, vy: 0, vz: -80, heading: 0, pitch: 0, roll: 0, phase: 'cruise', owner: null };
const f = { typeKey: 'f6f', spec: PLANES.f6f, team: 1, fighter: true, x: 0, y: 3010, z: 300, vx: 0, vy: 0, vz: -90, heading: 0, pitch: 0, roll: 0 };
const world = { planes: [b, f], events: [], rng: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })() };
let hits = 0;
for (let i = 0; i < 120; i++) { world.events.length = 0; bomberDefense(world, 1 / 30, { hit: () => { hits++; } }); }
const tail = planeGuns(spec, 'b17').findIndex((g) => g.t === 'tail'), st = b.gun[tail];
ok(Math.abs(Math.abs(st.yaw) - Math.PI) < 0.1 && st.firing, `the tail guns turned astern onto the fighter and fire (yaw ${(st.yaw / D).toFixed(0)}°)`);
const fire = world.events.filter((e) => e.type === 'mgFire');
const tailFire = fire.find((e) => e.cal === 12.7 && e.z > 10);
ok(tailFire && tailFire.z > 12 && Math.abs(tailFire.x) < 1, `the rounds leave from the tail, 12 m behind the centre (z ${tailFire && tailFire.z.toFixed(1)} m)`);
ok(!b.gun.some((s, i) => s.firing && planeGuns(spec, 'b17')[i].t === 'chin'), 'the chin turret does not fire at a fighter astern');
ok(hits > 0, `the fighter is hit (${hits} times in 4 s)`);
