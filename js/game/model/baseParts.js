// The buildings of the bases, each as a MeshBuilder with the groups
//   body       the intact building (always drawn)
//   body_ruin  what is left of it when it is destroyed (the walls that stand, the roof that fell in, a scorch mark)
//   fine       small detail (ladders, vents, doors, railings), drawn only up close
//   spin       the part that turns (the antenna of a radar), built round the vertical axis x = z = 0
// Built in a canonical frame: the long side along x, the door (if any) on the +x end or the +z side, the origin on the ground in the middle. buildBaseModel
// (baseMesh.js) turns that frame to the way the building faces. P: { D (along x), Wd (along z), h, pal, rng, variant, nation }.
import { MeshBuilder, MAT } from './meshbuilder.js';
import { makeRng } from '../math.js';
import { roofRail } from './details.js';
import { C, shade, mix, DARK, CHAR, RUST, slab, bar, loftX, capX, disc, flagStaff, mast, sandbags } from './baseKit.js';

const PI = Math.PI;
const GLASS = '#0d141a';

// ---- shared pieces of the ruins ---------------------------------------------------------------------------------------------------------------------------------------

/** The black of a burnt-out ground: a few overlapping jagged discs inside the rectangle (hx, hz). */
function scorch(b, rng, hx, hz, n = 3, y = 0.05) {
  for (let i = 0; i < n; i++) {
    const r = Math.min(hx, hz) * rng.range(0.55, 1.0) / (1 + i * 0.3);
    disc(b, rng.range(-1, 1) * hx * 0.25, y + i * 0.012, rng.range(-1, 1) * hz * 0.25, r, shade(C(CHAR), 0.8 + 0.3 * i), MAT.CANVAS, { salt: i * 17 + (rng() * 50 | 0) }, 13, r * rng.range(0.75, 1.15));
  }
}

/** A wall broken down to a jagged top: pieces of random height along (x0, z0) -> (x1, z1). */
function brokenWall(b, rng, x0, z0, x1, z1, thick, hMax, col, y0 = -0.4) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.2));
  const yaw = Math.atan2(z1 - z0, x1 - x0), seg = len / n;
  for (let i = 0; i < n; i++) {
    const tm = (i + 0.5) / n;
    const hgt = hMax * rng.range(0.1, 1) * (rng() < 0.25 ? 0.25 : 1);
    b.push().translate(x0 + (x1 - x0) * tm, 0, z0 + (z1 - z0) * tm).rotateY(-yaw);
    bar(b, -seg / 2, seg / 2 + 0.02, y0, hgt, -thick / 2, thick / 2, rng() < 0.3 ? shade(C(CHAR), 1.5) : col, MAT.CANVAS, { tx0: -seg / 2 + rng.range(0, 0.7), tx1: seg / 2 - rng.range(0, 0.7), thw: thick / 2 * 0.8 });
    b.pop();
  }
}

/** A sheet or a slab lying slanted on the rubble. */
function fallen(b, x, y, z, sx, sy, sz, tiltX, tiltZ, yaw, col, mat = MAT.HULL) {
  b.push().translate(x, y, z).rotateY(yaw).rotateX(tiltX).rotateZ(tiltZ);
  slab(b, 0, 0, 0, sx, sy, sz, col, mat);
  b.pop();
}

/** A bent beam sticking out of the rubble. */
function twisted(b, rng, x, z, h, col) {
  const a = rng.range(0, PI * 2), lean = rng.range(0.2, 0.8);
  const p0 = [x, -0.2, z], p1 = [x + Math.cos(a) * h * lean * 0.5, h * 0.55, z + Math.sin(a) * h * lean * 0.5];
  const p2 = [p1[0] + Math.cos(a + rng.range(-1, 1)) * h * 0.4, h * rng.range(0.85, 1.2), p1[2] + Math.sin(a + rng.range(-1, 1)) * h * 0.4];
  b.beam(p0, p1, 0.22, 0.22, col, MAT.HULL);
  b.beam(p1, p2, 0.2, 0.2, shade(col, 0.85), MAT.HULL);
}

/** Lumps and planks lying about, spread over (hx, hz). */
function rubble(b, rng, hx, hz, n, col) {
  for (let i = 0; i < n; i++) {
    const s = rng.range(0.4, 1.8);
    fallen(b, rng.range(-1, 1) * hx, s * 0.2, rng.range(-1, 1) * hz, s * rng.range(0.8, 2), s * 0.4, s * rng.range(0.6, 1.4), rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), rng.range(0, PI * 2), rng() < 0.4 ? shade(col, 0.6) : col, MAT.CANVAS);
  }
}

/** A round wall broken to a ragged height (a tank shell). */
function raggedRing(b, rng, r, hMax, col, thick = 0.3) {
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * PI * 2, a1 = (i + 1) / n * PI * 2, am = (a0 + a1) / 2;
    const hh = hMax * rng.range(0.15, 1) * (rng() < 0.3 ? 0.35 : 1);
    const p = (rr, a, y) => [Math.cos(a) * rr, y, Math.sin(a) * rr];
    b.quad(p(r, a0, -0.3), p(r, a1, -0.3), p(r, a1, hh), p(r, a0, hh), col, MAT.HULL, [0, hh / 2, 0], 1);
    b.quad(p(r - thick, a0, -0.3), p(r - thick, a1, -0.3), p(r - thick, a1, hh), p(r - thick, a0, hh), shade(col, 0.55), MAT.HULL, p(r * 3, am, hh / 2), 0.7);
    b.quad(p(r - thick, a0, hh), p(r - thick, a1, hh), p(r, a1, hh), p(r, a0, hh), shade(col, 0.4), MAT.HULL, [0, -1, 0], 1);
  }
}

const roofPick = (P, rng) => { const r = rng(); return r < 0.5 ? P.pal.roof : r < 0.8 ? P.pal.roof2 : P.pal.roof3; };

/** Dark window panes on the faces z = +-(hz + off), spaced along x. */
function windowsX(b, x0, x1, step, y, hgt, wid, zs, col = GLASS) {
  for (let x = x0; x <= x1 + 1e-6; x += step) for (const z of zs) slab(b, x, y, z, wid, hgt, 0.08, C(col), MAT.GLASS);
}

// ---- the hangar ---------------------------------------------------------------------------------------------------------------------------------------------------------

