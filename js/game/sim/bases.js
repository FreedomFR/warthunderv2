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
const COASTAL = { USA: [305, 2], Japan: [203, 2], UK: [234, 2], Germany: [380, 2], France: [240, 2], Italy: [203, 2] };
const aaBarrels = (cal) => cal >= 37 ? 1 : 4;      // on land a heavy flak gun, a 37 mm or a 40 mm is a single mount (the models of the guns of the bases); the 20 / 25 mm are quadruple or triple
const AA_CAL = { USA: 40, Japan: 25, UK: 40, Germany: 37, France: 25, Italy: 40 };
/**
 * The gun of the i-th light AA emplacement of a base: { cal, n }. The German fields mix their 37 mm guns with quadruple 20 mm Flakvierlinge, a twin 20 mm Flak 38 now and then and
 * 8.8 cm Flak (every other position of a battery: m = 2, one in four of a field or a port: m = 4); the Italian ones their 40 mm guns with 20 mm quads; the others one calibre.
 */
function aaGun(nation, i, m) {
  let cal = AA_CAL[nation] || 40, n;
  if (nation === 'Germany') {
    if (m === 4) { if (i % 4 === 1) cal = 20; else if (i % 4 === 3) cal = 88; else if (i % 8 === 4) { cal = 20; n = 2; } }
    else if (i % 2 === 1) cal = 20; else if (i === 2) cal = 88;
  } else if (nation === 'Italy' && i % 2 === 1) cal = 20;
  return { cal, n: n || aaBarrels(cal) };
}

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

