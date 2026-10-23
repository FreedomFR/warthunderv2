// Per-ship hand tuning of the generated models (see shipbuilder.js for the options).
// Keyed by spec id. Anything not listed here is built purely from the spec sheet.
//
//   pagoda: [baseLength, baseWidth, tiers, height]   Japanese pagoda foremast
//   tiers:  explicit bridge tiers                      [{ len, w, h, dx, rake, wings }]
//   elevators / deckEdge: carrier lifts (fractions from the bow; the last one is on the deck edge when deckEdge)
//   funnelW / funnelLen / funnelRake / funnelScale     funnel proportions
//   extra(ctx): free-hand additions with the MeshBuilder (ctx.b) and the parts library (ctx.PT)

import { KAGERO } from './ships/kagero.js';
import { GRAF_SPEE } from './ships/graf_spee.js';
import { TADE } from './ships/tade.js';
import * as SHOKAKU_V4 from './ships/shokaku_v4.js';
import * as IOWA_V4 from './ships/iowa_v4.js';
import * as RICHELIEU_V4 from './ships/richelieu_v4.js';
import * as FLETCHER_V4 from './ships/fletcher_v4.js';
import * as BEARN_V4 from './ships/bearn_v4.js';
import * as GALISSONIERE_V4 from './ships/la_galissoniere_v4.js';
import * as ALGERIE_V4 from './ships/algerie_v4.js';
import * as CLEVELAND_V4 from './ships/cleveland_v4.js';
import * as BALTIMORE_V4 from './ships/baltimore_v4.js';
import * as FANTASQUE_V4 from './ships/fantasque_v4.js';
import * as ESSEX_V4 from './ships/essex_v4.js';
import { TADE_PB39_AA, KAGERO_1944_AA, SHOKAKU_1944_AA, GIOBERTI_1940_AA, GIOBERTI_1942_AA } from './ships/variants_aa.js';
import { VARIANTS } from '../data/variants.js';
import { GIOBERTI } from './ships/gioberti.js';
import { ADAMS } from './ships/adams.js';
import { YAMATO } from './ships/yamato.js';

/**
 * Shokaku class: two funnels trunked out to the starboard side and turned downwards. Measured on the 1942 profile and plan (Commons,
 * CC BY-SA 3.0): flattened ducts 9.3 m long and 5 m wide outboard of the flight deck edge, at 0.474 and 0.523 of the length, 3.6 m
 * deep (top level with the flight deck edge at 13.2 m, exhaust opening downwards at the aft end).
 */
function shokakuFunnels({ b, X, spec, pal, model, MAT, rgb, shade, part }) {
  const col = rgb(pal.funnel), dark = rgb(pal.cap), char = shade(rgb(pal.dark), 1.1);
  const fdY = 14.0, yc = 11.4, zc = 16.9;
  [0.474, 0.523].forEach((f, i) => {
    const x = X(f), poly = [];
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; poly.push([x + Math.cos(a) * 4.65, zc + Math.sin(a) * 2.5]); }
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => {
      b.prism(poly, yc - 1.8, yc + 1.8, col, MAT.HULL, { topScale: 0.92 });                         // the duct
      b.rodZ(x, yc, 12.5, zc - 1, 1.5, 1.6, col, MAT.HULL, { seg: 10 });                             // trunk from the deck edge
      b.cylinder(x - 3.4, yc - 2.2, zc, 1.5, 1.5, yc - 1.5, dark, MAT.DARK, { seg: 12 });           // exhaust opening, downwards at the aft end
    }, () => {
      b.prism(poly.map(([px, pz]) => [x + (px - x) * 0.6, zc + (pz - zc) * 0.6]), yc - 1.8, yc - 0.2, char, MAT.DARK, { topScale: 0.8 });
    });
    model.smoke.push([x - 3.4, yc - 2.6, zc]);
  });
}


/**
 * S-30 class Schnellboot: what the generic builder does not do for a boat (see the `boat` flag in shipbuilder.js). Positions are the measured ones on the reference model
 * (zr: metres along the boat from the middle of the hull, bow positive, in its own frame; the model's x is zr - 1.185 because the hull there runs from -15.2 to 17.57 and ours is centred).
 */
function s30Extras({ b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, note, DT }) {
  const x = (zr) => zr - 1.185;
  const deckAt = (xx) => Y(xx);
  const grey = rgb('#8e9296'), dark = rgb('#2a2c2e'), rust = rgb('#7b3d30'), brass = rgb('#a98f52'), sup = rgb(pal.sup), hullc = rgb(pal.hull);
  // the torpedo-tube doors in the flanks of the forecastle (the tubes lie behind them, pointing forward), a module of their own
  part('tubes0', 'tubes', 'Tubes lance-torpilles', () => {
    for (const sg of [-1, 1]) {
      const xx = x(11.0), zz = sg * 1.95, yy = 2.4;
      b.cylinder(xx, yy - 0.55, zz, 0.58, 0.58, yy + 0.55, shade(hullc, 0.7), MAT.HULL, { seg: 14 });                      // the recess round the door (a disc standing on its edge, see below)
      b.rod(xx - 0.15, xx + 0.12, yy, zz, 0.5, 0.5, rust, MAT.HULL, { seg: 16 });                                          // the door
      b.rod(xx - 1.4, xx - 0.15, yy, zz, 0.27, 0.27, grey, MAT.HULL, { seg: 12 });                                         // the tube, seen through the opening
      b.sphere(xx + 0.14, yy, zz, 0.06, 0.06, 0.06, brass, MAT.HULL, { seg: 6, rings: 4 });
    }
  }, () => { for (const sg of [-1, 1]) b.box(x(11.0), 2.3, sg * 1.95, 0.8, 0.8, 0.8, shade(dark, 1.1), MAT.DARK); });
  model.tubes.length = 0;
  model.tubes.push({ x: x(11.0), y: 2.4, z: 0, n: 2, side: 0 });
  // the two spare torpedoes on the deck, either side of the engine hatches, on their cradles: 7.2 m, 0.53 m
  for (const sg of [-1, 1]) {
    const zt = sg * 2.1, y0 = 2.38, x0 = x(-3.5), x1 = x(3.6);
    b.rod(x0 + 0.3, x1 - 0.7, y0, zt, 0.265, 0.265, grey, MAT.HULL, { seg: 12 });                                           // the body
    b.rod(x1 - 0.7, x1, y0, zt, 0.265, 0.07, shade(grey, 0.9), MAT.HULL, { seg: 12 });                                     // the head
    b.rod(x0, x0 + 0.3, y0, zt, 0.14, 0.265, grey, MAT.HULL, { seg: 12 });                                                 // the tail
    b.rod(x1 - 1.2, x1 - 1.0, y0, zt, 0.28, 0.28, brass, MAT.HULL, { seg: 12 });                                          // the band behind the warhead
    for (const a of [0, 1.5708, 3.1416, 4.7124]) b.block({ x0: x0 - 0.05, x1: x0 + 0.4, hw: 0.02, zc: zt + Math.sin(a) * 0.3, y0: y0 + Math.cos(a) * 0.3 - 0.12, y1: y0 + Math.cos(a) * 0.3 + 0.12 }, shade(grey, 0.85), MAT.HULL);
    for (const cx of [x(-2.3), x(0.4), x(2.2)]) b.block({ x0: cx - 0.18, x1: cx + 0.18, hw: 0.36, zc: zt, y0: deckAt(cx) - 0.1, y1: y0 - 0.12 }, shade(hullc, 0.8), MAT.HULL);   // the cradles
  }
  // the engine hatches between them and the drums at the quarterdeck, the hatches on the forecastle, the wind deflector on it
  const hatch = (z0, z1, zc, hw, h = 0.14, col = shade(sup, 0.8)) => b.block({ x0: x(z0), x1: x(z1), hw, zc, y0: deckAt(x((z0 + z1) / 2)) - 0.05, y1: deckAt(x((z0 + z1) / 2)) + h }, col, MAT.HULL);
  for (const sg of [-1, 1]) {
    hatch(-6.6, -3.7, sg * 0.82, 0.42);
    hatch(-1.2, 0.9, sg * 0.85, 0.5);
  }
  hatch(-13.4, -12.3, 0, 0.75);
  hatch(8.9, 9.5, 0.4, 0.3); hatch(12.0, 13.6, 0, 0.5);
  for (const sg of [-1, 1]) b.cylinder(x(-11.2), deckAt(x(-11.2)) - 0.05, sg * 1.55, 0.3, 0.3, deckAt(x(-11.2)) + 1.15, shade(sup, 0.7), MAT.HULL, { seg: 12 });     // the drums
  for (const sg of [-1, 1]) {
    // the wind deflector: a low vee of plate round the foot of the forecastle gun position
    const zp = sg * 1.3, y = deckAt(x(9.8)) + 0.05;
    b.beam([x(9.2), y, zp], [x(10.9), y, 0], 0.08, 0.34, shade(sup, 0.9), MAT.HULL);
  }
  // the stern: the ladders of the depth-charge racks, the flagstaff leaning aft with its ensign, a hand rail across the transom
  for (const sg of [-1, 1]) for (const zr of [-14.1, -14.8]) b.block({ x0: x(zr) - 0.05, x1: x(zr) + 0.05, hw: 0.32, zc: sg * 0.65, y0: deckAt(x(zr)), y1: deckAt(x(zr)) + 0.2 }, shade(sup, 0.7), MAT.HULL);
  b.beam([x(-14.9), deckAt(x(-14.9)), 0], [x(-15.45), 3.67, 0], 0.06, 0.06, shade(sup, 1.2), MAT.HULL);
  PT.ensign(b, { x: x(-15.45), y: 3.67, z: 0, len: 0.95, h: 0.6, staff: false });
  // the jackstaff on the forecastle with its two stays, the 20 mm tub (the gun is in tw.aa)
  b.cylinder(x(15.75), deckAt(x(15.75)), 0, 0.05, 0.035, 5.25, shade(sup, 1.3), MAT.HULL, { seg: 6 });
  for (const sg of [-1, 1]) DT.stay(b, [x(15.75), 5.2, 0], [x(13.6), deckAt(x(13.6)) + 0.5, sg * 1.15], dark, 0.025);
  b.cylinder(x(12.9), deckAt(x(12.9)), 0, 0.5, 0.5, deckAt(x(12.9)) + 0.5, shade(sup, 0.85), MAT.HULL, { seg: 14 });
  // the wheelhouse: a searchlight and a 20 mm shield on the roof (the gun is in tw.aa), the door and the ports of its after face
  b.cylinder(x(5.9), 3.95, -0.9, 0.22, 0.22, 4.4, shade(sup, 0.9), MAT.HULL, { seg: 10 });
  b.sphere(x(5.9), 4.55, -0.9, 0.24, 0.22, 0.24, shade(sup, 1.1), MAT.HULL, { seg: 10, rings: 6 });
  // the ports in the topsides (five a side, 25 cm across, 1.4 m above the water), measured on the reference
  for (const zr of [5.9, 6.8, 8.9, 9.6, 10.2]) for (const sg of [-1, 1]) {
    const xx = x(zr), hb = hull.halfBeamDeck(xx) * 0.985;
    b.box(xx, 1.35, sg * (hb - 0.02), 0.28, 0.28, 0.12, dark, MAT.DARK);
  }
  // the wheelhouse: a low block with a sloped front (z 4.0-7.6 m, the roof 3.94 m above the water), the raised box on its roof, windows round it; a module of its own that can be wrecked
  const wy0 = deckAt(x(5.8)) - 0.5, wcol = rgb(pal.sup);
  part('wheelhouse', 'bridge', 'Timonerie', () => {
    b.block({ x0: x(4.0), x1: x(7.6), hw: 2.15, y0: wy0, y1: 3.94, tx0: x(4.0), tx1: x(7.6) - 0.9, thw: 2.0 }, wcol, MAT.HULL);
    b.block({ x0: x(6.06), x1: x(6.66), hw: 0.9, y0: 3.9, y1: 4.44 }, shade(wcol, 0.9), MAT.HULL);
    PT.windowBand(b, x(4.0), x(7.6) - 0.4, 2.1, 3.0, 0.5, pal, true, true);
    b.block({ x0: x(3.95), x1: x(4.0), hw: 0.4, y0: deckAt(x(4.0)), y1: deckAt(x(4.0)) + 1.5 }, shade(wcol, 0.7), MAT.HULL);          // the door of its after face
  }, () => b.block({ x0: x(4.0), x1: x(7.4), hw: 2.0, y0: wy0, y1: wy0 + 1.4, tx0: x(4.2), tx1: x(7.0), thw: 1.5 }, shade(dark, 1.15), MAT.DARK));
  // the camera's eye on the bridge and the box the hits are placed against
  const wx = x(5.8);
  model.bridge = { x: wx, y: 3.9, z: 0, towerX: wx, cands: [[x(8.1), 3.55, 0], [x(8.1), 3.55, 1.0], [x(8.1), 3.55, -1.0], [x(6.5), 4.6, 0]] };
  model.superBox = { x0: x(4.0), x1: x(7.6), hw: 2.15, y1: 3.95 };
  // lifelines along the quarterdeck and round the forecastle (fine detail)
  b.group('fine', () => {
    DT.lifelines(b, hull, X(0.985), X(0.56), pal, { base: 0.1, h: 0.85, step: 2.2 });
    DT.lifelines(b, hull, X(0.28), X(0.07), pal, { base: 0.1, h: 0.85, step: 2.2 });
  });
  note(5.3);
}

