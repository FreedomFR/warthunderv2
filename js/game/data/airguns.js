// The guns of the aircraft and what they fire. A hit does what the round is: its structural damage (relative to one .50 API round = 1: Williams and Gustin's "destructiveness",
// the product of the mass, the velocity and the explosive of the round), the chance that it starts a fire when it lands in the fuel (an incendiary or a high-explosive round: 14 to 90 %,
// a rifle-calibre ball round: nothing to speak of), and the blast of its filler (g of TNT: it hurts what is next to the part it hit). The fits are those of the real aircraft (the number
// of guns, the rounds each carries, the rate of fire), the belts those that the navy of each nation loaded.
// Sources: flying-guns.com (Williams and Gustin), NavWeaps and Wikipedia for the guns, the RAF / USN / Luftwaffe trials as reported by yarchive.net and thearmorylife.com; `est` marks a guess.
export const UNIT = 0.17;        // structural damage of one .50 API round (the unit of `dmg` below): what the AA tables (sim/aadata.js) were calibrated on

/** The rounds: { name, cal (mm), dmg (x .50 API), fire (chance of a fire on a fuel hit), blast (g TNT) }. */
export const AMMO = {
  ball50: { name: '12,7 mm ball', cal: 12.7, dmg: 0.83, fire: 0.08, blast: 0 },
  ap50: { name: '12,7 mm AP', cal: 12.7, dmg: 0.9, fire: 0.12, blast: 0 },
  api50: { name: '12,7 mm API (M8)', cal: 12.7, dmg: 1.0, fire: 0.35, blast: 0 },
  apit50: { name: '12,7 mm API-T', cal: 12.7, dmg: 0.95, fire: 0.3, blast: 0 },
  ball303: { name: '7,7 mm ball', cal: 7.7, dmg: 0.2, fire: 0.02, blast: 0 },
  ap303: { name: '7,7 mm AP', cal: 7.7, dmg: 0.22, fire: 0.03, blast: 0 },
  inc303: { name: '.303 B Mk VI incendiary', cal: 7.7, dmg: 0.25, fire: 0.14, blast: 0 },
  ball792: { name: '7,92 mm ball', cal: 7.92, dmg: 0.22, fire: 0.02, blast: 0 },
  ball75: { name: '7,5 mm ball', cal: 7.5, dmg: 0.2, fire: 0.02, blast: 0 },
  breda127: { name: '12,7 mm Breda AP', cal: 12.7, dmg: 0.85, fire: 0.15, blast: 0 },
  mg131: { name: '13 mm MG 131 HE-I', cal: 13, dmg: 0.75, fire: 0.3, blast: 1.5 },
  hei20t99a: { name: '20 mm Type 99 Mk 1 HE-I', cal: 20, dmg: 2.0, fire: 0.6, blast: 5 },
  hei20t99b: { name: '20 mm Type 99 Mk 2 HE-I', cal: 20, dmg: 2.6, fire: 0.7, blast: 8 },
  hei20ff: { name: '20 mm MG FF HE', cal: 20, dmg: 1.9, fire: 0.55, blast: 4 },
  mine20: { name: '20 mm Minengeschoss', cal: 20, dmg: 2.0, fire: 0.7, blast: 25 },
  hei20hs: { name: '20 mm HS.404 HEI', cal: 20, dmg: 3.3, fire: 0.9, blast: 8 },
  ap20: { name: '20 mm AP-T', cal: 20, dmg: 2.5, fire: 0.25, blast: 0 },
  hei23: { name: '23 mm VYa HE-I', cal: 23, dmg: 3.2, fire: 0.75, blast: 10 },
  api23: { name: '23 mm VYa API', cal: 23, dmg: 2.9, fire: 0.45, blast: 2 },
  // the rounds of the anti-aircraft guns (the guns of AA_GUNS below). dmg: x one .50 API as above (the mass, the velocity and the filler of the round: a 40 mm HE-T of 0.9 kg with its filler is worth five .50 API,
  // a 20 mm one two to three); fire: the chance that a hit in the fuel starts a fire (an HE-T with its tracer composition, the fragments of the shell); blast: g of TNT of the filler. `est` = a guess.
  ball132: { name: '13,2 mm Hotchkiss ball / AP', cal: 13.2, dmg: 0.85, fire: 0.1, blast: 0 },
  hei20ok: { name: '20 mm Oerlikon HE-T (123 g)', cal: 20, dmg: 2.0, fire: 0.45, blast: 6 },
  hei20f38: { name: '20 mm Flak 38 Sprenggranate (20 x 138 B, 115 g)', cal: 20, dmg: 2.4, fire: 0.5, blast: 9 },
  hei20b: { name: '20 mm Breda 20/65 HE-T (est)', cal: 20, dmg: 2.2, fire: 0.45, blast: 8 },
  hei25t96: { name: '25 mm Type 96 HE-T (250 g)', cal: 25, dmg: 2.35, fire: 0.5, blast: 11 },
  hei37fl: { name: '37 mm Flak HE-T (37 x 263 B, 640 g)', cal: 37, dmg: 4.8, fire: 0.55, blast: 30 },
  hei37fr: { name: '37 mm Mle 1925 / 1933 HE-T (est)', cal: 37, dmg: 4.6, fire: 0.5, blast: 25 },
  hei37bd: { name: '37 mm Breda 37/54 HE-T (est)', cal: 37, dmg: 5.0, fire: 0.5, blast: 28 },
  hei40bf: { name: '40 mm Bofors HE-T (900 g)', cal: 40, dmg: 5.3, fire: 0.6, blast: 55 },
  hei40pp: { name: '40 mm 2-pdr pom-pom HE-T (900 g, slow)', cal: 40, dmg: 4.4, fire: 0.5, blast: 35 },
  hei40vt: { name: '40 mm Vickers-Terni 40/39 HE-T (est)', cal: 40, dmg: 4.4, fire: 0.5, blast: 35 },
  ap20phal: { name: '20 mm Phalanx APDS (tungsten)', cal: 20, dmg: 2.0, fire: 0.1, blast: 0 },
  hei88: { name: '88 mm Flak 36 HE (9.4 kg shell)', cal: 88, dmg: 5.9, fire: 0.6, blast: 700 },
};

