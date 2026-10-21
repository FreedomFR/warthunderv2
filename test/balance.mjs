// The damage multipliers: node test/balance.mjs — config/balance.json is complete and valid, the layers (neutral, file, browser) stack, and each multiplier changes
// the damage of its cause only.
import fs from 'node:fs';
import { BALANCE, BALANCE_FIELDS, setBalance, setBalanceFile, balanceDiff, balanceNeutral } from '../js/game/data/balance.js';
import { World } from '../js/game/sim/world.js';
import { spawnFleet } from '../js/game/sim/formation.js';
import { hitPlane } from '../js/game/sim/planedamage.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

const file = JSON.parse(fs.readFileSync(new URL('../config/balance.json', import.meta.url), 'utf8'));
const missing = [];
for (const [g, f] of Object.entries(BALANCE_FIELDS)) for (const [k] of f.keys) if (typeof file[g]?.[k] !== 'number') missing.push(g + '.' + k);
ok(!missing.length, `config/balance.json has every multiplier (${missing.join(', ') || 'none missing'})`);
ok(JSON.stringify(balanceNeutral()) === JSON.stringify(BALANCE), 'without a file the multipliers are all 1 (what the tests run with)');

// the layers
setBalanceFile({ ships: { shell: 2 }, planes: { aa: 0.5 } });
ok(BALANCE.ships.shell === 2 && BALANCE.planes.aa === 0.5 && BALANCE.ships.torpedo === 1, 'the file sets its values, the others stay at 1');
setBalance({ ships: { torpedo: 3, bogus: 9 }, planes: { gun: 'x' }, other: { a: 1 } });
ok(BALANCE.ships.torpedo === 3 && BALANCE.ships.shell === 2 && BALANCE.planes.gun === 1 && !('bogus' in BALANCE.ships), 'the browser\'s values go over the file\'s; unknown keys and bad values are ignored');
ok(JSON.stringify(balanceDiff()) === JSON.stringify({ ships: { torpedo: 3 } }), 'what is kept in the browser is only what differs from the file');
setBalance({ ships: { bomb: 99, fire: -4 } });
ok(BALANCE.ships.bomb === 5 && BALANCE.ships.fire === 0, 'a value is held between 0 and 5');
setBalance(null);
ok(BALANCE.ships.torpedo === 1 && BALANCE.ships.shell === 2, '"Valeurs du fichier" goes back to the file');
setBalanceFile(null);

// the multipliers act on their own cause
const w = new World(3); w.addTeam(0); w.addTeam(1);
spawnFleet(w, 0, [{ id: 'baltimore', count: 1 }], 0, 0, 0);
const s = w.ships[0], dmgOf = (cause, amount = 500) => { const h0 = s.hp; s.applyDamage(amount, null, cause); const d = h0 - s.hp; s.hp = h0; return d; };
ok(dmgOf('shell') === 500, 'neutral: a ship takes the damage as computed');
setBalance({ ships: { shell: 2, torpedo: 0 } });
ok(dmgOf('shell') === 1000 && dmgOf('torpedo') === 0 && dmgOf('bomb') === 500, `shell x2 doubles the damage of shells (${dmgOf('shell')}), torpedo x0 makes torpedoes harmless, bombs unchanged`);
const p = { hp: 4, maxHp: 4, phase: 'cruise', lost: {}, smoke: 0, fire: 0, x: 0, y: 500, z: 0 };
setBalance({ planes: { gun: 0, aa: 2 } });
hitPlane(w, null, p, 0.5, 12.7, 'gun');
ok(p.hp === 4, 'fighter guns x0: the aircraft is not touched');
hitPlane(w, null, p, 0.5, 40, 'aa');
ok(Math.abs(p.hp - 3) < 1e-9, 'AA x2: a hit of 0.5 takes 1');
setBalance(null);
ok(JSON.stringify(balanceNeutral()) === JSON.stringify(BALANCE), 'back to neutral');
