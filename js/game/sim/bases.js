// Military bases on the islands: an airfield (a runway, the apron, hangars, a control tower, fuel tanks, barracks, a radar, anti-aircraft guns and the places where the
// aircraft park) and coastal batteries (heavy guns in emplacements, a fire-control post, anti-aircraft guns). `placeBases` finds the sites, levels the ground there
// (the island is built again with pads, see terrain.js), lays the base out and gives each base to the team whose fleet starts nearest to it.
//
// Everything is in world coordinates (metres; x east, z south, y up), static and deterministic for a seed. A layout is a plain object:
//   {
//     id, kind: 'airfield' | 'battery', island (id),
//     x, z, y,                  the centre of the site and the height of its ground
//     ang,                      the axis in the x-z plane (the runway of an airfield, the direction of the sea for a battery): the unit vector is (cos ang, sin ang)
//     heading,                  the same axis as the heading of a ship (0 = north = -z, clockwise): atan2(cos ang, -sin ang)
//     team, nation,             who owns it (null when it has no owner)
//     pads: [{ x, z, ang, hl, hw, y, blend }],
//     runway: { x0, z0, x1, z1, hw, len, y },                     (airfield) from end to end, in the direction of the axis
//     taxi: [{ x0, z0, x1, z1, w }],                              (airfield) the taxiways
//     aprons: [{ x, z, ang, hl, hw }],                            paved areas
//     parts: [{ id, kind, label, x, y, z, heading, w, l, h, hp }],   the buildings and the things that can be destroyed (heading as a ship: l along it, w across it)
//     guns: [{ id, kind: 'coastal' | 'aa', x, y, z, heading, cal, n }],   the guns (coastal: heavy twin or triple mounts; aa: light mounts)
//     slots: [{ x, y, z, heading }],                              (airfield) the places where the aircraft park (nose along heading)
//   }
// Parts kinds: 'hangar', 'tower', 'tank' (round: w = l = diameter), 'barracks', 'radar', 'depot', 'bunker', 'post' (the fire-control post of a battery).
import { makeRng, clamp } from '../math.js';

const hdg = (ang) => Math.atan2(Math.cos(ang), -Math.sin(ang));          // axis angle in the x-z plane -> heading of a ship (0 = north)
const frame = (b) => {
  const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
  // s along the axis, t across it (to the right of the axis, looking along it: (-sin, cos))
  return (s, t) => [b.x + s * ca - t * sa, b.z + s * sa + t * ca];
};

/** How much a nation's heavy coastal guns weigh: [calibre mm, barrels per mount]. */
const COASTAL = { USA: [305, 2], Japan: [203, 2], UK: [234, 2], Germany: [203, 2], France: [240, 2], Italy: [203, 2] };
const AA_CAL = { USA: 40, Japan: 25, UK: 40, Germany: 37, France: 25, Italy: 20 };

// ---- sites -------------------------------------------------------------------------------------------------------------------------------------------------------

/** Height statistics of a rectangle of the ground (centre cx, cz, axis ang, s in [s0, s1], t in [t0, t1]): { mean, sd, land (share of the samples above 1 m), min, max }. */
function survey(island, cx, cz, ang, s0, s1, t0, t1, step = 40) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let n = 0, sum = 0, sq = 0, land = 0, lo = 1e9, hi = -1e9;
  for (let s = s0; s <= s1 + 1e-6; s += step) for (let t = t0; t <= t1 + 1e-6; t += step) {
    const h = island.heightAt(cx + s * ca - t * sa, cz + s * sa + t * ca);
    n++; sum += h; sq += h * h; if (h > 1) land++; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)), land: land / n, min: lo, max: hi };
}

/**
 * The best site for an airfield on an island: a rectangle that holds the runway (length `len`), the taxiway, the apron and the buildings on one side of it, on ground that is
 * land, not too high and as level as can be found. Returns { x, z, ang, y, len, score } or null.
 */
function airfieldSite(island, len, rng) {
  let best = null;
  const R = island.R, step = 70;
  const half = len / 2 + 70;
  for (let dz = -R; dz <= R; dz += step) for (let dx = -R; dx <= R; dx += step) {
    const cx = island.x + dx, cz = island.z + dz;
    const h0 = island.heightAt(cx, cz);
    if (h0 < 4 || h0 > 90) continue;
    for (let k = 0; k < 12; k++) {
      const ang = k * Math.PI / 12 + rng() * 0.04;
      // the runway is the middle strip; the buildings are on the side t > 0 (up to 270 m)
      const sv = survey(island, cx, cz, ang, -half, half, -50, 280, 45);
      if (sv.land < 0.88 || sv.mean < 3 || sv.mean > 75) continue;
      const score = sv.sd + 0.02 * Math.max(0, sv.mean - 25) + (1 - sv.land) * 20;
      if (!best || score < best.score) best = { x: cx, z: cz, ang, y: clamp(sv.mean, 7, 40), len, score, sd: sv.sd };
    }
  }
  return best && best.sd < 22 ? best : null;
}

