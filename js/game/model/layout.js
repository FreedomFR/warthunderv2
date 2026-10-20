// How the gun houses sit among the structures round them. A house is the box of the mesh that is drawn (the same box the hit model uses, sim/damage.js), turned as it
// stands at rest. `buriedIn` samples it and says how much of it is sunk in something (a deckhouse, a tower tier, a funnel, the hull above the deck) and how deep;
// `clearHouses` slides a mount a few tenths of a metre along its deck when it is sunk in a structure, so that the model has no wall going through a turret.
import { getMountModel } from './mounts.js';
import { inFoot } from './clearance.js';

const STEP = 0.35;
const FOOT = 1.0;          // the lowest metre of a house is its pedestal, sunk in the deck or the roof it stands on: not an obstruction

/** The box of the house of a mount in its own frame (x forward, z to starboard, y above the pivot). */
export function houseBox(model, rec, aa) {
  const mm = aa
    ? getMountModel({ kind: 'aa', cal: rec.cal, n: rec.n, bore: rec.bore, col: model.pal.sup, variant: rec.variant })
    : getMountModel({ kind: rec.kind, cal: rec.cal, n: rec.n, bore: rec.bore, col: model.pal.sup, variant: rec.variant, top: model.pal.top });
  const b = mm.house.aabb;
  return { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5] };
}

/** The plan rectangle a house covers in the ship's frame, turned as it stands at rest: { x0, x1, z0, z1 }. */
export function houseRect(model, rec, aa = false) {
  const hb = houseBox(model, rec, aa), yaw = aa ? (rec.arcC ?? rec.yaw0 ?? 0) : (rec.arcC || 0), c = Math.cos(yaw), s = Math.sin(yaw);
  const xs = [], zs = [];
  for (const px of [hb.x0, hb.x1]) for (const pz of [hb.z0, hb.z1]) { xs.push(rec.x + px * c - pz * s); zs.push(rec.z + px * s + pz * c); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

/** The structures that are obstacles: everything that is built, except thin stays and the ruins that replace a destroyed part. */
export const obstacles = (solids) => solids.filter((q) => !q.strut && !(q.part && (q.part.endsWith('_ruin') || q.part.endsWith('_fine'))));

/** How far (m) the point (x, z) is inside the footprint of the solid s: the shortest way out along x or z. */
function depthIn(s, x, z) {
  const cx = (s[0] + s[1]) / 2, cz = (s[4] + s[5]) / 2;
  if (s.round) return Math.max(0, 1 - Math.hypot((x - cx) / ((s[1] - s[0]) / 2 || 1), (z - cz) / ((s[5] - s[4]) / 2 || 1))) * Math.min(s[1] - s[0], s[5] - s[4]) / 2;
  if (s.poly) {
    let d = Infinity;
    for (let i = 0; i < s.poly.length; i++) {
      const a = s.poly[i], b = s.poly[(i + 1) % s.poly.length], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      d = Math.min(d, Math.abs(ex * (z - a[1]) - ez * (x - a[0])) / l);
    }
    return d;
  }
  return Math.min(x - s[0], s[1] - x, z - s[4], s[5] - z);
}

/**
 * What a house is sunk in. rec at (x, z) (overrides rec.x / rec.z to try another spot). Returns { share (0..1 of the sampled volume), depth (m, the deepest sample), by (the structure hit most) }.
 * `carrier`: the hull above a flight deck is not tested (the model has no solid under it).
 */
export function buriedIn(model, rec, aa, solids, hull, o = {}) {
  const hb = o.box || houseBox(model, rec, aa), x = o.x ?? rec.x, z = o.z ?? rec.z;
  const yaw = aa ? (rec.arcC ?? rec.yaw0 ?? 0) : (rec.arcC || 0), cy = Math.cos(yaw), sy = Math.sin(yaw);
  let n = 0, inside = 0, depth = 0;
  const hit = new Map();
  for (let px = hb.x0 + STEP / 2; px < hb.x1; px += STEP) for (let pz = hb.z0 + STEP / 2; pz < hb.z1; pz += STEP) for (let py = hb.y0 + FOOT; py < hb.y1 - 0.05; py += STEP) {
    n++;
    const lx = x + px * cy - pz * sy, lz = z + px * sy + pz * cy, ly = rec.y + py;
    let buried = false;
    for (const s of solids) {
      if (ly < s[2] || ly > s[3] || !inFoot(s, lx, lz)) continue;
      // what the house stands on (a barbette, a roof, a sponson) is not an obstacle: a solid whose top is within a metre of the foot of the house
      if (s[3] < rec.y + hb.y0 + FOOT + 0.3) continue;
      // its own barbette or tub: a round solid centred on the mount
      if (s.round && Math.hypot((s[0] + s[1]) / 2 - x, (s[4] + s[5]) / 2 - z) < 0.8) continue;
      buried = true; depth = Math.max(depth, depthIn(s, lx, lz));
      const k = s.part || 'structure'; hit.set(k, (hit.get(k) || 0) + 1);
      break;
    }
    if (!buried && !o.carrier && Math.abs(lz) <= hull.halfBeamDeck(lx) && ly < hull.deckY(lx) - 0.6 && ly > -50) { buried = true; hit.set('hull', (hit.get('hull') || 0) + 1); }
    if (buried) inside++;
  }
  const worst = [...hit.entries()].sort((a, b) => b[1] - a[1])[0];
  return { share: n ? inside / n : 0, depth, by: worst ? worst[0] : '' };
}

/**
 * Slide every gun mount that is sunk in a structure by 0.15 m steps (outboard first, then fore and aft; 0.7 m at most for a turret, so that it stays on its barbette, 1.6 m for a lighter mount) to the nearest spot
 * where it is not, as long as something is still under it. Returns the number of mounts moved.
 */
export function clearHouses(model, solids, hull, supportBelow, o = {}) {
  const obs = obstacles(solids);
  let moved = 0;
  for (const rec of model.mounts) {
    const box = houseBox(model, rec, false), cur = buriedIn(model, rec, false, obs, hull, { box, carrier: o.carrier });
    if (cur.depth < 0.3) continue;
    const out = rec.z < 0 ? -1 : 1;
    let best = null;
    const reach = rec.group === 'main' ? 0.7 : 1.6;       // a turret stays on its barbette, a lighter mount may move further
    for (let d = 0.15; d <= reach && !best; d += 0.15) {
      for (const [dx, dz] of [[0, out * d], [d, 0], [-d, 0], [0, -out * d]]) {
        const x = rec.x + dx, z = rec.z + dz;
        if (supportBelow(x, z, rec.y) < rec.y - 1.2) continue;
        if (Math.abs(z) > hull.halfBeamDeck(x) + 0.3 && Math.abs(rec.z) <= hull.halfBeamDeck(rec.x)) continue;
        const t = buriedIn(model, rec, false, obs, hull, { box, x, z, carrier: o.carrier });
        if (t.depth < 0.35 && t.share <= cur.share * 0.5) { best = { x, z }; break; }
      }
    }
    if (best) { rec.x = best.x; rec.z = best.z; rec.shifted = true; moved++; }
  }
  return moved;
}
