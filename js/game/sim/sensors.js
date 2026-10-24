// Sensors: who can see whom. The horizon from the height of the eye and of the target, the visibility of the sea, the radars of each ship (data/gunnery.js) with their range on
// each class of ship and on aircraft, the sight lines blocked by islands, and what follows for the guns: how far a mount may be laid on a target (`gunRange`, `engageRange`).
// A spotting floatplane would lift the horizon for the guns (`ship.spotter`): no aircraft of that kind flies in the simulation yet, so the hook is only read here.
import { RADARS, SYSTEMS, fitOf } from '../data/gunnery.js';

/** Clear-day visibility of a battleship's silhouette (m); a world can set `world.visibility`. */
export const DEFAULT_VISIBILITY = 28000;
/** km per sqrt(m) of height: the radio horizon with the usual refraction (4/3 earth), and the optical one. */
const K_RADIO = 4.12, K_OPTICAL = 3.86;
/** How big the silhouette of each class looks, against a battleship (a destroyer is lost in the haze sooner). */
const SIZE = { BB: 1, CV: 1, CA: 0.92, CL: 0.88, DD: 0.78, BASE: 0.9 };
/** A plane's apparent size to the eye (fighter, medium, heavy) and its echo against a large aircraft (the radar range goes with the 4th root of it). */
const PLANE_EYE = [0.55, 0.7, 0.9], PLANE_ECHO = [0.2, 0.5, 1];

/** The horizon (m) between an eye at height h1 and something at height h2 (m): 4.12 (sqrt h1 + sqrt h2) km, i.e. the radio horizon; `k` 3.86 for the eye. */
export function horizonM(h1, h2, k = K_RADIO) {
  return k * 1000 * (Math.sqrt(Math.max(h1, 0)) + Math.sqrt(Math.max(h2, 0)));
}

const isPlane = (e) => !e.stats && e.spec !== undefined && e.phase !== undefined;
const sizeIndex = (p) => { const s = p.spec && p.spec.span; return s ? (s < 13.5 ? 0 : s < 24 ? 1 : 2) : p.kind === 'fighter' ? 0 : 1; };

/** Height (m) of the highest thing on the target: the masthead and the funnel are seen first. */
export function topHeight(e) {
  if (e.stats) return e.isBase ? (e.y || 0) + 12 : Math.max(e.model.topY, 3);
  if (isPlane(e)) return Math.max(e.y, 2);
  return 3;
}

/** Height (m) of the eye of a ship: the top of her main director, or about three quarters of her masthead. */
export function eyeHeight(e) {
  if (e._eye !== undefined) return e._eye;
  if (e.isBase) return (e.y || 0) + 20;                 // the control tower
  if (!e.stats) return isPlane(e) ? Math.max(e.y, 2) : 3;
  const m = e.model;
  let d = 0;
  for (const p of m.parts) if (p.kind === 'director' && p.bb[4] > d) d = p.bb[4];
  return (e._eye = Math.max(Math.min(Math.max(d, m.topY * 0.72), Math.max(m.topY, d)), 3));
}

const classOf = (e) => (e.isBase ? 'CL' : e.stats.type);

/** How far a silhouette is seen on a clear day: `world.visibility` for a battleship, less for a smaller ship, much less for an aircraft. */
export function visibilityM(world, target) {
  const v = (world && world.visibility) || DEFAULT_VISIBILITY;
  if (isPlane(target)) return v * PLANE_EYE[sizeIndex(target)];
  return v * (SIZE[classOf(target)] || 1);
}

// ---- radars ----------------------------------------------------------------------------------------------------------------------------------------------------
/** Height (m) of the radar antenna: the masthead of a ship, the mast of a base. */
const antennaH = (e) => (e.isBase ? (e.y || 0) + 25 : e.model.topY);
/** What a base's radar is (it has one when its layout has a radar installation that still stands). */
const BASE_RADARS = [{ id: 'sk', def: RADARS.sk }];

/** The radars a ship carries: { def, fc }, from her fit (data/gunnery.js): the search and air-warning sets and those of her fire-control systems. */
export function radarsOf(ship) {
  if (ship._radars) return ship._radars;
  const fit = fitOf(ship.spec), ids = new Set(fit.radars);
  for (const g of ['main', 'sec']) { const s = SYSTEMS[fit[g]]; if (s && s.radar) ids.add(s.radar); }
  ship._radars = [...ids].map((id) => ({ id, def: RADARS[id] })).filter((r) => r.def);
  return ship._radars;
}

