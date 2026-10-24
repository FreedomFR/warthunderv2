// The pilot and the mountains: before the aircraft is flown, the ground ahead is looked at (about forty seconds of flight along the heading it wants), and what is needed to clear it is
// worked out: a climb that the aircraft can hold (its rate of climb over its speed), or, when the slope is too steep for it, a turn to the nearest heading from which the ground can be
// cleared. The old rule climbed over what lay within two kilometres at the most, whatever the aircraft: a torpedo bomber that climbs at 7 m/s does not clear a 400 m ridge seen
// from 2 km.
import { clamp } from '../math.js';

const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.4, -1.4, 2.0, -2.0];      // the headings tried, in radians off the wanted one, the nearest first
const CLEAR = 70;                                                                // m over the ground that the pilot wants

/** The climb gradient that clears the ground along heading h from (x, y, z) up to `look` metres ahead (negative: nothing in the way). */
function need(T, x, y, z, h, look) {
  const sx = Math.sin(h), sz = -Math.cos(h);
  let req = -1;
  for (let d = 200; d <= look; d += 250) {
    const g = T.heightAt(x + sx * d, z + sz * d);
    if (g < 4) continue;
    const r = (g + CLEAR - y) / d;
    if (r > req) req = r;
  }
  return req;
}

/**
 * The heading and the climb of the aircraft p, corrected for the ground ahead: { hdg, gam }. The look is repeated every 0.4 s (the result is kept in between), and costs nothing over the sea.
 * pf: the performance of the type (roc: m/s of climb).
 */
export function avoidTerrain(world, p, hdg, gam, pf) {
  const T = world.terrain;
  if (!T || p.y > 2200) return { hdg, gam };
  let av = p._av;
  if (!av || world.time - av.t > 0.4 || Math.abs(av.hdg - hdg) > 0.5) {
    const v = Math.max(p.speed || 0, 40), look = clamp(v * 40, 1800, 5200);
    const gmax = Math.min(0.3, (pf.roc || 6) / v) * 0.85;
    let pick = null, least = null;
    for (const off of OFFS) {
      const r = need(T, p.x, p.y, p.z, hdg + off, look);
      if (!least || r < least.r) least = { off, r };
      if (r <= (off === 0 ? gmax * 0.9 : gmax * 0.6)) { pick = { off, r }; break; }
    }
    if (!pick) pick = least;
    av = p._av = { t: world.time, hdg, off: pick.off, gam: clamp(pick.r, 0, gmax), r: pick.r };
  }
  return { hdg: hdg + av.off, gam: av.r > 0 ? Math.max(gam, av.gam) : gam };
}

/**
 * The heading for an aircraft that is coming down on the water (its fuel gone, nowhere to land): the one nearest its own along which the sea stays open for as far as it will glide,
 * so that it does not come down on an island. Repeated every 0.4 s.
 */
export function ditchHeading(world, p) {
  const T = world.terrain;
  if (!T) return p.heading;
  const d = p._dh;
  if (d && world.time - d.t < 0.4) return d.hdg;
  const reach = clamp(Math.max(p.y, 20) / 0.09, 400, 4200) + 250;
  let best = null;
  for (const off of OFFS) {
    const h = p.heading + off, sx = Math.sin(h), sz = -Math.cos(h);
    let clear = reach;
    for (let k = 150; k <= reach; k += 150) if (T.heightAt(p.x + sx * k, p.z + sz * k) > -1) { clear = k; break; }
    if (clear >= reach) { best = { hdg: h, clear }; break; }
    if (!best || clear > best.clear) best = { hdg: h, clear };
  }
  p._dh = { t: world.time, hdg: best.hdg };
  return best.hdg;
}
