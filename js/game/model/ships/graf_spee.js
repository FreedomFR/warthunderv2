// graf_spee: the tweaks of the Admiral Graf Spee model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// Everything above the hull is drawn here in metres (x along the ship, bow +; y over the waterline; z to starboard); the turrets, the 15 cm and 10.5 cm mounts, the light AA,
// the catapult, the screws and the rudder are the builder's, placed from the spec sheet.
import { kit, cutter } from './kit.js';

const D = 5.3;                                                      // the main deck over the waterline (plating; the rails stand a metre above it), up to the quarter deck step
const R = 7.9;                                                      // the roof of the long deckhouses

/** Interpolate a table of [y, value] at y. */
function at(tab, y) {
  if (y <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) { const [y0, v0] = tab[i - 1], [y1, v1] = tab[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); }
  return tab[tab.length - 1][1];
}

function grafSpeeExtras({ b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, DT, note }) {
  const sup = rgb(pal.sup), dark = rgb(pal.dark), deckc = rgb(pal.deck), mastc = rgb(pal.mast), func = rgb(pal.funnel), capc = rgb(pal.cap), glass = rgb(pal.glass), grey = rgb('#8d9296');
  const { half, wall, ring } = kit(b, { MAT, rgb, shade });
  const K = { MAT, rgb, shade };

  // ---- the long deckhouses: the forward block (bridge, funnel, boats) and the after block (hangar under the catapult) ----
  b.prism(half([[-1.16, 5.0], [11.87, 5.0], [11.87, 3.39], [23.95, 3.39], [23.95, 4.92], [28.93, 4.92], [29.43, 3.65], [39.25, 3.65], [42.03, 1.96]]), D, R, shade(sup, 0.96), MAT.HULL);
  b.prism(half([[35.79, 2.26], [35.79, 3.66], [38.19, 4.17], [42.03, 1.95]]), R, 10.0, shade(sup, 0.98), MAT.HULL);                                   // the forward bridge house
  b.prism(half([[25.8, 2.25], [27.3, 2.25], [27.8, 1.7], [30.4, 1.77], [30.5, 0]]), R, 10.0, shade(sup, 1.0), MAT.HULL);                                   // the block in front of the tower
  b.prism(half([[-32.45, 2.35], [-26.74, 5.9], [-16.72, 5.9], [-15.2, 4.05], [-8.69, 4.05]]), D, R + 0.2, shade(sup, 0.94), MAT.HULL);
  for (const sg of [-1, 1]) {
    b.prism([[5.4, sg * 7.5], [11.9, sg * 7.5], [11.9, sg * 10.67], [5.4, sg * 10.67]], D - 0.2, 8.0, shade(sup, 0.9), MAT.HULL);       // the platforms of the 10.5 cm twins
    b.prism([[11.9, sg * 3.4], [14.4, sg * 3.4], [14.4, sg * 5.0], [11.9, sg * 5.0]], R, R + 0.15, shade(deckc, 0.9), MAT.HULL);
  }

  // the quarter deck houses, flush with the main deck (the deck steps down abaft them), the hatch coamings of the forecastle
  for (const sg of [-1, 1]) {
    b.prism([[-63.1, sg * 4.5], [-48.5, sg * 4.5], [-48.5, sg * 7.9], [-63.1, sg * 7.9]], 3.9, D, shade(sup, 0.92), MAT.HULL);
    b.prism([[63.4, sg * 1.3], [82.0, sg * 1.3], [82.0, sg * 3.7], [63.4, sg * 3.7]], 5.4, 6.55, shade(sup, 0.9), MAT.HULL, { topScale: 0.96 });
  }
  b.prism(half([[-58.9, 5.3], [-54.3, 5.3]]), 3.9, D + 0.1, shade(sup, 0.92), MAT.HULL);

  // the wings of the tower: the platforms with the rangefinders and the 3 m AA rangefinders on each side
  const wing = [[22.2, 3.0], [22.3, 5.8], [23.1, 7.05], [25.0, 7.05], [25.9, 5.5], [25.85, 3.0]];
  for (const sg of [-1, 1]) {
    b.prism(wing.map(([x, z]) => [x, sg * z]), 10.2, 10.5, shade(sup, 0.88), MAT.HULL);
    b.box(23.95, 10.55, sg * 5.65, 3.1, 1.9, 1.1, shade(sup, 1.0), MAT.HULL);                                                    // the rangefinder housing
    b.prism([[22.2, sg * 2.2], [25.8, sg * 2.2], [25.8, sg * 4.8], [24.9, sg * 4.8], [22.2, sg * 3.4]], 14.0, 14.3, shade(sup, 0.9), MAT.HULL);
    b.box(2.8, 13.4, sg * 4.35, 2.4, 2.2, 1.4, shade(sup, 1.0), MAT.HULL);                                                        // the AA directors by the funnel
    b.box(-20.1, 12.5, sg * 5.5, 2.4, 3.5, 1.2, shade(sup, 0.98), MAT.HULL);                                                      // and the after ones
  }
  b.box(28.8, 12.4, 0, 2.3, 2.2, 3.9, shade(sup, 0.98), MAT.HULL);                                                                // the forward rangefinder abaft the conning tower
  b.box(35.4, 11.65, 0, 1.0, 0.7, 7.2, shade(dark, 1.3), MAT.HULL);                                                               // the yard in front of the conning tower

  // ---- the tower: a tall tapered shaft on a wide base, a platform with the main rangefinder and a small cabin on top ----
  const HW = [[8.5, 3.25], [10.5, 2.95], [12.5, 2.7], [13.5, 2.45], [15, 2.19], [16.5, 1.93], [18, 1.7], [19.5, 1.44], [21, 1.19], [22.5, 0.93]];
  part('bridge', 'bridge', 'Tour de direction de tir', () => {
    for (let y = R; y < 22.5; y += 0.75) { const w = at(HW, y); b.prism(half([[20.85, w * 0.78], [21.5, w], [25.1, w], [25.8, w * 0.78]]), y, Math.min(22.5, y + 0.75), shade(sup, y < 13.5 ? 0.97 : 1.02), MAT.HULL); }
    b.prism(half([[19.5, 0], [19.9, 1.0], [22.2, 3.25], [24.6, 3.25], [27.2, 1.0], [27.5, 0]]), 23.2, 24.2, shade(sup, 0.92), MAT.HULL);                   // the platform
    b.cyl(23.45, 24.2, 0, 3.25, 1.09, 3.25, 1.09, 26.2, shade(sup, 1.02), MAT.HULL, { seg: 22 });                                                            // the rangefinder housing
    b.cyl(23.55, 26.2, 0, 1.15, 1.0, 1.1, 0.95, 30.6, shade(sup, 1.0), MAT.HULL, { seg: 16 });
    for (const sg of [-1, 1]) b.box(23.45, 25.1, sg * 3.35, 0.9, 0.7, 0.7, shade(dark, 1.3), MAT.DARK);
  }, () => b.prism(half([[20.85, 2.0], [25.8, 2.0]]), D, 14.0, shade(dark, 1.15), MAT.DARK));
  b.group('fine', () => {
    for (let y = 9; y < 22; y += 1.7) for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) { const x0 = 21.1 + k * 1.1; wall([x0, sg * (at(HW, y) + 0.02)], [x0 + 0.6, sg * (at(HW, y) + 0.02)], y + 0.35, y + 0.85, 0.04, shade(glass, 0.8)); }
    ring(23.45, 0, 3.0, 24.2, 0.9, grey, 18);
    DT.ladder(b, 25.85, R, 23.2, 0.0, grey);
    PT.searchlight(b, 22.0, 24.2, 3.0, 0.45, pal); PT.searchlight(b, 22.0, 24.2, -3.0, 0.45, pal);
  });
  // the armoured conning tower in front of the foot of the tower, and the forward bridge deck
  part('conning', 'bridge', 'Blockhaus', () => {
    b.prism(half([[33.05, 0], [33.58, 2.53], [34.67, 2.53], [37.37, 1.66], [38.56, 0.53], [38.67, 0]]), R, 11.5, shade(sup, 0.88), MAT.HULL);
    b.prism(half([[33.1, 0], [33.6, 2.6], [34.7, 2.6], [37.4, 1.75], [38.6, 0.6], [38.7, 0]]), 11.5, 11.75, shade(sup, 0.8), MAT.HULL);
    for (let i = -3; i <= 3; i++) { const a = i * 0.34; b.box(36.0 + Math.cos(a) * 2.4, 10.0, Math.sin(a) * 2.2, 0.1, 0.25, 0.8, glass, MAT.GLASS); }
  }, () => b.prism(half([[33.05, 0], [33.6, 2.2], [38.5, 0.4]]), R, 9.5, shade(dark, 1.1), MAT.DARK));
  model.bridge = { x: 34.5, y: 11.4, z: 0, towerX: 23.3, cands: [[36.0, 12.2, 0], [38.2, 12.0, 0.8], [38.2, 12.0, -0.8], [23.45, 26.3, 0]] };
  model.superBox = { x0: 16.4, x1: 42.0, hw: 4.9, y1: 24.3 };

  // ---- the funnel: one big hexagonal stack abaft the tower, with its cap, the platform of 2 cm guns round its foot and the searchlights ----
  const fp = [[8.67, 0], [8.18, 1.34], [6.79, 2.02], [3.51, 1.92], [2.63, 1.34], [2.13, 0]];
  part('funnel0', 'funnel', 'Cheminée', () => {
    b.prism(half(fp), R, 20.5, func, MAT.HULL);
    b.prism(half(fp.map(([x, w]) => [x + (x > 5.4 ? 0.12 : -0.12), w ? w + 0.12 : 0])), 20.5, 20.85, shade(func, 0.9), MAT.HULL);
    b.prism(half(fp.map(([x, w]) => [x + (x > 5.4 ? 0.05 : -0.05), w ? w * 0.9 : 0])), 20.85, 21.0, capc, MAT.DARK);
    b.prism(half([[1.7, 0], [2.0, 3.2], [5.4, 3.7], [8.9, 3.2], [9.6, 0]]), 16.4, 16.7, shade(sup, 0.95), MAT.HULL);                                      // the platform
  }, () => PT.funnelRuin(b, { x: 5.4, y0: R, h: 9, lx: 6.5, lz: 4, topLx: 6, topLz: 3.6, rake: 0, cap: 0.4, pipes: false, trunk: true }, pal));
  model.smoke.push([5.4, 21.0, 0]);
  b.group('fine', () => { ring(5.4, 0, 3.2, 16.7, 0.9, grey, 22); DT.ladder(b, 8.75, R, 20.4, 0.0, grey); PT.searchlight(b, 0.4, 17.9, 0.0, 0.45, pal); PT.searchlight(b, 9.4, 17.9, 0.0, 0.45, pal); });

  // ---- the masts: a pole in front of the funnel and one on its after side, their yards and stays ----
  part('mast0', 'mast', 'Mât avant', () => {
    PT.poleMast(b, { x: 17.6, y0: R, h: 24.0, r: 0.15, yards: [[0.72, 4.2], [0.9, 2.6]] }, pal);
  }, () => b.cylinder(17.6, R, 0, 0.4, 0.2, R + 3, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      const sc = rgb(pal.dark), top = [17.6, 31.5, 0];
      DT.stay(b, top, [23.3, 24.3, 0], sc, 0.05); DT.stay(b, top, [X(0.02), Y(X(0.02)) + 1.4, 0], sc, 0.05);
      for (const sg of [-1, 1]) { DT.stay(b, [17.6, 26, 0], [16.0, R, sg * 3.3], sc, 0.04); DT.stay(b, top, [24.0, R, sg * 4.5], sc, 0.04); }
    },
  });
  part('mast1', 'mast', 'Mât arrière', () => {
    PT.poleMast(b, { x: 1.8, y0: 14.5, h: 18.7, r: 0.14, yards: [[0.55, 5.4], [0.8, 3.2]] }, pal);
  }, () => b.cylinder(1.8, 14.5, 0, 0.4, 0.2, 17, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      const sc = rgb(pal.dark), top = [1.8, 33.0, 0];
      DT.stay(b, top, [17.6, 31.0, 0], sc, 0.05); DT.stay(b, top, [X(0.97), Y(X(0.97)) + 1.2, 0], sc, 0.05);
      for (const sg of [-1, 1]) { DT.stay(b, [1.8, 27, 0], [-6.0, R + 0.2, sg * 5.5], sc, 0.04); DT.stay(b, [1.8, 27, 0], [8.0, R, sg * 4.6], sc, 0.04); }
    },
  });
  b.group('fine', () => {                                                                                              // the stays of the derrick mast (the builder's crane: see `cat`)
    const sc = rgb(pal.dark);
    DT.stay(b, [-20.4, 24.5, 0], [1.8, 30.5, 0], sc, 0.05);
    for (const sg of [-1, 1]) DT.stay(b, [-20.4, 23.0, 0], [-24.0, R + 0.2, sg * 4.5], sc, 0.04);
  });
  note(33.5);

  // ---- the boats: two big motor boats beside the funnel, two aft under the catapult ----
  for (const sg of [-1, 1]) {
    cutter(b, K, pal, 14.3, R + 1.3, sg * 4.2, 11.0, 0);
    cutter(b, K, pal, -13.3, R + 1.5, sg * 5.4, 9.8, 0);
  }

  // ---- the two quadruple torpedo tube banks at the stern, one on each side, the tubes pointing aft ----
  model.tubes.length = 0;
  for (const sg of [-1, 1]) {
    const x0 = -68.6, zc = sg * 4.0;
    part('tubes' + (sg > 0 ? 0 : 1), 'tubes', 'Tubes lance-torpilles', () => {
      b.prism([[-71.5, zc - 1.9], [-64.0, zc - 1.9], [-64.0, zc + 1.9], [-71.5, zc + 1.9]], 3.9, 4.95, shade(sup, 0.9), MAT.HULL);                           // the shield
      for (const dz of [-1.28, -0.43, 0.43, 1.28]) {
        b.rod(-73.3, -66.0, 4.5, zc + dz, 0.31, 0.31, shade(grey, 1.0), MAT.HULL, { seg: 12 });
        b.rod(-73.4, -73.2, 4.5, zc + dz, 0.2, 0.34, shade(grey, 0.75), MAT.HULL, { seg: 12 });
      }
    }, () => b.box(x0, 4.4, zc, 7.0, 0.9, 3.4, shade(dark, 1.1), MAT.DARK));
    model.tubes.push({ x: -72.5, cx: x0, y: 4.5, z: zc, n: 4, side: sg, reach: 6.5, r0: 2.4 });
  }

  // ---- the stern: the ensign staff, the stern light; the bow: the jackstaff, anchors and rails ----
  b.group('fine', () => {
    DT.lifelines(b, hull, X(0.985), X(0.2), pal, { base: 0.1, h: 0.95, step: 2.5 });
    DT.lifelines(b, hull, X(0.19), X(0.02), pal, { base: 0.1, h: 0.95, step: 2.5 });
    DT.anchorAndHawse(b, hull, X(0.06), 5.4, pal);
    b.cylinder(X(0.008), 6.6, 0, 0.05, 0.04, 10.0, grey, MAT.HULL, { seg: 5 });
    b.cylinder(X(0.99), 4.0, 0, 0.06, 0.05, 9.0, grey, MAT.HULL, { seg: 5 });
  });
  PT.ensign(b, { x: X(0.99) - 0.1, y: 6.8, z: 0, len: 3.0 });
}

