// Gunnery data: how scattered the fall of shot of each gun is, and what each ship had to lay it on a target (rangefinders, director, computer, radars with their years).
// The simulation reads it in sim/accuracy.js (errors of every shell) and sim/sensors.js (who sees what, how far a gun can be laid). Nothing here balances the nations: a
// navy with a worse gun or no radar has them as the sources give them. Figures marked `estimated` are the author's reading of descriptions, not a published number.
//
// Sources (to confirm, like the other datasets): NavWeaps (16"/50 Mk 7 page: shot-to-shot muzzle velocity spread of +-5-10 ft/s in 1944 and the 1987 trials off Crete,
// pattern 0.64 % and shell-to-shell 0.36 % of a 34,000 yd range; AMP report 79.2R of July 1944 on hit chances against an Iowa-size target: 32.7 % at 10,000 yd, 10.5 % at 20,000 yd,
// 2.7 % at 30,000 yd broadside; Mk 8 radar +-15 yd, spotting 16 in splashes to 35,000 yd), the discussion of the Oto/Ansaldo 381 mm gun (salvo spread of 200-300 m at 20-30 km, 290 m
// mean in the 1939-40 exercises, against 150-230 m for the British 15 in at 22 km, about 180 m for the German 38 cm under 20 km and 180-270 m for the Japanese at Samar), the
// Wikipedia pages of the Richelieu, Littorio, Bismarck, KGV classes and of the radars (Type 284, Mk 3, Mk 8, FuMO 22 / 23, Type 22), the Pacific War Online Encyclopedia,
// and the battles: Denmark Strait 1941 (Bismarck, Prinz Eugen, Prince of Wales: 3-5 % of the rounds hit), Calabria and Matapan 1940-41 (Italian fire at 20-26 km: well under 1 %),
// Guadalcanal 1942 (Washington: 9 of 75 16 in rounds at about 8 km), Surigao Strait 1944 (West Virginia: radar ranging at 22,800 yd, 93 rounds), North Cape 1943.

/**
 * Dispersion of a gun in service, as the standard deviation of the fall of shot of one shell round the mean point of impact of its salvo (all the shells of a salvo
 * share the same fire-control error: that is added apart, see accuracy.js). `sr` in range and `sd` across the line of fire, in % of the range; `sv` the muzzle velocity
 * scatter (1 sigma, %), already part of `sr` (the range error it makes is taken out of it); `split` (% of the range) a deliberate spread between the two halves of a turret.
 * First match wins: `ships` (ids, or the base id of a variant) before the nation and the calibre.
 */