function layoutAirfield(site, id, island, nation, level, rng, size = null) {
  const b = { id, kind: 'airfield', size, level, island: island.id, x: site.x, z: site.z, y: site.y, ang: site.ang, heading: hdg(site.ang), team: null, nation, pads: [], parts: [], guns: [], slots: [], taxi: [], aprons: [] };
  const at = frame(b), len = site.len, hw = 24, T0 = hw + 40;
  const put = (s, t) => at(s, t);
  // the levelled ground: the runway and the strip with the buildings
  const pc = at(0, 115);
  const extraRows = size === 'large' ? 1 : size === 'medium' ? -1 : 0, yo = 30 * Math.max(0, extraRows);       // (a large field has a fourth row of aircraft: the buildings move back)
  b.pads.push({ x: pc[0], z: pc[1], ang: b.ang, hl: len / 2 + 60, hw: 175 + 30 * Math.max(0, extraRows), y: site.y, blend: 150 });
  const r0 = put(-len / 2, 0), r1 = put(len / 2, 0);
  b.runway = { x0: r0[0], z0: r0[1], x1: r1[0], z1: r1[1], hw, len, y: site.y };
  // the taxiway beside the runway, joined to it at both ends, and the apron
  const t0 = put(-len / 2 + 30, hw + 35), t1 = put(len / 2 - 30, hw + 35);
  b.taxi.push({ x0: t0[0], z0: t0[1], x1: t1[0], z1: t1[1], w: 14 });
  for (const e of [-1, 1]) { const a = put(e * (len / 2 - 30), hw + 35), c = put(e * (len / 2 - 30), 0); b.taxi.push({ x0: a[0], z0: a[1], x1: c[0], z1: c[1], w: 14 }); }
  const ap = put(0, hw + 100);
  b.aprons.push({ x: ap[0], z: ap[1], ang: b.ang, hl: size === 'large' ? 330 : size === 'medium' ? 240 : 270, hw: size === 'large' ? 78 : size === 'medium' ? 48 : 62 });
  let n = 0;
  const part = (kind, label, s, t, w, l, h, extra = {}) => {
    const p = put(s, t);
    b.parts.push({ id: n++, kind, label, x: p[0], y: site.y, z: p[1], heading: b.heading + (extra.turn || 0), w, l, h, hp: extra.hp ?? 100, ...(extra.round ? { round: true } : {}) });
  };
  // hangars in a row facing the runway, the tower in the middle of the apron side
  const nh = level >= 2 ? 6 : 4;
  for (let i = 0; i < nh; i++) part('hangar', 'Hangar', (i - (nh - 1) / 2) * 98, hw + 175 + yo, 48, 34, 15, { hp: 140 });
  part('tower', 'Tour de contrôle', -40, hw + 82, 11, 11, 24, { hp: 70 });
  for (let i = 0; i < 4; i++) part('tank', 'Réservoir de carburant', -len / 2 + 120 + (i % 2) * 22, hw + 225 + yo + Math.floor(i / 2) * 22, 15, 15, 9, { round: true, hp: 60 });
  for (let i = 0; i < 6; i++) part('barracks', 'Casernement', 200 + (i % 3) * 34, hw + 230 + yo + Math.floor(i / 3) * 18, 28, 10, 6, { hp: 60 });
  part('radar', 'Radar', len / 2 - 140, hw + 150 + yo, 8, 8, 14, { hp: 40 });
  part('depot', 'Dépôt de munitions', -len / 2 + 190, hw + 265 + yo, 22, 14, 6, { hp: 80 });
  // the aircraft park on the apron, nose to the runway side, in three rows: a field takes in many more aircraft than a carrier's hangar (36 places)
  const cols = size === 'large' ? 14 : size === 'medium' ? 10 : 12, rows = size === 'large' ? 4 : size === 'medium' ? 2 : 3;
  for (let row = 0; row < rows; row++) for (let i = 0; i < cols; i++) {
    const p = put((i - (cols - 1) / 2) * 44, hw + 82 + row * 30);
    b.slots.push({ x: p[0], y: site.y, z: p[1], heading: b.heading - Math.PI / 2 });
  }
  // light AA: round the apron, at the ends of the runway and by the fuel
  const aaN = level >= 2 ? 12 : 8;
  const spots = [[-len / 2 - 25, 70], [len / 2 + 25, 70], [-len / 2 - 25, -50], [len / 2 + 25, -50], [-150, hw + 130], [150, hw + 130], [0, hw + 120], [-len / 2 + 140, hw + 195], [-300, hw + 80], [300, hw + 80], [-200, -45], [200, -45]];
  for (let i = 0; i < aaN; i++) {
    const [s, t] = spots[i], p = put(s, t);
    const g = aaGun(nation, i, 4);
    b.guns.push({ id: b.guns.length, kind: 'aa', x: p[0], y: site.y, z: p[1], heading: b.heading, cal: g.cal, n: g.n });
    if (g.n === 1 && g.cal < 80) { const q = put(s, t + (t > 0 ? 12 : -12)); b.guns.push({ id: b.guns.length, kind: 'aa', x: q[0], y: site.y, z: q[1], heading: b.heading, cal: g.cal, n: 1 }); }      // a single gun comes in a pair
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
  for (let i = 0; i < (level >= 2 ? 4 : 3); i++) {
    const p = put(-5, (i - 1.5) * 38);
    const g = aaGun(nation, i, 2);
    b.guns.push({ id: b.guns.length, kind: 'aa', x: p[0], y: site.y, z: p[1], heading: b.heading, cal: g.cal, n: g.n });
    if (g.n === 1 && g.cal < 80) { const q = put(-5, (i - 1.5) * 38 + 12); b.guns.push({ id: b.guns.length, kind: 'aa', x: q[0], y: site.y, z: q[1], heading: b.heading, cal: g.cal, n: 1 }); }      // a single gun comes in a pair
  }
  return b;
}

// ---- ports ---------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Sites for a port on an island: a flat stretch of land behind the shore for the yard (warehouses, fuel tanks, workshops) and, straight out to sea from it, water deep enough for a
 * pier that reaches the berths of the battleships (the shelf falls 12 m for every 100 m, so the deep water is a few hundred metres off) with nothing in the way. `terrain` is asked
 * for the sea (the other islands count). Returns [{ x, z, ang (towards the sea), y, depths, score }], best first.
 */
function portSites(terrain, island) {
  const coast = island.coast(), out = [];
  for (let i = 0; i + 3 < coast.length; i += 10) {
    const mx = (coast[i] + coast[i + 2]) / 2, mz = (coast[i + 1] + coast[i + 3]) / 2;
    let gx = 0, gz = 0;
    for (const d of [30, 90]) { gx += island.heightAt(mx + d, mz) - island.heightAt(mx - d, mz); gz += island.heightAt(mx, mz + d) - island.heightAt(mx, mz - d); }
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-3) continue;
    const ux = -gx / gl, uz = -gz / gl, ang = Math.atan2(uz, ux);
    // the sea off the shore: deep enough for a battleship at the outer berths, clear for 900 m, the shore itself a gentle slope
    const depth = (s, t = 0) => -terrain.heightAt(mx + ux * s - uz * t, mz + uz * s + ux * t);
    if (depth(160) < 12 || depth(300) < 18 || depth(420) < 20) continue;
    let clear = true;
    for (const s of [60, 200, 400, 650, 900, 1200]) for (const t of [-160, 0, 160]) if (depth(s, t) < 6) { clear = false; break; }
    for (const s of [1400, 1700, 2000, 2250]) if (depth(s) < 46) clear = false;      // (the approach point of the ships is out there: deep water, no island's shelf)
    if (!clear) continue;
    // the yard, inland of the shore: level, land all over
    const cx = mx - ux * 130, cz = mz - uz * 130, sv = survey(island, cx, cz, ang, -120, 120, -110, 110, 30);
    if (sv.land < 0.95 || sv.sd > 10 || sv.mean < 1.5 || sv.mean > 28) continue;
    out.push({ x: cx, z: cz, mx, mz, ux, uz, ang, y: clamp(sv.mean, 3.2, 4.6), score: sv.sd * 2 + Math.abs(sv.mean - 5) * 0.2 - Math.min(depth(160), 30) * 0.05 });
  }
  return out.sort((a, b) => a.score - b.score);
}

