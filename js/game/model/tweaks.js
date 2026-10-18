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

/** Bismarck: tall tower bridge with three large rangefinder drums. */
function bismarckTower({ b, model, pal, MAT, rgb, shade }) {
  const br = model.bridge;
  if (!br) return;
  const col = shade(rgb(pal.sup), 0.92);
  // the drums are part of the tower: they are destroyed with it
  b.group('tower', () => {
    for (const [dy, r] of [[-12.5, 2.5], [-7.5, 2.3], [-2.5, 2.1]]) {
      b.cyl(br.x + 2.5, br.y + dy, 0, r, r, r * 0.95, r * 0.95, br.y + dy + 2.3, col, MAT.HULL, { seg: 14 });
      b.rodZ(br.x + 2.5, br.y + dy + 1.2, -r * 1.7, r * 1.7, 0.28, 0.28, shade(col, 0.8), MAT.HULL);
    }
  });
}

export const TWEAKS = {
  // Iowa: measured on the class profile and plan drawing (Commons, public domain), checked on photographs 80-G-K-15631 (port profile in
  // silhouette) and NH 44538. Heights are above the local deck: 01 level 2.3 m, 02 level 4.8 m, forward bridge 13.2 m, the block around
  // the forward funnel 19.4 m, Mk 38 director 29.3-32.5 m; funnel tops 23.8 / 22.9 m; after director tower 18 m.
  iowa: {
    mainVariant: 'mk7', secVariant: ['mk28'], houseH: 2.3,
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
  yamato: { mainVariant: 'type94', pagoda: [21, 16, 9, 34], dirKind: 'drum', houseW: 0.34, funnelW: 0.27, funnelLen: 1.5, funnelH: 21, funnelRake: 5, funnelTop: 0.96 },
  takao: { pagoda: [13, 11, 9, 34], dirKind: 'drum', funnelRake: 3.0 },
  kagero: { dirKind: 'drum', tiers: [{ len: 6.5, w: 5.4, h: 2.4, rake: 1.2 }, { len: 5.2, w: 4.4, h: 2.2, rake: 1, wings: 0.8 }, { len: 4, w: 3.4, h: 2.0, rake: 0.8 }] },
  agano: { dirKind: 'drum' },
  // Bismarck (photographs Bundesarchiv 193-04-1-23 / -26, 193-06-7-16): massive block bridge tower with rangefinder drums, one tall oval funnel
  bismarck: {
    mainVariant: 'drh34', funnelW: 0.27, funnelLen: 1.45, funnelH: 15, funnelRake: 2.6, funnelTop: 0.92, houseH: 3.8, extra: bismarckTower,
    tiers: [
      { len: 20, w: 15, h: 4.0, rake: 1.0, wings: 1.5 },
      { len: 15.5, w: 13, h: 4.2, rake: 0.8, wings: 1.2 },
      { len: 11, w: 10, h: 4.4, rake: 0.6 },
      { len: 8.5, w: 8, h: 4.0, round: true, taper: 0.9 },
      { len: 6.2, w: 6, h: 3.0 },
    ],
  },
  shokaku: { noFunnels: true, elevators: [0.22, 0.56, 0.80], extra: shokakuFunnels },
  essex: { mainVariant: { 2: 'mk28', 1: 'mk30' }, elevators: [0.27, 0.80, 0.50], deckEdge: true },
  illustrious: { elevators: [0.30, 0.75] },
  graf_zeppelin: { elevators: [0.27, 0.52, 0.80] },
  bearn: { elevators: [0.30, 0.47, 0.72] },
  aquila: { elevators: [0.27, 0.77] },
};
