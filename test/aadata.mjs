// Every light AA mount of every ship has its gun data, its hit points and its ammunition (a missing entry crashed the first battle in which an aircraft came near the ship).
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { AA } from '../js/game/sim/aadata.js';
import { AA_HP, AA_ROUNDS } from '../js/game/sim/modules.js';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

const w = new World(1); w.addTeam(0); w.addTeam(1);
ALL_SHIPS.forEach((s, i) => spawnFleet(w, i % 2, [{ id: s.id, count: 1 }], i * 600, 0, 0));
const variants = new Set(), missing = new Set();
for (const sh of w.ships) for (const a of sh.aaMounts) {
  variants.add(a.rec.variant);
  if (!AA[a.rec.variant] || !(AA_HP[a.rec.variant] > 0) || !(AA_ROUNDS[a.rec.variant] > 0)) missing.add(`${sh.stats.id}:${a.rec.variant}`);
  if (!Number.isFinite(a.hp ?? 1)) missing.add(`${sh.stats.id}:${a.rec.variant} hp`);
}
ok(missing.size === 0, `${variants.size} kinds of light AA mount (${[...variants].join(', ')}) all have gun data, hit points and rounds${missing.size ? ': missing ' + [...missing].join(', ') : ''}`);
for (const [k, c] of Object.entries(AA)) ok(c.range > 0 && c.rps > 0 && c.dps > 0 && c.hit > 0 && c.turn > 0, `${k}: complete gun data`);
if (fail) process.exit(1);
