// The look of a port (layouts of kind 'port', sim/bases.js): the three buildings that only a port has (the warehouse, the dockyard with its dry dock and gantry, the quay crane that swings its
// jib over the berths) and the work of the yard, the quay wall, the pier on its piles, the crane rails, the pipeline, the bollards and the buoys of the anchorage. baseMesh.js calls
// `portSite` for the flat work and the decoration, and `buildPortPart` for the buildings (the shared ones, tanks and barracks and so on, are drawn by baseParts.js).
// Frames: a building is drawn in its canonical frame (long side along x, the door on the +z side for a warehouse, on the +x end for the dockyard; see baseParts.js); the site in the frame
// of the base (x = s along the axis out to sea, z = t to the right of it, y = 0 at the height of the yard pad, the sea at y = -pad height).
import { MAT } from './meshbuilder.js';
import { buildPartMesh, scorch, brokenWall, fallen, twisted, rubble, roofPick, windowsX } from './baseParts.js';
import { C, shade, mix, CHAR, RUST, slab, bar, loftX, capX, flagStaff, mast, vehicle, drums, hash2 } from './baseKit.js';

const PI = Math.PI;
const GLASS = '#0d141a', WATER = '#1f4d58', STEEL = '#6f756d', IRON = '#2c2f30', YELLOW = '#c9a62e';

// ---- small pieces -------------------------------------------------------------------------------------------------------------------------------------------------------

/** A square lattice boom between a and c ([x, y, z]), four chords closing in from the width w0 to w1, rungs and diagonals on the four faces. */
function truss(b, a, c, w0, w1, n, col, th = 0.14) {
  const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
  d[0] /= L; d[1] /= L; d[2] /= L;
  let lat = [d[2], 0, -d[0]]; const ll = Math.hypot(lat[0], lat[2]) || 1; lat = [lat[0] / ll, 0, lat[2] / ll];
  const nor = [d[1] * lat[2] - d[2] * lat[1], d[2] * lat[0] - d[0] * lat[2], d[0] * lat[1] - d[1] * lat[0]];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (k, q) => {
    const u = k / n, hw = (w0 + (w1 - w0) * u) / 2, s = corners[q];
    return [0, 1, 2].map((i) => a[i] + d[i] * L * u + lat[i] * s[0] * hw + nor[i] * s[1] * hw);
  };
  for (let k = 0; k < n; k++) {
    for (let q = 0; q < 4; q++) {
      b.beam(at(k, q), at(k + 1, q), th * 1.6, th * 1.6, col, MAT.HULL);
      b.beam(k % 2 ? at(k, q) : at(k, (q + 1) % 4), k % 2 ? at(k + 1, (q + 1) % 4) : at(k + 1, q), th, th, col, MAT.HULL, { caps: false });
    }
    if (k > 0) for (let q = 0; q < 4; q++) b.beam(at(k, q), at(k, (q + 1) % 4), th, th, col, MAT.HULL, { caps: false });
  }
}

/** A wheel truck on a rail: a frame and two wheels (axis along z) at (x, z), the rail head at y0. */
function bogie(b, x, z, y0, len = 2.6) {
  const steel = C(IRON);
  slab(b, x, y0 + 0.55, z, len, 0.5, 0.9, steel, MAT.HULL);
  for (const dx of [-len * 0.32, len * 0.32]) b.rodZ(x + dx, y0 + 0.33, z - 0.45, z + 0.45, 0.33, 0.33, shade(steel, 1.3), MAT.DARK, { seg: 8 });
}

// ---- the warehouse ------------------------------------------------------------------------------------------------------------------------------------------------------

