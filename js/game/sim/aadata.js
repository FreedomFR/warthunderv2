// Anti-aircraft data shared by the guns (sim/aircraft.js) and the aircraft that plan their way past them (sim/routing.js).

/** Range, rate and damage of a light AA calibre (per mount, per barrel); elevMax: the highest elevation the mount reaches (deg), above it the aircraft is overhead and safe. */
export const AA = {
  oerlikon: { range: 1900, rps: 6.5, dps: 0.0068, hit: 0.34, turn: 75, elevMax: 87 },
  iijn25: { range: 2600, rps: 3.4, dps: 0.0058, hit: 0.4, turn: 60, elevMax: 80 },
  bofors: { range: 4200, rps: 1.9, dps: 0.0105, hit: 0.9, turn: 55, elevMax: 88 },
};
export const FLAK_RANGE = 7500;
