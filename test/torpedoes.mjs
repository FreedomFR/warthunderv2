// Torpedoes: the real power of each warhead (TNT equivalent), the damage that follows from it, the fixed bow tubes of a motor torpedo boat.
// node test/torpedoes.mjs
import { World } from '../js/game/sim/world.js';
import { resolveTorpedoHit } from '../js/game/sim/damage.js';
import { AIController } from '../js/game/sim/controllers/ai.js';
import { updateTorpedoes } from '../js/game/sim/weapons.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { EXPLOSIVE, AIR_TORPEDO, airTorpedoEq, tntEquivalent } from '../js/game/data/explosives.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };
const mk = (id, seed = 1) => { const w = new World(seed); w.addTeam(0); w.addTeam(1); const s = w.addShip(id, 1, 0, 0, 0); w.start(); return { w, s }; };

// ---- the table of fillers ----
ok(EXPLOSIVE.torpex > EXPLOSIVE.hbx && EXPLOSIVE.hbx > EXPLOSIVE.hexanite && EXPLOSIVE.hexanite >= EXPLOSIVE.tnt, 'Torpex > HBX > hexanite >= TNT');
ok(Math.abs(tntEquivalent(100, 'torpex') - 150) < 1e-9 && tntEquivalent(100) === 100, 'Torpex is 50 % stronger than TNT by mass, TNT is the reference');
ok(airTorpedoEq('USA') > airTorpedoEq('UK') * 2, `the Mk 13 (${airTorpedoEq('USA').toFixed(0)} kg of TNT) is more than twice a Swordfish's Mk XII (${airTorpedoEq('UK').toFixed(0)} kg)`);
ok(['USA', 'Japan', 'UK', 'Germany', 'France', 'Italy'].every((n) => AIR_TORPEDO[n]), 'every nation has an aircraft torpedo');

// ---- every ship that carries torpedoes states what is in them, and the sim works on the TNT equivalent ----
for (const spec of ALL_SHIPS) {
  const t = spec.torpedoes;
  if (!t || !t.tubes) continue;
  const { s } = mk(spec.id);
  const tp = s.stats.torpedo;
  ok(t.explosive && EXPLOSIVE[t.explosive], `${spec.id}: the filler is named (${t.explosive})`);
  ok(Math.abs(tp.warhead - tntEquivalent(t.warheadKg, t.explosive)) < 1e-9 && tp.filler === t.warheadKg, `${spec.id}: ${t.warheadKg} kg of ${t.explosive} = ${tp.warhead.toFixed(0)} kg of TNT`);
  ok(tp.warhead >= (t.caliberMm < 400 ? 40 : 190) && tp.warhead <= 560, `${spec.id}: a plausible ship torpedo (${tp.warhead.toFixed(0)} kg of TNT)`);
}

// ---- damage follows the power ----
{
  const dmg = (id, W) => { const { w, s } = mk(id, 4); const p = s.toWorld(10, 0, s.stats.B / 2, [0, 0, 0]); resolveTorpedoHit(w, s, { warhead: W, owner: null }, p[0], p[2]); return s.holes.reduce((a, h) => a + h.rate, 0) + s.comps.reduce((a, c) => a + c.struct * 100, 0); };      // (the hole and the broken structure it leaves)
  const avg = (id, W) => { let a = 0; for (let i = 0; i < 1; i++) a += dmg(id, W); return a; };
  const small = avg('iowa', airTorpedoEq('UK')), big = avg('iowa', airTorpedoEq('USA')), t93 = avg('iowa', mk('kagero').s.stats.torpedo.warhead);
  ok(small < big && big < t93 * 1.2, `damage to a battleship: Mk XII ${small.toFixed(0)} < Mk 13 ${big.toFixed(0)}, Type 93 ${t93.toFixed(0)}`);
  const tor = (id, W) => { const { w, s } = mk(id, 2); let k = 0; while (s.state === 'afloat' && k < 40) { const p = s.toWorld(s.stats.L * [0.12, -0.08, 0.2, -0.2][k % 4], 0, (k % 2 ? 1 : -1) * s.stats.B / 2, [0, 0, 0]); resolveTorpedoHit(w, s, { warhead: W, owner: null }, p[0], p[2]); for (let i = 0; i < 20; i++) s.update(0.1); k++; } return k; };
  const nSwordfish = tor('cleveland', airTorpedoEq('UK')), nType93 = tor('cleveland', mk('kagero').s.stats.torpedo.warhead);
  ok(nSwordfish > nType93, `a light cruiser needs ${nSwordfish} Swordfish torpedoes and ${nType93} Type 93`);
}