function hangar(b, P, ruin) {
  const { D, Wd, h, pal, rng } = P;
  const hz = Wd / 2, hx = D / 2, arch = pal.arch, wallH = arch ? h * 0.42 : h * 0.52, rise = h - wallH;
  const wall = C(pal.wall), trim = C(pal.trim), conc = C(pal.conc), door = C(pal.door);
  const dw = Wd - 5, dh = arch ? Math.min(wallH + rise * 0.55, h * 0.64) : wallH - 0.3;
  if (ruin) {
    const r = P.rrng, burnt = mix(wall, C(CHAR), 0.6);
    slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, shade(conc, 0.82), MAT.CANVAS);
    scorch(b, r, hx, hz, 4, 0.36);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.5, wallH * 0.95, burnt, 0.3);
    const l1 = r.range(0.35, 0.85) * D, l2 = r.range(0.2, 0.7) * D;
    brokenWall(b, r, -hx, -hz, -hx + l1, -hz, 0.5, wallH * 0.9, burnt, 0.3);
    brokenWall(b, r, -hx, hz, -hx + l2, hz, 0.5, wallH * 0.9, burnt, 0.3);
    for (const sz of [-1, 1]) bar(b, hx - 0.5, hx, 0.3, dh + r.range(-1.5, 1.2), sz * (dw / 2 + 0.4), sz * (hz), burnt, MAT.CANVAS);
    // the roof has come down: sheets lying on the floor and the ribs standing
    for (let i = 0; i < 6; i++) fallen(b, r.range(-0.7, 0.7) * hx, r.range(0.5, 2.0), r.range(-0.7, 0.7) * hz, r.range(5, 11), 0.18, r.range(3, 7), r.range(-0.5, 0.5), r.range(-0.5, 0.5), r.range(0, PI), shade(C(roofPick(P, r)), 0.5), MAT.HULL);
    // sections of the roof that came down in one piece, and the ribs of the arch still standing
    for (let i = 0; i < 2; i++) {
      b.push().translate(r.range(-0.55, 0.55) * hx, 0.3, r.range(-0.45, 0.45) * hz).rotateY(r.range(0, PI)).rotateX(r.range(-0.3, 0.3));
      const prof = [], a0 = r.range(-0.9, -0.2), a1 = a0 + r.range(0.9, 1.5), rr = Math.min(hz * 0.8, 9);
      for (let k = 0; k <= 7; k++) { const a = a0 + (a1 - a0) * k / 7; prof.push([Math.sin(a) * rr, Math.cos(a) * rr * 0.55]); }
      const col = shade(C(roofPick(P, r)), 0.42);
      loftX(b, -r.range(2.5, 5), r.range(2.5, 5), prof, () => col, MAT.HULL, [-2, 0]);
      b.pop();
    }
    for (let i = 0; i < 3; i++) {
      const x = -hx + (i + 0.5) * D / 3 * r.range(0.6, 1), sz = i % 2 ? 1 : -1, hgt = r.range(5, 9);
      b.beam([x, -0.2, sz * hz * 0.98], [x, hgt * 0.7, sz * hz * 0.8], 0.28, 0.28, shade(C(RUST), 0.9), MAT.HULL);
      b.beam([x, hgt * 0.7, sz * hz * 0.8], [x + r.range(-1, 1), hgt, sz * hz * 0.4], 0.24, 0.24, shade(C(RUST), 0.8), MAT.HULL);
    }
    for (let i = 0; i < 4; i++) twisted(b, r, r.range(-0.8, 0.8) * hx, r.range(-1, 1) * hz * 0.9, r.range(5, 11), shade(C(RUST), 1.0));
    for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) fallen(b, hx + 0.5 + k * 1.5, 0.45, sz * r.range(4, 12), 0.35, dh * 0.9, 0.9 * Wd / 7, 1.35, 0, 0, shade(door, 0.6), MAT.HULL);
    rubble(b, r, hx * 0.85, hz * 0.85, 14, burnt);
    return;
  }
  slab(b, 0, -0.6, 0, D + 0.9, 1.9, Wd + 0.9, conc, MAT.CANVAS);
  bar(b, -hx, hx, 0.3, wallH, -hz, hz, wall, MAT.HULL, { top: false });
  const bands = Math.max(2, Math.round(D / 7)), eave = hz + 0.45;
  if (arch) {
    const prof = [];
    for (let i = 0; i <= 12; i++) { const a = -PI / 2 + PI * i / 12; prof.push([Math.sin(a) * eave, wallH + rise * Math.cos(a)]); }
    for (let k = 0; k < bands; k++) {
      const col = C(roofPick(P, rng));
      loftX(b, -hx - 0.4 + (D + 0.8) * k / bands, -hx - 0.4 + (D + 0.8) * (k + 1) / bands, prof, () => col, MAT.HULL, [wallH * 0.5, 0]);
    }
    const endProf = prof.map((p) => [p[0] * hz / eave, p[1]]);
    const wallEnd = [...endProf, [hz, 0.3], [-hz, 0.3]];
    capX(b, hx + 0.02, wallEnd, 1, wall, MAT.HULL);
    capX(b, -hx - 0.02, wallEnd, -1, wall, MAT.HULL);
    capX(b, hx + 0.4, prof, 1, shade(C(pal.roof), 0.8), MAT.HULL);
    capX(b, -hx - 0.4, prof, -1, shade(C(pal.roof), 0.8), MAT.HULL);
  } else {
    for (let k = 0; k < bands; k++) {
      const x0 = -hx - 0.5 + (D + 1) * k / bands, x1 = -hx - 0.5 + (D + 1) * (k + 1) / bands;
      bar(b, x0, x1, wallH, h, -eave - 0.4, eave + 0.4, C(roofPick(P, rng)), MAT.HULL, { tx0: x0, tx1: x1, thw: 0.12 });
    }
    for (const sx of [-1, 1]) bar(b, sx * (hx + 0.02), sx * (hx + 0.14), wallH, h - 0.3, -hz, hz, wall, MAT.HULL, { tx0: sx * (hx + 0.02), tx1: sx * (hx + 0.14), thw: 0.1 });
  }
  for (let x = -hx + 1.2; x < hx - 0.5; x += 6.4) for (const sz of [-1, 1]) slab(b, x, wallH / 2, sz * (hz + 0.13), 0.55, wallH - 0.3, 0.3, trim, MAT.CANVAS);
  windowsX(b, -hx + 3.2, hx - 2, 3.2, wallH - 1.2, 0.85, 1.7, [-(hz + 0.06), hz + 0.06]);
  // the big doors at the +x end: a dark opening, two sliding leaves on a rail, one of them pushed aside by a varying amount
  const open = [0, 0.4, 0.7][P.variant % 3], lw = dw / 2 + 0.3, sA = open * dw * 0.45, sB = (P.variant % 2) * 0.12 * dw;
  slab(b, hx + 0.08, dh / 2 + 0.3, 0, 0.16, dh, dw, C('#07090a'), MAT.DARK);
  bar(b, hx + 0.3, hx + 0.62, 0.3, dh + 0.3, -dw / 2 - sA, -dw / 2 - sA + lw, door, MAT.HULL);
  bar(b, hx + 0.1, hx + 0.38, 0.3, dh + 0.3, dw / 2 - lw + sB, dw / 2 + sB, shade(door, 1.08), MAT.HULL);
  slab(b, hx + 0.42, dh + 0.6, 0, 0.5, 0.5, Wd - 1.0, trim, MAT.CANVAS);
  for (const sz of [-1, 1]) slab(b, hx + 0.32, dh / 2 + 0.3, sz * (dw / 2 + 0.3 + sz * 0.0), 0.5, dh, 0.7, trim, MAT.CANVAS);
  // fine: ribs on the doors, ridge vents, a man door and a ladder, the rail of the doors, drain pipes
  b.group('fine', () => {
    for (let i = 1; i < 5; i++) bar(b, hx + 0.62, hx + 0.7, 0.3 + dh * i / 5, 0.5 + dh * i / 5, -dw / 2 - sA, -dw / 2 - sA + lw, shade(door, 0.8), MAT.HULL);
    for (let i = 1; i < 3; i++) bar(b, hx + 0.38, hx + 0.46, 0.3, dh + 0.3, dw / 2 - lw + sB + i * lw / 3, dw / 2 - lw + sB + i * lw / 3 + 0.15, shade(door, 0.8), MAT.HULL);
    slab(b, hx + 0.3, 0.38, 0, 0.6, 0.12, Wd + 6, C('#3a3b3a'), MAT.DARK);
    for (let x = -hx + 3; x < hx - 2; x += 6) slab(b, x, h + 0.35, 0, 1.4, 0.6, 1.6, shade(C(pal.roof), 1.15), MAT.HULL);
    slab(b, -hx + 6, 1.1, hz + 0.1, 0.1, 2.2, 1.0, shade(door, 0.8), MAT.HULL);
    for (const x of [-hx + 1, hx - 1]) b.cylinder(x, 0.4, hz + 0.28, 0.07, 0.07, wallH, C('#60645c'), MAT.HULL, { seg: 5 });
    b.beam([-hx + 2.4, 0.3, hz + 0.3], [-hx + 2.4, wallH + 0.4, hz + 0.3], 0.05, 0.05, C(DARK), MAT.DARK, { caps: false });
    b.beam([-hx + 2.9, 0.3, hz + 0.3], [-hx + 2.9, wallH + 0.4, hz + 0.3], 0.05, 0.05, C(DARK), MAT.DARK, { caps: false });
    slab(b, hx + 0.4, dh + 1.1, dw / 2 - 1, 0.4, 0.25, 0.7, C('#e6dca0'), MAT.EMISSIVE);
  });
}

