// Per-ship hand tuning of the generated models (see shipbuilder.js for the options).
// Keyed by spec id. Anything not listed here is built purely from the spec sheet.
//
//   pagoda: [baseLength, baseWidth, tiers, height]   Japanese pagoda foremast
//   tiers:  explicit bridge tiers                      [{ len, w, h, dx, rake, wings }]
//   elevators / deckEdge: carrier lifts (fractions from the bow; the last one is on the deck edge when deckEdge)
//   funnelW / funnelLen / funnelRake / funnelScale     funnel proportions
//   extra(ctx): free-hand additions with the MeshBuilder (ctx.b) and the parts library (ctx.PT)

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

export const TWEAKS = {
  // Iowa: measured on the class profile and plan drawing (Commons, public domain), checked on photographs 80-G-K-15631 (port profile in
  // silhouette) and NH 44538. Heights are above the local deck: 01 level 2.3 m, 02 level 4.8 m, forward bridge 13.2 m, the block around
  // the forward funnel 19.4 m, Mk 38 director 29.3-32.5 m; funnel tops 23.8 / 22.9 m; after director tower 18 m.
  iowa: {
    mainVariant: 'mk7', secVariant: ['mk28'], houseH: 2.3,
    // freeboards from the profile: 13.5 m at the stem, about 6.5 m amidships, 7.8 m at the stern; a bulwark only round the bow
    fb: [[0, 13.5], [0.04, 11.6], [0.08, 10.9], [0.12, 10.2], [0.16, 8.8], [0.2, 8.2], [0.26, 7.2], [0.42, 6.4], [0.5, 6.5], [0.7, 6.6], [0.85, 6.8], [0.95, 7.0], [1, 7.3]],
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
  // King George V class (HMS KGV, 16 Aug 1945, USN 80-G-455703, public domain): no plan found, so everything here is read on that
  // photograph (a nearly broadside view, about +-3 m): the two funnels at 0.503 and 0.611 (tops 24.7 m above the waterline), the bridge
  // block 0.380-0.458 (top 24 m) with the director tower on its after edge (30 m), the tripod foremast ABAFT the tower at 0.47 (top
  // 43.8 m) and the mainmast at 0.70 (38 m); the hull, the turrets and the secondary mounts keep the spec positions.
  kgv: {
    houseH: 3.4, towerF: 0.419, towerY0: 3.4, mastY0: { 1: 2.0 },
    tiers: [
      { len: 17.7, w: 17, h: 5.6, windows: true, wings: 1.4 },
      { len: 15.5, w: 14, h: 6.6, windows: true, wings: 1.0 },
      { len: 4.2, w: 5.0, h: 6.0, round: true, dx: -6.7 },
    ],
    dir0: { dx: -6.7, w: 4.2, l: 4.2, h: 2.2 },
    foremast: { dx: -11.6, y0: 6.0 },
    funnels: [{ lx: 9.2, lz: 7.4, y0: 3.4, h: 12.9, rake: 0.8, top: 0.92, pipes: false }, { lx: 9.0, lz: 7.2, y0: 3.4, h: 12.9, rake: 0.8, top: 0.92, pipes: false }],
    cat: { f: 0.557, y: 0.4, yaw: Math.PI / 2, len: 22, craneF: 0.59, craneH: 8, craneLen: 22, craneDir: 1, craneAng: 0.45, craneSide: 0, craneW: 0.7 },
  },
  fletcher: { mainVariant: 'mk30' },
  cleveland: { secVariant: ['mk28'] },
  baltimore: { secVariant: ['mk28'] },
  // Yamato (1945): measured on the profile and plan by Alexpl (Commons, CC BY-SA 3.0) with the builders' table (NH 111711). The profile is
  // drawn 10 % flatter than its length scale (checked on the builders' depth of 18.915 m and bow height of 20.4 m), so its heights are
  // read at 12.74 px/m and from the waterline at the trial draft of 10.4 m: then its freeboards are the builders' 10.0 / 8.6 / 6.45 m.
  // A hull widest at the deck (38.9 m over 36.9 m at the waterline), a deck that dips towards the forward turrets; the 01 level 4.3 m,
  // the block round the funnel 12.8 m, the tower to 33.9 m with the 15 m rangefinder on top, funnel top 25.6 m above the deck.
  yamato: {
    mainVariant: 'type94', secVariant: ['type3_155'], dirKind: 'drum', houseH: 4.33,
    // the upper deck runs aft to 87 % of the length, then steps down to the quarterdeck
    fb: [[0, 10.0], [0.03, 9.2], [0.09, 8.3], [0.18, 7.5], [0.27, 7.3], [0.4, 8.2], [0.5, 8.6], [0.7, 8.6], [0.87, 8.7], [0.885, 6.7], [1, 6.45]],
    stern: { overhang: 1.5, rise: 7 },
    bulwarkF: [0, 0],
    // four three-bladed screws of 5 m (the inboard ones further aft), the main rudder and the forward auxiliary rudder on the centre
    // line, as drawn on the 1945 profile (athwartship positions estimated)
    props: [{ f: 0.938, z: 3.5, depth: 7.9, d: 5.0, blades: 3, toF: 0.86, strutF: 0.925 }, { f: 0.893, z: 8.5, depth: 8.5, d: 5.0, blades: 3, toF: 0.83, strutF: 0.88 }],
    rudders: [{ f: 0.971, top: 3.5, bottom: 10.5, chord: 7.1 }, { f: 0.899, top: 6.1, bottom: 10.6, chord: 6.5 }],
    keel: [[0, 0.9], [0.04, 1], [0.905, 1], [0.915, 0.59], [0.95, 0.39], [0.985, 0.28], [1, 0.17]],   // as drawn
    // the stem meets the waterline at 2.3 % of the length; below it the bulb reaches forward to 1.05 %, 5.3 to 10.5 m down
    bow: { rake: 6.6, pr: 1.5, forefoot: 1.0 }, bulb: { f0: 0.0105, f1: 0.07, y: 7.9, h: 5.6, w: 6.4 },
    planDeck: [[0, 0.1], [0.01, 0.28], [0.02, 0.33], [0.04, 0.36], [0.06, 0.39], [0.08, 0.42], [0.1, 0.46], [0.13, 0.53], [0.16, 0.59], [0.2, 0.71], [0.25, 0.82], [0.3, 0.92], [0.35, 0.98], [0.4, 1.04], [0.45, 1.054], [0.72, 1.054], [0.75, 1.02], [0.8, 0.93], [0.85, 0.89], [0.9, 0.78], [0.95, 0.55], [0.98, 0.3], [1, 0.08]],
    planWL: [[0, 0], [0.03, 0.12], [0.06, 0.2], [0.1, 0.3], [0.15, 0.42], [0.2, 0.56], [0.25, 0.7], [0.3, 0.82], [0.35, 0.91], [0.4, 0.97], [0.45, 1], [0.7, 1], [0.75, 0.97], [0.8, 0.9], [0.85, 0.8], [0.9, 0.65], [0.95, 0.42], [1, 0.12]],
    house: { plan: [[0.452, 5], [0.47, 12], [0.5, 16.2], [0.62, 16.2], [0.655, 13], [0.675, 6], [0.685, 3]] },
    decks: [
      { plan: [[0.483, 5], [0.495, 8.5], [0.65, 8.5], [0.667, 5]], y: [4.33, 12.76], taper: 0.94 },     // block around the tower and the funnel
      { f: [0.643, 0.657], round: true, hw: 2.5, y: [12.76, 18.3], taper: 0.9 },                    // after rangefinder tower
    ],
    // the tower: eight stacked tiers stepping back towards the top, bridge windows on two of them only (the rest is armour and platforms)
    towerF: 0.505, towerY0: 12.76,
    tiers: [
      { len: 13.5, w: 12.0, h: 3.33, dx: 0.17, rake: 0.6, wings: 0.7, windows: false },
      { len: 12.4, w: 11.1, h: 3.16, dx: -0.38, rake: 0.8, wings: 1.4, windows: false },
      { len: 11.4, w: 10.3, h: 2.96, dx: -0.88, rake: 1.0, wings: 0.7, windows: false },
      { len: 10.5, w: 9.6, h: 2.75, dx: -1.33, rake: 0.6, wings: 1.4, windows: true },
      { len: 9.7, w: 8.9, h: 2.52, dx: -1.73, rake: 0.8, wings: 0.7, windows: false },
      { len: 8.9, w: 8.2, h: 2.31, dx: -2.13, rake: 1.0, wings: 1.4, windows: false },
      { len: 8.2, w: 7.6, h: 2.11, dx: -2.48, rake: 0.6, wings: 0.7, windows: true },
      { len: 7.5, w: 7.1, h: 1.91, dx: -2.83, rake: 0.8, wings: 1.4, windows: false },
    ],
    dir0: { dx: 0, w: 8.5, l: 5, h: 2.8 },
    foremast: { dx: -2.0, y0: 33.85 },
    // the funnel: a raked front and an upright back (the top is two thirds of the base), its top 1.7 m lower aft than forward
    funnels: [{ lx: 12.6, lz: 7.5, y0: 12.76, h: 14.1, rake: 2.2, top: 0.65, capSlope: 1.7, pipes: false }],
    mastY0: { 1: 12.76 }, mastRake: { 1: -6.8 },   // the 1945 mainmast leans well aft
    directors: [{ f: 0.65, y: 18.3, kind: 'drum', w: 5.5, l: 3.5, h: 2.44, label: 'Télémètre arrière' }],
    // catapults on pedestals at the quarterdeck edges, the big crane at the stern with its jib lying forward along the deck
    // light AA as drawn on the 1945 plan view: 50 triple 25 mm (shielded mounts on the deck edge and round the superstructure, open
    // ones in their crescent tubs on the decks, two on each of turrets 2 and 3, the quarterdeck and the stern)
    aa: [
      ...[0.52, 0.543, 0.565, 0.588, 0.614].map((f) => ({ k: 't25', f, z: 19.0, y: 0.6 })),
      ...[[0.362, 11], [0.432, 9.5], [0.476, 9.5], [0.672, 11], [0.693, 10], [0.778, 10.3]].map(([f, z]) => ({ k: 't25', f, z, y: 0 })),
      { k: 't25', f: 0.415, z: 4.4, y: 6.7 }, { k: 't25', f: 0.732, z: 4.4, y: 4.0 },
      ...[[0.512, 8.8, 4.33], [0.498, 5.5, 8.5], [0.514, 14.6, 4.33], [0.505, 12, 4.33], [0.633, 16.6, 4.33], [0.645, 12.6, 4.33], [0.654, 8.5, 6.88], [0.638, 5.0, 12.76], [0.666, 3, 4.33]].map(([f, z, y]) => ({ k: 't25', f, z, y })),
      { k: 't25', f: 0.876, z: 15.5, y: 0 }, { k: 't25', f: 0.901, z: 15, y: 0 }, { k: 't25', f: 0.985, z: 2.8, y: 0 },
    ],
    // ship's boats stowed in the recesses of the hull sides aft
    boats: [{ f0: 0.80, f1: 0.83, z: 15.5, y: -4.2, cabin: true }, { f0: 0.835, f1: 0.865, z: 15.5, y: -4.2 }],
    // the catapults lie fore and aft at the quarterdeck edges, with their turntables
    cat: { f: 0.95, z: 10.4, yaw: 0, len: 18.4, y: 0.8, craneF: 0.99, craneH: 6, craneLen: 20, craneDir: 1, craneAng: 0.05, craneSide: 0, craneW: 1.0 },
  },
  takao: { pagoda: [13, 11, 9, 34], dirKind: 'drum', funnelRake: 3.0 },
  kagero: { dirKind: 'drum', tiers: [{ len: 6.5, w: 5.4, h: 2.4, rake: 1.2 }, { len: 5.2, w: 4.4, h: 2.2, rake: 1, wings: 0.8 }, { len: 4, w: 3.4, h: 2.0, rake: 0.8 }] },
  agano: { dirKind: 'drum' },
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
    noFunnels: true, flightDeckY: 14.0, noGallery: true, elevators: [0.341, 0.581, 0.831], elevSize: [6.5, 7.2], elevZ: -0.5, extra: shokakuFunnels, sponsonOut: 2.6,
    fb: [[0, 10.7], [0.03, 10.3], [0.06, 10.2], [0.075, 12.9], [0.97, 12.9], [0.99, 9.6], [1, 9.5]],
    fdPlan: [[0.047, 6.6], [0.09, 9.5], [0.125, 10.7], [0.2, 12.2], [0.3, 13.7], [0.4, 14.6], [0.5, 14.65], [0.65, 14.65], [0.7, 14.1], [0.8, 13.0], [0.9, 12.4], [0.985, 12.2]],
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
    aa: [
      ...[0.43, 0.50, 0.57, 0.63, 0.68, 0.74].map((f) => ({ k: 't25', f, z: -16.2, y: -3.2, one: true })),
      ...[0.60, 0.66, 0.71, 0.86, 0.90, 0.93].map((f) => ({ k: 't25', f, z: 16.2, y: -3.2, one: true })),
    ],
  },
  // Essex class (long hull): measured on the starboard broadside of Ticonderoga, 5 November 1944: flight deck 18.5 m above the water,
  // a narrow island well forward of midships (body 11 m, bridges 14.5 m, funnel top 18.7 m, mast 35.8 m above the flight deck), the
  // forward Mk 37 director on the island front, the after one by the funnel
  essex: {
    mainVariant: { 2: 'mk28', 1: 'mk30' }, elevators: [0.25, 0.74, 0.43], deckEdge: true, flightDeckY: 18.5,
    // long hull: the clipper stem 7.5 m ahead of the flight deck, the round stern under its after end (waterline length 250 m)
    bow: { rake: 9, pr: 1.3 }, stern: { overhang: 12, rise: 8 }, fdBowOver: -4.9,
    // four shafts with four-bladed screws and a single rudder (positions estimated: no plan of the stern)
    props: [{ f: 0.875, z: 9.5, depth: 5.6, d: 4.6, blades: 4, toF: 0.77, strutF: 0.865 }, { f: 0.905, z: 3.6, depth: 5.9, d: 4.6, blades: 4, toF: 0.80, strutF: 0.895 }],
    rudders: [{ f: 0.935, top: 2.2, bottom: 7.6, chord: 6.0 }],
    keel: [[0, 0.8], [0.05, 1], [0.84, 1], [0.89, 0.6], [0.94, 0.35], [1, 0.25]],   // estimated
    island: { z: 12.6, hw: 3.0, funnelTop: 18.7, funnelLx: 9.5, funnelLz: 4.6, mastF: 0.393, mastTop: 35.8 },
    // light AA (long hull, 1945): 17 quadruple Bofors in the usual arrangement (two on the bow, on the island fore and aft, in the deck
    // edge sponsons of both sides, two on the stern) and Oerlikons along the galleries; positions estimated from photographs, no plan
    aa: [
      { k: 'q40', f: 0.02, z: 2.2, y: -6.0 }, { k: 'q40', f: 0.355, z: 12.6, y: 9.5, one: true }, { k: 'q40', f: 0.365, z: 12.6, y: 6.0, one: true },
      { k: 'q40', f: 0.445, z: 12.6, y: 8.0, one: true }, { k: 'q40', f: 0.41, z: 12.6, y: 14.5, one: true }, { k: 'q40', f: 0.25, z: 17.8, y: -2.0, one: true }, { k: 'q40', f: 0.58, z: 17.8, y: -2.0, one: true },
      { k: 'q40', f: 0.64, z: 17.8, y: -2.0, one: true }, { k: 'q40', f: 0.69, z: 17.8, y: -2.0, one: true },
      ...[0.15, 0.26, 0.45, 0.55, 0.66].map((f) => ({ k: 'q40', f, z: -17.8, y: -2.0, one: true })),
      { k: 'q40', f: 0.975, z: 4, y: -6.0 },
      ...[0.1, 0.13, 0.18, 0.22, 0.29, 0.33, 0.48, 0.52, 0.6, 0.75, 0.8, 0.85, 0.9].map((f) => ({ k: 'o20', f, z: 17.6, y: -1.6 })),
    ],
    directors: [
      { f: 0.374, z: 12.6, y: 14.5, w: 3.4, l: 3.4, h: 2.4, label: 'Directeur Mk 37 avant' },
      { f: 0.44, z: 12.6, y: 11.0, ped: 1.2, w: 3.4, l: 3.4, h: 2.4, label: 'Directeur Mk 37 arrière' },
    ],
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
  graf_zeppelin: { elevators: [0.27, 0.52, 0.80] },
  bearn: { elevators: [0.30, 0.47, 0.72] },
  aquila: { elevators: [0.27, 0.77] },
};
