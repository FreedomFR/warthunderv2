// adams: the tweaks of the adams model (see ../shipbuilder.js for the options and ../tweaks.js for the others); measured on a reference model, see docs/CREDITS.md.
// The helpers of the builder are passed to `extra(ctx)`.

/**
 * Charles F. Adams class: what the generic builder does not draw. Heights are metres over the waterline, positions fractions of the length from the bow, all measured on cuts and
 * orthographic views of a reference model (about +-0.3 m): the sonar dome under the bow, the Mk 11 twin-arm Tartar launcher on the fantail (0.845), the Mk 16 ASROC box between the
 * stack-masts (0.485), the Mk 32 triple tubes, the radars (SPS-37 plate behind the after stack, the two SPG-51 dishes, SPS-10 and SPS-39 on the mast) and the whip aerials.
 */
function adamsExtras({ b, hull, X, Y, pal, model, MAT, rgb, shade, part, PT, note, DT }) {
  const hullc = rgb(pal.hull), sup = rgb(pal.sup), grey = rgb('#8a9096'), dark = rgb('#2a2d31'), boot = rgb(pal.boot), white = rgb('#d8dcdc'), olive = rgb('#5c6a5a');
  // the AN/SQS-23 sonar dome: a flat-bottomed drum under the forefoot, 8.4 m across, 6.7 m below the waterline at its bottom
  b.cylinder(X(0.154), -6.7, 0, 4.2, 4.2, -3.6, boot, MAT.SKIN, { seg: 24 });
  b.cylinder(X(0.154), -3.9, 0, 4.2, 3.4, -3.4, boot, MAT.SKIN, { seg: 24 });
  // the Mk 16 ASROC launcher: an 8-cell box on a pedestal on the centre line
  { const x = X(0.485), y = 6.7;
    b.block({ x0: x + 1.4, x1: x - 1.4, hw: 1.1, y0: y, y1: y + 1.0 }, shade(hullc, 0.9), MAT.HULL);
    b.block({ x0: x + 2.5, x1: x - 2.5, hw: 1.55, y0: y + 1.0, y1: y + 3.0, tx0: x + 2.35, tx1: x - 2.35, thw: 1.45 }, rgb('#7c858c'), MAT.HULL);
    for (let i = -3; i <= 3; i++) b.block({ x0: x + 2.52, x1: x + 2.5 - 0.02, hw: 0.04, zc: i * 0.4, y0: y + 1.1, y1: y + 2.9 }, dark, MAT.DARK); }
  // the Mk 11 launcher: a deckhouse, the round base, two arms each holding a missile in line, tilted up a little
  { const x = X(0.845), yd = Y(x);
    b.block({ x0: X(0.82), x1: X(0.868), hw: 3.0, y0: yd - 0.2, y1: yd + 2.5, tx0: X(0.82) - 0.3, tx1: X(0.868) + 0.3, thw: 2.8 }, sup, MAT.HULL);
    const y1 = yd + 2.5;
    b.cylinder(x, y1, 0, 1.5, 1.35, y1 + 1.1, shade(grey, 0.85), MAT.HULL, { seg: 16 });
    for (const sg of [-1, 1]) {
      b.block({ x0: x + 2.4, x1: x - 2.0, hw: 0.14, zc: sg * 0.85, y0: y1 + 1.0, y1: y1 + 1.35 }, shade(grey, 0.8), MAT.HULL);                 // the arm
      b.rod(x - 2.0, x + 2.3, y1 + 1.75, sg * 0.85, 0.22, 0.22, white, MAT.HULL, { seg: 10 });                                                  // the missile
      b.rod(x + 2.3, x + 2.9, y1 + 1.75, sg * 0.85, 0.22, 0.05, shade(white, 0.9), MAT.HULL, { seg: 10 });                                       // its nose
      b.block({ x0: x + 0.2, x1: x - 0.2, hw: 0.1, zc: sg * 0.85, y0: y1 + 1.3, y1: y1 + 1.55 }, shade(grey, 0.8), MAT.HULL);
    }
    b.block({ x0: x - 1.1, x1: x - 2.2, hw: 1.2, y0: y1 + 1.1, y1: y1 + 1.9 }, shade(grey, 0.9), MAT.HULL); }                                      // the loader behind
  // the Mk 32 triple tubes, one each side abaft the forward stack-mast, on the main deck outside the deckhouse, each a module of its own
  { const x = X(0.452);
    model.tubes.length = 0;
    [-1, 1].forEach((sg, i) => {
      const z = sg * 5.9, yd = Y(x), y = yd + 0.55;
      part('tubes' + i, 'tubes', 'Tubes lance-torpilles Mk 32', () => {
        b.block({ x0: x + 0.9, x1: x - 0.9, hw: 0.7, zc: z, y0: yd - 0.1, y1: y }, shade(hullc, 0.85), MAT.HULL);
        for (const dz of [-0.3, 0, 0.3]) b.rod(x - 1.2, x + 1.3, y + 0.35, z + dz, 0.15, 0.15, olive, MAT.HULL, { seg: 8 });
        b.block({ x0: x + 0.3, x1: x - 0.2, hw: 0.45, zc: z, y0: y + 0.05, y1: y + 0.55 }, shade(hullc, 0.8), MAT.HULL);
      }, () => b.box(x, y + 0.2, z, 2.2, 0.6, 1.4, shade(dark, 1.1), MAT.DARK));
      model.tubes.push({ x, y: y + 0.6, z, n: 3, side: sg });
    }); }
  // the radars, each a part of its own that turns
  const radar = (id, label, o, draw) => part(id, 'radar', label, draw, undefined, { spin: { x: o.x, y: o.y, z: o.z || 0, rate: o.rate } });
  { const x = X(0.536);                                                       // the SPS-37 (long range air search) plate on its platform abaft the after stack-mast
    b.block({ x0: x + 1.0, x1: x - 1.2, hw: 2.6, y0: 16.2, y1: 16.45 }, shade(grey, 0.9), MAT.HULL);
    radar('radar0', 'Radar de veille', { x, y: 18.0, rate: 0.5 }, () => {
      b.block({ x0: x + 0.15, x1: x - 0.15, hw: 2.4, y0: 17.0, y1: 21.7, tx0: x + 0.5, tx1: x + 0.2, thw: 2.4 }, shade(grey, 1.05), MAT.HULL);
      b.block({ x0: x + 0.15, x1: x - 0.1, hw: 0.2, y0: 16.45, y1: 17.1 }, shade(grey, 0.8), MAT.HULL); }); }
  for (const [i, f, top] of [[1, 0.617, 17.0], [2, 0.665, 14.8]]) {            // the two SPG-51 dishes of the Tartar fire control, on columns
    const x = X(f), y0 = Y(x) + 1.6;
    b.cylinder(x, 6.6, 0, 0.6, 0.55, top - 2.0, shade(hullc, 0.95), MAT.HULL, { seg: 12 });
    radar('radar' + i, 'Radar de conduite de tir ' + i, { x, y: top - 1.2, rate: 1.9 }, () => PT.radar(b, { x, y: top - 2.0, z: 0, kind: 'dish', w: 1.9 }, pal)); }
  { const xm = X(0.372);                                                      // the mast: a platform with the SPS-10 blade and the SPS-39 box, a pole above
    b.block({ x0: xm + 1.6, x1: xm - 1.6, hw: 2.4, y0: 27.1, y1: 27.35 }, shade(grey, 0.9), MAT.HULL);
    radar('radar3', 'Radar de surface', { x: xm, y: 28.4, rate: 1.2 }, () => PT.radar(b, { x: xm, y: 27.4, z: 0, kind: 'box', w: 3.2 }, pal));
    b.rod(xm, xm, 27.4, 0, 0.1, 0.06, grey, MAT.HULL, { seg: 6 }); }
  for (const [f, top, y0] of [[0.573, 26.7, 12.0], [0.178, 14.6, 8.4]]) { const x = X(f); b.rod(x, x, y0, 0, 0.05, 0.03, grey, MAT.HULL, { seg: 5 }); b.cylinder(x, y0, 0, 0.05, 0.02, top, grey, MAT.HULL, { seg: 5 }); }   // whip aerials
}

