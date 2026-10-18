// Articulated gun mounts. Every mount produces two meshes that are drawn as separate instances so
// they can move independently:
//   house : the rotating gun house / shield / platform (origin = vertical training axis at deck level)
//   guns  : the barrels (origin = trunnion, barrels along +x, elevate about the z axis, recoil along x)
//
// Most mounts are built from the calibre (generic families). The main guns of the reference ships have their own
// families, drawn after photographs (see tools/refs in the repository notes): the US Mk 7 16"/50 triple turret, the
// Japanese Type 94 46 cm triple, the German Drh LC/34 38 cm twin and the US 5"/38 twin (Mk 28) and single (Mk 30) mounts.
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';

const cache = new Map();

// ---- dimensions of the named families (metres; house frame: x forward, y up, origin at the training axis) -----------------
//   trunX, trunY : trunnion position        face : front of the gun house (where the barrels leave it)
//   fwd          : trunnion -> muzzle       back : how far the breech reaches behind the trunnion (hidden in the house)
//   rB / rP / rM : barrel radius at the breech / at the gun port / at the muzzle      bagR, bagLen: canvas blast bag
//   lift         : height of a superfiring mount's training axis above the one in front of it
//   barb         : height of the barbette above the deck under a mount on the lowest level     port: x of the gun ports when the face is sloped
const FAMILY = {
  // Iowa class plans (profile and plan view) and NH 44538 (crew at the rails for scale): a long, low gun house, 15.4 x 12.4 m and
  // 3.4 m high, the gun axis 1.6 m above its base, barrels 12.4 m clear of the face, turret 2 three metres above turret 1
  mk7: { kind: 'turret', cal: 406, n: 3, spacing: 3.05, trunX: 3.4, trunY: 1.6, face: 6.4, port: 5.6, fwd: 15.4, back: 2.8, rB: 0.62, rP: 0.52, rM: 0.31, bagR: 0.95, bagLen: 1.2, recoil: 1.2, lift: 3.0, h: 3.4, barbR: 6.0, barb: 0.35 },
  // Yamato 1945 profile and plan (Commons, Alexpl, after the Kure museum photographs; heights scaled to the builders' freeboards):
  // 18.5 m long, 14.4 m wide without the rangefinder arms, 4.3 m high, barrels 13.3 m clear of the ports, turret 2 3.5 m above turret 1
  type94: { kind: 'turret', cal: 460, n: 3, spacing: 3.52, trunX: 3.6, trunY: 1.9, face: 7.6, port: 6.4, fwd: 16.1, back: 2.9, rB: 0.70, rP: 0.60, rM: 0.35, bagR: 1.05, bagLen: 1.3, recoil: 1.3, lift: 3.5, h: 4.3, barbR: 6.6, barb: 0.3, whiteMuzzle: true },
  // Yamato's 15.5 cm/60 triple (ex-Mogami): 8.6 m long, 3.1 m high, barrels 5.9 m clear of the face, on a 6.6-7.1 m barbette
  type3_155: { kind: 'turret', cal: 155, n: 3, spacing: 1.7, trunX: 1.2, trunY: 1.3, face: 3.6, port: 3.2, fwd: 8.3, back: 1.2, rB: 0.26, rP: 0.2, rM: 0.11, bagR: 0.33, bagLen: 0.5, recoil: 0.6, lift: 2.6, h: 3.1, barbR: 3.0 },
  drh34: { kind: 'turret', cal: 380, n: 2, spacing: 4.6, trunX: 2.8, trunY: 2.3, face: 6.1, fwd: 13.3, back: 2.6, rB: 0.58, rP: 0.49, rM: 0.29, bagR: 0.9, bagLen: 1.2, recoil: 1.15, lift: 4.2, h: 4.9, barbR: 5.3 },
  mk28: { kind: 'dp', cal: 127, n: 2, spacing: 0.78, trunX: 0.55, trunY: 1.35, face: 1.9, fwd: 3.6, back: 0.9, rB: 0.19, rP: 0.15, rM: 0.085, bagR: 0.3, bagLen: 0.3, recoil: 0.5, lift: 3.0, h: 2.9 },
  mk30: { kind: 'shield', cal: 127, n: 1, spacing: 0, trunX: 0.5, trunY: 1.3, face: 1.5, fwd: 3.4, back: 0.9, rB: 0.19, rP: 0.15, rM: 0.085, bagR: 0.0, bagLen: 0, recoil: 0.5, lift: 2.4, h: 2.5 },
};

