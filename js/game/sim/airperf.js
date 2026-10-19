// How fast each aircraft flies. Speeds in m/s (airspeed), from the published performance of each type (CHANGELOG 0.1.2 has the table and the sources):
//   vmax    top speed (at the altitudes of the strike)         vc     strike cruise (the transit to the target)
//   vt      torpedo release speed (dive bombers: speed of the push-over)                vd     steady speed in the dive
//   vcl     climb speed (assembly after the take-off)           vp     downwind and turning speed in the landing circuit
//   va      approach speed over the ramp (hook down)            vto    airspeed at which the aircraft leaves the deck
//   vcomb   combat speed of a fighter                           bank   the steepest bank flown with a load         pr  how fast the nose moves (rad/s)
//   asm     height over the deck at which the strike assembles (m)
// The cruise and approach figures are estimates where the sources give only a maximum (about 1.2 times the stall speed for the approach).
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
};
export const perfOf = (p) => PERF[p.typeKey] || PERF.sbd;
