// Who sees whom, for the fog of a theatre of war: the questions the strategic layer asks (does this ship see that one, does this base, does this aircraft), answered by sim/sensors.js
// (the horizon of the masthead and of the target, the visibility of the day, the radar of each ship and base, the islands that hide).
import { canDetect } from './sensors.js';

/** Can ship `s` see ship `e` now (visually or on radar)? */
export const shipDetects = (world, s, e) => !!canDetect(world, s, e).by;
/** A base sees a ship from its tower and, when it has a radar standing, further. */
export function baseDetects(world, base, e) {
  const t = base.target;
  const radar = base.layout.parts.some((p, i) => p.kind === 'radar' && base.partState[i] < 2);
  // (a base with no radar has the eye of its tower only: the sensors module gives a radar to every base, so the ones whose radar is down are asked as plain watchers)
  const r = canDetect(world, t, e);
  return radar ? !!r.by : r.visual;
}
/** An aircraft in the air sees a ship from its height: 40 to 60 km on a clear day. */
export const planeDetects = (world, p, e) => canDetect(world, p, e).visual;
