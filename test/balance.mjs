// The damage multipliers: node test/balance.mjs — config/balance.json is complete and valid, the layers (neutral, file, browser) stack, and each multiplier changes
// the damage of its cause only.
import { hullHit } from '../js/game/sim/hull.js';
import { planeParts } from '../js/game/sim/planedamage.js';
import { PLANES } from '../js/game/model/planes.js';
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
const s = w.ships[0];
// (the blow to the hull, as the strength of the structure it takes: the structure of the compartment it lands in, in hull strengths)
const dmgOf = (cause, amount = 500) => { const c = s.comps[0]; const was = c.struct; hullHit(s, { lx: s.stats.L / 2 - 1, ly: -1, lz: 0, energy: amount, cause, attacker: null }); const d = (c.struct - was) * s.stats.hullStrength * 0.35; c.struct = was; c.leaks = 0; s.holes.length = 0; return d; };
const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, b);
ok(near(dmgOf('shell'), 500), 'neutral: a ship takes the damage as computed');
setBalance({ ships: { shell: 2, torpedo: 0 } });
ok(near(dmgOf('shell'), 1000) && dmgOf('torpedo') === 0 && near(dmgOf('bomb'), 500), `shell x2 doubles the damage of shells (${dmgOf('shell').toFixed(0)}), torpedo x0 makes torpedoes harmless, bombs unchanged`);
// an aircraft tough enough that no part is lost: the damage is what its parts have lost
const p = { spec: { ...PLANES.sbd, hp: 1000 }, typeKey: 'sbd', cond: 1, phase: 'cruise', lost: {}, smoke: 0, fire: 0, x: 0, y: 500, z: 0, heading: 0, pitch: 0, speed: 50, vx: 0, vy: 0, vz: -50 };
const total = () => { const P = planeParts(p); return [P.wingL, P.wingR, P.tail, P.body, P.fuel, P.pilot, P.ctl, ...P.eng].reduce((a, q) => a + q.hp, 0); };
const t0 = total();
setBalance({ planes: { gun: 0, aa: 2 } });
hitPlane(w, null, p, 0.5, 12.7, 'gun');
ok(total() === t0, 'fighter guns x0: the aircraft is not touched');
hitPlane(w, null, p, 0.5, 40, 'aa');
ok(t0 - total() >= 0.999, `AA x2: a hit of 0.5 takes 1 off the part it lands on (${(t0 - total()).toFixed(2)} off the aircraft with what it passes on)`);
setBalance(null);
ok(JSON.stringify(balanceNeutral()) === JSON.stringify(BALANCE), 'back to neutral');