/**
 * The anti-aircraft guns: calibre (mm), cyclic rate of one barrel (rounds a minute), muzzle velocity (m/s), the round it fires (AMMO), the effective range (m) and the dispersion (mrad).
 * What a gun does in the simulation (sim/aadata.js): the rate of fire of one barrel times the number of barrels of its mount, the damage of the round at every hit, its fire and its blast.
 * `feed`: the share of the cyclic rate a mount keeps up (the default .87). Sources: NavWeaps, Wikipedia, the manuals of each gun; `est` marks a guess.
 */
export const AA_GUNS = {
  oerlikon20: { name: 'Oerlikon 20 mm', cal: 20, rpm: 450, v0: 840, round: 'hei20ok', range: 1900, sig: 34 },
  flak38: { name: '2 cm Flak 38', cal: 20, rpm: 480, v0: 900, round: 'hei20f38', range: 2200, sig: 32 },
  breda20: { name: 'Breda 20/65 Mod. 35', cal: 20, rpm: 240, v0: 830, round: 'hei20b', range: 1800, sig: 34 },
  scotti20: { name: 'Scotti 20/70', cal: 20, rpm: 450, v0: 850, round: 'hei20b', range: 1800, sig: 34 },
  t96_25: { name: 'Type 96 (25 mm)', cal: 25, rpm: 260, v0: 900, round: 'hei25t96', range: 2600, sig: 38, feed: 0.82 },
  t93_13: { name: 'Type 93 (13,2 mm)', cal: 13.2, rpm: 450, v0: 800, round: 'ball132', range: 1500, sig: 40 },
  hotchkiss13: { name: 'Hotchkiss 13,2 mm', cal: 13.2, rpm: 450, v0: 800, round: 'ball132', range: 1500, sig: 40 },
  fr37_1925: { name: '37 mm Mle 1925 (semi-automatic)', cal: 37, rpm: 21, v0: 800, round: 'hei37fr', range: 3500, sig: 28, feed: 1 },
  fr37_1933: { name: '37 mm Mle 1933', cal: 37, rpm: 140, v0: 800, round: 'hei37fr', range: 3500, sig: 28 },
  flak37: { name: '3,7 cm Flak 36 / 37 / 43', cal: 37, rpm: 160, v0: 820, round: 'hei37fl', range: 4000, sig: 24 },
  breda37: { name: 'Breda 37/54', cal: 37, rpm: 120, v0: 800, round: 'hei37bd', range: 4000, sig: 24 },
  bofors40: { name: 'Bofors 40 mm L/60', cal: 40, rpm: 120, v0: 880, round: 'hei40bf', range: 4200, sig: 24, feed: 0.95 },
  pompom: { name: 'QF 2-pdr pom-pom Mk VIII', cal: 40, rpm: 115, v0: 585, round: 'hei40pp', range: 3300, sig: 30 },
  vt40: { name: 'Vickers-Terni 40/39', cal: 40, rpm: 200, v0: 580, round: 'hei40vt', range: 3300, sig: 30 },
  phalanx20: { name: 'M61 Vulcan (Phalanx Mk 15)', cal: 20, rpm: 4500, v0: 1100, round: 'ap20phal', range: 2200, sig: 5, feed: 1 },
  flak88: { name: '8,8 cm Flak 36', cal: 88, rpm: 18, v0: 820, round: 'hei88', range: 8000, sig: 30, feed: 1 },
};