const PIER_W = 34, PIER_LEN = 500;           // the jetty: its width and how far it reaches from the shore

/**
 * A port: a yard on the shore, a long pier into deep water with berths along both sides, the anchorage off its head, the warehouses, fuel tanks, workshops and cranes that serve the
 * ships (what `sim/ports.js` works from) and the guns that cover it. `size` 'large' (a dockyard: a good repair yard) or 'medium'.
 * Extra fields of the layout: size, pier { x0, z0, x1, z1, w, y }, quay { s0, s1, sides: [{ side, depth: [{ s, depth }] }] } (s: metres from the shore along the pier, side +1 starboard /
 * -1 port of the axis towards the sea; the ships lie along the pier), moorings [{ x, z }] (the anchorage), approach { x, z, heading } (the point in open water where the ships come to, and the way
 * in), repair (the share of full repair speed this yard gives).
 */
function layoutPort(site, id, island, nation, size, level, rng, terrain) {
  const large = size === 'large';
  const b = { id, kind: 'port', size, island: island.id, x: site.x, z: site.z, y: site.y, ang: site.ang, heading: hdg(site.ang), team: null, nation, pads: [], parts: [], guns: [], slots: [], taxi: [], aprons: [] };
  const at = frame(b), put = (s, t) => at(s, t);
  b.pads.push({ x: site.x, z: site.z, ang: site.ang, hl: 125, hw: large ? 150 : 120, y: site.y, blend: 120 });      // (it ends at the shore: the sea bed off the quay is not raised)
  b.aprons.push({ x: site.x, z: site.z, ang: site.ang, hl: 118, hw: large ? 140 : 110 });
  // the pier starts at the shore (130 m from the centre of the yard along the axis) and runs out to sea
  const p0 = put(110, 0), p1 = put(130 + PIER_LEN, 0);
  b.pier = { x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1], w: PIER_W, y: site.y };
  // the quay: both sides of the pier, from the shore to a little beyond the head. A ship lies alongside wherever her length fits and the water under her is deep enough for her draught
  // (sim/ports.js findBerth reads the depth profile: [{ s (metres from the shore along the pier), depth }] each 20 m, measured at the distance a ship's side lies from the pier)
  b.quay = { s0: 60, s1: PIER_LEN + 20, sides: [1, -1].map((side) => ({ side, depth: [] })) };
  for (const q of b.quay.sides) for (let k = q.side === 1 ? 0 : 0, sD = b.quay.s0; sD <= b.quay.s1; sD += 20) {
    const c = put(130 + sD, q.side * (PIER_W / 2 + 22));
    q.depth.push({ s: sD, depth: -terrain.heightAt(c[0], c[1]) });
  }
  // the anchorage: moorings off the head of the pier, for the ships that find the berths taken (served half as fast)
  b.moorings = [];
  for (let k = 0; k < (large ? 6 : 4); k++) { const q = put(130 + PIER_LEN + 380 + Math.floor(k / 2) * 330, (k % 2 ? 1 : -1) * 230); b.moorings.push({ x: q[0], z: q[1] }); }
  const ap = put(130 + PIER_LEN + 1500, 0);
  b.approach = { x: ap[0], z: ap[1], heading: b.heading + Math.PI };
  b.repair = large ? 1 : 0.5;
  let n = 0;
  const part = (kind, label, s, t, w, l, h, extra = {}) => {
    const p = put(s, t);
    b.parts.push({ id: n++, kind, label, x: p[0], y: site.y, z: p[1], heading: b.heading + (extra.turn || 0), w, l, h, hp: extra.hp ?? 100, ...(extra.round ? { round: true } : {}) });
  };
  // warehouses and workshops in rows behind the shore, the fuel tanks and the magazines at the back (all on the pad: it ends 125 m behind the centre), the cranes on the pier
  const nw = large ? 6 : 3;
  for (let i = 0; i < nw; i++) part('warehouse', 'Entrepôt', -20 + Math.floor(i / 2) * 58, (i % 2 ? 1 : -1) * 70, 22, 50, 10, { hp: 110, turn: Math.PI / 2 });
  for (let i = 0; i < (large ? 2 : 1); i++) part('dockyard', 'Arsenal', 70, (i ? 1 : -1) * 40, 28, 62, 16, { hp: 160, turn: Math.PI / 2 });
  for (let i = 0; i < (large ? 6 : 3); i++) part('tank', 'Réservoir de carburant', -92 - Math.floor(i / 3) * 18, ((i % 3) - 1) * 34, 16, 16, 10, { round: true, hp: 60 });
  part('depot', 'Dépôt de munitions', -100, large ? 104 : 90, 24, 14, 6, { hp: 80 });
  if (large) part('depot', 'Dépôt de munitions', -100, -104, 24, 14, 6, { hp: 80 });
  for (let i = 0; i < (large ? 4 : 2); i++) part('barracks', 'Casernement', -60 + (i % 2) * 34, (i < 2 ? 1 : -1) * 112, 28, 10, 6, { hp: 60 });
  part('radar', 'Radar', -85, large ? -132 : -104, 8, 8, 14, { hp: 40 });
  part('tower', 'Capitainerie', 30, 28, 10, 10, 20, { hp: 70 });
  const nc = large ? 4 : 2;
  for (let i = 0; i < nc; i++) part('crane', 'Grue', 130 + 120 + i * 80, (i % 2 ? 1 : -1) * 10, 12, 12, 30, { hp: 90, turn: 0 });
  // the guns: light AA round the yard and at the root of the pier
  const aaN = large ? 10 : 6;
  const spots = [[-8, 112], [-8, -112], [60, 100], [60, -100], [110, 25], [110, -25], [-112, 60], [-112, -60], [30, 140], [30, -140]];
  for (let i = 0; i < aaN; i++) {
    const [s, t] = spots[i], p = put(s, t);
    const g = aaGun(nation, i, 4);
    b.guns.push({ id: b.guns.length, kind: 'aa', x: p[0], y: site.y, z: p[1], heading: b.heading, cal: g.cal, n: g.n });
    if (g.n === 1 && g.cal < 80) { const q = put(s, t + (t > 0 ? 12 : -12)); b.guns.push({ id: b.guns.length, kind: 'aa', x: q[0], y: site.y, z: q[1], heading: b.heading, cal: g.cal, n: 1 }); }      // a single gun comes in a pair
  }
  return b;
}

