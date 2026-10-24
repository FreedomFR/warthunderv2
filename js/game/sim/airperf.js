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
// For the flight physics (aeroOf below):
//   roc     best rate of climb with the load of the strike (m/s; the heavy bombers: `climb`)    roll   rate of roll (rad/s, at the speeds of combat)
//   nmax    the load factor the pilot pulls at most (g: about two thirds of the design limit; a heavy bomber 2.5)    brakes   dive brakes (SBD, D3A, Skua, Ju 87)
// Rates of climb and of roll from the pilots' notes and the flight tests of each type (NACA, RAE, TAIC), rounded, for the loaded aircraft.
// The take-off acceleration the simulation should use is vto^2 / (2 runLen). Sources: the published figures of each type (CHANGELOG, "Unreleased -- land-based bombers");
// the stall, approach and climb speeds and the ground runs are rounded from pilots' notes and are estimates where the sources give only a top speed.
export const PERF = {
  sbd: { vmax: 112, vc: 78, vt: 100, vd: 112, vcl: 49, vp: 46, va: 37.5, vto: 36, vcomb: 0, bank: 55, pr: 0.34, asm: 300, roc: 7.5, roll: 1.0, nmax: 5.5, brakes: true },
  tbf: { vmax: 121, vc: 78, vt: 57, vd: 100, vcl: 50, vp: 47, va: 41, vto: 37, vcomb: 0, bank: 50, pr: 0.28, asm: 280, roc: 7.2, roll: 0.8, nmax: 4.5, brakes: false },
  f6f: { vmax: 170, vc: 90, vt: 0, vd: 0, vcl: 60, vp: 52, va: 38.6, vto: 36, vcomb: 125, bank: 82, pr: 0.7, asm: 350, roc: 15.5, roll: 1.4, nmax: 6.5, brakes: false },
  // P-40E: 354 mph (570 km/h) at 4 600 m, 2 100 ft/min (11 m/s) at sea level with the load of a sortie, the roll of a heavy-aileron fighter, about 6.5 g at the most
  p40: { vmax: 155, vc: 100, vt: 0, vd: 0, vcl: 64, vp: 54, va: 40, vto: 37, vcomb: 125, bank: 82, pr: 0.65, asm: 350, roc: 11, roll: 1.2, nmax: 6.5, brakes: false },
  d3a: { vmax: 108, vc: 82, vt: 90, vd: 103, vcl: 47, vp: 43, va: 36, vto: 31, vcomb: 0, bank: 60, pr: 0.38, asm: 300, roc: 7, roll: 0.9, nmax: 5.5, brakes: true },
  b5n: { vmax: 105, vc: 72, vt: 90, vd: 92, vcl: 46, vp: 42, va: 35, vto: 31, vcomb: 0, bank: 52, pr: 0.32, asm: 280, roc: 5.2, roll: 0.8, nmax: 4.5, brakes: false },
  a6m: { vmax: 148, vc: 92, vt: 0, vd: 0, vcl: 56, vp: 50, va: 37, vto: 31, vcomb: 110, bank: 82, pr: 0.8, asm: 350, roc: 15, roll: 1.3, nmax: 6.5, brakes: false },
  il2: { vmax: 115, vc: 88, vt: 0, vd: 105, vcl: 46, vp: 52, va: 38, vto: 34, vcomb: 0, bank: 55, pr: 0.3, asm: 250, roc: 4.8, roll: 0.9, nmax: 4.5, brakes: false },      // Type 3 (AM-38F, 6 300 kg): 414 km/h at sea level, 1 000 m in 3.2 min
  skua: { vmax: 100, vc: 84, vt: 95, vd: 118, vcl: 46, vp: 45, va: 36, vto: 33, vcomb: 0, bank: 50, pr: 0.3, asm: 300, roc: 6.5, roll: 0.8, nmax: 5.5, brakes: true },
  swordfish: { vmax: 64, vc: 46, vt: 48, vd: 70, vcl: 33, vp: 36, va: 29, vto: 26, vcomb: 0, bank: 45, pr: 0.25, asm: 250, roc: 4.5, roll: 0.7, nmax: 4.5, brakes: false },
  fulmar: { vmax: 122, vc: 105, vt: 0, vd: 0, vcl: 50, vp: 52, va: 37.5, vto: 32, vcomb: 105, bank: 82, pr: 0.55, asm: 330, roc: 6, roll: 1.0, nmax: 6, brakes: false },
  ju87: { vmax: 104, vc: 80, vt: 95, vd: 140, vcl: 50, vp: 48, va: 36, vto: 37, vcomb: 0, bank: 55, pr: 0.34, asm: 300, roc: 5.5, roll: 0.8, nmax: 6, brakes: true },
  fi167: { vmax: 90, vc: 69, vt: 45, vd: 80, vcl: 40, vp: 38, va: 28, vto: 26, vcomb: 0, bank: 55, pr: 0.32, asm: 260, roc: 6, roll: 0.8, nmax: 4.5, brakes: false },
  bf109t: { vmax: 165, vc: 110, vt: 0, vd: 0, vcl: 62, vp: 56, va: 41.5, vto: 38, vcomb: 125, bank: 82, pr: 0.7, asm: 350, roc: 18, roll: 1.5, nmax: 6.5, brakes: false },      // F-4: 635 km/h at 6 000 m (about 595 km/h at the 2-3 km of the game), 19 m/s at sea level and 18.8 m/s at 3 000 m
  ln401: { vmax: 105, vc: 83, vt: 95, vd: 125, vcl: 48, vp: 44, va: 35, vto: 33, vcomb: 0, bank: 55, pr: 0.34, asm: 300, roc: 7, roll: 0.9, nmax: 5.5, brakes: false },
  pl10: { vmax: 61, vc: 42, vt: 38, vd: 64, vcl: 33, vp: 34, va: 28, vto: 27, vcomb: 0, bank: 45, pr: 0.25, asm: 250, roc: 3.5, roll: 0.6, nmax: 4, brakes: false },
  d520: { vmax: 152, vc: 105, vt: 0, vd: 0, vcl: 62, vp: 55, va: 41.5, vto: 39, vcomb: 125, bank: 82, pr: 0.7, asm: 350, roc: 12, roll: 1.4, nmax: 6.5, brakes: false },
  re2001: { vmax: 150, vc: 115, vt: 100, vd: 125, vcl: 56, vp: 52, va: 41.5, vto: 41, vcomb: 0, bank: 65, pr: 0.5, asm: 320, roc: 13, roll: 1.3, nmax: 6.5, brakes: false },
  re2001t: { vmax: 125, vc: 105, vt: 75, vd: 100, vcl: 55, vp: 52, va: 43, vto: 43, vcomb: 0, bank: 60, pr: 0.45, asm: 320, roc: 9, roll: 1.0, nmax: 5, brakes: false },
  mc202: { vmax: 167, vc: 117, vt: 0, vd: 0, vcl: 66, vp: 57, va: 40, vto: 39, vcomb: 140, bank: 82, pr: 0.7, asm: 350, roc: 17, roll: 1.5, nmax: 6.5, brakes: false },
  // ---- land-based bombers ----
  // B-17G: 472 km/h at 7 600 m, cruise 293 km/h, ceiling 10 850 m, 4.6 m/s climb (Wikipedia / the pilot's manual); stall 36 m/s with the flaps down; run about 900 m at 24.5 t
  b17: { vmax: 131, vc: 81, vt: 0, vd: 0, vcl: 65, vp: 56, va: 47, vto: 46, vcomb: 0, bank: 35, pr: 0.1, asm: 700, bombAlt: 3500, bombSpeed: 75, vs: 36, climb: 4.6, ceil: 10850, runLen: 900, landRun: 700, roc: 4.6, roll: 0.35, nmax: 2.5, brakes: false },
  // B-29: 575 km/h (357 mph) at 9 100 m with the turbochargers (about 540 km/h, 150 m/s, at the 3 000-5 000 m of the game), cruise 354 km/h (220 mph), ceiling 9 700 m, about 5.5 m/s (1 000 ft/min) climb at the weight of a sortie; stall 52 m/s with the flaps down at 45 t; a ground run of
  // about 1 100 m at the weight the airfields' runways allow (the real one, at 61 t, is twice that), landing at 60 m/s
  b29: { vmax: 150, vc: 98, vt: 0, vd: 0, vcl: 78, vp: 66, va: 60, vto: 58, vcomb: 0, bank: 30, pr: 0.08, asm: 900, bombAlt: 3500, bombSpeed: 95, vs: 52, climb: 5.5, ceil: 9700, runLen: 1100, landRun: 800, roc: 5.5, roll: 0.3, nmax: 2.5, brakes: false },
  // G4M1: 428 km/h at 4 200 m, cruise 315 km/h, stall 120 km/h, 9.17 m/s climb with a light load (about 5.5 m/s loaded), ceiling 8 950 m; a light and short-running aircraft
  g4m: { vmax: 119, vc: 87, vt: 0, vd: 0, vcl: 58, vp: 54, va: 42, vto: 40, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 4000, bombSpeed: 80, vs: 33, climb: 5.5, ceil: 8950, runLen: 650, landRun: 500, roc: 5.5, roll: 0.45, nmax: 2.5, brakes: false },
  // Lancaster B.I: 454 km/h at 4 000 m (282 mph), cruise 322 km/h (200 mph), ceiling 6 520 m (21 400 ft at 28.6 t), 3.7 m/s climb (720 ft/min); needs a long run at 31 t
  lancaster: { vmax: 126, vc: 89, vt: 0, vd: 0, vcl: 65, vp: 58, va: 49, vto: 46, vcomb: 0, bank: 35, pr: 0.1, asm: 800, bombAlt: 4500, bombSpeed: 78, vs: 38, climb: 3.7, ceil: 6520, runLen: 1000, landRun: 700, roc: 3.7, roll: 0.45, nmax: 2.5, brakes: false },
  // He 111 H-6: 440 km/h, cruise about 360 km/h, ceiling 6 500 m, climb about 3.5 m/s at 12 t; stall 125 km/h
  he111: { vmax: 122, vc: 100, vt: 0, vd: 0, vcl: 63, vp: 56, va: 45, vto: 42, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 3500, bombSpeed: 85, vs: 35, climb: 3.5, ceil: 6500, runLen: 750, landRun: 600, roc: 3.5, roll: 0.4, nmax: 2.5, brakes: false },
  // SM.79-II: about 435 km/h at 4 000 m, cruise 340 km/h, ceiling 6 500 m, climb about 4.3 m/s (4 000 m in 15 min), short run
  sm79: { vmax: 121, vc: 94, vt: 0, vd: 0, vcl: 58, vp: 52, va: 41, vto: 38, vcomb: 0, bank: 40, pr: 0.14, asm: 600, bombAlt: 3500, bombSpeed: 82, vs: 32, climb: 4.3, ceil: 6500, runLen: 500, landRun: 450, roc: 4.3, roll: 0.4, nmax: 2.5, brakes: false },
  // LeO 451: 495 km/h at 4 000 m, cruise about 400 km/h, ceiling 9 000 m, climb about 7 m/s (4 000 m in 9 min), stall 130 km/h
  leo451: { vmax: 137, vc: 111, vt: 0, vd: 0, vcl: 70, vp: 62, va: 47, vto: 44, vcomb: 0, bank: 45, pr: 0.16, asm: 700, bombAlt: 4000, bombSpeed: 100, vs: 36, climb: 7.0, ceil: 9000, runLen: 700, landRun: 600, roc: 7.0, roll: 0.5, nmax: 2.5, brakes: false },
};
export const perfOf = (p) => PERF[p.typeKey] || PERF.sbd;

