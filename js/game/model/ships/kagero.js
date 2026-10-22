// kagero: the tweaks of the Kagero model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// Everything above the hull is drawn here in metres (x along the ship, bow +; y over the waterline; z to starboard); the guns, screws and rudder stay the builder's.
import { kit, cutter } from './kit.js';
import * as V4 from './kagero_v4.js';

/** A tilted funnel: a stack of oval sections whose centre leans aft by `lean` metres per metre of height. */
function leaningOval(b, MAT, x, y0, y1, rx0, rz0, rx1, rz1, lean, col, n = 4) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, ya = y0 + (y1 - y0) * t0, yb = y0 + (y1 - y0) * t1;
    b.cyl(x - lean * (ya - y0), ya, 0, rx0 + (rx1 - rx0) * t0, rz0 + (rz1 - rz0) * t0, rx0 + (rx1 - rx0) * t1, rz0 + (rz1 - rz0) * t1, yb, col, MAT.HULL, { seg: 26, capTop: false });
  }
}

function kageroExtras({ b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, DT, note }) {
  const sup = rgb(pal.sup), dark = rgb(pal.dark), deckc = rgb(pal.deck), func = rgb(pal.funnel), capc = rgb(pal.cap), grey = rgb('#8d9296'), glass = rgb(pal.glass);
  const { half, wall, ring } = kit(b, { MAT, rgb, shade });
  const D = 3.5;                                                                                    // the main deck abaft the forecastle step (f 0.3), 5.7 m forward of it
  const FD = 5.7;

  // ---- the bridge: casing, forward chart house, wing deck, wheelhouse, tower and compass platform ----
  part('bridge', 'bridge', 'Passerelle', () => {
    b.prism(half([[23.96, 1.8], [28.7, 1.8], [29.15, 1.35], [29.4, 0.62], [29.42, 0]]), 3.5, 8.8, sup, MAT.HULL);                             // the casing, rounded in front
    b.prism(half([[29.55, 1.86], [31.6, 1.86], [32.98, 1.2], [33.3, 0.72], [33.34, 0]]), FD, 7.9, shade(sup, 0.97), MAT.HULL);              // the forward chart house
    b.prism(half([[24.5, 2.15], [26.9, 2.6], [27.35, 1.92], [28.9, 1.72], [29.4, 0.9], [29.44, 0]]), 8.8, 9.1, shade(sup, 0.9), MAT.HULL);   // the wing deck
    for (const sg of [-1, 1]) wall([27.35, sg * 1.92], [26.9, sg * 2.6], 9.1, 9.9, 0.07, shade(sup, 1.03));                                  // the wing screens
    b.prism(half([[27.3, 2.0], [28.9, 1.85], [29.4, 1.3], [29.56, 0.7], [29.58, 0]]), 9.1, 10.8, shade(sup, 1.02), MAT.HULL);              // the wheelhouse front
    b.prism(half([[24.0, 1.0], [24.3, 1.2], [27.3, 1.25]]), 9.1, 11.2, shade(sup, 0.98), MAT.HULL);                                          // the aft part, narrow
    b.prism(half([[24.8, 1.05], [25.2, 2.5], [26.9, 2.58], [27.3, 2.05], [28.95, 1.85], [29.55, 0.7], [29.58, 0]]), 10.8, 11.15, shade(sup, 1.08), MAT.HULL, { topScale: 0.96 });   // the roof, overhanging
    // the windows of the wheelhouse: a dark band round the front
    const ww = [[27.3, 2.0], [28.9, 1.85], [29.4, 1.3], [29.56, 0.7], [29.58, 0]];
    for (const sg of [-1, 1]) for (let i = 0; i < ww.length - 1; i++) {
      const [x0, w0] = ww[i], [x1, w1] = ww[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, w1 - w0) / 0.7));
      for (let k = 0; k < n; k++) { const t0 = (k + 0.15) / n, t1 = (k + 0.85) / n; wall([x0 + (x1 - x0) * t0, sg * (w0 + (w1 - w0) * t0)], [x0 + (x1 - x0) * t1, sg * (w0 + (w1 - w0) * t1)], 9.75, 10.5, 0.1, shade(glass, 0.8)); }
    }
    b.cylinder(25.0, 11.15, 0, 1.1, 1.05, 12.2, shade(sup, 1.0), MAT.HULL, { seg: 20 });                                                  // the director / compass tower
    b.cyl(25.0, 11.1, 0, 1.18, 1.18, 1.3, 1.3, 12.5, shade(sup, 1.05), MAT.HULL, { seg: 22, capTop: false });                                 // the compass platform: a cup that flares upwards
    b.cylinder(25.0, 12.4, 0, 1.26, 1.26, 12.55, shade(dark, 1.2), MAT.DARK, { seg: 18 });
    b.cylinder(25.0, 12.5, 0, 0.12, 0.1, 13.2, shade(dark, 1.4), MAT.HULL, { seg: 6 });
  }, () => b.prism(half([[24.0, 1.7], [29.0, 1.3], [29.4, 0]]), 3.5, 7.0, shade(dark, 1.15), MAT.DARK));
  b.group('fine', () => {
    ring(25.0, 0, 1.3, 12.5, 0.6, grey, 14);
    DT.ladder(b, 23.9, 3.5, 8.8, 1.2, grey); DT.ladder(b, 23.9, 3.5, 8.8, -1.2, grey);
    PT.searchlight(b, 28.2, 11.15, 0.0, 0.3, pal);
    PT.searchlight(b, 31.9, 7.9, 0.0, 0.0, pal);
  });
  model.bridge = { x: 28.4, y: 10.3, z: 0, towerX: 25.0, cands: [[29.7, 10.2, 0], [29.5, 10.2, 1.0], [29.5, 10.2, -1.0], [27.5, 12.6, 0]] };
  model.superBox = { x0: 23.8, x1: 29.6, hw: 2.6, y1: 12.6 };

  // ---- funnels: the raked ovals with their base fairings, rim, basket, steam pipes and ladders ----
  const funnel = (i, x, base, top, lx, lz, lean, topLx) => {
    const fo = { x, y0: base, h: top - base, lx, lz, topLx, topLz: lz * 0.92, rake: 0, cap: 0.4, pipes: false, trunk: true };
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => {
      b.cyl(x, base, 0, lx / 2 * 1.38, lz / 2 * 1.45, lx / 2 * 1.08, lz / 2 * 1.08, base + 1.1, shade(func, 0.95), MAT.HULL, { seg: 26, capTop: false });   // the flared foot
      leaningOval(b, MAT, x, base + 1.1, top - 0.35, lx / 2 * 1.08, lz / 2 * 1.08, lx / 2, lz / 2, lean, func);
      const xt = x - lean * (top - 0.35 - base - 1.1);
      b.cyl(xt, top - 0.35, 0, lx / 2 * 1.03, lz / 2 * 1.03, lx / 2 * 1.03, lz / 2 * 1.03, top - 0.12, shade(func, 0.9), MAT.HULL, { seg: 26 });
      b.cyl(xt, top - 0.12, 0, lx / 2, lz / 2, lx / 2, lz / 2, top, capc, MAT.DARK, { seg: 26, topCol: shade(capc, 0.5) });
    }, () => PT.funnelRuin(b, fo, pal));
    model.smoke.push([x - lean * (top - base - 1.1), top, 0]);
    b.group('fine', () => {
      const xt = x - lean * (top - base - 1.1);
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; b.beam([xt + Math.cos(a) * lx * 0.5, top, Math.sin(a) * lz * 0.5], [xt + Math.cos(a) * lx * 0.45, top + 0.5, Math.sin(a) * lz * 0.45], 0.025, 0.025, grey, MAT.HULL, { caps: false }); }
      DT.ladder(b, x + lx / 2 + 0.05, base + 0.3, top - 0.6, 0, grey);
      for (const sg of [-1, 1]) b.cylinder(x - lx / 2 - 0.15, base + 0.3, sg * lz * 0.3, 0.1, 0.09, top - 1.6, grey, MAT.HULL, { seg: 6 });
    });
  };
  // the casing of the first funnel: a long fairing with a flat top, rounded at both ends; the boiler-room hatches round it
  b.prism(half([[10.0, 1.2], [10.8, 1.75], [16.8, 1.75], [17.6, 1.2], [17.8, 0]]), D, 5.2, shade(sup, 0.95), MAT.HULL);
  funnel(0, 13.9, 5.2, 11.5, 3.9, 2.3, 0.05, 3.7);
  b.prism(half([[-4.4, 1.0], [-3.9, 1.5], [-0.8, 1.5], [-0.4, 1.0], [-0.3, 0]]), D, 5.0, shade(sup, 0.95), MAT.HULL);
  funnel(1, -2.35, 5.0, 10.9, 2.7, 1.6, 0.05, 2.5);
  // gratings: the walkways from the bridge to the funnel, on both sides
  for (const sg of [-1, 1]) b.prism([[19.18, sg * 3.67], [9.95, sg * 2.45], [10.18, sg * 0.99], [19.38, sg * 2.44]], 4.85, 5.0, shade(deckc, 0.9), MAT.HULL);

  // ---- the twin-25 mounts on round bandstands (the AA guns themselves come from the tweaks' aa layout) ----
  const stand = (cx, cz, r, y, col = sup) => {
    b.cylinder(cx, y - 0.25, cz, r, r * 0.95, y, shade(deckc, 1.1), MAT.HULL, { seg: 24 });
    b.cylinder(cx, y - 0.7, cz, r * 0.95, r * 0.6, y - 0.25, shade(col, 0.9), MAT.HULL, { seg: 24 });
    b.cylinder(cx, D, cz, 0.28, 0.25, y - 0.7, shade(col, 0.85), MAT.HULL, { seg: 10 });
    b.group('fine', () => ring(cx, cz, r - 0.08, y, 0.9, grey, 22));
  };
  stand(0.1, 3.4, 1.75, 6.4); stand(0.1, -3.4, 1.75, 6.4);
  stand(31.9, 0, 1.8, 8.0);

  // ---- the quadruple torpedo mounts: a hood over the tubes, which run on towards the bow ----
  model.tubes.length = 0;
  [{ x: 4.0, h0: -2.6, h1: 2.5, hw: 2.3, t0: -3.3, t1: 5.6 }, { x: -12.8, h0: -1.9, h1: 1.9, hw: 1.5, t0: 0.3, t1: 7.2 }].forEach((m, i) => {
    const x = m.x;
    part('tubes' + i, 'tubes', 'Tubes lance-torpilles', () => {
      b.cylinder(x, D, 0, 2.0, 1.95, D + 0.9, shade(sup, 0.85), MAT.HULL, { seg: 24 });                                    // the turntable
      b.prism(half([[x + m.h0, m.hw * 0.9], [x + m.h1, m.hw], [x + m.h1 + 0.2, m.hw * 0.7]]), D + 0.9, D + 2.6, shade(sup, 0.98), MAT.HULL);   // the hood over the tubes
      for (const z of [-1.27, -0.42, 0.42, 1.27]) {
        b.rod(x + m.t0 - 1.7, x + m.t1 + 3.2, D + 1.5, z, 0.3, 0.3, shade(grey, 1.05), MAT.HULL, { seg: 12 });
        b.rod(x + m.t1 + 3.2, x + m.t1 + 3.35, D + 1.5, z, 0.3, 0.22, shade(grey, 0.8), MAT.HULL, { seg: 12 });
      }
    }, () => b.box(x, 4.2, 0, 3.0, 1.0, 2.4, shade(dark, 1.1), MAT.DARK));
    model.tubes.push({ x: x + m.t1 + 3.2, cx: x, y: D + 1.5, z: 0, n: 4, side: 0, reach: 5.2 });                                            // at the muzzles, out of the hood
  });

  // ---- the after deckhouse and the round house under turret X ----
  b.prism(half([[-32.2, 0.5], [-31.3, 1.9], [-28.0, 2.7], [-26.9, 3.2], [-18.4, 3.2], [-17.8, 1.0], [-17.75, 0]]), D, 4.45, shade(sup, 0.95), MAT.HULL);
  b.prism(half([[-32.0, 0.4], [-31.2, 1.8], [-28.0, 2.6], [-27.0, 3.1], [-18.5, 3.1], [-17.9, 0.9], [-17.85, 0]]), 4.45, 4.55, shade(deckc, 0.95), MAT.HULL);          // the roof, with its grating
  b.cylinder(-28.6, 4.4, 0, 1.76, 1.72, 5.1, shade(sup, 1.0), MAT.HULL, { seg: 22 });                                                                           // the base of turret X
  for (const sg of [-1, 1]) for (const vx of [-20.0, -23.2]) b.cylinder(vx, 4.5, sg * 2.7, 0.35, 0.3, 5.2, shade(sup, 0.9), MAT.HULL, { seg: 10 });               // vents
  b.group('fine', () => { for (const sg of [-1, 1]) wall([-18.5, sg * 3.1], [-26.9, sg * 3.1], 4.55, 5.3, 0.04, grey); DT.ladder(b, -17.8, D, 4.45, 0.6, grey); });

  // ---- the searchlight tower behind the second funnel, the light mast, the deck fittings of the forecastle ----
  b.cylinder(-6.8, D, 0, 1.4, 1.35, 6.9, shade(sup, 0.95), MAT.HULL, { seg: 24 });
  b.sphere(-6.8, 7.6, 0, 0.55, 0.55, 0.55, shade(grey, 1.1), MAT.HULL, { seg: 12, rings: 8 });
  b.cylinder(-6.8, 6.9, 0, 0.15, 0.12, 7.1, shade(dark, 1.2), MAT.HULL, { seg: 6 });
  b.group('fine', () => { for (const [dx, dz] of [[-0.7, 0.7], [0.7, 0.7], [0, -0.9]]) b.beam([-6.8 + dx, 6.9, dz], [-6.8, 9.9, 0], 0.04, 0.04, grey, MAT.HULL, { caps: false }); ring(-6.8, 0, 0.5, 9.9, 0.1, grey, 10); });
  b.cylinder(37.2, FD, 0, 0.07, 0.06, 7.5, grey, MAT.HULL, { seg: 6 });
  for (const [cx, r] of [[50.5, 0.45], [52.8, 0.4]]) b.cylinder(cx, FD + 0.3, 0, r, r * 0.9, FD + 0.9, shade(dark, 1.3), MAT.HULL, { seg: 10 });                    // capstans
  b.box(36.8, FD + 0.45, 0, 1.6, 0.9, 2.4, shade(dark, 1.25), MAT.HULL);                                                                                        // the windlass
  for (const sg of [-1, 1]) for (const bx of [34.5, 47.0, 54.0]) b.cylinder(bx, FD, sg * 2.0, 0.13, 0.11, FD + 0.45, grey, MAT.HULL, { seg: 6 });                    // bollards

  // ---- boats on skids, abaft the bridge and amidships ----
  for (const sg of [-1, 1]) {
    cutter(b, { MAT, rgb, shade }, pal, -4.7, D + 1.3, sg * 3.9, 7.4, 0);
    cutter(b, { MAT, rgb, shade }, pal, 27.0, FD + 0.1, sg * 3.9, 7.0, 0);
  }

  // ---- the foremast: a pole in front of the bridge with its rake, and its leg ----
  part('mast0', 'mast', 'Mât avant', () => {
    PT.poleMast(b, { x: 20.0, y0: D, h: 18.8, r: 0.22, yards: [[0.72, 3.6], [0.9, 2.2]] }, pal);
    b.beam([20.2, 20.5, 0.12], [24.3, 12.6, 0.4], 0.2, 0.2, shade(dark, 1.2), MAT.HULL);
    b.beam([20.2, 20.5, -0.12], [24.3, 12.6, -0.4], 0.2, 0.2, shade(dark, 1.2), MAT.HULL);
  }, () => b.cylinder(20.0, D, 0, 0.4, 0.25, D + 3, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => {
      const sc = rgb(pal.dark);
      DT.stay(b, [20.0, 22.0, 0], [X(0.0), Y(X(0.0)) + 1.5, 0], sc, 0.05);
      DT.stay(b, [20.0, 22.0, 0], [-23.1, 13.8, 0], sc, 0.07);
      DT.ladder(b, 20.3, D, 9.6, 0, grey);
    },
  });
  part('mast1', 'mast', 'Mât arrière', () => {
    PT.poleMast(b, { x: -23.1, y0: 5.0, h: 9.0, r: 0.2, yards: [[0.8, 3.0]] }, pal);
  }, () => b.cylinder(-23.1, 5.0, 0, 0.35, 0.25, 7.5, shade(dark, 1.1), MAT.DARK, { seg: 6 }), {
    fine: () => { const sc = rgb(pal.dark); DT.stay(b, [-23.1, 13.7, 0], [X(0.985), Y(X(0.985)) + 1.2, 0], sc, 0.05); },
  });
  note(22.5);

  // ---- bow and stern fittings ----
  b.group('fine', () => {
    DT.lifelines(b, hull, X(0.985), X(0.3), pal, { base: 0.1, h: 0.9, step: 2.4 });
    DT.lifelines(b, hull, X(0.29), X(0.02), pal, { base: 0.1, h: 0.9, step: 2.4 });
    DT.anchorAndHawse(b, hull, X(0.045), 5.6, pal);
    b.cylinder(X(0.012), 6.4, 0, 0.04, 0.03, 10.0, grey, MAT.HULL, { seg: 5 });                  // the jackstaff
    b.cylinder(X(0.99), D, 0, 0.05, 0.04, 8.5, grey, MAT.HULL, { seg: 5 });                      // the ensign staff
  });
  PT.ensign(b, { x: X(0.99) - 0.1, y: 6.0, z: 0, len: 2.6 });
}