export const GUNS = [
  // ---- USA ----
  { id: 'us_16_50_1991', nation: 'USA', ships: ['missouri_1991'], cal: [400, 420], sr: 0.30, sd: 0.10, sv: 0.06, name: '16"/50 Mk 7, 1980s', note: 'new powder lots and a radar that measures each gun\'s muzzle velocity (1987 trials: shell-to-shell 0.36 % of range)' },
  { id: 'us_16_50', nation: 'USA', cal: [400, 420], sr: 0.38, sd: 0.13, sv: 0.10, name: '16"/50 Mk 7', note: 'v0 spread +-5-10 ft/s of 2,500; the 1987 trials gave 0.36 % shell-to-shell after the powder was remixed' },
  { id: 'us_8_55', nation: 'USA', cal: [195, 210], sr: 0.45, sd: 0.15, sv: 0.12, name: '8"/55 Mk 12', estimated: true },
  { id: 'us_6_47', nation: 'USA', cal: [148, 158], sr: 0.48, sd: 0.16, sv: 0.12, name: '6"/47 Mk 16', estimated: true },
  { id: 'us_5_54', nation: 'USA', ships: ['adams', 'hawaii'], cal: [125, 130], sr: 0.42, sd: 0.15, sv: 0.10, name: '5"/54 Mk 42 / Mk 16', estimated: true },
  { id: 'us_5_38', nation: 'USA', cal: [125, 130], sr: 0.55, sd: 0.18, sv: 0.15, name: '5"/38 Mk 12', note: 'Mk 37 director and Mk 1A computer: the best destroyer gunnery of the war', estimated: true },
  { id: 'us_3', nation: 'USA', cal: [70, 100], sr: 0.60, sd: 0.20, sv: 0.15, name: '3"/50, 3"/70', estimated: true },
  // ---- Japan ----
  { id: 'jp_46_45', nation: 'Japan', cal: [455, 465], sr: 0.45, sd: 0.20, sv: 0.15, name: '46 cm/45 Type 94', note: 'salvo spreads of 180-270 m at 25-31 km at Samar', estimated: true },
  { id: 'jp_20_50', nation: 'Japan', cal: [195, 210], sr: 0.55, sd: 0.22, sv: 0.15, name: '20 cm/50 No. 2 Type 3', estimated: true },
  { id: 'jp_15', nation: 'Japan', cal: [148, 160], sr: 0.55, sd: 0.22, sv: 0.15, name: '15.5 cm/60, 15.2 cm/50', estimated: true },
  { id: 'jp_12_7', nation: 'Japan', cal: [125, 130], sr: 0.65, sd: 0.27, sv: 0.20, name: '12.7 cm/50 Type 3, /40 Type 89', note: 'dual-purpose, no stabilised director: the weakest part of the Japanese gunnery', estimated: true },
  { id: 'jp_12', nation: 'Japan', cal: [115, 124], sr: 0.90, sd: 0.35, sv: 0.25, name: '12 cm/45 (old destroyers)', estimated: true },
  // ---- Germany ----
  { id: 'de_38_52', nation: 'Germany', cal: [375, 385], sr: 0.35, sd: 0.12, sv: 0.08, name: '38 cm SK C/34', note: 'about 180 m of salvo spread under 20 km; Denmark Strait: Hood straddled by the second and hit by the third salvo' },
  { id: 'de_28_52', nation: 'Germany', cal: [280, 285], sr: 0.40, sd: 0.14, sv: 0.10, name: '28 cm SK C/28', note: 'Graf Spee straddled Exeter with her first salvos at 19 km', estimated: true },
  { id: 'de_20_60', nation: 'Germany', cal: [200, 206], sr: 0.45, sd: 0.16, sv: 0.12, name: '20.3 cm SK C/34', estimated: true },
  { id: 'de_15_dd', nation: 'Germany', ships: ['type1936a_mob'], cal: [145, 155], sr: 0.75, sd: 0.30, sv: 0.18, name: '15 cm Tbts KC/36 (destroyers)', note: 'single mount on a small hull', estimated: true },
  { id: 'de_15', nation: 'Germany', cal: [145, 155], sr: 0.55, sd: 0.20, sv: 0.12, name: '15 cm SK C/25, C/28', estimated: true },
  { id: 'de_small', nation: 'Germany', cal: [20, 70], sr: 1.0, sd: 0.40, sv: 0.25, name: '3.7 cm, 2 cm (motor torpedo boat)', estimated: true },
  { id: 'de_10_5', nation: 'Germany', cal: [85, 110], sr: 0.62, sd: 0.22, sv: 0.15, name: '10.5 cm, 8.8 cm', estimated: true },
  // ---- United Kingdom ----
  { id: 'uk_14_45', nation: 'UK', cal: [350, 360], sr: 0.42, sd: 0.15, sv: 0.10, name: '14"/45 Mk VII', note: 'the quadruple turrets\' interlocks cost it more in reliability than in scatter; delay coupling between guns', estimated: true },
  { id: 'uk_8_50', nation: 'UK', cal: [200, 206], sr: 0.50, sd: 0.18, sv: 0.12, name: '8"/50 Mk VIII', estimated: true },
  { id: 'uk_6_50', nation: 'UK', cal: [150, 158], sr: 0.50, sd: 0.18, sv: 0.12, name: '6"/50 Mk XXIII', estimated: true },
  { id: 'uk_5_25', nation: 'UK', cal: [130, 135], sr: 0.70, sd: 0.26, sv: 0.15, name: '5.25"/50 QF Mk I', estimated: true },
  { id: 'uk_4_7', nation: 'UK', cal: [116, 124], sr: 0.85, sd: 0.32, sv: 0.18, name: '4.7" QF Mk XII', estimated: true },
  { id: 'uk_4_5', nation: 'UK', cal: [98, 116], sr: 0.75, sd: 0.28, sv: 0.15, name: '4.5" / 4" QF', estimated: true },
  // ---- France ----
  { id: 'fr_38_45', nation: 'France', cal: [375, 385], sr: 0.60, sd: 0.30, sv: 0.15, split: 0.35, name: '380 mm/45 Mle 1935', note: 'the guns of a half-turret sit close and their shells interfered (a delay coupling came later); the salvo of four is divided into two pairs laid a little apart on purpose', estimated: true },
  { id: 'fr_20_55', nation: 'France', cal: [200, 206], sr: 0.55, sd: 0.22, sv: 0.15, name: '203 mm/55 Mle 1931', estimated: true },
  { id: 'fr_155_old', nation: 'France', ships: ['bearn'], cal: [150, 158], sr: 0.85, sd: 0.32, sv: 0.20, name: '155 mm/50 Mle 1920', note: 'an old gun on a converted hull', estimated: true },
  { id: 'fr_15', nation: 'France', cal: [150, 158], sr: 0.60, sd: 0.24, sv: 0.15, name: '152 mm/55 Mle 1930', estimated: true },
  { id: 'fr_138', nation: 'France', cal: [135, 142], sr: 0.85, sd: 0.32, sv: 0.18, name: '138.6 mm/50 Mle 1929', estimated: true },
  { id: 'fr_10', nation: 'France', cal: [70, 110], sr: 0.80, sd: 0.30, sv: 0.18, name: '100 mm, 90 mm, 75 mm', estimated: true },
  // ---- Italy ----
  { id: 'it_381_50', nation: 'Italy', cal: [378, 385], sr: 0.55, sd: 0.28, sv: 0.25, name: '381 mm/50 Oto-Ansaldo 1934', note: 'salvo spread of 200-300 m at 20-30 km (290 m mean in the 1939-40 exercises): shells of a salvo interfered (barrels close together) and the shell weights varied more than elsewhere' },
  { id: 'it_203_53', nation: 'Italy', cal: [200, 206], sr: 0.70, sd: 0.30, sv: 0.22, name: '203 mm/53 Mod. 1927-29', note: 'the Zara-class guns were known for their dispersion', estimated: true },
  { id: 'it_152', nation: 'Italy', cal: [150, 158], sr: 0.62, sd: 0.26, sv: 0.20, name: '152 mm/53, /55', estimated: true },
  { id: 'it_12', nation: 'Italy', cal: [118, 137], sr: 0.85, sd: 0.34, sv: 0.22, name: '120 mm/50, 135 mm/45', estimated: true },
  { id: 'it_10', nation: 'Italy', cal: [70, 110], sr: 0.80, sd: 0.30, sv: 0.20, name: '100 mm, 90 mm', estimated: true },
];

