// Anti-aircraft data shared by the guns (sim/aircraft.js) and the aircraft that plan their way past them (sim/routing.js).

import { AA_GUNS, AMMO, UNIT } from '../data/airguns.js';

/**
 * Range, rate and damage of a light AA gun, per mount and per barrel; elevMax: the highest elevation the mount reaches (deg), above it the aircraft is overhead and safe.
 * The gun is the real one (data/airguns.js `AA_GUNS`): rps is the rate of one barrel (the cyclic rate of the gun times what its feed keeps up), vb its muzzle velocity, range and sig its
 * effective range and its dispersion, and `hit` what one hit of its round does (the damage of the round in .50 API, x UNIT); the round itself (`ammo`: its fire and its blast) goes with every hit.
 * `turn` and `elevMax` belong to the mount. The old names of the classes (oerlikon, iijn25, bofors, breda37, phalanx) are the guns that the mounts were drawn for.
 */
function mk(gun, mount, k) {
  const g = AA_GUNS[gun], rps = g.rpm / 60 * (g.feed ?? 0.87), hit = AMMO[g.round].dmg * UNIT;
  return { gun, ammo: AMMO[g.round], range: g.range, rps, dps: hit * rps * (k ?? 1.5e-6 * g.range * 1.05), hit, vb: g.v0, sig: g.sig, ...mount };
}
export const AA = {
  oerlikon: mk('oerlikon20', { turn: 75, elevMax: 87 }, 0.00308),
  iijn25: mk('t96_25', { turn: 60, elevMax: 80 }, 0.00426),
  bofors: mk('bofors40', { turn: 55, elevMax: 88 }, 0.00614),
  phalanx: mk('phalanx20', { turn: 110, elevMax: 85 }, 0.0000157),                       // the Mk 15 close-in weapon: 4 500 rounds a minute of 20 mm tungsten, radar-laid (a very small dispersion)
  breda37: mk('breda37', { turn: 50, elevMax: 90 }, 0.0054),                              // the twin 37/54 of the Italian destroyers
};
// the other guns of the mounts (every mount of the ships and the bases names its gun; the old class is only the way the mount is drawn)
Object.assign(AA, {
  flak38: mk('flak38', { turn: 70, elevMax: 87 }), breda20: mk('breda20', { turn: 70, elevMax: 87 }), scotti20: mk('scotti20', { turn: 70, elevMax: 87 }),
  t93_13: mk('t93_13', { turn: 75, elevMax: 87 }), hotchkiss13: mk('hotchkiss13', { turn: 70, elevMax: 87 }),
  fr37_1925: mk('fr37_1925', { turn: 45, elevMax: 85 }), fr37_1933: mk('fr37_1933', { turn: 50, elevMax: 88 }), flak37: mk('flak37', { turn: 55, elevMax: 88 }),
  m1_28: mk('m1_28', { turn: 30, elevMax: 88 }),      // the 1.1 in quadruple of the US carriers of 1942: trains at 30 deg/s, elevates to 110 degrees
  pompom: mk('pompom', { turn: 45, elevMax: 85 }), vt40: mk('vt40', { turn: 55, elevMax: 88 }),
});
for (const [k, g] of [['oerlikon20', 'oerlikon'], ['t96_25', 'iijn25'], ['bofors40', 'bofors'], ['phalanx20', 'phalanx']]) AA[k] = AA[g];
// The heavy flak of the bases: the 8.8 cm Flak 36 (15 to 20 rounds a minute, a ceiling of 8 000 m): it bursts its shells near the aircraft, like the dual-purpose guns of the ships (`flak`)
AA.flak88 = { gun: 'flak88', ammo: AMMO.hei88, range: 8000, rps: 0.3, dps: 0.02, hit: 1.0, turn: 22, elevMax: 85, vb: 820, sig: 30, flak: true, ceiling: 8000, burst: 3.2 };
export const FLAK_RANGE = 7500;