// ---- the control tower ------------------------------------------------------------------------------------------------------------------------------------------------

function tower(b, P, ruin) {
  const { D, Wd, h, pal } = P;
  const hx = D / 2, hz = Wd / 2, wall = C(pal.trim), dark = C(pal.door), roof = C(pal.roof);
  const baseH = Math.min(7, h * 0.3), shaft = Math.min(1.7, hx * 0.31), cabY = h - 5.0, cab = Math.min(hx * 0.68, 3.8);
  if (ruin) {
    const r = P.rrng, burnt = mix(wall, C(CHAR), 0.55);
    slab(b, 0, -0.5, 0, D + 1, 1.6, Wd + 1, shade(C(pal.conc), 0.82), MAT.CANVAS);
    scorch(b, r, hx, hz, 4, 0.32);
    brokenWall(b, r, -hx, -hz, hx, -hz, 0.6, baseH * 0.9, burnt, 0.2);
    brokenWall(b, r, -hx, hz, hx, hz, 0.6, baseH * 0.8, burnt, 0.2);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.6, baseH * 0.7, burnt, 0.2);
    brokenWall(b, r, hx, -hz, hx, hz, 0.6, baseH * 0.55, burnt, 0.2);
    // the shaft, snapped, lying across the rubble and the cab beside it
    fallen(b, hx * 0.4, 1.3, hz * 1.5, shaft * 2, shaft * 2, h * 0.38, 0.12, 0.2, 0.5, burnt, MAT.CANVAS);
    fallen(b, -hx * 0.5, 1.6, hz * 1.9, cab * 2, 2.4, cab * 2, 0.35, -0.3, 0.2, shade(dark, 0.9), MAT.HULL);
    fallen(b, hx * 1.5, 0.5, -hz * 0.5, cab * 2.4, 0.4, cab * 2.4, 0.2, 0.4, 0.9, shade(roof, 0.5), MAT.HULL);
    bar(b, -shaft, shaft, baseH - 0.5, baseH + 1.5 + P.rrng.range(0, 3), -shaft, shaft, burnt, MAT.CANVAS, { tx0: -shaft * 0.7, tx1: shaft * 0.5, thw: shaft * 0.7 });
    for (let i = 0; i < 4; i++) twisted(b, r, r.range(-1, 1) * hx, r.range(-1, 1) * hz, r.range(3, 7), C(RUST));
    rubble(b, r, hx * 1.4, hz * 1.4, 10, burnt);
    return;
  }
  slab(b, 0, -0.5, 0, D + 1, 1.6, Wd + 1, C(pal.conc), MAT.CANVAS);
  bar(b, -hx, hx, 0.3, baseH, -hz, hz, wall, MAT.CANVAS);
  windowsX(b, -hx + 1.8, hx - 1.5, 2.4, baseH * 0.62, 1.3, 1.5, [-(hz + 0.04), hz + 0.04]);
  for (const sx of [-1, 1]) for (const y of [baseH * 0.62]) for (let z = -hz + 1.8; z < hz - 1.2; z += 2.4) slab(b, sx * (hx + 0.04), y, z, 0.08, 1.3, 1.5, C(GLASS), MAT.GLASS);
  slab(b, 0, baseH + 0.15, 0, D + 0.8, 0.35, Wd + 0.8, shade(wall, 0.85), MAT.CANVAS);
  bar(b, -shaft, shaft, baseH, cabY, -shaft, shaft, wall, MAT.CANVAS);
  for (let y = baseH + 2; y < cabY - 1; y += 4.2) slab(b, shaft + 0.04, y, 0, 0.08, 1.1, 0.9, C(GLASS), MAT.GLASS);
  // the cab: a deck with a rail all round, the glass, a thin roof that overhangs, the mast
  slab(b, 0, cabY - 0.2, 0, cab * 2 + 2.2, 0.4, cab * 2 + 2.2, shade(wall, 0.8), MAT.CANVAS);
  slab(b, 0, cabY + 1.3, 0, cab * 2, 2.6, cab * 2, C(GLASS), MAT.GLASS);
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) slab(b, sx * cab, cabY + 1.3, sz * cab, 0.28, 2.7, 0.28, dark, MAT.HULL);
  for (const o of [-0.5, 0.5]) { slab(b, o * cab, cabY + 1.3, cab, 0.14, 2.7, 0.14, dark, MAT.HULL); slab(b, o * cab, cabY + 1.3, -cab, 0.14, 2.7, 0.14, dark, MAT.HULL); slab(b, cab, cabY + 1.3, o * cab, 0.14, 2.7, 0.14, dark, MAT.HULL); slab(b, -cab, cabY + 1.3, o * cab, 0.14, 2.7, 0.14, dark, MAT.HULL); }
  slab(b, 0, cabY + 2.85, 0, cab * 2 + 1.4, 0.4, cab * 2 + 1.4, roof, MAT.HULL);
  mast(b, -cab * 0.4, cabY + 3.05, cab * 0.3, 5.5, pal.trim);
  flagStaff(b, cab * 0.5, cabY + 3.05, -cab * 0.6, 4.2, 2.6);
  b.cylinder(cab * 0.5, cabY + 3.05, cab * 0.6, 0.35, 0.35, cabY + 3.5, dark, MAT.HULL, { seg: 6 });
  b.group('fine', () => {
    roofRail(b, 0, cabY, 0, cab + 1.0, cab + 1.0, C(pal.trim), { h: 0.95 });
    roofRail(b, 0, baseH + 0.3, 0, hx + 0.3, hz + 0.3, C(pal.trim), { h: 0.8 });
    slab(b, 0, 1.2, hz + 0.05, 1.3, 2.2, 0.1, shade(dark, 0.8), MAT.HULL);
    for (let y = 0.5; y < cabY; y += 0.5) b.beam([-shaft - 0.05, y, shaft * 0.5], [-shaft - 0.05, y, shaft * 0.5 + 0.0], 0.02, 0.02, C(DARK), MAT.DARK, { caps: false });
    b.beam([shaft + 0.08, baseH + 0.3, shaft * 0.6], [shaft + 0.08, cabY - 0.3, shaft * 0.6], 0.05, 0.05, C(DARK), MAT.DARK, { caps: false });
    b.beam([shaft + 0.08, baseH + 0.3, -shaft * 0.6], [shaft + 0.08, cabY - 0.3, -shaft * 0.6], 0.05, 0.05, C(DARK), MAT.DARK, { caps: false });
    for (let y = baseH + 0.6; y < cabY - 0.4; y += 0.55) b.beam([shaft + 0.08, y, -shaft * 0.6], [shaft + 0.08, y, shaft * 0.6], 0.03, 0.03, C(DARK), MAT.DARK, { caps: false });
    slab(b, cab * 0.9, cabY + 0.9, cab + 0.12, 0.5, 0.3, 0.2, C('#e6dca0'), MAT.EMISSIVE);
    b.cylinder(-cab * 0.5, cabY + 2.7, -cab * 0.5, 0.25, 0.2, cabY + 3.4, shade(roof, 1.1), MAT.HULL, { seg: 8 });
  });
}

