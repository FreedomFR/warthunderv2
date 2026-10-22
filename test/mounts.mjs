// Every gun of every ship: node test/mounts.mjs
// Geometry (no mount buried in a structure, none on top of another, every gun has an arc to train over, the casemates and light AA have a field of fire) and
// the sim (a gun that is told to engage a ship on any bearing turns to it and fires when the arc and the towers allow it; the guns that cannot bear do not).
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { buildShipModel } from '../js/game/model/shipbuilder.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
import { inFoot } from '../js/game/model/clearance.js';
import { World } from '../js/game/sim/world.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; process.exitCode = 1; console.log('FAIL', m); } };
const D = 180 / Math.PI;

// ---- the models ----
const models = {};
for (const spec of ALL_SHIPS) {
  const m = buildShipModel(spec, TWEAKS[spec.id] || {});
  models[spec.id] = m;
  const all = [...m.mounts.map((r, i) => ({ r, n: `${r.group}${r.label || i}` })), ...m.aaMounts.map((r, i) => ({ r, n: `aa${i}` }))];
  for (const { r, n } of all) {
    for (const s of m.solids) if (s[2] < r.y - 0.2 && s[3] > r.y + 0.2 && inFoot(s, r.x, r.z, -0.1)) { ok(false, `${spec.id}: ${n} is buried in a structure (y ${s[2].toFixed(1)}..${s[3].toFixed(1)})`); break; }
    ok(!r.noArc, `${spec.id}: ${n} has no free arc at all`);
    if (!r.noArc) ok(r.arcMax - r.arcMin > 40 / D, `${spec.id}: ${n} can only train over ${((r.arcMax - r.arcMin) * D).toFixed(0)} degrees`);
  }
  // torpedo tubes: not inside a structure, not under a gun
  for (const [i, t] of m.tubes.entries()) {
    for (const s of m.solids) if (s[2] < t.y - 0.3 && s[3] > t.y + 0.3 && inFoot(s, t.x, t.z, -0.1)) { ok(false, `${spec.id}: tube mount ${i} is buried in a structure (y ${s[2].toFixed(1)}..${s[3].toFixed(1)})`); break; }
    ok(!all.some(({ r }) => Math.abs(r.x - t.x) < 2.5 && Math.abs(r.z - t.z) < 2.5 && Math.abs(r.y - t.y) < 2), `${spec.id}: tube mount ${i} stands on a gun`);
  }
  for (let i = 0; i < m.mounts.length; i++) for (let j = i + 1; j < m.mounts.length; j++) {
    const a = m.mounts[i], b = m.mounts[j], ra = Math.max(1.4, a.cal / 1000 * (a.n >= 3 ? 11 : 9)), rb = Math.max(1.4, b.cal / 1000 * (b.n >= 3 ? 11 : 9));
    ok(!(Math.hypot(a.x - b.x, a.z - b.z) < (ra + rb) * 0.75 && Math.abs(a.y - b.y) < 2.4), `${spec.id}: mounts ${a.label || i} and ${b.label || j} overlap`);
  }
  // the main battery has something to fire with on each beam
  const main = m.mounts.filter((r) => r.group === 'main');
  for (const side of [-1, 1]) {
    const bearing = side * Math.PI / 2;
    const can = main.filter((r) => { const rel = bearing - r.arcC; const w = ((rel + Math.PI * 3) % (2 * Math.PI)) - Math.PI; return !r.noArc && w >= r.arcMin && w <= r.arcMax; }).reduce((a, r) => a + r.n, 0);
    const guns = main.reduce((a, r) => a + r.n, 0);
    ok(can >= guns * 0.5, `${spec.id}: only ${can} of ${guns} main guns bear on the ${side > 0 ? 'starboard' : 'port'} beam`);
  }
}

// ---- the sim: a target on each of eight bearings ----
for (const id of ['iowa', 'bismarck', 'littorio', 'cleveland', 'yamato']) {
  const spec = ALL_SHIPS.find((s) => s.id === id);
  const fired = new Set(), trained = new Set();
  for (let k = 0; k < 8; k++) {
    const w = new World(7 + k); w.addTeam(0); w.addTeam(1);
    const a = k * Math.PI / 4, range = 9000;
    const s = w.addShip(id, 0, 0, 0, 0);
    const t = w.addShip('yamato', 1, Math.sin(a) * range, -Math.cos(a) * range, 0);
    t.cmd.throttle = 0; s.cmd.throttle = 0;
    w.start();
    s.cmd.main.target = t; s.cmd.sec.target = t; s.cmd.main.fire = true; s.cmd.sec.fire = true;
    for (let i = 0; i < 500; i++) {
      s.cmd.main.target = t; s.cmd.sec.target = t;
      w.update(0.1);
      for (const e of w.drainEvents()) if (e.type === 'muzzle' && e.ship === s) fired.add(s.mounts.indexOf(e.mount));
      s.mounts.forEach((m, i) => { if (Math.abs(m.trainRel) > 5 / D) trained.add(i); if (m.trainRel !== 0 && !(m.trainRel >= m.rec.arcMin - 1e-6 && m.trainRel <= m.rec.arcMax + 1e-6)) ok(false, `${id}: mount ${i} trained outside its arc (${(m.trainRel * D).toFixed(0)})`); });
      if (!t.alive) break;
    }
  }
  const mains = spec.main.mounts.length;
  const mainFired = [...fired].filter((i) => models[id].mounts[i].group === 'main').length;
  ok(mainFired === mains, `${id}: ${mainFired} of ${mains} main mounts fired over the eight bearings`);
  const secs = models[id].mounts.filter((r) => r.group === 'sec' && r.cal >= 140).length;
  const secFired = [...fired].filter((i) => models[id].mounts[i].group === 'sec' && models[id].mounts[i].cal >= 140).length;
  ok(secs === 0 || secFired >= secs * 0.7, `${id}: ${secFired} of ${secs} heavy secondary mounts fired`);
  console.log(`${id}: ${mainFired}/${mains} main, ${secFired}/${secs} heavy secondary mounts fired; ${trained.size} mounts trained`);
}
console.log(fail ? `${fail} check(s) failed` : 'all mounts OK');