/** Numbers of a mount without building it: { trunnion, muzzle (trunnion -> muzzle), spacing, recoil, lift, height } */
export function mountDims(s) {
  const f = s.variant && FAMILY[s.variant];
  if (f) return { trunnion: [f.trunX, f.trunY], muzzle: f.fwd, spacing: f.spacing, recoil: f.recoil, lift: f.lift, height: f.h, barbR: f.barbR || 0, barb: f.barb };
  const calM = s.cal / 1000, n = s.n;
  const barrelLen = (s.bore || 45) * calM;
  if (s.kind === 'aa') return { trunnion: [0, 1.2], muzzle: aaLen(s), spacing: 0.3, recoil: 0.05, lift: 0, height: 2, barbR: 0 };
  const spacing = Math.max(0.5, calM * (n >= 3 ? 6.6 : 5.6));
  const len = Math.max(2.2, calM * 26);
  const h = 1.5 + calM * 5.0;
  let trunX = 0, trunY = 0;
  if (s.kind === 'turret') { trunX = len * 0.36 - len * 0.2; trunY = h * 0.22 + calM * 1.2; }
  else if (s.kind === 'dp') { const L2 = Math.max(len * 0.9, 2.2); trunX = L2 * 0.38; trunY = h * 0.25 + calM * 0.8; }
  else { trunX = 0.1; trunY = h * 0.55; }
  return { trunnion: [trunX, trunY], muzzle: barrelLen, spacing: n >= 2 ? spacing : 0, recoil: Math.min(0.9, calM * 2.2), lift: h * 0.9 + 0.4, height: h, barbR: 0 };
}

function aaLen(s) {
  const v = s.variant || 'bofors';
  return v === 'oerlikon' ? 1.1 : v === 'iijn25' ? 1.2 : 2.1;
}

export function getMountModel(spec) {
  const key = [spec.kind, spec.cal, spec.n, spec.bore, spec.col, spec.variant || ''].join('|');
  let m = cache.get(key);
  if (!m) { m = makeMount(spec); cache.set(key, m); }
  return m;
}

// ---- barrels -----------------------------------------------------------------------------------------------------
/**
 * One gun tube in the barrel frame (origin = trunnion, +x towards the muzzle): breech block and slide, jacket inside the
 * house, canvas blast bag at the gun port, the tube tapering to the muzzle and the muzzle ring.
 */
function tube(gb, z, f, col, dark, muzCol) {
  const canvas = rgb('#46483f');
  gb.rod(-f.back, 0, 0, z, f.rB * 1.08, f.rB, shade(col, 0.8), MAT.HULL, { seg: 12 });
  const port = (f.port ?? f.face) - f.trunX;
  gb.rod(0, port, 0, z, f.rB, f.rP * 1.12, dark, MAT.DARK, { seg: 12 });
  if (f.bagLen > 0) gb.rod(port - 0.25, port + f.bagLen, 0, z, f.bagR, f.rP * 1.2, canvas, MAT.CANVAS, { seg: 12 });
  const x0 = port;
  gb.rod(x0, x0 + (f.fwd - x0) * 0.5, 0, z, f.rP, f.rM * 1.3, dark, MAT.DARK, { seg: 12 });
  gb.rod(x0 + (f.fwd - x0) * 0.5, f.fwd * 0.955, 0, z, f.rM * 1.3, f.rM, dark, MAT.DARK, { seg: 12 });
  gb.rod(f.fwd * 0.955, f.fwd, 0, z, f.rM * 1.17, f.rM * 1.17, muzCol || dark, MAT.DARK, { seg: 12 });
}