// ---- the fuel tank ---------------------------------------------------------------------------------------------------------------------------------------------------------

function tank(b, P, ruin) {
  const { D, h, pal } = P, r = D / 2, col = C(pal.tank), conc = C(pal.conc);
  const bundIn = r + 0.9, bundOut = r + 1.7;
  if (ruin) {
    const rr = P.rrng;
    disc(b, 0, 0.05, 0, bundIn - 0.2, shade(C(CHAR), 0.75), MAT.CANVAS, { salt: 3 }, 20);
    disc(b, rr.range(-1, 1), 0.07, rr.range(-1, 1), r * 0.8, C('#0c0b0a'), MAT.CANVAS, { salt: 9 }, 14);
    ringWall(b, bundIn, bundOut, 1.0, conc, shade(conc, 0.6));
    raggedRing(b, rr, r, h * 0.36, shade(mix(col, C(RUST), 0.5), 0.8));
    // the roof, fallen in and leaning against the wall
    b.push().translate(r * 0.1, 1.0, -r * 0.1).rotateX(0.3).rotateZ(0.16);
    b.cyl(0, 0, 0, r * 0.95, r * 0.95, r * 0.9, r * 0.9, 0.35, shade(col, 0.55), MAT.HULL, { seg: 18 });
    b.pop();
    for (let i = 0; i < 5; i++) fallen(b, rr.range(-1, 1) * r, rr.range(0.3, 1.2), rr.range(-1, 1) * r, rr.range(2, 5), 0.1, rr.range(1.5, 3), rr.range(-0.6, 0.6), rr.range(-0.6, 0.6), rr.range(0, PI), shade(col, 0.45), MAT.HULL);
    for (let i = 0; i < 2; i++) twisted(b, rr, rr.range(-1, 1) * r * 0.8, rr.range(-1, 1) * r * 0.8, rr.range(2.5, 5), C(RUST));
    return;
  }
  // the bund: a low wall round the tank over a floor of gravel
  disc(b, 0, 0.04, 0, bundIn, C('#6f6b5f'), MAT.CANVAS, null, 24);
  ringWall(b, bundIn, bundOut, 1.0, conc, shade(conc, 0.85));
  b.cyl(0, 0, 0, r + 0.25, r + 0.25, r + 0.25, r + 0.25, 0.55, shade(conc, 0.8), MAT.CANVAS, { seg: 24, capTop: true });
  b.cyl(0, 0.5, 0, r, r, r, r, h, col, MAT.HULL, { seg: 26, capTop: false });
  for (const f of [0.34, 0.67]) b.cyl(0, h * f, 0, r * 1.008, r * 1.008, r * 1.008, r * 1.008, h * f + 0.22, shade(col, 0.82), MAT.HULL, { seg: 26, capTop: false });
  b.cyl(0, h - 0.25, 0, r * 1.02, r * 1.02, r * 1.02, r * 1.02, h, shade(col, 0.7), MAT.HULL, { seg: 26, capTop: false });
  b.cyl(0, h, 0, r * 1.02, r * 1.02, r * 0.1, r * 0.1, h + r * 0.12, shade(col, 1.05), MAT.HULL, { seg: 26, topCol: shade(col, 0.9) });
  b.cylinder(0, h + r * 0.12, 0, 0.5, 0.45, h + r * 0.12 + 0.8, shade(col, 0.7), MAT.HULL, { seg: 8 });
  b.group('fine', () => {
    // a stair that winds round the shell, a rail round the roof and the pipework at the foot
    const n = 22, pts = [];
    for (let i = 0; i <= n; i++) { const a = 0.4 + i / n * PI * 1.55; pts.push([Math.cos(a) * (r + 0.55), 0.6 + (h - 0.3) * i / n, Math.sin(a) * (r + 0.55)]); }
    for (let i = 0; i < n; i++) {
      b.beam(pts[i], pts[i + 1], 0.55, 0.12, C('#4b4e50'), MAT.HULL);
      b.beam([pts[i][0], pts[i][1] + 1.0, pts[i][2]], [pts[i + 1][0], pts[i + 1][1] + 1.0, pts[i + 1][2]], 0.06, 0.06, C('#3a3c3d'), MAT.HULL);
    }
    const a0 = 0.4 + PI * 1.55;
    b.beam([Math.cos(a0) * (r + 0.55), h, Math.sin(a0) * (r + 0.55)], [Math.cos(a0) * r * 0.5, h + r * 0.06, Math.sin(a0) * r * 0.5], 0.5, 0.1, C('#4b4e50'), MAT.HULL);
    b.beam([r - 0.2, 1.1, 0], [r + 5, 1.1, 0.2], 0.45, 0.45, C('#2c2e30'), MAT.HULL);
    slab(b, r + 5.4, 0.9, 0.2, 1.1, 1.6, 1.3, C('#555a56'), MAT.HULL);
    b.cylinder(r + 3.2, 1.3, 0.2, 0.28, 0.28, 2.2, C('#7a2a22'), MAT.HULL, { seg: 8 });
    b.cylinder(0, h + r * 0.12 + 0.8, 0, 0.7, 0.7, h + r * 0.12 + 1.0, shade(col, 0.6), MAT.HULL, { seg: 8 });
  });
}

