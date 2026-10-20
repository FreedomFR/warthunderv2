// Foam stamps of the ships (bow wave, wake).
import { clamp } from '../../math.js';

/**
 * Foam stamps of a moving ship: the bow wave (a splash at the stem and two white wings flaring along the hull), the foam line along the waterline,
 * the churned white water behind the screws, the long wake that fades into the sea, and the diverging arms of the Kelvin pattern. s needs x, z,
 * heading, speed, state and stats.{L,B,maxSpeed}. The strength follows the speed: a ship that creeps hardly marks the water, one at full speed
 * leaves a white road several lengths long. (The foam of the sea is only kept for 512 m round the camera, see the clipmaps of the engine.)
 */
export function addWakeStamps(foam, s, d, forceSpeed) {
  const st = s.stats;
  const fx = Math.sin(s.heading), fz = -Math.cos(s.heading);
  const speedF = forceSpeed ?? Math.min(1, Math.abs(s.speed) / Math.max(1, st.maxSpeed));
  const L = st.L, B = st.B;
  const sinking = s.state === 'sinking';
  const sf = sinking ? 0.5 : speedF;
  if (!(sf > 0.04 || sinking)) return;
  const k = clamp(0.12 + 1.05 * Math.pow(sf, 1.15), 0, 1);       // strength of the foam
  const rx = -fz, rz = fx;
  // a point at `back` metres astern of the centre and `side` metres to starboard
  const at = (back, side) => [s.x - fx * back + rx * side, s.z - fz * back + rz * side];
  const seg = (b0, s0, b1, s1, r, wake, fresh, dense) => {
    const p0 = at(b0, s0), p1 = at(b1, s1);
    foam.add(p0[0], p0[1], p1[0], p1[1], r, wake * k, fresh * k, dense * k);
  };
  const bow = -L * 0.47, stern = L * 0.46;
  // the stem: a splash of fresh white water
  seg(bow, 0, bow + L * 0.06, 0, B * 0.42, 0.5, 1.0, 0.9);
  for (const sg of [-1, 1]) {
    // the bow wave: a bank of foam that spreads from the stem along the hull and leaves it a quarter of the way aft
    seg(bow + L * 0.02, sg * B * 0.32, bow + L * 0.26, sg * B * 0.58, Math.max(1.6, B * 0.15), 0.7, 0.8, 0.7);
    // the thin line of foam along the waterline
    seg(bow + L * 0.2, sg * B * 0.5, stern - L * 0.02, sg * B * 0.5, Math.max(1.6, B * 0.12), 0.55, 0.45, 0.4);
  }
  // the churn behind the screws (white), the wake that breaks up as it goes, and the wide pale bed that stays on the sea
  seg(stern - L * 0.04, 0, stern + L * 0.3, 0, B * 0.5, 1.0, 1.0, 0.8);
  seg(stern + L * 0.28, 0, stern + L * 1.4, 0, B * 0.45, 0.8, 0.2, 0.25);
  seg(stern + L * 1.2, 0, stern + L * 3.4, 0, B * 0.7, 0.5, 0, 0);
}
