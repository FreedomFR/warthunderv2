// Every light AA mount of every ship has its gun data, its hit points and its ammunition (a missing entry crashed the first battle in which an aircraft came near the ship).
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { AA } from '../js/game/sim/aadata.js';
import { AA_HP, AA_ROUNDS } from '../js/game/sim/modules.js';
import { AA_GUNS, AMMO, UNIT } from '../js/game/data/airguns.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

const w = new World(1); w.addTeam(0); w.addTeam(1);
ALL_SHIPS.forEach((s, i) => spawnFleet(w, i % 2, [{ id: s.id, count: 1 }], i * 600, 0, 0));
const variants = new Set(), missing = new Set(), guns = new Set(), noGun = new Set();
for (const sh of w.ships) for (const a of sh.aaMounts) {
  variants.add(a.rec.variant); guns.add(a.rec.gun);
  if (!AA_GUNS[a.rec.gun] || !AA[a.rec.gun]) noGun.add(`${sh.stats.id}:${a.rec.variant}/${a.rec.gun}`);
  if (!AA[a.rec.variant] || !(AA_HP[a.rec.variant] > 0) || !(AA_ROUNDS[a.rec.variant] > 0)) missing.add(`${sh.stats.id}:${a.rec.variant}`);
  if (!Number.isFinite(a.hp ?? 1)) missing.add(`${sh.stats.id}:${a.rec.variant} hp`);
}
ok(missing.size === 0, `${variants.size} kinds of light AA mount (${[...variants].join(', ')}) all have gun data, hit points and rounds${missing.size ? ': missing ' + [...missing].join(', ') : ''}`);
ok(noGun.size === 0, `every light AA mount names its real gun (${[...guns].join(', ')})${noGun.size ? ': ' + [...noGun].slice(0, 5).join(', ') : ''}`);
{
  const bad = [];
  for (const [k, g] of Object.entries(AA_GUNS)) { if (!AMMO[g.round] || !(g.rpm > 0) || !(g.v0 > 0) || AMMO[g.round].cal > g.cal + 1.5 || AMMO[g.round].cal < g.cal - 1.5) bad.push(k); }
  ok(!bad.length, `${Object.keys(AA_GUNS).length} AA guns fire a round of their calibre${bad.length ? ': ' + bad.join(', ') : ''}`);
  // what a hit does and how fast a barrel fires come from the gun and its round, not from a class: a 40 mm round is worth more than a 20 mm one, a Bofors fires slower than an Oerlikon
  ok(Math.abs(AA.bofors40.hit - AMMO.hei40bf.dmg * UNIT) < 1e-9 && AA.bofors40.hit > 2 * AA.oerlikon20.hit && AA.oerlikon20.rps > 3 * AA.bofors40.rps, 'a hit of a 40 mm gun is worth over twice a 20 mm one, a Bofors barrel fires a third as fast as an Oerlikon');
  ok(AA.flak37.rps > AA.bofors40.rps && AA.fr37_1925.rps < 0.5 && AA.fr37_1933.rps > 1.5, 'a Flak 37 mm fires faster than a Bofors, the semi-automatic French 37 mm of 1925 only a few rounds a minute');
  ok(AA.bofors40.ammo === AMMO.hei40bf && AA.flak38.ammo.blast > 0, 'the round goes with the hit (its fire and its blast)');
}
for (const [k, c] of Object.entries(AA)) ok(c.range > 0 && c.rps > 0 && c.dps > 0 && c.hit > 0 && c.turn > 0, `${k}: complete gun data`);
if (fail) process.exit(1);