/** The dispersion entry of a gun: by ship, then by nation and calibre; a guess from the calibre if the table has none. */
export function gunProfile(nation, cal, ids) {
  let hit = null;
  for (const g of GUNS) {
    if (g.nation !== nation || cal < g.cal[0] || cal > g.cal[1]) continue;
    if (g.ships) { if (ids && [].concat(ids).some((i) => g.ships.includes(i))) return g; continue; }
    if (!hit) hit = g;
  }
  if (hit) return hit;
  const k = 0.4 + 0.5 * (1 - Math.min(1, cal / 406));
  return { id: 'generic', nation, cal: [cal, cal], sr: k, sd: k * 0.37, sv: 0.15, name: 'generic ' + cal + ' mm', estimated: true };
}

// ---- radars ---------------------------------------------------------------------------------------------------------------------------------------------------
// `surf`: the range (m) at which the set picks up a ship of the class, in the order BB, CV, CA, CL, DD (always cut by the radar horizon); `air`: a large aircraft
// (others scale with the 4th root of their echo); `err`: the standard deviation of a range reading (m); `fc`: used to lay guns; `splash`: the range (m) up to which it
// sees the splashes of the guns it ranges for (0: cannot, the ranging in is done by eye); `year`.
const S = (bb, cv, ca, cl, dd) => ({ BB: bb, CV: cv, CA: ca, CL: cl, DD: dd });
export const RADARS = {
  // USA
  sc: { name: 'SC / SC-2', year: 1941, surf: S(22000, 22000, 18000, 15000, 10000), air: 120000, err: 120 },
  sk: { name: 'SK / SK-2', year: 1941, surf: S(28000, 28000, 24000, 20000, 14000), air: 160000, err: 100 },
  sg: { name: 'SG', year: 1942, surf: S(36000, 36000, 32000, 28000, 20000), air: 25000, err: 60 },
  mk3: { name: 'Mk 3', year: 1941, surf: S(24000, 24000, 20000, 17000, 12000), air: 0, err: 23, fc: true, splash: 20000 },
  mk4: { name: 'Mk 4', year: 1942, surf: S(24000, 24000, 20000, 17000, 12000), air: 0, err: 23, fc: true, splash: 15000 },
  mk8: { name: 'Mk 8', year: 1943, surf: S(36000, 36000, 32000, 28000, 20000), air: 0, err: 14, fc: true, splash: 32000 },
  mk13: { name: 'Mk 13', year: 1944, surf: S(34000, 34000, 30000, 26000, 18000), air: 0, err: 18, fc: true, splash: 28000 },
  mk12: { name: 'Mk 12 / Mk 22', year: 1944, surf: S(30000, 30000, 26000, 22000, 16000), air: 0, err: 18, fc: true, splash: 16000 },
  sps10: { name: 'SPS-10', year: 1960, surf: S(40000, 40000, 38000, 34000, 26000), air: 60000, err: 40 },
  sps39: { name: 'SPS-39', year: 1960, surf: S(0, 0, 0, 0, 0), air: 200000, err: 200 },
  spg53: { name: 'SPG-53 (Mk 68)', year: 1960, surf: S(50000, 50000, 45000, 40000, 30000), air: 0, err: 6, fc: true, splash: 25000 },
  sps49: { name: 'SPS-49', year: 1980, surf: S(0, 0, 0, 0, 0), air: 320000, err: 200 },
  sps67: { name: 'SPS-67', year: 1980, surf: S(50000, 50000, 46000, 40000, 30000), air: 0, err: 30 },
  // Japan (poor sets: Yamato's Type 22 Mod 4 of 1944 was the only one meant for gunnery)
  t21: { name: 'Type 21', year: 1942, surf: S(20000, 20000, 16000, 12000, 8000), air: 100000, err: 150 },
  t22: { name: 'Type 22', year: 1943, surf: S(30000, 30000, 24000, 18000, 12000), air: 0, err: 120, fc: true, splash: 0 },
  t13: { name: 'Type 13', year: 1944, surf: S(0, 0, 0, 0, 0), air: 100000, err: 200 },
  // Germany (Seetakt sets: ranging for the guns, not for spotting splashes)
  fumo21: { name: 'FuMO 21', year: 1940, surf: S(12000, 12000, 10000, 8000, 5000), air: 12000, err: 80, fc: true, splash: 0, estimated: true },
  fumo22: { name: 'FuMO 22', year: 1939, surf: S(14000, 14000, 12000, 10000, 7000), air: 15000, err: 70, fc: true, splash: 0, estimated: true },
  fumo23: { name: 'FuMO 23', year: 1941, surf: S(22000, 22000, 18000, 15000, 10000), air: 20000, err: 50, fc: true, splash: 0, estimated: true },
  fumo24: { name: 'FuMO 24 / 25', year: 1941, surf: S(14000, 14000, 12000, 10000, 7000), air: 15000, err: 70, fc: true, splash: 0, estimated: true },
  fumo27: { name: 'FuMO 27', year: 1941, surf: S(24000, 24000, 20000, 16000, 11000), air: 25000, err: 40, fc: true, splash: 0, estimated: true },
  fumo26: { name: 'FuMO 26', year: 1943, surf: S(28000, 28000, 24000, 19000, 13000), air: 30000, err: 30, fc: true, splash: 0, estimated: true },
  // United Kingdom
  t79: { name: 'Type 79', year: 1940, surf: S(0, 0, 0, 0, 0), air: 100000, err: 300 },
  t273: { name: 'Type 273', year: 1941, surf: S(26000, 26000, 22000, 19000, 12000), air: 40000, err: 40 },
  t281: { name: 'Type 281', year: 1942, surf: S(0, 0, 0, 0, 0), air: 100000, err: 100 },
  t284: { name: 'Type 284', year: 1941, surf: S(22000, 22000, 18000, 15000, 10000), air: 0, err: 27, fc: true, splash: 15000 },
  // France (American sets fitted in 1943: search only)
  sf: { name: 'SF', year: 1943, surf: S(24000, 24000, 20000, 16000, 11000), air: 20000, err: 60 },
  sa2: { name: 'SA-2', year: 1943, surf: S(0, 0, 0, 0, 0), air: 120000, err: 150 },
};