/** The belts: the share of each round in the belt. */
export const BELTS = {
  us50: { api50: 0.45, ap50: 0.2, ball50: 0.1, apit50: 0.25 },                  // the Navy's .50: API liked "because Japanese planes caught fire easily", a tracer in four
  us50e: { ap50: 0.35, ball50: 0.3, apit50: 0.25, api50: 0.1 },               // the Navy's .50 of 1941-42 (the F4F-3): ball, AP and tracer, the API only coming in (est)
  us50a: { ap50: 0.4, api50: 0.2, apit50: 0.2, ball50: 0.2 },                  // the Army Air Forces' .50 of 1942: armour-piercing first, the incendiary arriving, a tracer in five (`est`)
  uk20: { hei20hs: 0.6, ap20: 0.4 },                                              // the Hispano of the RAF: high explosive / incendiary and armour-piercing, a tracer in the belt
  jp77: { ball303: 0.6, ap303: 0.4 },                                           // the 7,7 mm Type 97: ball and AP, a tracer now and then
  jp20: { hei20t99a: 0.65, ap20: 0.35 },                                        // the Type 99 cannon: HE-I (the tracer is one too) and AP-T
  uk303: { ap303: 0.4, inc303: 0.4, ball303: 0.2 },                             // late 1941: half AP, half incendiary
  de792: { ball792: 1 },
  de20ff: { mine20: 0.6, hei20ff: 0.3, ap20: 0.1 },
  de20mg: { mine20: 0.55, hei20ff: 0.2, ap20: 0.25 },                             // the MG 151/20: Minengeschoss, high explosive and armour-piercing tracer                             // the MG FF/M: mostly Minengeschoss
  fr20: { hei20hs: 0.75, ap20: 0.25 },
  fr75: { ball75: 1 },
  it127: { breda127: 1 },
  it77: { ball303: 0.6, ap303: 0.4 },                                           // the 7,7 mm Breda-SAFAT: ball and AP
  mg131: { mg131: 1 },
  ru23: { hei23: 0.55, api23: 0.45 },                                             // the VYa-23 of the Il-2: HE-I and armour-piercing incendiary
  ru762: { ball303: 0.45, ap303: 0.4, inc303: 0.15 },                            // the ShKAS: ball, AP and incendiary (rifle calibre)
};

