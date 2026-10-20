// No gun house is sunk in a structure, a funnel, a mast or another house: node test/overlap.mjs  (the audit is tools/audit/overlap.mjs)
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { auditShip } from '../tools/audit/overlap.mjs';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
let touching = 0;
for (const spec of ALL_SHIPS) {
  const rows = auditShip(spec);
  touching += rows.length;
  const bugs = rows.filter((r) => r.bug);
  ok(bugs.length === 0, `${spec.id}: no house sunk in something${bugs.length ? ' (' + bugs.map((r) => `${r.name} ${r.at} ${r.depth.toFixed(1)} m in ${r.by}`).join('; ') + ')' : ''}`);
}
console.log(touching, 'houses touch something by less than the limits');
