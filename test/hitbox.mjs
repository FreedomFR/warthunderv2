// Hit volumes against the real geometry: node test/hitbox.mjs [ship ids] [rays per ship] [--dump]
// Shells are traced through the hit volumes of the simulation (sim/damage.js segmentHit) and, for the same path, through the triangles of the ship that are drawn (the hull and
// fixed structures, the destroyable parts, the gun houses and the light AA mounts). A hit where nothing is drawn is a ghost hit (a scar on empty air); a path through a solid that the
// simulation did not stop is a miss. The ships lie still, bow to the north, and the shells come from every bearing at the angles of real fire.
import { World } from '../js/game/sim/world.js';
import { segmentHit, resolveShellHit } from '../js/game/sim/damage.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { TWEAKS } from '../js/game/model/tweaks.js';
import { getMountModel } from '../js/game/model/mounts.js';
import { mat4YawPitchAt, mat4Ship } from '../js/game/math.js';
import { makeRng } from '../js/game/math.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DUMP = process.argv.includes('--dump');
const ids = args.filter((a) => isNaN(Number(a)));
const RAYS = Number(args.find((a) => !isNaN(Number(a))) || 400);
let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

/** The triangles of what is drawn, in ship-local coordinates: a flat array of 9 numbers per triangle. */
function drawnTriangles(model) {
  const out = [];
  const addMesh = (m, M = null) => {
    const f = new Float32Array(m.vertices), ix = m.indices;
    const P = new Float64Array(m.vertexCount * 3);
    for (let i = 0; i < m.vertexCount; i++) {
      const x = f[i * 6], y = f[i * 6 + 1], z = f[i * 6 + 2];
      if (M) { P[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; P[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; P[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; } else { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; }
    }
    for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) out.push(P[ix[t + k] * 3], P[ix[t + k] * 3 + 1], P[ix[t + k] * 3 + 2]);
  };
  addMesh(model.mesh);
  for (const p of model.parts) if (p.mesh) addMesh(p.mesh);
  const M = new Float64Array(16);
  for (const m of model.mounts) {
    const mm = getMountModel({ kind: m.kind, cal: m.cal, n: m.n, bore: m.bore, col: model.pal.sup, variant: m.variant, top: model.pal.top, look: m.look });
    mat4YawPitchAt(M, m.x, m.y, m.z, m.arcC ?? 0, 0);
    addMesh(mm.house, M);
  }
  for (const a of model.aaMounts) {
    const mm = getMountModel({ kind: 'aa', cal: a.cal, n: a.n, bore: a.bore, col: model.pal.sup, variant: a.variant, look: a.look });
    mat4YawPitchAt(M, a.x, a.y, a.z, a.yaw0 ?? a.arcC ?? 0, 0);
    addMesh(mm.house, M);
  }
  return Float64Array.from(out);
}

/** A grid over the plan of the triangles, to find the ones near a path. */
function gridOf(T, cell = 3) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.length; i += 3) { x0 = Math.min(x0, T[i]); x1 = Math.max(x1, T[i]); z0 = Math.min(z0, T[i + 2]); z1 = Math.max(z1, T[i + 2]); }
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const cells = Array.from({ length: nx * nz }, () => []);
  for (let t = 0; t < T.length; t += 9) {
    const ax = Math.min(T[t], T[t + 3], T[t + 6]), bx = Math.max(T[t], T[t + 3], T[t + 6]), az = Math.min(T[t + 2], T[t + 5], T[t + 8]), bz = Math.max(T[t + 2], T[t + 5], T[t + 8]);
    for (let j = Math.floor((az - z0) / cell); j <= Math.floor((bz - z0) / cell); j++) for (let i = Math.floor((ax - x0) / cell); i <= Math.floor((bx - x0) / cell); i++) cells[j * nx + i].push(t);
  }
  return { T, cell, x0, z0, nx, nz, cells };
}

