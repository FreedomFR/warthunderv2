// The hit volume of aircraft: node test/planehit.mjs
// An aircraft is hit by what its airframe presents to the line of fire (sim/airhit.js): the type, the aspect and where the rounds land against where it is.
import { World } from '../js/game/sim/world.js';
import { presentedArea, extentToward, roundHitChance, lightAAHitRate } from '../js/game/sim/airhit.js';
import { AA } from '../js/game/sim/aadata.js';
import { PLANES } from '../js/game/model/planes.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const mkp = (k, h = 0, pitch = 0) => ({ typeKey: k, spec: PLANES[k], heading: h, pitch, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });

// ---- the area an aircraft shows ----
{
  // an aircraft flying north: the shooter looks along +z (from the north: head-on), +x (from the west: the side), -y (from above)
  let bad = [];
  const rows = [];
  for (const k of Object.keys(PLANES)) {
    const p = mkp(k), head = presentedArea(p, 0, 0, 1), tail = presentedArea(p, 0, 0, -1), side = presentedArea(p, 1, 0, 0), top = presentedArea(p, 0, -1, 0);
    rows.push([k, head, side, top]);
    if (!(head < side && side < top)) bad.push(k + ' ' + [head, side, top].map((v) => v.toFixed(1)).join('/'));
    if (Math.abs(head - tail) > 1e-9) bad.push(k + ' differs front and back');
    const big = PLANES[k].role === 'level';      // the land-based bombers: four-engined ones show 25-30 m2 head-on and 150-200 from above
    if (big ? (head < 8 || head > 45 || side < 25 || side > 100 || top < 80 || top > 260) : (head < 1.5 || head > 12 || side < 5 || side > 30 || top < 18 || top > 85)) bad.push(k + ' out of range ' + [head, side, top].map((v) => v.toFixed(1)).join('/'));
  }
  ok(bad.length === 0, `every type is smallest head-on, larger from the side and largest from above, and of a believable size (head-on 1.5-12 m2, side 5-30, top 18-85; the bombers 8-45, 25-100, 80-260)${bad.length ? ': ' + bad.join('; ') : ''}`);
  const A = Object.fromEntries(rows.map((r) => [r[0], r]));
  ok(A.tbf[2] > A.sbd[2] * 1.4 && A.tbf[3] > A.sbd[3] * 1.3 && A.sbd[2] > A.a6m[2] && A.swordfish[3] > A.a6m[3] * 1.8 && A.re2001[3] < A.sbd[3] * 0.7, `an Avenger shows ${(A.tbf[2] / A.sbd[2]).toFixed(1)} times the side of a Dauntless, a Swordfish ${(A.swordfish[3] / A.a6m[3]).toFixed(1)} times the top of a Zero, a Re.2001 is small`);
  // the same aircraft, turned: the shooter's view follows the heading and the pitch
  const east = mkp('sbd', Math.PI / 2);
  ok(Math.abs(presentedArea(east, 1, 0, 0) - presentedArea(mkp('sbd'), 0, 0, 1)) < 1e-6 && Math.abs(presentedArea(east, 0, 0, 1) - presentedArea(mkp('sbd'), 1, 0, 0)) < 1e-6, 'an aircraft that turns from north to east shows to the east what it showed to the north');
  const dive = mkp('sbd', 0, -1.1);
  ok(presentedArea(dive, 0, 0, 1) > presentedArea(mkp('sbd'), 0, 0, 1) * 3, `in a dive (65 degrees) its top is shown to a gun on the horizon: ${presentedArea(dive, 0, 0, 1).toFixed(1)} m2 against ${presentedArea(mkp('sbd'), 0, 0, 1).toFixed(1)}`);
  // the outline for a burst
  const e = (k, q) => extentToward(mkp(k), ...q);
  ok(e('swordfish', [1, 0, 0]) > 6 && e('swordfish', [0, 1, 0]) < 1.6 && e('sbd', [0, 0, -1]) > 4, `a burst is judged from the outline: ${e('swordfish', [1, 0, 0]).toFixed(1)} m across the wings of a Swordfish, ${e('swordfish', [0, 1, 0]).toFixed(1)} m above its body`);
}