/** Sites for coastal batteries on an island: high ground a few hundred metres behind the coast, looking at the sea. Returns [{ x, z, ang (towards the sea), y, score }]. */
function batterySites(island) {
  const coast = island.coast(), out = [];
  for (let i = 0; i + 3 < coast.length; i += 12) {
    const mx = (coast[i] + coast[i + 2]) / 2, mz = (coast[i + 1] + coast[i + 3]) / 2;
    // the way to the sea: down the slope of the shore (the sea is where the ground is lower)
    let gx = 0, gz = 0;
    for (const d of [30, 90]) { gx += island.heightAt(mx + d, mz) - island.heightAt(mx - d, mz); gz += island.heightAt(mx, mz + d) - island.heightAt(mx, mz - d); }
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-3) continue;
    const ux = -gx / gl, uz = -gz / gl;                  // towards the sea
    for (const back of [160, 240, 330]) {
      const x = mx - ux * back, z = mz - uz * back, h = island.heightAt(x, z);
      if (h < 14 || h > 120) continue;
      const ang = Math.atan2(uz, ux), sv = survey(island, x, z, ang, -60, 60, -45, 45, 30);
      if (sv.land < 0.97 || sv.sd > 8) continue;
      out.push({ x, z, ang, y: clamp(sv.mean, 10, 100), score: sv.sd + Math.abs(h - 45) * 0.04 });
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

// ---- layouts ---------------------------------------------------------------------------------------------------------------------------------------------

function layoutAirfield(site, id, island, nation, level, rng) {
  const b = { id, kind: 'airfield', island: island.id, x: site.x, z: site.z, y: site.y, ang: site.ang, heading: hdg(site.ang), team: null, nation, pads: [], parts: [], guns: [], slots: [], taxi: [], aprons: [] };
  const at = frame(b), len = site.len, hw = 24, T0 = hw + 40;
  const put = (s, t) => at(s, t);
  // the levelled ground: the runway and the strip with the buildings
  const pc = at(0, 115);
  b.pads.push({ x: pc[0], z: pc[1], ang: b.ang, hl: len / 2 + 60, hw: 175, y: site.y, blend: 150 });
  const r0 = put(-len / 2, 0), r1 = put(len / 2, 0);
  b.runway = { x0: r0[0], z0: r0[1], x1: r1[0], z1: r1[1], hw, len, y: site.y };
  // the taxiway beside the runway, joined to it at both ends, and the apron
  const t0 = put(-len / 2 + 30, hw + 35), t1 = put(len / 2 - 30, hw + 35);
  b.taxi.push({ x0: t0[0], z0: t0[1], x1: t1[0], z1: t1[1], w: 14 });
  for (const e of [-1, 1]) { const a = put(e * (len / 2 - 30), hw + 35), c = put(e * (len / 2 - 30), 0); b.taxi.push({ x0: a[0], z0: a[1], x1: c[0], z1: c[1], w: 14 }); }
  const ap = put(0, hw + 100);
  b.aprons.push({ x: ap[0], z: ap[1], ang: b.ang, hl: 270, hw: 62 });
  let n = 0;
  const part = (kind, label, s, t, w, l, h, extra = {}) => {
    const p = put(s, t);
    b.parts.push({ id: n++, kind, label, x: p[0], y: site.y, z: p[1], heading: b.heading + (extra.turn || 0), w, l, h, hp: extra.hp ?? 100, ...(extra.round ? { round: true } : {}) });
  };
  // hangars in a row facing the runway, the tower in the middle of the apron side
  const nh = level >= 2 ? 6 : 4;
  for (let i = 0; i < nh; i++) part('hangar', 'Hangar', (i - (nh - 1) / 2) * 98, hw + 175, 48, 34, 15, { hp: 140 });
  part('tower', 'Tour de contrôle', -40, hw + 82, 11, 11, 24, { hp: 70 });
  for (let i = 0; i < 4; i++) part('tank', 'Réservoir de carburant', -len / 2 + 120 + (i % 2) * 22, hw + 225 + Math.floor(i / 2) * 22, 15, 15, 9, { round: true, hp: 60 });
  for (let i = 0; i < 6; i++) part('barracks', 'Casernement', 200 + (i % 3) * 34, hw + 230 + Math.floor(i / 3) * 18, 28, 10, 6, { hp: 60 });
  part('radar', 'Radar', len / 2 - 140, hw + 150, 8, 8, 14, { hp: 40 });
  part('depot', 'Dépôt de munitions', -len / 2 + 190, hw + 265, 22, 14, 6, { hp: 80 });
  // the aircraft park on the apron, nose to the runway side, in three rows: a field takes in many more aircraft than a carrier's hangar (36 places)
  const cols = 12;
  for (let row = 0; row < 3; row++) for (let i = 0; i < cols; i++) {
    const p = put((i - (cols - 1) / 2) * 44, hw + 82 + row * 30);
    b.slots.push({ x: p[0], y: site.y, z: p[1], heading: b.heading - Math.PI / 2 });
  }
  // light AA: round the apron, at the ends of the runway and by the fuel
  const aaN = level >= 2 ? 12 : 8, cal = AA_CAL[nation] || 40;
  const spots = [[-len / 2 - 25, 70], [len / 2 + 25, 70], [-len / 2 - 25, -50], [len / 2 + 25, -50], [-150, hw + 130], [150, hw + 130], [0, hw + 120], [-len / 2 + 140, hw + 195], [-300, hw + 80], [300, hw + 80], [-200, -45], [200, -45]];
  for (let i = 0; i < aaN; i++) {
    const [s, t] = spots[i], p = put(s, t);
    const gc = nation === 'Germany' && i % 3 === 1 ? 20 : cal;       // (the German fields mix their 37 mm guns with quadruple 20 mm Flakvierlinge)
    b.guns.push({ id: i, kind: 'aa', x: p[0], y: site.y, z: p[1], heading: b.heading, cal: gc, n: gc >= 37 ? 2 : 4 });
  }
  return b;
}

function layoutBattery(site, id, island, nation, level, rng) {
  const b = { id, kind: 'battery', island: island.id, x: site.x, z: site.z, y: site.y, ang: site.ang, heading: hdg(site.ang), team: null, nation, pads: [], parts: [], guns: [], slots: [], taxi: [], aprons: [] };
  const at = frame(b);
  b.pads.push({ x: site.x, z: site.z, ang: site.ang, hl: 70, hw: 60, y: site.y, blend: 60 });
  let n = 0;
  const put = (s, t) => at(s, t);
  const [cal, barrels] = COASTAL[nation] || COASTAL.USA;
  const nGuns = level >= 2 ? 4 : 3;
  for (let i = 0; i < nGuns; i++) {
    const p = put(30, (i - (nGuns - 1) / 2) * 46);
    b.guns.push({ id: i, kind: 'coastal', x: p[0], y: site.y, z: p[1], heading: b.heading, cal, n: barrels });
  }
  const post = put(-20, 0);
  b.parts.push({ id: n++, kind: 'post', label: 'Poste de tir', x: post[0], y: site.y, z: post[1], heading: b.heading, w: 14, l: 10, h: 12, hp: 80 });
  for (let i = 0; i < 2; i++) { const p = put(-30, (i ? 1 : -1) * 38); b.parts.push({ id: n++, kind: 'bunker', label: 'Soute', x: p[0], y: site.y, z: p[1], heading: b.heading, w: 18, l: 12, h: 4, hp: 80 }); }
  const rd = put(-45, 0); b.parts.push({ id: n++, kind: 'radar', label: 'Radar', x: rd[0], y: site.y, z: rd[1], heading: b.heading, w: 6, l: 6, h: 10, hp: 40 });
  const acal = AA_CAL[nation] || 40;
  for (let i = 0; i < (level >= 2 ? 4 : 3); i++) {
    const p = put(-5, (i - 1.5) * 38);
    const gc = nation === 'Germany' && i % 2 === 1 ? 20 : acal;
    b.guns.push({ id: nGuns + i, kind: 'aa', x: p[0], y: site.y, z: p[1], heading: b.heading, cal: gc, n: gc >= 37 ? 2 : 4 });
  }
  return b;
}

// ---- placement -------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Place the bases of a terrain. o: { seed, level (1: an airfield and a battery for each team that can have them, 2: more guns and hangars and a second battery),
 * starts: [{ x, z, nation }] (where the fleets start: a base belongs to the team that starts nearest to it) }.
 * Rebuilds the islands that get a base with levelled ground and fills terrain.bases.
 */
export function placeBases(terrain, o) {
  const rng = makeRng((o.seed | 0) * 40503 + 7);
  const starts = o.starts, level = o.level || 1;
  const claimed = new Set();           // islands that already carry an airfield
  const pads = new Map();              // island id -> [pad]
  const list = [];
  const distTo = (is, st) => Math.hypot(is.x - st.x, is.z - st.z);
  const addPads = (is, b) => { const q = pads.get(is.id) || []; q.push(...b.pads); pads.set(is.id, q); };
  // an airfield for every team: the nearest island that can hold a runway (a long one on a large island, a short one on a small island)
  for (let t = 0; t < starts.length; t++) {
    const cands = terrain.islands.filter((is) => (is.kind === 'large' || (is.kind === 'small' && is.r0 > 430)) && !claimed.has(is.id)).sort((a, b) => distTo(a, starts[t]) - distTo(b, starts[t]));
    for (const is of cands) {
      const len = is.kind === 'large' ? 1150 : 760;
      const site = airfieldSite(is, len, rng);
      if (!site) continue;
      const b = layoutAirfield(site, list.length, is, starts[t].nation, level, rng);
      b.team = t;
      list.push(b); claimed.add(is.id); addPads(is, b);
      break;
    }
  }
  // coastal batteries: on the islands nearest to each team (the airfield islands too), one on each side of the island at most
  for (let t = 0; t < starts.length; t++) {
    const want = level >= 2 ? 2 : 1;
    let have = 0;
    const cands = terrain.islands.filter((is) => is.kind !== 'rock').sort((a, b) => distTo(a, starts[t]) - distTo(b, starts[t]));
    for (const is of cands) {
      if (have >= want) break;
      const sites = batterySites(is);
      for (const site of sites) {
        // away from the other bases and from the pads of the island
        if (list.some((o2) => Math.hypot(o2.x - site.x, o2.z - site.z) < 700)) continue;
        if (is.pads.length && is.padAt(site.x, site.z) > 0) continue;
        if ((pads.get(is.id) || []).some((p) => Math.hypot(p.x - site.x, p.z - site.z) < p.hl + 200)) continue;
        const b = layoutBattery(site, list.length, is, starts[t].nation, level, rng);
        b.team = t;
        list.push(b); addPads(is, b); have++;
        break;
      }
    }
  }
  // the islands are built again with the levelled ground
  terrain.islands = terrain.islands.map((is) => (pads.has(is.id) ? is.withPads(pads.get(is.id)) : is));
  // the bases know their (new) island and the height of the ground they stand on
  for (const b of list) {
    const is = terrain.islands.find((q) => q.id === b.island);
    b.y = is.heightAt(b.x, b.z);
    for (const p of b.parts) p.y = is.heightAt(p.x, p.z);
    for (const g of b.guns) g.y = is.heightAt(g.x, g.z);
    for (const s of b.slots) s.y = is.heightAt(s.x, s.z);
    if (b.runway) b.runway.y = is.heightAt((b.runway.x0 + b.runway.x1) / 2, (b.runway.z0 + b.runway.z1) / 2);
  }
  terrain.bases = list;
  return list;
}


/**
 * The live state of a base (what changes during the battle). The layout above is static; this is what the simulation moves and the render draws:
 *   partState[i]   0 intact, 1 damaged (smoking, scorched), 2 destroyed (the ruin is drawn)   -- one per layout.parts[i]
 *   partHp[i]      hit points left
 *   guns[i]        one per layout.guns[i]: { train (rad, relative to the heading of the gun), elev (rad), recoil (0..1, decays), flash (0..1, decays), alive, hp, reload }
 *   parked[i]      one per layout.slots[i]: the key of the aircraft parked there (PLANES) or null
 *   alive          false once the base is out of action (guns, hangars and tower all destroyed)
 */
export class BaseState {
  constructor(layout) {
    this.layout = layout;
    this.id = layout.id;
    this.team = layout.team;
    this.partState = layout.parts.map(() => 0);
    this.partHp = layout.parts.map((p) => p.hp);
    this.guns = layout.guns.map((g) => ({ train: 0, elev: g.kind === 'aa' ? 0.5 : 0.12, recoil: 0, flash: 0, alive: true, hp: g.kind === 'aa' ? 30 : 220, reload: 0 }));
    this.parked = layout.slots.map(() => null);
    this.alive = true;
  }
}