export const GRAF_SPEE = {
  mainVariant: 'drh28_283', secVariant: ['de150_1', 'dop105'], dirKind: 'drum', own: true, ownTubes: true, houseH: 0.1, bulwarkF: [0, 0.04],
  bow: { rake: 0.8, forefoot: 1.2, pr: 1.2 }, stern: { overhang: 6.0, tail: 2.8, rise: 13, oex: 1.0 },
  fb: [[0, 6.6], [0.025, 6.3], [0.05, 6.0], [0.1, 5.75], [0.15, 5.5], [0.2, 5.35], [0.25, 5.3], [0.81, 5.3], [0.822, 4.1], [0.9, 4.0], [1, 4.0]],
  planDeck: [[0, 0.033], [0.025, 0.204], [0.05, 0.318], [0.075, 0.418], [0.1, 0.513], [0.125, 0.597], [0.15, 0.67], [0.175, 0.734], [0.2, 0.792], [0.225, 0.846], [0.25, 0.893], [0.275, 0.936], [0.3, 0.974], [0.325, 1.003], [0.35, 1.025], [0.375, 1.04], [0.4, 1.051], [0.425, 1.059], [0.45, 1.059], [0.475, 1.059], [0.5, 1.058], [0.525, 1.043], [0.55, 1.032], [0.575, 1.021], [0.6, 1.006], [0.625, 0.986], [0.65, 0.961], [0.675, 0.934], [0.7, 0.902], [0.725, 0.865], [0.75, 0.821], [0.775, 0.767], [0.8, 0.681], [0.825, 0.628], [0.85, 0.567], [0.875, 0.523], [0.9, 0.43], [0.925, 0.384], [0.95, 0.261], [0.975, 0.152], [1, 0]],
  planWL: [[0, 0], [0.025, 0.073], [0.05, 0.142], [0.075, 0.229], [0.1, 0.321], [0.125, 0.41], [0.15, 0.501], [0.175, 0.586], [0.2, 0.662], [0.225, 0.732], [0.25, 0.793], [0.275, 0.845], [0.3, 0.888], [0.325, 0.923], [0.35, 0.951], [0.375, 0.973], [0.4, 0.99], [0.425, 0.999], [0.45, 1.001], [0.475, 1.001], [0.5, 0.996], [0.525, 0.988], [0.55, 0.976], [0.575, 0.96], [0.6, 0.938], [0.625, 0.908], [0.65, 0.881], [0.675, 0.839], [0.7, 0.799], [0.725, 0.76], [0.75, 0.714], [0.775, 0.663], [0.8, 0.603], [0.825, 0.532], [0.85, 0.463], [0.875, 0.399], [0.9, 0.333], [0.925, 0.263], [0.95, 0.178], [0.975, 0], [1, 0]],
  keel: [[0, 0], [0.025, 0.97], [0.8, 0.97], [0.85, 0.95], [0.9, 0.88], [0.95, 0.6], [0.975, 0.2], [1, 0]],
  aa: [
    { k: 't37', f: 0.343, z: 3.9, y: 2.6, noTub: true }, { k: 't37', f: 0.6086, z: 4.2, y: 2.8, noTub: true },
    { k: 'f20', f: 0.1091, z: 0, y: 0.3, one: true }, { k: 'f20', f: 0.3226, z: 8.2, y: 0.4 }, { k: 'f20', f: 0.3742, z: 2.5, y: 18.4, noTub: true },
    { k: 'f20', f: 0.443, z: 1.5, y: 11.4, noTub: true }, { k: 'f20', f: 0.4731, z: 4.0, y: 11.4, noTub: true }, { k: 'f20', f: 0.6575, z: 8.1, y: 0.5 },
    { k: 'f20', f: 0.7957, z: 3.1, y: 0.8 }, { k: 'f20', f: 0.9065, z: 0, y: 0, one: true },
  ],
  cat: { f: 0.5629, y: 5.2, len: 13.8, craneF: 0.6097, craneY: 2.9, craneH: 16.5, craneLen: 11 },
  props: [{ f: 0.908, z: 3.8, depth: 4.95, d: 4.5, blades: 3, toF: 0.8, strutF: 0.885 }],
  rudders: [{ f: 0.9237, z: 0, top: 2.3, bottom: 6.3, chord: 6.0, t: 0.45, stock: 1.0 }],
  extra: grafSpeeExtras,
};