// ---- gun houses of the named families -------------------------------------------------------------------------------
/** US Mk 7 16"/50 triple turret (Iowa class): long and low, vertical side walls, a face plate sloped back over its whole height, flat
 *  roof, the rangefinder ears at the rear corners and a short overhang at the back. */
function houseMk7(hb, col, dark, f) {
  const light = shade(col, 1.1), shadow = shade(col, 0.82);
  hb.cylinder(0, -0.1, 0, 6.15, 6.2, 0.2, shadow, MAT.HULL, { seg: 28 });                                     // rotating skirt over the barbette ring
  hb.block({ x0: -9.0, x1: f.face, hw: 6.2, y0: 0.15, y1: f.h, tx0: -8.8, tx1: 4.6, thw: 6.0 }, col, MAT.HULL);   // walls, sloped face, roof
  hb.block({ x0: -10.1, x1: -8.8, hw: 4.4, y0: 0.6, y1: 2.9, tx0: -9.8, thw: 4.2 }, shade(col, 0.9), MAT.HULL);   // rear overhang
  for (const sg of [-1, 1]) {
    hb.block({ x0: -7.6, x1: -5.2, hw: 0.55, zc: sg * 6.45, y0: 1.7, y1: 3.0, tx0: -7.4, tx1: -5.5, thw: 0.45 }, light, MAT.HULL);   // rangefinder ears
    hb.cylinder(-4.4, f.h - 0.1, sg * 3.4, 0.5, 0.45, f.h + 0.55, shadow, MAT.HULL, { seg: 8 });               // periscope hoods
  }
  hb.box(-2.4, f.h + 0.04, 0, 3.0, 0.1, 2.2, light, MAT.HULL);                                               // hatch / sighting plate
  for (let i = 0; i < f.n; i++) {                                                                              // gun ports in the face plate
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.port - 0.5, x1: f.port + 0.45, hw: 0.9, zc: z, y0: f.trunY - 0.65, y1: f.trunY + 0.65 }, dark, MAT.DARK);
  }
}

/** Japanese Type 94 46 cm triple turret (Yamato class): a huge, squat house with slab sides and a long sloped face, the 15 m
 *  rangefinder across the rear with its arms out beyond the sides. */
function houseType94(hb, col, dark, f) {
  const light = shade(col, 1.1), shadow = shade(col, 0.8);
  hb.cylinder(0, -0.1, 0, 6.6, 6.7, 0.2, shadow, MAT.HULL, { seg: 28 });
  hb.block({ x0: -10.6, x1: f.face, hw: 7.2, y0: 0.15, y1: f.h, tx0: -10.4, tx1: 5.0, thw: 7.0 }, col, MAT.HULL);   // walls, sloped face, roof
  hb.block({ x0: -11.6, x1: -10.4, hw: 5.0, y0: 0.8, y1: 3.4, tx0: -11.3, thw: 4.8 }, shade(col, 0.9), MAT.HULL);   // rear overhang
  hb.rodZ(-8.4, f.h - 0.9, -8.6, 8.6, 0.5, 0.5, shade(col, 0.88), MAT.HULL, { seg: 10 });                          // rangefinder arms
  for (const sg of [-1, 1]) hb.cyl(-8.4, f.h - 1.6, sg * 8.2, 0.8, 0.8, 0.7, 0.7, f.h - 0.2, light, MAT.HULL, { seg: 10 });
  for (const sg of [-1, 1]) hb.cylinder(-4.0, f.h - 0.1, sg * 3.8, 0.55, 0.5, f.h + 0.6, shadow, MAT.HULL, { seg: 8 });
  hb.box(-1.5, f.h + 0.04, 0, 3.4, 0.1, 2.6, light, MAT.HULL);
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.port - 0.55, x1: f.port + 0.45, hw: 1.0, zc: z, y0: f.trunY - 0.75, y1: f.trunY + 0.75 }, dark, MAT.DARK);
  }
}