/** A long cargo shed: corrugated walls, a gabled or flat roof, sliding doors along the +z side onto a loading dock under a canopy, a rail door in the +x end. */
function warehouse(b, P, ruin) {
  const { D, Wd, h, pal, rng } = P, hx = D / 2, hz = Wd / 2;
  const flat = P.variant === 2, wallH = flat ? h - 1.0 : h * 0.66, eave = hz + 0.55;
  const wall = C(pal.wall), trim = C(pal.trim), conc = C(pal.conc), door = C(pal.door);
  const nb = Math.max(2, Math.round((D - 4) / 8.6)), bay = (D - 4) / nb, dw = Math.min(6.2, bay - 2), dock = 1.15, dh = Math.min(4.6, wallH - dock - 0.9), dockZ = hz + 2.6;
  if (ruin) {
    const r = P.rrng, burnt = mix(wall, C(CHAR), 0.6);
    slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, shade(conc, 0.82), MAT.CONCRETE);
    scorch(b, r, hx, hz, 4, 0.36);
    bar(b, -hx + 0.5, hx - 0.5, 0.3, dock, hz, dockZ, shade(conc, 0.8), MAT.CONCRETE);
    brokenWall(b, r, -hx, -hz, hx, -hz, 0.5, wallH * 0.9, burnt, 0.3);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.5, wallH * 0.85, burnt, 0.3);
    brokenWall(b, r, hx, -hz, hx, hz, 0.5, wallH * 0.6, burnt, 0.3);
    const l1 = r.range(0.2, 0.6) * D, l2 = r.range(0.1, 0.4) * D;
    brokenWall(b, r, -hx, hz, -hx + l1, hz, 0.5, wallH * 0.85, burnt, 0.3);
    brokenWall(b, r, hx - l2, hz, hx, hz, 0.5, wallH * 0.7, burnt, 0.3);
    // the roof has come down: sheets on the floor, the trusses leaning, the posts of the canopy snapped
    for (let i = 0; i < 7; i++) fallen(b, r.range(-0.7, 0.7) * hx, r.range(0.5, 1.8), r.range(-0.7, 0.7) * hz, r.range(5, 10), 0.18, r.range(3, 6), r.range(-0.5, 0.5), r.range(-0.5, 0.5), r.range(0, PI), shade(C(roofPick(P, r)), 0.5), MAT.SHEET);
    for (let i = 0; i < 4; i++) twisted(b, r, -hx * 0.8 + i * hx * 0.5, r.range(-1, 1) * hz * 0.8, r.range(5, 9), shade(C(RUST), 1.0));
    for (let k = 0; k < 3; k++) b.beam([-hx + 4 + k * 14, -0.2, dockZ - 0.3], [-hx + 4 + k * 14 + r.range(-1, 1), r.range(1.5, 4), dockZ - 0.4], 0.3, 0.3, shade(C(RUST), 0.8), MAT.SHEET);
    for (let k = 0; k < 2; k++) fallen(b, r.range(-0.5, 0.5) * hx, 0.5, hz + 2 + r.range(0, 2), 4.4, 0.4, 2.2, r.range(-0.3, 0.3), r.range(-0.3, 0.3), r.range(0, PI), shade(door, 0.6), MAT.SHEET);
    rubble(b, r, hx * 0.85, hz * 0.95, 16, burnt);
    return;
  }
  slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, conc, MAT.CONCRETE);
  bar(b, -hx, hx, 0.3, wallH, -hz, hz, wall, MAT.SHEET, { top: false });
  bar(b, -hx - 0.05, hx + 0.05, 0.3, 1.0, -hz - 0.05, hz + 0.05, shade(conc, 1.05), MAT.CONCRETE, { top: false });
  const bands = Math.max(2, Math.round(D / 7));
  if (flat) {
    bar(b, -hx - 0.4, hx + 0.4, wallH, wallH + 0.5, -eave, eave, C(roofPick(P, rng)), MAT.SHEET);
    for (const sx of [-1, 1]) bar(b, sx * (hx + 0.3), sx * (hx + 0.55) + 0.01, wallH, h, -eave, eave, trim, MAT.CONCRETE);
    for (const sz of [-1, 1]) bar(b, -hx - 0.4, hx + 0.4, wallH, h, sz * eave - 0.12, sz * eave + 0.12, trim, MAT.CONCRETE);
  } else {
    for (let k = 0; k < bands; k++) {
      const x0 = -hx - 0.5 + (D + 1) * k / bands, x1 = -hx - 0.5 + (D + 1) * (k + 1) / bands, col = C(roofPick(P, rng));
      loftX(b, x0, x1, [[-eave, wallH - 0.3], [0, h]], () => col, MAT.SHEET, [wallH * 0.5, 0]);
      loftX(b, x0, x1, [[0, h], [eave, wallH - 0.3]], () => col, MAT.SHEET, [wallH * 0.5, 0]);
    }
    const gable = [[-hz, 0.3], [hz, 0.3], [hz, wallH], [0, h - 0.05], [-hz, wallH]];
    capX(b, hx + 0.02, gable, 1, wall, MAT.SHEET);
    capX(b, -hx - 0.02, gable, -1, wall, MAT.SHEET);
    b.beam([-hx - 0.5, h + 0.04, 0], [hx + 0.5, h + 0.04, 0], 0.5, 0.3, trim, MAT.CONCRETE);
  }
  for (let k = 0; k <= nb; k++) for (const sz of [-1, 1]) slab(b, -hx + 2 + bay * k, wallH / 2 + 0.4, sz * (hz + 0.13), 0.5, wallH - 0.7, 0.3, trim, MAT.CONCRETE);
  windowsX(b, -hx + 3, hx - 2, 3.4, wallH - 1.5, 0.8, 1.8, [-(hz + 0.06)]);
  // the loading dock along the +z side under its canopy, and the sliding doors, each pushed aside by its own amount
  bar(b, -hx + 0.5, hx - 0.5, 0.3, dock, hz, dockZ, shade(conc, 1.1), MAT.CONCRETE);
  bar(b, -hx + 0.5, hx - 0.5, 5.8, 6.0, hz, dockZ + 0.4, shade(C(pal.roof), 0.9), MAT.SHEET);
  for (let k = 0; k <= nb; k++) slab(b, -hx + 2 + bay * k, (dock + 5.8) / 2, dockZ + 0.1, 0.28, 5.8 - dock, 0.28, shade(trim, 0.85), MAT.CONCRETE);
  for (let k = 0; k < nb; k++) {
    const cx = -hx + 2 + bay * (k + 0.5), u = hash2(P.seed, k), slide = u > 0.66 ? 0.55 : u > 0.33 ? 0.25 : 0, off = slide * dw;
    slab(b, cx, dock + dh / 2, hz + 0.06, dw + 0.5, dh, 0.12, C('#07090a'), MAT.DARK);
    bar(b, cx - dw / 2 - 0.25 + off, cx + dw / 2 + 0.25 + off, dock, dock + dh, hz + 0.1, hz + 0.32, k % 2 ? shade(door, 1.1) : door, MAT.SHEET);
    for (const sx of [-1, 1]) slab(b, cx + sx * (dw / 2 + 0.4), dock + dh / 2, hz + 0.2, 0.3, dh + 0.3, 0.45, trim, MAT.CONCRETE);
    slab(b, cx + dw * 0.4, dock + dh + 0.3, hz + 0.3, dw * 2.0, 0.18, 0.3, trim, MAT.CONCRETE);
    // the rubber bumpers of the dock
    slab(b, cx, dock - 0.25, dockZ + 0.06, 0.5, 0.6, 0.18, C('#141516'), MAT.CANVAS);
  }
  // the rail door in the +x end, a man door at the other
  slab(b, hx + 0.06, 2.4, 0, 0.12, 4.4, 4.8, C('#07090a'), MAT.DARK);
  bar(b, hx + 0.1, hx + 0.34, 0.3, 4.7, -2.5 + (P.variant % 2) * 1.4, 0.1 + (P.variant % 2) * 1.4, door, MAT.SHEET);
  slab(b, hx + 0.2, 5.0, 0, 0.5, 0.4, 5.6, trim, MAT.CONCRETE);
  b.group('fine', () => {
    for (let k = 0; k < nb; k++) {
      const cx = -hx + 2 + bay * (k + 0.5);
      for (let i = 1; i < 4; i++) slab(b, cx + (i - 2) * dw / 4 + 0.1, dock + dh / 2, hz + 0.36, 0.1, dh - 0.2, 0.08, shade(door, 0.75), MAT.SHEET);
      slab(b, cx, dock + dh + 0.75, hz + 0.25, 0.5, 0.25, 0.25, C('#e6dca0'), MAT.EMISSIVE);
    }
    // crates and sacks left on the dock
    for (let i = 0; i < 5; i++) {
      const x = -hx + 4 + hash2(P.seed, i + 40) * (D - 8), s = 0.9 + hash2(P.seed, i + 60) * 0.9;
      slab(b, x, dock + s / 2, hz + 1.1 + hash2(P.seed, i + 70) * 0.9, s * 1.3, s, s * 1.1, shade(C('#8a7350'), 0.8 + 0.4 * hash2(P.seed, i)), MAT.CANVAS);
    }
    if (flat) for (let x = -hx + 5; x < hx - 3; x += 9) slab(b, x, h + 0.2, 0, 1.6, 0.5, 1.6, shade(C(pal.roof), 1.15), MAT.SHEET);
    else for (let x = -hx + 3; x < hx - 2; x += 7.5) { slab(b, x, h + 0.55, 0, 1.2, 0.5, 0.9, shade(C(pal.roof), 1.15), MAT.SHEET); slab(b, x, h + 0.95, 0, 1.5, 0.12, 1.2, shade(C(pal.roof), 0.8), MAT.SHEET); }
    slab(b, -hx - 0.04, 1.1, 2.4, 0.1, 2.2, 1.0, shade(door, 0.8), MAT.SHEET);
    for (const x of [-hx + 1, hx - 1]) b.cylinder(x, 0.4, -hz - 0.28, 0.07, 0.07, wallH, C('#60645c'), MAT.SHEET, { seg: 5 });
    b.beam([hx + 0.3, 0.3, -hz + 2], [hx + 0.3, wallH + 0.2, -hz + 2], 0.05, 0.05, C('#1b1d1f'), MAT.DARK, { caps: false });
  });
}

// ---- the dockyard -------------------------------------------------------------------------------------------------------------------------------------------------------

