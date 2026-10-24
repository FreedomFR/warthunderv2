// The supply decisions of a captain: when to leave the fight and go to a port, and how to get there. A ship that is almost out of shells, or too battered to go on (flooded, her
// machinery or her guns gone, her people lost), is given a mission, `resupply`: she heads for the nearest friendly port that can take her in, is brought alongside (sim/ports.js),
// and when she is whole and full the captain has her back. There is nothing of this in a battle without ports (the old scenarios): `portsOf` is then empty and nobody leaves.
import { clamp } from '../math.js';
import { nearestPort, beginDocking, ammoMissing, needsRepair, findBerth } from './ports.js';

/** Why this ship should go to a port, or null: 'ammo' | 'repair'. */
export function needFor(ship) {
  const st = ship.stats;
  const main = ship.ammoLeft('main');
  // a gun ship with a fifth of her main shells left (a destroyer's torpedoes count for her too) or an empty secondary armament and the main one worn down
  const torps = ship.torpLeft > 0 && ship.tubes.length > 0;
  const mainDry = main.frac < 0.2 && !(st.type === 'DD' && torps && main.frac > 0.1);
  const carrierDry = st.type === 'CV' && ship.air && ship.air.ready + ship.air.fReady < ship.air.cap0 * 0.25;
  if (mainDry || carrierDry) return 'ammo';
  if (ammoMissing(ship) > 0.75) return 'ammo';
  const need = needsRepair(ship);
  const crippled = ship.condition < 0.5 || ship.engine * ship.propulsion < 0.55 || (ship.mainAlive != null && ship.mounts.filter((m) => m.group === 'main').length > 0 && ship.mainAlive <= ship.mounts.filter((m) => m.group === 'main').length * 0.4);
  if (need > 0.32 || crippled || ship.deckWrecked) return 'repair';
  return null;
}

/**
 * Called by the captain every few seconds: puts a mission on the ship when she needs a port and one can take her, takes it off when she has been served. The port is the nearest one of
 * her team that has room for her.
 */
export function review(ship, world) {
  if (ship.dock || ship.state !== 'afloat') return;
  if (ship.mission) {
    // the port may have been lost: another one, or the mission is off
    const m = ship.mission, p = m.port;
    if (!p || p.inert || !p.alive || p.serviceFrac < 0.15 || !findBerth(p, ship)) {
      const q = nearestPort(world, ship.team, ship.x, ship.z, ship);
      if (q) m.port = q; else ship.mission = null;
    }
    return;
  }
  if (!world.bases.length) return;
  const why = needFor(ship);
  if (!why) return;
  // the ship only goes when it is worth the trip: a port within reach of her speed and fuel (a day's steaming is plenty on the map), or a flagship does not leave a fleet in the middle of a fight she is winning
  const port = nearestPort(world, ship.team, ship.x, ship.z, ship);
  if (!port) return;
  ship.mission = { type: 'resupply', why, port, t0: world.time };
  world.events.push({ type: 'resupply', ship, port, why });
}

/**
 * The navigation of a ship on a mission: writes her command and returns true when she is steered by it (the guns and the torpedoes stay with the captain's targeting).
 * She goes straight to the approach point of the port (round the islands), and is taken in when she is there and the port has a place for her.
 */
export function missionNav(ship, world, cmd) {
  const m = ship.mission;
  if (!m || ship.dock) return false;
  if (m.type === 'resupply') {
    const p = m.port, A = p.layout.approach, T = world.terrain;
    const d = Math.hypot(A.x - ship.x, A.z - ship.z);
    if (d < 900) {
      const slot = findBerth(p, ship);
      if (slot && beginDocking(world, ship, p, slot)) return true;
      // no place yet: she waits off the port, under way
      cmd.desiredHeading = Math.atan2(A.x - ship.x + 600, -(A.z - ship.z - 300)); cmd.throttle = 0.25;
      return true;
    }
    let want = Math.atan2(A.x - ship.x, -(A.z - ship.z));
    let vx = Math.sin(want), vz = -Math.cos(want), thr = d > 4000 ? 0.85 : 0.5;
    if (T) {
      const wp = T.detour(ship.x, ship.z, A.x, A.z);
      if (wp) { want = Math.atan2(wp[0] - ship.x, -(wp[1] - ship.z)); vx = Math.sin(want); vz = -Math.cos(want); }
      const av = T.avoid(ship.x, ship.z, ship.heading, ship.speed, ship.stats.L);
      const mm = Math.hypot(av.ax, av.az);
      if (mm > 0.01) { const k = Math.min(mm, 3.2) / mm * 1.3; vx += av.ax * k; vz += av.az * k; }
      thr = Math.min(thr, Math.max(0.3, av.slow));
    }
    // her own people and the other ships: the same collision rule as in a fight (a ship far from a fleet sails alone)
    cmd.desiredHeading = Math.atan2(vx, -vz);
    cmd.throttle = clamp(thr, 0.2, 1);
    return true;
  }
  return false;
}
