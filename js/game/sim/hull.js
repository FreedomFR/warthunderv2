// What keeps a ship afloat and fighting: holes in the hull that let the water in once they are under the waterline, the structure of each compartment, and the crew at its stations
// (gun mounts, light AA, machinery, bridge, damage-control parties). A ship has no pool of hit points: she is lost when the water takes her reserve of buoyancy (she settles, rolls
// over or breaks in two), when her magazines go up, or when too few of her crew are left to fight her (she is abandoned and scuttled). Every blow lands somewhere (hullHit, casualties)
// and its effect follows from where: a shell hole high above the waterline leaks only when the ship has sunk down to it or heels over to it.
import { clamp } from '../math.js';
import { shipDmg } from '../data/balance.js';

/** Share of the hull's volume that the water may take before the ship is lost (her reserve of buoyancy as the game counts it). */
export const SINK_FILL = { DD: 0.30, CL: 0.52, CA: 0.55, BB: 0.50, CV: 0.56 };
/** Crew left (share of the complement) under which the ship is given up. */
const ABANDON_AT = 0.14;
/** A station with less than this share of its crew cannot work its guns. */
export const MIN_CREW = 0.2;
// how the complement is spread: guns, light AA, machinery, bridge and fire control; the rest are the damage-control and ammunition parties spread along the hull
const SHARE = { guns: 0.30, aa: 0.08, engines: 0.22, bridge: 0.04 };

/** Give every station its crew, and the compartments theirs. Called once the mounts, modules and compartments exist. */
export function initHull(ship) {
  const st = ship.stats, N = st.crew;
  ship.holes = [];
  ship.crew0 = N;
  const spread = (list, share, weight) => {
    const W = list.reduce((a, s) => a + weight(s), 0) || 1;
    let used = 0;
    for (const s of list) { s.crew0 = N * share * weight(s) / W; s.crew = s.crew0; used += s.crew0; }
    return used;
  };
  let used = 0;
  used += spread(ship.mounts, SHARE.guns, (m) => m.n * (2 + m.rec.cal / 20));
  used += spread(ship.aaMounts, SHARE.aa, (a) => a.rec.n);
  used += spread(ship.modules.filter((m) => m.kind === 'engine'), SHARE.engines, () => 1);
  used += spread(ship.modules.filter((m) => m.kind === 'bridge'), SHARE.bridge, () => 1);
  const rest = Math.max(N * 0.2, N - used), n = ship.comps.length;
  for (const c of ship.comps) { c.crew0 = rest / n; c.crew = c.crew0; c.struct = 0; }
  ship.crewFrac = 1; ship.dcFrac = 1; ship.dcEff = st.navy.dc;
  ship.abandonT = null; ship.disabledT = 0;
}

/** Fraction of its crew a station still has. */
export const crewOf = (s) => (s.crew0 > 0 ? clamp(s.crew / s.crew0, 0, 1) : 1);

/** Kill a share of a station's nominal crew. */
function kill(s, frac) { if (s.crew0 > 0 && frac > 0) s.crew = Math.max(0, s.crew - s.crew0 * frac * shipDmg('crew')); }

const dist = (a, b, c, x, y, z) => Math.hypot(a - x, b - y, c - z);

/**
 * A burst of strength `P` (kg of explosive, see modules.js blast) at a local point kills the crew round it: the more the closer, the less in an enclosed place (a turret, a
 * space inside the hull) when the burst is outside, the more when the burst is inside with them.
 */