/** Radar sets that still work: all of them, unless the ship has radar antennas in her model and every one is destroyed. */
export function radarsAlive(ship, world) {
  if (ship.isBase) { const b = ship.base; return b && b.partsTotal && b.partsTotal('radar') && b.partsAlive('radar') ? BASE_RADARS : []; }
  const t = world ? world.time : 0;
  if (ship._radAlive && ship._radT === t) return ship._radAlive;
  const rs = radarsOf(ship);
  let any = false, up = false;
  for (const m of ship.modules) if (m.kind === 'radar') { any = true; if (m.state !== 2) { up = true; break; } }
  ship._radT = t;
  return (ship._radAlive = !any || up ? rs : []);
}

/** The best radar of the ship for a target of this class at this distance, or null: the one with the smallest ranging error among those that reach. */
export function radarOn(ship, target, d, world) {
  const rs = radarsAlive(ship, world);
  if (!rs.length) return null;
  const cls = classOf(target), top = topHeight(target);
  const rh = horizonM(antennaH(ship), top, K_RADIO);
  if (d > rh) return null;
  let best = null;
  for (const r of rs) {
    const range = r.def.surf[cls] || 0;
    if (range >= d && (!best || r.def.err < best.def.err)) best = r;
  }
  return best;
}

/** The greatest distance at which one of the ship's radars picks up this target (0: none): its table cut by the radar horizon. */
export function radarReach(ship, target, world) {
  const rs = radarsAlive(ship, world);
  if (!rs.length) return 0;
  let range = 0;
  const plane = isPlane(target), cls = plane ? null : classOf(target), echo = plane ? Math.pow(PLANE_ECHO[sizeIndex(target)], 0.25) : 1;
  for (const r of rs) { const v = plane ? r.def.air * echo : r.def.surf[cls] || 0; if (v > range) range = v; }
  return Math.min(range, horizonM(antennaH(ship), topHeight(target), K_RADIO));
}

/** The distance up to which the eye of `obs` makes out `target` (haze and horizon; islands apart). */
export function visualReach(world, obs, target) {
  return Math.min(horizonM(eyeHeight(obs), topHeight(target), K_OPTICAL) , visibilityM(world, target) * (isPlane(obs) ? 1.7 : 1));
}

/**
 * Can `obs` (a ship, a base, an aircraft) detect `target` (a ship, a base, an aircraft)? { visual, radar, range, by }. Aircraft see ships at 40-60 km from a few thousand metres on a clear day,
 * ships see aircraft at 15-30 km; a ship's radar sees an aircraft up to its air range (a large aircraft; smaller ones less) but no further than the radar horizon (a torpedo bomber on the
 * waves is under it). An island between blocks both the eye and the radar.
 */
export function canDetect(world, obs, target) {
  const dx = target.x - obs.x, dz = target.z - obs.z, dy = (isPlane(target) ? target.y : 0) - (isPlane(obs) ? obs.y : 0);
  const d = Math.hypot(dx, dz);
  const out = { visual: false, radar: false, range: d, by: null };
  const T = world.terrain;
  const ho = eyeHeight(obs), ht = topHeight(target);
  const blocked = () => !!(T && T.blocks && T.blocks(obs.x, ho, obs.z, target.x, isPlane(target) ? target.y : ht * 0.5, target.z));
  const near = Math.hypot(d, dy);
  if (near <= visualReach(world, obs, target)) out.visual = !blocked();
  if (obs.stats) {
    const reach = radarReach(obs, target, world);
    out.radar = reach > 0 && near <= reach && (out.visual || !blocked());
  }
  out.by = out.visual ? 'visual' : out.radar ? 'radar' : null;
  return out;
}

// ---- guns ------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * How far from `ship` a gun can be laid on `target` (m), whatever the gun's own reach: the eye as far as the horizon and the haze allow, a radar as far as it picks the target up,
 * a spotting aircraft (`ship.spotter`) as far as it flies. A point aimed at by hand (`target.pseudo`) has no limit.
 */
export function engageRange(ship, target) {
  if (target.pseudo) return 1e9;
  if (ship.spotter) return 1e9;
  const w = ship.world;
  return Math.max(visualReach(w, ship, target), radarReach(ship, target, w));
}

/** The range (m) at which a mount (or a gun entry of `stats`) may be laid on this target: its own reach (the guns are kept to 97 % of it) cut by what the fire control can range. */
export function gunRange(ship, mount, target) {
  const g = mount.gun || mount;
  return Math.min(g.maxRange * 0.97, engageRange(ship, target));
}

/** The greatest distance the ship can ever be laid on a target (the best radar, or the clear-day visibility): a scale for the choice of targets. */
export function maxReach(ship) {
  const w = ship.world;
  if (ship.spotter) return 1e9;
  let m = (w && w.visibility) || DEFAULT_VISIBILITY;
  for (const r of radarsAlive(ship, w)) for (const k in r.def.surf) if (r.def.surf[k] > m) m = r.def.surf[k];
  return m;
}