/** Japanese 15.5 cm/60 triple turret (Yamato's secondary battery): a small copy of the big turrets, sloped face, rangefinder ears aft. */
function houseType3(hb, col, dark, f) {
  const light = shade(col, 1.1), shadow = shade(col, 0.82);
  hb.cylinder(0, -0.05, 0, 2.9, 2.95, 0.12, shadow, MAT.HULL, { seg: 20 });
  hb.block({ x0: -5.0, x1: f.face, hw: 3.3, y0: 0.1, y1: f.h, tx0: -4.8, tx1: 2.4, thw: 3.15 }, col, MAT.HULL);
  for (const sg of [-1, 1]) hb.block({ x0: -3.9, x1: -2.6, hw: 0.35, zc: sg * 3.55, y0: 1.5, y1: 2.5, tx0: -3.8, tx1: -2.8, thw: 0.3 }, light, MAT.HULL);
  for (const sg of [-1, 1]) hb.cylinder(-1.8, f.h - 0.05, sg * 1.6, 0.3, 0.27, f.h + 0.35, shadow, MAT.HULL, { seg: 6 });
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.port - 0.3, x1: f.port + 0.25, hw: 0.42, zc: z, y0: f.trunY - 0.4, y1: f.trunY + 0.4 }, dark, MAT.DARK);
  }
}

/** German Drh LC/34 38 cm twin turret (Bismarck): wide, low, a flat sloped roof, rangefinder housing with end hoods at the rear. */
function houseDrh34(hb, col, dark, f) {
  const mid = shade(col, 0.96), light = shade(col, 1.08), shadow = shade(col, 0.82);
  hb.cylinder(0, -0.15, 0, 5.6, 5.7, 0.6, shadow, MAT.HULL, { seg: 26 });
  hb.block({ x0: -7.4, x1: f.face, hw: 5.2, y0: 0.45, y1: 3.2, tx0: -7.2, tx1: f.face - 0.5, thw: 5.0 }, col, MAT.HULL);
  // the roof slopes down towards the front, its front plate is steep
  hb.block({ x0: -7.2, x1: f.face - 0.5, hw: 5.0, y0: 3.2, y1: f.h, tx0: -6.6, tx1: 3.6, thw: 4.4 }, mid, MAT.HULL);
  hb.block({ x0: -8.8, x1: -7.2, hw: 4.2, y0: 1.0, y1: 4.3, tx0: -8.4, tx1: -7.2, thw: 3.9 }, shade(col, 0.9), MAT.HULL);
  hb.rodZ(-6.4, 4.9, -6.2, 6.2, 0.5, 0.5, shade(col, 0.88), MAT.HULL, { seg: 10 });                            // rangefinder
  for (const sg of [-1, 1]) hb.cyl(-6.4, 4.5, sg * 5.9, 0.85, 0.8, 0.7, 0.68, 5.5, light, MAT.HULL, { seg: 10 });
  hb.cylinder(-3.8, f.h * 0.92, 2.4, 0.5, 0.45, f.h + 0.7, shadow, MAT.HULL, { seg: 8 });
  hb.cylinder(-3.8, f.h * 0.92, -2.4, 0.5, 0.45, f.h + 0.7, shadow, MAT.HULL, { seg: 8 });
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.face - 0.9, x1: f.face - 0.3, hw: 0.9, zc: z, y0: f.trunY - 0.8, y1: f.trunY + 0.8 }, dark, MAT.DARK);
  }
}

