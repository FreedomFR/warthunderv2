// The great war: a theatre of war with two sides on a very large sea (data/theatre.js). `buildTheatre` makes the islands, the bases and the ports of every nation, the two teams and the
// task forces of every navy, each starting off its home port. `Theatre` is the strategic layer that runs during the war: it keeps what each side knows of the enemy (nobody sees
// further than a ship, an aircraft or a radar can see), gives every task force a goal (patrol, intercept a contact, bombard an enemy base, go home to a port) and watches the end of
// the war. The fighting itself is still done by the captains of the ships (controllers/ai.js) and by the air operations.
import { Terrain } from './terrain.js';
import { spawnFleet } from './formation.js';
import { THEATRE, THEATRES, TASK_FORCES } from '../data/theatre.js';
import { portsOf, nearestPort } from './ports.js';
import { BY_ID } from '../data/ships.js';
import { clamp } from '../math.js';

const VALUE = { DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3 };
const hdgOf = (ang) => Math.atan2(Math.cos(ang), -Math.sin(ang));

/** The nations of the theatre as the terrain generator wants them: [{ nation, team, home, ports, batteries }]. */
export function theatreNations(theatre = THEATRE) {
  return Object.entries(theatre.nations).map(([nation, n]) => ({ nation, team: n.side, home: n.home, ports: 2, batteries: 2 }));
}

/**
 * Put a theatre of war into `world` (empty, in setup): the teams, the sea with its islands and bases, and the task forces. `o.only`: a list of nations (a smaller war, for the tests).
 * Returns the Theatre.
 */
export function buildTheatre(world, seed, o = {}) {
  const theatre = typeof o.id === 'string' ? THEATRES[o.id] || THEATRE : THEATRE;
  theatre.sides.forEach((s, i) => world.addTeam(i, s.name, s.rgb));
  const nations = theatreNations(theatre).filter((n) => !o.only || o.only.includes(n.nation));
  world.terrain = Terrain.generateTheatre(seed, theatre, { nations });
  const th = new Theatre(world);
  th.id = theatre.id;
  world.theatre = th;
  world.fog = true;
  world.timeLimit = o.timeLimit ?? 6 * 3600;
  for (const n of nations) {
    const ports = portsOf(world, n.team).filter((p) => p.nation === n.nation);
    const tfs = TASK_FORCES[n.nation] || [];
    tfs.forEach((tf, k) => {
      const port = ports[k % Math.max(1, ports.length)] || null;
      let x, z, heading;
      if (port) {
        // off the port, a few kilometres out, facing the open sea; the task forces of one port line up side by side
        const A = port.layout.approach, u = [Math.cos(port.layout.ang), Math.sin(port.layout.ang)], side = [-u[1], u[0]];
        const off = (Math.floor(k / Math.max(1, ports.length)) - 0.5) * 3200, back = 3500;
        x = A.x + u[0] * back + side[0] * off; z = A.z + u[1] * back + side[1] * off; heading = hdgOf(port.layout.ang);
      } else { x = n.home.x; z = n.home.z + k * 3000; heading = 0; }
      const key = n.nation + ':' + tf.name;
      const ships = spawnFleet(world, n.team, tf.ships, x, z, heading, { fleetKey: key, circle: 1, spread: 1.4 });
      // (clear of the shallows of the neighbouring islands: a fleet that starts on a bank would run aground before it has done anything)
      if (port) {
        const u = [Math.cos(port.layout.ang), Math.sin(port.layout.ang)], T = world.terrain;
        for (let k = 0; k < 8 && ships.some((s) => -T.heightAt(s.x, s.z) < 46 || -T.heightAt(s.x + u[0] * 600, s.z + u[1] * 600) < 40); k++) for (const s of ships) { s.x += u[0] * 1200; s.z += u[1] * 1200; }
      }
      const fleet = world.fleetOf(key, n.team);
      fleet.engageRange = 45000;
      th.forces.push({ key, name: tf.name, nation: n.nation, team: n.team, role: tf.role, fleet, home: port, ships, strength0: strengthOf(ships), state: 'patrol', t: 0, waypoint: null });
    });
  }
  return th;
}

/** Move a goal off the land and the shallows: away from the nearest island until the water is deep (a fleet ordered to a place on an island would run aground trying). */
function seaPoint(T, g) {
  for (let k = 0; k < 14 && -T.heightAt(g.x, g.z) < 45; k++) {
    let best = null, bd = Infinity;
    for (const is of T.islands) { const d = Math.hypot(g.x - is.x, g.z - is.z) - is.R; if (d < bd) { bd = d; best = is; } }
    if (!best) break;
    const dx = g.x - best.x, dz = g.z - best.z, l = Math.hypot(dx, dz) || 1;
    g.x += dx / l * 2500; g.z += dz / l * 2500;
  }
  const B = T.bounds;
  if (B) { g.x = clamp(g.x, B.x0 + 6000, B.x1 - 6000); g.z = clamp(g.z, B.z0 + 6000, B.z1 - 6000); }
}