/** A repair yard: a tall hall with a lantern on its ridge and a chimney, and in front of it a dry dock (a basin of dark water between concrete walls) under a travelling gantry. */
function dockyard(b, P, ruin) {
  const { D, Wd, h, pal, rng } = P, hx = D / 2, hz = Wd / 2;
  const hallL = Math.round(D * 0.6), xa = -hx + hallL, wallH = h * 0.7, eave = hz + 0.6, bz = hz - 4.5;           // the hall at the back, the basin in front, its half width bz
  const wall = C(pal.wall), trim = C(pal.trim), conc = C(pal.conc), door = C(pal.door), steel = C(STEEL), paint = C(pal.roof2);
  const xg = xa + (hx - xa) * 0.5;
  if (ruin) {
    const r = P.rrng, burnt = mix(wall, C(CHAR), 0.6);
    slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, shade(conc, 0.82), MAT.CONCRETE);
    scorch(b, r, hx * 0.6, hz, 5, 0.36);
    brokenWall(b, r, -hx, -hz, xa, -hz, 0.6, wallH * 0.9, burnt, 0.3);
    brokenWall(b, r, -hx, hz, xa, hz, 0.6, wallH * 0.8, burnt, 0.3);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.6, wallH * 0.95, burnt, 0.3);
    brokenWall(b, r, xa, -hz, xa, hz, 0.6, wallH * 0.5, burnt, 0.3);
    // the basin stays, black water in it; the gantry has fallen across it
    for (const sz of [-1, 1]) bar(b, xa, hx, 0.3, 1.2, sz * bz, sz * hz, shade(conc, 0.8), MAT.CONCRETE);
    bar(b, hx - 1.2, hx, 0.3, 1.3, -bz, bz, shade(C(IRON), 1.2), MAT.HULL);
    b.quad([xa + 1, 0.8, -bz], [hx - 1.3, 0.8, -bz], [hx - 1.3, 0.8, bz], [xa + 1, 0.8, bz], C('#0b1013'), MAT.DARK, [xa, 0, 0], 1);
    fallen(b, xg, 1.6, 0, 6.4, 1.6, 2 * bz + 3, 0.1, 0.25, 0.1, shade(paint, 0.6), MAT.HULL);
    for (let i = 0; i < 4; i++) twisted(b, r, xg + r.range(-3, 3), (i % 2 ? 1 : -1) * (bz + 2), r.range(5, 12), shade(C(RUST), 1.0));
    for (let i = 0; i < 8; i++) fallen(b, r.range(-0.8, 0.5) * hx, r.range(0.5, 2.0), r.range(-0.7, 0.7) * hz, r.range(5, 10), 0.18, r.range(3, 7), r.range(-0.5, 0.5), r.range(-0.5, 0.5), r.range(0, PI), shade(C(roofPick(P, r)), 0.5), MAT.SHEET);
    // the chimney: a stump and what fell of it
    b.cylinder(-hx + 4, 0.3, -hz + 4, 1.5, 1.2, 4.5, shade(C('#7a6a5a'), 0.6), MAT.CONCRETE, { seg: 12 });
    fallen(b, -hx + 8, 0.9, -hz + 9, 2.4, 2.4, 8, 0.2, 0.1, 0.4, shade(C('#7a6a5a'), 0.55), MAT.CONCRETE);
    rubble(b, r, hx * 0.8, hz * 0.9, 18, burnt);
    return;
  }
  slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, conc, MAT.CONCRETE);
  // the hall
  bar(b, -hx, xa, 0.3, wallH, -hz, hz, wall, MAT.SHEET, { top: false });
  bar(b, -hx - 0.05, xa + 0.05, 0.3, 1.2, -hz - 0.05, hz + 0.05, shade(conc, 1.05), MAT.CONCRETE, { top: false });
  const bands = Math.max(3, Math.round(hallL / 7));
  for (let k = 0; k < bands; k++) {
    const x0 = -hx - 0.5 + (hallL + 1) * k / bands, x1 = -hx - 0.5 + (hallL + 1) * (k + 1) / bands, col = C(roofPick(P, rng));
    loftX(b, x0, x1, [[-eave, wallH - 0.3], [0, h]], () => col, MAT.SHEET, [wallH * 0.5, 0]);
    loftX(b, x0, x1, [[0, h], [eave, wallH - 0.3]], () => col, MAT.SHEET, [wallH * 0.5, 0]);
  }
  const gable = [[-hz, 0.3], [hz, 0.3], [hz, wallH], [0, h - 0.05], [-hz, wallH]];
  capX(b, xa + 0.02, gable, 1, wall, MAT.SHEET);
  capX(b, -hx - 0.02, gable, -1, wall, MAT.SHEET);
  for (let x = -hx + 1.5; x < xa; x += 6.2) for (const sz of [-1, 1]) slab(b, x, wallH / 2 + 0.4, sz * (hz + 0.14), 0.6, wallH - 0.7, 0.32, trim, MAT.CONCRETE);
  for (const y of [wallH - 2.0, wallH - 4.6]) windowsX(b, -hx + 3.1, xa - 2, 6.2, y, 1.7, 3.4, [-(hz + 0.08), hz + 0.08]);
  // the lantern along the ridge, glazed on both sides
  const lx0 = -hx + 5, lx1 = xa - 5;
  bar(b, lx0, lx1, h - 0.2, h + 1.7, -2.2, 2.2, paint, MAT.SHEET, { tx0: lx0 - 0.4, tx1: lx1 + 0.4, thw: 2.6 });
  for (const sz of [-1, 1]) slab(b, (lx0 + lx1) / 2, h + 0.7, sz * 2.25, lx1 - lx0 - 1.0, 1.0, 0.1, C(GLASS), MAT.GLASS);
  // the big door onto the dock, a leaf half way
  slab(b, xa + 0.07, 5.3, 0, 0.14, 10.0, 15.5, C('#07090a'), MAT.DARK);
  bar(b, xa + 0.12, xa + 0.46, 0.3, 10.3, -7.9, -0.9, door, MAT.SHEET);
  bar(b, xa + 0.5, xa + 0.84, 0.3, 10.3, 0.5, 7.9, shade(door, 1.1), MAT.SHEET);
  slab(b, xa + 0.2, 10.7, 0, 0.6, 0.7, 17.0, trim, MAT.CONCRETE);
  for (const sz of [-1, 1]) slab(b, xa + 0.2, 5.3, sz * 8.3, 0.6, 10.6, 0.8, trim, MAT.CONCRETE);
  // the chimney
  b.cylinder(-hx + 4, 0.3, -hz + 4, 1.5, 0.95, 24, shade(C('#8a7664'), 1.0), MAT.CONCRETE, { seg: 14 });
  b.cylinder(-hx + 4, 21.6, -hz + 4, 1.05, 1.15, 24.4, shade(C('#8a7664'), 0.6), MAT.CONCRETE, { seg: 14 });
  // the dry dock: concrete walls, the gate, a black sheet of water between them, bollards on the coping
  for (const sz of [-1, 1]) bar(b, xa, hx, 0.3, 1.25, sz * bz, sz * hz, shade(conc, 1.1), MAT.CONCRETE);
  bar(b, hx - 1.3, hx, 0.3, 1.4, -bz, bz, shade(C(IRON), 1.2), MAT.HULL);
  b.quad([xa + 0.5, 0.85, -bz], [hx - 1.3, 0.85, -bz], [hx - 1.3, 0.85, bz], [xa + 0.5, 0.85, bz], C(WATER), MAT.GLASS, [xa, 0, 0], 1);
  bar(b, xa, xa + 0.5, 0.3, 0.9, -bz, bz, shade(conc, 0.7), MAT.CONCRETE);
  for (const sz of [-1, 1]) for (let x = xa + 3; x < hx - 1; x += 5) b.cylinder(x, 1.25, sz * (hz - 1.0), 0.28, 0.2, 1.75, C(IRON), MAT.HULL, { seg: 8 });
  // the travelling gantry: a leg on each wall at both ends of its bridge, braced, with a trolley and a hoist over the basin
  const gy = 14.4;
  for (const sz of [-1, 1]) {
    const z = sz * (hz - 2.0);
    slab(b, (xa + hx) / 2, 1.34, z, hx - xa - 1, 0.1, 0.4, steel, MAT.HULL);
    for (const dx of [-2.3, 2.3]) {
      bar(b, xg + dx - 0.4, xg + dx + 0.4, 1.4, gy, z - 0.4, z + 0.4, paint, MAT.HULL);
      bogie(b, xg + dx, z, 1.3, 2.2);
    }
    b.beam([xg - 2.3, 1.8, z], [xg + 2.3, gy - 1.0, z], 0.22, 0.22, steel, MAT.HULL, { caps: false });
    b.beam([xg + 2.3, 1.8, z], [xg - 2.3, gy - 1.0, z], 0.22, 0.22, steel, MAT.HULL, { caps: false });
    bar(b, xg - 3.0, xg + 3.0, gy - 0.1, gy + 1.5, z - 0.6, z + 0.6, shade(paint, 1.05), MAT.HULL);
  }
  bar(b, xg - 1.6, xg + 1.6, gy + 0.2, gy + 1.5, -(hz - 2.0), hz - 2.0, shade(paint, 0.95), MAT.HULL);
  bar(b, xg - 1.3, xg + 1.3, gy + 1.5, gy + 2.5, -1.6 + (P.variant - 1) * 3.0, 1.6 + (P.variant - 1) * 3.0, shade(paint, 0.75), MAT.HULL);
  b.beam([xg, gy + 0.2, (P.variant - 1) * 3.0], [xg, 5.5 + P.variant, (P.variant - 1) * 3.0], 0.06, 0.06, C(IRON), MAT.DARK, { caps: false });
  slab(b, xg, 5.0 + P.variant, (P.variant - 1) * 3.0, 0.7, 0.9, 0.7, C(YELLOW), MAT.HULL);
  b.group('fine', () => {
    for (const y of [wallH - 2.0, wallH - 4.6]) windowsX(b, -hx + 3.1, xa - 2, 6.2, y, 1.7, 3.4, [-(hz + 0.08), hz + 0.08]);
    for (let x = -hx + 3; x < xa - 2; x += 5) { slab(b, x, h + 0.55, (x * 7 % 2 > 1 ? 1 : -1) * (hz * 0.5), 1.2, 0.5, 0.9, shade(C(pal.roof), 1.15), MAT.SHEET); }
    for (const sz of [-1, 1]) {
      const z = sz * (hz - 2.0);
      b.beam([xg - 2.3, 4.0, z + sz * 0.45], [xg - 2.3, 1.4, z + sz * 0.45], 0.05, 0.05, C(IRON), MAT.DARK, { caps: false });
    }
    // a ladder up the gantry leg, the rail of the girder, the lights
    for (let y = 2; y < gy; y += 0.45) slab(b, xg - 2.3, y, hz - 2.0 - 0.45, 0.06, 0.06, 0.55, C(IRON), MAT.DARK);
    for (let x = xg - 3; x <= xg + 3; x += 1.5) b.beam([x, gy + 1.5, -(hz - 2.0)], [x, gy + 2.5, -(hz - 2.0)], 0.05, 0.05, steel, MAT.HULL, { caps: false });
    slab(b, xg, gy + 1.7, 0, 0.5, 0.25, 0.5, C('#e6dca0'), MAT.EMISSIVE);
    slab(b, xa + 0.3, 10.9, 0, 0.4, 0.3, 0.8, C('#e6dca0'), MAT.EMISSIVE);
  });
}