/** US 5"/38 twin (Mk 28 / Mk 32): enclosed, rounded gun house with a sloping front plate and a rear bulge. */
function houseMk28(hb, col, dark, f) {
  const mid = shade(col, 0.95), light = shade(col, 1.1);
  const oct = [];
  for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; oct.push([Math.cos(a) * 2.0 - 0.1, Math.sin(a) * 1.95]); }
  hb.prism(oct, 0.15, 1.85, col, MAT.HULL, { topScale: 1.0 });                                                  // house walls
  hb.block({ x0: -2.0, x1: f.face, hw: 1.7, y0: 1.85, y1: f.h, tx0: -1.6, tx1: 0.9, thw: 1.45 }, mid, MAT.HULL);   // sloping roof / front plate
  hb.block({ x0: -2.6, x1: -1.6, hw: 1.2, y0: 0.8, y1: 2.3, tx0: -2.3, tx1: -1.7, thw: 1.0 }, shade(col, 0.9), MAT.HULL);   // rear bulge
  hb.cylinder(-0.7, f.h - 0.05, 0.8, 0.28, 0.26, f.h + 0.3, shade(col, 0.8), MAT.HULL, { seg: 6 });
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.face - 0.45, x1: f.face - 0.1, hw: 0.3, zc: z, y0: f.trunY - 0.3, y1: f.trunY + 0.3 }, dark, MAT.DARK);
  }
}

/** US 5"/38 single Mk 30: open-backed gun shield with a sloped top. */
function houseMk30(hb, col, dark, f) {
  const mid = shade(col, 0.92);
  hb.cylinder(0, 0, 0, 1.25, 1.2, 0.55, shade(col, 0.85), MAT.HULL, { seg: 12 });
  hb.block({ x0: -0.1, x1: f.face, hw: 1.15, y0: 0.5, y1: 2.5, tx0: -0.25, tx1: 0.55, thw: 1.05 }, col, MAT.HULL);   // shield, sloping back at the top
  hb.block({ x0: -1.7, x1: -0.1, hw: 1.1, y0: 0.5, y1: 1.15 }, mid, MAT.HULL);                                         // low rear plate (open back)
  hb.block({ x0: f.face - 0.3, x1: f.face, hw: 0.28, y0: f.trunY - 0.3, y1: f.trunY + 0.3 }, dark, MAT.DARK);
}

const HOUSES = { mk7: houseMk7, type94: houseType94, type3_155: houseType3, drh34: houseDrh34, mk28: houseMk28, mk30: houseMk30 };

function makeFamily(s, f) {
  const col = rgb(s.col || '#6b7076'), dark = rgb(s.dark || '#1d1f22');
  const hb = new MeshBuilder(), gb = new MeshBuilder();
  HOUSES[s.variant](hb, col, dark, f);
  const muz = f.whiteMuzzle ? rgb('#e4e1d4') : null;
  for (let i = 0; i < f.n; i++) tube(gb, (i - (f.n - 1) / 2) * f.spacing, f, col, dark, muz);
  return { house: hb.build(), guns: gb.build(), trunnion: [f.trunX, f.trunY], muzzleX: f.fwd, barrelLen: f.fwd, height: f.h, recoil: f.recoil, lift: f.lift };
}

