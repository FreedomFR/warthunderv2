// How fast each aircraft flies. Speeds in m/s (airspeed), from the published performance of each type (CHANGELOG 0.1.2 has the table and the sources):
//   vmax    top speed (at the altitudes of the strike)         vc     strike cruise (the transit to the target)
//   vt      torpedo release speed (dive bombers: speed of the push-over)                vd     steady speed in the dive
//   vcl     climb speed (assembly after the take-off)           vp     downwind and turning speed in the landing circuit
//   va      approach speed over the ramp (hook down)            vto    airspeed at which the aircraft leaves the deck
//   vcomb   combat speed of a fighter                           bank   the steepest bank flown with a load         pr  how fast the nose moves (rad/s)
//   asm     height over the deck at which the strike assembles (m)
// The cruise and approach figures are estimates where the sources give only a maximum (about 1.2 times the stall speed for the approach).
// The land-based bombers (role 'level', flown from airfield runways, not from a deck) have the same fields, with these meanings, plus the ones of the level bombing run:
//   vto     lift-off speed at the end of the take-off roll        va     speed over the runway threshold (flaps down: about 1.3 times the stall speed)
//   vcl     climb speed (assembly)                                vc     cruise to the target                  vp    speed in the circuit
//   vt, vd, vcomb  0 (they neither torpedo, nor dive, nor fight)
//   bombAlt   the height of the bombing run (m above the sea)     bombSpeed   true airspeed of the run (m/s)       vs   stall speed, landing configuration (m/s)
//   climb     best rate of climb at the weight of a bomber on its way to the target (m/s)                           ceil   service ceiling (m)
//   runLen    take-off ground run at the usual loaded weight (m, sea level, no wind); the airfields' runways are 800-1200 m
//   landRun   landing ground run without braking aids (m)          bank    the steepest bank flown; pr: pitch rate (rad/s); asm: height of the assembly (m)
// The take-off acceleration the simulation should use is vto^2 / (2 runLen). Sources: the published figures of each type (CHANGELOG, "Unreleased -- land-based bombers");
// the stall, approach and climb speeds and the ground runs are rounded from pilots' notes and are estimates where the sources give only a top speed.
export const PERF = {
  sbd: { vmax: 112, vc: 78, vt: 100, vd: 112, vcl: 49, vp: 46, va: 37.5, vto: 36, vcomb: 0, bank: 55, pr: 0.34, asm: 300 },
  tbf: { vmax: 124, vc: 78, vt: 57, vd: 100, vcl: 50, vp: 47, va: 41, vto: 37, vcomb: 0, bank: 50, pr: 0.28, asm: 280 },
  f6f: { vmax: 170, vc: 90, vt: 0, vd: 0, vcl: 60, vp: 52, va: 38.6, vto: 36, vcomb: 125, bank: 70, pr: 0.7, asm: 350 },
  d3a: { vmax: 108, vc: 82, vt: 90, vd: 103, vcl: 47, vp: 43, va: 36, vto: 31, vcomb: 0, bank: 60, pr: 0.38, asm: 300 },
  b5n: { vmax: 105, vc: 72, vt: 90, vd: 92, vcl: 46, vp: 42, va: 35, vto: 31, vcomb: 0, bank: 52, pr: 0.32, asm: 280 },
  a6m: { vmax: 148, vc: 92, vt: 0, vd: 0, vcl: 56, vp: 50, va: 37, vto: 31, vcomb: 110, bank: 75, pr: 0.8, asm: 350 },
  skua: { vmax: 100, vc: 84, vt: 95, vd: 118, vcl: 46, vp: 45, va: 36, vto: 33, vcomb: 0, bank: 50, pr: 0.3, asm: 300 },
  swordfish: { vmax: 64, vc: 46, vt: 48, vd: 70, vcl: 33, vp: 36, va: 29, vto: 26, vcomb: 0, bank: 45, pr: 0.25, asm: 250 },
  fulmar: { vmax: 122, vc: 105, vt: 0, vd: 0, vcl: 50, vp: 52, va: 37.5, vto: 32, vcomb: 105, bank: 60, pr: 0.55, asm: 330 },
  ju87: { vmax: 104, vc: 80, vt: 95, vd: 140, vcl: 50, vp: 48, va: 36, vto: 37, vcomb: 0, bank: 55, pr: 0.34, asm: 300 },
  fi167: { vmax: 90, vc: 69, vt: 45, vd: 80, vcl: 40, vp: 38, va: 28, vto: 26, vcomb: 0, bank: 55, pr: 0.32, asm: 260 },
  bf109t: { vmax: 156, vc: 110, vt: 0, vd: 0, vcl: 62, vp: 56, va: 41.5, vto: 38, vcomb: 125, bank: 70, pr: 0.7, asm: 350 },
  ln401: { vmax: 105, vc: 83, vt: 95, vd: 125, vcl: 48, vp: 44, va: 35, vto: 33, vcomb: 0, bank: 55, pr: 0.34, asm: 300 },
  pl10: { vmax: 61, vc: 42, vt: 38, vd: 64, vcl: 33, vp: 34, va: 28, vto: 27, vcomb: 0, bank: 45, pr: 0.25, asm: 250 },
  d520: { vmax: 152, vc: 105, vt: 0, vd: 0, vcl: 62, vp: 55, va: 41.5, vto: 39, vcomb: 125, bank: 70, pr: 0.7, asm: 350 },
  re2001: { vmax: 150, vc: 115, vt: 100, vd: 125, vcl: 56, vp: 52, va: 41.5, vto: 41, vcomb: 0, bank: 65, pr: 0.5, asm: 320 },
  re2001t: { vmax: 125, vc: 105, vt: 75, vd: 100, vcl: 55, vp: 52, va: 43, vto: 43, vcomb: 0, bank: 60, pr: 0.45, asm: 320 },
  mc202: { vmax: 167, vc: 117, vt: 0, vd: 0, vcl: 66, vp: 57, va: 40, vto: 39, vcomb: 140, bank: 72, pr: 0.7, asm: 350 },
  // ---- land-based bombers ----
  // B-17G: 472 km/h at 7 600 m, cruise 293 km/h, ceiling 10 850 m, 4.6 m/s climb (Wikipedia / the pilot's manual); stall 36 m/s with the flaps down; run about 900 m at 24.5 t
  b17: { vmax: 131, vc: 81, vt: 0, vd: 0, vcl: 65, vp: 56, va: 47, vto: 46, vcomb: 0, bank: 35, pr: 0.1, asm: 700, bombAlt: 3500, bombSpeed: 75, vs: 36, climb: 4.6, ceil: 10850, runLen: 900, landRun: 700 },
  // G4M1: 428 km/h at 4 200 m, cruise 315 km/h, stall 120 km/h, 9.17 m/s climb with a light load (about 5.5 m/s loaded), ceiling 8 950 m; a light and short-running aircraft
  g4m: { vmax: 119, vc: 87, vt: 0, vd: 0, vcl: 58, vp: 54, va: 42, vto: 40, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 4000, bombSpeed: 80, vs: 33, climb: 5.5, ceil: 8950, runLen: 650, landRun: 500 },
  // Lancaster B.I: 454 km/h at 4 000 m (282 mph), cruise 322 km/h (200 mph), ceiling 6 520 m (21 400 ft at 28.6 t), 3.7 m/s climb (720 ft/min); needs a long run at 31 t
  lancaster: { vmax: 126, vc: 89, vt: 0, vd: 0, vcl: 65, vp: 58, va: 49, vto: 46, vcomb: 0, bank: 35, pr: 0.1, asm: 800, bombAlt: 4500, bombSpeed: 78, vs: 38, climb: 3.7, ceil: 6520, runLen: 1000, landRun: 700 },
  // He 111 H-6: 440 km/h, cruise about 360 km/h, ceiling 6 500 m, climb about 3.5 m/s at 12 t; stall 125 km/h
  he111: { vmax: 122, vc: 100, vt: 0, vd: 0, vcl: 63, vp: 56, va: 45, vto: 42, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 3500, bombSpeed: 85, vs: 35, climb: 3.5, ceil: 6500, runLen: 750, landRun: 600 },
  // SM.79-II: about 435 km/h at 4 000 m, cruise 340 km/h, ceiling 6 500 m, climb about 4.3 m/s (4 000 m in 15 min), short run
  sm79: { vmax: 121, vc: 94, vt: 0, vd: 0, vcl: 58, vp: 52, va: 41, vto: 38, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 3500, bombSpeed: 82, vs: 32, climb: 4.3, ceil: 6500, runLen: 500, landRun: 450 },
  // LeO 451: 495 km/h at 4 000 m, cruise about 400 km/h, ceiling 9 000 m, climb about 7 m/s (4 000 m in 9 min), stall 130 km/h
  leo451: { vmax: 137, vc: 111, vt: 0, vd: 0, vcl: 70, vp: 62, va: 47, vto: 44, vcomb: 0, bank: 45, pr: 0.16, asm: 700, bombAlt: 4000, bombSpeed: 100, vs: 36, climb: 7.0, ceil: 9000, runLen: 700, landRun: 600 },
};
export const perfOf = (p) => PERF[p.typeKey] || PERF.sbd;