// ---- the quay crane -----------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * A portal crane on rails (12 x 12 m, 30 m high): four legs on wheel trucks with a portal frame that lets the wagons through, and on it a slewing house with its cab, counterweight and
 * A-frame, and a lattice jib that luffs up and out over the berth. The slewing part is the `spin` group (built round x = z = 0): at rest the jib points over the side the crane serves
 * (variant 0: the port side of the pier, 1: the starboard side), baseVisual.js swings it to and fro. The legs stand on the rails that baseMesh.js lays at +-5 m from the middle.
 */
function crane(b, P, ruin) {
  const { D, Wd, h, pal } = P, hx = D / 2 - 0.9, hz = Wd / 2 - 0.9, side = P.variant === 0 ? -1 : 1;
  const paint = C(pal.roof2), light = shade(paint, 1.25), steel = C(STEEL), dark = C(IRON), house = shade(C(pal.wall), 1.15);
  const py = 8.2;                                                       // the underside of the portal frame
  if (ruin) {
    const r = P.rrng, burnt = mix(paint, C(CHAR), 0.55);
    scorch(b, r, D * 0.7, Wd * 0.7, 3, 0.2);
    // two legs stand, bent and snapped; the others are down, with the jib across the deck
    for (const [sx, sz] of [[-1, -1], [1, 1]]) b.beam([sx * hx, 0.3, sz * hz], [sx * hx + r.range(-0.8, 0.8), py * r.range(0.35, 0.7), sz * hz + r.range(-0.6, 0.6)], 0.9, 0.9, burnt, MAT.HULL);
    for (const [sx, sz] of [[1, -1], [-1, 1]]) fallen(b, sx * hx * 0.6, 0.6, sz * hz * 1.4, 0.9, 0.9, py * 0.9, 1.45, r.range(-0.4, 0.4), r.range(0, PI), burnt, MAT.HULL);
    fallen(b, 0, 1.2, side * 6, 7, 3.2, 4.6, 0.12, 0.22, 0.3, shade(house, 0.45), MAT.HULL);
    truss(b, [-3, 1.0, side * 3], [18, 2.2, side * 15], 2.0, 0.8, 5, shade(paint, 0.55));
    for (let i = 0; i < 3; i++) twisted(b, r, r.range(-1, 1) * hx, r.range(-1, 1) * hz, r.range(4, 8), shade(C(RUST), 1.0));
    rubble(b, r, hx, hz, 6, C(CHAR));
    return;
  }
  // wheel trucks, legs, the cross members and the portal frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bogie(b, sx * hx, sz * hz, 0.18, 2.8);
    bar(b, sx * hx - 0.5, sx * hx + 0.5, 1.2, py, sz * hz - 0.5, sz * hz + 0.5, paint, MAT.HULL);
    bar(b, sx * hx - 0.62, sx * hx + 0.62, 0.95, 1.55, sz * hz - 0.62, sz * hz + 0.62, steel, MAT.HULL);
    // the warning stripes on the foot of the leg
    for (let k = 0; k < 3; k++) bar(b, sx * hx - 0.52, sx * hx + 0.52, 1.6 + k * 0.7, 2.0 + k * 0.7, sz * hz - 0.52, sz * hz + 0.52, C(YELLOW), MAT.HULL, { top: false });
  }
  for (const sx of [-1, 1]) b.beam([sx * hx, 1.6, -hz], [sx * hx, py - 0.8, hz], 0.2, 0.2, steel, MAT.HULL, { caps: false });
  for (const sz of [-1, 1]) {
    b.beam([-hx, 1.6, sz * hz], [hx, py - 0.8, sz * hz], 0.2, 0.2, steel, MAT.HULL, { caps: false });
    b.beam([hx, 1.6, sz * hz], [-hx, py - 0.8, sz * hz], 0.2, 0.2, steel, MAT.HULL, { caps: false });
    bar(b, -hx - 0.6, hx + 0.6, py - 0.2, py + 0.9, sz * hz - 0.55, sz * hz + 0.55, light, MAT.HULL);
  }
  for (const sx of [-1, 1]) bar(b, sx * hx - 0.55, sx * hx + 0.55, py - 0.1, py + 0.8, -hz, hz, light, MAT.HULL);
  b.cylinder(0, py + 0.8, 0, 3.6, 3.4, py + 1.3, shade(steel, 0.85), MAT.HULL, { seg: 16 });
  b.group('fine', () => {
    // a ladder up one leg to the platform, the rail round the frame, the lamps
    for (let y = 2.2; y < py; y += 0.42) slab(b, hx + 0.52, y, hz - 0.2, 0.06, 0.06, 0.5, dark, MAT.DARK);
    b.beam([hx + 0.52, 1.2, hz - 0.45], [hx + 0.52, py, hz - 0.45], 0.06, 0.06, dark, MAT.DARK, { caps: false });
    b.beam([hx + 0.52, 1.2, hz + 0.05], [hx + 0.52, py, hz + 0.05], 0.06, 0.06, dark, MAT.DARK, { caps: false });
    for (const [x0, z0, x1, z1] of [[-hx - 0.5, -hz, -hx - 0.5, hz], [hx + 0.5, -hz, hx + 0.5, hz], [-hx, -hz - 0.5, hx, -hz - 0.5], [-hx, hz + 0.5, hx, hz + 0.5]]) {
      b.beam([x0, py + 1.9, z0], [x1, py + 1.9, z1], 0.05, 0.05, steel, MAT.HULL, { caps: false });
      b.beam([x0, py + 1.35, z0], [x1, py + 1.35, z1], 0.04, 0.04, steel, MAT.HULL, { caps: false });
    }
    for (const sx of [-1, 1]) slab(b, sx * hx, py - 0.55, hz + 0.65, 0.5, 0.25, 0.4, C('#e6dca0'), MAT.EMISSIVE);
  });
  // the slewing part: round x = z = 0, the jib at rest over the side it serves
  b.group('spin', () => {
    b.push().rotateY(-side * PI / 2);                                  // the jib is drawn along +x
    const y0 = py + 1.3, hy = 11.0;                                    // the deck, the hinge of the jib
    bar(b, -4.2, 3.4, y0, y0 + 0.4, -2.9, 2.9, shade(steel, 0.8), MAT.HULL);
    bar(b, -3.9, 1.5, y0 + 0.4, y0 + 4.0, -2.5, 2.5, house, MAT.HULL, { top: false });
    bar(b, -4.1, 1.7, y0 + 4.0, y0 + 4.35, -2.7, 2.7, shade(C(pal.roof), 0.9), MAT.HULL);
    for (let z = -1.8; z <= 1.8; z += 1.2) slab(b, -3.95, y0 + 2.6, z, 0.06, 0.7, 0.7, C(GLASS), MAT.GLASS);
    // the cab hangs on the side of the house, glass all round
    bar(b, 1.6, 3.8, y0 + 1.6, y0 + 4.0, 1.9, 4.3, light, MAT.HULL, { top: false });
    slab(b, 3.84, y0 + 3.0, 3.1, 0.06, 1.2, 2.0, C(GLASS), MAT.GLASS);
    slab(b, 2.7, y0 + 3.0, 4.34, 2.0, 1.2, 0.06, C(GLASS), MAT.GLASS);
    bar(b, 1.4, 4.0, y0 + 4.0, y0 + 4.25, 1.8, 4.4, shade(C(pal.roof), 0.9), MAT.HULL);
    // the counterweight behind, the A-frame over the hinge
    bar(b, -5.9, -4.2, y0 + 0.2, y0 + 3.2, -2.5, 2.5, shade(C(pal.conc), 0.7), MAT.CONCRETE);
    const ax = -1.3, ay = y0 + 4.35, top = [ax + 0.8, 28.4, 0];
    for (const sz of [-2.1, 2.1]) {
      b.beam([ax - 1.0, ay, sz], top, 0.4, 0.4, paint, MAT.HULL);
      b.beam([ax + 1.6, ay, sz], top, 0.3, 0.3, paint, MAT.HULL);
    }
    b.beam([ax, ay + 7, -2.0], [ax + 0.2, ay + 7, 2.0], 0.25, 0.25, steel, MAT.HULL);
    // the jib: from the hinge up and out; the tip sheave, the pendants from the A-frame, the hoist rope and the hook
    const L = 26.5, ang = 0.62, tip = [1.8 + L * Math.cos(ang), hy + L * Math.sin(ang), 0];
    truss(b, [1.8, hy, 0], tip, 2.4, 0.9, 8, shade(paint, 1.1));
    slab(b, tip[0] + 0.3, tip[1] + 0.2, 0, 1.3, 0.9, 1.1, shade(paint, 0.8), MAT.HULL);
    for (const f of [0.55, 1.0]) {
      const q = [1.8 + L * f * Math.cos(ang) * 0.97, hy + L * f * Math.sin(ang) * 0.97 + 0.5, 0];
      b.beam(top, q, 0.1, 0.1, dark, MAT.DARK, { caps: false });
    }
    b.beam(top, [-5.0, y0 + 3.2, 0], 0.12, 0.12, dark, MAT.DARK, { caps: false });
    b.beam([tip[0] + 0.3, tip[1] - 0.2, 0], [tip[0] + 0.3, 11.0, 0], 0.06, 0.06, dark, MAT.DARK, { caps: false });
    slab(b, tip[0] + 0.3, 10.7, 0, 0.8, 0.7, 0.8, C(YELLOW), MAT.HULL);
    b.pop();
  });
}