// ---- the S-30: two fixed tubes in the bow, fired only when the bow points at the target ----
{
  const w = new World(3); w.addTeam(0); w.addTeam(1);
  const boat = w.addShip('s30', 0, 0, 0, 0);               // heading north (0 = -z)
  const target = w.addShip('fletcher', 1, 0, -2800, Math.PI / 2);   // dead ahead, crossing
  w.start();
  const tp = boat.stats.torpedo;
  ok(tp.bow && tp.tubes === 2 && boat.torpSpare === 2, 'the boat has two bow tubes and two torpedoes in store');
  boat.cmd.torpedo.target = target; boat.cmd.torpedo.fire = true;
  // target off the bow: nothing happens
  target.x = 2500; target.z = -300; target.vx = 0; target.vz = 0;
  boat.heading = 0;
  w.torpedoes.length = 0; boat.torpLeft = 2;
  updateTorpedoes(boat, w, 0.1);
  ok(w.torpedoes.length === 0 && boat.torpLeft === 2, 'a target on the beam is not fired at: the tubes are fixed');
  // target ahead: both torpedoes go, close to the heading
  target.x = 0; target.z = -2800; target.vx = 0; target.vz = 0;
  boat.cmd.torpedo.fire = true;
  updateTorpedoes(boat, w, 0.1);
  ok(w.torpedoes.length === 2 && boat.torpLeft === 0, `target dead ahead: ${w.torpedoes.length} torpedoes leave the bow`);
  const dirs = w.torpedoes.map((t) => Math.atan2(t.vx, -t.vz));
  ok(dirs.every((d) => Math.abs(d) < 0.03) && Math.abs(w.torpedoes[0].warhead - tp.warhead) < 1e-9, 'they run straight ahead with the warhead of the G7a');
  // the store: two more after the reload, then nothing
  for (let i = 0; i < 20 * 190 && boat.torpLeft === 0; i++) updateTorpedoes(boat, w, 0.05);
  ok(boat.torpLeft === 2 && boat.torpSpare === 0, 'the two torpedoes of the store are loaded after the reload');
  boat.cmd.torpedo.fire = true; updateTorpedoes(boat, w, 0.1);
  boat.torpReload = 180;
  for (let i = 0; i < 20 * 400; i++) updateTorpedoes(boat, w, 0.05);
  ok(boat.torpLeft === 0 && boat.torpSpare === 0, 'with the store empty the boat stays empty');
}

// ---- a boat with the AI turns onto the target and torpedoes it ----
{
  const w = new World(5); w.addTeam(0); w.addTeam(1);
  const boat = w.addShip('s30', 0, 0, 3600, 0, { throttle: 0.7 });
  const enemy = w.addShip('fletcher', 1, 0, -400, Math.PI / 2, { throttle: 0.5, speed: 8 });
  boat.controller = new AIController();          // the target sails on, unarmed: the test is about the boat's run
  w.start();
  let fired = false;
  for (let i = 0; i < 10 * 500 && !fired; i++) { w.update(0.1); if (boat.torpFired > 0) fired = true; }
  ok(fired, `the S-30 fires its torpedoes in an automatic battle (after ${w.time.toFixed(0)} s)`);
  for (let i = 0; i < 10 * 400 && boat.torpHits === 0 && enemy.alive; i++) w.update(0.1);
  ok(boat.torpHits > 0 && (enemy.holes.length > 0 || enemy.waterFill > 0 || enemy.state !== 'afloat'), `and one of them hits the target (${enemy.holes.length} holes, ${(enemy.waterFill * 100).toFixed(0)} % of the water she can take)`);
}

console.log(fail ? `${fail} FAILED` : 'ALL OK');
