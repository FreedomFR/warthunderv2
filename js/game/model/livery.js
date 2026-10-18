// Ship liveries: camouflage patterns, palettes and the hull number / ensign data used by the ship shader.
//
// The pattern geometry lives in the shader (js/wgsl/ship.js); this file is the single source of truth for the
// palettes (the shader copy is generated from PALETTES) and decides which ship wears what, following the
// paint notes of the spec sheets (Measure 22 graded, Admiralty disruptive, Regia Marina dazzle...).

/** Camouflage pattern ids understood by the shader. */
export const CAMO = { NONE: 0, DAZZLE: 1, ADMIRALTY: 2, SUNBURST: 3, SPLOTCH: 4 };

/** Nation ids (ensign / hull-number style). 0 = none. */
export const NATION_ID = { USA: 1, Japan: 2, UK: 3, Germany: 4, France: 5, Italy: 6 };

// Three colours per palette, as sRGB hex: [dark, medium, light]
export const PALETTES = [
  /* 0 */ ['#2c3846', '#46586a', '#8d9aa4'],      // US Measure 32 (navy blue / ocean grey / haze grey)
  /* 1 */ ['#3a4a57', '#6d7b86', '#a3aeb5'],      // Admiralty disruptive (dark / medium / light blue-greys)
  /* 2 */ ['#5d6468', '#838b8f', '#adb4b7'],      // Regia Marina greys
  /* 3 */ ['#4d5550', '#6b7173', '#8d9396'],      // IJN / KM disruptive greys
];

/**
 * Livery per ship id: { scheme, pal, seed }. Ships not listed here are painted in the plain colours of their spec sheet.
 * Choices follow the documented schemes: Measure 32 dazzle on some US cruisers, Admiralty disruptive on Home Fleet ships,
 * Regia Marina 1941-42 dazzle and the 1942 "sunburst" of the Littorio class.
 */
export const LIVERY = {
  cleveland: { scheme: CAMO.DAZZLE, pal: 0, seed: 0.21 },
  iowa: { scheme: CAMO.DAZZLE, pal: 0, seed: 0.52 },          // Measure 32 design 1B, 1944 (photograph in dry dock)
  essex: { scheme: CAMO.DAZZLE, pal: 0, seed: 0.83 },         // Measure 32/33 dazzle of 1944 (photograph leaving San Francisco)
  tribal: { scheme: CAMO.ADMIRALTY, pal: 1, seed: 0.62 },
  belfast: { scheme: CAMO.ADMIRALTY, pal: 1, seed: 0.13 },
  kgv: { scheme: CAMO.ADMIRALTY, pal: 1, seed: 0.77 },
  soldati: { scheme: CAMO.DAZZLE, pal: 2, seed: 0.35 },
  montecuccoli: { scheme: CAMO.DAZZLE, pal: 2, seed: 0.58 },
  zara: { scheme: CAMO.DAZZLE, pal: 2, seed: 0.91 },
  littorio: { scheme: CAMO.SUNBURST, pal: 2, seed: 0.44 },
  kagero: { scheme: CAMO.SPLOTCH, pal: 3, seed: 0.28 },       // Yukikaze wore a disruptive scheme in 1945
};

/** Hull number carried on the bow ("61", "F03"...), taken from the reference ship of the spec: "USS Iowa (BB-61)". */
export function hullNumber(spec) {
  const m = /\(([A-Z]{0,3})[- ]?(\d{1,3})\)/.exec(spec.refShip || '');
  if (!m) return null;
  if (spec.nation === 'USA') return m[2];
  if (spec.nation === 'UK') return m[1] ? m[1] + ' ' + m[2] : m[2];
  return null;
}

/** [r,g,b] 0..255 -> '#rrggbb' */
export function hex(c) { return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }

/** The paint vector uploaded per ship instance: x scheme, y seed, z nation id, w palette. */
export function paintOf(spec) {
  const lv = LIVERY[spec.id];
  return [lv ? lv.scheme : 0, lv ? lv.seed : 0, NATION_ID[spec.nation] || 0, lv ? lv.pal : 0];
}