const PORT_BUILDERS = { warehouse, dockyard, crane };
/** The meshes of one building of a port (kinds warehouse, dockyard, crane; any other kind is drawn by baseParts.js): same result as buildPartMesh. */
export const buildPortPart = (kind, P) => buildPartMesh(kind, P, PORT_BUILDERS);
export const PORT_KINDS = Object.keys(PORT_BUILDERS);

// ---- the site ------------------------------------------------------------------------------------------------------------------------------------------------------------

const Y_PAVE = 0.155, Y_JOINT = 0.17, Y_ROAD = 0.18, Y_SLEEPER = 0.19, Y_MARK = 0.195, Y_RAIL = 0.21;
const TIMBER = '#3b352d', RUBBER = '#121314';

/** A stack of crates (nx by nz, ny high) with a canvas cover over it when `tarp`; (x, z) the middle, standing on y. */
function crates(b, x, y, z, nx, nz, ny, yaw, seed, col = '#8a7350', tarp = false) {
  b.push().translate(x, y, z);
  if (yaw) b.rotateY(-yaw);
  const sx = 1.5, sz = 1.15, sy = 1.05;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) for (let k = 0; k < ny; k++) {
    if (tarp && k === ny - 1) continue;
    const f = 0.8 + 0.4 * hash2(seed + i * 7 + k, j * 13);
    slab(b, (i - (nx - 1) / 2) * sx, k * sy + sy / 2, (j - (nz - 1) / 2) * sz, sx * 0.96, sy * 0.96, sz * 0.96, shade(C(col), f), MAT.CANVAS);
  }
  if (tarp) slab(b, 0, (ny - 1) * sy + sy * 0.55, 0, nx * sx * 1.02, sy * 1.1, nz * sz * 1.02, shade(C('#59553f'), 0.9 + 0.2 * hash2(seed, 5)), MAT.CANVAS);
  b.pop();
}