export const KAGERO = {
  v4: V4,
  mainVariant: 'type3c_127', dirKind: 'drum', houseH: 0.02, bulwarkF: [0, 0.02],
  fb: [[0, 6.9], [0.05, 6.6], [0.1, 6.0], [0.15, 5.7], [0.2, 5.6], [0.25, 5.8], [0.29, 5.7], [0.3, 4.2], [0.325, 3.5], [0.6, 3.5], [0.95, 3.6], [0.975, 2.9], [1, 2.8]],
  planDeck: [[0, 0.046], [0.025, 0.283], [0.05, 0.41], [0.075, 0.508], [0.1, 0.595], [0.125, 0.669], [0.15, 0.735], [0.175, 0.789], [0.2, 0.833], [0.225, 0.876], [0.25, 0.917], [0.275, 0.92], [0.3, 0.92], [0.325, 0.959], [0.35, 0.96], [0.375, 0.976], [0.4, 0.995], [0.425, 0.999], [0.45, 1.01], [0.475, 1.01], [0.5, 1.007], [0.525, 1.006], [0.55, 1.006], [0.575, 1.003], [0.6, 0.998], [0.625, 0.996], [0.65, 0.982], [0.675, 0.969], [0.7, 0.954], [0.725, 0.939], [0.75, 0.931], [0.775, 0.911], [0.8, 0.897], [0.825, 0.88], [0.85, 0.859], [0.875, 0.824], [0.9, 0.81], [0.925, 0.782], [0.95, 0.636], [0.975, 0.481], [1, 0.099]],
  planWL: [[0, 0], [0.025, 0.026], [0.05, 0.103], [0.075, 0.19], [0.1, 0.276], [0.125, 0.359], [0.15, 0.441], [0.175, 0.516], [0.2, 0.583], [0.225, 0.647], [0.25, 0.709], [0.275, 0.763], [0.3, 0.812], [0.325, 0.852], [0.35, 0.887], [0.375, 0.917], [0.4, 0.946], [0.425, 0.969], [0.45, 0.99], [0.475, 0.993], [0.5, 0.993], [0.525, 0.993], [0.55, 0.993], [0.575, 0.989], [0.6, 0.984], [0.625, 0.976], [0.65, 0.968], [0.675, 0.954], [0.7, 0.939], [0.725, 0.925], [0.75, 0.911], [0.775, 0.897], [0.8, 0.883], [0.825, 0.866], [0.85, 0.845], [0.875, 0.809], [0.9, 0.765], [0.925, 0.705], [0.95, 0.609], [0.975, 0.463], [1, 0.078]],
  own: true, ownTubes: true,
  aa: [{ k: 't25', f: 0.4992, z: 3.4, y: 2.9, noTub: true }, { k: 'd25', f: 0.2308, z: 0, y: 2.3, noTub: true }],
  props: [{ f: 0.928, z: 2.0, depth: 2.5, d: 2.5, blades: 3, toF: 0.84, strutF: 0.91 }],
  rudders: [{ f: 0.96, z: 0, top: 0.5, bottom: 3.5, chord: 3.7 }],
  extra: kageroExtras,
};