// ---- the pattern of the rounds ----
{
  const c = (A, m, s) => roundHitChance(A, m, s);
  ok(c(20, 0, 5) > c(20, 5, 5) && c(20, 5, 5) > c(20, 15, 5) && c(20, 40, 5) < 1e-6, 'the farther the centre of the pattern is from the aircraft, the fewer rounds hit');
  ok(c(40, 3, 6) > c(10, 3, 6) * 3.5 && c(20, 0, 4) > c(20, 0, 8) * 3, 'a bigger target is hit more, a tighter pattern hits more');
  ok(c(50, 0, 0.5) === 1 && c(5, 0, 50) < 0.002, 'the chance is that of a round: at most 1, and tiny when the pattern is far wider than the aircraft');
}

// ---- the light AA against aircraft of different types and courses ----
{
  const w = new World(1); w.addTeam(0); w.addTeam(1);
  const ship = w.addShip('essex', 0, 0, 0, 0);
  ship.roll = 0;
  const a = ship.aaMounts.find((m) => m.rec.variant === 'bofors') || ship.aaMounts[0];
  const cfg = AA[a.rec.variant];
  const pos = ship.toWorld(a.rec.x, a.rec.y + 1.2, a.rec.z, [0, 0, 0]);
  // an aircraft 1 500 m away to the east at 400 m, aimed at perfectly: the gun points where it will be (the lead for the constant velocity of the aircraft)
  const aimed = (k, vx, vz, dist = 1500, heading = null) => {
    const p = mkp(k, heading ?? Math.atan2(vx, -vz));
    p.x = pos[0] + dist; p.y = pos[1] + 350; p.z = pos[2]; p.vx = vx; p.vz = vz; p.vy = 0;
    const tof = Math.hypot(dist, 350) / (cfg.vb * 0.72);
    const tx = p.x + vx * tof - pos[0], ty = p.y - pos[1], tz = p.z + vz * tof - pos[2];
    a.train = Math.atan2(tx, -tz) - ship.heading - a.rec.yaw0; a.elev = Math.atan2(ty, Math.hypot(tx, tz));
    return lightAAHitRate(ship, a, p, cfg, pos, Math.hypot(dist, 350));
  };
  ok(aimed('swordfish', 0, -46) > aimed('a6m', 0, -92) * 1.5, `a slow Swordfish is hit ${(aimed('swordfish', 0, -46) / aimed('a6m', 0, -92)).toFixed(1)} times as often as a Zero crossing at the same place (more area, the same dispersion)`);
  ok(aimed('sbd', 0, -75, 800) > aimed('sbd', 0, -75, 2400) * 4, `the nearer, the more hits (${aimed('sbd', 0, -75, 800).toFixed(3)} a second at 800 m, ${aimed('sbd', 0, -75, 2400).toFixed(3)} at 2 400 m)`);
  // the gun that does not point at the aircraft hits nothing
  const p = mkp('sbd', 0); p.x = pos[0] + 1000; p.y = pos[1] + 300; p.z = pos[2]; p.vz = -75;
  a.train = Math.PI; a.elev = 0.1;
  ok(lightAAHitRate(ship, a, p, cfg, pos, 1050) < 1e-9, 'a mount pointed the other way scores nothing');
  // a mount that is late with its lead (it aims at where the aircraft is, not where it will be) misses a fast crosser far more than a slow one
  const late = (k, v) => { const q = mkp(k, 0); q.x = pos[0] + 1200; q.y = pos[1] + 300; q.z = pos[2]; q.vz = -v; a.train = Math.atan2(q.x - pos[0], -(q.z - pos[2])) - ship.heading - a.rec.yaw0; a.elev = Math.atan2(q.y - pos[1], Math.hypot(q.x - pos[0], q.z - pos[2])); return lightAAHitRate(ship, a, q, cfg, pos, Math.hypot(1200, 300)); };
  ok(late('sbd', 30) > late('sbd', 100) * 3, `aimed without lead, a crosser at 30 m/s is hit ${late('sbd', 30).toFixed(3)} times a second and one at 100 m/s ${late('sbd', 100).toExponential(1)}`);
}
process.exit(fail ? 1 : 0);