const strengthOf = (ships) => ships.reduce((a, s) => a + (s.alive ? VALUE[s.stats.type] * (0.3 + 0.7 * s.condition) : 0), 0);

export class Theatre {
  constructor(world) {
    this.world = world;
    this.forces = [];                // the task forces
    this.t = 0;
    this.intel = new Map();          // team -> Map(ship id -> { ship, x, z, t (when last seen), seen (this scan) })
  }

  /** What `team` knows: the enemy ships it has seen lately, as { ship, x, z, t }. */
  contacts(team) { return this.intel.get(team) || new Map(); }

  update(dt) {
    const w = this.world;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2;
    this.scan();
    this.command();
  }

  // ---- what each side sees ---------------------------------------------------------------------------------------------------------------------------------------

  /** The sensors of every ship, aircraft and base of a team against the ships of the others (a quick scan every two seconds). */
  scan() {
    const w = this.world, now = w.time;
    for (const t of w.teams) {
      if (!t) continue;
      let book = this.intel.get(t.id);
      if (!book) { book = new Map(); this.intel.set(t.id, book); }
      for (const c of book.values()) c.seen = false;
      const mine = w.ships.filter((s) => s.team === t.id && s.alive);
      const theirs = w.ships.filter((s) => s.team !== t.id && s.alive);
      const searchers = [];
      for (const b of w.bases) if (b.layout.kind === 'airfield' && b.team === t.id && !b.inert && b.alive) searchers.push({ x: b.layout.x, z: b.layout.z, R: b.layout.size === 'large' ? 110000 : 80000 });
      for (const s of mine) if (s.air && !s.deckWrecked && s.air.ready + s.air.fReady > 0) searchers.push({ x: s.x, z: s.z, R: 80000 });
      for (const e of theirs) {
        let sees = false;
        for (const s of mine) if (w.detects(s, e)) { sees = true; break; }
        if (!sees) for (const b of w.bases) if (b.team === t.id && !b.inert && b.alive && w.baseDetects(b, e)) { sees = true; break; }
        if (!sees) for (const p of w.planes) if (p.team === t.id && !p.ground && !p.dying && !p.gone && w.planeDetects(p, e)) { sees = true; break; }
        // the patrol aircraft of the airfields and of the carriers sweep the sea: a ship within their radius is found, sooner the nearer it is (their flights are not drawn)
        if (!sees) for (const q of searchers) { const d = Math.hypot(e.x - q.x, e.z - q.z); if (d < q.R && w.rng() < 0.006 * (1 - d / q.R)) { sees = true; break; } }
        if (sees) { let c = book.get(e.id); if (!c) { c = { ship: e }; book.set(e.id, c); } c.x = e.x; c.z = e.z; c.vx = e.vx; c.vz = e.vz; c.t = now; c.seen = true; }
      }
      // a contact not seen for ten minutes, or sunk, is forgotten
      for (const [id, c] of book) if (!c.ship.alive || now - c.t > 600) book.delete(id);
    }
  }

  // ---- the orders -------------------------------------------------------------------------------------------------------------------------------------------------

  command() {
    const w = this.world;
    for (const f of this.forces) {
      const alive = f.ships.filter((s) => s.alive);
      f.alive = alive.length;
      if (!alive.length) { f.fleet.goal = null; continue; }
      const field = alive.filter((s) => !s.mission && !s.dock);
      if (!field.length) { f.fleet.goal = null; continue; }        // all of them in port or on their way to one
      let cx = 0, cz = 0;
      for (const s of field) { cx += s.x; cz += s.z; }
      cx /= field.length; cz /= field.length;
      f.x = cx; f.z = cz;
      const book = this.contacts(f.team);
      // the nearest contact the fleet could go after
      let target = null, td = Infinity;
      for (const c of book.values()) {
        const px = c.x + (c.vx || 0) * (w.time - c.t), pz = c.z + (c.vz || 0) * (w.time - c.t);
        const d = Math.hypot(px - cx, pz - cz);
        if (d < td && d < 140000) { td = d; target = { x: px, z: pz, ship: c.ship }; }
      }
      const weak = f.strength0 > 0 && strengthOf(alive) < 0.4 * f.strength0;
      let goal = null;
      if (weak) {
        // too many lost: home to the port (the ships there are given back when they are whole)
        const p = f.home && !f.home.inert && f.home.alive ? f.home : nearestPort(w, f.team, cx, cz);
        if (p) goal = { x: p.layout.approach.x, z: p.layout.approach.z, why: 'home' };
      } else if (target && f.role === 'carrier') {
        // a carrier fights with her aircraft: she keeps about 60 km from the contact (out of the guns, within the reach of her strikes) and goes away if it comes closer than 40
        const ux = (cx - target.x) / Math.max(td, 1), uz = (cz - target.z) / Math.max(td, 1), want = td < 40000 ? 70000 : td > 75000 ? 60000 : 0;
        if (want) goal = { x: target.x + ux * want, z: target.z + uz * want, why: td < 40000 ? 'away' : 'contact' };
      } else if (target) {
        goal = { x: target.x, z: target.z, why: 'contact' };
      } else if (f.role === 'battle' || f.role === 'cruiser') {
        goal = this.raidGoal(f, cx, cz);
      }
      if (!goal) goal = this.patrolGoal(f, cx, cz);
      if (goal.why !== 'home') seaPoint(w.terrain, goal);
      f.fleet.goal = goal;
    }
  }

