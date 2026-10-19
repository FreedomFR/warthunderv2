// The captain of a fleet. Before, every ship fought alone: it picked its own target, circled at its own range in a random direction and went where it liked.
// Now a fleet has an order of battle and keeps it:
//   - the flagship (the heaviest ship of the line) leads, the line (battleships, then heavy cruisers, then light cruisers) follows astern in column, at a gap that
//     depends on the lengths of the ships, and turns when the leader turns;
//   - the destroyers form the screen, ahead of the line and on both bows; a destroyer leaves it to launch its torpedoes and comes back;
//   - the carriers sail behind the line, on the side away from the enemy, with two of the destroyers as escort;
//   - the whole fleet circles the enemy in the same direction, at the range that the slowest-firing ships of the line can hold, and no faster than the
//     slowest of them, and the guns share a target (the fleet picks one for the line to concentrate on).
// The ships still decide for themselves when they are in danger (too close, crippled, in the middle of a torpedo attack): they break formation then.
import { clamp } from '../math.js';

const LINE = { BB: 0, CA: 1, CL: 2 };
const VALUE = { DD: 1.0, CL: 1.3, CA: 1.8, BB: 2.5, CV: 2.3 };
const GAP = 380;                // clear water between two ships of the line (m)

/**
 * Stations of the ships of a fleet in the frame of the flagship (f metres ahead, r metres to starboard). items: [{ type, L }] in any order;
 * side: +1 / -1, the side of the line where the carriers sail. Returns an array aligned with items: { f, r, role, flag, tether }.
 */
export function stationPlan(items, side = 1, spread = 1) {
  const out = items.map(() => null);
  const idx = items.map((_, i) => i);
  const line = idx.filter((i) => items[i].type in LINE).sort((a, b) => LINE[items[a].type] - LINE[items[b].type] || items[b].L - items[a].L || a - b);
  const dds = idx.filter((i) => items[i].type === 'DD');
  const cvs = idx.filter((i) => items[i].type === 'CV').sort((a, b) => items[b].L - items[a].L || a - b);
  // no line: a carrier leads her escort, or one destroyer leads the others in column
  let lead = line.length ? line[0] : cvs.length ? cvs[0] : dds[0];
  if (lead == null) return out;
  const column = line.length ? line : (cvs.length ? [lead] : dds.slice());
  let f = 0, prev = items[lead].L;
  column.forEach((i, k) => {
    if (k > 0) f -= (prev + items[i].L) / 2 + GAP;
    prev = items[i].L;
    out[i] = { f, r: 0, role: k === 0 ? 'flag' : 'line', flag: k === 0, tether: 380 + items[i].L * 0.5 };
  });
  const tail = f - prev / 2;                                      // the stern of the last ship of the column
  const rest = dds.filter((i) => !out[i]);
  const cvList = cvs.filter((i) => !out[i]);
  // escorts of the carriers: the last two destroyers of the list for each, when there are enough destroyers
  const nEsc = cvList.length ? Math.min(rest.length >> 1, 2 * cvList.length) : 0;
  const escorts = rest.splice(rest.length - nEsc, nEsc);
  rest.forEach((i, j) => {
    const k = j >> 1;
    out[i] = { f: 1500 + 650 * k, r: (j % 2 ? 1 : -1) * (1300 + 520 * k) * spread, role: 'screen', flag: false, tether: 950 };
  });
  cvList.forEach((i, j) => {
    out[i] = { f: tail - 2600 - 1100 * j, r: side * (2800 + 900 * j) * spread, role: 'carrier', flag: false, tether: 1700 };
  });
  escorts.forEach((i, j) => {
    const cv = out[cvList[Math.min(cvList.length - 1, j >> 1)]];
    out[i] = { f: cv.f + 500, r: cv.r + (j % 2 ? 1 : -1) * 1500 * spread, role: 'escort', flag: false, tether: 800 };
  });
  return out;
}

