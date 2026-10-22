// Firing arcs of the ships drawn from a reference model (Kagero, Tade, Gioberti, Adams): what each gun and each torpedo launcher can bear on.
// node test/arcs.mjs
import { World } from '../js/game/sim/world.js';
import { updateTorpedoes } from '../js/game/sim/weapons.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { getModel } from '../js/game/model/cache.js';
import { clearElev, tubeBears } from '../js/game/model/clearance.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const D2R = Math.PI / 180, dg = (r) => Math.round(r / D2R);
const SHIPS = ['kagero', 'tade', 'gioberti', 'adams'];
const model = (id) => getModel(ALL_SHIPS.find((s) => s.id === id));

// ---- the guns: every main mount fires over the sector it faces, and none is shut in ----
for (const id of SHIPS) {
  const m = model(id);
  for (const r of m.mounts) {
    const name = `${id} ${r.group} ${r.label || ''} (x ${r.x.toFixed(1)})`;
    const width = dg(r.arcMax - r.arcMin);
    ok(!r.noArc && width >= 200, `${name}: trains over ${width} degrees (${dg(r.arcMin)}..${dg(r.arcMax)} round ${dg(r.arcC)})`);
    // what it faces: the mounts of the fore part fire ahead, the others astern
    const facing = r.arcC;
    if (r.group === 'main') ok(Math.abs(Math.abs(facing) - (r.x > 0 ? 0 : Math.PI)) < 0.02 || r.bothBeams, `${name}: faces ${r.x > 0 ? 'ahead' : 'astern'}`);
    // never through its own ship at the low elevation of a surface shot (sampled each 15 degrees over the arc)
    let blockedLow = 0;
    for (let a = r.arcMin; a <= r.arcMax; a += 15 * D2R) if (clearElev(r, r.arcC + a) > 24 * D2R) blockedLow++;
    ok(blockedLow <= 8, `${name}: ${blockedLow} of the sampled bearings need more than 24 degrees of elevation to clear the ship`);
  }
}
{
  // the gun between the funnels of the Tade fires on both beams, and not through the funnels
  const b = model('tade').mounts.find((r) => r.label === 'B');
  ok(b && b.bothBeams && clearElev(b, 90 * D2R) < 8 * D2R && clearElev(b, -90 * D2R) < 8 * D2R, 'tade B: free abeam on both sides');
  ok(clearElev(b, 0) > 20 * D2R && clearElev(b, Math.PI) > 20 * D2R, 'tade B: the funnels stop a low shot ahead and astern');
}

// ---- the launchers: the sectors of each, from what stands round it ----
for (const id of SHIPS) {
  const m = model(id);
  ok(m.tubes.length >= 2, `${id}: ${m.tubes.length} launchers`);
  for (const t of m.tubes) {
    const name = `${id} launcher at x ${t.x.toFixed(1)} (z ${t.z.toFixed(1)}, ${t.n} tubes)`;
    ok(!t.noArc && t.sectors && t.sectors.length > 0, `${name}: has a sector`);
    const own = t.z < -1.4 ? -1 : 1;
    ok(tubeBears(t, own * 90 * D2R), `${name}: fires abeam to ${own > 0 ? 'starboard' : 'port'}`);
    if (Math.abs(t.z) < 1.4) ok(tubeBears(t, -90 * D2R), `${name}: and to port (centre line)`);
    else ok(!tubeBears(t, -Math.sign(t.z) * 90 * D2R), `${name}: and not to the opposite beam (a side launcher)`);
    ok(!tubeBears(t, 0) && !tubeBears(t, Math.PI), `${name}: not dead ahead or astern`);
  }
}
{
  const ad = model('adams');
  const p = ad.tubes.find((t) => t.z < 0), s = ad.tubes.find((t) => t.z > 0);
  ok(p && s && p.sectors.every((q) => q[1] < 0) && s.sectors.every((q) => q[0] > 0), 'adams: the port launcher fires to port, the starboard one to starboard');
}

// ---- in a battle: the salvo goes only when a launcher bears, and no more than those launchers can send ----
{
  const fire = (id, bearingDeg, seed = 3) => {
    const w = new World(seed); w.addTeam(0); w.addTeam(1);
    const ship = w.addShip(id, 0, 0, 0, 0);                    // heading 0 = north (-z)
    const a = bearingDeg * D2R, R = 3000;
    const tgt = w.addShip('fletcher', 1, Math.sin(a) * R, -Math.cos(a) * R, 0);
    w.start();
    tgt.vx = 0; tgt.vz = 0; ship.heading = 0;
    ship.cmd.torpedo.target = tgt; ship.cmd.torpedo.fire = true;
    ship.torpLeft = ship.stats.torpedo.tubes; w.torpedoes.length = 0;
    updateTorpedoes(ship, w, 0.1);
    return w.torpedoes.length;
  };
  ok(fire('adams', 0) === 0, 'adams: nothing fired at a target dead ahead');
  const sb = fire('adams', 90), pt = fire('adams', -90);
  ok(sb >= 2 && sb <= 3 && pt >= 2 && pt <= 3, `adams: a salvo of at most one launcher's three tubes abeam (${sb} to starboard, ${pt} to port)`);
  ok(fire('adams', 10) === 0 && fire('adams', -170) === 0, 'adams: nothing fired inside the dead sectors near the bow and the stern');
  for (const id of ['kagero', 'tade', 'gioberti']) ok(fire(id, 90) >= 2 && fire(id, -90) >= 2, `${id}: fires to either beam`);
  ok(fire('kagero', 5) === 0, 'kagero: nothing fired at a target almost ahead');
}

console.log(fail ? `${fail} FAILED` : 'ALL OK');