/** A round wall between two radii. */
function ringWall(b, r0, r1, hgt, col, topCol) {
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * PI * 2, a1 = (i + 1) / n * PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad([r1 * c0, -0.3, r1 * s0], [r1 * c1, -0.3, r1 * s1], [r1 * c1, hgt, r1 * s1], [r1 * c0, hgt, r1 * s0], col, MAT.CANVAS, [0, hgt / 2, 0], 1);
    b.quad([r0 * c0, 0, r0 * s0], [r0 * c1, 0, r0 * s1], [r0 * c1, hgt, r0 * s1], [r0 * c0, hgt, r0 * s0], shade(col, 0.8), MAT.CANVAS, [r1 * 2 * Math.cos((a0 + a1) / 2), hgt / 2, r1 * 2 * Math.sin((a0 + a1) / 2)], 0.8);
    b.quad([r0 * c0, hgt, r0 * s0], [r0 * c1, hgt, r0 * s1], [r1 * c1, hgt, r1 * s1], [r1 * c0, hgt, r1 * s0], topCol, MAT.CANVAS, [0, -1, 0], 1);
  }
}

// ---- barracks ------------------------------------------------------------------------------------------------------------------------------------------------------------------

function barracks(b, P, ruin) {
  const { D, Wd, h, pal } = P, hx = D / 2, hz = Wd / 2, wallH = h * 0.56, wall = C(pal.hut), roof = C(pal.hutRoof), trim = C(pal.trim);
  if (ruin) {
    const r = P.rrng, burnt = mix(wall, C(CHAR), 0.62);
    slab(b, 0, -0.2, 0, D + 0.6, 0.8, Wd + 0.6, shade(C(pal.conc), 0.8), MAT.CANVAS);
    scorch(b, r, hx, hz, 4, 0.22);
    brokenWall(b, r, -hx, -hz, hx, -hz, 0.3, wallH * 0.75, burnt, 0.1);
    brokenWall(b, r, -hx, hz, hx * 0.3, hz, 0.3, wallH * 0.7, burnt, 0.1);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.3, wallH * 0.6, burnt, 0.1);
    bar(b, hx - 4.6, hx - 3.9, 0, h + 1.4, -0.35, 0.35, shade(C(pal.conc), 0.7), MAT.CANVAS, { tx0: hx - 4.5, tx1: hx - 4.0, thw: 0.28 });
    fallen(b, -hx * 0.3, 0.9, -hz * 0.3, D * 0.4, 0.14, Wd * 0.55, 0.0, 0.5, 0.0, shade(roof, 0.55), MAT.HULL);
    fallen(b, hx * 0.25, 0.7, hz * 0.2, D * 0.3, 0.14, Wd * 0.5, 0.25, -0.4, 0.2, shade(roof, 0.45), MAT.HULL);
    for (let i = 0; i < 5; i++) fallen(b, r.range(-1, 1) * hx * 0.8, r.range(0.2, 0.7), r.range(-1, 1) * hz * 0.8, r.range(2, 5), 0.2, 0.2, r.range(-0.3, 0.3), r.range(-0.4, 0.4), r.range(0, PI), shade(C(CHAR), 1.6), MAT.CANVAS);
    rubble(b, r, hx * 0.9, hz * 0.9, 8, burnt);
    return;
  }
  slab(b, 0, -0.2, 0, D + 0.6, 0.8, Wd + 0.6, C(pal.conc), MAT.CANVAS);
  bar(b, -hx, hx, 0.2, wallH, -hz, hz, wall, MAT.HULL, { top: false });
  bar(b, -hx - 0.45, hx + 0.45, wallH, h, -hz - 0.6, hz + 0.6, roof, MAT.HULL, { tx0: -hx - 0.45, tx1: hx + 0.45, thw: 0.1 });
  for (const sx of [-1, 1]) bar(b, sx * (hx + 0.01), sx * (hx + 0.1), wallH, h - 0.35, -hz, hz, wall, MAT.HULL, { tx0: sx * (hx + 0.01), tx1: sx * (hx + 0.1), thw: 0.08 });
  windowsX(b, -hx + 2.4, hx - 2.2, 3.4, wallH * 0.58, 1.0, 1.1, [-(hz + 0.04), hz + 0.04]);
  for (const sx of [-1, 1]) slab(b, sx * (hx + 0.04), wallH * 0.55, 0, 0.08, 1.0, 1.1, C(GLASS), MAT.GLASS);
  slab(b, -hx + 2.2, 1.05, hz + 0.06, 1.0, 1.9, 0.1, shade(wall, 0.6), MAT.HULL);
  slab(b, -hx + 2.2, 0.15, hz + 1.0, 2.0, 0.3, 1.6, C(pal.conc), MAT.CANVAS);
  slab(b, -hx + 2.2, 2.25, hz + 0.9, 2.3, 0.14, 1.9, shade(roof, 0.9), MAT.HULL);
  bar(b, hx - 4.6, hx - 3.9, h - 1.0, h + 1.4, -0.35, 0.35, shade(C(pal.conc), 0.8), MAT.CANVAS);
  b.group('fine', () => {
    for (let x = -hx + 3.5; x < hx - 2; x += 6.8) slab(b, x, wallH * 0.58, hz + 0.1, 0.12, 1.1, 0.06, C(DARK), MAT.HULL);
    b.cylinder(hx - 4.25, h + 1.4, 0, 0.45, 0.4, h + 1.55, shade(C(pal.conc), 0.6), MAT.CANVAS, { seg: 6 });
    b.cylinder(-hx + 0.5, 0.2, hz + 0.9, 0.4, 0.4, 1.1, C('#4a4f4c'), MAT.HULL, { seg: 8 });
    slab(b, hx - 6.5, 0.75, hz + 0.5, 1.8, 0.1, 0.5, shade(wall, 0.7), MAT.HULL);
    for (const x of [hx - 7.3, hx - 5.7]) slab(b, x, 0.4, hz + 0.5, 0.1, 0.8, 0.4, shade(wall, 0.7), MAT.HULL);
    slab(b, hx * 0.1, wallH + 0.15, hz + 0.65, hx * 1.4, 0.1, 0.1, shade(roof, 0.6), MAT.HULL);
  });
}