  /** An enemy base to bombard: the nearest port or airfield that a task force of this size can reach, the point to sail to is on the sea side of it, in gun range. */
  raidGoal(f, cx, cz) {
    const w = this.world;
    if (f.raid && f.raid.base.alive && !f.raid.base.inert && f.t0 > w.time - 5400) { return f.raid.goal; }
    let best = null, bs = -Infinity;
    const gun = Math.min(...f.ships.filter((s) => s.alive && s.stats.type !== 'DD' && s.stats.type !== 'CV').map((s) => s.stats.main.maxRange).concat([30000]));
    for (const b of w.bases) {
      if (b.team === f.team || b.inert || !b.alive) continue;
      const d = Math.hypot(b.layout.x - cx, b.layout.z - cz);
      const kind = b.layout.kind;
      const value = kind === 'port' ? 1.5 : kind === 'airfield' ? (b.layout.size === 'large' ? 1.4 : 1.1) : 0.5;      // (a battery is only an obstacle)
      const sc = value * 60000 - d + w.rng() * 20000;
      if (sc > bs) { bs = sc; best = b; }
    }
    if (!best) return null;
    // the point on the sea side of the base: along the line of the shore's normal, at three quarters of the gun range of the line
    const L = best.layout, away = Math.atan2(L.z - cz, L.x - cx), r = gun * 0.72;
    let gx = L.x - Math.cos(away) * r, gz = L.z - Math.sin(away) * r;
    // (the approach to a port is on its sea side: use it if we are going to a port)
    if (L.kind === 'port') { gx = L.approach.x; gz = L.approach.z; }
    const T = w.terrain;
    // a point in open water: step away from the island until the sea is deep
    for (let k = 0; k < 12 && -T.heightAt(gx, gz) < 40; k++) { gx -= Math.cos(away) * 1500; gz -= Math.sin(away) * 1500; }
    f.t0 = w.time;
    f.raid = { base: best, goal: { x: gx, z: gz, why: 'raid' } };
    return f.raid.goal;
  }

  /** A point to sail to when nothing is known: the carriers stay in their own waters, the cruisers range the open sea, the line goes to the enemy's side. */
  patrolGoal(f, cx, cz) {
    const w = this.world, B = w.terrain.bounds;
    if (f.waypoint && Math.hypot(f.waypoint.x - cx, f.waypoint.z - cz) > 6000 && w.time - f.wpT < 5400) return f.waypoint;
    const rng = w.rng, home = f.home ? f.home.layout.approach : { x: cx, z: cz }, dir = f.team === 0 ? 1 : -1;      // (the Axis is in the west: the enemy is to the east)
    let x, z;
    if (f.role === 'carrier') { x = home.x + dir * rng.range(10000, 28000); z = home.z + rng.range(-22000, 22000); }
    else { x = rng.range(-0.35, 0.45) * (B.x1 - B.x0) * 0.5 * dir + rng.range(-12000, 12000); z = rng.range(-0.8, 0.8) * (B.z1 - B.z0) * 0.5; }
    x = clamp(x, B.x0 + 8000, B.x1 - 8000); z = clamp(z, B.z0 + 8000, B.z1 - 8000);
    const T = w.terrain;
    // open water: if the point is on or near an island, push it off
    for (let k = 0; k < 10 && -T.heightAt(x, z) < 45; k++) { x += rng.range(-4000, 4000); z += rng.range(-4000, 4000); }
    f.waypoint = { x, z, why: 'patrol' }; f.wpT = w.time;
    return f.waypoint;
  }
}
