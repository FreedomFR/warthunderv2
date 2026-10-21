// Autonomous captain. Writes a ShipCommand (see ship.js) every ~0.5 s: picks targets, chooses a fighting
// range and heading, launches torpedoes and air strikes, avoids collisions, withdraws when crippled.
import { clamp, D2R } from '../../math.js';
import { torpedoSolution } from '../weapons.js';

const TYPE_VALUE = { DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3, BASE: 1.4 };
const MAP_RADIUS = 26000;

/** The base worth shooting at from `ship` (within `reach`, in sight): { bt, s } or null. A battery that has fired on the ship counts for more. */
function bestBase(ship, world, reach, T, current) {
  let out = null;
  for (const bt of world.baseTargetsOf(ship)) {
    const d = Math.hypot(bt.x - ship.x, bt.z - ship.z);
    bt._d = d;
    if (d > reach) continue;
    if (T && T.blocks(ship.x, ship.model.topY * 0.6, ship.z, bt.x, bt.y + 4, bt.z)) continue;
    const fired = (bt.base.shotAt.get(ship.id) ?? -1e9) > world.time - 90;
    let s = TYPE_VALUE.BASE * (fired ? 1.5 : bt.base.layout.kind === 'battery' ? 0.8 : 0.5) / (0.35 + d / reach);
    if (bt === current) s *= 1.35;
    if (!out || s > out.s) out = { bt, s };
  }
  return out;
}

export class AIController {
  constructor(opts = {}) {
    this.timer = 0;
    this.init = false;
    this.opts = opts;
  }

  update(ship, world, dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = (0.4 + world.rng() * 0.2) * (ship.commandLoss ? 2.2 : 1);       // the bridge is wrecked: slower to react
    this.think(ship, world, 0.5);
  }

