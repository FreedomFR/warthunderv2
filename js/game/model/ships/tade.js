// tade: the tweaks of the tade model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// The helpers of the builder are passed to `extra(ctx)`.
import { kit, cutter } from './kit.js';



/**
 * Tade, drawn from a reference model (tools/refs/WORKFLOW.md): everything above the hull, in metres over the waterline (y), along the ship (x, bow +) and to starboard (z).
 * The bridge is a narrow casing with a chart house, a wheelhouse with a rounded front and a round compass platform; two thin funnels (an oval one 2.8 x 1.65 m and a round one),
 * the guns on round bandstands over narrow casings, the twin torpedo mounts on their turntables, boats on davits, two pole masts with their stays.
 */
function tadeExtras({ b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, DT, note }) {
  const hullc = rgb(pal.hull), sup = rgb(pal.sup), dark = rgb(pal.dark), deckc = rgb(pal.deck), mastc = rgb(pal.mast), func = rgb(pal.funnel), capc = rgb(pal.cap), grey = rgb('#8d9296');
  const D = 2.5;                                                                                    // the main deck abaft the forecastle
  const { half, wall, ring } = kit(b, { MAT, rgb, shade });

  // ---- the bridge: casing, chart house, wheelhouse, compass platform ----
  part('bridge', 'bridge', 'Passerelle', () => {
    b.prism(half([[11.44, 1.13], [18.37, 1.13], [19.25, 0.7], [19.49, 0]]), D, 4.8, sup, MAT.HULL);                                  // the casing, round in front
    // the open bridge deck, wide in front, with a screen along each wing
    const deckPlan = [[13.8, 1.07], [15.0, 2.4], [16.2, 3.4], [17.73, 3.33], [19.37, 1.1], [19.5, 0]];
    b.prism(half(deckPlan), 4.62, 4.8, shade(sup, 0.9), MAT.HULL);
    for (const sg of [-1, 1]) for (let i = 1; i < deckPlan.length - 1; i++) wall([deckPlan[i][0], sg * deckPlan[i][1]], [deckPlan[i + 1][0], sg * deckPlan[i + 1][1]], 4.8, 5.9, 0.08, shade(sup, 1.03));
    b.prism(half([[14.87, 1.32], [18.9, 1.27], [19.89, 0.5], [19.95, 0]]), 4.8, 6.7, shade(sup, 0.97), MAT.HULL);                    // the chart house, up to the wheelhouse floor
    // the wheelhouse: a solid belt, a band of windows all round, the roof with its overhang; rounded in front
    const wh = [[16.15, 2.53], [17.31, 2.53], [19.64, 1.47], [20.26, 0.85], [20.49, 0]];
    b.prism(half(wh), 6.7, 7.9, sup, MAT.HULL);
    b.prism(half(wh.map(([x, w]) => [x, w - 0.05])), 7.9, 9.0, shade(dark, 1.3), MAT.DARK);                                      // the dark inside seen through the windows
    const glass = rgb(pal.glass);
    for (const sg of [-1, 1]) for (let i = 0; i < wh.length - 1; i++) {                                                          // the windows: panes between posts
      const [x0, w0] = wh[i], [x1, w1] = wh[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, w1 - w0) / 0.9));
      for (let k = 0; k < n; k++) { const t0 = (k + 0.12) / n, t1 = (k + 0.88) / n; wall([x0 + (x1 - x0) * t0, sg * (w0 + (w1 - w0) * t0)], [x0 + (x1 - x0) * t1, sg * (w0 + (w1 - w0) * t1)], 8.05, 8.9, 0.14, glass); }
    }
    b.prism(half([[16.0, 2.68], [17.31, 2.68], [19.8, 1.56], [20.42, 0.92], [20.68, 0]]), 9.0, 9.22, shade(sup, 1.08), MAT.HULL, { topScale: 0.93 });
    b.prism(half([[11.5, 2.4], [16.15, 2.5]]), 6.6, 6.78, shade(sup, 0.9), MAT.HULL);                                                // the open deck behind it, at the level of the wheelhouse floor
    b.block({ x0: 16.3, x1: 14.9, hw: 0.6, y0: 6.7, y1: 9.3 }, shade(sup, 0.95), MAT.HULL);                                          // the tower behind the wheelhouse
    b.cyl(15.6, 9.3, 0, 0.95, 0.95, 1.4, 1.4, 10.05, shade(sup, 1.05), MAT.HULL, { seg: 22, capTop: false });                       // the compass platform: a cup that flares upwards
    b.cylinder(15.6, 10.0, 0, 1.36, 1.36, 10.07, shade(dark, 1.2), MAT.DARK, { seg: 18 });
    b.cylinder(15.6, 10.05, 0, 0.14, 0.12, 10.9, shade(dark, 1.4), MAT.HULL, { seg: 6 });                                           // the standard compass
  }, () => b.prism(half([[14.9, 1.3], [19.5, 0.6], [19.9, 0]]), D, 4.3, shade(dark, 1.15), MAT.DARK));
  b.group('fine', () => {
    ring(15.6, 0, 1.42, 10.05, 0.55, grey, 14);
    DT.roofRail(b, 13.8, 6.78, 0, 2.3, 2.42, grey, { h: 0.9 });
    DT.ladder(b, 13.6, D, 6.7, 1.25, grey); DT.ladder(b, 13.6, D, 6.7, -1.25, grey);
    PT.searchlight(b, 16.8, 9.4, 0.0, 0.3, pal);
  });
  model.bridge = { x: 18.2, y: 8.2, z: 0, towerX: 15.5, cands: [[20.9, 7.9, 0], [20.5, 7.9, 0.9], [20.5, 7.9, -0.9], [18.0, 10.4, 0]] };
  model.superBox = { x0: 11.4, x1: 20.5, hw: 2.55, y1: 10.1 };

  // ---- funnels ----
  const funnelPart = (i, x, hgt, lx, lz, taper) => {
    const fo = { x, y0: D, h: hgt - D, lx, lz, topLx: lx * 0.97, topLz: lz * 0.97, rake: 0, cap: 0.4, pipes: false, trunk: true };
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => {
      b.cyl(x, D, 0, lx / 2 * taper, lz / 2 * taper, lx / 2, lz / 2, hgt - 0.35, func, MAT.HULL, { seg: 24, capTop: false });          // the casing, straight
      b.cyl(x, hgt - 0.35, 0, lx / 2 * 1.03, lz / 2 * 1.03, lx / 2 * 1.03, lz / 2 * 1.03, hgt - 0.12, shade(func, 0.9), MAT.HULL, { seg: 24 });   // the rim
      b.cyl(x, hgt - 0.12, 0, lx / 2, lz / 2, lx / 2, lz / 2, hgt, capc, MAT.DARK, { seg: 24, topCol: shade(capc, 0.5) });                // the black top
    }, () => PT.funnelRuin(b, fo, pal));
    model.smoke.push([x, hgt, 0]);
    b.group('fine', () => {
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.beam([x + Math.cos(a) * lx * 0.5, hgt, Math.sin(a) * lz * 0.5], [x + Math.cos(a) * lx * 0.46, hgt + 0.45, Math.sin(a) * lz * 0.46], 0.025, 0.025, grey, MAT.HULL, { caps: false }); }   // the basket over the top
      DT.ladder(b, x + lx / 2 + 0.03, D + 0.3, hgt - 0.5, 0, grey);
      for (const sg of [-1, 1]) { b.cylinder(x - lx / 2 - 0.12, D + 0.6, sg * lz * 0.34, 0.1, 0.09, hgt - 0.5, grey, MAT.HULL, { seg: 6 }); b.cylinder(x - lx / 2 - 0.12, hgt - 0.5, sg * lz * 0.34, 0.1, 0.0, hgt - 0.1, grey, MAT.HULL, { seg: 6 }); }   // the steam pipes, capped
    });
  };
  funnelPart(0, 8.6, 9.35, 2.8, 1.65, 1.08);
  funnelPart(1, -2.74, 8.9, 1.7, 1.7, 1.12);
  part('galley', 'vent', 'Cheminée de cuisine', () => {
    b.cylinder(-6.15, D, 0, 0.95, 0.9, 5.95, func, MAT.HULL, { seg: 16 });                                           // the galley funnel, a drum
    const pl = [[-7.9, 0], [-7.5, 1.1], [-6.3, 1.55], [-4.9, 1.2], [-4.5, 0], [-4.9, -1.2], [-6.3, -1.55], [-7.5, -1.1]];   // the searchlight platform on top, with a low wall
    b.prism(pl, 5.9, 6.05, shade(func, 0.95), MAT.HULL);
    for (let i = 0; i < pl.length; i++) { const p0 = pl[i], p1 = pl[(i + 1) % pl.length]; wall(p0, p1, 6.05, 6.95, 0.1, shade(func, 1.02)); }
    b.cylinder(-6.15, 6.05, 0, 0.3, 0.28, 6.5, shade(dark, 1.3), MAT.HULL, { seg: 8 });
    b.sphere(-6.15, 6.8, 0, 0.42, 0.42, 0.42, shade(grey, 1.1), MAT.HULL, { seg: 10, rings: 7 });                    // the searchlight
  });

  // ---- the guns on round bandstands over narrow casings (the forecastle one stands on the deck) ----
  const bandstand = (cx, x0, x1, hwc, r) => {
    b.prism(half([[x0, hwc], [x1, hwc]]), D, 4.55, shade(sup, 0.98), MAT.HULL);
    b.cylinder(cx, 4.45, 0, r, r * 0.97, 4.72, shade(deckc, 1.1), MAT.HULL, { seg: 28 });
    b.cylinder(cx, 4.3, 0, r * 0.97, r * 0.9, 4.46, shade(sup, 0.9), MAT.HULL, { seg: 28 });
    b.group('fine', () => ring(cx, 0, r - 0.1, 4.72, 0.95, grey, 24));
  };
  bandstand(2.4, 0.17, 4.92, 1.03, 2.65);
  bandstand(-22.1, -25.2, -18.6, 1.3, 2.9);

  // ---- the twin torpedo mounts on their turntables ----
  model.tubes.length = 0;
  [23.5, -13.4].forEach((x, i) => {
    part('tubes' + i, 'tubes', 'Tubes lance-torpilles', () => {
      b.cylinder(x, D, 0, 1.3, 1.25, 3.15, shade(sup, 0.85), MAT.HULL, { seg: 18 });
      b.block({ x0: x + 0.7, x1: x - 0.7, hw: 1.0, y0: 3.1, y1: 3.3 }, shade(sup, 0.8), MAT.HULL);
      for (const sg of [-1, 1]) {
        b.rod(x - 3.5, x + 3.45, 3.78, sg * 0.62, 0.3, 0.3, shade(grey, 1.05), MAT.HULL, { seg: 12 });
        b.rod(x + 3.45, x + 3.6, 3.78, sg * 0.62, 0.3, 0.22, shade(grey, 0.8), MAT.HULL, { seg: 12 });
        b.rod(x - 3.7, x - 3.5, 3.78, sg * 0.62, 0.22, 0.3, shade(grey, 0.8), MAT.HULL, { seg: 12 });
      }
      b.block({ x0: x + 0.5, x1: x - 0.2, hw: 0.9, y0: 3.3, y1: 3.55 }, shade(sup, 0.9), MAT.HULL);
    }, () => b.box(x, 3.0, 0, 2.4, 0.8, 2.2, shade(dark, 1.1), MAT.DARK));
    model.tubes.push({ x, y: 3.8, z: 0, n: 2, side: 0 });
  });

  // ---- boats on davits ----
  for (const sg of [-1, 1]) for (const bx of [11.0, -6.7]) {
    cutter(b, { MAT, rgb, shade }, pal, bx, D + 1.0, sg * 2.6, 7.0);
    b.group('fine', () => { for (const dx of [-1.9, 1.9]) { const px = bx + dx; b.beam([px, D, sg * 3.15], [px, D + 2.6, sg * 3.0], 0.06, 0.06, grey, MAT.HULL, { caps: false }); b.beam([px, D + 2.6, sg * 3.0], [px, D + 2.2, sg * 2.2], 0.05, 0.05, grey, MAT.HULL, { caps: false }); } });
  }

  // ---- masts and their stays ----
  const mastTop = 21.5, mastTop2 = 15.8;
  part('mast0', 'mast', 'Mât avant', () => {
    PT.poleMast(b, { x: 14.2, y0: D, h: mastTop - D, r: 0.27, yards: [[0.62, 5.4], [0.84, 3.4]] }, pal);
    PT.pennant(b, 14.2, mastTop + 0.2, 0.3, 4.2, 0, '#ffffff');
  }, () => b.cylinder(14.2, D, 0, 0.5, 0.3, D + 3, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      const top = [14.1, mastTop - 0.5, 0], sc = rgb(pal.dark);
      DT.stay(b, top, [X(0.012), Y(X(0.012)) + 1.4, 0], sc, 0.05);
      DT.stay(b, [14.1, mastTop * 0.8, 0], [X(0.14), Y(X(0.14)) + 1.2, 0.3], sc, 0.04);
      for (const sg of [-1, 1]) for (const [fy, bx, w] of [[0.66, 11.0, 0.08], [0.66, 6.5, 0.08], [0.78, 9.0, 0.06], [0.5, 12.5, 0.07]]) DT.stay(b, [14.1, mastTop * fy, 0], [bx, D + 1.4, sg * 3.1], sc, w);
      DT.stay(b, top, [-18.9, mastTop2 - 0.3, 0], sc, 0.07);
    },
  });
  part('mast1', 'mast', 'Mât arrière', () => {
    PT.poleMast(b, { x: -18.9, y0: D, h: mastTop2 - D, r: 0.22, yards: [[0.7, 3.2]] }, pal);
  }, () => b.cylinder(-18.9, D, 0, 0.4, 0.25, D + 2.5, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => { const sc = rgb(pal.dark); DT.stay(b, [-18.9, mastTop2 - 0.3, 0], [X(0.985), Y(X(0.985)) + 1.2, 0], sc, 0.05); for (const sg of [-1, 1]) DT.stay(b, [-18.9, mastTop2 * 0.8, 0], [-14.0, D + 1.2, sg * 3.2], sc, 0.04); },
  });
  note(mastTop + 1);

  // ---- the raised platform of the forecastle gun, the windlass and capstans, the quarterdeck fittings ----
  b.prism(half([[28.0, 3.9], [30.5, 4.1], [32.2, 3.7], [33.6, 2.4], [34.3, 0]]), 5.28, 5.6, shade(deckc, 1.05), MAT.HULL, { topScale: 0.97 });
  b.cylinder(35.9, 5.3, 0, 0.5, 0.45, 5.85, shade(dark, 1.3), MAT.HULL, { seg: 10 });                                  // the capstan
  b.cylinder(38.3, 5.3, 0, 0.42, 0.38, 5.7, shade(dark, 1.3), MAT.HULL, { seg: 10 });
  for (const sg of [-1, 1]) { b.cylinder(37.0, 5.3, sg * 0.9, 0.12, 0.1, 5.65, grey, MAT.HULL, { seg: 6 }); b.cylinder(40.5, 5.1, sg * 0.7, 0.12, 0.1, 5.45, grey, MAT.HULL, { seg: 6 }); }   // the bollards
  for (const [bx, bz] of [[-31.5, 1.6], [-31.5, -1.6]]) { b.cylinder(bx, D, bz, 0.45, 0.45, D + 0.55, shade(dark, 1.3), MAT.HULL, { seg: 10 }); b.rod(bx - 0.2, bx + 0.2, D + 0.3, bz, 0.35, 0.35, grey, MAT.HULL, { seg: 8 }); }   // the reels
  b.cylinder(-34.5, D, 0, 0.7, 0.7, D + 0.3, shade(deckc, 1.15), MAT.HULL, { seg: 12 });                              // a hatch
  for (const bx of [-38.5, -41.0]) for (const sg of [-1, 1]) b.cylinder(bx, D, sg * 1.7, 0.13, 0.11, D + 0.45, grey, MAT.HULL, { seg: 6 });
  b.group('fine', () => {                                                                                              // the A-frame of the shaft brackets under the stern
    for (const sg of [-1, 1]) { b.beam([-39.2, -1.0, sg * 1.2], [-41.6, -2.6, sg * 1.55], 0.1, 0.1, grey, MAT.HULL); b.beam([-41.2, -0.6, sg * 1.1], [-41.6, -2.6, sg * 1.55], 0.1, 0.1, grey, MAT.HULL); }
  });

  // ---- bow and stern fittings ----
  b.group('fine', () => {
    DT.lifelines(b, hull, X(0.985), X(0.22), pal, { base: 0.1, h: 0.85, step: 2.2 });
    DT.lifelines(b, hull, X(0.19), X(0.02), pal, { base: 0.1, h: 0.85, step: 2.2 });
    DT.anchorAndHawse(b, hull, X(0.045), 4.4, pal);
    b.cylinder(X(0.012), 5.3, 0, 0.04, 0.03, 6.5, grey, MAT.HULL, { seg: 5 });                  // the jackstaff
    b.cylinder(X(0.99), D, 0, 0.05, 0.04, 6.3, grey, MAT.HULL, { seg: 5 });                      // the ensign staff
  });
  PT.ensign(b, { x: X(0.99) - 0.1, y: 5.0, z: 0, len: 2.4 });
}