/** The guns: calibre (mm), cyclic rate (rounds a minute, as fired through the propeller or from the wing), a long burst's worth of the rounds a gun carries. */
export const GUNS = {
  m2: { name: 'Browning M2', cal: 12.7, rpm: 800, v0: 890 },
  b303: { name: 'Browning .303', cal: 7.7, rpm: 1150, v0: 740 },
  t97: { name: 'Type 97 (7,7 mm)', cal: 7.7, rpm: 700, v0: 745 },
  t99: { name: 'Type 99 Mk 1 (20 mm)', cal: 20, rpm: 520, v0: 600 },
  mg17: { name: 'MG 17 (7,92 mm)', cal: 7.92, rpm: 1000, v0: 785 },
  mgff: { name: 'MG FF/M (20 mm)', cal: 20, rpm: 540, v0: 585 },
  mg151: { name: 'MG 151/20 (20 mm)', cal: 20, rpm: 700, v0: 705 },
  hs404: { name: 'Hispano HS.404 (20 mm)', cal: 20, rpm: 650, v0: 860 },
  mac: { name: 'MAC 1934 (7,5 mm)', cal: 7.5, rpm: 1200, v0: 830 },
  breda127: { name: 'Breda-SAFAT (12,7 mm)', cal: 12.7, rpm: 600, v0: 760 },
  vya23: { name: 'VYa-23 (23 mm)', cal: 23, rpm: 550, v0: 905 },
  shkas: { name: 'ShKAS (7,62 mm)', cal: 7.62, rpm: 1800, v0: 825 },
  vickers: { name: 'Vickers .303', cal: 7.7, rpm: 950, v0: 745 },
  darne: { name: 'Darne (7,5 mm)', cal: 7.5, rpm: 1300, v0: 700 },
  safat77: { name: 'Breda-SAFAT (7,7 mm)', cal: 7.7, rpm: 1100, v0: 740 },
  hsm1: { name: 'Hispano M1 (20 mm)', cal: 20, rpm: 600, v0: 850 },                // the American-built Hispano of the P-38: 600 rounds a minute, 2 800 ft/s with the M97 high-explosive round (Wikipedia, the Hispano-Suiza HS.404 article)
  hsmk2: { name: 'Hispano Mk II (20 mm)', cal: 20, rpm: 600, v0: 880 },
};

/**
 * The fixed guns of each type (the ones the pilot lays by pointing the aircraft): the guns, how many, the rounds each carries (a drum of 60 for a 20 mm cannon is 7 s of fire), the
 * belt, and where they sit. mount: 'wing' (z: the stations of the guns from the centre line, one list for each wing: n is twice its length), 'cowl' (z: the signed places of the guns
 * over the engine, firing through the propeller), 'hub' (through the propeller hub), 'fus' (z: signed, in the side of the nose), 'at' (a bomber: [d from the nose, height, z] of
 * each gun); conv: the distance (m) at which the guns are harmonised, where the lines of the guns cross. Fits: the published ones of each aircraft; `est` marks a guess.
 */
