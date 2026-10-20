// How sound travels over the sea: absorption of the air (ISO 9613-1), which is what makes a far gun a dull thud, the delay, the
// reflection off the water and the shadow of an island. Pure functions, no audio nodes.
import { C_SOUND } from './common.js';

/**
 * Pure-tone absorption of the atmosphere in dB per metre (ISO 9613-1:1993) at frequency f (Hz), temperature T (deg C), relative
 * humidity RH (%) and pressure pa (kPa): the sum of the classical losses and of the relaxation of oxygen and nitrogen, which
 * water vapour speeds up. At 20 deg C and 70 % the octave bands 125 Hz ... 8 kHz lose 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117 dB/km.
 */
export function airAbsorption(f, T = 20, RH = 70, pa = 101.325) {
  const Tk = T + 273.15, T0 = 293.15, T01 = 273.16, pr = 101.325;
  const psat = pr * Math.pow(10, -6.8346 * Math.pow(T01 / Tk, 1.261) + 4.6151);
  const h = RH * (psat / pa);                                              // molar concentration of water vapour, %
  const frO = (pa / pr) * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));        // relaxation frequency of oxygen
  const frN = (pa / pr) * Math.pow(Tk / T0, -0.5) * (9 + 280 * h * Math.exp(-4.170 * (Math.pow(Tk / T0, -1 / 3) - 1)));
  const f2 = f * f;
  return 8.686 * f2 * (1.84e-11 * (pr / pa) * Math.sqrt(Tk / T0)
    + Math.pow(Tk / T0, -2.5) * (0.01275 * Math.exp(-2239.1 / Tk) / (frO + f2 / frO) + 0.1068 * Math.exp(-3352 / Tk) / (frN + f2 / frN)));
}

// the sea air: mild and humid. `CLARITY` < 1 eases the absorption for the game: at a kilometre the real air has already taken
// everything above 2 kHz out of a gun, which is true and also leaves the battle dull to hear.
const AIR = { T: 18, RH: 80 }, CLARITY = 0.3, FLOOR = 500;
const cache = new Map();

/**
 * Frequency (Hz) at which a sound that travelled `d` metres is 3 dB down: the corner of the low-pass that stands for the air. The
 * absorption in dB grows with f squared, so a second-order low-pass at this corner is a close fit up to about three times it.
 */
export function airCutoff(d) {
  const key = Math.round(d / 25);
  let fc = cache.get(key);
  if (fc === undefined) {
    const dist = Math.max(25, key * 25);
    let lo = 100, hi = 22000;
    for (let i = 0; i < 24; i++) { const mid = Math.sqrt(lo * hi); if (airAbsorption(mid, AIR.T, AIR.RH) * dist * CLARITY > 3) hi = mid; else lo = mid; }
    fc = Math.max(FLOOR, Math.min(20000, Math.sqrt(lo * hi)));
    cache.set(key, fc);
  }
  return fc;
}

/**
 * The reflection off the sea: a second path from the source to the listener bounces off the water and arrives later by about
 * 2 hs hl / (d c) seconds (hs, hl: heights of source and listener); added to the direct sound it leaves the comb of dips a gun
 * heard over water has. Returns the extra delay in seconds, kept within what a delay line can carry.
 */
export function seaEchoDelay(d, hs, hl) {
  const dd = Math.max(40, d), a = Math.max(2, hs), b = Math.max(2, hl);
  const path = Math.sqrt(dd * dd + (a + b) * (a + b)) - Math.sqrt(dd * dd + (a - b) * (a - b));
  return Math.max(0.0003, Math.min(0.02, path / C_SOUND));
}

/**
 * The shadow of the ground: is there an island between the listener and the source? Sound bends round and over it, so the highs
 * and a part of the level are lost. `terrain` is the sim's Terrain (or null).
 */
export function shadowed(terrain, cam, x, y, z) {
  return !!(terrain && !terrain.empty && terrain.blocks(cam.x, Math.max(cam.y, 2), cam.z, x, Math.max(y, 2), z));
}

/** How much the listener is among cliffs and hulls rather than on open water, 0 .. 1 (it drives the reverb). */
export function enclosure(terrain, ships, cam) {
  let k = 0;
  if (terrain && !terrain.empty) for (const is of terrain.islands) k = Math.max(k, 1 - (Math.hypot(is.x - cam.x, is.z - cam.z) - is.R) / 2200);
  // a big hull close by returns the sound of its own side
  if (ships) for (const s of ships) { if (s.state === 'sunk') continue; const d = Math.hypot(s.x - cam.x, s.z - cam.z); if (d < 220 && s.stats && s.stats.L > 150) k = Math.max(k, 0.4 * (1 - d / 220)); }
  return Math.max(0, Math.min(1, k));
}
