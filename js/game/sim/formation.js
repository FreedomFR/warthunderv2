// Fleet placement: the ships start in the order of battle of sim/fleet.js (destroyers screening ahead, the line in column behind the flagship,
// carriers at the back), the whole fleet facing the enemy.
import { AIController } from './controllers/ai.js';
import { BY_ID } from '../data/ships.js';
import { stationPlan } from './fleet.js';

/**
 * entries: [{ id: shipSpecId, count }]. (cx, cz) = centre of the fleet's front, heading in rad (faces the enemy).
 * Returns the ships created.
 */
export function spawnFleet(world, teamId, entries, cx, cz, heading, opts = {}) {
  const specs = [];
  for (const e of entries) for (let i = 0; i < (e.count || 1); i++) specs.push(BY_ID[e.id]);
  // the order of battle of sim/fleet.js: the flagship leads the line, the destroyers screen ahead, the carriers sail behind (the front of the fleet is at (cx, cz))
  const key = opts.fleetKey ?? teamId;
  const fleet = world.fleetOf(key, teamId);
  fleet.circle = opts.circle ?? (world.rng() < 0.5 ? 1 : -1);
  const plan = stationPlan(specs.map((s) => ({ type: s.type, L: s.loa })), fleet.circle, opts.spread ?? 1);
  const fx = Math.sin(heading), fz = -Math.cos(heading);      // forward
  const rx = Math.cos(heading), rz = Math.sin(heading);       // right
  const front = Math.max(...plan.map((p) => (p ? p.f : 0)));
  const out = [];
  specs.forEach((spec, i) => {
    const p = plan[i] || { f: 0, r: 0 };
    const f = p.f - front, r = p.r;
    const x = cx + fx * f + rx * r, z = cz + fz * f + rz * r;
    const ship = world.addShip(spec.id, teamId, x, z, heading, { throttle: 0, speed: 0 });
    ship.controller = opts.controller ? opts.controller(ship) : new AIController();
    ship.fleetKey = key;
    out.push(ship);
  });
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
