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
};

/** The belts: the share of each round in the belt. */
export const BELTS = {
  us50: { api50: 0.45, ap50: 0.2, ball50: 0.1, apit50: 0.25 },                  // the Navy's .50: API liked "because Japanese planes caught fire easily", a tracer in four
  jp77: { ball303: 0.6, ap303: 0.4 },                                           // the 7,7 mm Type 97: ball and AP, a tracer now and then
  jp20: { hei20t99a: 0.65, ap20: 0.35 },                                        // the Type 99 cannon: HE-I (the tracer is one too) and AP-T
  uk303: { ap303: 0.4, inc303: 0.4, ball303: 0.2 },                             // late 1941: half AP, half incendiary
  de792: { ball792: 1 },
  de20ff: { mine20: 0.6, hei20ff: 0.3, ap20: 0.1 },                             // the MG FF/M: mostly Minengeschoss
  fr20: { hei20hs: 0.75, ap20: 0.25 },
  fr75: { ball75: 1 },
  it127: { breda127: 1 },
  mg131: { mg131: 1 },
};

/** The guns: calibre (mm), cyclic rate (rounds a minute, as fired through the propeller or from the wing), a long burst's worth of the rounds a gun carries. */
export const GUNS = {
  m2: { name: 'Browning M2', cal: 12.7, rpm: 800, v0: 890 },
  b303: { name: 'Browning .303', cal: 7.7, rpm: 1150, v0: 740 },
  t97: { name: 'Type 97 (7,7 mm)', cal: 7.7, rpm: 700, v0: 745 },
  t99: { name: 'Type 99 Mk 1 (20 mm)', cal: 20, rpm: 520, v0: 600 },
  mg17: { name: 'MG 17 (7,92 mm)', cal: 7.92, rpm: 1000, v0: 785 },
  mgff: { name: 'MG FF/M (20 mm)', cal: 20, rpm: 540, v0: 585 },
  hs404: { name: 'Hispano HS.404 (20 mm)', cal: 20, rpm: 650, v0: 860 },
  mac: { name: 'MAC 1934 (7,5 mm)', cal: 7.5, rpm: 1200, v0: 830 },
  breda127: { name: 'Breda-SAFAT (12,7 mm)', cal: 12.7, rpm: 600, v0: 760 },
};

/** The fit of each fighter: the guns, how many, the rounds each carries (a drum of 60 for a 20 mm cannon is 7 s of fire), the belt. */
export const FIGHTER_GUNS = {
  f6f: [{ gun: 'm2', n: 6, rpg: 400, belt: 'us50' }],
  a6m: [{ gun: 't97', n: 2, rpg: 600, belt: 'jp77' }, { gun: 't99', n: 2, rpg: 60, belt: 'jp20' }],
  fulmar: [{ gun: 'b303', n: 8, rpg: 750, belt: 'uk303' }],
  bf109t: [{ gun: 'mg17', n: 2, rpg: 500, belt: 'de792' }, { gun: 'mgff', n: 2, rpg: 60, belt: 'de20ff' }],
  d520: [{ gun: 'hs404', n: 1, rpg: 60, belt: 'fr20' }, { gun: 'mac', n: 4, rpg: 675, belt: 'fr75' }],
  mc202: [{ gun: 'breda127', n: 2, rpg: 370, belt: 'it127' }],
};

/** The guns of a fighter type as a list of groups with their state: { gun, n, cal, rps (rounds a second of the whole group), left (rounds left in each gun), belt }. */
export function armamentOf(typeKey) {
  const fit = FIGHTER_GUNS[typeKey] || FIGHTER_GUNS.f6f;
  return fit.map((g) => ({ gun: g.gun, n: g.n, cal: GUNS[g.gun].cal, rps: GUNS[g.gun].rpm / 60 * g.n, rpg: g.rpg, left: g.rpg, belt: g.belt }));
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
  if (cal >= 19) return nation === 'Japan' ? 'jp20' : nation === 'France' ? 'fr20' : 'de20ff';
  if (cal >= 12.5 && cal < 14) return cal > 12.9 ? 'mg131' : nation === 'Italy' ? 'it127' : 'us50';
  if (nation === 'USA') return 'us30';
  if (nation === 'UK') return 'uk303';
  if (nation === 'Germany') return 'de792';
  if (nation === 'France') return 'fr75';
  return 'jp77';
}
BELTS.us30 = { ball303: 0.6, ap303: 0.4 };         // the .30 of the American gunners: ball and AP, like any rifle calibre