// ---- the radar ----------------------------------------------------------------------------------------------------------------------------------------------------------------

function radar(b, P, ruin) {
  const { D, Wd, h, pal, rng } = P, hx = D / 2, hz = Wd / 2, s = D / 8, steel = C('#7d8279'), dark = C('#3c4040');
  const topY = h - 3.4 * s, lo = hx * 0.5, hi = hx * 0.24;
  if (ruin) {
    const r = P.rrng;
    scorch(b, r, hx * 1.2, hz * 1.2, 3, 0.07);
    bar(b, -hx * 0.2, hx * 1.0, 0, 1.0, -hz * 0.95, hz * 0.2, shade(C(pal.wall), 0.4), MAT.CANVAS, { tx1: hx * 0.85, thw: hz * 0.3 });
    // legs, lying and bent
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, PI * 2), len = topY * r.range(0.5, 0.95), x0 = r.range(-1, 1) * lo * 0.5, z0 = r.range(-1, 1) * lo * 0.5;
      b.beam([x0, 0.3, z0], [x0 + Math.cos(a) * len, 0.5 + r.range(0, 1.5), z0 + Math.sin(a) * len], 0.2, 0.2, shade(steel, 0.65), MAT.HULL);
    }
    for (let i = 0; i < 2; i++) twisted(b, r, r.range(-1, 1) * lo * 0.6, r.range(-1, 1) * lo * 0.6, topY * r.range(0.3, 0.55), shade(steel, 0.6));
    fallen(b, hx * 0.6, 0.5, -hz * 0.9, 6 * s, 0.3, 3 * s, 0.3, 0.4, 0.4, shade(steel, 0.5), MAT.HULL);
    for (let i = 0; i < 6; i++) b.beam([hx * 0.6 - 3 * s, 0.7 + i * 0.1, -hz * 0.9 - 1.4 * s + i * 0.55 * s], [hx * 0.6 + 3 * s, 0.9 + i * 0.1, -hz * 0.9 - 1.4 * s + i * 0.55 * s], 0.1, 0.1, shade(steel, 0.55), MAT.HULL, { caps: false });
    rubble(b, r, hx, hz, 5, C(CHAR));
    return;
  }
  // the equipment hut and the foundations of the tower
  slab(b, 0, -0.3, 0, lo * 2 + 1.4, 1.0, lo * 2 + 1.4, C(pal.conc), MAT.CANVAS);
  bar(b, hx * 0.25, hx * 1.0, 0.2, 2.9, hz * 0.2, hz * 1.0, C(pal.wall), MAT.HULL, { top: false });
  bar(b, hx * 0.2, hx * 1.05, 2.9, 3.3, hz * 0.15, hz * 1.05, C(pal.roof), MAT.HULL);
  // the lattice tower: four legs closing in towards the top, braced every few metres
  const levels = [0.0, 0.25, 0.5, 0.75, 1.0], at = (f) => lo + (hi - lo) * f;
  const leg = (sx, sz, f) => [sx * at(f), 0.2 + (topY - 0.2) * f, sz * at(f)];
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) b.beam(leg(sx, sz, 0), leg(sx, sz, 1), 0.34, 0.34, steel, MAT.HULL);
  for (let i = 0; i + 1 < levels.length; i++) {
    for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      b.beam(leg(a[0], a[1], levels[i]), leg(c[0], c[1], levels[i + 1]), 0.1, 0.1, dark, MAT.HULL, { caps: false });
      b.beam(leg(c[0], c[1], levels[i]), leg(a[0], a[1], levels[i + 1]), 0.1, 0.1, dark, MAT.HULL, { caps: false });
    }
    if (i > 0) for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) b.beam(leg(a[0], a[1], levels[i]), leg(c[0], c[1], levels[i]), 0.12, 0.12, dark, MAT.HULL, { caps: false });
  }
  slab(b, 0, topY, 0, hi * 2 + 1.2, 0.3, hi * 2 + 1.2, shade(steel, 0.8), MAT.HULL);
  b.group('fine', () => {
    roofRail(b, 0, topY + 0.15, 0, hi + 0.5, hi + 0.5, steel, { h: 0.8 });
    b.beam([lo * 0.6, 0.3, lo], [lo * 0.6, 2.8, lo], 0.04, 0.04, C(DARK), MAT.DARK, { caps: false });
    slab(b, hx * 0.62, 1.4, hz * 1.0 + 0.04, 1.0, 1.9, 0.08, shade(C(pal.door), 0.8), MAT.HULL);
    b.beam([hx * 0.4, 3.3, hz * 0.3], [hi, topY, hi * 0.5], 0.05, 0.05, C(DARK), MAT.DARK, { caps: false });
  });
  // the antenna: a turntable with the array of dipoles on a frame, built round the axis x = z = 0
  b.group('spin', () => {
    const ay = topY + 0.3, aw = 6.4 * s, ah = 3.6 * s, ax = -0.3 * s;
    b.cylinder(0, ay, 0, 0.7 * s, 0.8 * s, ay + 0.7, dark, MAT.HULL, { seg: 10 });
    slab(b, -1.2 * s, ay + 0.7 + 0.5, 0, 1.6 * s, 1.0, 1.6 * s, shade(steel, 0.9), MAT.HULL);
    for (const sz of [-1, 1]) b.beam([ax, ay + 0.7, sz * aw / 2], [ax, ay + 0.7 + ah, sz * aw / 2], 0.2, 0.2, steel, MAT.HULL);
    for (const sy of [0, 1]) b.beam([ax, ay + 0.7 + sy * ah, -aw / 2], [ax, ay + 0.7 + sy * ah, aw / 2], 0.2, 0.2, steel, MAT.HULL);
    for (let i = 1; i < 5; i++) b.beam([ax, ay + 0.7 + ah * i / 5, -aw / 2], [ax, ay + 0.7 + ah * i / 5, aw / 2], 0.1, 0.1, steel, MAT.HULL, { caps: false });
    for (let i = 1; i < 8; i++) b.beam([ax, ay + 0.7, -aw / 2 + aw * i / 8], [ax, ay + 0.7 + ah, -aw / 2 + aw * i / 8], 0.07, 0.07, dark, MAT.HULL, { caps: false });
    bar(b, ax - 0.9 * s, ax - 0.5 * s, ay + 0.9, ay + ah * 0.9, -aw / 2 + 0.2, aw / 2 - 0.2, shade(steel, 0.75), MAT.HULL);
  });
}

