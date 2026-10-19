// Loudness calibration. Every builder used to peak-normalise its sound, so a bomb whistle (a pure mid-range tone: 9 dB louder to the
// ear than a gun report of the same peak) and a 20 mm burst started out as loud as a battleship salvo, and the event gains had to
// undo it. The library now scales each sound to the perceived level below (dB re full scale: A-weighted RMS of the audible part plus a
// tenth of the raw power, see core.js levelDb), then the event gains (events.js, loops.js) only say how a particular use differs.
// The numbers keep the order of real sources, compressed: about 4 to 5 dB per step of calibre from a battleship salvo and a magazine
// explosion (the top, close to full scale: the gun and explosion builders were already at their ceiling) down to a machine gun and the
// patter of a small splash. Print the table with `node tools/audiolab.mjs`.
export const TARGET_DBA = {
  // guns
  gun_big: -22, gun_med: -27, gun_small: -29, aa_burst: (cal) => (cal >= 37 ? -30 : cal >= 25 ? -32 : -34), flak_burst: -29, mg_burst: -33,
  shell_rush: -26, shell_crack: -24, bomb_whistle: -30,
  // water and steel
  splash_small: -37, splash_big: -29, impact_he: -29, impact_pen: -26, ricochet: -36, impact_through: -35, crash_metal: -30, zap: -37,
  bulkhead: -30, collision: -27, hull_groan: -29,
  // blasts
  torpedo_hit: -22, torpedo_launch: -34, explosion_big: -22, explosion_med: -27, explosion_small: -33, boiler_burst: -31,
  // machinery and aircraft
  ship_engine: -26, turbine: -30, cavitation: -33, turret_motor: -31, breech: -29, lift_motor: -33,
  engine_radial: -27, engine_inline: -27, siren: -28, engine_start: -32, plane_fall: -30, touchdown: -33, arrest: -33,
  // ambience
  wind: -24, bow_wave: -28, fire: -30, gurgle: -30, swell: -32,
};
