// Per-ship hand tuning of the generated models (see shipbuilder.js for the options).
// Keyed by spec id. Anything not listed here is built purely from the spec sheet.
//
//   pagoda: [baseLength, baseWidth, tiers, height]   Japanese pagoda foremast
//   tiers:  explicit bridge tiers                      [{ len, w, h, dx, rake, wings }]
//   elevators / deckEdge: carrier lifts (fractions from the bow; the last one is on the deck edge when deckEdge)
//   funnelW / funnelLen / funnelRake / funnelScale     funnel proportions
//   extra(ctx): free-hand additions with the MeshBuilder (ctx.b) and the parts library (ctx.PT)

/** Shokaku class: two funnels trunked out to the starboard side and turned downwards. */
function shokakuFunnels({ b, X, spec, pal, model, MAT, rgb, shade, part }) {
  const hw = (spec.flightDeckWidth || spec.beam) / 2;
  const col = rgb(pal.funnel), dark = rgb(pal.cap), char = shade(rgb(pal.dark), 1.1);
  const fdY = 17.2;
  [0.475, 0.535].forEach((f, i) => {
    const x = X(f), y = fdY - 5.5, z0 = hw * 0.55, z1 = hw * 0.55 + 6.2;
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => {
      b.rodZ(x, y, z0, z1, 1.9, 1.9, col, MAT.HULL, { seg: 12 });
      b.cylinder(x, y - 7.5, z1, 1.9, 1.9, y + 1.9, col, MAT.HULL, { seg: 12, capTop: false });
      b.cylinder(x, y - 8.0, z1, 1.95, 1.95, y - 7.2, dark, MAT.DARK, { seg: 12 });
    }, () => {
      b.rodZ(x, y, z0, z0 + 2.2, 1.9, 1.9, char, MAT.DARK, { seg: 12 });
      b.cylinder(x, y - 1.5, z0 + 2.2, 1.8, 1.4, y + 1.0, char, MAT.DARK, { seg: 10 });
    });
    model.smoke.push([x, y - 8.0, z1]);
  });
}