export const TADE = {
  mainVariant: 'type3_120', houseH: 0.1, bulwarkF: [0, 0.2], bulwark: 0.55,
  bow: { rake: 2.3, pr: 1.25, forefoot: 1.0, entrance: 0.36 }, stern: { overhang: 0.15, rise: 0.8, run: 0.25 },
  fb: [[0, 5.4], [0.04, 5.4], [0.1, 5.3], [0.18, 5.3], [0.196, 5.2], [0.2, 2.7], [0.25, 2.6], [0.3, 2.5], [0.4, 2.45], [0.5, 2.4], [0.7, 2.4], [0.78, 2.5], [0.85, 2.5], [1, 2.6]],
  planDeck: [[0, 0], [0.025, 0.302], [0.05, 0.46], [0.075, 0.591], [0.1, 0.69], [0.125, 0.749], [0.15, 0.803], [0.175, 0.839], [0.196, 0.8], [0.2, 0.755], [0.225, 0.765], [0.25, 0.795], [0.275, 0.826], [0.3, 0.855], [0.325, 0.885], [0.35, 0.902], [0.375, 0.917], [0.4, 0.931], [0.425, 0.946], [0.45, 0.959], [0.475, 0.967], [0.5, 0.973], [0.525, 0.978], [0.55, 0.982], [0.575, 0.98], [0.6, 0.975], [0.625, 0.968], [0.65, 0.955], [0.675, 0.942], [0.7, 0.928], [0.725, 0.915], [0.75, 0.899], [0.775, 0.884], [0.8, 0.863], [0.825, 0.842], [0.85, 0.816], [0.875, 0.79], [0.9, 0.74], [0.925, 0.69], [0.95, 0.6], [0.96, 0.57], [0.97, 0.5], [0.977, 0.42], [0.982, 0.3], [0.984, 0.14], [0.985, 0.02], [1, 0]],
  planWL: [[0, 0], [0.025, 0.04], [0.05, 0.129], [0.075, 0.219], [0.1, 0.301], [0.125, 0.376], [0.15, 0.45], [0.175, 0.525], [0.2, 0.589], [0.225, 0.645], [0.25, 0.698], [0.275, 0.751], [0.3, 0.796], [0.325, 0.837], [0.35, 0.875], [0.375, 0.901], [0.4, 0.924], [0.425, 0.943], [0.45, 0.957], [0.475, 0.966], [0.5, 0.972], [0.525, 0.976], [0.55, 0.98], [0.575, 0.978], [0.6, 0.973], [0.625, 0.966], [0.65, 0.953], [0.675, 0.94], [0.7, 0.925], [0.725, 0.909], [0.75, 0.891], [0.775, 0.875], [0.8, 0.851], [0.825, 0.829], [0.85, 0.8], [0.875, 0.768], [0.9, 0.721], [0.925, 0.653], [0.95, 0.52], [0.96, 0.49], [0.97, 0.42], [0.977, 0.34], [0.982, 0.22], [0.984, 0.1], [0.985, 0.02], [1, 0]],
  keel: [[0, 0], [0.025, 0.32], [0.05, 1], [0.075, 1.06], [0.1, 1.07], [0.775, 1.07], [0.8, 0.96], [0.825, 0.83], [0.85, 0.68], [0.875, 0.53], [0.9, 0.45], [0.925, 0.3], [0.95, 0.15], [1, 0]],
  own: true, ownTubes: true, aa: [], extra: tadeExtras,
  props: [{ f: 0.935, z: 1.5, depth: 1.5, d: 1.9, blades: 3, toF: 0.84, strutF: 0.92 }],
  rudders: [{ f: 0.968, z: 0, top: 0.6, bottom: 3.0, chord: 1.9, t: 0.14, round: true, stock: 1.0 }],
};
