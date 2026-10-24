// Anti-aircraft data shared by the guns (sim/aircraft.js) and the aircraft that plan their way past them (sim/routing.js).

/** Range, rate and damage of a light AA calibre (per mount, per barrel); elevMax: the highest elevation the mount reaches (deg), above it the aircraft is overhead and safe. */
export const AA = {
  oerlikon: { range: 1900, rps: 6.5, dps: 0.0068, hit: 0.34, turn: 75, elevMax: 87, vb: 840, sig: 34 },
  iijn25: { range: 2600, rps: 3.4, dps: 0.0058, hit: 0.4, turn: 60, elevMax: 80, vb: 900, sig: 38 },
  bofors: { range: 4200, rps: 1.9, dps: 0.0105, hit: 0.9, turn: 55, elevMax: 88, vb: 880, sig: 24 },
  phalanx: { range: 2200, rps: 75, dps: 0.0004, hit: 0.34, turn: 110, elevMax: 85, vb: 1100, sig: 5 },      // the Mk 15 close-in weapon: 4 500 rounds a minute of 20 mm tungsten, radar-laid (a very small dispersion)
  breda37: { range: 4000, rps: 2.0, dps: 0.0092, hit: 0.85, turn: 50, elevMax: 90, vb: 800, sig: 24 },      // the twin 37/54 of the Italian destroyers: 120 rounds a minute a barrel, a little less hitting than the 40 mm
};
// The heavy flak of the bases: the 8.8 cm Flak 36 (15 to 20 rounds a minute, a ceiling of 8 000 m): it bursts its shells near the aircraft, like the dual-purpose guns of the ships (`flak`)
AA.flak88 = { range: 8000, rps: 0.3, dps: 0.02, hit: 1.0, turn: 22, elevMax: 85, vb: 820, sig: 30, flak: true, ceiling: 8000, burst: 3.2 };
export const FLAK_RANGE = 7500;