// ---- the earth-covered magazine and the bunkers -------------------------------------------------------------------------------------------------------------

function depot(b, P, ruin) {
  const { D, Wd, h, pal } = P, hx = D / 2, hz = Wd / 2, conc = C(pal.conc), earth = C(pal.earth), top = shade(earth, 1.18);
  const mound = (k, y0, y1, c0, c1) => b.cyl(-0.6, y0, 0, (hx - 0.6) * k, hz * k * 0.97, (hx - 0.6) * k * 0.82, hz * k * 0.8, y1, c0, MAT.TERRAIN, { seg: 18, capTop: false, topCol: c1 });
  if (ruin) {
    const r = P.rrng, burnt = mix(earth, C(CHAR), 0.5);
    b.cyl(-0.6, -0.3, 0, (hx - 0.6) * 1.05, hz * 1.0, (hx - 0.6) * 0.8, hz * 0.7, h * 0.5, burnt, MAT.TERRAIN, { seg: 18, capTop: false });
    disc(b, -hx * 0.2, h * 0.5 + 0.02, 0, hz * 0.55, C('#0e0d0c'), MAT.CANVAS, { salt: 5 }, 14, hz * 0.5);
    scorch(b, r, hx * 1.2, hz * 1.2, 3, 0.05);
    brokenWall(b, r, hx - 1.2, -hz * 0.8, hx - 1.2, hz * 0.8, 1.0, h * 0.6, shade(conc, 0.55), -0.2);
    for (let i = 0; i < 5; i++) fallen(b, r.range(-0.2, 1.3) * hx, r.range(0.4, 1.1), r.range(-1, 1) * hz * 1.2, r.range(1.5, 3.5), 0.7, r.range(1.2, 3), r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(0, PI), shade(conc, 0.5), MAT.CANVAS);
    rubble(b, r, hx * 1.1, hz * 1.3, 8, burnt);
    return;
  }
  slab(b, hx - 0.4, -0.4, 0, 3.4, 1.0, hz * 2 * 0.86, shade(conc, 0.85), MAT.CANVAS);
  mound(1.0, -0.3, h * 0.6, mix(earth, C('#6b6648'), 0.35), earth);
  b.cyl(-0.6, h * 0.58, 0, (hx - 0.6) * 0.82, hz * 0.8, (hx - 0.6) * 0.55, hz * 0.52, h, earth, MAT.TERRAIN, { seg: 18, capTop: true, topCol: top });
  // the concrete face and its blast door, between two angled wing walls
  bar(b, hx - 1.4, hx, -0.3, h * 0.78, -hz * 0.8, hz * 0.8, conc, MAT.CANVAS);
  slab(b, hx + 0.02, 1.5, 0, 0.14, 3.0, 3.0, C('#0a0b0c'), MAT.DARK);
  slab(b, hx + 0.12, 1.5, 0, 0.18, 2.8, 2.9, shade(C(pal.door), 0.9), MAT.HULL);
  for (const sz of [-1, 1]) { b.push().translate(hx - 0.8, 0, sz * hz * 0.8).rotateY(sz * 0.5); bar(b, -1.6, 0.4, -0.3, h * 0.6, -0.4, 0.4, shade(conc, 0.9), MAT.CANVAS); b.pop(); }
  slab(b, hx - 0.6, h * 0.78 + 0.2, 0, 1.8, 0.4, hz * 1.7, shade(conc, 1.1), MAT.CANVAS);
  b.group('fine', () => {
    for (const z of [-hz * 0.4, hz * 0.4]) b.cylinder(-hx * 0.2, h * 0.9, z, 0.25, 0.25, h * 0.9 + 1.0, C('#4f5350'), MAT.HULL, { seg: 6 });
    slab(b, hx + 0.3, 0.2, 0, 1.6, 0.4, 3.4, shade(conc, 1.0), MAT.CANVAS);
    slab(b, hx - 0.2, 3.2, 0, 0.3, 0.2, 3.8, shade(conc, 0.8), MAT.CANVAS);
    slab(b, hx + 0.3, 3.3, 1.8, 0.3, 0.3, 0.3, C('#e6dca0'), MAT.EMISSIVE);
  });
}