export const FIXED_GUNS = {
  f6f: [{ gun: 'm2', n: 6, rpg: 400, belt: 'us50', mount: 'wing', z: [2.33, 2.52, 2.71], conv: 275 }],                       // three .50 in each wing, outboard of the undercarriage (the stations of the muzzle ports on the model's leading edge)
  f4f: [{ gun: 'm2', n: 4, rpg: 430, belt: 'us50e', mount: 'wing', z: [1.62, 1.93], conv: 275 }],                       // the F4F-3: two .50 in each wing, 430 rounds each (the six of the F4F-4 came later); the stations are those of the barrels on the model (1.62 and 1.93 m from the centre line)
  fm2: [{ gun: 'm2', n: 4, rpg: 430, belt: 'us50', mount: 'wing', z: [2.16, 2.4], conv: 275 }],                         // two .50 in each wing, 430 rounds each; the stations are those of the muzzle ports taped over on the model (2.1-2.23 and 2.33-2.46 m from the centre line)
  a6m: [{ gun: 't97', n: 2, rpg: 600, belt: 'jp77', mount: 'cowl', z: [-0.22, 0.22], conv: 200 }, { gun: 't99', n: 2, rpg: 60, belt: 'jp20', mount: 'wing', z: [2.3], conv: 200 }],
  fulmar: [{ gun: 'b303', n: 8, rpg: 750, belt: 'uk303', mount: 'wing', z: [2.7, 3.1, 3.5, 3.9], conv: 230 }],            // four in each wing
  bf109t: [{ gun: 'mg17', n: 2, rpg: 500, belt: 'de792', mount: 'cowl', z: [-0.2, 0.2], conv: 250 }, { gun: 'mg151', n: 1, rpg: 200, belt: 'de20mg', mount: 'hub', conv: 250 }],      // the F-4: two MG 17 over the engine and the MG 151/20 through the hub
  d520: [{ gun: 'hs404', n: 1, rpg: 60, belt: 'fr20', mount: 'hub', conv: 200 }, { gun: 'mac', n: 4, rpg: 675, belt: 'fr75', mount: 'wing', z: [2.1, 2.7], conv: 200 }],
  mc202: [{ gun: 'breda127', n: 2, rpg: 370, belt: 'it127', mount: 'cowl', z: [-0.3, 0.3], conv: 250 }, { gun: 'safat77', n: 2, rpg: 500, belt: 'it77', mount: 'wing', z: [2.4], conv: 250 }],      // (the two 7,7 mm of the wings: rounds est)
  il2: [{ gun: 'vya23', n: 2, rpg: 150, belt: 'ru23', mount: 'wing', z: [1.5], conv: 350 }, { gun: 'shkas', n: 2, rpg: 750, belt: 'ru762', mount: 'wing', z: [2.7], conv: 350 }],      // the guns of the wings (the ground attack: not simulated yet)
  // the strike aircraft: the guns that fire ahead, used on a fighter that crosses their nose and on the ship at the start of the dive
  sbd: [{ gun: 'm2', n: 2, rpg: 360, belt: 'us50', mount: 'cowl', z: [-0.28, 0.28], conv: 250 }],
  tbf: [{ gun: 'm2', n: 2, rpg: 400, belt: 'us50', mount: 'wing', z: [3.4], conv: 250 }],                                // the two .50 of the wings of the TBF-1C (rounds est)
  d3a: [{ gun: 't97', n: 2, rpg: 600, belt: 'jp77', mount: 'cowl', z: [-0.22, 0.22], conv: 200 }],
  swordfish: [{ gun: 'vickers', n: 1, rpg: 600, belt: 'uk303', mount: 'fus', z: [0.45], conv: 200 }],                 // one synchronised Vickers in the side of the nose
  skua: [{ gun: 'b303', n: 4, rpg: 600, belt: 'uk303', mount: 'wing', z: [1.8, 2.3], conv: 230 }],
  ju87: [{ gun: 'mg17', n: 2, rpg: 500, belt: 'de792', mount: 'wing', z: [3.3], conv: 250 }],
  fi167: [{ gun: 'mg17', n: 1, rpg: 500, belt: 'de792', mount: 'fus', z: [0.5], conv: 250 }],                           // one MG 17 in the starboard side of the nose
  ln401: [{ gun: 'mac', n: 2, rpg: 500, belt: 'fr75', mount: 'wing', z: [2.0], conv: 200 }],                           // (rounds est)
  pl10: [{ gun: 'darne', n: 1, rpg: 500, belt: 'fr75', mount: 'fus', z: [0.4], conv: 200 }],                           // (rounds est)
  re2001: [{ gun: 'breda127', n: 2, rpg: 350, belt: 'it127', mount: 'cowl', z: [-0.25, 0.25], conv: 250 }, { gun: 'safat77', n: 2, rpg: 500, belt: 'it77', mount: 'wing', z: [2.2], conv: 250 }],
  re2001t: [{ gun: 'breda127', n: 2, rpg: 350, belt: 'it127', mount: 'cowl', z: [-0.25, 0.25], conv: 250 }, { gun: 'safat77', n: 2, rpg: 500, belt: 'it77', mount: 'wing', z: [2.2], conv: 250 }],
  // the P-38G: a 20 mm Hispano M1 (150 rounds, a drum) and four .50 M2 (500 rounds each) in the nose on the centre line, one above the other and side by side, all firing parallel (the stations and the muzzles are those of the barrels on the model's nose: the four .50 are staggered, the cannon stands out the most)
  p38: [{ gun: 'hsm1', n: 1, rpg: 150, belt: 'us20', mount: 'at', at: [[0.1, 0.084, 0]], where: 'dans le nez, sur l\'axe', drawn: true, conv: 400 },
    { gun: 'm2', n: 4, rpg: 500, belt: 'us50a', mount: 'at', at: [[0.13, 0.233, -0.118], [0.32, 0.233, 0.118], [0.57, 0.112, -0.273], [0.57, 0.112, 0.273]], where: 'dans le nez, sur l\'axe', drawn: true, conv: 400 }],
  // the Mosquito FB Mk VI: four 20 mm Hispano Mk II under the nose (300 rounds each) and four .303 Browning in it (500 rounds each), the barrels at the places of those of the model (the cannons in two
  // pairs at 0.1 and 0.24 m from the centre line, the rifle-calibre guns above them); the guns fire ahead for the pilot (no gunner)
  mosquito: [{ gun: 'hsmk2', n: 4, rpg: 300, belt: 'uk20', mount: 'at', at: [[0.64, -0.645, -0.105], [0.64, -0.645, 0.105], [0.88, -0.665, -0.243], [0.88, -0.665, 0.243]], where: 'sous le nez', drawn: true, conv: 230 },
    { gun: 'b303', n: 4, rpg: 500, belt: 'uk303', mount: 'at', at: [[-0.31, -0.216, -0.108], [-0.31, -0.216, 0.108], [-0.17, -0.25, -0.245], [-0.17, -0.25, 0.245]], where: 'dans le nez', drawn: true, conv: 230 }],
  sm79: [{ gun: 'breda127', n: 1, rpg: 350, belt: 'it127', mount: 'at', at: [[6.6, 1.85, 0]], conv: 300 }],           // the fixed 12,7 mm of the hump, firing ahead
};
export const FIGHTER_GUNS = FIXED_GUNS;