// ---- the flight physics: a point mass with the forces of a propeller aircraft ----------------------------------------------------------------------------------
// acceleration along the path = thrust - drag - g sin(path angle), per unit mass:
//   thrust  throttle * Pw / v (a propeller gives a power, not a force), held under its static value
//   drag    c0 v^2 (the airframe; rising past Mach 0.55: compressibility) + ci n^2 / v^2 (the induced drag of the lift, n the load factor) (+ the gear, the flaps, the dive brakes)
// ci is the induced drag of the real wing (its area and aspect ratio from the model, an Oswald factor of 0.8); c0 and Pw are the two values for which the aircraft has
// its published top speed (level, full power) and its published rate of climb at its climb speed. The wing can only lift n = (v / vs)^2 times the weight: the stall
// speed vs from the wing loading and a clean maximum lift coefficient (1.45 for a monoplane, 1.35 for a biplane, the heavy bombers 1.4). Density 1.0 kg/m3 (about 2 km).
const G0 = 9.81, RHO = 1.0, OSWALD = 0.8;
const aeroCache = new Map();
export function aeroOf(typeKey, spec) {
  let a = aeroCache.get(typeKey);
  if (a) return a;
  const pf = PERF[typeKey] || PERF.sbd, bi = spec.kind === 'bi';
  const S = spec.S ?? spec.span * (spec.wing.cr + spec.wing.ct) / 2 * (bi ? 1.85 : 1), AR = spec.span * spec.span / S * (spec.S ? 1 : bi ? 1.85 : 1);      // (`S`: the published wing area, when the sheet has it: the planform measured on a model leaves out the root fairings)
  const m = spec.mass * 1000, ci = 2 * G0 * G0 * (m / S) / (RHO * Math.PI * OSWALD * AR);
  const CL = bi ? 1.35 : spec.engines ? 1.4 : 1.45;
  const vs = Math.sqrt(2 * m * G0 / (RHO * S * CL));
  // (fitted at the speed the aircraft climbs at in the simulation: its climb speed, no slower than 1.1 times the stall)
  const vy = Math.max(pf.vcl, vs * 1.1), vm = pf.vmax, roc = pf.roc ?? pf.climb ?? 6;
  const c0 = (roc * G0 / vy + ci * (1 / (vy * vy) - 1 / (vm * vy))) / (vm ** 3 / vy - vy * vy);
  const Pw = c0 * vm ** 3 + ci / vm;
  // the dive brakes: what makes the steady speed of a 70-degree dive, engine throttled back, the published diving speed
  const cb = pf.brakes ? Math.max(0, G0 * Math.sin(70 * Math.PI / 180) / (pf.vd * pf.vd) - c0) : 0;
  a = { S, AR, ci, c0, Pw, vs, cb, roll: pf.roll ?? 1, nmax: pf.nmax ?? 4, vmin: 0.7 * vy };
  aeroCache.set(typeKey, a);
  return a;
}

