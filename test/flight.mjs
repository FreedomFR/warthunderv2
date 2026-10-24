// The flight physics against the published figures: node test/flight.mjs — every aircraft flown alone, level at full power, climbing, in a sustained turn, rolling,
// diving, and pulling at low speed; prints the table and checks it.
import { guide } from '../js/game/sim/flight.js';
import { PERF, aeroOf } from '../js/game/sim/airperf.js';
import { PLANES } from '../js/game/model/planes.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const D = Math.PI / 180, G = 9.81;
const mk = (k, v, y = 2000) => ({ typeKey: k, spec: PLANES[k], x: 0, y, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, pitch: 0, roll: 0, bank: 0, speed: v, lost: {} });
const fly = (p, sec, f) => { const dt = 1 / 30; for (let t = 0; t < sec; t += dt) { f(p, dt, t); p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } return p; };
const FIGHTERS = ['p38', 'mosquito', 'f6f', 'f4f', 'fm2', 'p40', 'spitfire', 'a6m', 'fulmar', 'bf109t', 'd520', 'mc202'], HEAVY = ['b17', 'g4m', 'lancaster', 'he111', 'sm79', 'leo451'];
const R = {};
console.log('type        top m/s pub/sim   climb m/s pub/sim   turn deg/s (g, m/s, height lost)   bank 45 s   dive 70: brakes / clean m/s');
for (const k of Object.keys(PERF)) {
  const pf = PERF[k];
  const top = fly(mk(k, pf.vc), 240, (p, dt) => guide(p, dt, 0, 0, 400)).speed;
  const c = mk(k, pf.vcl); fly(c, 40, (p, dt) => guide(p, dt, 0, 0.5, pf.vcl)); const y0 = c.y; fly(c, 40, (p, dt) => guide(p, dt, 0, 0.5, pf.vcl)); const roc = (c.y - y0) / 40;
  const t = mk(k, pf.vcomb || pf.vc); fly(t, 60, (p, dt) => guide(p, dt, p.heading + 2, 0, 400)); const h0 = t.heading, ty = t.y; fly(t, 20, (p, dt) => guide(p, dt, p.heading + 2, 0, 400));
  const turn = (t.heading - h0) / 20 / D, lost = ty - t.y;
  const r = mk(k, pf.vc); let tb = 0; fly(r, 8, (p, dt, tt) => { guide(p, dt, p.heading + 3, 0, pf.vc); if (!tb && p.bank > Math.min(45, pf.bank - 2) * D) tb = tt; });
  const db = mk(k, pf.vc, 4500); fly(db, 40, (p, dt) => guide(p, dt, 0, -70 * D, 600, { brakes: true, pitchRate: 1 }));
  const dc = mk(k, pf.vc, 4500); fly(dc, 40, (p, dt) => guide(p, dt, 0, -70 * D, 600, { pitchRate: 1 }));
  R[k] = { top, roc, turn, lost, load: t.load, tb, db: db.speed, dc: dc.speed };
  console.log(k.padEnd(11), `${pf.vmax} / ${top.toFixed(0)}`.padEnd(17), `${pf.roc ?? pf.climb} / ${roc.toFixed(1)}`.padEnd(19), `${turn.toFixed(1)} (${t.load.toFixed(1)} g, ${t.speed.toFixed(0)}, ${lost.toFixed(0)} m)`.padEnd(34), `${tb ? tb.toFixed(1) : '-'}`.padEnd(11), `${db.speed.toFixed(0)} / ${dc.speed.toFixed(0)}`);
}
const all = Object.keys(PERF);
ok(all.every((k) => Math.abs(R[k].top / PERF[k].vmax - 1) < 0.04), 'level at full power every type flies at its published top speed (within 4 %)');
ok(all.every((k) => Math.abs(R[k].roc / (PERF[k].roc ?? PERF[k].climb) - 1) < 0.08), 'climbing at its climb speed every type climbs at its published rate (within 8 %)');
ok(all.filter((k) => PERF[k].brakes).every((k) => Math.abs(R[k].db / PERF[k].vd - 1) < 0.1), 'with the dive brakes out the dive bombers dive at their published diving speed');
ok(all.every((k) => R[k].dc < 245), `no aircraft dives faster than about 880 km/h (the drag rise of compressibility; fastest ${Math.max(...all.map((k) => R[k].dc)).toFixed(0)} m/s)`);
ok(all.every((k) => Math.abs(R[k].lost) < 30), 'a sustained turn at the limit is flown level');
ok(FIGHTERS.every((k) => R[k].turn > 12) && HEAVY.every((k) => R[k].turn < 6), 'a fighter turns at more than 12 degrees a second, a heavy bomber at less than 6');
ok(R.f4f.turn > R.f6f.turn && R.f4f.top < R.f6f.top && R.f4f.roc < R.f6f.roc, `the lighter Wildcat out-turns the Hellcat and is slower and climbs less (${R.f4f.turn.toFixed(1)} against ${R.f6f.turn.toFixed(1)} degrees a second)`);
ok(R.fm2.roc > R.f4f.roc && R.fm2.top >= R.f4f.top - 1 && R.fm2.top < R.f6f.top, `the FM-2 climbs better than the F4F-3 (${R.fm2.roc.toFixed(1)} against ${R.f4f.roc.toFixed(1)} m/s) and is slower than the Hellcat`);
ok(R.a6m.turn > R.f6f.turn && R.a6m.turn > R.bf109t.turn, `the Zero out-turns the Hellcat and the Bf 109 (${R.a6m.turn.toFixed(1)}, ${R.f6f.turn.toFixed(1)}, ${R.bf109t.turn.toFixed(1)} degrees a second)`);
ok(FIGHTERS.every((k) => R[k].tb < 0.9) && HEAVY.every((k) => R[k].tb > 1.1), 'a fighter rolls into a turn in under a second, a heavy bomber takes longer');
// the wing: slow, the aircraft cannot pull what it could fast
const A = aeroOf('f6f', PLANES.f6f), slow = mk('f6f', A.vs * 1.3);
fly(slow, 3, (p, dt) => guide(p, dt, p.heading + 2, 0, A.vs * 1.3, { bankMax: 85 * D }));
const fast = mk('f6f', 150); fly(fast, 3, (p, dt) => guide(p, dt, p.heading + 2, 0, 150, { bankMax: 85 * D }));
ok(slow.load < 2.2 && fast.load > 5, `a Hellcat pulls ${slow.load.toFixed(1)} g just above the stall and ${fast.load.toFixed(1)} g at 150 m/s`);
// an engine lost: a heavy bomber with two of four engines out cannot hold its height at full power
const b = mk('b17', 70); b.lost = { engines: [true, true, false, false] }; const yb = b.y;
fly(b, 60, (p, dt) => guide(p, dt, 0, 0.1, 70));
ok(b.y - yb < 60, `a B-17 on two engines can hardly climb (${(b.y - yb).toFixed(0)} m in a minute at full power)`);
