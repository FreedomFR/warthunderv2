// Autonomous captain. Writes a ShipCommand (see ship.js) every ~0.5 s: picks targets, chooses a fighting
// range and heading, launches torpedoes and air strikes, avoids collisions, withdraws when crippled.
import { clamp, wrapPi, D2R } from '../../math.js';

const TYPE_VALUE = { DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3 };
const MAP_RADIUS = 26000;

export class AIController {
  constructor(opts = {}) {
    this.timer = 0;
    this.init = false;
    this.opts = opts;
  }

  update(ship, world, dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4 + world.rng() * 0.2;
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
    const enemies = world.enemiesOf(ship);
    if (!enemies.length) { cmd.throttle = 0.35; cmd.main.target = null; cmd.sec.target = null; cmd.torpedo.fire = false; cmd.air.launch = false; return; }
    for (const e of enemies) e._d = Math.hypot(e.x - ship.x, e.z - ship.z);
    enemies.sort((a, b) => a._d - b._d);
    const nearest = enemies[0];

    // ---- main battery target ----
    const gunR = st.main.maxRange * 0.93;
    const reach = Math.min(gunR, st.visualRange);
    let best = null, bs = 0;
    for (const e of enemies) {
      if (e._d > reach) continue;
      let s = TYPE_VALUE[e.stats.type] * (1 + (1 - e.hpFrac) * 0.9) / (0.35 + e._d / reach);
      if (e === ship.lastAttacker) s *= 1.25;
      if (e === cmd.main.target) s *= 1.35;
      if (st.type === 'DD' || st.type === 'CL') s *= Math.pow(reach / Math.max(e._d, 1500), 0.7);
      if (s > bs) { bs = s; best = e; }
    }
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
        const s = TYPE_VALUE[e.stats.type] * (1 + 0.5 * (e === best)) / (1 + e._d / 8000);
        if (s > tb) { tb = s; torpTarget = e; }
      }
    }
    cmd.torpedo.target = torpTarget;
    cmd.torpedo.fire = !!torpTarget;

    // ---- air strike ----
    cmd.air.launch = !!(ship.air && nearest._d < 75000 && ship.air.ready >= 4);

    // ---- navigation ----
    const ref = best || nearest;
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
    let want, thr;
    // a crippled ship withdraws, but only while it is still being shot at
    const crippled = (ship.hpFrac < 0.28 || (ship.engine < 0.4 && ship.hpFrac < 0.5)) && world.time - ship.lastHitT < 90;
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
    // torpedo attack run: show the beam to the target
    if (torpTarget && d < clamp(tp.range * 0.5, 4500, 9000) * 1.15) {
      const bt = Math.atan2(torpTarget.x - ship.x, -(torpTarget.z - ship.z));
      want = bt + this.circle * 82 * D2R; thr = 1;
    }
    // evasive zigzag
    this.zigT -= dt;
    if (this.zigT <= 0) { this.zig = -this.zig; this.zigT = (st.type === 'DD' ? 9 : 16) + rng() * 20; }
    want += this.zig * (st.type === 'DD' ? 14 : st.type === 'BB' ? 6 : 9) * D2R;

    // steering vector with obstacle avoidance and map boundary
    let vx = Math.sin(want), vz = -Math.cos(want);
    for (const o of world.ships) {
      if (o === ship || o.state === 'sunk') continue;
      const rx = o.x - ship.x, rz = o.z - ship.z;
      const dist = Math.hypot(rx, rz);
      const safe = (st.L + o.stats.L) * 0.5 + 220 + (o.alive ? 0 : 120);
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
    const r = Math.hypot(ship.x, ship.z);
    if (r > MAP_RADIUS - 4000) {
      const k = clamp((r - (MAP_RADIUS - 4000)) / 4000, 0, 1.5);
      vx -= ship.x / r * k * 1.5; vz -= ship.z / r * k * 1.5;
    }
    cmd.desiredHeading = Math.atan2(vx, -vz);
    cmd.throttle = thr;
  }
}