/**
 * The bases of a theatre of war: for every nation of o.nations ({ nation, team, home: { x, z }, ports (2), batteries (2) }) a large airfield and a medium one, ports, and batteries, on
 * the islands nearest to its home. Rebuilds the islands that get a base with levelled ground and fills terrain.bases.
 */
export function placeTheatreBases(terrain, o) {
  const rng = makeRng((o.seed | 0) * 40503 + 11);
  const claimed = new Set(), pads = new Map(), list = [];
  const addPads = (is, b) => { const q = pads.get(is.id) || []; q.push(...b.pads); pads.set(is.id, q); };
  const free = (is, site, r) => !(pads.get(is.id) || []).some((p) => Math.hypot(p.x - site.x, p.z - site.z) < p.hl + r) && !list.some((q) => q.island === is.id && Math.hypot(q.x - site.x, q.z - site.z) < 700);
  for (const nat of o.nations) {
    const home = nat.home, near = (is) => Math.hypot(is.x - home.x, is.z - home.z);
    const byDist = terrain.islands.slice().sort((a, b) => near(a) - near(b));
    // the large airfield on the biggest island of the neighbourhood, the medium one on the next that can hold a runway
    for (const [size, len, level] of [['large', 2000, 2], ['medium', 1300, 1]]) {
      const cands = byDist.filter((is) => (is.kind === 'large' || (is.kind === 'small' && is.r0 > (size === 'large' ? 640 : 480))) && !claimed.has(is.id) && near(is) < (o.reach || 24000));
      if (size === 'large') cands.sort((a, b) => (b.kind === 'large') - (a.kind === 'large') || b.r0 - a.r0 || near(a) - near(b));
      for (const is of cands) {
        const site = airfieldSite(is, len, rng);
        if (!site) continue;
        const b = layoutAirfield(site, list.length, is, nat.nation, level, rng, size);
        b.team = nat.team; list.push(b); claimed.add(is.id); addPads(is, b);
        break;
      }
    }
    // the ports: on the islands nearest to home (an island can carry an airfield and a port when the sites are far enough apart)
    let have = 0;
    for (const is of byDist) {
      if (have >= (nat.ports ?? 2) || near(is) > (o.reach || 24000) * 1.5) break;
      if (is.kind === 'rock') continue;
      for (const site of portSites(terrain, is)) {
        if (!free(is, site, 260)) continue;
        const b = layoutPort(site, list.length, is, nat.nation, have === 0 ? 'large' : 'medium', 1, rng, terrain);
        b.team = nat.team; list.push(b); addPads(is, b); have++;
        break;
      }
    }
    // the coastal batteries that cover the ports and the airfields
    let guns = 0;
    for (const is of byDist) {
      if (guns >= (nat.batteries ?? 2) || near(is) > (o.reach || 24000)) break;
      if (is.kind === 'rock') continue;
      for (const site of batterySites(is)) {
        if (list.some((o2) => Math.hypot(o2.x - site.x, o2.z - site.z) < 600)) continue;
        if (is.pads.length && is.padAt(site.x, site.z) > 0) continue;
        if ((pads.get(is.id) || []).some((p) => Math.hypot(p.x - site.x, p.z - site.z) < p.hl + 200)) continue;
        const b = layoutBattery(site, list.length, is, nat.nation, 2, rng);
        b.team = nat.team; list.push(b); addPads(is, b); guns++;
        break;
      }
    }
  }
  terrain.islands = terrain.islands.map((is) => (pads.has(is.id) ? is.withPads(pads.get(is.id)) : is));
  for (const b of list) {
    const is = terrain.islands.find((q) => q.id === b.island);
    b.y = is.heightAt(b.x, b.z);
    for (const p of b.parts) p.y = is.heightAt(p.x, p.z);
    for (const g of b.guns) g.y = is.heightAt(g.x, g.z);
    for (const q of b.slots) q.y = is.heightAt(q.x, q.z);
    if (b.runway) b.runway.y = is.heightAt((b.runway.x0 + b.runway.x1) / 2, (b.runway.z0 + b.runway.z1) / 2);
    if (b.kind === 'port') { b.y = b.pier.y = b.pads[0].y; for (const p of b.parts) if (p.kind !== 'crane') p.y = b.y; else p.y = b.y; for (const g of b.guns) g.y = b.y; }
  }
  terrain.bases = list;
  return list;
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