/** A mooring bollard standing on y: a waisted post with a flange. */
function bollard(b, x, y, z) {
  const iron = C(IRON);
  b.cylinder(x, y, z, 0.34, 0.24, y + 0.5, iron, MAT.HULL, { seg: 8 });
  b.cylinder(x, y + 0.5, z, 0.24, 0.36, y + 0.78, shade(iron, 1.2), MAT.HULL, { seg: 8 });
}

/** A lamp post at the edge of the quay: a pole and an arm that leans over the deck (toward `lean`, +-1 along z) with a lamp under it. */
function lampPost(b, x, y, z, h, lean) {
  const iron = C('#585d58');
  b.cylinder(x, y, z, 0.22, 0.13, y + h, iron, MAT.HULL, { seg: 6 });
  b.beam([x, y + h - 0.2, z], [x, y + h + 0.45, z + lean * 1.5], 0.12, 0.12, iron, MAT.HULL);
  slab(b, x, y + h + 0.2, z + lean * 1.6, 0.7, 0.18, 0.4, shade(iron, 0.8), MAT.HULL);
  slab(b, x, y + h + 0.08, z + lean * 1.6, 0.55, 0.06, 0.3, C('#f2e8b0'), MAT.EMISSIVE);
}

/** A mooring buoy at the water line y: a drum, a cone, a mast with a light, in the colours of the nation. */
function buoy(b, x, y, z, body, band) {
  b.cylinder(x, y - 0.9, z, 1.15, 1.15, y + 0.5, body, MAT.HULL, { seg: 14 });
  b.cylinder(x, y - 0.2, z, 1.17, 1.17, y + 0.3, band, MAT.HULL, { seg: 14, capBottom: false, capTop: false });
  b.cylinder(x, y + 0.5, z, 1.15, 0.4, y + 1.4, body, MAT.HULL, { seg: 14 });
  b.cylinder(x, y + 1.4, z, 0.1, 0.07, y + 3.3, C(IRON), MAT.HULL, { seg: 6 });
  b.beam([x - 0.4, y + 2.8, z], [x + 0.4, y + 2.8, z], 0.05, 0.05, C(IRON), MAT.HULL, { caps: false });
  slab(b, x, y + 3.45, z, 0.32, 0.3, 0.32, C('#e8d27a'), MAT.EMISSIVE);
  for (const s of [-1, 1]) b.beam([x + s * 1.0, y + 0.45, z], [x + s * 0.2, y + 1.5, z], 0.07, 0.07, C(IRON), MAT.HULL, { caps: false });
}

/** A pair of rails with sleepers from (s0, t0) to (s1, t1) in the frame of the base: the rails in `g`, the sleepers in `gf`. */
function track(g, gf, K, s0, t0, s1, t1, y = Y_RAIL, gauge = 1.5) {
  const l = Math.hypot(s1 - s0, t1 - t0);
  if (l < 1) return;
  const ux = (s1 - s0) / l, uz = (t1 - t0) / l, nx = -uz, nz = ux;
  for (const o of [-gauge / 2, gauge / 2]) K.strip(g, s0 + nx * o, t0 + nz * o, s1 + nx * o, t1 + nz * o, 0.2, y, C('#4a4c4e'));
  const n = Math.floor(l / 1.1);
  for (let i = 0; i <= n; i++) {
    const p = [s0 + ux * i * 1.1, t0 + uz * i * 1.1];
    K.strip(gf, p[0] - nx * 1.2, p[1] - nz * 1.2, p[0] + nx * 1.2, p[1] + nz * 1.2, 0.26, Y_SLEEPER, C('#3a342c'));
  }
}

/**
 * The flat work and the decoration of a port, in the frame of the base. K: the helpers of baseMesh.js ({ rect, strip, glyph, aprons, fence, floodlight }); o: { ref (height of the pad),
 * wl (the sea level in this frame, -ref), shoreS (where the quay wall stands, metres from the middle of the yard along the axis) }.
 */