// ---- the fire-control post of a battery -------------------------------------------------------------------------------------------------------------------

function post(b, P, ruin) {
  const { D, Wd, h, pal } = P, hx = D / 2, hz = Wd / 2, conc = C(pal.conc), dark = C(pal.door), paint = C(pal.wall);
  const lowH = h * 0.42, cabY0 = h * 0.78, tw = Math.min(hz * 0.5, 2.6);
  if (ruin) {
    const r = P.rrng, burnt = mix(conc, C(CHAR), 0.5);
    slab(b, 0, -0.4, 0, D + 1, 1.0, Wd + 1, shade(conc, 0.78), MAT.CANVAS);
    scorch(b, r, hx, hz, 4, 0.2);
    brokenWall(b, r, -hx, -hz, hx, -hz, 0.8, lowH * 0.9, burnt, 0.1);
    brokenWall(b, r, -hx, hz, hx, hz, 0.8, lowH * 0.8, burnt, 0.1);
    brokenWall(b, r, -hx, -hz, -hx, hz, 0.8, lowH * 0.7, burnt, 0.1);
    brokenWall(b, r, hx, -hz, hx, hz * 0.2, 0.8, lowH * 0.6, burnt, 0.1);
    fallen(b, hx * 0.2, 0.9, hz * 0.5, tw * 2.4, 2.2, tw * 2.2, 0.3, -0.35, 0.3, burnt, MAT.CANVAS);
    fallen(b, -hx * 0.4, 0.4, -hz * 0.4, hx * 1.2, 0.5, hz * 1.0, 0.1, 0.25, 0.4, shade(burnt, 0.8), MAT.CANVAS);
    for (let i = 0; i < 4; i++) twisted(b, r, r.range(-1, 1) * hx, r.range(-1, 1) * hz, r.range(3, 6), C(RUST));
    rubble(b, r, hx * 1.1, hz * 1.1, 10, burnt);
    return;
  }
  slab(b, 0, -0.4, 0, D + 1, 1.0, Wd + 1, conc, MAT.CANVAS);
  bar(b, -hx, hx, 0.1, lowH, -hz, hz, paint, MAT.CANVAS, { top: false });
  slab(b, 0, lowH + 0.2, 0, D + 0.6, 0.4, Wd + 0.6, shade(conc, 1.1), MAT.CANVAS);
  // observation slits along the front, the tower and the cabin with its slit
  for (let z = -hz + 1.6; z < hz - 1; z += 2.4) slab(b, hx + 0.03, lowH * 0.58, z, 0.08, 0.5, 1.4, C('#050607'), MAT.DARK);
  bar(b, -hx * 0.3, hx * 0.5, lowH + 0.4, cabY0, -tw, tw, paint, MAT.CANVAS);
  bar(b, -hx * 0.45, hx * 0.7, cabY0, h - 0.8, -tw * 1.5, tw * 1.5, shade(paint, 0.95), MAT.CANVAS, { top: false });
  slab(b, hx * 0.125, h - 0.55, 0, hx * 1.15 + 1.0, 0.5, tw * 3 + 0.9, shade(conc, 1.15), MAT.CANVAS);
  slab(b, hx * 0.7 + 0.03, (cabY0 + h - 0.8) / 2, 0, 0.08, 0.8, tw * 2.6, C('#050607'), MAT.DARK);
  // the rangefinder on the roof: a tube across with a hood at each end, and the mast
  b.rodZ(hx * 0.1, h + 0.55, -tw * 2.3, tw * 2.3, 0.2, 0.2, shade(dark, 1.2), MAT.HULL, { seg: 8 });
  for (const sz of [-1, 1]) b.cyl(hx * 0.1, h + 0.25, sz * tw * 2.0, 0.45, 0.4, 0.4, 0.35, h + 0.95, dark, MAT.HULL, { seg: 8 });
  b.cylinder(hx * 0.1, h - 0.3, 0, 0.55, 0.5, h + 0.4, dark, MAT.HULL, { seg: 8 });
  mast(b, -hx * 0.35, h - 0.3, tw * 0.9, 5.0, pal.trim);
  b.group('fine', () => {
    slab(b, hx + 0.04, 0.95, -hz * 0.55, 0.12, 1.8, 1.0, shade(dark, 0.8), MAT.HULL);
    roofRail(b, 0, lowH + 0.4, 0, hx - 0.4, hz - 0.4, C(pal.trim), { h: 0.7 });
    sandbags(b, hx + 0.9, -hz - 0.2, hx + 0.9, hz + 0.2, 0, 2, C('#7a7556'), 0.55);
    for (const sz of [-1, 1]) slab(b, hx * 0.7 + 0.03, (cabY0 + h - 0.8) / 2 - 0.55, sz * tw * 1.4, 0.06, 0.12, tw * 0.5, shade(conc, 0.7), MAT.CANVAS);
  });
}

// ---- entry point ------------------------------------------------------------------------------------------------------------------------------------------------------------------

const BUILDERS = { hangar, tower, tank, barracks, radar, depot, bunker: depot, post };

/** The meshes of one building. Returns the packed mesh ({ vertices, indices, ..., groups: { body, body_ruin, fine?, spin? } }) and { spin } for what turns. */
export function buildPartMesh(kind, P) {
  const fn = BUILDERS[kind] || barracks;
  const b = new MeshBuilder();
  P.rrng = makeRng(P.seed * 7 + 3);
  P.rng = makeRng(P.seed * 13 + 1);
  b.group('body', () => fn(b, P, false));
  b.group('body_ruin', () => fn(b, P, true));
  const out = b.build();
  const spin = out.groups.spin ? { x: 0, y: 0, z: 0, rate: kind === 'radar' ? 0.9 : 0 } : null;
  return { mesh: out, spin };
}