  think(ship, world, dt) {
    const st = ship.stats, cmd = ship.cmd, rng = world.rng;
    if (!this.init) {
      this.init = true;
      this.circle = rng() < 0.5 ? -1 : 1;
      this.aggr = this.opts.aggression ?? (0.85 + 0.35 * rng());
      this.zig = 1; this.zigT = 8 + rng() * 20;
      this.retreatT = 0;
    }
    // a ship that sails with a fleet follows its captain (sim/fleet.js): same way round the enemy, same target for the line, a station to keep
    const fleet = ship.station ? world.fleetOf(ship.team) : null;
    if (fleet && fleet.circle) this.circle = fleet.circle;
    const enemies = world.enemiesOf(ship);
    if (!enemies.length) {
      cmd.throttle = 0.35; cmd.torpedo.fire = false; cmd.air.launch = false;
      // no enemy ship left: the guns still work on a base in reach
      const cb = bestBase(ship, world, Math.min(st.main.maxRange * 0.93, st.visualRange), world.terrain, cmd.main.target);
      cmd.main.target = cb ? cb.bt : null; cmd.main.fire = true;
      cmd.sec.target = cb && cb.bt._d < (st.secs[0] ? st.secs[0].maxRange * 0.9 : 0) ? cb.bt : null; cmd.sec.fire = true;
      return;
    }
    for (const e of enemies) e._d = Math.hypot(e.x - ship.x, e.z - ship.z);
    enemies.sort((a, b) => a._d - b._d);
    const nearest = enemies[0];

    // ---- main battery target ----
    const gunR = st.main.maxRange * 0.93;
    const reach = Math.min(gunR, st.visualRange);
    let best = null, bs = 0;
    const T = world.terrain;
    for (const e of enemies) {
      if (e._d > reach) continue;
      // an island between the two ships hides the enemy: nobody shoots at what he cannot see
      if (T && T.blocks(ship.x, ship.model.topY * 0.6, ship.z, e.x, e.model.topY * 0.45, e.z)) continue;
      let s = TYPE_VALUE[e.stats.type] * (1 + (1 - e.hpFrac) * 0.9) / (0.35 + e._d / reach);
      if (e === ship.lastAttacker) s *= 1.25;
      if (e === cmd.main.target) s *= 1.35;
      if (fleet && e === fleet.focus && st.type !== 'DD') s *= 1.45;
      if (st.type === 'DD' || st.type === 'CL') s *= Math.pow(reach / Math.max(e._d, 1500), 0.7);
      if (s > bs) { bs = s; best = e; }
    }
    // a base on the shore is a target too, above all a battery that is firing at us
    const cb = bestBase(ship, world, reach, T, cmd.main.target);
    if (cb && cb.s > bs) { bs = cb.s; best = cb.bt; }
    cmd.main.target = best;
    cmd.main.fire = true;
    cmd.sec.target = best && best._d < (st.secs[0] ? st.secs[0].maxRange * 0.9 : 0) ? best : null;
    cmd.sec.fire = true;

    // ---- torpedoes ----
    const tp = st.torpedo;
    let torpTarget = null;
    if (tp && ship.torpLeft > 0) {
      let tb = 0;
      for (const e of enemies) {
        if (e._d < 2200 || e._d > clamp(tp.range * 0.5, 4500, 9000)) continue;
        if (T && T.blocks(ship.x, 0.4, ship.z, e.x, 0.4, e.z)) continue;           // the torpedoes would run onto the shore
        const s = TYPE_VALUE[e.stats.type] * (1 + 0.5 * (e === best)) / (1 + e._d / 8000);
        if (s > tb) { tb = s; torpTarget = e; }
      }
    }
    cmd.torpedo.target = torpTarget;
    cmd.torpedo.fire = !!torpTarget;

    // ---- air strike ----
    cmd.air.launch = !!(ship.air && nearest._d < 75000 && ship.air.ready >= 4);

    // ---- navigation ----
    const ref = best && !best.isBase ? best : nearest;
    const dx = ref.x - ship.x, dz = ref.z - ship.z, d = ref._d;
    const bearing = Math.atan2(dx, -dz);
    let Rd = {
      DD: 0.42, CL: 0.5, CA: 0.52, BB: 0.5, CV: 1.0,
    }[st.type] * st.main.maxRange * this.aggr;
    Rd = clamp(Rd, 3800, 17500);
    // nothing has been hit for a while: stop kiting and close in
    const lull = world.time - world.lastCombatT > 150 && world.time > 200;
    // the longer a battle drags on, the closer everybody fights (breaks long-range dances)
    const ramp = clamp(1 - Math.max(0, world.time - 420) / 1700, 0.42, 1);
    Rd *= ramp * (lull ? 0.7 : 1);
    if (st.type === 'CV') Rd = lull ? 9000 : Math.max(Rd, 22000 * ramp);
    if (tp && ship.torpLeft > 0) Rd = Math.min(Rd, clamp(tp.range * 0.5, 3800, 7500));
    ship.aiRd = Rd;                                  // what this ship would fight at; the captain takes the shortest of the line (sim/fleet.js)
    const stn = fleet ? ship.station : null;
    if (stn && stn.flag && fleet.Rd) Rd = fleet.Rd;
    let want, thr, torpRun = false;
    // a crippled ship withdraws, but only while it is still being shot at
    const crippled = (ship.hpFrac < 0.28 || (ship.engine * ship.propulsion < 0.4 && ship.hpFrac < 0.5)) && world.time - ship.lastHitT < 90;
    if (crippled && st.type !== 'DD') {
      want = bearing + Math.PI + this.circle * 0.35; thr = 1;
    } else if (d > Rd * 1.12) {
      want = bearing + this.circle * (d > Rd * 2 ? 12 : 28) * D2R; thr = d > Rd * 1.5 ? 1 : 0.85;
    } else if (d < Rd * 0.78) {
      want = bearing + this.circle * 135 * D2R; thr = 0.9;
    } else {
      const corr = clamp((d - Rd) / Rd, -0.3, 0.3);
      want = bearing + this.circle * (90 - corr * 120) * D2R; thr = 0.7;
    }
    // an island on the way to the enemy: go round it (the fan of probes below keeps the ship off the shallows)
    if (T && !crippled) {
      const wp = T.detour(ship.x, ship.z, ref.x, ref.z);
      if (wp) { want = Math.atan2(wp[0] - ship.x, -(wp[1] - ship.z)); thr = Math.max(thr, 0.8); }
    }
    // torpedo attack run: show the beam to the target
    if (torpTarget && d < clamp(tp.range * 0.5, 4500, 9000) * 1.15) {
      const bt = Math.atan2(torpTarget.x - ship.x, -(torpTarget.z - ship.z));
      // fixed bow tubes: steer onto the point where the torpedo meets the target; trainable ones: show the beam
      const sol = tp.bow ? torpedoSolution(ship, torpTarget, tp) : null;
      want = sol ? sol.bearing : bt + this.circle * 82 * D2R; thr = 1; torpRun = true;
    }
    // sailing with the fleet: keep the station (a ship breaks formation when it is crippled, in the middle of a torpedo run or too close to the enemy)
    let following = false;
    const fp = stn ? fleet.stationPoint(ship) : null;
    if (fp && !stn.flag && !crippled && !torpRun && ship.hpFrac > 0.3 && !(st.type !== 'DD' && st.type !== 'CV' && d < Rd * 0.55) && !(st.type === 'CV' && d < Rd * 0.85)) {
      const [sx, sz, fx, fz, rx, rz] = fp, F = fleet.flag;
      const ex = sx - ship.x, ez = sz - ship.z, dist = Math.hypot(ex, ez);
      const ea = ex * fx + ez * fz, el = ex * rx + ez * rz;      // metres short of the station along the course (+) and to starboard of the ship (+)
      const vF = Math.max(F.speed, 0);
      if (dist > stn.tether) {
        // back to the station, aiming a little ahead of it (it is moving)
        const lead = clamp(dist / Math.max(vF + 4, 6), 0, 25);
        want = Math.atan2(ex + F.vx * lead, -(ez + F.vz * lead));
        thr = dist > stn.tether * 2.2 ? 1 : clamp(vF / st.maxSpeed + 0.25 + ea / 1500, 0.4, 1);
      } else {
        want = F.heading + clamp(el / 450, -0.5, 0.5);
        thr = clamp(vF / st.maxSpeed * (1 + clamp(ea / 700, -0.3, 0.3)), 0.15, 1);
      }
      following = true;
    }
    if (stn && stn.flag && !crippled) thr = Math.min(thr, fleet.speedCap / st.maxSpeed);
    // evasive zigzag
    this.zigT -= dt;
    if (this.zigT <= 0) { this.zig = -this.zig; this.zigT = (st.type === 'DD' ? 9 : 16) + rng() * 20; }
    if (!following && !(torpRun && tp.bow)) want += this.zig * (st.type === 'DD' ? 14 : st.type === 'BB' ? 6 : 9) * D2R * (stn && stn.flag ? 0.5 : 1);

    // steering vector with obstacle avoidance and map boundary
    let vx = Math.sin(want), vz = -Math.cos(want);
    for (const o of world.ships) {
      if (o === ship || o.state === 'sunk') continue;
      const rx = o.x - ship.x, rz = o.z - ship.z;
      const dist = Math.hypot(rx, rz);
      const mate = o.team === ship.team && ship.station && o.station;            // ships of one fleet keep close order: they only avoid each other when really near
      const safe = (st.L + o.stats.L) * 0.5 + (mate ? 90 : 220) + (o.alive ? 0 : 120);
      // predicted closest point of approach
      const vx2 = o.vx - ship.vx, vz2 = o.vz - ship.vz;
      const vv = vx2 * vx2 + vz2 * vz2;
      let tcpa = vv > 0.01 ? -(rx * vx2 + rz * vz2) / vv : 0;
      tcpa = clamp(tcpa, 0, 140);
      const cx = rx + vx2 * tcpa, cz = rz + vz2 * tcpa;
      const cpa = Math.hypot(cx, cz);
      if (cpa < safe && dist < 3500) {
        const k = (1 - cpa / safe) * (1 - tcpa / 160) * 3.2;
        // steer away from where the other ship will be at the closest approach
        const cl = Math.max(cpa, 1);
        vx -= cx / cl * k; vz -= cz / cl * k;
        // if it is almost on top of us, also push directly away
        if (dist < safe * 0.7) { vx -= rx / Math.max(dist, 1) * 1.5; vz -= rz / Math.max(dist, 1) * 1.5; }
        if (dist < safe * 0.9 && tcpa < 40) thr = Math.min(thr, 0.45);
      }
    }
    if (T) {
      const av = T.avoid(ship.x, ship.z, ship.heading, ship.speed, st.L);
      const m = Math.hypot(av.ax, av.az);
      if (m > 0.01) { const k = Math.min(m, 3.2) / m * 1.3; vx += av.ax * k; vz += av.az * k; }
      thr = Math.min(thr, Math.max(0.3, av.slow));
    }
    const r = Math.hypot(ship.x, ship.z);
    if (r > MAP_RADIUS - 4000) {
      const k = clamp((r - (MAP_RADIUS - 4000)) / 4000, 0, 1.5);
      vx -= ship.x / r * k * 1.5; vz -= ship.z / r * k * 1.5;
    }
    cmd.desiredHeading = Math.atan2(vx, -vz);
    cmd.throttle = thr;
  }
}