export function portSite(L, loc, pal, rng, g, gf, d, df, K, o) {
  const { rect, strip, glyph } = K, { wl, shoreS } = o;
  const hwp = L.pier.w / 2, pe = loc(L.pier.x1, L.pier.z1)[0], py = L.pier.y - o.ref;
  const ap = L.aprons[0], AHW = ap.hw, AEND = ap.hl;
  const conc = C(pal.conc), concD = shade(conc, 0.8), timber = C(TIMBER);
  K.aprons(g, gf, L, loc, pal);
  // ---- the quay wall: a block from the sea bed up to the yard, tiled on top, with a curb, a yellow line, the dark stain of the water line, fenders and bollards
  const wy = 0.1, wallBot = wl - 3.5;
  bar(d, AEND - 0.5, shoreS, wallBot, wy, -AHW, AHW, concD, MAT.CONCRETE);
  bar(d, shoreS, shoreS + 0.1, wl - 0.9, wl + 0.45, -AHW, AHW, C('#232b27'), MAT.CONCRETE);
  bar(d, shoreS - 0.9, shoreS, wy, wy + 0.3, -AHW, AHW, shade(conc, 1.15), MAT.CONCRETE);
  for (let t = -AHW + 12; t < AHW - 6; t += 24) if (Math.abs(t) > hwp + 3) bar(d, shoreS, shoreS + 0.45, wallBot, wy, t - 0.45, t + 0.45, shade(concD, 0.85), MAT.CONCRETE);
  for (let i = 0, s = AEND; s < shoreS; i++, s += 15) for (let j = 0, t = -AHW; t < AHW - 0.01; j++, t += 15) {
    const s1 = Math.min(shoreS - 0.9, s + 15), t1 = Math.min(AHW, t + 15), f = 0.94 + 0.1 * hash2(i + L.id * 3, j + 71);
    if (s1 - s < 0.5) continue;
    rect(g, (s + s1) / 2, (t + t1) / 2, (s1 - s) / 2 + 0.01, (t1 - t) / 2 + 0.01, 0, Y_PAVE, [conc[0] * f, conc[1] * f, conc[2] * f * 0.99]);
  }
  for (const sgn of [-1, 1]) strip(g, shoreS - 1.9, sgn * (hwp + 2), shoreS - 1.9, sgn * (AHW - 1.5), 0.35, Y_MARK, C('#c9b24a'));
  for (let t = -AHW + 10; t < AHW - 5; t += 25) if (Math.abs(t) > hwp + 4) bollard(d, shoreS - 1.6, wy, t);
  // ---- the pier: a deck on timber piles, from the quay wall to the head
  const s0 = shoreS - 1.0;
  bar(d, s0, pe, py - 1.45, py + wy, -hwp, hwp, shade(conc, 0.98), MAT.CONCRETE);
  for (const sgn of [-1, 1]) bar(d, s0, pe, py + wy, py + wy + 0.24, sgn > 0 ? hwp - 0.6 : -hwp, sgn > 0 ? hwp : -hwp + 0.6, shade(conc, 1.15), MAT.CONCRETE);
  bar(d, pe - 0.6, pe, py + wy, py + wy + 0.24, -hwp, hwp, shade(conc, 1.15), MAT.CONCRETE);
  for (let i = 0, s = shoreS; s < pe - 0.01; i++, s += 12) for (const [t0, t1] of [[-hwp, 0], [0, hwp]]) {
    const s1 = Math.min(pe, s + 12), f = 0.94 + 0.1 * hash2(i + L.id * 5, t0 + 91);
    rect(g, (s + s1) / 2, (t0 + t1) / 2, (s1 - s) / 2 + 0.01, (t1 - t0) / 2 + 0.01, 0, py + Y_PAVE, [conc[0] * f, conc[1] * f, conc[2] * f * 0.99]);
    rect(gf, s, (t0 + t1) / 2, 0.08, (t1 - t0) / 2, 0, py + Y_JOINT, [conc[0] * 0.55, conc[1] * 0.55, conc[2] * 0.55]);
  }
  rect(gf, (shoreS + pe) / 2, 0, (pe - shoreS) / 2, 0.08, 0, py + Y_JOINT, [conc[0] * 0.55, conc[1] * 0.55, conc[2] * 0.55]);
  for (const sgn of [-1, 1]) strip(g, shoreS, sgn * (hwp - 1.3), pe - 0.8, sgn * (hwp - 1.3), 0.3, py + Y_MARK, C('#c9b24a'));
  // the piles in bents of five with a cross beam and braces, seen from the water
  for (let s = shoreS + 6; s < pe - 3; s += 12) {
    for (const t of [-15, -7.5, 0, 7.5, 15]) d.cylinder(s, wl - 9, t, 0.6, 0.55, py - 1.2, timber, MAT.HULL, { seg: 8 });
    d.beam([s, py - 1.9, -16], [s, py - 1.9, 16], 0.5, 0.4, shade(timber, 1.1), MAT.HULL);
    if (s + 12 < pe - 3) for (const t of [-15, 15, 0]) {
      d.beam([s, wl - 0.4, t], [s + 12, py - 1.5, t], 0.26, 0.26, shade(timber, 1.2), MAT.HULL, { caps: false });
      d.beam([s + 12, wl - 0.4, t], [s, py - 1.5, t], 0.26, 0.26, shade(timber, 1.2), MAT.HULL, { caps: false });
    }
  }
  // the berth numbers where the pier leaves the shore, read from the sea
  const bn = (L.id % 4) * 2;
  for (const [sgn, ch] of [[-1, String(bn + 1)], [1, String(bn + 2)]]) glyph(g, ch, shoreS + 14, sgn * 9, 5.4, 9, PI, py + Y_MARK + 0.005);
  // bollards, lamp posts, fenders and the rubbing strake along both edges
  for (const sgn of [-1, 1]) {
    for (let s = shoreS + 14; s < pe - 6; s += 25) bollard(d, s, py + wy, sgn * (hwp - 0.95));
    for (let s = shoreS + 25 + (sgn > 0 ? 0 : 25); s < pe - 10; s += 50) lampPost(d, s, py + wy, sgn * (hwp - 0.6), 8.2, -sgn);
    bar(df, shoreS, pe, py - 1.7, py - 0.2, sgn > 0 ? hwp : -hwp - 0.14, sgn > 0 ? hwp + 0.14 : -hwp, timber, MAT.HULL);
    for (let s = shoreS + 10; s < pe - 4; s += 10) df.cylinder(s, py - 2.3, sgn * (hwp + 0.4), 0.3, 0.3, py - 0.15, C(RUBBER), MAT.CANVAS, { seg: 8 });
    for (let s = shoreS + 60; s < pe - 20; s += 140) for (let y = py - 2.6; y < py; y += 0.4) slab(df, s, y, sgn * (hwp + 0.06), 0.5, 0.08, 0.1, C(IRON), MAT.DARK);
  }
  // the rails of the quay cranes, one pair under each crane, and the stops at their ends
  const cranes = L.parts.filter((q) => q.kind === 'crane').map((q) => loc(q.x, q.z));
  for (const sgn of [-1, 1]) {
    const cs = cranes.filter((c) => Math.sign(c[1]) === sgn);
    if (!cs.length) continue;
    const a = Math.min(...cs.map((c) => c[0])) - 11, e = Math.max(...cs.map((c) => c[0])) + 11, tc = cs.reduce((m, c) => m + c[1], 0) / cs.length;
    for (const t of [tc - 5, tc + 5]) {
      track(g, gf, K, a, t, e, t, py + Y_RAIL - 0.01, 0.01);
      for (const x of [a - 0.6, e + 0.6]) bar(d, x - 0.35, x + 0.35, py + wy, py + wy + 0.9, t - 0.5, t + 0.5, C('#a8382d'), MAT.HULL);
    }
  }
  // the pipeline along the middle of the pier: two pipes on concrete blocks, expansion loops, valves, the manifold at the head, a pit where it comes out of the quay
  const pa = shoreS + 6, pb = pe - 22, pipeY = py + wy + 0.7;
  bar(d, shoreS - 9, shoreS - 3.5, 0.08, 1.0, -3.0, 3.0, concD, MAT.CONCRETE);
  for (const [z, c] of [[-0.9, '#4d5148'], [0.9, '#6a3b2c']]) {
    d.rod(pa, pb, pipeY, z, 0.27, 0.27, C(c), MAT.HULL, { seg: 8 });
    d.rod(shoreS - 6, pa, pipeY, z, 0.27, 0.27, C(c), MAT.HULL, { seg: 8 });
  }
  for (let s = pa + 4; s < pb; s += 6) slab(d, s, py + wy + 0.28, 0, 0.5, 0.56, 2.7, concD, MAT.CONCRETE);
  for (let s = pa + 55; s < pb - 20; s += 60) for (const [z, c] of [[-0.9, '#4d5148'], [0.9, '#6a3b2c']]) {
    const w = z > 0 ? 1 : -1, zz = z + w * 2.2;
    d.beam([s, pipeY, z], [s, pipeY, zz], 0.5, 0.5, C(c), MAT.HULL); d.beam([s, pipeY, zz], [s + 3.2, pipeY, zz], 0.5, 0.5, C(c), MAT.HULL); d.beam([s + 3.2, pipeY, zz], [s + 3.2, pipeY, z], 0.5, 0.5, C(c), MAT.HULL);
  }
  for (const [z, c] of [[-0.9, '#4d5148'], [0.9, '#6a3b2c']]) {
    for (let s = pa + 30; s < pb; s += 80) { d.cylinder(s, pipeY + 0.2, z, 0.12, 0.12, pipeY + 1.1, C(IRON), MAT.HULL, { seg: 6 }); d.rodZ(s, pipeY + 1.1, z - 0.4, z + 0.4, 0.1, 0.1, C('#a8382d'), MAT.HULL, { seg: 6 }); }
    d.beam([pb, pipeY, z], [pb + 5, pipeY, z * 5.5], 0.4, 0.4, C(c), MAT.HULL);
    slab(d, pb + 5.2, pipeY, z * 5.5, 0.4, 1.0, 1.0, C(IRON), MAT.HULL);
  }
  // the head: a light on a white tower, the signal mast with the ensign
  const hs = pe - 3.5;
  d.cylinder(hs, py + wy, 0, 1.5, 1.1, py + wy + 7.5, C('#d6d2c4'), MAT.CONCRETE, { seg: 12 });
  d.cylinder(hs, py + wy + 7.5, 0, 1.4, 1.4, py + wy + 8.3, C('#202225'), MAT.HULL, { seg: 12 });
  d.cylinder(hs, py + wy + 8.3, 0, 0.9, 0.2, py + wy + 9.4, shade(C(pal.roof2), 0.8), MAT.HULL, { seg: 12 });
  d.cylinder(hs, py + wy + 7.7, 0, 0.9, 0.9, py + wy + 8.3, C('#f0e2a0'), MAT.EMISSIVE, { seg: 12 });
  mast(d, pe - 8, py + wy, 6, 13);
  flagStaff(d, pe - 8, py + wy, -6, 10, 3.8);
  // ---- the yard: the roads, the lines of rail, the lanes in front of the sheds
  const road = [74, 74, 77];
  rect(g, (-AEND + shoreS - 2) / 2, 0, (AEND + shoreS - 2) / 2, 6, 0, Y_ROAD, road);
  rect(g, -85, 0, 4, 100, 0, Y_ROAD, road);
  for (const q of L.parts.filter((q) => q.kind === 'warehouse')) {
    const p = loc(q.x, q.z), ls = p[0] + 11 + 7;               // (the lane in front of the doors, half the width of a shed and the dock out from its middle)
    rect(g, ls, p[1], 4, 27, 0, Y_ROAD, road);
  }
  for (let s = -AEND + 4; s < shoreS - 8; s += 10) strip(g, s, 0, s + 5, 0, 0.3, Y_MARK, C('#d8d6c8'));
  for (const sgn of [-1, 1]) {
    track(g, gf, K, -100, sgn * 9.5, shoreS - 4, sgn * 9.5, Y_RAIL);
    bar(d, shoreS - 3.6, shoreS - 2.9, 0.1, 1.0, sgn * 9.5 - 1.0, sgn * 9.5 + 1.0, C('#a8382d'), MAT.HULL);
  }
  // flags, masts, floodlights and fences
  const tw = L.parts.find((q) => q.kind === 'tower');
  if (tw) { const p = loc(tw.x, tw.z); flagStaff(d, p[0] - 16, 0, p[1] + 8, 11, 4.2); }
  mast(d, -95, 0, -60, 17, '#8c8f86');
  for (let i = 0; i < 6; i++) K.floodlight(d, shoreS - 8, (i - 2.5) * 40, PI / 2, 11);
  const tk = L.parts.filter((q) => q.kind === 'tank').map((q) => loc(q.x, q.z));
  if (tk.length) {
    const s0f = Math.min(...tk.map((p) => p[0])) - 18, s1f = Math.max(...tk.map((p) => p[0])) + 18, t0f = Math.min(...tk.map((p) => p[1])) - 18, t1f = Math.max(...tk.map((p) => p[1])) + 18;
    K.fence(df, s0f, s1f, t0f, t1f, rng, 4.5, [[s1f, 0, 8]]);
  }
  const bk = L.parts.filter((q) => q.kind === 'barracks').map((q) => loc(q.x, q.z));
  for (const sgn of [-1, 1]) {
    const b2 = bk.filter((p) => Math.sign(p[1]) === sgn);
    if (b2.length) K.fence(df, Math.min(...b2.map((p) => p[0])) - 14, Math.max(...b2.map((p) => p[0])) + 14, Math.min(...b2.map((p) => p[1])) - 22, Math.max(...b2.map((p) => p[1])) + 22, rng, 4.5, [[Math.max(...b2.map((p) => p[0])) + 14, 0, 8]]);
  }
  // vehicles, drums and stacks of cargo
  const vcol = shade(C(pal.wall), 0.85);
  const veh = [['truck', 4, 14, 0.1], ['truck', 30, -16, PI], ['bowser', -60, 16, 0.05], ['jeep', 70, -14, 1.2], ['truck', shoreS - 14, 22, PI / 2], ['jeep', -10, 12, 0.3], ['truck', shoreS - 22, -26, -PI / 2]];
  for (const [kind, s, t, yaw] of veh) vehicle(df, s, 0.16, t, yaw, kind, kind === 'bowser' ? '#6e7062' : vcol);
  const dr = [[-76, 40], [-76, -40], [-24, 28], [26, -30], [shoreS - 12, 60]];
  dr.forEach(([s, t], i) => drums(df, s, 0.15, t, 3 + (i % 2), 2 + ((i >> 1) % 2), hash2(i, 1) * 3, i % 2 ? '#5c6048' : '#7a4a3a'));
  const stacks = [[shoreS - 10, -50], [shoreS - 10, -62], [shoreS - 12, 50], [shoreS - 20, 90], [shoreS - 8, -100], [shoreS - 24, -88]];
  stacks.forEach(([s, t], i) => { if (Math.abs(t) < AHW - 6) crates(df, s, 0.16, t, 3 + (i % 3), 2 + (i % 2), 2 + (i % 2), (i % 3) * 0.04, L.id * 11 + i, i % 2 ? '#8a7350' : '#6e7456', i % 3 === 0); });
  // the mooring buoys of the anchorage, at the sea level, each in two colours of the nation
  L.moorings.forEach((m, i) => { const p = loc(m.x, m.z); buoy(d, p[0], wl, p[1], shade(C(pal.tank), 1.25), i % 2 ? C('#a8382d') : shade(C(pal.roof2), 0.9)); });
}