function makeMount(s) {
  const fam = s.variant && FAMILY[s.variant];
  if (fam && HOUSES[s.variant]) return makeFamily(s, fam);
  const col = rgb(s.col || '#6b7076');
  const dark = rgb(s.dark || '#1d1f22');
  const hb = new MeshBuilder(), gb = new MeshBuilder();
  const calM = s.cal / 1000;
  const n = s.n;
  let trunY = 0, trunX = 0, barrelLen = (s.bore || 45) * calM, height = 0, br0 = 0.6 * calM, br1 = 0.42 * calM;

  if (s.kind === 'aa') {
    aaMount(hb, gb, s, col, dark);
    return {
      house: hb.build(), guns: gb.build(), trunnion: [s._tx || 0, s._ty || 1.1], muzzleX: (s._tx || 0) + (s._len || 1.5),
      barrelLen: s._len || 1.5, height: 2, recoil: 0.05,
    };
  }

  const spacing = Math.max(0.5, calM * (n >= 3 ? 6.6 : 5.6));
  const wid = (n - 1) * spacing + calM * 11 + 0.5;
  const len = Math.max(2.2, calM * 26);
  const h = 1.5 + calM * 5.0;
  height = h;

  if (s.kind === 'turret') {
    // gun house: vertical lower walls with the gun ports, a sloped roof / front plate, a rear counterweight bulge,
    // rangefinder, periscope hoods and hatches
    const x0 = -len * 0.5, xf = len * 0.36, hw = wid / 2;
    const mid = shade(col, 0.96), light = shade(col, 1.1), canvas = rgb('#3d3f3e');
    hb.cylinder(0, -0.05, 0, hw * 0.92, hw * 0.95, 0.35, shade(col, 0.8), MAT.HULL, { seg: 20 });                    // rotating skirt
    hb.block({ x0, x1: xf, hw, y0: 0.3, y1: h * 0.6, tx0: x0 + len * 0.02, tx1: xf, thw: hw * 0.97 }, col, MAT.HULL);
    hb.block({ x0: x0 + len * 0.015, x1: xf - len * 0.015, hw: hw * 0.97, y0: h * 0.6, y1: h, tx0: x0 + len * 0.1, tx1: xf - len * 0.34, thw: hw * 0.84 }, mid, MAT.HULL);
    hb.block({ x0: x0 - len * 0.07, x1: x0 + len * 0.12, hw: hw * 0.8, y0: h * 0.18, y1: h * 0.78, tx0: x0 - len * 0.02, tx1: x0 + len * 0.1, thw: hw * 0.7 }, shade(col, 0.9), MAT.HULL);
    // roof fittings
    hb.cylinder(x0 + len * 0.3, h * 0.97, hw * 0.36, calM * 0.55, calM * 0.5, h * 0.97 + calM * 1.0, shade(col, 0.8), MAT.HULL, { seg: 6 });
    hb.cylinder(x0 + len * 0.3, h * 0.97, -hw * 0.36, calM * 0.55, calM * 0.5, h * 0.97 + calM * 1.0, shade(col, 0.8), MAT.HULL, { seg: 6 });
    hb.box(x0 + len * 0.45, h * 0.99, 0, len * 0.14, 0.14, hw * 0.5, light, MAT.HULL);
    if (calM > 0.3) {
      // rangefinder tube with its end hoods
      const rz = hw + calM * 1.3, ry = h * 0.84, rx = x0 + len * 0.16;
      hb.rodZ(rx, ry, -rz, rz, calM * 0.2, calM * 0.2, shade(col, 0.85), MAT.HULL, { seg: 8 });
      for (const sg of [-1, 1]) hb.cyl(rx, ry - calM * 0.35, sg * (rz - calM * 0.3), calM * 0.55, calM * 0.45, calM * 0.5, calM * 0.4, ry + calM * 0.35, light, MAT.HULL, { seg: 8, dz: sg * calM * 0.3 });
    }
    // gun ports with blast bags
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * spacing;
      hb.block({ x0: xf - 0.04, x1: xf + 0.08, hw: calM * 1.45, zc: z, y0: h * 0.22, y1: h * 0.22 + calM * 2.4 }, dark, MAT.DARK);
      hb.block({ x0: xf + 0.02, x1: xf + 0.22, hw: calM * 1.15, zc: z, y0: h * 0.22 + calM * 0.4, y1: h * 0.22 + calM * 2.0 }, canvas, MAT.CANVAS);
    }
    trunX = xf - len * 0.2;
    trunY = h * 0.22 + calM * 1.2;
  } else if (s.kind === 'dp') {
    // enclosed dual-purpose mount (rounded octagonal house)
    const r = Math.max(wid / 2, 1.1), L2 = Math.max(len * 0.9, 2.2);
    const oct = [];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; oct.push([Math.cos(a) * L2 * 0.5, Math.sin(a) * r]); }
    hb.prism(oct, 0, h, col, MAT.HULL, { topScale: 0.88, topDx: -L2 * 0.04 });
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * spacing;
      hb.block({ x0: L2 * 0.43, x1: L2 * 0.5, hw: calM * 1.1, zc: z, y0: h * 0.25, y1: h * 0.25 + calM * 1.7 }, dark, MAT.DARK);
    }
    trunX = L2 * 0.38; trunY = h * 0.25 + calM * 0.8;
  } else if (s.kind === 'shield') {
    // open mount behind a shield
    hb.cylinder(0, 0, 0, Math.max(wid * 0.45, 0.6), Math.max(wid * 0.45, 0.6), h * 0.4, col, MAT.HULL, { seg: 10 });
    hb.block({ x0: 0.1, x1: 0.35, hw: wid / 2, y0: h * 0.2, y1: h, tx0: 0.0, tx1: 0.25 }, col, MAT.HULL);
    hb.block({ x0: -len * 0.25, x1: 0.1, hw: wid / 2, y0: h * 0.2, y1: h * 0.45 }, shade(col, 0.9), MAT.HULL, {});
    trunX = 0.1; trunY = h * 0.55;
  }

  // ---- barrels ----
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * spacing;
    const sleeve = Math.min(barrelLen * 0.16, 2.6);
    const breech = (s.kind === 'turret' ? 0.5 : 0.3) * len * 0.4;
    // gun slide / blast bag at the breech end
    gb.rod(-breech, sleeve, 0, z, br0 * 1.3, br0 * 1.15, shade(col, 0.85), MAT.HULL, { seg: 10 });
    gb.rod(sleeve * 0.9, barrelLen, 0, z, br0, br1, dark, MAT.DARK, { seg: 10 });
    // muzzle ring
    gb.rod(barrelLen - 0.18 * calM * 3, barrelLen, 0, z, br1 * 1.12, br1 * 1.1, dark, MAT.DARK, { seg: 8 });
  }
  return { house: hb.build(), guns: gb.build(), trunnion: [trunX, trunY], muzzleX: barrelLen, barrelLen, height, recoil: Math.min(0.9, calM * 2.2) };
}

