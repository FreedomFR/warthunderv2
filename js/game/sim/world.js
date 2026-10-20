// The simulation world: ships, shells, torpedoes, aircraft, teams, events, victory.
import { makeRng, clamp, D2R } from '../math.js';
import { Ship } from './ship.js';
import { makeStats, pickName } from './shipdata.js';
import { getModel } from '../model/cache.js';
import { BY_ID } from '../data/ships.js';
import { updateGunnery, updateTorpedoes } from './weapons.js';
import { stepShell } from './ballistics.js';
import { segmentNearShip, segmentHit, resolveShellHit, resolveTorpedoHit } from './damage.js';
import { updateAir } from './aircraft.js';
import { spawnPartDebris, stepDebris } from './debris.js';
import { magazineExplosion, shipGone, secondaryBlast, breakInTwo } from './explosions.js';
import { FleetCommand } from './fleet.js';

const statsCache = new Map();
function statsFor(spec) {
  let s = statsCache.get(spec.id);
  if (!s) { s = makeStats(spec); statsCache.set(spec.id, s); }
  return s;
}

export const TEAM_COLORS = [
  { name: 'Bleus', rgb: [60, 130, 235] },
  { name: 'Rouges', rgb: [230, 70, 60] },
  { name: 'Verts', rgb: [70, 190, 90] },
  { name: 'Jaunes', rgb: [235, 190, 50] },
];

let nextShell = 1;