export const TWEAKS = {
  // Iowa: measured on the class profile and plan drawing (Commons, public domain), checked on photographs 80-G-K-15631 (port profile in
  // silhouette) and NH 44538. Heights are above the local deck: 01 level 2.3 m, 02 level 4.8 m, forward bridge 13.2 m, the block around
  // the forward funnel 19.4 m, Mk 38 director 29.3-32.5 m; funnel tops 23.8 / 22.9 m; after director tower 18 m.
  iowa: {
    mainVariant: 'mk7', secVariant: ['mk28'], houseH: 2.3,
    // freeboards from the profile: 13.5 m at the stem, about 6.5 m amidships, 7.8 m at the stern; a bulwark only round the bow
    fb: [[0, 13.5], [0.04, 11.6], [0.08, 10.9], [0.12, 10.2], [0.16, 8.8], [0.2, 8.2], [0.26, 7.2], [0.42, 6.4], [0.5, 6.5], [0.7, 6.6], [0.85, 7.4], [1, 7.8]],
    bulwarkF: [0, 0.07],
    // hull lines: the deck edge from the plan view (a long, narrow bow, full beam only from turret 2 aft); the waterline a little finer
    // than the deck forward of turret 2, where the bow flares, and plumb sides amidships
    planDeck: [[0, 0.08], [0.02, 0.17], [0.04, 0.22], [0.06, 0.25], [0.1, 0.31], [0.13, 0.36], [0.16, 0.41], [0.2, 0.49], [0.25, 0.63], [0.3, 0.77], [0.35, 0.87], [0.4, 0.94], [0.45, 0.985], [0.5, 1], [0.7, 1], [0.8, 0.965], [0.85, 0.9], [0.9, 0.77], [0.95, 0.58], [0.98, 0.41], [1, 0.3]],
    planWL: [[0, 0], [0.03, 0.1], [0.06, 0.17], [0.1, 0.25], [0.15, 0.34], [0.2, 0.44], [0.25, 0.57], [0.3, 0.72], [0.35, 0.85], [0.4, 0.94], [0.45, 0.985], [0.5, 1], [0.72, 1], [0.8, 0.965], [0.85, 0.895], [0.9, 0.76], [0.95, 0.56], [1, 0.3]],
    house: { plan: [[0.40, 3], [0.43, 15], [0.64, 15], [0.71, 2]] },
    decks: [
      { plan: [[0.412, 3], [0.44, 11.5], [0.63, 11.5], [0.675, 3]], y: [2.3, 4.8] },                // 02 level
      { f: [0.403, 0.48], hw: 9, y: [4.8, 8.6], rake: 0.6, windows: true },                         // forward bridge
      { f: [0.405, 0.474], hw: 7.5, y: [8.6, 13.2], rake: 1.0, taper: 0.95, windows: true },
      { f: [0.535, 0.598], hw: 8.5, y: [4.8, 9.0] },                                                  // between the funnels
      { f: [0.632, 0.70], hw: 8, y: [4.8, 8.7], rakeA: 1.5, windows: true },                         // after superstructure
      { f: [0.661, 0.681], round: true, hw: 2.6, y: [8.7, 13.6], taper: 0.85 },                      // after director tower
      { f: [0.657, 0.687], hw: 4, y: [13.6, 14.6] },
    ],
    towerF: 0.484, towerY0: 4.8,
    tiers: [
      { y0: 0, len: 17, w: 9, h: 14.6, dx: -5.3, windows: true },                                     // block around the forward funnel
      { len: 19.5, w: 15, h: 1.2, dx: -3.5, windows: false },                                         // wide platform
      { len: 7, w: 7.5, h: 5.3, dx: -0.6, round: true, taper: 0.95 },                                // tower
      { len: 8.6, w: 9.5, h: 3.4, dx: 0.8, rake: 0.5 },                                               // top house under the Mk 38
    ],
    dir0: { dx: 1.4, w: 4.2, l: 4.6, h: 3.0 },
    foremast: { dx: -4.8, y0: 23.9 },
    funnels: [{ lx: 7.8, lz: 6.4, y0: 4.8, h: 19.0, rake: 0.8, top: 0.95 }, { lx: 9.0, lz: 6.6, y0: 4.8, h: 18.1, rake: 0.8, top: 0.95 }],
    mastY0: { 1: 8.7 },
    directors: [
      { f: 0.44, y: 13.2, ped: 1.8, w: 3.6, l: 3.6, h: 2.4, label: 'Directeur Mk 37 avant' },
      { f: 0.515, z: 6.2, y: 12.6, ped: 0.8, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 tribord' },
      { f: 0.515, z: -6.2, y: 12.6, ped: 0.8, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 bâbord' },
      { f: 0.572, y: 9.0, ped: 3.2, w: 3.4, l: 3.4, h: 2.3, label: 'Directeur Mk 37 arrière' },
      { f: 0.671, y: 14.6, w: 4.0, l: 4.4, h: 3.0, label: 'Directeur Mk 38 arrière' },
    ],
    // catapults on the fantail, along the deck edges, their bow ends turned outboard; crane on the stern
    cat: { f: 0.921, z: 9.1, yaw: 0.24, len: 21, craneF: 0.983 },
  },
  fletcher: { mainVariant: 'mk30' },
  cleveland: { secVariant: ['mk28'] },
  baltimore: { secVariant: ['mk28'] },
  // Yamato (1945): measured on the profile and plan by Alexpl (Commons, CC BY-SA 3.0) with the builders' freeboards (NH 111711): a hull
  // that is widest at the deck (38.9 m over 36.9 m at the waterline), a deck that dips from the bow to the forward turrets and steps
  // down to the quarterdeck; the 01 level 3.9 m, the block around the funnel 11.5 m, the tower to 30.5 m with the 15 m rangefinder on top
  yamato: {
    mainVariant: 'type94', secVariant: ['type3_155'], dirKind: 'drum', houseH: 3.9,
    fb: [[0, 10.0], [0.03, 9.2], [0.09, 8.4], [0.18, 7.7], [0.27, 7.5], [0.4, 8.2], [0.5, 8.667], [0.7, 8.7], [0.76, 8.5], [0.86, 6.7], [1, 6.4]],
    stern: { overhang: 1.5, rise: 7 },
    bulwarkF: [0, 0.08],
    planDeck: [[0, 0.1], [0.01, 0.28], [0.02, 0.33], [0.04, 0.36], [0.06, 0.39], [0.08, 0.42], [0.1, 0.46], [0.13, 0.53], [0.16, 0.59], [0.2, 0.71], [0.25, 0.82], [0.3, 0.92], [0.35, 0.98], [0.4, 1.04], [0.45, 1.054], [0.72, 1.054], [0.75, 1.02], [0.8, 0.93], [0.85, 0.89], [0.9, 0.78], [0.95, 0.55], [0.98, 0.3], [1, 0.08]],
    planWL: [[0, 0], [0.03, 0.12], [0.06, 0.2], [0.1, 0.3], [0.15, 0.42], [0.2, 0.56], [0.25, 0.7], [0.3, 0.82], [0.35, 0.91], [0.4, 0.97], [0.45, 1], [0.7, 1], [0.75, 0.97], [0.8, 0.9], [0.85, 0.8], [0.9, 0.65], [0.95, 0.42], [1, 0.12]],
    house: { plan: [[0.452, 5], [0.47, 12], [0.5, 16.2], [0.62, 16.2], [0.655, 13], [0.675, 6], [0.685, 3]] },
    decks: [
      { plan: [[0.478, 5], [0.49, 8.5], [0.65, 8.5], [0.667, 5]], y: [3.9, 11.5], taper: 0.94 },       // block around the tower and the funnel
      { f: [0.643, 0.657], round: true, hw: 2.5, y: [11.5, 16.5], taper: 0.9 },                     // after rangefinder tower
    ],
    // the tower: eight stacked tiers stepping back towards the top, bridge windows on two of them only (the rest is armour and platforms)
    towerF: 0.505, towerY0: 11.5,
    tiers: [
      { len: 13.5, w: 12.0, h: 3.00, dx: 0, rake: 0.6, wings: 0.7, windows: false },
      { len: 12.4, w: 11.1, h: 2.85, dx: -0.55, rake: 0.8, wings: 1.4, windows: false },
      { len: 11.4, w: 10.3, h: 2.67, dx: -1.10, rake: 1.0, wings: 0.7, windows: false },
      { len: 10.5, w: 9.6, h: 2.48, dx: -1.65, rake: 0.6, wings: 1.4, windows: true },
      { len: 9.7, w: 8.9, h: 2.27, dx: -2.20, rake: 0.8, wings: 0.7, windows: false },
      { len: 8.9, w: 8.2, h: 2.08, dx: -2.75, rake: 1.0, wings: 1.4, windows: false },
      { len: 8.2, w: 7.6, h: 1.90, dx: -3.30, rake: 0.6, wings: 0.7, windows: true },
      { len: 7.5, w: 7.1, h: 1.72, dx: -3.85, rake: 0.8, wings: 1.4, windows: false },
    ],
    dir0: { dx: 0, w: 8.5, l: 5, h: 2.5 },
    foremast: { dx: -2.0, y0: 30.5 },
    funnels: [{ lx: 10, lz: 7.5, y0: 11.5, h: 11.6, rake: 4.5, top: 0.95 }],
    mastY0: { 1: 11.5 },
    directors: [{ f: 0.65, y: 16.5, kind: 'drum', w: 5.5, l: 3.5, h: 2.2, label: 'Télémètre arrière' }],
    cat: { f: 0.935, z: 12, yaw: 0.25, len: 19, craneF: 0.985 },
  },
  takao: { pagoda: [13, 11, 9, 34], dirKind: 'drum', funnelRake: 3.0 },
  kagero: { dirKind: 'drum', tiers: [{ len: 6.5, w: 5.4, h: 2.4, rake: 1.2 }, { len: 5.2, w: 4.4, h: 2.2, rake: 1, wings: 0.8 }, { len: 4, w: 3.4, h: 2.0, rake: 0.8 }] },
  agano: { dirKind: 'drum' },
  // Bismarck (May 1941): measured on the profile drawing "Battleship Bismark.svg" (Commons, CC0) and the Bundesarchiv photographs
  // 193-04-1-23 / -26, 193-06-7-16. Freeboard 10.9 m at the stem, 6.6 m amidships, 7.9 m at the stern; the 01 level 3.5 m, the forward
  // superstructure 9.3 m, the forward bridge 13.8 m, the tower to 26 m with the foretop rangefinder cupola on top, the funnel 19.8 m;
  // the athwartships catapult between the funnel and the hangars, the mainmast rising from the after hangar.
  bismarck: {
    mainVariant: 'drh34', secVariant: ['drh28_150'], dirKind: 'drum', houseH: 3.5, bulwarkF: [0, 0],
    fb: [[0, 10.9], [0.03, 9.8], [0.06, 8.9], [0.115, 7.7], [0.172, 7.2], [0.258, 7.0], [0.5, 6.6], [0.75, 6.7], [0.87, 6.9], [1, 7.9]],
    house: { plan: [[0.331, 5], [0.36, 8.5], [0.70, 8.5], [0.761, 5]] },   // narrow: the 15 cm turrets stand on the deck outboard of it
    decks: [
      { f: [0.331, 0.455], hw: 7.5, y: [3.5, 9.3], rake: 1.5, windows: true },                         // forward superstructure
      { f: [0.352, 0.405], hw: 7, y: [9.3, 13.8], rake: 1.0, windows: true },                        // forward bridge
      { f: [0.475, 0.53], hw: 7, y: [3.5, 9.3] },                                                     // funnel casing
      { f: [0.545, 0.62], hw: 7.5, y: [3.5, 8.0] },                                                     // hangars
      { f: [0.62, 0.70], hw: 7, y: [3.5, 9.3], rakeA: 1.0, windows: true },                          // after superstructure
      { f: [0.632, 0.666], round: true, hw: 3.5, y: [9.3, 12.0], taper: 0.9 },                       // after fire control
    ],
    towerF: 0.433, towerY0: 9.3,
    tiers: [
      { len: 11, w: 9, h: 5.0, rake: 0.8, windows: true },                                            // admiral's bridge
      { len: 13, w: 11, h: 0.8, dx: 0.5, windows: false },
      { len: 9, w: 8, h: 6.0, round: true, taper: 0.9 },                                              // tower
      { len: 15, w: 12, h: 1.2, dx: -1, windows: false },                                             // searchlight platform
      { len: 7, w: 6.5, h: 3.7, round: true, taper: 0.9 },
    ],
    dir0: { dx: 0, w: 6, l: 4, h: 2.8 },
    foremast: { dx: -8.5, y0: 16.3 },
    funnels: [{ lx: 11, lz: 7.5, y0: 3.5, h: 16.3, rake: 1.5, top: 0.92 }],
    mastY0: { 1: 8.0 },
    directors: [
      { f: 0.398, y: 13.8, kind: 'drum', w: 5.8, l: 3, h: 2.5, label: 'Télémètre avant' },
      { f: 0.649, y: 12.0, kind: 'drum', w: 5.8, l: 3.5, h: 2.0, label: 'Télémètre arrière' },
    ],
    cat: { f: 0.538, y: 3.6, yaw: Math.PI / 2, len: 30, craneF: 0.565, craneY: 8.0, craneZ: 0 },
  },
  shokaku: { noFunnels: true, elevators: [0.22, 0.56, 0.80], extra: shokakuFunnels },
  essex: { mainVariant: { 2: 'mk28', 1: 'mk30' }, elevators: [0.27, 0.80, 0.50], deckEdge: true },
  illustrious: { elevators: [0.30, 0.75] },
  graf_zeppelin: { elevators: [0.27, 0.52, 0.80] },
  bearn: { elevators: [0.30, 0.47, 0.72] },
  aquila: { elevators: [0.27, 0.77] },
};
