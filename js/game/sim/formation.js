// Fleet placement: ships are laid out in rows by class (destroyers in front, then cruisers,
// battleships, carriers at the back), each row line-abreast, the whole fleet facing the enemy.
import { AIController } from './controllers/ai.js';
import { BY_ID } from '../data/ships.js';

const ROW = { DD: 0, CL: 1, CA: 1, BB: 2, CV: 3 };

/**
 * entries: [{ id: shipSpecId, count }]. (cx, cz) = centre of the fleet's front, heading in rad (faces the enemy).
 * Returns the ships created.
 */
export function spawnFleet(world, teamId, entries, cx, cz, heading, opts = {}) {
  const rows = [[], [], [], []];
  for (const e of entries) {
    const spec = BY_ID[e.id];
    for (let i = 0; i < (e.count || 1); i++) rows[ROW[spec.type]].push(spec);
  }
  const fx = Math.sin(heading), fz = -Math.cos(heading);      // forward
  const rx = Math.cos(heading), rz = Math.sin(heading);       // right
  const out = [];
  let back = 0;
  for (const row of rows) {
    if (!row.length) continue;
    const maxL = Math.max(...row.map((s) => s.loa));
    const lat = Math.max(380, maxL * 2.3) * (opts.spread ?? 1);
    row.sort((a, b) => b.loa - a.loa);
    row.forEach((spec, i) => {
      // alternate left/right of the centre line so the row stays balanced
      const k = (i % 2 ? 1 : -1) * Math.ceil(i / 2) + (row.length % 2 === 0 ? 0.5 * (i % 2 ? -1 : 1) * 0 : 0);
      const off = (row.length % 2 === 1 ? k : (i - (row.length - 1) / 2)) * lat;
      const x = cx + rx * off - fx * back, z = cz + rz * off - fz * back;
      const ship = world.addShip(spec.id, teamId, x, z, heading, { throttle: 0, speed: 0 });
      ship.controller = opts.controller ? opts.controller(ship) : new AIController();
      out.push(ship);
    });
    back += Math.max(520, maxL * 1.9);
  }
  return out;
}

/** Standard placement of `n` teams facing each other around the origin. `sep` = distance between fleets (m). */
export function teamStart(teamIndex, nTeams, sep) {
  if (nTeams <= 2) {
    const sgn = teamIndex === 0 ? -1 : 1;
    return { x: sgn * sep / 2, z: 0, heading: sgn < 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  const a = (teamIndex / nTeams) * Math.PI * 2 + Math.PI / 4;
  const r = sep / 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, heading: Math.atan2(-Math.cos(a) * r, Math.sin(a) * r) };
}
