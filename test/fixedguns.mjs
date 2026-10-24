// The guns of the aircraft: node test/fixedguns.mjs — every aircraft has the guns the real one carried (fixed and flexible), each gun has its muzzle on the model (in the wing, over the engine,
// through the hub), the guns fire along their own lines, the strike aircraft shoot at what crosses their nose and at the ship they dive on, and what the aircraft's own structure blocks is known.
import { execFileSync } from 'node:child_process';
import { PLANES } from '../js/game/model/planes.js';
import { FIXED_GUNS, GUNS, BELTS } from '../js/game/data/airguns.js';
import { planeGuns, isBlocked, inField } from '../js/game/model/planeGuns.js';
import { fixedMuzzles, wingLE } from '../js/game/model/fixedGuns.js';
import { armament, strikeGuns } from '../js/game/sim/fighters.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const D = Math.PI / 180;

// ---- what each type carried (barrels): the published fits ----
const FIXED = { f6f: 6, p40: 6, spitfire: 6, a6m: 4, fulmar: 8, bf109t: 3, d520: 5, mc202: 4, il2: 4, sbd: 2, tbf: 2, d3a: 2, swordfish: 1, skua: 4, ju87: 2, fi167: 1, ln401: 2, pl10: 1, re2001: 4, re2001t: 4, sm79: 1, b5n: 0 };
const FLEX = { p40: 0, spitfire: 0, sbd: 2, tbf: 2, d3a: 1, b5n: 1, swordfish: 1, skua: 1, ju87: 1, fi167: 1, pl10: 2, il2: 1, ln401: 0, re2001: 0, b17: 13, b29: 13, lancaster: 8, g4m: 5, he111: 5, sm79: 4, leo451: 3, f6f: 0, a6m: 0 };
for (const [k, n] of Object.entries(FIXED)) {
  const fit = FIXED_GUNS[k] || [], have = fit.reduce((a, g) => a + g.n, 0);
  ok(have === n, `${k}: ${have} fixed guns (the real aircraft: ${n})`);
}
for (const [k, n] of Object.entries(FLEX)) {
  const have = planeGuns(PLANES[k], k).reduce((a, g) => a + g.n, 0);
  ok(have === n, `${k}: ${have} barrels on flexible mounts and in turrets (the real aircraft: ${n})`);
}
// every aircraft of the game that has a gun position or a fixed gun has been audited above
const listed = new Set([...Object.keys(FIXED), ...Object.keys(FLEX)]);
const missing = Object.keys(PLANES).filter((k) => !listed.has(k) && (FIXED_GUNS[k] || planeGuns(PLANES[k], k).length));
ok(!missing.length, `every armed aircraft is in the list of what the real one carried${missing.length ? ' (not: ' + missing.join(' ') + ')' : ''}`);