/** First intersection (parameter 0..1) of the segment a -> b with the triangles, or null. */
function trace(G, a, b) {
  const { T, cell, x0, z0, nx, nz, cells } = G;
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
  const seen = new Set();
  let best = Infinity;
  for (let s = 0; s <= steps; s++) {
    const f = s / steps, i = Math.floor((a[0] + dx * f - x0) / cell), j = Math.floor((a[2] + dz * f - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
    for (const t of cells[j * nx + i]) {
      if (seen.has(t)) continue;
      seen.add(t);
      const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2], e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = a[0] - T[t], ty = a[1] - T[t + 1], tz = a[2] - T[t + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt >= 0 && tt <= 1 && tt < best) best = tt;
    }
  }
  return best < Infinity ? best : null;
}

const list = ids.length ? ALL_SHIPS.filter((s) => ids.includes(s.id)) : ALL_SHIPS;
const totals = { rays: 0, ghost: 0, miss: 0, off: 0, good: 0, clear: 0 };
const bakedMiss = { miss: 0, solids: 0 };
const offBy = {}, gaps = [];
for (const spec of list) {
  const w = new World(1); w.addTeam(0); w.addTeam(1);
  const ship = w.addShip(spec.id, 0, 0, 0, 0);       // bow to the north (heading 0), at rest
  ship.pitch = 0; ship.roll = 0; ship.y = 0;
  const model = ship.model, st = ship.stats;
  const G = gridOf(drawnTriangles(model));
  const rng = makeRng(77);
  const st2 = { rays: 0, ghost: 0, miss: 0, off: 0, good: 0, clear: 0 };
  const worst = [];
  for (let n = 0; n < RAYS; n++) {
    // a shell path in the ship's frame: from a bearing at a descent angle of 2 to 25 degrees, aimed at a point of the ship
    const bearing = rng() * Math.PI * 2, el = (2 + 23 * rng() * rng()) * Math.PI / 180;
    const tx = (rng() - 0.5) * st.L * 0.95, tz = (rng() - 0.5) * st.B * 0.9, ty = rng() * model.topY * 0.9;
    const dirx = Math.cos(bearing) * Math.cos(el), dirz = Math.sin(bearing) * Math.cos(el), diry = Math.sin(el);
    const R = st.L * 0.9 + 60;
    // local frame: x forward (bow), z starboard; the path comes down towards the aim point
    const a = [tx - dirx * R, ty + diry * R, tz - dirz * R], b = [tx + dirx * R, ty - diry * R, tz + dirz * R];
    const wa = ship.toWorld(a[0], a[1], a[2], [0, 0, 0]), wb = ship.toWorld(b[0], b[1], b[2], [0, 0, 0]);
    const h = segmentHit(ship, wa[0], wa[1], wa[2], wb[0], wb[1], wb[2]);
    const tt = trace(G, a, b);
    const Ls = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    st2.rays++;
    let kind = 'good';
    if (h && tt == null) kind = 'ghost';
    else if (!h && tt != null) kind = 'miss';
    else if (h && tt != null && Math.abs(h.t - tt) * Ls > 6) kind = 'off';
    else if (!h && tt == null) kind = 'clear';
    st2[kind]++;
    if (h && tt != null) gaps.push(Math.abs(h.t - tt) * Ls);
    if (kind === 'off') { const k = h.part + (h.t < tt ? ' early' : ' late'); const o = (offBy[k] ||= { n: 0, gap: 0 }); o.n++; o.gap += Math.abs(h.t - tt) * Ls; }
    if (DUMP && (kind === 'ghost' || kind === 'miss' || kind === 'off')) worst.push({ kind, part: h && h.part, at: h ? [h.lx, h.ly, h.lz].map((v) => +v.toFixed(1)) : null, gap: h && tt != null ? +((h.t - tt) * Ls).toFixed(1) : null });
  }
  // a ship drawn from a baked reference mesh shows every fitting of the model, which the hit volumes do not model: its misses are judged apart (below), the rest as before
  const baked = !!TWEAKS[spec.id]?.baked;
  for (const k of Object.keys(totals)) { if (baked && k === 'miss') bakedMiss.miss += st2.miss; else totals[k] += st2[k]; }
  if (baked) bakedMiss.solids += st2.good + st2.miss + st2.off;
  const solid = st2.rays - st2.clear;
  console.log(`${spec.id.padEnd(16)} rays ${st2.rays}  good ${st2.good}  ghost ${st2.ghost} (${(100 * st2.ghost / Math.max(1, st2.ghost + st2.good + st2.off)).toFixed(0)}% of the hits)  miss ${st2.miss}  off ${st2.off}  clear ${st2.clear}`);
  if (DUMP) for (const o of worst.slice(0, 6)) console.log('   ', JSON.stringify(o));
}
if (process.argv.includes('--off')) for (const [k, o] of Object.entries(offBy).sort((a, b) => b[1].n - a[1].n)) console.log('  off', k.padEnd(14), o.n, 'mean gap', (o.gap / o.n).toFixed(1), 'm');
const hits = totals.good + totals.ghost + totals.off, solids = totals.good + totals.miss + totals.off;
const ghostRate = totals.ghost / Math.max(1, hits), missRate = totals.miss / Math.max(1, solids), offRate = totals.off / Math.max(1, hits);
gaps.sort((a, b) => a - b);
const med = gaps[Math.floor(gaps.length / 2)], p90 = gaps[Math.floor(gaps.length * 0.9)];
ok(med < 0.6 && p90 < 4, `where both stop the shell, the burst is ${med.toFixed(2)} m (median) and ${p90.toFixed(1)} m (90 %) from the drawn surface along the path`);
ok(ghostRate < 0.04, `hits where nothing is drawn: ${(100 * ghostRate).toFixed(1)} % of the hits (${totals.ghost} of ${hits})`);
ok(missRate < 0.04, `paths through drawn solids that the simulation let through: ${(100 * missRate).toFixed(1)} % (${totals.miss} of ${solids})`);
ok(bakedMiss.solids === 0 || bakedMiss.miss / bakedMiss.solids < 0.15, `ships drawn from a baked reference mesh: paths through drawn solids that the simulation let through: ${(100 * bakedMiss.miss / Math.max(1, bakedMiss.solids)).toFixed(1)} % (${bakedMiss.miss} of ${bakedMiss.solids}, below 15 %)`);
ok(offRate < 0.07, `hits more than 6 m from the drawn surface: ${(100 * offRate).toFixed(1)} % (${totals.off} of ${hits})`);

// ---- a ship that heels and trims is hit where she is drawn, not where her upright self would be ----
{
  const w = new World(2); w.addTeam(0); w.addTeam(1);
  const ship = w.addShip('cleveland', 0, 100, -200, 0.7);
  ship.roll = 0.4; ship.pitch = -0.12; ship.y = -1.5;
  const M = new Float64Array(16); mat4Ship(M, ship.x, ship.y, ship.z, ship.heading, ship.pitch, ship.roll);
  const toW = (x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
  let found = 0, tried = 0, lateral = 0;
  for (const [lx, lz] of [[-30, 5], [10, -4], [40, 3], [-60, -5], [0, 6]]) {
    const deck = ship.model.hull.deckY(lx);
    const a = toW(lx, deck + 12, lz), b = toW(lx, deck - 6, lz);       // straight down through the drawn hull at that point
    const h = segmentHit(ship, a[0], a[1], a[2], b[0], b[1], b[2]);
    tried++;
    if (h && Math.abs(h.lx - lx) < 1.5 && Math.abs(h.lz - lz) < 1.5) found++;
    if (h) lateral = Math.max(lateral, Math.hypot(h.lx - lx, h.lz - lz));
  }
  ok(found === tried, `a heeled and trimmed ship (roll 23 degrees) is struck at the point of her that the shell goes through (${found} of ${tried}, worst ${lateral.toFixed(1)} m off)`);
}

// ---- the shells burst and leave their scars on the drawn surface ----
{
  let n = 0, near = 0, errors = 0, tried = 0;
  for (const id of ['iowa', 'fletcher', 'essex', 'yamato', 'belfast']) {
    const w = new World(3); w.addTeam(0); w.addTeam(1);
    const ship = w.addShip(id, 0, 0, 0, 0);
    ship.pitch = 0; ship.roll = 0; ship.y = 0;
    const G = gridOf(drawnTriangles(ship.model)), rng = makeRng(5), st = ship.stats, gun = ship.mounts[0].gun;
    for (let k = 0; k < 260; k++) {
      const bearing = rng() * Math.PI * 2, el = (2 + 20 * rng() * rng()) * Math.PI / 180;
      const tx = (rng() - 0.5) * st.L * 0.95, tz = (rng() - 0.5) * st.B * 0.9, ty = rng() * ship.model.topY * 0.9;
      const d = [Math.cos(bearing) * Math.cos(el), -Math.sin(el), Math.sin(bearing) * Math.cos(el)], R = st.L * 0.9 + 60;
      const wa = ship.toWorld(tx - d[0] * R, ty - d[1] * R, tz - d[2] * R, [0, 0, 0]), wb = ship.toWorld(tx + d[0] * R, ty + d[1] * R, tz + d[2] * R, [0, 0, 0]);
      const h = segmentHit(ship, wa[0], wa[1], wa[2], wb[0], wb[1], wb[2]);
      if (!h) continue;
      // the path in the world: local x is north (-z), local z is east
      const vx = d[2] * 500, vy = d[1] * 500, vz = -d[0] * 500;
      ship.hp = st.maxHp; ship.state = 'afloat';
      const before = ship.scars.length;
      tried++;
      try { resolveShellHit(w, ship, { gun, type: tried % 2 ? 'AP' : 'HE', vx, vy, vz, owner: null, x: wb[0], y: wb[1], z: wb[2] }, h); } catch (e) { errors++; console.log('   exception', id, e.message); continue; }
      w.drainEvents();
      const sc = ship.scars[ship.scars.length - 1];
      if (!sc || ship.scars.length === before && before < 54) continue;
      n++;
      // a short path across the scar along its normal must meet the drawn surface
      const a = [sc.x + sc.nx * 0.9, sc.y + sc.ny * 0.9, sc.z + sc.nz * 0.9], b = [sc.x - sc.nx * 0.9, sc.y - sc.ny * 0.9, sc.z - sc.nz * 0.9];
      if (trace(G, a, b) != null) near++;
    }
  }
  ok(errors === 0 && tried > 400, `${tried} shells of both kinds resolved on five ships without an error`);
  ok(n > 200 && near / n > 0.85, `${near} of ${n} scars (${(100 * near / Math.max(1, n)).toFixed(0)} %) lie on the drawn surface (within 0.9 m)`);
}
process.exit(fail ? 1 : 0);
