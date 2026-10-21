// The way home after the attack. An aircraft that has dropped its bomb or its torpedo does not fly straight home over the guns it has just run the gauntlet of: it looks at where
// the enemy's anti-aircraft guns are (the ships' and the bases' batteries, sim/routing.js) and keeps out of their reach, bending its course round them; and the aircraft of a
// section, scattered by the attack, close up again behind one of them (the one that came out first) and come home in formation, the leader slower if the others are far behind.
import { clamp, wrapPi } from '../math.js';
import { aaSources, exposure } from './routing.js';

const STEP = 700, LOOK = 12000, FAN = 7, DA = 0.24;       // the look-ahead: 12 km, in 700 m steps, over headings from -1.7 to +1.7 rad round the direct one

/**
 * The heading to fly from p towards (hx, hz) so as to keep out of the reach of the enemy's guns: of the headings round the direct one, the one whose path (the next 12 km) is
 * least exposed, with a cost for every degree it departs from the direct one and for the way it ends further from home. Chosen again every 2.5 s (the ships move).
 * Returns { hdg, risk (the fire on the path chosen), direct (the fire on the direct path) }, the same object for 2.5 s.
 */
export function safeHeading(world, p, hx, hz, now) {
  if (p._esc && now - p._esc.t < 2.5) return p._esc;
  const dHome = Math.hypot(hx - p.x, hz - p.z), direct = Math.atan2(hx - p.x, -(hz - p.z));
  const srcs = aaSources(world, p.team, 15), low = p.y < 1800, L = Math.min(LOOK, dHome);
  let best = null, directRisk = 0;
  for (let k = -FAN; k <= FAN; k++) {
    const a = direct + k * DA;
    let fire = 0;
    for (let d = STEP; d <= L; d += STEP) fire += exposure(srcs, p.x + Math.sin(a) * d, p.z - Math.cos(a) * d, low) * STEP / 1000;
    if (k === 0) directRisk = fire;
    const ex = p.x + Math.sin(a) * L, ez = p.z - Math.cos(a) * L, extra = Math.max(0, Math.hypot(hx - ex, hz - ez) - (dHome - L));
    const cost = fire + 0.35 * Math.abs(k) * DA / 0.3 + extra / 1000 * 0.2;
    if (!best || cost < best.cost) best = { cost, a, fire };
  }
  p._esc = { t: now, hdg: best.a, risk: best.fire, direct: directRisk };
  return p._esc;
}

/** The aircraft of a group that is going home, and the one they form on (the same one until it is lost or lands: stored on `owner`, a section or a wave). */
export function homeLeader(owner, group) {
  let l = owner.homeLead;
  if (!l || !group.includes(l)) l = owner.homeLead = group[0] || null;
  return l;
}

/**
 * Steering of a follower: into its place behind and beside the leader (a vee, wider for the aircraft further back), the speed matched to the leader's and a little more to
 * close a gap, the height of the leader. Far from its place (more than 8 km) it goes straight for the leader as fast as it can. Returns { hdg, gam, spd, d (m from the place) }.
 */
export function formOn(p, lead, rank, perf, loose = 1.15) {
  const pos = rank % 3, row = Math.floor(rank / 3), side = pos === 0 ? 0 : pos === 1 ? 1 : -1;
  const ox = -(row * 80 + (pos ? 34 : 0)) * loose, oz = side * 46 * loose, oy = pos === 0 ? 0 : -6 * pos;
  const fx = Math.sin(lead.heading), fz = -Math.cos(lead.heading), rx = Math.cos(lead.heading), rz = Math.sin(lead.heading);
  const sx = lead.x + fx * ox + rx * oz, sz = lead.z + fz * ox + rz * oz;
  const ex = sx - p.x, ez = sz - p.z, d = Math.hypot(ex, ez);
  if (d > 8000) return { hdg: Math.atan2(ex, -ez), gam: clamp((lead.y + oy - p.y) / 900, -0.08, 0.1), spd: Math.min(perf.vmax * 0.92, perf.vc * 1.3), d };
  const hdg = lead.heading + wrapPi(Math.atan2(ex, -ez) - lead.heading) * clamp(d / 70, 0, 1);
  const along = (p.x - sx) * fx + (p.z - sz) * fz;
  return { hdg, gam: clamp((lead.y + oy - p.y) / 260, -0.09, 0.12), spd: clamp(lead.speed - along * 0.16, perf.vc * 0.55, perf.vc * 1.3), d };
}

/** How far the rearmost of the group is from the leader (m): the leader slows down for it. */
export function straggle(lead, group) {
  let m = 0;
  for (const q of group) if (q !== lead) m = Math.max(m, Math.hypot(q.x - lead.x, q.z - lead.z));
  return m;
}

/**
 * One step of the way home for the aircraft of a group (a section, a wave): the leader goes by the safe heading, the others form on it. `group` are those still on their way home.
 * Returns { hdg, gam, spd (undefined: the caller's own), lead (is p the leader), risk }.
 */
export function homeCourse(world, p, owner, group, hx, hz, perf, altitude) {
  const lead = homeLeader(owner, group);
  if (!lead || lead === p || group.length < 2) {
    const e = safeHeading(world, p, hx, hz, world.time);
    // the leader waits for the rearmost when it is far behind (down to 0.8 of the cruise), otherwise its own cruise speed
    const slow = lead === p && e.risk < 0.2 ? clamp(1 - (straggle(p, group) - 2500) / 9000, 0.8, 1) : 1;
    return { hdg: e.hdg, gam: clamp((altitude - p.y) / 700, -0.08, 0.1), spd: perf.vc * slow, lead: true, risk: e.risk };
  }
  const rank = group.filter((q) => q !== lead).indexOf(p) + 1;
  const f = formOn(p, lead, rank, perf);
  return { hdg: f.hdg, gam: f.gam, spd: f.spd, lead: false, risk: 0 };
}