// ---- the fixed guns on the model ----
let bad = [];
for (const [k, fit] of Object.entries(FIXED_GUNS)) {
  const s = PLANES[k], mz = fixedMuzzles(s, k);
  fit.forEach((g, i) => {
    if (!GUNS[g.gun] || !BELTS[g.belt]) bad.push(`${k} ${g.gun}: gun or belt unknown`);
    if (mz[i].guns.length !== g.n) bad.push(`${k} ${g.gun}: ${mz[i].guns.length} muzzles for ${g.n} guns`);
    for (const m of mz[i].guns) {
      if (Math.abs(m.z) > s.span / 2 * 0.85) bad.push(`${k} ${g.gun}: muzzle at z ${m.z.toFixed(1)} outside the wing`);
      if (m.x > s.L * 0.42 + 1.2 || m.x < -s.L * 0.3) bad.push(`${k} ${g.gun}: muzzle at x ${m.x.toFixed(1)} off the nose`);
      if (g.mount === 'wing' && !s.v4) { const le = wingLE(s, Math.abs(m.z)); if (m.x <= le.x) bad.push(`${k} ${g.gun}: wing gun behind the leading edge`); }
    }
  });
}
ok(!bad.length, `every fixed gun has its muzzle on the aircraft (in the wing, over the engine, in the hub)${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
const f6f = armament('f6f');
ok(f6f.length === 1 && f6f[0].mz.length === 6 && f6f[0].mz.filter((m) => m.z > 0).length === 3, 'the Hellcat has three .50 in each wing, as muzzles');
ok(armament('a6m').some((g) => g.cal === 20 && g.mz.every((m) => Math.abs(m.z) > 1.5)) && armament('a6m').some((g) => g.cal < 10 && g.mz.every((m) => Math.abs(m.z) < 0.5)), 'the Zero: the cannons in the wings, the machine guns over the engine');
const p40 = armament('p40');
ok(p40.length === 1 && p40[0].mz.length === 6 && p40[0].mz.filter((m) => m.z > 0).length === 3 && p40[0].mz.every((m) => Math.abs(Math.abs(m.z) - 1.9) < 0.4), 'the P-40E has three .50 in each wing, as muzzles at the stations of the model (1.7 to 2.1 m from the centre line)');
const spit = armament('spitfire');
ok(spit.length === 2 && spit.some((g) => g.cal === 20 && g.mz.length === 2 && g.mz.every((m) => Math.abs(m.z) < 2.6)) && spit.some((g) => g.cal < 10 && g.mz.length === 4 && g.mz.every((m) => Math.abs(m.z) > 2.9)), 'the Spitfire Mk XII has a 20 mm cannon in each wing, inboard of two .303');
ok(armament('bf109t').some((g) => g.mz.length === 1 && g.mz[0].z === 0), 'the Bf 109 has its cannon in the hub, on the axis');

// ---- the strike aircraft fire ----
const lcg = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const mk = (typeKey, o) => ({ typeKey, spec: PLANES[typeKey], team: 0, fighter: false, x: 0, y: 1500, z: 0, vx: 0, vy: 0, vz: -80, speed: 80, heading: 0, pitch: 0, roll: 0, phase: 'cruise', owner: { alive: true }, ...o });
const enemy = (o) => ({ typeKey: 'a6m', spec: PLANES.a6m, team: 1, fighter: true, x: 0, y: 1500, z: -300, vx: 0, vy: 0, vz: -90, heading: 0, pitch: 0, roll: 0, phase: 'cap', ...o });
const run = (planes, secs, extra = {}) => {
  const world = { planes, events: [], rng: lcg(11), time: 100, ...extra };
  let hits = 0;
  for (let i = 0; i < secs * 30; i++) { world.time += 1 / 30; strikeGuns(world, 1 / 30, { hit: () => { hits++; } }); }
  return { world, hits, fire: world.events.filter((e) => e.type === 'mgFire') };
};
{
  const p = mk('sbd'), r = run([p, enemy()], 5);
  ok(r.fire.length > 0 && r.fire.every((e) => e.guns && e.guns.length === 12), `a Dauntless fires its two .50 at a fighter crossing its nose (${r.fire.length} bursts, ${r.hits} hits)`);
  ok(p.guns[0].left < 360, `and the rounds are used (${p.guns[0].left.toFixed(0)} of 360 left in each gun)`);
  const beam = run([mk('sbd'), enemy({ x: 300, z: 0, vz: -90 })], 3);
  ok(beam.fire.length === 0, 'a fighter on its beam is not shot at: the guns are fixed ahead');
  const own = run([mk('sbd'), enemy({ team: 0 })], 3);
  ok(own.fire.length === 0, 'nor a friend');
  const rear = run([mk('b5n'), enemy()], 3);
  ok(rear.fire.length === 0, 'a Kate has no gun that fires ahead');
}
{
  // the dive: nose 57 degrees down on a ship 763 m ahead and 1188 m below
  const ship = { alive: true, x: 0, z: -763, vx: 0, vz: 0 };
  const p = mk('d3a', { phase: 'dive', kind: 'dive', target: ship, pitch: -1.0, vy: -90, y: 1200 }), r = run([p], 2);
  ok(r.fire.length > 0 && r.fire.every((e) => !e.target && e.guns.length === 12), `a dive bomber strafes the ship it dives on (${r.fire.length} bursts from its two guns)`);
  ok(p.guns[0].left < 600, 'and spends rounds on it');
  const far = run([mk('d3a', { phase: 'dive', kind: 'dive', target: { ...ship, z: -3000 }, pitch: -1.0, vy: -90, y: 1200 })], 2);
  ok(far.fire.length === 0, 'not before the ship is within reach');
  const torp = run([mk('tbf', { phase: 'dive', kind: 'torp', target: ship, pitch: -1.0, y: 1200 })], 2);
  ok(torp.fire.length === 0, 'a torpedo bomber does not dive on a ship');
  const empty = mk('d3a', { phase: 'dive', kind: 'dive', target: ship, pitch: -1.0, y: 1200 });
  for (const g of (empty.guns = armament('d3a'))) g.left = 0;
  ok(run([empty], 2).fire.length === 0, 'a gun with no rounds left does not fire');
}

// ---- what the aircraft's own structure blocks ----
{
  const he = planeGuns(PLANES.he111, 'he111').filter((g) => g.t === 'beam');
  ok(he.every((g) => g.blocked && isBlocked(g, g.arc.c - Math.sign(g.arc.c) * 0.9, -0.05) && !isBlocked(g, g.arc.c, 0.1)), 'the waist guns of the He 111 cannot fire level ahead of the beam through the wing, but can fire at the beam');
  const sbd = planeGuns(PLANES.sbd, 'sbd')[0];
  ok(inField(sbd, 160 * D, -0.25) && isBlocked(sbd, 160 * D, -0.25) && !isBlocked(sbd, 160 * D, 0.3), 'the Dauntless gunner cannot fire low astern through his own tailplane (but can above it)');
  const out = execFileSync('node', ['tools/audit/gunarcs.mjs', '--check'], { encoding: 'utf8' }).trim().split('\n').pop();
  ok(out.startsWith('PASS'), 'the table of blocked directions is up to date with the models: ' + out.slice(5));
}
console.log(fail ? `${fail} FAILED` : 'ALL OK');
