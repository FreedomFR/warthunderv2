// Explosive fillers of torpedoes and their strength against a ship's hull, as kg of TNT per kg of filler. Damage and the underwater
// protection tables (data/protection.js: "kg of TNT") work on the TNT equivalent, never on the raw weight of the warhead.
//   tnt      the reference.
//   hexanite 60 % TNT / 40 % hexanitrodiphenylamine (German G7, Japanese Type 97): about as strong as TNT, a little more with the
//            aluminium of the underwater grades (sources disagree between 0.95 and 1.1; estimated).
//   hbx      HBX-1 (TNT, RDX, aluminium), the filler of the US Mk 15 from 1943 (about 1.35; estimated).
//   torpex   42 % RDX / 40 % TNT / 18 % aluminium: 50 % stronger than TNT by mass (the aluminium prolongs the bubble, which is what breaks a hull).
export const EXPLOSIVE = {
  tnt: 1.0,
  hexanite: 1.05,
  hbx: 1.35,
  torpex: 1.5,
};

/** TNT equivalent (kg) of `kg` of filler of the given kind. */
export function tntEquivalent(kg, explosive = 'tnt') {
  return kg * (EXPLOSIVE[explosive] ?? 1);
}

// The aircraft torpedo of each nation (the one its torpedo bomber carries), filler in kg:
//   USA     Mk 13 (Avenger): 262 kg of Torpex (600 lb)
//   Japan   Type 91 Model 2 (B5N): 205 kg of Type 97
//   UK      18 in Mk XII (Swordfish): 176 kg of TNT (388 lb)
//   Germany F5b (LT F5b): 200 kg of hexanite (180-250 kg depending on the version)
//   France  400-450 mm aerial torpedo: about 200 kg (estimated)
//   Italy   W 200/450 x 5.46 (aerial Whitehead): 200 kg
export const AIR_TORPEDO = {
  USA: { kg: 262, explosive: 'torpex' },
  Japan: { kg: 205, explosive: 'hexanite' },
  UK: { kg: 176, explosive: 'tnt' },
  Germany: { kg: 200, explosive: 'hexanite' },
  France: { kg: 200, explosive: 'tnt' },
  Italy: { kg: 200, explosive: 'tnt' },
};

/** TNT equivalent (kg) of the torpedo an aircraft of the given nation drops. */
export function airTorpedoEq(nation) {
  const t = AIR_TORPEDO[nation] || AIR_TORPEDO.USA;
  return tntEquivalent(t.kg, t.explosive);
}