export const TWEAKS = {
  // the ships measured on reference models have a file each (ships/): they are refined one at a time
  graf_spee: GRAF_SPEE,
  tade: TADE, gioberti: GIOBERTI, adams: ADAMS,
  // S-30 class Schnellboot, measured in metres on orthographic views (side, plan, front, stern, sections every metre) of a reference model of the boat ("S30 S61 (War Thunder) Ninth Wave", KojfDiscord,
  // CC BY 4.0; used to measure only, nothing of it is in the repository): the hull 32.77 m from the stem to the transom, 4.9 m at the waterline and 5.2 m at the deck, a keel 1.5 m below the waterline
  // that runs up to the stem and, abaft 0.86, to a stern 0.6 m shallower; the deck 2.0 m above the water amidships and aft, 1.5 m at the quarterdeck, up to 2.75-2.9 m on the turtleback forecastle
  // (the step is at 0.4, abaft the wheelhouse); three 0.95 m screws (the wings at 1.3 m off the centre line, 0.975 of the length) and three rudders.
  s30: {
    boat: true, mainVariant: 'de37', camber: 0.32, bulwark: 0, towerF: 0.36, bow: { rake: 0.45 },
    fb: [[0, 2.9], [0.1, 2.85], [0.15, 2.8], [0.25, 2.75], [0.3, 2.78], [0.34, 2.7], [0.37, 2.55], [0.405, 2.5], [0.44, 2.05], [0.5, 2.0], [0.7, 1.97], [0.8, 1.95], [0.86, 1.95], [0.89, 1.55], [1, 1.45]],
    planDeck: [[0, 0], [0.017, 0.23], [0.047, 0.47], [0.078, 0.58], [0.108, 0.71], [0.139, 0.82], [0.169, 0.98], [0.2, 1.01], [0.26, 1.01], [0.32, 1.03], [0.385, 1.045], [0.445, 1.057], [0.536, 1.06], [0.6, 1.053], [0.66, 1.037], [0.72, 1.012], [0.78, 0.98], [0.84, 0.93], [0.9, 0.886], [0.96, 0.84], [0.99, 0.6], [1, 0.5]],
    planWL: [[0, 0], [0.033, 0.08], [0.063, 0.16], [0.094, 0.28], [0.124, 0.36], [0.155, 0.43], [0.185, 0.48], [0.216, 0.53], [0.246, 0.6], [0.277, 0.64], [0.307, 0.69], [0.338, 0.74], [0.368, 0.79], [0.399, 0.84], [0.429, 0.91], [0.46, 0.92], [0.49, 0.95], [0.521, 0.98], [0.58, 0.99], [0.612, 1], [0.673, 0.99], [0.735, 0.97], [0.796, 0.94], [0.857, 0.89], [0.918, 0.85], [0.979, 0.8], [1, 0.6]],
    keel: [[0, 0], [0.02, 0.02], [0.033, 0.33], [0.063, 0.52], [0.094, 0.64], [0.124, 0.71], [0.155, 0.75], [0.185, 0.8], [0.216, 0.83], [0.246, 0.86], [0.277, 0.88], [0.307, 0.89], [0.338, 0.91], [0.368, 0.92], [0.4, 0.93], [0.46, 0.95], [0.52, 0.96], [0.58, 0.975], [0.64, 0.98], [0.7, 0.99], [0.75, 1], [0.857, 1], [0.89, 0.5], [1, 0.38]],
    props: [{ f: 0.975, depth: 1.15, d: 0.95, blades: 3, toF: 0.86 }, { f: 0.975, z: 1.3, depth: 1.15, d: 0.95, blades: 3, toF: 0.88 }],
    rudders: [{ f: 0.99, top: 0.45, bottom: 1.8, chord: 0.6, t: 0.06, stock: 0.8 }, { f: 0.985, z: 0.78, top: 0.45, bottom: 1.5, chord: 0.4, t: 0.05, stock: 0.8 }],
    aa: [{ k: 'f20', f: 0.143, z: 0, y: 0.55, noTub: true }],
    extra: s30Extras,
  },
  // Iowa: measured on the class profile and plan drawing (Commons, public domain), checked on photographs 80-G-K-15631 (port profile in
  // silhouette) and NH 44538. Heights are above the local deck: 01 level 2.3 m, 02 level 4.8 m, forward bridge 13.2 m, the block around
  // the forward funnel 19.4 m, Mk 38 director 29.3-32.5 m; funnel tops 23.8 / 22.9 m; after director tower 18 m.
  iowa: {
    v4: IOWA_V4, aaCap: { 40: 20, 20: 49 },      // 80 x 40 mm in 20 quads and 49 x 20 mm (1943 fit)
    mainVariant: 'mk7', secVariant: ['mk28'], houseH: 2.3,
    // freeboards from the profile: 13.5 m at the stem, about 6.5 m amidships, 7.8 m at the stern; a bulwark only round the bow
    fb: [[0, 10.4], [0.02, 9.75], [0.056, 8.72], [0.093, 8.0], [0.15, 6.9], [0.204, 5.97], [0.26, 5.5], [0.315, 5.19], [0.5, 5.09], [0.8, 5.1], [0.87, 5.18], [0.906, 5.38], [0.944, 5.63], [1, 6.4]],      // the deck edge measured on the reference model (the v4 model is drawn on it)
    bulwarkF: [0, 0.07],
    bow: { rake: 6.2, pr: 1.6 }, stern: { overhang: 2.5 },
    // four shafts: the outboard ones on exposed shafts with a bracket and four-bladed screws, the inboard ones in skegs with five
    // blades; twin rudders behind the inboard screws (photographs of Missouri in dry dock; positions estimated, no plan of the stern)
    props: [{ f: 0.905, z: 9.0, depth: 6.3, d: 5.3, blades: 4, toF: 0.80, strutF: 0.895 }, { f: 0.93, z: 3.4, depth: 6.8, d: 5.6, blades: 5, toF: 0.80, skeg: true }],
    rudders: [{ f: 0.955, z: 3.4, top: 2.6, bottom: 8.8, chord: 6.0 }],
    keel: [[0, 0.75], [0.04, 1], [0.84, 1], [0.88, 0.7], [0.92, 0.45], [0.96, 0.3], [1, 0.2]],   // keel line as a fraction of the draft (estimated)
    // hull lines: the deck edge from the plan view (a long, narrow bow, full beam only from turret 2 aft); the waterline a little finer
    // than the deck forward of turret 2, where the bow flares, and plumb sides amidships
    planDeck: [[0, 0.08], [0.02, 0.17], [0.04, 0.22], [0.06, 0.25], [0.1, 0.31], [0.13, 0.36], [0.16, 0.41], [0.2, 0.49], [0.25, 0.63], [0.3, 0.77], [0.35, 0.87], [0.4, 0.94], [0.45, 0.985], [0.5, 1], [0.7, 1], [0.8, 0.965], [0.85, 0.9], [0.9, 0.77], [0.95, 0.58], [0.98, 0.41], [1, 0.3]],
    planWL: [[0, 0], [0.03, 0.1], [0.06, 0.17], [0.1, 0.25], [0.15, 0.34], [0.2, 0.44], [0.25, 0.57], [0.3, 0.72], [0.35, 0.85], [0.4, 0.94], [0.45, 0.985], [0.5, 1], [0.72, 1], [0.8, 0.965], [0.85, 0.895], [0.9, 0.76], [0.95, 0.56], [1, 0.3]],
    house: { plan: [[0.393, 3], [0.425, 15], [0.64, 15], [0.71, 2]] },
    decks: [
      { plan: [[0.412, 3], [0.44, 11.5], [0.63, 11.5], [0.675, 3]], y: [2.3, 4.8] },                // 02 level
      { f: [0.399, 0.48], hw: 9, y: [4.8, 8.6], windows: true },                                    // forward superstructure: a plumb front at 0.399
      { f: [0.399, 0.457], hw: 7.5, y: [8.6, 13.7], windows: true, wings: 1.6, rail: true },          // bridges
      { f: [0.405, 0.416], hw: 3.2, y: [13.7, 16.3], windows: true, rail: true },                   // pilot house
      { f: [0.416, 0.432], hw: 6, y: [13.7, 15.0] },
      { f: [0.535, 0.598], hw: 8.5, y: [4.8, 9.0] },                                                  // between the funnels
      { f: [0.632, 0.712], hw: 8, y: [4.8, 8.7], windows: true },                                    // after superstructure
      { f: [0.645, 0.664], hw: 6, y: [8.7, 12.5] },
      { f: [0.662, 0.672], round: true, hw: 2.2, y: [12.5, 15.2], taper: 0.9 },                      // after director tower
      { f: [0.672, 0.683], hw: 3.5, y: [8.7, 14.0] },                                                // searchlight platform
      { f: [0.693, 0.703], hw: 2.5, y: [8.7, 13.5] },                                                // after Mk 51 director tower
    ],
    // the armoured conning tower (17.3 in) at the front of the bridge structure: an oval drum with vision slits
    conning: { f: 0.408, y: 8.6, h: 3.4, rx: 3.4, rz: 4.2 },
    towerF: 0.484, towerY0: 4.8,
    tiers: [
      { y0: 0, len: 21.6, w: 9, h: 14.6, dx: -3.0, windows: true },                                   // block around the forward funnel (0.455-0.535)
      { len: 19.5, w: 15, h: 1.2, dx: -3.5, windows: false },                                         // wide platform
      { len: 7, w: 7.5, h: 5.3, dx: -0.6, round: true, taper: 0.95 },                                // tower
      { len: 10.4, w: 9.5, h: 3.4, dx: 1.7 },                                                         // top house under the Mk 38 (front at 0.458)
    ],
    dir0: { dx: 1.4, w: 4.2, l: 4.6, h: 3.0 },
    foremast: { dx: -4.8, y0: 23.9 },
    // hooded caps: the after edge of the forward funnel 3 m lower than its forward edge, 2 m on the after funnel; no outside pipes
    funnels: [{ lx: 9.5, lz: 6.4, y0: 4.8, h: 18.3, rake: 0.6, top: 0.96, capSlope: 3.0, pipes: false }, { lx: 9.0, lz: 6.6, y0: 4.8, h: 18.3, rake: 0.6, top: 0.96, capSlope: 2.0, pipes: false }],
    mastY0: { 1: 8.7 },
    directors: [
      { f: 0.44, y: 13.7, ped: 4.2, w: 3.6, l: 3.6, h: 2.4, label: 'Directeur Mk 37 avant' },
      { f: 0.515, z: 6.2, y: 12.6, ped: 0.8, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 tribord' },
      { f: 0.515, z: -6.2, y: 12.6, ped: 0.8, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 bâbord' },
      { f: 0.572, y: 9.0, ped: 3.2, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 arrière' },
      { f: 0.667, y: 15.2, w: 4.0, l: 4.4, h: 3.2, label: 'Directeur Mk 38 arrière' },
    ],
    // light AA as drawn on the plan view (1945): 20 quadruple Bofors (two on the forecastle, one on each of turrets 2 and 3, pairs round
    // the bridge, the funnels and the after director, two on the deck edge aft, two on the stern) and about 44 Oerlikons
    aa: [
      { k: 'q40', f: 0.192, z: 4.3, y: 0 }, { k: 'q40', f: 0.383, z: 0, y: 6.75 }, { k: 'q40', f: 0.427, z: 12.5, y: 2.3 },
      { k: 'q40', f: 0.468, z: 5.0, y: 13.7 }, { k: 'q40', f: 0.562, z: 6.3, y: 9.0 }, { k: 'q40', f: 0.582, z: 6.3, y: 9.0 },
      { k: 'q40', f: 0.600, z: 6.3, y: 9.0 }, { k: 'q40', f: 0.676, z: 5.6, y: 8.7 }, { k: 'q40', f: 0.69, z: 14.8, y: 2.3 },
      { k: 'q40', f: 0.735, z: 0, y: 4.6 }, { k: 'q40', f: 0.986, z: 4.1, y: 0 },
      { k: 'o20', f: 0.006, z: 1.6, y: 0 }, { k: 'o20', f: 0.16, z: 3.3, y: 0 },
      { k: 'o20', f: 0.365, z: 11, y: 0 }, { k: 'o20', f: 0.375, z: 13, y: 0 }, { k: 'o20', f: 0.385, z: 14.5, y: 0 },
      { k: 'o20', f: 0.455, z: 16, y: 0 }, { k: 'o20', f: 0.462, z: 16, y: 0 }, { k: 'o20', f: 0.47, z: 16, y: 0 },
      { k: 'o20', f: 0.535, z: 14.3, y: 2.3 }, { k: 'o20', f: 0.545, z: 14.3, y: 2.3 }, { k: 'o20', f: 0.555, z: 14.3, y: 2.3 },
      { k: 'o20', f: 0.565, z: 14.3, y: 2.3 }, { k: 'o20', f: 0.575, z: 14.3, y: 2.3 }, { k: 'o20', f: 0.585, z: 14.3, y: 2.3 },
      { k: 'o20', f: 0.735, z: 14.5, y: 0 }, { k: 'o20', f: 0.745, z: 14.5, y: 0 },
      { k: 'o20', f: 0.85, z: 5, y: 0 }, { k: 'o20', f: 0.85, z: 1.5, y: 0 }, { k: 'o20', f: 0.835, z: 6, y: 0 }, { k: 'o20', f: 0.82, z: 6.5, y: 0 },
    ],
    // the ship's boats on chocks on the main deck abreast the after superstructure (as drawn on the profile)
    boats: [{ f0: 0.672, f1: 0.692, z: 11, y: 0.2, cabin: true }],
    // catapults on the fantail, along the deck edges, their bow ends turned outboard; crane on the stern
    cat: { f: 0.928, z: 9.5, yaw: 0.24, len: 20, craneF: 0.992, craneH: 8.7, craneLen: 10.4, craneDir: 1, craneAng: 0.155, craneSide: 0, craneW: 1.0 },
  },
  // Littorio class (Vittorio Veneto): measured on the ONI 202 identification sheet (Feb 1943, public domain; the height scale in feet
  // confirms 5.22 px/m both ways). Forecastle deck 8.9 m above the waterline from the stem (9.8 m) to 0.79 of the length, the quarterdeck
  // 5.7 m; turrets A / B / C pivot at 0.287 / 0.372 / 0.752 (B 4.5 m above A); two oval funnels at 0.512 and 0.573 (tops 25.4 / 24.4 m);
  // the tower at 0.4435 (top 35 m) with a pole mast behind it to 49.9 m; the pole mainmast on its own tower at 0.628 (34.5 m); a single
  // catapult and a crane on the stern. Hull widths from the plan; the waterline widths and the underwater body are estimated.
  littorio: {
    mainVariant: 'lit381', secVariant: ['lit152'], houseH: 1.3, bulwarkF: [0, 0.06],
    fb: [[0, 9.8], [0.03, 9.4], [0.06, 9.1], [0.1, 8.9], [0.78, 8.9], [0.795, 5.8], [0.9, 5.7], [1, 5.9]],
    planDeck: [[0, 0.070], [0.05, 0.362], [0.1, 0.502], [0.15, 0.642], [0.2, 0.747], [0.25, 0.817], [0.3, 0.864], [0.35, 0.945], [0.4, 0.981], [0.45, 1.016], [0.5, 1.016], [0.55, 1.027], [0.6, 1.016], [0.65, 0.993], [0.7, 0.958], [0.75, 0.923], [0.8, 0.829], [0.85, 0.747], [0.9, 0.619], [0.95, 0.420], [1, 0.117]],
    planWL: [[0, 0], [0.03, 0.2], [0.05, 0.29], [0.1, 0.42], [0.15, 0.55], [0.2, 0.66], [0.25, 0.74], [0.3, 0.81], [0.35, 0.9], [0.4, 0.95], [0.45, 0.99], [0.5, 1], [0.6, 1], [0.65, 0.97], [0.7, 0.94], [0.75, 0.9], [0.8, 0.81], [0.85, 0.72], [0.9, 0.6], [0.95, 0.4], [1, 0.11]],
    bow: { rake: 3.7, pr: 1.5 }, stern: { overhang: 1.5, rise: 8 },
    house: { plan: [[0.395, 6], [0.42, 10.5], [0.662, 10.5], [0.70, 6]] },
    decks: [
      { f: [0.645, 0.682], hw: 8, y: [1.3, 2.7] },                                                     // aft house
      { f: [0.612, 0.644], round: true, hw: 3.2, y: [1.3, 12.1], taper: 0.85 },                        // mainmast tower
      { f: [0.499, 0.589], hw: 7.5, y: [1.3, 3.2] },                                                   // base of the funnels
    ],
    towerF: 0.4435, towerY0: 1.3,
    tiers: [
      { len: 9.5, w: 11, h: 7.0, windows: true },
      { len: 8.5, w: 8.4, h: 4.5, windows: true },
      { len: 7.5, w: 7.0, h: 4.5, windows: true },
      { len: 5.6, w: 5.6, h: 5.0, windows: true },
      { len: 5.0, w: 4.4, h: 4.0 },
    ],
    dir0: { dx: 0, w: 3.4, l: 3.2, h: 2.0 },
    foremast: { dx: -7.4, y0: 8.0 },
    mastY0: { 1: 13.4 },
    funnels: [{ lx: 8.6, lz: 7.4, y0: 1.3, h: 15.6, rake: 0.8, top: 0.92, capSlope: 2.0, pipes: false }, { lx: 8.6, lz: 7.4, y0: 1.3, h: 14.8, rake: 0.8, top: 0.92, capSlope: 2.0, pipes: false }],
    directors: [{ f: 0.628, y: 12.1, w: 3.2, l: 3.0, h: 2.2, label: 'Directeur arrière' }],
    cat: { f: 0.935, y: 0.1, yaw: 0, len: 22, craneF: 0.99, craneH: 6.5, craneLen: 14, craneDir: 1, craneAng: 0.5, craneSide: 0, craneW: 0.6 },
  },
  // Richelieu (1943): measured on the class inboard profile (Commons, CC BY-SA 4.0; 15.05 px/m both ways, drawn hull depth 9.4 m): a
  // centre-line section, so only the structures on the centre line are checked; forecastle 9.2 m at the stem sloping to 7 m, flush deck 7 m
  // amidships, 6.7 m aft; turrets A and B on training axes 0.297 / 0.432, the massive tower at 0.52 (top 35 m) with the conning tower block
  // in front of it, the funnel merged with the aft mast ("mack") at 0.634, the hangar roof 4.8 m above the deck at 0.746-0.845, the
  // catapult at 0.907-0.992; hull widths are estimated (no plan view).
  richelieu: {
    v4: RICHELIEU_V4, aa: [],      // the light mounts are the model's
    mainVariant: 'rich380', secVariant: ['fr152'], houseH: 4.8, bulwarkF: [0, 0.05],
    fb: [[0, 9.2], [0.05, 8.5], [0.1, 8.0], [0.15, 7.5], [0.2, 7.2], [0.3, 7.0], [0.8, 7.0], [0.85, 6.7], [1, 6.7]],
    keel: [[0, 0.8], [0.05, 0.92], [0.1, 0.97], [0.15, 0.94], [0.85, 0.94], [0.9, 0.82], [0.93, 0.62], [0.96, 0.38], [1, 0.2]],
    bow: { rake: 3.5, pr: 1.5, forefoot: 6 }, stern: { overhang: 2, rise: 7 },
    props: [{ f: 0.925, z: 3.8, depth: 5.2, d: 4.9, blades: 3, toF: 0.82, skeg: true }, { f: 0.90, z: 7.8, depth: 6.4, d: 4.9, blades: 3, toF: 0.80, strutF: 0.885 }],
    rudders: [{ f: 0.961, top: 1.7, bottom: 8.7, chord: 5.5 }],
    house: { plan: [[0.46, 5], [0.49, 8.5], [0.615, 8.5], [0.65, 6]] },
    decks: [
      { f: [0.466, 0.499], hw: 6.0, y: [4.8, 13.7], windows: true },                                   // armoured conning tower block, in front of the tower
      { f: [0.609, 0.626], round: true, hw: 1.6, y: [4.8, 20.0], taper: 0.9 },                          // the mack's mast column, up to 28.2 m
      { f: [0.746, 0.845], hw: 8.0, y: [0, 4.8] },                                                       // aircraft hangar (the roof is the deck of the stern)
      { f: [0.673, 0.679], hw: 2.0, y: [0, 10.6] }, { f: [0.661, 0.667], hw: 2.0, y: [0, 10.6] },        // legs of the aft tower
      { f: [0.661, 0.679], hw: 3.0, y: [10.6, 11.2] },
    ],
    towerF: 0.52, towerY0: 4.8,
    tiers: [
      { len: 11.5, w: 11, h: 2.0, windows: true },
      { len: 9.2, w: 9.2, h: 6.5, windows: true },
      { len: 8.9, w: 8.2, h: 5.5, windows: true },
      { len: 8.9, w: 7.2, h: 4.5, windows: true },
      { len: 4.5, w: 5.0, h: 3.2, dx: -1.2 },
    ],
    dir0: { dx: -1.2, w: 3.6, l: 3.6, h: 1.6 },
    foremast: { dx: -2.0, y0: 24.0 },
    funnels: [{ lx: 6.4, lz: 7.4, y0: 4.8, h: 13.1, rake: 1.5, top: 0.94, capSlope: 0, pipes: false }],
    mastY0: { 1: 4.8, 2: 4.8 },
    directors: [{ f: 0.62, y: 21.2, w: 2.6, l: 2.6, h: 1.8, label: 'Directeur de 152 mm du mack' }, { f: 0.676, y: 8.6, w: 3.0, l: 3.0, h: 2.2, label: 'Directeur de 380 mm arrière' }],
    cat: { f: 0.95, z: 5.5, yaw: 0.15, len: 21, y: 3.3, craneF: 0.985, craneH: 5, craneLen: 13, craneDir: 1, craneAng: 0.5, craneSide: 0, craneW: 0.6 },
  },
  // King George V (1941): measured on Manuel P. Gonzalez Lopez's profile and plan "King George V 1941 / Duke of York 1945" (all rights
  // reserved: consulted for measurements only, credited in the README, never redistributed) with the metre ruler of the sheet (11.77 px/m):
  // the spec had the turrets 25-40 m out. Deck edge 6.9 m at the stem, 5.2 m amidships, 5.3 m aft; the deckhouse (boat deck) 4.4 m above the
  // deck; turrets A / B / Y at 0.287 / 0.352 / 0.760; the funnels at 0.503 and 0.603 (tops 24.3 m); the bridge block 0.378-0.450 (20.5 m,
  // the director tower to 31 m); the tripod foremast at 0.464 (platform 31.8 m, top 48.2 m); the mainmast at 0.690 (platform 27.4 m, top
  // 42.8 m); two cranes with their jibs pointing inboard and the athwartships catapult at 0.553; four pairs of 133 mm twins; props and
  // rudder as drawn (athwartship offsets of the shafts estimated). The light AA is still the random layout (not measured).
  kgv: {
    houseH: 4.4, towerF: 0.414, towerY0: 4.4, bulwarkF: [0, 0],
    fb: [[0, 7.5], [0.02, 7.0], [0.05, 6.5], [0.1, 6.3], [0.2, 6.0], [0.3, 5.6], [0.4, 5.3], [0.5, 5.2], [0.7, 5.3], [0.8, 5.4], [0.9, 5.4], [1, 5.4]],
    planDeck: [[0, 0.022], [0.05, 0.281], [0.1, 0.469], [0.15, 0.610], [0.2, 0.718], [0.25, 0.798], [0.3, 0.863], [0.35, 0.917], [0.4, 0.960], [0.45, 0.982], [0.5, 0.987], [0.55, 0.987], [0.6, 0.976], [0.65, 0.960], [0.7, 0.933], [0.75, 0.896], [0.8, 0.836], [0.85, 0.755], [0.9, 0.610], [0.95, 0.388], [1, 0.070]],
    planWL: [[0, 0], [0.03, 0.14], [0.06, 0.26], [0.1, 0.38], [0.15, 0.52], [0.2, 0.63], [0.25, 0.72], [0.3, 0.8], [0.35, 0.88], [0.4, 0.94], [0.45, 0.975], [0.5, 0.987], [0.6, 0.976], [0.7, 0.93], [0.8, 0.82], [0.9, 0.58], [0.95, 0.36], [1, 0.06]],
    keel: [[0, 0.1], [0.015, 0.8], [0.03, 0.893], [0.93, 0.893], [0.965, 0.8], [0.975, 0.35], [1, 0.2]],
    bow: { rake: 1.4, pr: 1.5, forefoot: 3.5 }, stern: { overhang: 0.6, rise: 6 },
    props: [{ f: 0.934, z: 3.6, depth: 5.7, d: 4.2, blades: 3, toF: 0.85, skeg: true }, { f: 0.8835, z: 8.8, depth: 5.7, d: 4.2, blades: 3, toF: 0.82, strutF: 0.872 }],
    rudders: [{ f: 0.965, top: 3.0, bottom: 9.5, chord: 4.8 }],
    house: { plan: [[0.378, 7.5], [0.40, 8.8], [0.45, 9.5], [0.46, 12], [0.60, 12.3], [0.65, 10.5], [0.69, 7], [0.726, 0.5]] },
    decks: [
      { f: [0.378, 0.450], hw: 8.8, y: [4.4, 10.0], windows: true },                                      // the lower bridge block
      { f: [0.388, 0.447], hw: 7.2, y: [10.0, 15.3], windows: true, wings: 1.2, rail: true },
      { f: [0.385, 0.404], hw: 3.4, y: [15.3, 19.3], windows: true },                                     // compass platform
      { f: [0.4355, 0.4505], round: true, hw: 2.5, y: [15.3, 25.4], taper: 0.88 },                      // the director control tower
      { f: [0.618, 0.69], hw: 9.5, y: [4.4, 7.9] },                                                      // the boat deck and its houses abaft the after funnel
      { f: [0.69, 0.726], hw: 4.5, y: [4.4, 6.0] },
    ],
    tiers: [
      { len: 16.4, w: 17.6, h: 5.6, windows: true },
      { len: 13.6, w: 14.4, h: 5.3, windows: true, wings: 1.0 },
      { len: 3.2, w: 5.0, h: 2.5, dx: 0, windows: false },
    ],
    dir0: { dx: -4.2, w: 4.6, l: 4.0, h: 2.0 },
    foremast: { dx: -11.4, y0: 8.0, base: 4.4, apex: 0.57, platform: 0.6, spread: 3.0, back: 4.5, front: 1.0 },
    mastY0: { 1: 4.4 },
    funnels: [{ lx: 6.8, lz: 6.2, y0: 4.4, h: 14.5, rake: 0.4, top: 0.9, pipes: false, capSlope: 0.4 }, { lx: 6.8, lz: 6.2, y0: 4.4, h: 14.5, rake: 0.4, top: 0.9, pipes: false, capSlope: 0.4 }],
    // 133 mm twins in pairs on the platform deck (the spec pairs moved to the plan): abreast the bridge, the forward funnel, the after funnel
    // and the after superstructure
    directors: [{ f: 0.4425, y: 25.4, w: 3.4, l: 3.4, h: 1.8, kind: 'dome', label: 'Directeur de tir principal (DCT)' }],
    // two cranes on the boat deck with their jibs pointing forward and inboard; the athwartships catapult between the funnels
    cat: { f: 0.553, y: 0.9, yaw: Math.PI / 2, len: 31, craneF: 0.588, craneZ: 9.8, craneBoth: true, craneInboard: true, craneY: 4.4, craneH: 3.0, craneLen: 8.5, craneDir: 1, craneAng: 0.28, craneSide: 0.82, craneW: 0.45 },
    // ship's boats on skid beams across the boat deck aft of the after funnel
    boats: [{ f0: 0.595, f1: 0.633, z: -9.2, y: 4.9, cabin: true, one: true }, { f0: 0.603, f1: 0.646, z: -6.0, y: 4.9, one: true }, { f0: 0.61, f1: 0.648, z: -2.8, y: 4.9, one: true }, { f0: 0.61, f1: 0.648, z: 2.2, y: 4.9, one: true }, { f0: 0.603, f1: 0.646, z: 5.4, y: 4.9, one: true }, { f0: 0.595, f1: 0.633, z: 8.6, y: 4.9, cabin: true, one: true }],
  },
  // Admiral Hipper class (ONI 204 sheet of Prinz Eugen, August 1942, public domain; profile and plan at one scale): a forecastle at 5.1 m (6.9 m at
  // the stem), a stern deck at 5.8-6.0 m; turrets A / B at 0.232 / 0.283 (B 2.3 m higher), C / D at 0.75 / 0.80; the tower 0.375-0.44 stepped up to the
  // director drum at 29.5 m, the foremast pole at 0.437 (top 35.7 m); one big oval funnel at 0.475 (top ~21 m); the catapult and crane amidships; the
  // mainmast pole at 0.60 (top 38.5 m) and an after tower at 0.595-0.62 (17 m); 105 mm twin sponsons at 0.392 / 0.572 / 0.653.
  admiral_hipper: {
    mainVariant: 'drh203', dirKind: 'drum', houseH: 4.3, bulwarkF: [0, 0.05],
    fb: [[0, 6.9], [0.05, 6.4], [0.1, 5.65], [0.15, 5.25], [0.2, 5.1], [0.5, 5.2], [0.7, 5.4], [0.8, 5.7], [1, 6.0]],
    planDeck: [[0, 0.122], [0.05, 0.389], [0.1, 0.511], [0.15, 0.645], [0.2, 0.803], [0.25, 0.888], [0.3, 0.973], [0.35, 1.022], [0.4, 1.034], [0.45, 1.034], [0.5, 1.034], [0.55, 1.022], [0.6, 1.022], [0.65, 1.05], [0.7, 0.937], [0.75, 0.9], [0.8, 0.803], [0.85, 0.693], [0.9, 0.572], [0.95, 0.4], [1, 0.3]],
    planWL: [[0, 0], [0.04, 0.3], [0.08, 0.47], [0.15, 0.6], [0.25, 0.8], [0.35, 0.93], [0.5, 1], [0.6, 1], [0.7, 0.95], [0.8, 0.82], [0.9, 0.58], [0.95, 0.4], [1, 0.3]],
    house: { plan: [[0.31, 6.5], [0.34, 8.5], [0.45, 9.2], [0.62, 9.2], [0.70, 7.0]] },
    decks: [
      { f: [0.508, 0.522], hw: 3.5, y: [0, 8.4] },
      { f: [0.551, 0.560], hw: 3.3, y: [0, 8.5] },
      { f: [0.567, 0.588], hw: 4.1, y: [0, 6.9] },
      { f: [0.591, 0.621], hw: 2.5, y: [0, 11.7] },
      { f: [0.631, 0.647], hw: 3.9, y: [0, 6.0] },
      { f: [0.661, 0.687], hw: 2.5, y: [0, 11.0] },
      { f: [0.689, 0.713], hw: 3.0, y: [0, 8.3] },
    ],
    towerF: 0.4075, towerY0: 4.3,
    tiers: [
      { len: 13.0, w: 9.0, h: 4.2, windows: true },
      { len: 11.5, w: 7.0, h: 6.2, windows: true, wings: 0.8 },
      { len: 7.2, w: 5.6, h: 6.0, round: true, taper: 0.92 },
      { len: 5.4, w: 5.0, h: 3.5, round: true, taper: 0.9 },
    ],
    dir0: { dx: 0, w: 4.4, l: 4.0, h: 1.0 },
    foremast: { dx: -6.3, y0: 14.8 },
    funnels: [{ lx: 8.6, lz: 7.0, h: 11.8, rake: 0.5, top: 0.9, pipes: false }],
    mastY0: { 1: 4.3 },
  },
  // Konigsberg class (Koln, ONI 204 sheet of August 1942, public domain; profile and plan at one scale): a forecastle at 6.8 m (7.7 m at the stem),
  // the main deck 6.1 m, a quarterdeck at 4.1 m from f 0.73; turrets A / B / C at 0.176 / 0.71 / 0.794 (B stands on the high deck, not over C);
  // the bridge base 0.248-0.31, a narrow tower pole at 0.29 (platform 26 m, top 33.7 m); two funnels at 0.335 and 0.452 (tops 17.6 m); the
  // aircraft platform with its turntable catapult 0.353-0.425 (11.9 m); the mainmast at 0.469 (top 30.5 m) with a derrick jib pointing aft.
  koenigsberg: {
    houseH: 3.0, bulwarkF: [0, 0.04],
    fb: [[0, 7.7], [0.1, 7.0], [0.3, 6.5], [0.5, 6.1], [0.7, 6.1], [0.73, 4.2], [1, 4.1]],
    planDeck: [[0, 0.099], [0.05, 0.472], [0.1, 0.671], [0.15, 0.771], [0.2, 0.87], [0.25, 0.97], [0.3, 0.995], [0.35, 1.02], [0.4, 1.069], [0.45, 1.069], [0.5, 1.044], [0.55, 1.094], [0.6, 1.094], [0.65, 1.069], [0.7, 0.995], [0.75, 0.95], [0.8, 0.87], [0.85, 0.8], [0.9, 0.72], [0.95, 0.6], [1, 0.45]],
    planWL: [[0, 0], [0.05, 0.33], [0.1, 0.52], [0.2, 0.74], [0.3, 0.9], [0.4, 0.97], [0.5, 1], [0.6, 1], [0.7, 0.96], [0.8, 0.84], [0.9, 0.66], [0.95, 0.52], [1, 0.4]],
    house: { plan: [[0.248, 4.5], [0.28, 5.8], [0.60, 5.8], [0.66, 4.5]] },
    decks: [
      { f: [0.248, 0.312], hw: 4.2, y: [0, 5.6], windows: true },
      { f: [0.26, 0.285], hw: 3.0, y: [5.6, 9.7], windows: true },
      { f: [0.282, 0.298], round: true, hw: 1.4, y: [3.0, 20.5], taper: 0.8 },
      { f: [0.353, 0.425], hw: 4.0, y: [0, 5.4] },
      { f: [0.537, 0.549], hw: 2.9, y: [0, 8.8] },
    ],
    towerF: 0.29, towerY0: 20.0,
    tiers: [{ len: 4.0, w: 4.2, h: 2.0, round: true, taper: 0.9 }],
    dir0: { dx: 0, w: 3.0, l: 3.0, h: 1.6 },
    foremast: { dx: 0, y0: 22.0 },
    funnels: [{ lx: 4.6, lz: 5.0, h: 8.5, rake: 0.4, top: 0.95, pipes: false }, { lx: 5.0, lz: 5.0, h: 8.6, rake: 0.4, top: 0.95, pipes: false }],
    mastY0: { 1: 3.0 },
    cat: { f: 0.39, y: 5.4, yaw: Math.PI / 2, len: 14, craneF: 0.4685, craneY: 0, craneH: 11.8, craneLen: 9.5, craneDir: -1, craneAng: 0.15, craneSide: 0, craneW: 0.5 },
  },
  // Montecuccoli class (ONI 202 sheet, public domain; profile and plan at one scale): forecastle 6.4 m, quarterdeck 4.8 m abaft f 0.58; turrets A / B
  // at 0.205 / 0.262 (B superfiring), X / Y at 0.775 / 0.83; the round armoured tower bridge at 0.31, funnels at 0.392 and 0.632 (tops 18.9 / 18.6 m),
  // the catapult 0.50-0.58 at 9 m, the mainmast at 0.60 (top 35 m) with a derrick jib leaning forward from the after funnel.
  montecuccoli: {
    mainVariant: 'it152', dirKind: 'drum', houseH: 3.2, bulwarkF: [0, 0.04],
    fb: [[0, 7.3], [0.04, 6.6], [0.2, 6.3], [0.5, 6.4], [0.53, 5.9], [0.64, 5.7], [0.7, 5.0], [0.75, 4.8], [1, 4.5]],
    planDeck: [[0, 0], [0.042, 0.593], [0.083, 0.715], [0.125, 0.809], [0.167, 0.849], [0.208, 0.917], [0.25, 0.957], [0.292, 0.998], [0.333, 1.025], [0.375, 1.1], [0.417, 1.065], [0.458, 1.079], [0.5, 1.092], [0.583, 1.092], [0.625, 1.065], [0.667, 1.1], [0.708, 1.038], [0.75, 0.957], [0.792, 0.903], [0.833, 0.809], [0.875, 0.607], [0.917, 0.553], [0.958, 0.378], [1, 0.189]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.76], [0.3, 0.9], [0.4, 0.97], [0.5, 1], [0.6, 1], [0.7, 0.95], [0.8, 0.82], [0.9, 0.6], [0.95, 0.42], [1, 0.25]],
    house: { plan: [[0.285, 5.0], [0.31, 7.0], [0.55, 7.5], [0.70, 6.0]] },
    decks: [
      { f: [0.285, 0.34], hw: 4.3, y: [0, 4.4], windows: true },         // forebridge base, 10.7 m
      { f: [0.30, 0.335], hw: 3.2, y: [4.4, 6.2], windows: true },       // 12.5 m
      { f: [0.303, 0.320], round: true, hw: 1.9, y: [6.2, 14.9], taper: 0.85 },   // the round armoured tower, director on top at 21.2 m
      { f: [0.336, 0.37], hw: 4.2, y: [0, 2.7] },                        // 9.0 m
      { f: [0.415, 0.566], hw: 3.9, y: [0, 2.9] },                       // boat deck, 9.3 m
      { f: [0.647, 0.675], hw: 3.6, y: [0, 6.9] },                       // after bridge, 12.5 m
      { f: [0.668, 0.72], hw: 4.1, y: [0, 1.9] },                        // 7.0 m
    ],
    towerF: 0.31, towerY0: 9.5,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 3.4, l: 3.4, h: 1.6 },
    funnels: [{ lx: 6.1, lz: 5.0, h: 7.9, rake: 1.0, top: 0.95, pipes: false }, { lx: 5.7, lz: 4.8, h: 9.0, rake: 1.0, top: 0.95, pipes: false }],
    mastY0: { 1: 5.7 },
    cat: { f: 0.54, z: 0, yaw: 0, len: 17, y: 2.9, craneF: 0.618, craneY: 2.7, craneH: 3.0, craneLen: 21, craneDir: 1, craneAng: 1.1, craneSide: 0, craneW: 0.6 },
  },
  // Zara class (ONI sheet of 1942, public domain; profile and plan at one scale): forecastle 6.9 m sweeping down to the 4.4 m deck from f 0.27 to 0.5;
  // turrets A / B at 0.279 / 0.327 (B 2.7 m higher), X / Y at 0.694 / 0.745; the massive tower 0.365-0.426 (director top 30 m, spire 31.8 m), funnels at
  // 0.463 and 0.603 (tops 19.7 / 19.0 m), the tripod mainmast at 0.57 (platform 25 m, top 38 m), an open lattice tower at 0.657; the catapult rails on the
  // forecastle (f 0.03-0.20).
  zara: {
    mainVariant: 'zara203', dirKind: 'drum', houseH: 3.1, bulwarkF: [0, 0.04],
    fb: [[0, 7.3], [0.04, 7.2], [0.2, 6.9], [0.27, 6.9], [0.35, 5.8], [0.44, 5.0], [0.5, 4.6], [0.6, 4.4], [1, 4.2]],
    planDeck: [[0, 0.123], [0.042, 0.347], [0.083, 0.499], [0.125, 0.621], [0.167, 0.715], [0.208, 0.802], [0.25, 0.86], [0.292, 0.925], [0.333, 0.968], [0.375, 1.004], [0.417, 1.026], [0.458, 1.02], [0.5, 1.02], [0.542, 1.02], [0.583, 1.02], [0.625, 1.004], [0.667, 0.983], [0.708, 0.939], [0.75, 0.882], [0.792, 0.831], [0.833, 0.759], [0.875, 0.672], [0.917, 0.556], [0.958, 0.441], [1, 0.224]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.52], [0.2, 0.74], [0.3, 0.9], [0.4, 0.98], [0.5, 1], [0.6, 1], [0.7, 0.96], [0.8, 0.84], [0.9, 0.62], [0.95, 0.44], [1, 0.22]],
    house: { plan: [[0.35, 6.0], [0.38, 7.5], [0.62, 8.0], [0.7, 6.0]] },
    funnels: [{ lx: 7.8, lz: 5.2, h: 11.9, rake: 1.2, top: 0.8, pipes: false }, { lx: 5.0, lz: 4.6, h: 12.0, rake: 1.2, top: 0.9, pipes: false }],
    decks: [
      { f: [0.37, 0.426], hw: 4.2, y: [0, 5.8], windows: true },          // tower base, 11.2 m
      { f: [0.371, 0.426], hw: 3.8, y: [5.8, 8.2], windows: true },        // 13.5 m
      { f: [0.384, 0.426], hw: 3.4, y: [8.2, 14.6], windows: true },       // 20 m
      { f: [0.406, 0.424], hw: 2.2, y: [14.6, 18.1] },                     // 23.5 m
      { f: [0.392, 0.404], round: true, hw: 1.4, y: [14.6, 20.1], taper: 0.7 },     // the tripod under the director
      { f: [0.648, 0.665], hw: 1.8, y: [0, 10.0], taper: 0.9 },            // the open lattice tower, 14.4 m
      { f: [0.355, 0.372], hw: 3.0, y: [0, 11.0] },                        // searchlight platform abaft B, 16.7 m
      { f: [0.497, 0.56], hw: 4.9, y: [0, 2.1] },                          // 6.6 m
    ],
    towerF: 0.397, towerY0: 19.7,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 2.6, l: 2.6, h: 1.4 },
    mastY0: { 1: 4.4 },
    cat: { f: 0.115, z: 0, yaw: 0, len: 28, y: 0.3, craneF: 0.15, craneY: 0, craneH: 3.0, craneLen: 6, craneDir: 1, craneAng: 0.5, craneSide: 0, craneW: 0.5 },
  },
  // La Galissonniere class (ONI sheet of 1942, public domain; profile and plan at one scale, but small: 5 px per metre, so about +-0.6 m): a forecastle
  // at 8.4 m (8.6 m at the stem) running to f 0.68 with the quarterdeck at 5.0 m abaft; turrets A / B at 0.233 / 0.278 (B 3.2 m above A), C at 0.778 with
  // the catapult on its roof; the tripod bridge 0.309-0.40 (platform 24.7 m, director 29.8 m, spire 33.5 m), funnels at 0.43 and 0.549 (tops 19.5 / 16.9 m),
  // the aft deckhouse 0.612-0.68 (10.7 m) with the pole mainmast at 0.62 (top 30 m) and a derrick at the stern.
  la_galissoniere: {
    mainVariant: 'fr152_30', dirKind: 'drum', houseH: 2.8, bulwarkF: [0, 0.03],
    fb: [[0, 8.6], [0.04, 8.4], [0.2, 8.2], [0.3, 8.0], [0.45, 7.8], [0.6, 7.6], [0.68, 7.6], [0.69, 5.0], [1, 5.0]],
    planDeck: [[0, 0.092], [0.042, 0.458], [0.083, 0.687], [0.125, 0.801], [0.167, 0.893], [0.208, 0.962], [0.25, 1.0], [0.333, 1.008], [0.417, 1.03], [0.5, 1.03], [0.625, 1.03], [0.667, 1.008], [0.708, 0.985], [0.75, 0.962], [0.792, 0.939], [0.833, 0.87], [0.875, 0.801], [0.917, 0.756], [0.958, 0.595], [1, 0.504]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.96], [0.8, 0.86], [0.9, 0.66], [0.95, 0.5], [1, 0.4]],
    house: { plan: [[0.309, 5.0], [0.33, 7.0], [0.40, 7.0], [0.455, 5.5]] },
    decks: [
      { f: [0.309, 0.40], hw: 5.0, y: [0, 4.2], windows: true },          // bridge base, 12.4 m
      { f: [0.318, 0.395], hw: 3.8, y: [4.2, 7.6], windows: true },        // 15.8 m
      { f: [0.34, 0.39], hw: 3.0, y: [7.6, 8.9], windows: true },          // 17.1 m
      { f: [0.612, 0.68], hw: 6.5, y: [0, 3.1], windows: true },           // after deckhouse, 10.7 m
      { f: [0.357, 0.385], hw: 2.0, y: [8.9, 16.0], round: true, taper: 0.8 },   // the tripod legs and platform under the director, 24 m
      { f: [0.614, 0.633], hw: 1.8, y: [3.1, 6.4], taper: 0.9 },           // the foot of the mainmast, 14 m
    ],
    towerF: 0.367, towerY0: 15.5,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 3.0, l: 3.7, h: 3.5 },
    foremast: { dx: -2.0, base: 4.2, apex: 0.8, platform: 0.78, spread: 3.2, back: 3.5, front: 1.5 },
    funnels: [{ lx: 5.6, lz: 3.6, h: 8.9, rake: 1.2, top: 0.92, pipes: false }, { lx: 5.0, lz: 3.0, h: 6.5, rake: 1.0, top: 0.95, pipes: false }],
    mastY0: { 1: 7.6 },
    cat: { f: 0.775, z: 0, yaw: 0, len: 13.5, y: 5.2, craneF: 0.975, craneY: 0, craneH: 1.5, craneLen: 16, craneDir: 1, craneAng: 0.15, craneSide: 0, craneW: 0.6 },
    aa: [],      // the light mounts come from the model (4 twin 37 mm, 2 twin 13.2 mm)
    // the four twin 13.2 mm the model lacks (the class carried six), on free deck: places, not measurements
    aaAt: [{ k: 'm13', x: -40.25, y: 6.0, z: 6.25 }, { k: 'm13', x: -40.25, y: 6.0, z: -6.25 }, { k: 'm13', x: 46.75, y: 8.5, z: 5.75 }, { k: 'm13', x: 46.75, y: 8.5, z: -5.75 }],
    v4: GALISSONIERE_V4,
    // two screws and a rudder where the model has them (its shafts and brackets stay drawn; its own screws and rudder are left out)
    props: [{ f: 0.89, z: 5.1, depth: 3.3, d: 4.2, blades: 3, toF: 0.8895 }],
    rudders: [{ f: 0.943, top: 0.3, bottom: 4.6, chord: 5.0, t: 0.4 }],
  },
  // Algerie (ONI sheet of 1942, public domain; profile and plan at one scale, small: 4.7 px per metre, so about +-0.7 m): a flush deck at 7.6 m at the stem, 6.4 m
  // aft of f 0.25; turrets A / B at 0.225 / 0.275 (B 3.5 m above A), X / Y at 0.69 / 0.74; the block tower bridge 0.30-0.372 (platform 21 m, director 35 m, pole 40 m),
  // the funnel at 0.409 (top 19.9 m), the central searchlight tower at 0.545 (22.3 m) with two crane booms, the tripod mainmast at 0.655 (top 36.7 m).
  algerie: {
    mainVariant: 'fr203', dirKind: 'drum', houseH: 2.4, bulwarkF: [0, 0.03],
    fb: [[0, 7.6], [0.05, 7.1], [0.1, 6.9], [0.2, 6.8], [0.3, 6.6], [0.5, 6.4], [0.7, 6.3], [0.85, 6.3], [1, 6.4]],
    planDeck: [[0, 0.15], [0.042, 0.43], [0.083, 0.623], [0.125, 0.752], [0.167, 0.838], [0.208, 0.903], [0.25, 0.946], [0.292, 0.989], [0.333, 1.01], [0.5, 1.01], [0.583, 1.01], [0.625, 0.989], [0.667, 0.989], [0.708, 0.967], [0.75, 0.924], [0.792, 0.903], [0.833, 0.85], [0.875, 0.774], [0.917, 0.645], [0.958, 0.516], [1, 0.279]],
    planWL: [[0, 0], [0.04, 0.28], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.96], [0.8, 0.86], [0.9, 0.64], [0.95, 0.46], [1, 0.3]],
    house: { plan: [[0.30, 5.0], [0.32, 8.0], [0.46, 8.5], [0.71, 8.0], [0.72, 5.0]] },
    decks: [
      { f: [0.31, 0.372], hw: 4.8, y: [0, 6.5], windows: true },          // bridge base, 13 m
      { f: [0.305, 0.372], hw: 5.2, y: [6.5, 9.2], windows: true },        // wings, 15.7 m
      { f: [0.318, 0.366], hw: 3.4, y: [9.2, 14.8], windows: true },       // 21.3 m
      { f: [0.332, 0.366], round: true, hw: 2.3, y: [14.8, 24.5], taper: 0.85 },   // the tower, 31 m
      { f: [0.332, 0.353], round: true, hw: 1.8, y: [24.5, 28.8] },        // the director, 35.3 m
      { f: [0.532, 0.557], hw: 2.4, y: [0, 15.9], taper: 0.9 },            // the searchlight tower, 22.3 m
      { f: [0.595, 0.64], hw: 3.0, y: [0, 4.8] },
    ],
    towerF: 0.353, towerY0: 24.7,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 3.0, l: 3.0, h: 1.6 },
    funnels: [{ lx: 6.0, lz: 3.4, h: 11.0, rake: 0.8, top: 0.95, pipes: false }],
    mastY0: { 1: 8.7 },
    cat: { f: 0.445, z: -7.7, yaw: 0, len: 21, y: 2.6, craneF: 0.545, craneY: 8.5, craneH: 3.0, craneLen: 18.6, craneDir: 1, craneAng: 0.44, craneSide: 0, craneW: 0.7 },
    aa: [],      // the light mounts come from the model (4 twin 37 mm, 4 quadruple 13.2 mm)
    v4: ALGERIE_V4,
    tubeAt: [[-1.19, 5.0, 7.4], [-2.43, 5.0, -7.4]],      // the two triple mounts where the model has them (their height is 1.3 m low: the hand-made deckhouse slab, kept for the solids, spans that deck)
    // four screws and a rudder where the model has them (the shafts and their brackets are the model's: the game's own shafts are left no length)
    props: [{ f: 0.9152, z: 3.56, depth: 3.5, d: 3.3, blades: 3, toF: 0.9147 }, { f: 0.8412, z: 6.34, depth: 3.5, d: 3.4, blades: 3, toF: 0.8407 }],
    rudders: [{ f: 0.9458, top: 0.6, bottom: 5.4, chord: 8.0, t: 0.5 }],
  },
  // Belfast (James Goulding's profile and plan of 1943 for Profile Publications, with a scale bar in feet; shared by the project owner, measured only: 4.7 px per metre, about
  // +-0.5 m): a long forecastle at 9.3 m at the stem and about 8.5 m aft to f 0.775, a quarterdeck at 4.9 m abaft; turrets A / B at 0.158 / 0.211 and X / Y at 0.771 / 0.823
  // (the spec had 0.11 / 0.165 / 0.775 / 0.855); the bridge block 0.246-0.36 with the director tower at 0.318 (26 m), the tripod foremast at 0.349 (top 41.7 m), funnels at
  // 0.489 and 0.631 (tops 21 / 20 m), the tripod mainmast at 0.596 (top 36.7 m), the catapult athwartships at f 0.42 with a crane each side.
  belfast: {
    mainVariant: 'brit152', dirKind: 'drum', houseH: 2.5, bulwarkF: [0, 0.03],
    fb: [[0, 9.3], [0.04, 8.9], [0.15, 8.7], [0.3, 8.5], [0.6, 8.3], [0.77, 8.3], [0.785, 4.9], [0.9, 4.9], [0.95, 5.5], [1, 6.5]],
    planDeck: [[0, 0.13], [0.042, 0.44], [0.083, 0.66], [0.125, 0.79], [0.167, 0.88], [0.208, 0.95], [0.25, 0.99], [0.3, 1.0], [0.7, 1.0], [0.75, 0.95], [0.792, 0.9], [0.833, 0.86], [0.875, 0.816], [0.917, 0.66], [0.958, 0.51], [1, 0.2]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.8], [0.3, 0.93], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.68], [0.95, 0.5], [1, 0.3]],
    house: { plan: [[0.246, 5.0], [0.27, 7.5], [0.5, 8.0], [0.7, 7.5], [0.72, 5.0]] },
    decks: [
      { f: [0.246, 0.36], hw: 5.5, y: [0, 3.4], windows: true },           // bridge base, 11.9 m
      { f: [0.248, 0.30], hw: 4.6, y: [3.4, 10.7], windows: true },        // the forward block, 19.3 m
      { f: [0.30, 0.335], hw: 4.0, y: [3.4, 7.0], windows: true },         // 15.5 m
      { f: [0.309, 0.327], round: true, hw: 1.9, y: [7.0, 17.8], taper: 0.85 },   // the director tower, 26.3 m
      { f: [0.353, 0.364], hw: 1.0, y: [0, 26.5], taper: 0.7 },            // the foremast pole and ladder, 34.9 m
      { f: [0.388, 0.398], hw: 4.2, y: [0, 4.7] },                         // searchlight platform, 13.1 m
      { f: [0.519, 0.572], hw: 4.4, y: [0, 4.4] },                         // boat deck between the funnels, 12.7 m
      { f: [0.663, 0.693], hw: 4.0, y: [0, 7.5] },                         // after structure, 15.8 m
      { f: [0.695, 0.73], hw: 4.1, y: [0, 3.7] },                          // 12 m
    ],
    towerF: 0.318, towerY0: 15.0,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 3.0, l: 3.0, h: 1.8 },
    foremast: { dx: -5.8, base: 8.0, apex: 0.7, platform: 0.75, spread: 3.0, back: 3.0, front: 1.5 },
    funnels: [{ lx: 6.8, lz: 5.2, y0: 0.5, h: 12.3, rake: 1.4, top: 0.9, pipes: false }, { lx: 6.8, lz: 5.2, y0: 1.5, h: 10.1, rake: 1.4, top: 0.9, pipes: false }],
    mastY0: { 1: 9.0 },
    cat: { f: 0.42, z: 0, yaw: Math.PI / 2, len: 16, y: 1.8, craneF: 0.452, craneZ: 8.0, craneY: 0.5, craneH: 4.0, craneLen: 11.5, craneDir: 1, craneAng: 0.85, craneSide: 0, craneW: 0.6, craneBoth: true },
  },
  // Norfolk (the plan and profile of a three-funnel County class cruiser from a Hasegawa 1/700 instruction sheet, shared by the project owner, measured only: 5 px per metre, about
  // +-0.6 m): a flush deck 10.0 m at the stem, 8.4-8.6 m from f 0.2 aft; turrets A / B at 0.175 / 0.247 and X / Y at 0.763 / 0.829 (the spec had 0.10 / 0.155 / 0.79 / 0.855); the bridge
  // block 0.288-0.395 (tiers 15 / 20.3 / 24 m), the tripod foremast at 0.375 (top 37 m), three funnels at 0.413 / 0.468 / 0.523 (tops 25 m), the tripod mainmast at 0.728 (top 35.3 m),
  // the aft tower 0.63-0.652 (21.3 m).
  norfolk: {
    mainVariant: 'brit203', dirKind: 'drum', houseH: 2.5, bulwarkF: [0, 0.03],
    fb: [[0, 10.0], [0.03, 9.6], [0.1, 9.2], [0.15, 8.9], [0.2, 8.6], [0.3, 8.4], [0.5, 8.5], [0.75, 8.6], [1, 8.5]],
    planDeck: [[0, 0.08], [0.042, 0.338], [0.083, 0.537], [0.125, 0.677], [0.167, 0.756], [0.208, 0.816], [0.25, 0.9], [0.292, 0.95], [0.333, 0.975], [0.375, 0.995], [0.417, 1.0], [0.5, 1.0], [0.625, 1.0], [0.667, 1.0], [0.708, 0.975], [0.75, 0.916], [0.792, 0.876], [0.833, 0.776], [0.875, 0.677], [0.917, 0.577], [0.958, 0.398], [1, 0.1]],
    planWL: [[0, 0], [0.04, 0.28], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.86], [0.9, 0.64], [0.95, 0.45], [1, 0.2]],
    house: { plan: [[0.288, 5.0], [0.31, 7.5], [0.5, 8.5], [0.69, 7.5], [0.70, 5.0]] },
    decks: [
      { f: [0.272, 0.395], hw: 5.0, y: [0, 3.5], windows: true },          // bridge base, 12 m
      { f: [0.29, 0.345], hw: 4.0, y: [3.5, 10.8], windows: true },        // 19.2 m
      { f: [0.308, 0.342], hw: 3.0, y: [10.8, 12.0], windows: true },      // 20.4 m
      { f: [0.395, 0.5], hw: 4.4, y: [0, 5.4] },                           // house round the funnels, 14 m
      { f: [0.562, 0.627], hw: 3.9, y: [0, 5.6] },                         // boat deck, 14.1 m
      { f: [0.627, 0.69], hw: 4.4, y: [0, 4.4] },
      { f: [0.632, 0.66], hw: 3.0, y: [4.4, 12.8], windows: true },        // after structure, 21.4 m
      { f: [0.857, 0.891], hw: 2.9, y: [0, 2.5] },
    ],
    towerF: 0.33, towerY0: 14.0,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 2.6, l: 2.6, h: 1.2 },
    foremast: { dx: -8.0, base: 6.0, apex: 0.7, platform: 0.7, spread: 3.2, back: 3.5, front: 1.5 },
    funnels: [{ lx: 5.2, lz: 4.0, y0: 2.5, h: 13.7, rake: 1.4, top: 0.9, pipes: false }, { lx: 5.4, lz: 4.0, y0: 2.5, h: 13.7, rake: 1.4, top: 0.9, pipes: false }, { lx: 5.2, lz: 4.0, y0: 2.5, h: 13.7, rake: 1.4, top: 0.9, pipes: false }],
    mastY0: { 1: 6.0 },
    cat: { f: 0.64, z: 0, yaw: Math.PI / 2, len: 13, y: 2.0, craneF: 0.70, craneY: 6.8, craneH: 2.0, craneLen: 10, craneDir: -1, craneAng: 0.5, craneSide: 0, craneW: 0.6 },
  },
  // Fletcher class (a profile / plan / lines sheet with a 20 m scale bar, shared by the project owner: a monograph, copyright of the author, measured only; 15.25 px per metre, about
  // +-0.2 m): a flush deck sweeping from 6.8 m at the stem to 3.0 m aft of f 0.6; the 5 in mounts at 0.177 / 0.238 (forecastle, the second 1.2 m higher) and 0.679 / 0.754 (on the
  // after deckhouse) / 0.831 (fantail); the bridge block 0.27-0.35 (director 16.8 m), a pole mast at 0.375 (top 28.7 m), funnels at 0.419 and 0.534 (tops 13.8 / 13.4 m), the quintuple
  // tubes at 0.465 and 0.585, the after structure 0.69-0.74 with a Bofors platform (10.9 m) and a signal pole at 0.69 (16.6 m).
  // Tribal class (TZoli profile and plan, shared by the project owner, measured only; scaled to the 114.9 m length, 15.4 px per metre, about +-0.3 m; the waterline is taken at the black
  // boot-topping band, so the heights are good to about 0.5 m): a forecastle at 6.3 m (7 m at the stem) ending at f 0.455 over a 3.7 m main deck; turrets A / B at 0.177 / 0.254
  // (B on the bridge deck) and X / Y at 0.808 / 0.905 (X on the deckhouse); the bridge block 0.304-0.407 (12.7 m, director 17 m), a leaning lattice mast with the radar at 0.433
  // (top 29.4 m), funnels at 0.448 and 0.57 (tops 13.4 / 13.2 m), the quadruple tubes at 0.63, a long deckhouse 0.67-0.83 (6.8 m) with the pom-pom at 0.727 and a mast at 0.767 (21 m).
  tribal: {
    mainVariant: 'brit120', dirKind: 'drum', houseH: 2.2, bulwarkF: [0, 0.02],
    fb: [[0, 7.0], [0.05, 6.7], [0.15, 6.5], [0.3, 6.35], [0.44, 6.25], [0.447, 6.2], [0.462, 3.8], [0.6, 3.7], [1, 3.6]],
    planDeck: [[0, 0.106], [0.042, 0.505], [0.083, 0.716], [0.125, 0.833], [0.167, 0.892], [0.208, 0.939], [0.25, 0.974], [0.292, 1.0], [0.333, 1.0], [0.417, 1.0], [0.5, 1.0], [0.583, 1.0], [0.667, 1.0], [0.708, 1.0], [0.75, 1.0], [0.792, 1.0], [0.833, 0.986], [0.875, 0.927], [0.917, 0.833], [0.958, 0.775], [1, 0.317]],
    planWL: [[0, 0], [0.04, 0.32], [0.1, 0.6], [0.2, 0.84], [0.3, 0.95], [0.4, 0.99], [0.5, 1], [0.7, 1], [0.8, 0.94], [0.9, 0.78], [0.95, 0.6], [1, 0.35]],
    decks: [
      { f: [0.304, 0.407], hw: 3.2, y: [0, 2.3], windows: true },             // bridge base, 8.6 m
      { f: [0.304, 0.352], hw: 2.8, y: [2.3, 6.9], windows: true },           // the forward block, 13.4 m
      { f: [0.36, 0.40], hw: 2.0, y: [2.3, 6.4], windows: true },             // 12.7 m
      { f: [0.372, 0.398], round: true, hw: 1.3, y: [6.4, 9.2], taper: 0.9 },  // the compass platform and director, 15.5 m
      { f: [0.67, 0.865], hw: 3.0, y: [0, 3.1], windows: true },              // the long deckhouse, 6.8 m
    ],
    towerF: 0.38, towerY0: 9.0,
    tiers: [{ len: 2.5, w: 2.5, h: 0.1 }],
    dir0: { dx: 0, w: 2.0, l: 2.0, h: 1.5 },
    foremast: { dx: -5.9, y0: 0.2, base: 0.5, apex: 0.8, platform: 0.4, spread: 0.4, back: 0.8, front: 0.4 },
    funnels: [{ lx: 2.8, lz: 2.1, y0: 1.2, h: 8.5, rake: 1.2, top: 0.8, pipes: false }, { lx: 2.8, lz: 2.1, y0: 1.2, h: 8.3, rake: 1.2, top: 0.8, pipes: false }],
    mastY0: { 1: 3.1 },
    boats: [{ f0: 0.415, f1: 0.484, z: 4.3, y: 0.5, cabin: false, davits: true }, { f0: 0.535, f1: 0.6, z: 4.2, y: 0.5, cabin: false, davits: true }],
    aa: [{ k: 'q40', f: 0.727, z: 0, y: 3.1 }, { k: 'o20', f: 0.357, z: 3.6, y: 2.3 }, { k: 'o20', f: 0.37, z: 4.8, y: 0 }, { k: 'o20', f: 0.108, z: 4.4, y: 0 }, { k: 'o20', f: 0.93, z: 4.6, y: 0 }],
  },
  // Type 1936A (Mob) (a coloured profile and plan from a small 3-view, 500 px native, shared by the project owner, measured only: about +-0.8 m, heights +-0.5 m; the waterline is the
  // top of the red boot): a forecastle at 6.3 m (flush to f 0.38, then 4.9 m) down to 3.2 m aft; the Drh LC/38 twin turret at 0.19 (barrels forward), the single mounts at
  // 0.76 (on the deckhouse) / 0.81 / 0.868; the bridge block 0.248-0.332 (10-12.4 m, director 13.5 m), a pole foremast at 0.333 (yard 22 m, top 28.7 m), funnels at 0.374 and 0.505
  // (tops 13.3 / 12.2 m), the quadruple tubes at 0.45 and 0.64, the after deckhouse 0.69-0.775 (7.1 m) with the signal pole at 0.697 (16.2 m).
  type1936a_mob: {
    mainVariant: { 2: 'de150_2', 1: 'de150_1' }, dirKind: 'drum', houseH: 2.4, bulwarkF: [0, 0.02],
    fb: [[0, 6.3], [0.05, 6.1], [0.2, 5.9], [0.3, 5.5], [0.38, 5.1], [0.45, 4.8], [0.55, 4.3], [0.67, 3.8], [0.9, 3.0], [1, 3.2]],
    planDeck: [[0, 0.08], [0.042, 0.49], [0.083, 0.708], [0.125, 0.828], [0.167, 0.915], [0.208, 0.959], [0.25, 0.98], [0.292, 1.02], [0.333, 1.04], [0.417, 1.06], [0.5, 1.07], [0.583, 1.06], [0.625, 1.046], [0.667, 1.035], [0.708, 1.0], [0.75, 0.98], [0.792, 0.948], [0.833, 0.9], [0.875, 0.85], [0.917, 0.8], [0.958, 0.7], [1, 0.48]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.56], [0.2, 0.8], [0.3, 0.93], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.68], [0.95, 0.5], [1, 0.3]],
    decks: [
      { f: [0.248, 0.332], hw: 3.3, y: [0, 5.0], windows: true },            // bridge block, 10.4 m
      { f: [0.27, 0.325], hw: 2.6, y: [5.0, 7.0], windows: true },           // 12.4 m
      { f: [0.286, 0.31], round: true, hw: 1.3, y: [7.0, 8.4], taper: 0.9 },  // the director, 13.8 m
      { f: [0.69, 0.775], hw: 3.2, y: [0, 3.3] },                            // the after deckhouse, 7.1 m
      { f: [0.795, 0.835], hw: 2.5, y: [0, 2.0] },                           // under the superfiring mount
    ],
    towerF: 0.298, towerY0: 7.8,
    tiers: [{ len: 2.5, w: 2.5, h: 0.1 }],
    dir0: { dx: 0, w: 2.0, l: 2.2, h: 1.4 },
    foremast: { dx: -4.4, y0: 5.5 },
    funnels: [{ lx: 3.0, lz: 2.3, y0: 0.4, h: 8.0, rake: 0.8, top: 0.92, pipes: false }, { lx: 3.0, lz: 2.3, y0: 0.4, h: 7.4, rake: 0.6, top: 0.92, pipes: false }],
    mastY0: { 1: 3.6 },
    aa: [{ k: 't37', f: 0.727, z: 0, y: 3.3 }, { k: 'o20', f: 0.55, z: 4.6, y: 0 }, { k: 'o20', f: 0.35, z: 3.9, y: 5.0 }, { k: 'o20', f: 0.93, z: 3.0, y: 0 }],
  },
  // Le Fantasque (a profile and plan with a scale in feet, 434 ft 5 in over all, shared by the project owner, measured only: 7.4 px per metre, about +-0.5 m): a forecastle at 7.6 m at the
  // stem falling to 6.8 m at f 0.3 and 4.4 m aft of f 0.45; the 138.6 mm single mounts at 0.17 / 0.207 (B on the bridge base) and 0.757 / 0.855 / 0.883 (the middle one on the after
  // deckhouse, the 0.855 one superfiring over the last); the bridge block 0.241-0.345 (tiers 9.4 / 12 / 14.3 / 16 m), a pole foremast at 0.30 (top 26.6 m), funnels at 0.383 and 0.611 (tops
  // 14.6 / 13.2 m), the after deckhouse 0.734-0.853 (7.5 m) with a director tower at 0.786 (13.2 m) and a small mast at 0.537 (10.5 m).
  fantasque: {
    mainVariant: 'fr138', dirKind: 'drum', houseH: 2.4, bulwarkF: [0, 0.02],
    fb: [[0, 7.6], [0.05, 7.3], [0.15, 7.0], [0.3, 6.8], [0.36, 6.5], [0.4, 5.5], [0.45, 4.6], [0.5, 4.4], [1, 4.4]],
    planDeck: [[0, 0], [0.042, 0.4], [0.083, 0.6], [0.125, 0.72], [0.167, 0.8], [0.208, 0.84], [0.25, 0.9], [0.292, 0.94], [0.333, 0.96], [0.375, 0.97], [0.417, 0.98], [0.5, 1.0], [0.667, 1.0], [0.708, 0.98], [0.75, 0.96], [0.792, 0.92], [0.833, 0.88], [0.875, 0.82], [0.917, 0.74], [0.958, 0.66], [1, 0.26]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.57], [0.2, 0.8], [0.3, 0.93], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.68], [0.95, 0.5], [1, 0.26]],
    decks: [
      { f: [0.241, 0.345], hw: 4.0, y: [0, 2.6], windows: true },           // bridge base, 9.4 m
      { f: [0.252, 0.327], hw: 3.4, y: [2.6, 5.2], windows: true },         // 12 m
      { f: [0.27, 0.316], hw: 2.6, y: [5.2, 7.5], windows: true },          // 14.3 m
      { f: [0.289, 0.313], round: true, hw: 1.7, y: [7.5, 9.2] },           // the director, 16 m
      { f: [0.455, 0.55], hw: 3.2, y: [0, 2.0] },
      { f: [0.63, 0.69], hw: 3.6, y: [0, 3.8] },                            // the deckhouse abaft the second funnel, 8.2 m
      { f: [0.734, 0.853], hw: 3.6, y: [0, 3.1] },                          // after deckhouse, 7.5 m
      { f: [0.797, 0.835], hw: 2.0, y: [3.1, 6.6] },                        // 11 m
      { f: [0.776, 0.796], hw: 1.2, y: [3.1, 8.8] },                        // the after director tower, 13.2 m
    ],
    towerF: 0.30, towerY0: 9.2,                                             // 16 m above the waterline = 9.2 m above the deck there (it was set to 16 above the deck: the director and the mast floated 7 m up)
    tiers: [{ len: 2.5, w: 2.5, h: 0.1 }],
    dir0: { dx: 0, w: 2.0, l: 2.2, h: 1.2 },
    foremast: { dx: 0, y0: 9.2 },
    funnels: [{ lx: 2.9, lz: 2.4, y0: 0.4, h: 8.2, rake: 0.4, top: 0.92, pipes: false }, { lx: 2.9, lz: 2.4, y0: 0.4, h: 8.2, rake: 0.4, top: 0.92, pipes: false }],
    mastY0: { 1: 4.6 }, aa: [],
    tubeAt: [[2.4, 5.4, -4.3], [1.1, 5.4, 4.3]],      // the two triples of the 1944 fit, where the reference model has them
    v4: FANTASQUE_V4,
  },
  // Soldati class (a profile and plan of the Camicia Nera, shared by the project owner, measured only: a small line drawing, 7.1 px per metre scaled to the 106.7 m length, about +-0.6 m):
  // a forecastle at 4.5 m at the stem falling to 3.6 m, the main deck 3.4 m, a quarterdeck at 1.4 m abaft f 0.88; the twin turrets at 0.218 and 0.83; the bridge block 0.26-0.375 (7 m,
  // director platform 10.5 m, tower 13.8 m), a raked pole foremast at 0.39 (top 23 m), the big raked funnel at 0.445 (top 10.1 m), the triple tubes at 0.62 and 0.73 round the star-shell
  // gun on a round deckhouse at 0.677, the raked pole mainmast at 0.78 (top 17.5 m).
  soldati: {
    mainVariant: 'it120', dirKind: 'drum', houseH: 2.0, bulwarkF: [0, 0.02],
    fb: [[0, 4.6], [0.05, 4.2], [0.15, 3.8], [0.3, 3.6], [0.5, 3.5], [0.8, 3.4], [0.87, 3.3], [0.9, 1.8], [1, 1.4]],
    planDeck: [[0, 0.02], [0.05, 0.75], [0.1, 0.83], [0.15, 0.91], [0.2, 0.96], [0.25, 0.99], [0.3, 1.0], [0.65, 1.0], [0.7, 0.97], [0.75, 0.92], [0.8, 0.85], [0.85, 0.86], [0.9, 0.72], [0.95, 0.67], [1, 0.34]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.57], [0.2, 0.8], [0.3, 0.93], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.68], [0.95, 0.5], [1, 0.3]],
    decks: [
      { f: [0.26, 0.375], hw: 3.2, y: [0, 3.6], windows: true },            // bridge base, 7.1 m
      { f: [0.268, 0.372], hw: 2.6, y: [3.6, 7.0], windows: true },          // 10.5 m
      { f: [0.355, 0.375], hw: 1.4, y: [7.0, 10.3], taper: 0.9 },           // the tower, 13.8 m
      { f: [0.455, 0.53], hw: 2.6, y: [0, 1.4] },                           // deckhouse abaft the funnel
      { f: [0.56, 0.76], hw: 2.8, y: [0, 1.0] },                            // the torpedo deck
      { f: [0.64, 0.715], round: true, hw: 2.4, y: [0, 1.4] },              // round deckhouse of the star-shell gun
      { f: [0.79, 0.88], hw: 3.0, y: [0, 1.8] },                            // the after deckhouse under the gun
    ],
    towerF: 0.365, towerY0: 10.4,
    tiers: [{ len: 2.5, w: 2.5, h: 0.1 }],
    dir0: { dx: 0, w: 2.0, l: 2.2, h: 1.2 },
    foremast: { dx: -2.9, y0: 5.0 },
    funnels: [{ lx: 4.2, lz: 2.4, y0: 0.4, h: 6.4, rake: 1.2, top: 0.95, pipes: false }],
    mastY0: { 1: 3.4 },
    mastRake: { 1: -2.0 },
    props: [{ f: 0.93, z: 2.0, depth: 2.3, d: 2.4, blades: 3, toF: 0.85, strutF: 0.91 }],
    rudders: [{ f: 0.975, z: 0, top: 0.5, bottom: 3.0, chord: 2.4 }],
  },
  fletcher: {
    mainVariant: 'mk30', dirKind: 'drum', houseH: 2.2, bulwarkF: [0, 0.02],
    fb: [[0, 6.8], [0.04, 6.1], [0.1, 5.5], [0.2, 4.9], [0.3, 4.5], [0.4, 4.0], [0.5, 3.4], [0.6, 3.0], [1, 3.0]],
    planDeck: [[0, 0.02], [0.05, 0.41], [0.1, 0.575], [0.15, 0.685], [0.2, 0.775], [0.25, 0.85], [0.3, 0.915], [0.35, 0.9], [0.4, 0.915], [0.45, 0.93], [0.5, 0.94], [0.55, 0.95], [0.6, 0.955], [0.65, 0.945], [0.7, 0.94], [0.75, 0.925], [0.8, 0.9], [0.85, 0.86], [0.9, 0.81], [0.95, 0.74], [1, 0.55]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.9], [0.9, 0.74], [0.95, 0.6], [1, 0.5]],
    decks: [
      { f: [0.272, 0.352], hw: 3.4, y: [0, 5.0], windows: true },           // bridge block, 9.6 m
      { f: [0.30, 0.345], hw: 2.8, y: [5.0, 7.4], windows: true },          // 12 m
      { f: [0.31, 0.34], hw: 2.0, y: [7.4, 10.8], windows: true },          // the tower, 15.4 m
      { f: [0.40, 0.445], hw: 3.0, y: [0, 2.2] },                           // deckhouse round the forward funnel, 6.2 m
      { f: [0.50, 0.605], hw: 3.2, y: [0, 2.6] },                           // deckhouse round the after funnel
      { f: [0.689, 0.74], hw: 2.6, y: [0, 7.0], windows: true },            // the after structure, 10 m
    ],
    towerF: 0.325, towerY0: 10.8,
    tiers: [{ len: 2.5, w: 2.5, h: 0.1 }],
    dir0: { dx: 0, w: 2.0, l: 2.2, h: 1.5 },
    foremast: { dx: -5.7, y0: 4.5 },
    funnels: [{ lx: 3.0, lz: 2.4, y0: 1.8, h: 8.1, rake: 0.3, top: 0.92, pipes: false }, { lx: 3.0, lz: 2.4, y0: 2.2, h: 7.9, rake: 0.3, top: 0.92, pipes: false }],
    mastY0: { 1: 7.0 },
    props: [{ f: 0.936, z: 2.9, depth: 3.0, d: 3.6, blades: 4, toF: 0.84, strutF: 0.866 }],
    rudders: [{ f: 0.96, z: 0, top: 0.6, bottom: 4.4, chord: 3.3 }],
    boats: [{ f0: 0.347, f1: 0.41, z: 3.6, y: 2.2, cabin: false, davits: true }],
    aa: [],      // the light mounts come from the model (3 twin 40 mm, 9 single 20 mm)
    v4: FLETCHER_V4,
  },
  // Cleveland class (Colosseum drawing of USS Cleveland, Measure 12 modified, 1942, with a scale bar and the waterline; plan from the Pit-Road 1/700 sheet; shared by
  // the project owner, measured only: 3.9 px per metre, about +-0.5 m): freeboard 8.8 m at the stem, 7.3 m at f 0.2, 6.8-7.0 m amidships and aft, a 9.6 m hangar roof at
  // the stern (f 0.84-0.97); turrets A / B at 0.193 / 0.26 (B 2.6 m higher), X / Y at 0.729 / 0.79; the bridge block 0.347-0.445 (platform 17.6 m, director top
  // 25.3 m), funnels at 0.469 and 0.537 (tops 25.0 / 24.4 m, bases 13.8 m), pole masts at 0.443 and 0.559 (tops 35.9 m), the aft tower 0.61-0.655 (22.7 m).
  cleveland: {
    secVariant: ['mk28'], mainVariant: 'us152', dirKind: 'drum', houseH: 2.5, bulwarkF: [0, 0.03],
    fb: [[0, 8.8], [0.04, 8.3], [0.08, 8.3], [0.125, 7.5], [0.2, 7.3], [0.3, 6.8], [0.5, 6.9], [0.7, 7.0], [0.85, 7.4], [1, 7.8]],
    planDeck: [[0, 0], [0.042, 0.278], [0.083, 0.389], [0.125, 0.472], [0.167, 0.584], [0.208, 0.667], [0.25, 0.75], [0.292, 0.806], [0.333, 0.861], [0.375, 0.917], [0.417, 0.972], [0.5, 0.972], [0.542, 1], [0.583, 1], [0.625, 0.972], [0.708, 0.972], [0.75, 0.917], [0.792, 0.889], [0.833, 0.834], [0.875, 0.778], [0.917, 0.75], [0.958, 0.723], [1, 0.36]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.7], [0.95, 0.55], [1, 0.4]],
    house: { plan: [[0.347, 5.0], [0.37, 8.0], [0.5, 8.5], [0.66, 8.0], [0.68, 5.0]] },
    decks: [
      { f: [0.347, 0.445], hw: 5.0, y: [0, 5.0], windows: true },          // bridge base, 12 m
      { f: [0.352, 0.434], hw: 4.3, y: [5.0, 8.7], windows: true },        // 15.7 m
      { f: [0.352, 0.429], hw: 3.8, y: [8.7, 10.6], windows: true },       // 17.6 m
      { f: [0.386, 0.419], hw: 3.0, y: [10.6, 12.9], windows: true },      // 19.9 m
      { f: [0.386, 0.419], round: true, hw: 2.4, y: [12.9, 16.4] },        // the director housing, 23.4 m
      { f: [0.364, 0.381], round: true, hw: 1.6, y: [8.7, 18.3], taper: 0.9 },   // the forward 5 in director, 25.3 m
      { f: [0.31, 0.34], hw: 3.0, y: [0, 6.0] },                           // base of the forward 5 in mount, 13 m
      { f: [0.452, 0.49], hw: 4.5, y: [0, 6.8] },                          // forward funnel base, 13.8 m
      { f: [0.52, 0.556], hw: 4.5, y: [0, 6.8] },                          // after funnel base, 13.8 m
      { f: [0.556, 0.603], hw: 4.5, y: [0, 8.5], windows: true },          // after superstructure, 15.5 m
      { f: [0.565, 0.595], hw: 3.0, y: [8.5, 13.5], windows: true },       // second tower, 20.5 m
      { f: [0.603, 0.655], hw: 4.5, y: [0, 8.7], windows: true },          // after tower, 15.7 m
      { f: [0.615, 0.633], hw: 1.8, y: [8.7, 16.4], taper: 0.8 },          // the radar tower, 23.4 m
      { f: [0.64, 0.69], hw: 4.5, y: [0, 3.0] },                           // 10 m
    ],
    towerF: 0.372, towerY0: 14.0,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 2.6, l: 2.6, h: 1.4 },
    foremast: { dx: -13.2, y0: 12.0 },
    funnels: [{ lx: 6.0, lz: 4.4, y0: 6.8, h: 11.2, rake: 1.0, top: 0.95, pipes: false }, { lx: 6.0, lz: 4.4, y0: 6.8, h: 10.6, rake: 1.0, top: 0.95, pipes: false }],
    mastY0: { 1: 8.5 },
    cat: { f: 0.9, z: 4.5, yaw: 0, len: 20, y: 2.0, craneF: 0.965, craneY: 1.9, craneH: 7.0, craneLen: 9, craneDir: -1, craneAng: 0.5, craneSide: 0, craneW: 0.7 },
    v4: CLEVELAND_V4, aa: [],      // hull, structure and parts from the reference model; its light mounts are the model's (aaAt: the ones it lacks)
    // four screws and the rudder where the model has them (its shafts and brackets stay drawn; its own screws and rudder are left out)
    props: [{ f: 0.8943, z: 4.7, depth: 5.35, d: 3.2, blades: 4, toF: 0.8938 }, { f: 0.8109, z: 8.2, depth: 5.3, d: 3.2, blades: 4, toF: 0.8104 }],
    rudders: [{ f: 0.9336, top: 3.0, bottom: 7.3, chord: 7.4, t: 0.3 }],
    // the light mounts the model lacks to make up the 1944 fit (4 quad + 6 twin 40 mm, 21 x 20 mm): 6 twin 40 mm and 8 single 20 mm on free deck, places and not measurements
    aaAt: [{ k: 't40', x: 74, y: 7.0, z: 4.5 }, { k: 't40', x: 74, y: 7.0, z: -4.5 }, { k: 't40', x: -84, y: 7.0, z: 3.4 }, { k: 't40', x: -84, y: 7.0, z: -3.4 }, { k: 't40', x: -36, y: 6.6, z: 7.5 }, { k: 't40', x: -36, y: 6.6, z: -7.5 },
      { k: 'o20', x: 80, y: 7.5, z: 3 }, { k: 'o20', x: 80, y: 7.5, z: -3 }, { k: 'o20', x: 52, y: 6.6, z: 6.5 }, { k: 'o20', x: 52, y: 6.6, z: -6.5 }, { k: 'o20', x: -47, y: 6.6, z: 7.5 }, { k: 'o20', x: -47, y: 6.6, z: -7.5 }, { k: 'o20', x: -30, y: 6.6, z: 7.8 }, { k: 'o20', x: -30, y: 6.6, z: -7.8 }],
  },
  // Baltimore class (Shipbucket drawing of USS Baltimore, Measure 33/16D, October 1944, with a 100 m scale bar and the waterline, plan from the TZoli drawing of the
  // class; shared by the project owner, measured only: 6.5 px per metre, about +-0.4 m): the forecastle 9.0 m at the stem, 7.2 m at f 0.125, 6.3 m from f 0.25 aft; turrets
  // A / B at 0.225 / 0.285 (B 3.4 m higher) and X at 0.77; the bridge block 0.372-0.45 (tower 26 m, director 28.7 m), the SP radar mast at 0.46 (antenna 34.8-40.7 m,
  // top 41.5 m), funnels at 0.491 and 0.582 (tops 25.5 / 24.4 m, casings 13.1 m), the pole mainmast at 0.605 (top 37.6 m), the aft tower 0.63-0.646 (22.2 m); 5 in twins on
  // the centreline at 0.345 and 0.715 and on the wings at 0.409 / 0.643; two catapults at 0.885, 6.9 m off the centre line, and a crane at the stern.
  baltimore: {
    secVariant: ['mk28'], mainVariant: 'us203', dirKind: 'drum', houseH: 2.5, bulwarkF: [0, 0.03],
    fb: [[0, 9.0], [0.042, 8.4], [0.083, 7.7], [0.125, 7.2], [0.167, 6.8], [0.25, 6.4], [0.5, 6.3], [0.75, 6.3], [0.9, 6.4], [1, 6.6]],
    planDeck: [[0, 0.085], [0.042, 0.39], [0.083, 0.441], [0.125, 0.509], [0.167, 0.594], [0.208, 0.679], [0.25, 0.747], [0.292, 0.798], [0.333, 0.849], [0.375, 0.917], [0.417, 0.933], [0.458, 0.933], [0.5, 0.95], [0.542, 0.967], [0.583, 0.984], [0.625, 0.984], [0.667, 1.0], [0.708, 0.95], [0.75, 0.917], [0.792, 0.883], [0.833, 0.85], [0.875, 0.798], [0.917, 0.73], [0.958, 0.679], [1, 0.4]],
    planWL: [[0, 0], [0.04, 0.3], [0.1, 0.55], [0.2, 0.78], [0.3, 0.92], [0.4, 0.99], [0.5, 1], [0.6, 1], [0.7, 0.97], [0.8, 0.88], [0.9, 0.7], [0.95, 0.55], [1, 0.4]],
    house: { plan: [[0.372, 5.0], [0.39, 8.5], [0.5, 9.0], [0.69, 8.5], [0.70, 5.0]] },
    decks: [
      { f: [0.372, 0.45], hw: 5.5, y: [0, 5.6], windows: true },           // bridge base, 11.9 m
      { f: [0.375, 0.445], hw: 4.8, y: [5.6, 10.0], windows: true },       // 16.3 m
      { f: [0.378, 0.44], hw: 4.0, y: [10.0, 13.7], windows: true },       // 20 m
      { f: [0.426, 0.44], round: true, hw: 1.4, y: [10.7, 19.7] },         // the tower, 26 m
      { f: [0.386, 0.404], hw: 1.8, y: [13.7, 18.6] },                     // director, 24.9 m
      { f: [0.443, 0.47], hw: 1.2, y: [28.2, 34.4] },                      // the SP radar antenna, 34.8-40.7 m
      { f: [0.465, 0.52], hw: 5.0, y: [0, 6.8] },                          // forward funnel casing, 13.1 m
      { f: [0.55, 0.615], hw: 5.0, y: [0, 6.8] },                          // after funnel casing, 13.1 m
      { f: [0.604, 0.69], hw: 5.2, y: [0, 7.4], windows: true },           // after superstructure, 13.7 m
      { f: [0.625, 0.665], hw: 4.2, y: [7.4, 10.4], windows: true },       // 16.7 m
      { f: [0.63, 0.646], round: true, hw: 1.9, y: [10.4, 15.9] },         // the after tower, 22.2 m
      { f: [0.632, 0.644], hw: 1.2, y: [15.9, 18.1] },                     // 24.4 m
      { f: [0.455, 0.468], hw: 1.2, y: [6.8, 25.7], taper: 0.8 },           // the foremast structure, 32 m
      { f: [0.603, 0.617], hw: 1.2, y: [6.8, 24.2], taper: 0.8 },           // the mainmast structure, 30.5 m
      { f: [0.338, 0.36], hw: 3.0, y: [0, 6.6] },                          // base of the forward centreline 5 in, 12.9 m
    ],
    towerF: 0.462, towerY0: 21.1,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 2.4, l: 2.4, h: 1.2 },
    foremast: { dx: -2.9, base: 7.0, apex: 0.66, platform: 0.75, spread: 2.6, back: 3.0, front: 1.5 },
    funnels: [{ lx: 6.5, lz: 4.4, y0: 6.8, h: 12.4, rake: 1.2, top: 0.8, pipes: false }, { lx: 5.8, lz: 4.4, y0: 6.8, h: 11.3, rake: 1.2, top: 0.9, pipes: false }],
    mastY0: { 1: 13.0 },
    cat: { f: 0.885, z: 6.9, yaw: 0, len: 20, y: 1.7, craneF: 0.975, craneY: 0.5, craneH: 8.0, craneLen: 10.5, craneDir: 1, craneAng: 0.1, craneSide: 0, craneW: 0.7 },    v4: BALTIMORE_V4, aa: [],      // hull, structure and parts from the reference model; its light mounts are the model's (12 quadruple 40 mm, 24 single 20 mm)
    // four screws and the rudder where the model has them (its shafts and brackets stay drawn; its own screws and rudder are left out)
    props: [{ f: 0.9125, z: 3.65, depth: 5.0, d: 3.6, blades: 4, toF: 0.9119 }, { f: 0.8385, z: 7.5, depth: 4.8, d: 3.6, blades: 4, toF: 0.8379 }],
    rudders: [{ f: 0.9389, top: 2.5, bottom: 7.6, chord: 7.3, t: 0.4 }],
  },
  // Yamato (1945): measured on the profile and plan by Alexpl (Commons, CC BY-SA 3.0) with the builders' table (NH 111711). The profile is
  // drawn 10 % flatter than its length scale (checked on the builders' depth of 18.915 m and bow height of 20.4 m), so its heights are
  // read at 12.74 px/m and from the waterline at the trial draft of 10.4 m: then its freeboards are the builders' 10.0 / 8.6 / 6.45 m.
  // A hull widest at the deck (38.9 m over 36.9 m at the waterline), a deck that dips towards the forward turrets; the 01 level 4.3 m,
  // the block round the funnel 12.8 m, the tower to 33.9 m with the 15 m rangefinder on top, funnel top 25.6 m above the deck.
  yamato: YAMATO,
  // Takao class (ONI 41-42 sheet "Atago class", October 1942, public domain; profile and plan at one scale, observer-height ruler in feet): a
  // forecastle at 5.0 m (7.4 m at the stem) running to a quarterdeck at 4.4 m; turrets A / B / C at 0.205 / 0.245 / 0.277 (B 3.3 m above A), X / Y
  // at 0.735 / 0.777; the bridge stepped up aft (19 m at 0.335-0.355, 25 m at 0.375, 27.9 m at 0.404), the foremast a lattice tripod at 0.43 (top
  // 36.5 m), a slanted trunked funnel 0.43-0.49 (top 21.3 m), a cylindrical one at 0.516 (top 20.0 m) and a short stack at 0.551; the aircraft deck
  // 0.61-0.68 at 8.6 m with its crane jib pointing forward from the mainmast (0.693, top 30.3 m) and the catapult rails 8.7 m off the centre line.
  takao: {
    mainVariant: 'type3_203', dirKind: 'drum', houseH: 4.8, bulwarkF: [0, 0.04],
    fb: [[0, 7.4], [0.03, 6.4], [0.07, 5.6], [0.12, 5.2], [0.2, 5.0], [0.35, 4.9], [0.5, 4.8], [0.65, 4.6], [0.8, 4.4], [0.9, 4.0], [1, 3.4]],
    planDeck: [[0, 0.126], [0.05, 0.491], [0.1, 0.629], [0.15, 0.704], [0.2, 0.755], [0.25, 0.818], [0.3, 0.881], [0.35, 1.0], [0.4, 1.05], [0.45, 1.05], [0.5, 1.03], [0.55, 1.03], [0.6, 1.05], [0.65, 0.969], [0.7, 0.868], [0.75, 0.818], [0.8, 0.755], [0.85, 0.667], [0.9, 0.554], [0.95, 0.403], [1, 0.113]],
    planWL: [[0, 0], [0.03, 0.25], [0.06, 0.42], [0.1, 0.56], [0.2, 0.7], [0.3, 0.82], [0.4, 0.93], [0.5, 0.98], [0.6, 1], [0.7, 0.93], [0.8, 0.8], [0.9, 0.58], [0.95, 0.4], [1, 0.12]],
    house: { plan: [[0.325, 6.5], [0.36, 8.5], [0.45, 9.0], [0.60, 9.0], [0.64, 7.0]] },
    decks: [
      { f: [0.322, 0.408], hw: 5.4, y: [0, 14.1], windows: true },       // bridge base, 19 m
      { f: [0.358, 0.408], hw: 4.4, y: [14.1, 19.6], windows: true },     // 24.5 m
      { f: [0.385, 0.408], hw: 3.4, y: [19.6, 23.0], windows: true },     // compass platform and director, 27.9 m
      { f: [0.541, 0.559], round: true, hw: 1.7, y: [4.8, 12.4], taper: 0.9 },   // the short stack
      { f: [0.61, 0.683], hw: 5.2, y: [0, 4.0] },                        // aircraft deck, 8.6 m
    ],
    towerF: 0.37, towerY0: 14.0,
    tiers: [{ len: 3.5, w: 4.0, h: 0.1 }],
    dir0: { dx: 0, w: 4.0, l: 3.6, h: 2.2 },
    foremast: { dx: -8.0, y0: 23.0, base: 4.8, apex: 0.7, platform: 0.8, spread: 3.2, back: 6.0, front: 1.5 },
    funnels: [{ lx: 8.0, lz: 5.6, h: 11.7, rake: 4.5, top: 0.9, pipes: false }, { lx: 5.4, lz: 5.0, h: 10.4, rake: 0.3, top: 0.96, pipes: false }],
    mastY0: { 1: 4.0 },
    cat: { f: 0.638, z: 8.7, yaw: 0, len: 20.4, y: 4.0, craneF: 0.693, craneY: 4.0, craneH: 4.5, craneLen: 19.5, craneDir: 1, craneAng: 0.4, craneSide: 0, craneW: 0.7 },
  },
  // Kagero class (Commons outline drawing of the class, MacMoreno, CC BY-SA 4.0; profile and plan, scaled to the 118.5 m length, 15 px per metre, about +-0.3 m): a forecastle at 5.3 m
  // (6.2 m at the stem) stepping down to the 2.9 m main deck at f 0.31-0.33; turrets A at 0.152 and X / Y at 0.730 / 0.800 (X on the deckhouse, 2.3 m higher); the bridge block 0.246-0.293
  // (compass bridge 10.7 m, director 12.5 m), a pole foremast at 0.325 (top 23.7 m), funnels at 0.373 and 0.517 (tops 12.3 / 10.9 m), the quadruple tubes at 0.45 and 0.60, a
  // long deckhouse to f 0.755 (5.2 m) and a signal mast at 0.68 (15 m).
  kagero: KAGERO,
  // Agano (a detailed line drawing of the class with a 50 m scale bar and the waterline, profile and plan, shared by the project owner; measured only, 8.7 px per metre, about +-0.3 m on
  // the hull and +-0.6 m on the superstructure; the rigging of the sheet pollutes the silhouette check): a forecastle rising from 4.8 m amidships to 6.8 m at the stem (10 m at the
  // stem head) and a quarterdeck at 3.9 m abaft f 0.85; turrets A / B at 0.192 / 0.243 (B on a barbette 4.4 m higher) and C at 0.813; the bridge block 0.346-0.41 (tiers 10 / 15.5 / 19 m,
  // cupola 22.9 m), the tripod foremast at 0.421 (top 27 m), the big raked funnel at 0.478 (top 18.1 m), the catapult 0.605-0.729 at 9.2 m with two floatplane carriages, the pole mast at
  // 0.78 (top 28.3 m) with the crane jib leaning forward from 10.1 to 20.3 m.
  agano: {
    mainVariant: 'type41_152', dirKind: 'drum', houseH: 2.2, bulwarkF: [0, 0.03],
    fb: [[0, 6.9], [0.03, 6.2], [0.06, 5.8], [0.12, 5.1], [0.2, 4.9], [0.5, 4.8], [0.8, 4.8], [0.845, 4.7], [0.85, 3.9], [1, 3.9]],
    planDeck: [[0, 0.068], [0.042, 0.49], [0.083, 0.611], [0.125, 0.687], [0.167, 0.747], [0.208, 0.8], [0.25, 0.86], [0.292, 0.92], [0.333, 0.96], [0.375, 0.973], [0.417, 0.985], [0.5, 0.985], [0.625, 0.97], [0.708, 0.943], [0.75, 0.92], [0.792, 0.883], [0.833, 0.838], [0.875, 0.822], [0.917, 0.687], [0.958, 0.536], [1, 0.219]],
    house: { plan: [[0.346, 4.0], [0.37, 6.0], [0.40, 6.0], [0.41, 4.0]] },
    decks: [
      { f: [0.346, 0.41], hw: 3.8, y: [0, 5.2], windows: true },           // bridge base, 10 m
      { f: [0.35, 0.40], hw: 3.4, y: [5.2, 10.7], windows: true },         // 15.5 m
      { f: [0.362, 0.395], hw: 2.8, y: [10.7, 14.2], windows: true },      // 19 m
      { f: [0.372, 0.392], round: true, hw: 1.8, y: [14.2, 18.1] },        // the cupola, 22.9 m
      { f: [0.403, 0.456], hw: 3.4, y: [0, 4.7] },                         // house between the bridge and the funnel, 9.5 m
      { f: [0.5, 0.612], hw: 3.4, y: [0, 3.4] },                           // deckhouse abaft the funnel, 8.2 m
      { f: [0.736, 0.784], hw: 3.0, y: [0, 2.7] },                         // the foot of the aft mast, 7.5 m
    ],
    towerF: 0.382, towerY0: 14.6,
    tiers: [{ len: 3.0, w: 3.0, h: 0.1 }],
    dir0: { dx: 0, w: 2.6, l: 2.6, h: 1.2 },
    foremast: { dx: -6.8, base: 5.0, apex: 0.75, platform: 0.8, spread: 2.6, back: 3.0, front: 1.5 },
    funnels: [{ lx: 7.8, lz: 6.0, y0: 4.7, h: 8.6, rake: 3.0, top: 0.8, pipes: false }],
    mastY0: { 1: 7.5 },
    cat: { f: 0.667, z: 0, yaw: 0, len: 21, y: 4.4, craneF: 0.78, craneY: 5.3, craneH: 1.5, craneLen: 18.8, craneDir: 1, craneAng: 0.575, craneSide: 0, craneW: 0.7 },
  },
  // Bismarck (May 1941): measured on the profile drawing "Battleship Bismark.svg" (Commons, CC0) and the Bundesarchiv photographs
  // 193-04-1-23 / -26, 193-06-7-16. Freeboard 9.5 m at the stem, 5.2 m amidships, 6.5 m at the stern (full load); the 01 level 3.5 m, the forward
  // superstructure 9.3 m, the forward bridge 13.8 m, the tower to 26 m with the foretop rangefinder cupola on top, the funnel 19.8 m;
  // the athwartships catapult between the funnel and the hangars, the mainmast rising from the after hangar.
  bismarck: {
    mainVariant: 'drh34', secVariant: ['drh28_150'], dirKind: 'drum', houseH: 3.5, bulwarkF: [0, 0],
    // three shafts: the centre screw further aft than the wing ones, twin rudders, as drawn on the profile (athwartship positions estimated)
    props: [{ f: 0.928, depth: 6.5, d: 4.7, blades: 3, toF: 0.86 }, { f: 0.900, z: 8.0, depth: 6.2, d: 4.7, blades: 3, toF: 0.83, strutF: 0.885 }],
    rudders: [{ f: 0.945, z: 3.7, top: 2.4, bottom: 6.8, chord: 4.8 }],
    keel: [[0, 0.9], [0.04, 1], [0.86, 1], [0.9, 0.86], [0.91, 0.32], [0.95, 0.2], [0.98, 0.02], [1, 0.0]],   // as drawn
    bow: { rake: 6.5, pr: 1.42, forefoot: 1.8 },   // Atlantic bow: the stem meets the waterline at 2.6 %, the forefoot 1.8 m further aft
    // freeboards at the full-load draft of 9.9 m (the profile is drawn at about 8.5 m: 1.36 m less here, for the real moulded depth of 15 m)
    fb: [[0, 9.54], [0.03, 8.44], [0.06, 7.54], [0.115, 6.34], [0.172, 5.84], [0.258, 5.64], [0.5, 5.24], [0.75, 5.34], [0.87, 5.54], [1, 6.54]],
    house: { plan: [[0.331, 5], [0.36, 8.5], [0.70, 8.5], [0.761, 5]] },   // narrow: the 15 cm turrets stand on the deck outboard of it
    decks: [
      { f: [0.331, 0.455], hw: 7.5, y: [3.5, 8.9], rake: 1.5, windows: true },                         // forward superstructure
      { f: [0.36, 0.405], hw: 7, y: [8.9, 13.2], rake: 0.8, windows: true, wings: 1.8, rail: true },   // forward bridge
      { f: [0.47, 0.484], hw: 3, y: [8.9, 15.8] },                                                      // searchlight tower abaft the tower
      { f: [0.466, 0.488], hw: 4.5, y: [15.8, 16.6] },
      { f: [0.475, 0.53], hw: 7, y: [3.5, 8.9] },                                                       // funnel casing
      { f: [0.53, 0.555], hw: 7.5, y: [3.5, 5.8] },                                                     // aircraft deck (catapult)
      { f: [0.555, 0.635], hw: 7.5, y: [3.5, 7.7] },                                                    // hangars
      { f: [0.598, 0.614], round: true, hw: 2.5, y: [7.7, 12.0], taper: 0.9 },                        // after searchlight / control position
      { f: [0.62, 0.635], hw: 7, y: [3.5, 7.7] },
      { f: [0.635, 0.665], hw: 7, y: [3.5, 9.1], windows: true },                                       // after superstructure
      { f: [0.665, 0.68], hw: 6, y: [3.5, 7.7] },
      { f: [0.68, 0.70], hw: 6, y: [3.5, 9.1], rakeA: 1.0 },
      { f: [0.637, 0.662], hw: 5, y: [9.1, 13.4], windows: true },
      { f: [0.641, 0.651], round: true, hw: 2.6, y: [13.4, 17.7], taper: 0.9 },                       // after fire control tower
    ],
    // the tower: its front steps back as it rises (front at 0.405 / 0.408 / 0.416 / 0.42 / 0.432), the foretop cupola at 0.44
    towerF: 0.433, towerY0: 8.9,
    tiers: [
      { len: 14.3, w: 9, h: 5.4, dx: -0.13, rake: 0.8, windows: true },                                // admiral's bridge
      { len: 16.3, w: 12, h: 0.8, dx: 0.13, windows: false },
      { len: 13, w: 8, h: 5.6, dx: -0.25, round: true, taper: 0.9 },                                  // tower
      { len: 15, w: 12, h: 1.2, dx: -0.5, windows: false },                                           // searchlight platform
      { len: 11, w: 7, h: 2.6, dx: -1.25, round: true, taper: 0.92 },
      { len: 10, w: 7.5, h: 1.0, dx: -1.76, windows: false },
    ],
    dir0: { dx: -1.76, w: 6, l: 4, h: 2.9 },
    foremast: { dx: -8.5, y0: 16.3 },
    // the funnel cap slopes down 4 m from its forward to its after edge
    funnels: [{ lx: 11.5, lz: 7.5, y0: 3.5, h: 16.3, rake: 1.0, top: 0.92, capSlope: 4.0, pipes: false }],
    mastY0: { 1: 7.7 },
    directors: [
      { f: 0.394, y: 13.2, kind: 'drum', w: 5.8, l: 3, h: 2.6, label: 'Télémètre avant' },
      { f: 0.646, y: 17.7, kind: 'drum', w: 5.8, l: 3.5, h: 2.6, label: 'Télémètre arrière' },
      { f: 0.606, y: 12.0, kind: 'drum', w: 3.6, l: 2.6, h: 1.8, label: 'Poste de tir arrière' },
      // the four stabilised AA directors (SL-8) under their domes: abreast the tower and abreast the front of the funnel
      { f: 0.43, z: 6.5, y: 9.7, kind: 'dome', w: 4.5, h: 4.5, label: 'Directeur antiaérien SL-8 tribord avant' },
      { f: 0.43, z: -6.5, y: 9.7, kind: 'dome', w: 4.5, h: 4.5, label: 'Directeur antiaérien SL-8 bâbord avant' },
      { f: 0.495, z: 5, y: 14.7, kind: 'dome', w: 4, h: 3.6, label: 'Directeur antiaérien SL-8 tribord arrière' },
      { f: 0.495, z: -5, y: 14.7, kind: 'dome', w: 4, h: 3.6, label: 'Directeur antiaérien SL-8 bâbord arrière' },
    ],
    // boats as drawn: the two big motor launches on the hangar roof, a launch on the searchlight deck abaft the tower, a cutter on
    // the deck beside the forward superstructure (athwartship positions estimated: no plan view)
    boats: [{ f0: 0.553, f1: 0.604, z: 4.5, y: 8.7, cabin: true }, { f0: 0.455, f1: 0.48, z: 4, y: 10.2 }, { f0: 0.418, f1: 0.446, z: 10, y: 1.5 }],
    // light AA as drawn on the profile (May 1941): eight twin 3.7 cm, the two quadruple 2 cm on the foretop platform, single 2 cm
    aa: [
      { k: 't37', f: 0.44, z: 7, y: 14.5 }, { k: 't37', f: 0.345, z: 6.5, y: 5.5 }, { k: 't37', f: 0.62, z: 6, y: 7.7 }, { k: 't37', f: 0.695, z: 6, y: 3.5 },
      { k: 'q20', f: 0.42, z: 4.5, y: 20.2 },
      { k: 'f20', f: 0.315, z: 7, y: 3.5 }, { k: 'f20', f: 0.38, z: 6, y: 12.0 }, { k: 'f20', f: 0.50, z: 7.5, y: 8.9 }, { k: 'f20', f: 0.773, z: 8, y: 0 },
    ],
    // the athwartships catapult on the aircraft deck; a crane each side of the funnel, its jib raised forward
    cat: { f: 0.538, y: 5.8, yaw: Math.PI / 2, len: 30, craneF: 0.527, craneY: 3.5, craneZ: 9, craneBoth: true, craneH: 3, craneLen: 27.9, craneDir: 1, craneAng: 0.87, craneSide: 0, craneW: 0.8 },
  },
  // Shokaku (1942): measured on the profile and plan of Commons' "Fig of japanese aircraft carrier Shokaku in 1942" (CC BY-SA 3.0; the 50 m
  // scale bar gives 4.0 px/m, 257.8 m overall): flight deck 14.0 m above the waterline, from 0.047 to 0.985 of the length, 29.3 m wide at
  // most and narrowing both ways; hull sides rise straight to the deck; the island 19 m long on a sponson at 11.6-19.7 m to starboard (top
  // 20.1 m, bridge 21.2 m, radar 26.6 m, mast 31.7 m); two funnels outboard; lifts at 0.341 / 0.581 / 0.831. The underwater body and the
  // hull widths below the deck edge are estimated.
  shokaku: {
    v4: SHOKAKU_V4,
    noFunnels: true, flightDeckY: 14.65, noGallery: true, elevators: [0.3385, 0.5743, 0.8236], elevSize: [[6.55, 8.5], [6.55, 6.05], [6.55, 6.05]], elevZ: -0.37,      // the three lifts measured on the reference model: 13 x 17 m forward, 13 x 12 m the others extra: shokakuFunnels, sponsonOut: 2.6,
    fb: [[0, 10.7], [0.03, 10.3], [0.06, 10.2], [0.075, 12.9], [0.9, 12.9], [0.94, 9.8], [1, 9.3]],      // the quarter deck under the flight deck's after end at 9.3 m (measured)
    fdPlan: [[0.0445, 9.5], [0.075, 9.9], [0.1117, 10.4], [0.209, 12.0], [0.298, 13.3], [0.4, 15.0], [0.5, 15.0], [0.671, 15.0], [0.811, 14.1], [0.889, 13.0], [0.962, 13.2]],     // measured on the flight deck of the reference model (236 m, 31.8 m wide at the widest, the bow end 19 m wide)
    planDeck: [[0, 0.05], [0.02, 0.24], [0.047, 0.48], [0.09, 0.68], [0.125, 0.78], [0.2, 0.9], [0.3, 1.02], [0.4, 1.07], [0.5, 1.07], [0.65, 1.07], [0.7, 1.03], [0.8, 0.95], [0.9, 0.9], [0.98, 0.88], [1, 0.84]],
    planWL: [[0, 0], [0.02, 0.12], [0.05, 0.26], [0.1, 0.42], [0.2, 0.62], [0.3, 0.78], [0.4, 0.9], [0.5, 0.96], [0.6, 1], [0.7, 1], [0.8, 0.97], [0.9, 0.9], [0.97, 0.78], [1, 0.6]],
    keel: [[0, 0.8], [0.04, 0.94], [0.88, 0.94], [0.92, 0.8], [0.95, 0.5], [1, 0.35]],
    bow: { rake: 5.8, pr: 1.4, forefoot: 4 }, stern: { overhang: 2, rise: 4 },
    island: {
      z: 15.6, hw: 4.1, mastF: 0.401, mastY0: 1.0, mastTop: 17.7, radarF: 0.349, radarY: 11.5, radarKind: 'box', dirF: 0.352, dirY: 7.2,
      blocks: [
        { f: [0.314, 0.387], z: 15.6, hw: 4.2, y: [-3.0, 1.5] },
        { f: [0.326, 0.375], z: 15.2, hw: 3.4, y: [1.5, 4.2], windows: true },
        { f: [0.330, 0.372], z: 15.0, hw: 3.0, y: [4.2, 6.1], windows: true },
        { f: [0.337, 0.366], z: 15.0, hw: 2.4, y: [6.1, 7.2] },
      ],
    },
    // 127 mm twins in the sponsons at the sides (the spec positions moved to the plan); 25 mm triples round them: positions estimated
    // the 25 mm triples, at the positions measured on the reference model (x, z, platform height); the 127 mm twins are in the sheet (`sponsonZ`)
    aa: [
      { k: 't25', f: 0.0417, z: -4.2, y: -2.75, one: true, noTub: true },
      { k: 't25', f: 0.0417, z: 3.4, y: -2.75, one: true, noTub: true },
      { k: 't25', f: 0.4893, z: -17.3, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.5161, z: -17.3, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.546, z: -17.3, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.5744, z: -17.3, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.635, z: -17.3, y: -2.35, one: true, noTub: true },
      { k: 't25', f: 0.661, z: -17.3, y: -2.35, one: true, noTub: true },
      { k: 't25', f: 0.294, z: 12.6, y: 0.25, one: true, noTub: true },
      { k: 't25', f: 0.4109, z: 17.5, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.4373, z: 17.5, y: -2.25, one: true, noTub: true },
      { k: 't25', f: 0.4214, z: 13.9, y: 0.25, one: true, noTub: true },
      { k: 't25', f: 0.8571, z: 15.15, y: -2.4, one: true, noTub: true },
      { k: 't25', f: 0.8825, z: 15.15, y: -2.4, one: true, noTub: true },
      { k: 't25', f: 0.9788, z: 3.05, y: -5.35, one: true, noTub: true },
      { k: 't25', f: 0.9788, z: -3.75, y: -5.35, one: true, noTub: true },
      { k: 't25', f: 0.7724, z: 15.8, y: -1.5, one: true, noTub: true },
      { k: 't25', f: 0.7975, z: 15.8, y: -1.5, one: true, noTub: true },
    ],
  },
  // Essex class (long hull), drawn from a reference model (v4): flight deck 18.5 m above the waterline, 262 m long, 27.6 m wide at the bow and stern ends and up to 34 m
  // amidships (the port edge 3.6 m wider than the starboard one); the island and its funnel at 0.45-0.5 of the length, a lattice mast at 0.455 (top 48 m); the centre-line
  // lifts at 0.169 and 0.656 (16 x 14 m, 2 m to starboard of the centre line) and the deck-edge lift to port at 0.439 (19 x 10 m); four twin 5 in on sponsons to starboard,
  // four single open ones to port; 10 quadruple 40 mm and 50 single 20 mm in the galleries and sponsons (the model's: the sheet's 17 quads are made up by `aaAt`)
  essex: {
    mainVariant: { 2: 'mk28', 1: 'mk30' }, elevators: [0.169, 0.656, 0.439], deckEdge: true, flightDeckY: 18.5, noGallery: true,
    elevSize: [[8.05, 7.05], [8.05, 7.05], [9.46, 4.96]], elevZ: 2.0, edgeLift: { z: -20.08, hl: 9.46, hw: 4.96 },
    // the deck outline of the model (half-widths; the model's is 3.6 m wider to port amidships, the aircraft are spotted inside the narrower side)
    fdPlan: [[0, 11.0], [0.012, 12.8], [0.035, 13.4], [0.2, 13.6], [0.234, 14.0], [0.3, 14.5], [0.4, 15.0], [0.7, 14.5], [0.788, 13.8], [0.832, 13.8], [0.855, 13.6], [0.99, 13.3]],
    // long hull: the clipper stem 7.5 m ahead of the flight deck, the round stern under its after end (waterline length 250 m)
    bow: { rake: 9, pr: 1.3 }, stern: { overhang: 12, rise: 8 }, fdBowOver: -4.9,
    // four screws and the rudder where the model has them (its shafts and brackets stay drawn; its own screws and rudder are left out)
    props: [{ f: 0.884, z: 5.7, depth: 4.85, d: 4.6, blades: 4, toF: 0.8836 }, { f: 0.825, z: 9.4, depth: 5.3, d: 4.6, blades: 4, toF: 0.8246 }],
    rudders: [{ f: 0.9077, top: 0.6, bottom: 6.4, chord: 8.5, t: 0.8 }],
    keel: [[0, 0.8], [0.05, 1], [0.84, 1], [0.89, 0.6], [0.94, 0.35], [1, 0.25]],
    island: { z: 12.7, hw: 3.0, funnelTop: 18.7, funnelLx: 9.5, funnelLz: 4.6, mastF: 0.455, mastTop: 29.5 },
    v4: ESSEX_V4, aa: [],      // the light mounts come from the model (10 quadruple 40 mm, 50 single 20 mm; `aaAt`: the quads it lacks)
    // four quadruple 40 mm more on the free sponsons of the stern (the sheet has 17, the model 10; the galleries are full elsewhere): places, not measurements
    aaAt: [{ k: 'q40', x: -123.25, y: 16, z: -12.25 }],
  },
  // Illustrious (ONI 201 sheet, public domain: flight deck 40 ft and stack top 91.5 ft above the waterline printed on it, 4.17 px/m in the
  // profile, 2.26 px/m in the plan): flight deck 12.2 m above the waterline, from stem to stern, 28.6 m wide with a narrower stern box
  // and bow end; two lifts 13.3 x 7 m at 0.18 / 0.87; the island 0.316-0.523 at starboard (the bridge to 22.6 m forward, the funnel
  // 0.423-0.46 to 27.2 m, the mast to 32.5 m); the 4.5 in twins in sponsons in two pairs at each end, the pom-poms along the sides.
  illustrious: {
    flightDeckY: 12.2, noGallery: true, elevators: [0.18, 0.87], elevSize: [6.7, 3.4], sponsonOut: 2.0,
    fdPlan: [[0.0, 10.3], [0.05, 10.8], [0.1, 12.0], [0.17, 14.0], [0.2, 14.3], [0.85, 14.3], [0.9, 12.5], [0.915, 9.9], [0.995, 9.9]],
    fb: [[0, 9.6], [0.03, 9.7], [0.1, 10.9], [0.95, 10.9], [1, 9.8]],
    planDeck: [[0, 0.66], [0.05, 0.69], [0.1, 0.77], [0.17, 0.91], [0.2, 0.93], [0.85, 0.93], [0.9, 0.81], [0.915, 0.63], [0.995, 0.63], [1, 0.6]],
    planWL: [[0, 0], [0.03, 0.2], [0.08, 0.4], [0.15, 0.62], [0.25, 0.82], [0.35, 0.95], [0.5, 1], [0.7, 1], [0.8, 0.97], [0.9, 0.88], [0.97, 0.7], [1, 0.55]],
    bow: { rake: 4.0, pr: 1.4 }, stern: { overhang: 2, rise: 4 },
    island: {
      z: 11.0, hw: 3.4, funnelTop: 15.0, funnelLx: 8.5, funnelLz: 5.5, mastF: 0.399, mastY0: 10.4, mastTop: 20.3, radarF: 0.40, radarY: 17.0, dirF: 0.38, dirY: 10.4,
      blocks: [
        { f: [0.316, 0.351], z: 11.0, hw: 3.0, y: [-1.0, 2.5] },
        { f: [0.351, 0.41], z: 11.0, hw: 3.4, y: [-1.0, 10.4], windows: true },
        { f: [0.41, 0.425], z: 11.0, hw: 3.0, y: [-1.0, 7.0] },
        { f: [0.46, 0.523], z: 11.0, hw: 3.2, y: [-1.0, 7.3] },
      ],
    },
    aa: [
      ...[0.50, 0.395, 0.345].map((f) => ({ k: 'p40', f, z: -13.5, y: -2.8, one: true })),
      ...[0.545, 0.495, 0.305].map((f) => ({ k: 'p40', f, z: 13.5, y: -2.8, one: true })),
    ],
  },
  // Graf Zeppelin (ONI 204 sheet of September 1942, Commons, public domain: a US intelligence reconstruction "substantially correct for hull
  // proportion"; scale from the length): flight deck 16.0 m above the waterline from the stern to 0.059 of the length, 31 m wide, narrowing at
  // both ends; the hull ahead of it at 10.8 m; a long low island on a sponson at 7-17.8 m to starboard (lower block 19 m, the funnel / bridge
  // block to 30.1 m, the tower to 34.9 m); six groups of 150 mm casemates in the hull side. The underwater body is not on the sheet (estimated).
  graf_zeppelin: {
    flightDeckY: 16.0, noGallery: true, elevators: [0.27, 0.52, 0.80], sponsonOut: 1.2,
    fdPlan: [[0.06, 10.5], [0.083, 13.4], [0.125, 15.2], [0.2, 15.5], [0.9, 15.6], [0.96, 13.6], [1.0, 12.0]],
    fb: [[0, 10.8], [0.045, 10.8], [0.062, 14.7], [0.1, 14.7], [0.9, 14.7], [1, 14.4]],
    planDeck: [[0, 0.052], [0.042, 0.381], [0.083, 0.753], [0.125, 0.856], [0.2, 0.9], [0.5, 0.99], [0.9, 0.99], [0.96, 0.85], [1, 0.76]],
    planWL: [[0, 0], [0.03, 0.2], [0.06, 0.4], [0.1, 0.62], [0.2, 0.84], [0.3, 0.95], [0.5, 1], [0.7, 1], [0.85, 0.96], [0.95, 0.8], [1, 0.6]],
    bow: { rake: 5, pr: 1.4, forefoot: 5 },
    secKind: ['dp'],
    island: {
      z: 12.4, hw: 5.2, funnelTop: 14.1, funnelLx: 11.5, funnelLz: 7.4, mastF: 0.4795, mastY0: 3.0, mastTop: 18.9, radarF: 0.4795, radarY: 14.0, dirF: 0.4795, dirY: 18.9, radarKind: 'box',
      blocks: [
        { f: [0.40, 0.60], z: 12.4, hw: 5.2, y: [-2.5, 3.0] },
        { f: [0.4705, 0.4894], z: 11.0, hw: 2.4, y: [3.0, 18.9], windows: true },
        { f: [0.446, 0.457], z: 11.0, hw: 3.4, y: [3.0, 9.2], windows: true },
        { f: [0.406, 0.43], z: 11.5, hw: 3.4, y: [3.0, 4.8] },
      ],
    },
  },
  // Bearn (the 1927 photograph of the starboard side "Bearn (1927)", Commons, public domain, nearly broadside: the horizontal scale comes
  // from the length, heights have the perspective of the near side, about +-1.5 m; no plan was found, so the hull plan is generic): the
  // flight deck 19.8 m above the waterline over a forecastle at 10 m (open to the sea under the deck forward, the gun deck with the 155 mm
  // casemates at 12-14 m), the hangar side rising to the flight deck from f 0.37 aft; the island on a sponson to starboard: a big box (0.505-0.556, top
  // 37.5 m) with the funnel inside, stepped bridge tiers ahead of it (0.445-0.50) and the mast at 0.4635 (top 56 m).
  bearn: {
    // the deck of the model: 16.6 m over the waterline, 26.8 m wide, tapering to a point at both ends (half widths read on the model, stern end 90 m aft of the middle)
    flightDeckY: 16.6, noGallery: true, elevators: [0.22, 0.42, 0.76], sponsonOut: 1.4,
    fdPlan: [[0, 3.0], [0.03, 6.0], [0.07, 8.5], [0.12, 9.3], [0.2, 9.3], [0.265, 10.8], [0.33, 12.9], [0.4, 13.1], [0.5, 13.4], [0.76, 13.4], [0.84, 12.6], [0.885, 10.5], [0.93, 9.0], [1, 4.3]],
    aa: [],      // the light mounts come from the model (6 twin 13.2 mm, 8 single 37 mm)
    v4: BEARN_V4,
    // four screws and two rudders where the model has them (the shafts and their brackets are the model's: the game's own shafts are left no length)
    props: [{ f: 0.918, z: 3.3, depth: 6.1, d: 4.3, blades: 3, toF: 0.9175 }, { f: 0.84, z: 6.8, depth: 6.0, d: 4.5, blades: 3, toF: 0.8395 }],
    rudders: [{ f: 0.9455, z: 2.9, top: 0.75, bottom: 7.4, chord: 5.1, t: 0.4 }],
    fb: [[0, 10.0], [0.04, 9.8], [0.33, 10.0], [0.37, 18.6], [0.95, 18.6], [1, 18.4]],
    island: {
      z: 10.0, hw: 3.6, funnelTop: 18.4, funnelLx: 11.0, funnelLz: 4.6, mastF: 0.4635, mastY0: 11.0, mastTop: 36.2, radarF: 0.4635, radarY: 28.0, dirF: 0.47, dirY: 9.5,
      blocks: [
        { f: [0.506, 0.556], z: 10.0, hw: 3.8, y: [-2.0, 17.7], windows: true },
        { f: [0.445, 0.502], z: 10.4, hw: 3.4, y: [-2.0, 5.2] },
        { f: [0.447, 0.495], z: 10.4, hw: 3.1, y: [5.2, 9.5] },
        { f: [0.455, 0.485], z: 10.4, hw: 2.6, y: [9.5, 12.0] },
      ],
    },
  },
  // Aquila: measured on a colour profile and plan with a 30 m scale bar and the waterline drawn, shared by the project owner (author and licence
  // UNKNOWN: consulted for measurements only, never redistributed): flight deck 16.0 m above the waterline, from f 0.08 to the stern, 18.6-25 m
  // wide (narrowest at the stern end); lifts 14 x 15 m at 0.363 and 0.5385 (the spec had 0.43 and 0.55); the funnel 13.4 m long at 0.482-0.539
  // (top 31.1 m), the bridge block 0.435-0.465 (24.8 m) and the tower 0.418-0.433 (31 m) on a sponson at 11-19 m to starboard.
  aquila: {
    flightDeckY: 16.0, noGallery: true, elevators: [0.363, 0.5385], elevSize: [7.1, 7.6], sponsonOut: 1.6,
    fdPlan: [[0.08, 8.9], [0.095, 9.3], [0.15, 10.4], [0.2, 11.0], [0.3, 12.0], [0.4, 12.4], [0.6, 12.4], [0.8, 12.3], [0.9, 11.6], [0.96, 10.2], [1.0, 9.3]],
    fb: [[0, 12.4], [0.03, 12.1], [0.062, 12.1], [0.07, 14.8], [0.1, 14.8], [0.9, 14.8], [1, 14.8]],
    planDeck: [[0, 0.1], [0.04, 0.3], [0.08, 0.48], [0.12, 0.64], [0.2, 0.78], [0.3, 0.9], [0.4, 0.97], [0.5, 1], [0.8, 1], [0.9, 0.9], [0.96, 0.7], [1, 0.55]],
    planWL: [[0, 0], [0.03, 0.2], [0.07, 0.38], [0.12, 0.55], [0.2, 0.72], [0.3, 0.85], [0.4, 0.94], [0.5, 0.99], [0.7, 1], [0.85, 0.94], [0.93, 0.75], [1, 0.5]],
    island: {
      z: 13.2, hw: 4.0, funnelTop: 15.1, funnelLx: 13.4, funnelLz: 5.2, mastF: 0.426, mastY0: 15.1, mastTop: 17.5, radarF: 0.426, radarY: 15.5, dirF: 0.465, dirY: 8.8,
      blocks: [
        { f: [0.435, 0.465], z: 14.0, hw: 3.6, y: [-1.0, 8.8], windows: true },
        { f: [0.418, 0.433], z: 14.0, hw: 2.4, y: [8.8, 15.1], windows: true },
        { f: [0.469, 0.60], z: 14.8, hw: 3.6, y: [-1.0, 3.8] },
        { f: [0.40, 0.469], z: 14.8, hw: 3.8, y: [-1.0, 5.4] },
      ],
    },
  },
};