/** The fixed guns of a type as a list of groups with their state: { gun, n, cal, rps (rounds a second of the whole group), left (rounds left in each gun), belt }. Empty for an aircraft with none. */
export function armamentOf(typeKey) {
  const fit = FIXED_GUNS[typeKey];
  if (!fit) return [];
  return fit.map((g) => ({ gun: g.gun, n: g.n, cal: GUNS[g.gun].cal, rps: GUNS[g.gun].rpm / 60 * g.n, rpg: g.rpg, left: g.rpg, belt: g.belt, conv: g.conv }));
}

/** One round drawn from a belt. */
export function drawRound(belt, rnd) {
  let r = rnd(), acc = 0, last = null;
  for (const k of Object.keys(BELTS[belt])) { acc += BELTS[belt][k]; last = k; if (r < acc) return AMMO[k]; }
  return AMMO[last];
}

/** The mean structural damage, fire chance and blast of a belt (what a hit of that belt is worth). */
export function beltMean(belt) {
  let dmg = 0, fire = 0, blast = 0;
  for (const [k, w] of Object.entries(BELTS[belt])) { dmg += w * AMMO[k].dmg; fire += w * AMMO[k].fire; blast += w * AMMO[k].blast; }
  return { dmg, fire, blast };
}

/**
 * The belt a defensive gun of the given calibre fires, by nation (the gunners of the bombers: the .30 and the .50 of the Americans, the 7,7 mm of the Japanese, the 20 mm of the Type 99 tail,
 * the 7,92 mm of the Germans, the 13 mm MG 131, the 7,5 mm and the 20 mm of the French, the 12,7 and 7,7 of the Italians, the .303 of the British).
 */
export function beltForGun(cal, nation) {
  if (nation === 'USSR') return cal >= 19 ? 'ru23' : cal >= 12.5 ? 'us50' : 'ru762';
  if (cal >= 19) return nation === 'Japan' ? 'jp20' : nation === 'France' ? 'fr20' : nation === 'USA' ? 'us20' : 'de20ff';
  if (cal >= 12.5 && cal < 14) return cal > 12.9 ? 'mg131' : nation === 'Italy' ? 'it127' : 'us50';
  if (nation === 'USA') return 'us30';
  if (nation === 'UK') return 'uk303';
  if (nation === 'Germany') return 'de792';
  if (nation === 'France') return 'fr75';
  return 'jp77';
}
BELTS.us20 = { hei20hs: 0.7, ap20: 0.3 };         // the 20 mm M2 of the B-29's tail (the Hispano: HE-I and AP)
BELTS.us30 = { ball303: 0.6, ap303: 0.4 };         // the .30 of the American gunners: ball and AP, like any rifle calibre