export function blastCasualties(ship, lx, ly, lz, P, where, reach) {
  const rb = 0.9 * Math.cbrt(Math.max(P, 1));
  const hit = (d, tough) => 1 - Math.exp(-(P / (1 + (d / rb) * (d / rb)) ** 1.5) / tough);
  for (const m of ship.mounts) {
    const rec = m.rec, d = dist(rec.x, rec.y + 1, rec.z, lx, ly, lz);
    if (d > reach) continue;
    const enclosed = rec.kind === 'turret';
    kill(m, hit(d, enclosed ? (where === 'inside' ? 200 : 650) : 55));
  }
  for (const a of ship.aaMounts) {
    const rec = a.rec, d = dist(rec.x, rec.y, rec.z, lx, ly, lz);
    if (d > reach) continue;
    kill(a, hit(d, 45));
  }
  for (const m of ship.modules) {
    if (m.crew0 == null) continue;
    const d = Math.max(0, dist(m.x, m.y, m.z, lx, ly, lz) - Math.max(m.hx, m.hz) * 0.5);
    if (d > reach) continue;
    kill(m, hit(d, where === 'inside' ? 150 : m.kind === 'bridge' ? 110 : 550));
  }
  for (const c of ship.comps) {
    const d = Math.abs(c.xc - lx) - (c.x1 - c.x0) * 0.4;
    if (d > reach) continue;
    kill(c, hit(Math.max(0, d), where === 'outside' ? 650 : 170) * (ly < 0 ? 0.6 : 1));
  }
}

/** The compartment whose length holds the local x. */
export function compAt(ship, lx) {
  const cs = ship.comps;
  for (let i = 0; i < cs.length; i++) if (lx >= cs[i].x0) return i;
  return cs.length - 1;
}

/**
 * A blow to the hull at a local point. `energy` is in the units of the old structural damage (the hit points of the ship: the blow's strength against a hull of
 * `stats.hullStrength`), `cause` the kind of blow. It tears the plating of the compartment (its structure), and opens a hole there whose size follows the blow; the hole lets
 * the water in as soon as it is under the waterline (updateHoles).
 */
export function hullHit(ship, o) {
  if (ship.state === 'sunk' || o.energy <= 0) return;
  const st = ship.stats;
  const energy = o.energy * shipDmg(o.cause);
  if (energy <= 0) return;
  if (o.attacker) { ship.lastAttacker = o.attacker; ship.lastHitT = ship.world.time; ship.world.lastCombatT = ship.world.time; }
  const i = compAt(ship, o.lx), c = ship.comps[i];
  // the structure: a compartment takes half the strength of the whole hull to break (a destroyer's torpedo hit, 1.2 times the hull, breaks it twice over)
  c.struct += energy / (st.hullStrength * 0.35);
  // the hole: bigger for a blow that opens the plating (a torpedo, a shell that went through, a bomb) than for one that scuffs it; none for a pure shock
  // the shock of the blows strains the seams of the compartment: every quarter of a break adds a leak at the waterline, however the blows came (blast, splinters, the whirl of
  // fire) and whatever height they were struck at
  c.leaks = c.leaks || 0;
  while (c.leaks < Math.floor(c.struct / STRAIN) && ship.holes.length < 60) { c.leaks++; ship.holes.push({ i, x: c.xc, y: -0.6, z: (c.leaks % 2 ? 1 : -1) * 0.3 * st.B, rate: st.hullStrength * LEAK * (o.holeScale ?? 1) }); }
  const k = HOLE[o.cause] ?? 0.004;
  const rate = energy * k * (o.holeScale ?? 1);
  if (rate > 0 && ship.holes.length < 60) ship.holes.push({ i, x: o.lx, y: o.ly, z: o.lz, rate });
  else if (rate > 0) { let small = ship.holes[0]; for (const h of ship.holes) if (h.rate < small.rate) small = h; small.rate += rate; }      // (too many holes to keep: the blow widens the smallest)
}
/** How much water a hole lets in per unit of the blow's energy, by the kind of blow (rate = energy x this, in the units of flooding). */
/** Structural damage (in breaks of the compartment) that opens one more leak, and the size of that leak (in hull strengths per second). */
const STRAIN = 0.25, LEAK = 0.0015;
const HOLE = { shell: 0.006, torpedo: 0.014, bomb: 0.006, blast: 0.002, collision: 0.012, turret: 0.001, fire: 0, flood: 0 };