export class FleetCommand {
  constructor(team) {
    this.team = team;
    this.t = 0;
    this.flag = null;
    // the way round the enemy: +1 turns the line clockwise round it, so the enemy is on the port beam and the carriers sail on the starboard one (-1: the other way
    // round). It is chosen when the fleet is put on the water and never changes, so that the carriers do not have to cross the line in the middle of the battle.
    this.circle = 1;
    this.speedCap = 99;        // m/s
    this.Rd = 12000;           // the range the line fights at
    this.focus = null;         // the enemy the line shoots at
    this.members = [];
  }

  update(world, dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.0;
    // a ship that is crippled (hurt badly or short of power) is left behind: it fights on her own and no longer sets the pace of the fleet
    const ships = world.ships.filter((s) => s.team === this.team && s.state === 'afloat' && s.hpFrac >= 0.35 && s.engine * s.propulsion >= 0.5);
    this.members = ships;
    for (const s of world.ships) if (s.team === this.team && !ships.includes(s)) s.station = null;
    const enemies = world.ships.filter((s) => s.team !== this.team && s.alive);
    if (ships.length < 2 || !enemies.length) { for (const s of ships) s.station = null; this.flag = null; return; }

    // where the enemy is, from the middle of ours
    let cx = 0, cz = 0;
    for (const s of ships) { cx += s.x; cz += s.z; }
    cx /= ships.length; cz /= ships.length;
    let ex = 0, ez = 0, ew = 0;
    for (const e of enemies) { const w = VALUE[e.stats.type] * (0.4 + e.hpFrac); ex += e.x * w; ez += e.z * w; ew += w; }
    ex /= ew; ez /= ew;

    // the order of battle (the flagship is the first of the line, so the plan is stable as long as the ships live)
    const plan = stationPlan(ships.map((s) => ({ type: s.stats.type, L: s.stats.L })), this.circle);
    const fi = plan.findIndex((p) => p && p.flag);
    if (fi < 0) { for (const s of ships) s.station = null; this.flag = null; return; }
    const flag = ships[fi];
    this.flag = flag;
    ships.forEach((s, i) => { s.station = plan[i]; });

    // pace and range: the line fights at the range of its shortest-ranged ship and sails at the speed of its slowest
    let rd = 1e9, vmax = 1e9;
    for (const s of ships) {
      const t = s.stats.type;
      if (t === 'DD' || t === 'CV') continue;
      vmax = Math.min(vmax, s.stats.maxSpeed * (0.2 + 0.8 * clamp(s.engine * s.propulsion, 0, 1)));
      if (s.aiRd) rd = Math.min(rd, s.aiRd);
    }
    if (vmax < 1e8) this.speedCap = vmax * 0.93;
    if (rd < 1e8) this.Rd = rd;

    // one target for the line: the enemy that most of its guns can reach, worth the most and already hurt
    let best = null, bs = 0;
    for (const e of enemies) {
      let reach = 0, n = 0;
      for (const s of ships) {
        const t = s.stats.type;
        if (t === 'DD' || t === 'CV') continue;
        n++;
        if (Math.hypot(e.x - s.x, e.z - s.z) < s.stats.main.maxRange * 0.9) reach++;
      }
      if (!n) continue;
      const sc = (reach / n) * VALUE[e.stats.type] * (1 + (1 - e.hpFrac) * 1.2) * (e === this.focus ? 1.4 : 1);
      if (sc > bs) { bs = sc; best = e; }
    }
    this.focus = best;
  }

  /** The point where `ship` should be now (world coordinates), or null. */
  stationPoint(ship) {
    const st = ship.station, F = this.flag;
    if (!st || !F || !F.alive) return null;
    const fx = Math.sin(F.heading), fz = -Math.cos(F.heading), rx = -fz, rz = fx;
    return [F.x + fx * st.f + rx * st.r, F.z + fz * st.f + rz * st.r, fx, fz, rx, rz];
  }
}