// ---- anti-aircraft mounts (kept simple: platform + barrels) --------------------------------------------
function aaMount(hb, gb, s, col, dark) {
  const n = s.n;
  const v = s.variant || 'bofors';
  if (v === 'oerlikon') {
    hb.cylinder(0, 0, 0, 0.35, 0.3, 0.7, shade(col, 0.9), MAT.HULL, { seg: 8 });
    hb.box(-0.15, 1.0, 0, 0.5, 0.5, 0.45, shade(col, 0.95), MAT.HULL);
    gb.rod(-0.2, 1.1, 0, 0, 0.035, 0.03, dark, MAT.DARK, { seg: 6 });
    s._tx = 0; s._ty = 1.0; s._len = 1.1;
    return;
  }
  if (v === 'iijn25') {   // shielded triple 25 mm
    hb.cylinder(0, 0, 0, 0.6, 0.55, 0.9, shade(col, 0.9), MAT.HULL, { seg: 8 });
    hb.block({ x0: 0.1, x1: 0.35, hw: 0.7, y0: 0.9, y1: 1.9, tx0: 0.02, tx1: 0.2 }, col, MAT.HULL);
    for (let i = 0; i < n; i++) gb.rod(-0.2, 1.2, 0, (i - (n - 1) / 2) * 0.28, 0.04, 0.035, dark, MAT.DARK, { seg: 6 });
    s._tx = 0.1; s._ty = 1.35; s._len = 1.2;
    return;
  }
  // Bofors / generic 40 mm, n = 2 or 4 barrels
  const side = n >= 4 ? 2 : 1;
  hb.cylinder(0, 0, 0, 0.75, 0.7, 0.55, shade(col, 0.9), MAT.HULL, { seg: 10 });
  hb.box(0, 0.9, 0, 1.3, 0.7, 1.3, shade(col, 0.95), MAT.HULL);
  for (const sz of [-0.3, 0.3]) hb.box(-0.2, 1.4, sz * 1.4, 0.5, 0.55, 0.28, col, MAT.HULL);
  for (let i = 0; i < n; i++) {
    const z = ((i % 2) - 0.5) * 0.65, y = (Math.floor(i / 2) - (side - 1) / 2) * 0.45;
    gb.rod(-0.45, 2.1, y, z, 0.07, 0.05, dark, MAT.DARK, { seg: 6 });
  }
  s._tx = 0; s._ty = 1.5; s._len = 2.1;
}