// USS Adams (Charles F. Adams class, 1960: a post-war guided-missile destroyer; hull, structures and positions measured in metres on cuts and orthographic views of a reference model, about
// +-0.3 m): the 5"/54 Mk 42 at 0.18 and 0.742, the long deckhouse 0.255-0.66 (top 6.7 m over the waterline), the bridge 0.262-0.345 (wings 6 m off the centre line, top 12-15 m), the two big
// stack-masts at 0.411 (top 19.7 m) and 0.563 (18 m), the lattice mast at 0.372 (top 33.6 m), the ASROC box 0.485, the Tartar launcher 0.845, a sonar dome 6.7 m under the waterline at 0.154
export const ADAMS = {
  mainVariant: 'mk42', dirKind: 'drum', noRadar: true, ownTubes: true, aa: [], houseH: 2.6, bulwarkF: [0, 0.01],
  fb: [[0, 8.6], [0.05, 8.6], [0.1, 7.8], [0.15, 7.0], [0.2, 6.3], [0.25, 5.4], [0.3, 5.0], [0.325, 4.7], [0.35, 4.6], [0.4, 4.2], [0.5, 4.1], [0.6, 3.9], [0.75, 4.0], [0.825, 4.2], [0.9, 4.4], [1, 4.6]],
  planDeck: [[0, 0.025], [0.025, 0.231], [0.05, 0.348], [0.075, 0.446], [0.1, 0.527], [0.125, 0.598], [0.15, 0.662], [0.175, 0.719], [0.2, 0.765], [0.225, 0.809], [0.25, 0.847], [0.275, 0.875], [0.3, 0.902], [0.325, 0.925], [0.35, 0.941], [0.375, 0.961], [0.4, 0.984], [0.425, 0.997], [0.45, 1.01], [0.475, 1.017], [0.5, 1.023], [0.525, 1.024], [0.55, 1.024], [0.575, 1.024], [0.6, 1.023], [0.625, 1.017], [0.65, 1.012], [0.675, 1.008], [0.7, 1.002], [0.725, 0.994], [0.75, 0.98], [0.775, 0.961], [0.8, 0.94], [0.825, 0.922], [0.85, 0.884], [0.875, 0.843], [0.9, 0.843], [0.925, 0.797], [0.95, 0.687], [0.97, 0.62], [0.985, 0.45], [0.995, 0.25], [1, 0.02]],
  planWL: [[0, 0], [0.025, 0], [0.05, 0.114], [0.075, 0.204], [0.1, 0.29], [0.125, 0.369], [0.15, 0.445], [0.175, 0.519], [0.2, 0.588], [0.225, 0.656], [0.25, 0.718], [0.275, 0.779], [0.3, 0.834], [0.325, 0.875], [0.35, 0.912], [0.375, 0.945], [0.4, 0.974], [0.425, 0.988], [0.45, 1], [0.475, 1.012], [0.5, 1.021], [0.525, 1.021], [0.55, 1.021], [0.575, 1.02], [0.6, 1.019], [0.625, 1.009], [0.65, 1], [0.675, 0.99], [0.7, 0.979], [0.725, 0.966], [0.75, 0.952], [0.775, 0.936], [0.8, 0.914], [0.825, 0.889], [0.85, 0.851], [0.875, 0.8], [0.9, 0.739], [0.925, 0.668], [0.95, 0.6], [0.97, 0.52], [0.985, 0.38], [0.995, 0.2], [1, 0]],
  keel: [[0, 0], [0.025, 0], [0.05, 0.96], [0.075, 0.99], [0.1, 1.01], [0.125, 1.03], [0.2, 1.03], [0.8, 1.02], [0.825, 0.95], [0.85, 0.75], [0.875, 0.61], [0.9, 0.48], [0.925, 0.38], [0.95, 0.28], [0.975, 0.2], [1, 0.15]],
  house: { plan: [[0.255, 3.2], [0.268, 5.3], [0.66, 5.4], [0.675, 3.8]] },
  decks: [
    { f: [0.262, 0.343], hw: 3.6, y: [1.7, 4.5], windows: true },          // the 01 level of the bridge, 9.5 m
    { f: [0.27, 0.335], hw: 4.6, y: [4.5, 7.0], windows: true, wings: 1.4 }, // the bridge with its wings, 12 m
    { f: [0.284, 0.318], hw: 2.4, y: [7.0, 9.9], windows: true },          // the upper bridge and the director base, 14.9 m
    { f: [0.575, 0.655], hw: 2.6, y: [2.8, 6.6], windows: true },          // the after tower between the stack-mast and the Tartar launcher, 10.5 m
    { f: [0.66, 0.7], hw: 3.6, y: [1.0, 3.0] },                            // the deckhouse abaft the house, under the after gun
  ],
  towerF: 0.30, towerY0: 9.9, tiers: [{ len: 2.4, w: 2.4, h: 0.1 }],
  dir0: { dx: 0, w: 2.4, l: 2.6, h: 1.5 },
  foremast: { dx: -9.6, y0: 2.5, r0: 1.5, r1: 0.5, cap: 3 },
  mastY0: { 1: 2.5 },
  funnels: [{ lx: 5.2, lz: 6.0, y0: 2.6, h: 13.0, rake: 0.5, top: 0.7, pipes: false }, { lx: 4.4, lz: 5.4, y0: 2.8, h: 11.4, rake: 0.5, top: 0.72, pipes: false }],
  props: [{ f: 0.925, z: 2.9, depth: 4.4, d: 3.4, blades: 5, toF: 0.84, strutF: 0.91 }],
  rudders: [{ f: 0.953, z: 0, top: 1.0, bottom: 6.2, chord: 3.0 }],
  boats: [{ f0: 0.556, f1: 0.615, z: 5.0, y: 3.4, cabin: false, davits: true }, { f0: 0.556, f1: 0.615, z: -5.0, y: 3.4, cabin: false, davits: true }],
  extra: adamsExtras,
};