/** The drag per unit mass (m/s2) at speed v and load factor n; k0: the multiplier of the airframe's drag (gear, flaps), brakes: the dive brakes out. */
export function dragAcc(a, v, n, k0 = 1, brakes = false) {
  const M = v / 330;
  const comp = M > 0.55 ? 1 + 200 * (M - 0.55) * (M - 0.55) : 1;
  return (a.c0 * k0 * comp + (brakes ? a.cb : 0)) * v * v + a.ci * n * n / (v * v);
}

/** The thrust per unit mass at full throttle (m/s2), the share of the power left (engines lost) included. */
export const thrustAcc = (a, v, power = 1) => power * a.Pw / Math.max(v, a.vmin);

// ---- how a fighter turns: what the fight is flown with ----------------------------------------------------------------------------------------------------------------
const turnCache = new Map();
/**
 * The turning performance of a type from its flight model: `vTurn` the speed at which it holds the fastest turn for ever (the thrust pays the induced drag; m/s) and `wTurn` that rate
 * (rad/s); `vCorner` the speed at which the wing and the pilot give the fastest turn there is, for a moment (it loses speed in it) and `wInst` that rate. A light wing (a Zero) turns
 * faster at a lower speed than a heavy one (a Hellcat) which has the power to keep its speed: the first fights a turning fight, the second goes for the speed.
 */
export function turnPerf(typeKey, spec) {
  let t = turnCache.get(typeKey);
  if (t) return t;
  const A = aeroOf(typeKey, spec), rate = (n, v) => G0 * Math.sqrt(Math.max(0, n * n - 1)) / v;
  let vTurn = 0, wTurn = 0, vCorner = 0, wInst = 0;
  for (let v = 50; v <= 190; v += 1) {
    const cap = Math.min(A.nmax, 0.9 * (v / A.vs) ** 2);
    if (rate(cap, v) > wInst) { wInst = rate(cap, v); vCorner = v; }
    let lo = 1, hi = cap;
    if (thrustAcc(A, v) - dragAcc(A, v, 1) < 0) continue;       // cannot hold level flight at this speed
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (thrustAcc(A, v) - dragAcc(A, v, m) > 0) lo = m; else hi = m; }
    if (rate(lo, v) > wTurn) { wTurn = rate(lo, v); vTurn = v; }
  }
  t = { vTurn, wTurn, vCorner, wInst };
  turnCache.set(typeKey, t);
  return t;
}