/** The local height of the water at a point of the hull: it rises where the ship is down (settled, by the bow, heeled). */
function waterAt(ship, lx, lz) {
  return ship.settleCur + (ship.sinkDepth || 0) - ship.pitch * lx + ship.roll * lz - (ship.sh ? ship.sh.x : 0);
}

/**
 * The water coming in: every hole under the waterline lets in what its size and the depth of water over it say. Damage control patches the leaking holes over time.
 * Fills the compartments' `inflow` (the flooding of ship.update reads it), and returns nothing.
 */
export function updateHoles(ship, dt) {
  for (const c of ship.comps) { c.inflow[0] = 0; c.inflow[1] = 0; }
  const hs = ship.holes;
  if (!hs.length) return;
  const afloat = ship.state === 'afloat';
  let leaking = 0;
  for (const h of hs) {
    const d = waterAt(ship, h.x, h.z) - h.y;
    h.head = d < -0.3 ? 0 : Math.sqrt(clamp((d + 0.3) / 1.8, 0, 2.5));
    if (h.head > 0) leaking++;
  }
  const st = ship.stats;
  const patch = afloat ? st.hullStrength * 0.00018 * ship.dcEff * dt / Math.max(1, leaking) : 0;
  const flood = shipDmg('flood');
  for (let k = hs.length - 1; k >= 0; k--) {
    const h = hs[k];
    if (h.head > 0) {
      const side = h.z >= 0 ? 1 : 0, c = ship.comps[h.i];
      const q = h.rate * h.head * flood;
      c.inflow[side] += q * 0.85; c.inflow[1 - side] += q * 0.15;
      if (patch > 0) { h.rate -= patch; if (h.rate <= 0) hs.splice(k, 1); }
    }
  }
}

/** Crew casualties of the fires and of the water, the replacements, and what the loss of crew does to the ship. Called every tick while she is afloat or sinking. */
export function updateCrew(ship, dt) {
  // (a few times a second is enough for the people: the work is done on the time that has gone since)
  ship._crewDt = (ship._crewDt || 0) + dt;
  if (ship._crewDt < 0.25) return;
  dt = ship._crewDt; ship._crewDt = 0;
  const afloat = ship.state === 'afloat';
  // fires: the people of the compartment burn, the nearby mounts too (the damage-control parties keep the toll down)
  for (const f of ship.fires) {
    const ci = compAt(ship, f.x), c = ship.comps[ci];
    const fk = shipDmg('fire');
    kill(c, 0.004 * f.power * dt * fk * (f.inside ? 1.4 : 1) * (1.2 - 0.5 * ship.stats.navy.dc));
    for (const m of ship.mounts) if (dist(m.rec.x, m.rec.y, m.rec.z, f.x, f.y, f.z) < 6) kill(m, 0.004 * f.power * dt * fk);
    for (const m of ship.modules) if (m.crew0 != null && dist(m.x, m.y, m.z, f.x, f.y, f.z) < 7) kill(m, 0.003 * f.power * dt * fk);
  }
  // water in the hull drowns the people below: a compartment more than half full, the engine rooms in it
  for (const c of ship.comps) {
    const w = (c.water[0] + c.water[1]) * 0.5;
    if (w > 0.45) kill(c, 0.004 * (w - 0.4) * dt);
  }
  for (const m of ship.modules) {
    if (m.crew0 == null || m.kind !== 'engine') continue;
    const c = ship.comps[compAt(ship, m.x)], w = (c.water[0] + c.water[1]) * 0.5;
    if (w > 0.35) kill(m, 0.006 * (w - 0.3) * dt);
  }
  if (!afloat) { tally(ship); return; }
  // replacements: crew from the damage-control parties go to the stations that have lost people (a few every second, from the compartments nearest to them)
  ship._relT = (ship._relT || 0) - dt;
  if (ship._relT <= 0) {
    ship._relT = 2;
    const need = [];
    for (const m of ship.mounts) if (m.alive && m.crew < m.crew0 * 0.9) need.push(m);
    for (const m of ship.modules) if (m.crew0 != null && m.state !== 2 && m.crew < m.crew0 * 0.9) need.push(m);
    if (need.length) {
      const per = ship.crew0 * 0.0016 * 2 * Math.max(0.3, ship.dcEff);       // people moved in two seconds
      for (const s of need) {
        const sx = s.rec ? s.rec.x : s.x;
        let src = null, best = 1e9;
        for (const c of ship.comps) if (c.crew > c.crew0 * 0.4) { const d = Math.abs(c.xc - sx); if (d < best) { best = d; src = c; } }
        if (!src) break;
        const mv = Math.min(per, src.crew - src.crew0 * 0.4, s.crew0 - s.crew);
        if (mv > 0) { src.crew -= mv; s.crew += mv; }
      }
    }
  }
  tally(ship);
  // a ship that has lost her people is given up: a fire or flooding that goes on for long enough, a hulk with nobody to work her
  if (ship.crewFrac < ABANDON_AT && ship.abandonT == null) ship.abandonT = ship.world.time + 25 + ship.world.rng() * 40;
  // and one that can no longer hurt anyone (no gun that works, no torpedo, no aircraft or missile) is scuttled after a while
  const helpless = !ship.canStrike() && !ship.mission && !ship.dock;      // (a ship that is on her way to a port to be rearmed, or lies in one, is not given up)
  ship.disabledT = helpless ? ship.disabledT + dt : 0;
  if (ship.disabledT > 120 && ship.abandonT == null) ship.abandonT = ship.world.time + 10 + ship.world.rng() * 20;
  if (ship.abandonT != null && ship.world.time >= ship.abandonT) {
    ship.sinkMode = null;
    ship.destroy(ship.lastAttacker, ship.fires.length >= 2 ? 'fire' : 'abandoned');
  }
}