// ---- fire-control systems --------------------------------------------------------------------------------------------------------------------------------------
// rf: [base (m) of the optical rangefinder, 'stereo' | 'coinc'] (the error of a ranging is range^2 x acuity / base: 5 microradians for a stereoscopic one, 9 for a
// coincidence one, battle conditions (haze, smoke, vibration) and a few readings averaged); radar: the set that ranges for these guns; stab: how well the director holds the line of sight while the ship turns
// and rolls (1: gyro-stabilised, US); tau: seconds the computer takes to find the target's course and speed (the rate keeping, it also lags behind a target that turns);
// rate: the error of the first estimate of the target's velocity (m/s); bal: the error of the ballistic corrections (wind, powder temperature, wear), % of the range;
// lock: seconds from the first sight of a target to the first salvo; gain: how much of an observed miss is corrected at once.
export const SYSTEMS = {
  generic: { name: 'optical director, 6 m rangefinder', rf: [6, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.25, lock: 22, gain: 0.6, estimated: ['all'] },
  us_bb: { name: 'Mk 38 director, Ford Mk 8 Rangekeeper, Mk 8 radar', rf: [13.7, 'stereo'], radar: 'mk8', stab: 1, tau: 20, rate: 0.6, bal: 0.12, lock: 15, gain: 0.8, estimated: ['rf'] },
  us_bb_1991: { name: 'Mk 38 director, Mk 160 computer, radar-measured muzzle velocity', rf: [13.7, 'stereo'], radar: 'spg53', stab: 1, tau: 8, rate: 0.3, bal: 0.06, lock: 8, gain: 0.9 },
  us_ca: { name: 'Mk 34 director, Mk 8 Rangekeeper, Mk 8 / Mk 13 radar', rf: [8, 'stereo'], radar: 'mk13', stab: 1, tau: 22, rate: 0.7, bal: 0.14, lock: 16, gain: 0.8, estimated: ['rf'] },
  us_cl: { name: 'Mk 34 director, Mk 8 Rangekeeper, Mk 3 radar', rf: [6, 'stereo'], radar: 'mk3', stab: 1, tau: 24, rate: 0.8, bal: 0.15, lock: 18, gain: 0.75, estimated: ['rf'] },
  us_dd: { name: 'Mk 37 director, Mk 1A computer, Mk 12 / Mk 22 radar', rf: [4.6, 'stereo'], radar: 'mk12', stab: 1, tau: 16, rate: 0.8, bal: 0.15, lock: 12, gain: 0.75 },
  us_cv_1942: { name: 'Mk 33 directors, Mk 1 computer, optical rangefinder (no gunnery radar yet)', rf: [4, 'stereo'], radar: null, stab: 0.9, tau: 20, rate: 0.9, bal: 0.16, lock: 14, gain: 0.7, estimated: ['rf', 'tau', 'rate', 'bal'] },
  us_mod: { name: 'Mk 68 GFCS, SPG-53 radar', rf: null, radar: 'spg53', stab: 1, tau: 6, rate: 0.3, bal: 0.08, lock: 6, gain: 0.9 },
  jp_bb: { name: 'Type 98 director, Type 98 computer, 15 m rangefinder, Type 22 Mod 4 radar', rf: [15, 'stereo'], radar: 't22', stab: 0.7, tau: 28, rate: 1.0, bal: 0.22, lock: 30, gain: 0.6, estimated: ['stab', 'tau'] },
  jp_ca: { name: 'Type 94 director, Type 92 computer, 10 m rangefinder', rf: [10, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.25, lock: 28, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  jp_cl: { name: 'Type 94 director, 8 m rangefinder', rf: [8, 'stereo'], radar: null, stab: 0.55, tau: 32, rate: 1.2, bal: 0.28, lock: 26, gain: 0.55, estimated: ['rf', 'stab', 'tau'] },
  jp_dd: { name: 'Type 94 director, 4.5 m rangefinder', rf: [4.5, 'stereo'], radar: null, stab: 0.5, tau: 36, rate: 1.5, bal: 0.30, lock: 22, gain: 0.55, estimated: ['rf', 'stab', 'tau'] },
  jp_old: { name: 'local control, 3 m rangefinder', rf: [3, 'coinc'], radar: null, stab: 0.3, tau: 60, rate: 2.5, bal: 0.40, lock: 25, gain: 0.5, estimated: ['rf', 'stab', 'tau'] },
  de_bb: { name: 'Kommandogerat, Rechengerat, Zeiss 10.5 m stereoscopic rangefinders, FuMO 23', rf: [10.5, 'stereo'], radar: 'fumo23', stab: 0.85, tau: 20, rate: 0.8, bal: 0.15, lock: 15, gain: 0.75, estimated: ['stab', 'tau'] },
  de_bb_1944: { name: 'Kommandogerat, Rechengerat, 10.5 m rangefinders, FuMO 26', rf: [10.5, 'stereo'], radar: 'fumo26', stab: 0.85, tau: 20, rate: 0.8, bal: 0.15, lock: 15, gain: 0.75, estimated: ['stab', 'tau'] },
  de_ca: { name: 'Kommandogerat, 7 m stereoscopic rangefinders, FuMO 27', rf: [7, 'stereo'], radar: 'fumo27', stab: 0.8, tau: 22, rate: 0.9, bal: 0.18, lock: 18, gain: 0.7, estimated: ['rf', 'stab', 'tau'] },
  de_spee: { name: 'Kommandogerat, 10.5 m rangefinder, FuMO 22', rf: [10.5, 'stereo'], radar: 'fumo22', stab: 0.8, tau: 24, rate: 0.9, bal: 0.18, lock: 18, gain: 0.7, estimated: ['stab', 'tau'] },
  de_cl: { name: 'Kommandogerat, 6 m rangefinder, FuMO 21', rf: [6, 'stereo'], radar: 'fumo21', stab: 0.7, tau: 28, rate: 1.0, bal: 0.22, lock: 20, gain: 0.65, estimated: ['rf', 'stab', 'tau'] },
  de_dd: { name: 'director, 4 m rangefinder, FuMO 24 / 25', rf: [4, 'stereo'], radar: 'fumo24', stab: 0.6, tau: 32, rate: 1.3, bal: 0.28, lock: 18, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  de_aa: { name: 'AA director, 3 m rangefinder', rf: [3, 'stereo'], radar: null, stab: 0.6, tau: 32, rate: 1.3, bal: 0.28, lock: 18, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  uk_bb: { name: 'DCT, Admiralty Fire Control Table, 9 m coincidence rangefinders, Type 284 radar', rf: [9.1, 'coinc'], radar: 't284', stab: 0.75, tau: 28, rate: 0.9, bal: 0.20, lock: 22, gain: 0.7, estimated: ['rf', 'stab', 'tau'] },
  uk_ca: { name: 'DCT, Admiralty Fire Control Table, 4.6 m rangefinder, Type 284 radar', rf: [4.6, 'coinc'], radar: 't284', stab: 0.75, tau: 28, rate: 1.0, bal: 0.22, lock: 22, gain: 0.7, estimated: ['rf', 'stab', 'tau'] },
  uk_cl: { name: 'DCT, Admiralty Fire Control Table, 4.6 m rangefinder, Type 284 radar', rf: [4.6, 'coinc'], radar: 't284', stab: 0.75, tau: 26, rate: 1.0, bal: 0.22, lock: 20, gain: 0.7, estimated: ['rf', 'stab', 'tau'] },
  uk_dd: { name: 'Fire control director, 3.7 m rangefinder, no gunnery radar', rf: [3.7, 'coinc'], radar: null, stab: 0.5, tau: 40, rate: 1.5, bal: 0.30, lock: 20, gain: 0.55, estimated: ['rf', 'stab', 'tau'] },
  fr_bb: { name: 'director, 14 m rangefinders, SF radar (search only)', rf: [14, 'stereo'], radar: null, stab: 0.7, tau: 28, rate: 1.0, bal: 0.22, lock: 28, gain: 0.65, estimated: ['rf', 'stab', 'tau'] },
  fr_ca: { name: 'director, 8 m rangefinders', rf: [8, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.25, lock: 26, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  fr_cl: { name: 'director, 8 m rangefinders', rf: [8, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.25, lock: 26, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  fr_dd: { name: 'director, 3 m rangefinder', rf: [3, 'stereo'], radar: null, stab: 0.5, tau: 40, rate: 1.5, bal: 0.30, lock: 20, gain: 0.55, estimated: ['rf', 'stab', 'tau'] },
  fr_old: { name: 'local control, 4 m rangefinder', rf: [4, 'coinc'], radar: null, stab: 0.3, tau: 55, rate: 2.2, bal: 0.38, lock: 28, gain: 0.5, estimated: ['rf', 'stab', 'tau'] },
  it_bb: { name: 'Galileo directors, fire-control computer, 12 m rangefinders (no radar)', rf: [12, 'stereo'], radar: null, stab: 0.7, tau: 28, rate: 1.0, bal: 0.22, lock: 25, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  it_ca: { name: 'Galileo director, 8 m rangefinder (no radar)', rf: [8, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.26, lock: 26, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  it_cl: { name: 'Galileo director, 7 m rangefinder (no radar)', rf: [7, 'stereo'], radar: null, stab: 0.6, tau: 30, rate: 1.1, bal: 0.26, lock: 24, gain: 0.6, estimated: ['rf', 'stab', 'tau'] },
  it_dd: { name: 'director, 3 m rangefinder (no radar)', rf: [3, 'stereo'], radar: null, stab: 0.5, tau: 38, rate: 1.5, bal: 0.30, lock: 20, gain: 0.55, estimated: ['rf', 'stab', 'tau'] },
};

// The fit of each ship: `main` and `sec` the systems of the two batteries, `radars` the sets carried (search and air-warning; the gunnery set of a system is added to them),
// `float`: a catapult aircraft that can spot (none flies in the simulation yet). Years are those of the ship's sheet. Ids of variants fall back to their base ship.
export const FIT = {
  // USA
  fletcher: { main: 'us_dd', sec: 'us_dd', radars: ['sg', 'sc'] },
  cleveland: { main: 'us_cl', sec: 'us_dd', radars: ['sg', 'sk'] },
  baltimore: { main: 'us_ca', sec: 'us_dd', radars: ['sg', 'sk'] },
  iowa: { main: 'us_bb', sec: 'us_dd', radars: ['sg', 'sk'], float: true },
  essex: { main: 'us_dd', sec: 'us_dd', radars: ['sg', 'sk'] },
  enterprise: { main: 'us_cv_1942', sec: 'us_cv_1942', radars: ['sc'] },      // the CXAM / SC air-search set of 1942
  adams: { main: 'us_mod', sec: 'us_mod', radars: ['sps10', 'sps39'] },
  hawaii: { main: 'us_bb', sec: 'us_dd', radars: ['sg', 'sk'] },
  missouri_1991: { main: 'us_bb_1991', sec: 'us_dd', radars: ['sps67', 'sps49'] },
  // Japan
  kagero: { main: 'jp_dd', sec: 'jp_dd', radars: [] },
  kagero_1944: { main: 'jp_dd', sec: 'jp_dd', radars: ['t22', 't13'] },
  agano: { main: 'jp_cl', sec: 'jp_cl', radars: ['t22', 't13'] },
  takao: { main: 'jp_ca', sec: 'jp_cl', radars: ['t21', 't13'] },
  yamato: { main: 'jp_bb', sec: 'jp_cl', radars: ['t21', 't13'], float: true },
  shokaku: { main: 'jp_dd', sec: 'jp_dd', radars: ['t21'] },
  shokaku_1944: { main: 'jp_dd', sec: 'jp_dd', radars: ['t21', 't13'] },
  tade: { main: 'jp_old', sec: 'jp_old', radars: [] },
  tade_pb39: { main: 'jp_old', sec: 'jp_old', radars: [] },
  // United Kingdom
  tribal: { main: 'uk_dd', sec: 'uk_dd', radars: [] },
  belfast: { main: 'uk_cl', sec: 'uk_dd', radars: ['t273', 't281'] },
  norfolk: { main: 'uk_ca', sec: 'uk_dd', radars: ['t273', 't281'] },
  kgv: { main: 'uk_bb', sec: 'uk_dd', radars: ['t273', 't281'], float: true },
  illustrious: { main: 'uk_dd', sec: 'uk_dd', radars: ['t79'] },
  // Germany
  type1936a_mob: { main: 'de_dd', sec: 'de_dd', radars: [] },
  koenigsberg: { main: 'de_cl', sec: 'de_aa', radars: [] },
  admiral_hipper: { main: 'de_ca', sec: 'de_aa', radars: [], float: true },
  bismarck: { main: 'de_bb', sec: 'de_aa', radars: [], float: true },
  tirpitz: { main: 'de_bb_1944', sec: 'de_aa', radars: [], float: true },
  graf_spee: { main: 'de_spee', sec: 'de_aa', radars: [], float: true },
  graf_zeppelin: { main: 'de_aa', sec: 'de_aa', radars: [] },
  s30: { main: 'de_aa', sec: 'de_aa', radars: [] },
  // France (Richelieu: the American search sets of the New York refit of 1943)
  fantasque: { main: 'fr_dd', sec: 'fr_dd', radars: ['sf'] },
  la_galissoniere: { main: 'fr_cl', sec: 'fr_dd', radars: [] },
  algerie: { main: 'fr_ca', sec: 'fr_dd', radars: [] },
  richelieu: { main: 'fr_bb', sec: 'fr_dd', radars: ['sf', 'sa2'], float: true },
  bearn: { main: 'fr_old', sec: 'fr_old', radars: [] },
  // Italy (the Gufo radar came in 1943 and is not part of these fits)
  soldati: { main: 'it_dd', sec: 'it_dd', radars: [] },
  gioberti: { main: 'it_dd', sec: 'it_dd', radars: [] },
  montecuccoli: { main: 'it_cl', sec: 'it_dd', radars: [] },
  zara: { main: 'it_ca', sec: 'it_dd', radars: [] },
  littorio: { main: 'it_bb', sec: 'it_cl', radars: [], float: true },
  aquila: { main: 'it_dd', sec: 'it_dd', radars: [] },
};
// a ship with no entry (a new sheet) gets an average optical system until its fit is written
const GENERIC = { main: 'generic', sec: 'generic', radars: [] };

/** The fit of a ship from her sheet (a variant without its own entry takes the base ship's). */
export function fitOf(spec) {
  return FIT[spec.id] || FIT[spec.baseId] || GENERIC;
}
