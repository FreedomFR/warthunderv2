// Armour penetration by armour-piercing shells: the muzzle figure of each gun from its shell and velocity, the way the plate resists an
// oblique hit, spaced plates, the thickness a base fuze needs to be set off. Shared by the hit resolution (damage.js) and the choice of
// shell (weapons.js) so that the gunners expect what the plates will do.

/** De Marre: penetration grows with v^1.43 and W^0.714 and falls with d^1.07. */
export const V_EXP = 1.43;
// Calibrated on a published table: the 16 in / 2700 lb Mk 8 at 762 m/s goes through 829 mm of face-hardened plate at the muzzle (the
// 18.1 in Type 91 and the 15 in German shell come out within 2 % of their own tables with the same constants).
const REF = { pen: 829, v: 762, kg: 1225, cal: 406 };

/** Penetration (mm of face-hardened vertical armour, square on) of an AP shell at its muzzle velocity. `q` = quality of the shell and plate (1 = reference). */
export function muzzlePenetration(cal, kg, v0, q = 1) {
  return REF.pen * Math.pow(v0 / REF.v, V_EXP) * Math.pow(kg / REF.kg, 0.714) * Math.pow(cal / REF.cal, -1.07) * q;
}

/**
 * Exponent of the cosine of the obliquity that thickens the plate. A shell needs about 22 % more speed to get through a plate struck at
 * 45 degrees (a power of about 0.8 on the cosine), but a deck hit by a shell falling at 15 degrees (75 degrees from the normal) stops about
 * 1.2 of it: the table of the 16 in gun, 99 mm of deck at 20 000 yd against 500 mm of belt.
 */
export function obliquityExponent(angleDeg) {
  const t = Math.min(1, Math.max(0, (angleDeg - 40) / 35));
  return 0.8 + 0.4 * t * t * (3 - 2 * t);
}

/** Effective thickness of a plate of `T` mm met at `angleDeg` from its normal. */
export function effectiveThickness(T, angleDeg) {
  if (T <= 0) return 0;
  const c = Math.max(Math.cos(angleDeg * Math.PI / 180), 0.12);
  return T / Math.pow(c, obliquityExponent(angleDeg));
}

/** Plates one behind the other with air between them (a weather deck above the armoured deck): De Marre's rule for spaced plates. */
export function spacedPlates(effs) {
  let s = 0;
  for (const e of effs) s += Math.pow(Math.max(e, 0), 1.4);
  return Math.pow(s, 1 / 1.4);
}

// Thickness (as a fraction of the calibre) of plate a base fuze needs to be set off, against the obliquity; it falls with obliquity up to
// about 60 degrees and then climbs back to its square-on value at 80 (published fuze tests: 0.98 in for a 14 in shell square on, 0.44 in at 61-70 degrees).
const FUZE_ANGLE = [0, 30, 45, 55, 61, 70, 80, 90];
const FUZE_RATIO = [1, 0.755, 0.56, 0.47, 0.45, 0.45, 1, 1];

/** Thickness (mm of actual plate) that sets off the base fuze of a shell of `cal` mm met at `angleDeg` from the normal. */
export function fuzeThickness(cal, angleDeg) {
  let i = 1;
  while (i < FUZE_ANGLE.length - 1 && angleDeg > FUZE_ANGLE[i]) i++;
  const a0 = FUZE_ANGLE[i - 1], a1 = FUZE_ANGLE[i];
  const f = Math.min(1, Math.max(0, (angleDeg - a0) / (a1 - a0)));
  return 0.07 * cal * (FUZE_RATIO[i - 1] + (FUZE_RATIO[i] - FUZE_RATIO[i - 1]) * f);
}

/** Speed left after going through a plate that is `eff` mm thick for a shell able to defeat `pen` mm. */
export function residualSpeed(speed, eff, pen) {
  const r = Math.min(eff / Math.max(pen, 1), 0.995);
  return speed * Math.sqrt(Math.max(0.12, 1 - r * r));
}