export class World {
  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.time = 0;
    this.ships = [];
    this.shells = [];
    this.torpedoes = [];
    this.planes = [];
    this.bombs = [];
    this.debris = [];
    this.seaFires = [];          // burning oil / fuel on the water
    this.timers = [];            // scheduled callbacks (sequences of explosions)
    this.events = [];
    this.teams = [];
    this.state = 'setup';        // setup | running | finished
    this.winner = null;
    this.finishT = 0;
    this.nameCounts = new Map();
    this.kills = [];
    this._enemyCache = new Map();
    this.fleets = new Map();     // the captain of each team's fleet (sim/fleet.js)
    this.terrain = null;         // the islands (sim/terrain.js), or null
    this.timeLimit = 3600;
    this.lastCombatT = 0;        // last time a ship damaged another (used by the AI to break stalemates)
  }

  addTeam(id, name, rgb) {
    const t = { id, name: name || TEAM_COLORS[id % 4].name, rgb: rgb || TEAM_COLORS[id % 4].rgb };
    this.teams[id] = t;
    return t;
  }

  addShip(specId, teamId, x, z, heading, opts = {}) {
    const spec = BY_ID[specId];
    if (!spec) throw new Error('unknown ship ' + specId);
    const stats = statsFor(spec);
    const model = getModel(spec);
    const key = teamId + ':' + specId;
    const idx = this.nameCounts.get(key) || 0;
    this.nameCounts.set(key, idx + 1);
    const ship = new Ship(this, spec, stats, model, teamId, x, z, heading, opts.name || pickName(stats, idx));
    ship.speed = opts.speed ?? 0;
    ship.cmd.throttle = opts.throttle ?? 0;
    this.ships.push(ship);
    return ship;
  }

  removeShip(ship) {
    const i = this.ships.indexOf(ship);
    if (i >= 0) this.ships.splice(i, 1);
  }

  clear() {
    this.ships.length = 0; this.shells.length = 0; this.torpedoes.length = 0; this.planes.length = 0;
    this.bombs.length = 0; this.debris.length = 0; this.seaFires.length = 0; this.timers.length = 0;
    this.events.length = 0; this.time = 0; this.lastCombatT = 0; this.state = 'setup'; this.winner = null; this.kills.length = 0;
    this.nameCounts.clear();
    this.fleets.clear();
    this.terrain = null;
  }

  // ---- queries ----------------------------------------------------------------------------------------
  fleetOf(team) { let f = this.fleets.get(team); if (!f) { f = new FleetCommand(team); this.fleets.set(team, f); } return f; }
  enemiesOf(ship) {
    const out = [];
    for (const s of this.ships) if (s.team !== ship.team && s.alive) out.push(s);
    return out;
  }
  nearestEnemy(ship, maxRange = 1e9) {
    let best = null, bd = maxRange * maxRange;
    for (const s of this.ships) {
      if (s.team === ship.team || !s.alive) continue;
      const dx = s.x - ship.x, dz = s.z - ship.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  teamAlive(teamId) { return this.ships.some((s) => s.team === teamId && s.alive); }
  aliveTeams() {
    const set = new Set();
    for (const s of this.ships) if (s.alive) set.add(s.team);
    return [...set];
  }

  // ---- spawning ----------------------------------------------------------------------------------------
  spawnShell(o) {
    o.id = nextShell++; o.age = 0; o.px = o.x; o.py = o.y; o.pz = o.z;
    this.shells.push(o);
  }
  spawnTorpedo(o) { o.id = nextShell++; o.age = 0; o.travel = 0; this.torpedoes.push(o); }

  /** Run fn after `sec` simulated seconds (used for the sequence of an explosion). */
  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

  addSeaFire(x, z, r, life, power = 1) {
    if (this.seaFires.length > 28) this.seaFires.shift();
    this.seaFires.push({ x, z, r, t: life, life, power });
  }
  spawnPartDebris(ship, part, idx) { spawnPartDebris(this, ship, part, idx); }
  shipGone(ship) { shipGone(this, ship); }

  start() { this.state = 'running'; }

  // ---- simulation ----------------------------------------------------------------------------------------
  update(dt) {
    if (this.state === 'setup') { for (const s of this.ships) s.update(dt); return; }
    // fixed sub-steps keep the physics stable at high time scales
    const n = Math.max(1, Math.ceil(dt / 0.05));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.step(h);
  }

  step(dt) {
    this.time += dt;
    if (this.state === 'running') for (const t of this.teams) if (t) this.fleetOf(t.id).update(this, dt);
    for (const s of this.ships) {
      if (s.alive && s.controller) s.controller.update(s, this, dt);
      s.update(dt);
    }
    this.collisions(dt);
    if (this.terrain) this.grounding(dt);
    if (this.state === 'running') for (const s of this.ships) if (s.alive) { updateGunnery(s, this, dt); updateTorpedoes(s, this, dt); }
    // once the battle is won the guns fall silent but the air goes on: the aircraft in the air go home and land (or ditch), the decks go on working
    if (this.state === 'running' || this.state === 'finished') updateAir(this, dt);
    this.stepShells(dt);
    this.stepTorpedoes(dt);
    stepDebris(this, dt);
    for (let i = this.seaFires.length - 1; i >= 0; i--) { this.seaFires[i].t -= dt; if (this.seaFires[i].t <= 0) this.seaFires.splice(i, 1); }
    if (this.timers.length) {
      for (let i = 0; i < this.timers.length; i++) {
        const tm = this.timers[i];
        if (tm.t <= this.time) { this.timers.splice(i--, 1); tm.fn(); }
      }
    }
    this.checkVictory(dt);
  }

  stepShells(dt) {
    const arr = this.shells;
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      s.px = s.x; s.py = s.y; s.pz = s.z;
      stepShell(s, s.c, dt);
      s.age += dt;
      let done = false;
      // ships
      for (const ship of this.ships) {
        if (ship === s.owner || (s.owner && ship.team === s.owner.team)) continue;     // no friendly fire
        if (ship.state === 'sunk' || ship.split) continue;
        if (!segmentNearShip(ship, s.px, s.py, s.pz, s.x, s.y, s.z)) continue;
        const hit = segmentHit(ship, s.px, s.py, s.pz, s.x, s.y, s.z);
        if (hit) {
          if (ship.state === 'afloat' || ship.sinkDepth < 3) resolveShellHit(this, ship, s, hit);
          done = true;
          break;
        }
      }
      if (!done && this.terrain && s.y > -5) {
        // the ground: a shell that goes into a slope bursts there
        for (const f of [0.34, 0.67, 1]) {
          const x = s.px + (s.x - s.px) * f, y = s.py + (s.y - s.py) * f, z = s.pz + (s.z - s.pz) * f, gh = this.terrain.heightAt(x, z);
          if (gh > 0 && y <= gh) {
            this.events.push({ type: 'landImpact', x, y: gh, z, cal: s.gun.cal, shell: s.type, dx: s.vx, dz: s.vz });
            done = true;
            break;
          }
        }
      }
      if (!done && s.y <= 0 && s.vy < 0) {
        // water impact
        const f = s.py / (s.py - s.y);
        const ix = s.px + (s.x - s.px) * f, iz = s.pz + (s.z - s.pz) * f;
        this.events.push({ type: 'splash', x: ix, z: iz, cal: s.gun.cal, shell: s.type, dx: s.vx, dz: s.vz, speed: Math.hypot(s.vx, s.vy, s.vz) });
        // spotting: the firing ship corrects its aim from where the splashes land
        const o = s.owner;
        if (o && s.group === 'main' && s.target && s.target.alive) {
          const d = Math.hypot(ix - s.target.x, iz - s.target.z);
          if (d < 160) o.gunAcc = Math.max(0.85, o.gunAcc - 0.18);
          else if (d < 420) o.gunAcc = Math.max(0.85, o.gunAcc - 0.07);
          else if (d > 900) o.gunAcc = Math.min(3.2, o.gunAcc + 0.03);
        }
        done = true;
      }
      if (done || s.age > 160 || s.y < -50) arr.splice(i, 1);
    }
  }

  stepTorpedoes(dt) {
    const arr = this.torpedoes;
    for (let i = arr.length - 1; i >= 0; i--) {
      const t = arr[i];
      if (t.air && t.h > 0) {
        // dropped from an aircraft: falls to the water, then starts its run
        t.hv -= 9.81 * dt; t.h += t.hv * dt;
        t.x += Math.sin(t.fallDir) * t.fallSpeed * dt; t.z -= Math.cos(t.fallDir) * t.fallSpeed * dt;
        t.fallSpeed *= Math.exp(-0.3 * dt);
        if (t.h <= 0) { t.h = 0; this.events.push({ type: 'splash', x: t.x, z: t.z, cal: 330 }); this.events.push({ type: 'torpedoEntry', x: t.x, z: t.z }); }
        continue;
      }
      const x0 = t.x, z0 = t.z;
      t.x += t.vx * dt; t.z += t.vz * dt;
      t.travel += t.speed * dt; t.age += dt;
      let done = false;
      if (this.terrain && this.terrain.heightAt(t.x, t.z) > -2.5) {
        // the shore: it runs aground and explodes
        this.events.push({ type: 'landImpact', x: t.x, y: 0, z: t.z, cal: 533, shell: 'HE', dx: t.vx, dz: t.vz, torpedo: true });
        done = true;
      } else if (t.travel > t.range) done = true;
      else if (t.travel > 90) {
        for (const ship of this.ships) {
          if (ship.state !== 'afloat') continue;
          if (ship === t.owner || ship.team === t.team) continue;
          if (Math.hypot(ship.x - t.x, ship.z - t.z) > ship.model.radius + 20) continue;
          const steps = Math.max(1, Math.ceil(t.speed * dt / 3));
          for (let k = 1; k <= steps; k++) {
            const f = k / steps;
            const px = x0 + (t.x - x0) * f, pz = z0 + (t.z - z0) * f;
            const dx = px - ship.x, dz = pz - ship.z;
            const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
            const lx = dx * sh - dz * ch, lz = dx * ch + dz * sh;
            if (Math.abs(lx) < ship.stats.L * 0.5 && Math.abs(lz) < ship.model.hull.halfBeamWL(lx) + 0.6) {
              resolveTorpedoHit(this, ship, t, px, pz);
              done = true;
              break;
            }
          }
          if (done) break;
        }
      }
      if (done) arr.splice(i, 1);
    }
  }

  /** Capsule-vs-capsule ship collisions: push apart, shed speed, a little damage. */
  collisions(dt) {
    const n = this.ships.length;
    for (let i = 0; i < n; i++) {
      const a = this.ships[i];
      if (a.state === 'sunk') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.ships[j];
        if (b.state === 'sunk') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const reach = (a.stats.L + b.stats.L) * 0.45;
        if (dx * dx + dz * dz > reach * reach) continue;
        // closest points of the two keel lines (segments of 0.8 L)
        const ha = a.stats.L * 0.4, hb = b.stats.L * 0.4;
        const ax = Math.sin(a.heading), az = -Math.cos(a.heading), bx = Math.sin(b.heading), bz = -Math.cos(b.heading);
        const c = closestSeg(a.x - ax * ha, a.z - az * ha, a.x + ax * ha, a.z + az * ha, b.x - bx * hb, b.z - bz * hb, b.x + bx * hb, b.z + bz * hb);
        const r = (a.stats.B + b.stats.B) * 0.5 * 0.85;
        if (c.d < r && c.d > 0.01) {
          const pen = r - c.d;
          const nx = (c.qx - c.px) / c.d, nz = (c.qz - c.pz) / c.d;
          const ma = a.stats.dispFull, mb = b.stats.dispFull;
          const wa = mb / (ma + mb), wb = ma / (ma + mb);
          a.x -= nx * pen * wa; a.z -= nz * pen * wa; b.x += nx * pen * wb; b.z += nz * pen * wb;
          const rv = Math.hypot(a.vx - b.vx, a.vz - b.vz);
          a.speed *= 0.97; b.speed *= 0.97;
          if (rv > 1.5 && (a.alive || b.alive)) {
            const e = rv * rv * 1.6;
            if (a.alive) a.applyDamage(e * wa * 0.6, null, 'collision');
            if (b.alive) b.applyDamage(e * wb * 0.6, null, 'collision');
            this.events.push({ type: 'collision', x: (c.px + c.qx) / 2, z: (c.pz + c.qz) / 2, power: rv });
          }
        }
      }
    }
  }

  /** Ships on the ground: pushed back out, slowed down, hurt by the speed at which they hit it. */
  grounding(dt) {
    const T = this.terrain;
    for (const s of this.ships) {
      if (s.state === 'sunk') continue;
      const st = s.stats, fx = Math.sin(s.heading), fz = -Math.cos(s.heading), rx = -fz, rz = fx;
      const pts = [];
      for (const [lx, lz] of [[0.49, 0], [-0.49, 0], [0.3, 0.4], [0.3, -0.4], [-0.25, 0.4], [-0.25, -0.4], [0.05, 0.45], [0.05, -0.45]]) {
        const a = lx * st.L, b = lz * st.B;
        pts.push([s.x + fx * a + rx * b, s.z + fz * a + rz * b]);
      }
      const g = T.grounding(pts, st.D * 0.8);
      if (!g) continue;
      // out of the ground, along its slope
      const push = clamp(g.pen / Math.max(g.slope, 0.04), 1, 40);
      s.x += g.nx * push * Math.min(1, dt * 6); s.z += g.nz * push * Math.min(1, dt * 6);
      const vn = s.vx * g.nx + s.vz * g.nz;                // negative: she is going into it
      s.speed *= Math.exp(-dt * 1.2);
      if (vn < -1 && (s._groundT ?? 0) <= this.time) {
        s._groundT = this.time + 1.5;
        const e = vn * vn * st.dispFull * 0.012;
        if (s.alive) s.applyDamage(e, null, 'collision');
        this.events.push({ type: 'collision', x: g.x, z: g.z, power: -vn, land: true });
      }
    }
  }

  magazineExplosion(ship, owner, where, mag) { magazineExplosion(this, ship, owner, where, mag); }
  breakInTwo(ship, cutX) { breakInTwo(this, ship, cutX); }
  secondaryBlast(ship, lx, ly, lz, size) { secondaryBlast(this, ship, lx, ly, lz, size); }

  onShipSunk(ship, killer, cause) {
    this.kills.push({ t: this.time, victim: ship, killer, cause });
  }

  checkVictory(dt) {
    if (this.state !== 'running') return;
    const alive = this.aliveTeams();
    const present = new Set(this.ships.map((s) => s.team));
    if (present.size >= 2 && alive.length <= 1) {
      this.finishT += dt;
      if (this.finishT > 6) { this.state = 'finished'; this.winner = alive.length ? alive[0] : null; }
    } else this.finishT = 0;
    if (this.time > this.timeLimit && this.state === 'running') {
      this.state = 'finished';
      // by remaining fleet health
      let best = null, bv = -1;
      for (const t of present) {
        const v = this.ships.filter((s) => s.team === t && s.alive).reduce((a, s) => a + s.hp, 0);
        if (v > bv) { bv = v; best = t; }
      }
      this.winner = best;
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

function closestSeg(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z) {
  // returns closest points between segments (p1,q1) and (p2,q2) in the plane
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z;
  const rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  const c = d1x * rx + d1z * rz, b = d1x * d2x + d1z * d2z;
  const den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const px = p1x + d1x * s, pz = p1z + d1z * s, qx = p2x + d2x * t, qz = p2z + d2z * t;
  return { px, pz, qx, qz, d: Math.hypot(qx - px, qz - pz) };
}
