// What can be built before the player has done anything, while the first screen plays: the meshes of every ship class (5 s of work in all, one
// model after another with a pause between so that the page keeps moving) and of every aircraft type. They are cached, so the first battle,
// whatever the fleets, finds them ready; the sounds are prepared by the audio engine (audio.js, `early`).
import { ALL_SHIPS } from './data/ships.js';
import { getModel } from './model/cache.js';
import { getPlaneModel, PLANES } from './model/planes.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Builds the models; `onProgress(done, total, name)` after each one. `ships` / `planes` can be narrowed (tests). */
export async function preloadModels(onProgress, ships = ALL_SHIPS, planes = Object.keys(PLANES)) {
  const total = ships.length + planes.length;
  let done = 0;
  for (const s of ships) { getModel(s); onProgress?.(++done, total, s.refShip || s.className || s.id); await tick(); }
  for (const k of planes) { getPlaneModel(k); onProgress?.(++done, total, PLANES[k].name); await tick(); }
  return done;
}
