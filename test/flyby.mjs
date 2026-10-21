// The fly-by camera (the view "passage" of the aircraft cameras): node test/flyby.mjs — a camera placed ahead of an aircraft that flies by, with a long approach, clear of the
// path, and a cut only after the aircraft has gone by; not every couple of seconds, not through the aircraft.
import { flybyDue, flybyPlace } from '../js/game/ui/cameras.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const rng = (() => { let x = 9; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();

function fly(speed, secs = 120, hdg = 0.7, zoom = 1) {
  const p = { id: 4, x: 0, y: 500, z: 0, speed }, fx = Math.sin(hdg), fz = -Math.cos(hdg), dt = 0.05;
  let fix = null, cuts = [], minD = 1e9, maxApproach = 0, dueEarly = 0;
  for (let t = 0; t < secs; t += dt) {
    p.x += fx * speed * dt; p.z += fz * speed * dt;
    if (flybyDue(fix, p, fx, fz, speed < 20)) { fix = flybyPlace(fix, p, fx, 0, fz, zoom, speed < 20, rng); cuts.push(t); fix.d0 = Math.hypot(p.x - fix.x, p.y - fix.y, p.z - fix.z); maxApproach = Math.max(maxApproach, fix.d0); fix.t0 = t; }
    fix.age += dt;
    const d = Math.hypot(p.x - fix.x, p.y - fix.y, p.z - fix.z);
    // (the closest approach of each placing)
    fix.dmin = Math.min(fix.dmin ?? 1e9, d);
    minD = Math.min(minD, d);
    if (fix.age > 3 && fix.age < 6 && (p.x - fix.x) * fx + (p.z - fix.z) * fz > 0 && d < 40) dueEarly++;
  }
  const gaps = cuts.slice(1).map((c, i) => c - cuts[i]);
  return { cuts: cuts.length, gaps, minD, maxApproach };
}

for (const v of [45, 60, 125]) {
  const r = fly(v);
  ok(r.cuts >= 6 && r.cuts <= 20 && Math.min(...r.gaps) > 5, `at ${v} m/s the camera is placed again every ${(r.gaps.reduce((a, b) => a + b, 0) / r.gaps.length).toFixed(1)} s on average, never in under ${Math.min(...r.gaps).toFixed(1)} s (${r.cuts} places in two minutes)`);
  ok(r.minD > 60, `and never nearer than ${r.minD.toFixed(0)} m to the aircraft`);
}
const slow = fly(0);
ok(slow.gaps.every((g) => g > 8) && slow.minD > 20 && slow.minD < 70, `an aircraft on the ground gets a camera 20-60 m from it, moved every ${slow.gaps[0].toFixed(0)} s`);
const plane = { id: 2, x: 0, y: 300, z: 0, speed: 60 };
const a = flybyPlace(null, plane, 0, 0, -1, 1, false, rng);
ok(a.z < -300 && a.z > -800 && Math.abs(a.x) > 70 && Math.abs(a.x) < 140, `a camera is placed ${(-a.z).toFixed(0)} m ahead, ${Math.abs(a.x).toFixed(0)} m off the path`);
const b = flybyPlace(a, plane, 0, 0, -1, 1, false, rng);
ok(Math.sign(a.x) !== Math.sign(b.x), 'the next one is on the other side of the path');