/** Totals: the share of the complement still aboard, and of the damage-control parties; the effect of the people lost on the machinery and the bridge. */
function tally(ship) {
  let all = 0, left = 0, dc = 0, dc0 = 0;
  for (const s of ship.mounts) { all += s.crew0; left += s.crew; }
  for (const s of ship.aaMounts) { all += s.crew0; left += s.crew; }
  for (const s of ship.modules) if (s.crew0 != null) { all += s.crew0; left += s.crew; }
  for (const c of ship.comps) { all += c.crew0; left += c.crew; dc += c.crew; dc0 += c.crew0; }
  ship.crewFrac = all > 0 ? left / all : 1;
  ship.dcFrac = dc0 > 0 ? dc / dc0 : 1;
  ship.dcEff = ship.stats.navy.dc * (0.15 + 0.85 * clamp(ship.dcFrac / 0.7, 0, 1));
}

/** The loss of the ship's structure: two neighbouring compartments amidships, both broken and flooded, and the long ship breaks her back. */
export function checkBreakUp(ship, dt) {
  const st = ship.stats;
  if (st.L < 110 || ship.split || ship.state !== 'afloat') return false;
  ship._breakT = (ship._breakT || 0) + dt;
  if (ship._breakT < 1) return false;
  ship._breakT = 0;
  const cs = ship.comps;
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i], c = cs[i + 1];
    if (Math.abs(a.xc) > st.L * 0.32 || Math.min(a.struct, c.struct) < 1.2 || Math.min((a.water[0] + a.water[1]) / 2, (c.water[0] + c.water[1]) / 2) < 0.6) continue;
    if (ship.world.rng() < 0.12) {
      ship.sinkMode = 'split';
      ship.destroy(ship.lastAttacker, 'structure');
      ship.sinkMode = 'split'; ship.sinkStyle = 'split';
      ship.world.breakInTwo(ship, (a.xc + c.xc) / 2);
      return true;
    }
  }
  return false;
}