// The other fits of a ship (data/variants.js): the tweaks of the base with the differences. dropPlacements: the mounts of the model (names of its layout records) that this fit does not have;
// aaAt: the light mounts it has that the model lacks; noTubes / v4Drop: the tubes are landed and not drawn.
const VARIANT_TWEAKS = {
  tade_pb39: { noTubes: true, v4Drop: ['tubes0', 'tubes1'], aaAt: TADE_PB39_AA, dropPlacements: ['m2'] },
  kagero_1944: { aaAt: KAGERO_1944_AA, dropPlacements: ['m1'], v4Clean: [{ x: -27.2, z: 0, r: 2.7, y0: 5.6, maxArea: 1.5 }, { x: -27.2, z: 0, r: 4.4, y0: 5.6, maxArea: 0.12 }] },      // the roller path of the X turret
  shokaku_1944: { aaAt: SHOKAKU_1944_AA },
  gioberti_1940: { aa: [], aaAt: GIOBERTI_1940_AA, dropPlacements: ['13mm_Breda_1931_Twin#0', '13mm_Breda_1931_Twin#1', '13mm_Breda_1931_Twin#2', '13mm_Breda_1931_Twin#3'] },
  gioberti_1942: { aa: [], aaAt: GIOBERTI_1942_AA, dropPlacements: ['13mm_Breda_1931_Twin#0', '13mm_Breda_1931_Twin#1', '13mm_Breda_1931_Twin#2', '13mm_Breda_1931_Twin#3', '120mm-15_StarShell#0'], v4Drop: ['533mm_Torpedo_Triple#0'], dropTubesWhere: (t) => t.x < -15 },
};
for (const v of VARIANTS) TWEAKS[v.id] = { ...TWEAKS[v.base], ...VARIANT_TWEAKS[v.id] };
