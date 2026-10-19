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
  // 18.5 m long, 14.4 m wide without the rangefinder arms, 3.9 m high (the profile is drawn 10 % flat: heights read at its own vertical
  // scale; roofs 11.7 and 15.1 m above the waterline), barrels 13.3 m clear of the ports, turret 2 2.7 m above turret 1
  type94: { kind: 'turret', cal: 460, n: 3, spacing: 3.52, trunX: 3.6, trunY: 2.4, face: 7.6, port: 6.4, fwd: 16.1, back: 2.9, rB: 0.70, rP: 0.60, rM: 0.35, bagR: 1.05, bagLen: 1.3, recoil: 1.3, lift: 2.7, h: 3.9, barbR: 6.6, barb: 0.1, whiteMuzzle: true },
  // Yamato's 15.5 cm/60 triple (ex-Mogami): 8.6 m long, 3.4 m high, barrels 5.9 m clear of the face, on a 7.3-7.9 m barbette
  type3_155: { kind: 'turret', cal: 155, n: 3, spacing: 1.7, trunX: 1.2, trunY: 1.44, face: 3.6, port: 3.2, fwd: 8.3, back: 1.2, rB: 0.26, rP: 0.2, rM: 0.11, bagR: 0.33, bagLen: 0.5, recoil: 0.6, lift: 2.6, h: 3.44, barbR: 3.0 },
  // Bismarck profile (Commons, CC0) and Bundesarchiv photographs: 13.3 m long, 3.5 m high, barrels 13.5 m clear of the face, on a
  // 1.2 m barbette; the superfiring turrets 3.4 m higher
  drh34: { kind: 'turret', cal: 380, n: 2, spacing: 4.6, trunX: 2.6, trunY: 1.6, face: 5.8, port: 5.2, fwd: 16.1, back: 2.6, rB: 0.58, rP: 0.49, rM: 0.29, bagR: 0.85, bagLen: 1.1, recoil: 1.15, lift: 3.4, h: 3.5, barbR: 5.3, barb: 1.2 },
  // Bismarck's 15 cm SK C/28 twin turrets (Drh LC/34): 7.2 m long, 2.8 m high, on a low barbette on the upper deck
  drh28_150: { kind: 'turret', cal: 150, n: 2, spacing: 1.9, trunX: 1.3, trunY: 1.25, face: 3.6, port: 3.1, fwd: 7.2, back: 1.2, rB: 0.24, rP: 0.19, rM: 0.1, bagR: 0.3, bagLen: 0.45, recoil: 0.55, lift: 2.4, h: 2.8, barbR: 2.7 },
  // Littorio class (ONI 202 profile and plan, 1943): 381/50 triple, a long low house 15 m from face to rear, 4.4 m above the deck, barrels
  // 12.6 m clear of the face, 2.75 m apart; superfiring turret 4.5 m above the lower one
  lit381: { kind: 'turret', cal: 381, n: 3, spacing: 2.75, trunX: 5.5, trunY: 1.9, face: 8.5, port: 7.9, fwd: 15.6, back: 2.8, rB: 0.55, rP: 0.46, rM: 0.27, bagR: 0.95, bagLen: 1.2, recoil: 1.2, lift: 4.5, h: 4.4, barbR: 6.0, barb: 0.4 },
  // the 152/55 triple turrets of the same class: 9 m long, 3.4 m high, a low rounded house
  lit152: { kind: 'turret', cal: 152, n: 3, spacing: 1.55, trunX: 2.2, trunY: 1.35, face: 4.6, port: 4.2, fwd: 8.6, back: 1.4, rB: 0.24, rP: 0.19, rM: 0.1, bagR: 0.3, bagLen: 0.45, recoil: 0.55, lift: 2.4, h: 3.4, barbR: 3.3 },
  // Richelieu class (class profile with the machinery, Commons CC BY-SA 4.0): the 380 mm quadruple turret, 14 m from rear to face, house 3.5 m
  // high on a barbette 1.5 m above the forecastle (5.5 m for the superfiring turret, 3.9 m higher), barrels 11.2 m clear of the face
  rich380: { kind: 'turret', cal: 380, n: 4, spacing: 2.5, trunX: 3.0, trunY: 1.8, face: 6.2, port: 5.6, fwd: 14.4, back: 2.8, rB: 0.5, rP: 0.42, rM: 0.25, bagR: 0.85, bagLen: 1.1, recoil: 1.1, lift: 3.9, h: 3.5, barbR: 7.0, barb: 1.5 },
  // the 152 mm Mle 1936 triple: an 8 m house 2.9 m high on a tall barbette, barrels 4.8 m clear of the face
  fr152: { kind: 'turret', cal: 152, n: 3, spacing: 1.5, trunX: 1.4, trunY: 1.5, face: 3.2, port: 2.8, fwd: 6.6, back: 1.0, rB: 0.22, rP: 0.18, rM: 0.1, bagR: 0.28, bagLen: 0.4, recoil: 0.5, lift: 2.4, h: 2.9, barbR: 3.3 },
  // Takao class 20 cm/50 No. 3 Year Type twin (ONI 41-42 sheet, Oct 1942): a house 7.4 m long, 3.9 m high, 6.4 m wide, barrels 11 m clear of the
  // trunnion, the superfiring turret 3.3 m above the lower one
  type3_203: { kind: 'turret', cal: 203, n: 2, spacing: 2.0, trunX: 1.8, trunY: 1.9, face: 4.2, port: 3.7, fwd: 12.8, back: 1.4, rB: 0.30, rP: 0.24, rM: 0.14, bagR: 0.45, bagLen: 0.6, recoil: 0.8, lift: 3.3, h: 3.9, barbR: 3.9, barb: 0.2 },
  // Admiral Hipper class 20.3 cm SK C/34 Drh LC/34 twin (ONI 204 sheet of Prinz Eugen, 1942): a house about 7.7 m long and 3.4 m high, barrels
  // 11.6 m clear of the trunnion; the superfiring turret 2.3 m above the lower one
  drh203: { kind: 'turret', cal: 203, n: 2, spacing: 2.1, trunX: 1.6, trunY: 1.7, face: 3.9, port: 3.4, fwd: 11.6, back: 1.3, rB: 0.28, rP: 0.23, rM: 0.14, bagR: 0.42, bagLen: 0.55, recoil: 0.8, lift: 2.3, h: 3.4, barbR: 3.6, barb: 0.1 },
  // Montecuccoli class 152 mm/53 OTO twin (ONI 202 sheet): a house 5.8 m long and 3.2 m high, barrels 5.5 m clear of the face (dimensions read on the profile)
  it152: { kind: 'turret', cal: 152, n: 2, spacing: 1.55, trunX: 1.9, trunY: 1.5, face: 3.4, port: 3.0, fwd: 8.4, back: 1.2, rB: 0.24, rP: 0.19, rM: 0.1, bagR: 0.3, bagLen: 0.45, recoil: 0.55, lift: 2.2, h: 3.2, barbR: 3.0 },
  // Zara class 203/53 Ansaldo Mod. 1927 twin (ONI sheet of 1942): a house 6.6 m long and 3.1 m high, barrels 12.6 m clear of the pivot, B on a barbette 2.7 m taller than A
  zara203: { kind: 'turret', cal: 203, n: 2, spacing: 2.0, trunX: 1.9, trunY: 1.8, face: 4.4, port: 3.9, fwd: 12.8, back: 1.4, rB: 0.30, rP: 0.24, rM: 0.14, bagR: 0.45, bagLen: 0.6, recoil: 0.8, lift: 2.4, h: 3.2, barbR: 4.0, barb: 0.2 },
  // La Galissonniere class 152/55 Mle 1930 triple (ONI sheet of 1942): a house 7.2 m long, 3.4 m high and 6.4 m wide, barrels 5.9 m clear of the face, the superfiring
  // turret 3.2 m above the lower one
  fr152_30: { kind: 'turret', cal: 152, n: 3, spacing: 1.5, trunX: 1.6, trunY: 1.5, face: 3.5, port: 3.1, fwd: 9.4, back: 1.0, rB: 0.22, rP: 0.18, rM: 0.1, bagR: 0.28, bagLen: 0.4, recoil: 0.5, lift: 3.2, h: 3.2, barbR: 3.3 },
  // Algerie 203/50 Mle 1931 twin (ONI sheet of 1942): a house 7.3 m long, 3.4 m high and 6.7 m wide, barrels 7 m clear of the face, the superfiring turret 3.5 m above the lower one
  fr203: { kind: 'turret', cal: 203, n: 2, spacing: 1.9, trunX: 1.8, trunY: 1.8, face: 3.7, port: 3.3, fwd: 11.0, back: 1.3, rB: 0.28, rP: 0.23, rM: 0.14, bagR: 0.42, bagLen: 0.55, recoil: 0.8, lift: 3.5, h: 3.4, barbR: 3.6 },
  // Cleveland class 6 in/47 Mk 16 triple (Colosseum drawing of 1942, with scale bar): a house 8.8 m long and 3.9 m high, barrels 4.8 m clear of the face, the superfiring turret 2.6 m above the lower one
  us152: { kind: 'turret', cal: 152, n: 3, spacing: 1.6, trunX: 2.0, trunY: 1.9, face: 4.6, port: 4.2, fwd: 9.4, back: 1.2, rB: 0.24, rP: 0.19, rM: 0.1, bagR: 0.3, bagLen: 0.45, recoil: 0.6, lift: 2.6, h: 3.7, barbR: 4.2 },
  // Baltimore class 8 in/55 Mk 12 triple (Shipbucket profile with scale bar + TZoli plan, 1944): a house 10 m long, 3.4 m high and 8 m wide, barrels 9.6 m clear of the face,
  // gun spacing 1.55 m, the superfiring turret 3.4 m above the lower one
  us203: { kind: 'turret', cal: 203, n: 3, spacing: 1.55, trunX: 2.0, trunY: 1.9, face: 5.2, port: 4.7, fwd: 14.8, back: 1.4, rB: 0.28, rP: 0.23, rM: 0.14, bagR: 0.42, bagLen: 0.55, recoil: 0.8, lift: 3.4, h: 3.4, barbR: 4.6, barb: 0.2 },
  // Agano class 15.2 cm/50 41st Year Type twin gunhouse (detailed line drawing of the Agano class, with a 50 m scale bar: 8.7 px per metre): a house 6.3 m long and
  // 2.7 m high, barrels 4 m clear of the face, the superfiring turret on a barbette 4.4 m higher
  type41_152: { kind: 'turret', cal: 152, n: 2, spacing: 1.8, trunX: 1.3, trunY: 1.4, face: 3.1, port: 2.8, fwd: 7.1, back: 1.1, rB: 0.22, rP: 0.18, rM: 0.1, bagR: 0.28, bagLen: 0.4, recoil: 0.5, lift: 4.4, h: 2.7, barbR: 2.8 },
  // Belfast 6 in/50 Mk XXIII triple (Profile Publications plate of 1943, with a scale bar in feet): a house 7.5 m long and 2.8 m high, barrels 4.6 m clear of the face, gun spacing 1.55 m,
  // the superfiring turret 2.2 m above the lower one
  brit152: { kind: 'turret', cal: 152, n: 3, spacing: 1.55, trunX: 1.9, trunY: 1.7, face: 3.6, port: 3.2, fwd: 8.2, back: 1.2, rB: 0.24, rP: 0.19, rM: 0.1, bagR: 0.3, bagLen: 0.45, recoil: 0.6, lift: 2.2, h: 2.8, barbR: 3.5 },
  // County class 8 in/50 Mk I twin (Hasegawa 1/700 instruction sheet of a three-funnel County class cruiser; 5 px per metre): a house 9.4 m long and 3.8 m high, barrels 6 m clear of the face,
  // the superfiring turret 3.4 m above the lower one
  brit203: { kind: 'turret', cal: 203, n: 2, spacing: 2.2, trunX: 2.0, trunY: 2.0, face: 5.0, port: 4.5, fwd: 11.0, back: 1.4, rB: 0.30, rP: 0.24, rM: 0.14, bagR: 0.45, bagLen: 0.6, recoil: 0.8, lift: 3.4, h: 3.8, barbR: 4.3, barb: 0.2 },
  // Kagero class 12.7 cm/50 Type 3 Model C twin (Commons outline drawing, MacMoreno, scaled to the 118.5 m length): a house 6.2 m long, 4.6 m wide and 3.0 m high, barrels 5.8 m clear
  // of the pivot, the superfiring turret on the deckhouse 2.3 m above the lower one
  type3_127: { kind: 'turret', cal: 127, n: 2, spacing: 1.0, trunX: 0.4, trunY: 1.5, face: 2.8, port: 2.6, fwd: 5.8, back: 0.9, rB: 0.15, rP: 0.12, rM: 0.07, bagR: 0.22, bagLen: 0.3, recoil: 0.4, lift: 2.3, h: 2.8, barbR: 2.6 },
  // Tribal class 4.7 in/45 QF Mk XII twin (TZoli profile / plan scaled to the 114.9 m length): a house 3.5 m long, 3.4 m wide and 2.6 m high, barrels 4.4 m clear of the pivot, the
  // superfiring turret on a bridge deck 2.2 m above the lower one
  brit120: { kind: 'turret', cal: 120, n: 2, spacing: 0.95, trunX: 0.3, trunY: 1.35, face: 1.6, port: 1.5, fwd: 4.4, back: 0.8, rB: 0.14, rP: 0.11, rM: 0.065, bagR: 0.2, bagLen: 0.3, recoil: 0.4, lift: 2.2, h: 2.6, barbR: 1.9 },
  // Type 1936A (Mob) 15 cm: the forward Drh LC/38 twin turret (low, 2.9 m high) and the TbtKC/36 single shield mounts aft (3.1 m wide, barrels 5.4 m clear of the pivot); dimensions
  // read on a small 3-view (about +-0.8 m), the single on the deckhouse and the superfiring one 2.3 m above their decks
  de150_2: { kind: 'turret', cal: 150, n: 2, spacing: 1.5, trunX: 0.5, trunY: 1.35, face: 2.8, port: 2.5, fwd: 7.0, back: 1.0, rB: 0.2, rP: 0.16, rM: 0.09, bagR: 0.26, bagLen: 0.4, recoil: 0.5, lift: 2.3, h: 2.9, barbR: 2.5 },
  de150_1: { kind: 'shield', cal: 150, n: 1, spacing: 0, trunX: 0.5, trunY: 1.3, face: 1.9, fwd: 5.6, back: 1.0, rB: 0.2, rP: 0.16, rM: 0.09, bagR: 0.0, bagLen: 0, recoil: 0.5, lift: 2.3, h: 2.6 },
  // Le Fantasque 138.6 mm Mle 1929 single shielded mount (scaled class sheet, 7.4 px/m): a house 4.4 m long, 3.0 m high, barrels 5.2 m clear of the pivot, the superfiring mounts
  // on a bridge / deckhouse top 2.5 m higher
  fr138: { kind: 'shield', cal: 138.6, n: 1, spacing: 0, trunX: 0.5, trunY: 1.35, face: 2.1, fwd: 6.2, back: 1.0, rB: 0.18, rP: 0.14, rM: 0.08, bagR: 0.0, bagLen: 0, recoil: 0.5, lift: 2.5, h: 2.9 },
  mk28: { kind: 'dp', cal: 127, n: 2, spacing: 0.78, trunX: 0.55, trunY: 1.35, face: 1.9, fwd: 3.6, back: 0.9, rB: 0.19, rP: 0.15, rM: 0.085, bagR: 0.3, bagLen: 0.3, recoil: 0.5, lift: 3.0, h: 2.9 },
  mk30: { kind: 'shield', cal: 127, n: 1, spacing: 0, trunX: 0.5, trunY: 1.3, face: 1.5, fwd: 3.4, back: 0.9, rB: 0.19, rP: 0.15, rM: 0.085, bagR: 0.0, bagLen: 0, recoil: 0.5, lift: 1.7, h: 2.9 },
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

/** German Drh LC/34 38 cm twin turret (Bismarck): wide and low, a face plate sloped back, a flat roof, the rangefinder across the rear
 *  with its hoods out at the sides. */
function houseDrh34(hb, col, dark, f) {
  const light = shade(col, 1.08), shadow = shade(col, 0.82);
  hb.cylinder(0, -0.1, 0, 5.3, 5.35, 0.2, shadow, MAT.HULL, { seg: 26 });
  hb.block({ x0: -7.5, x1: f.face, hw: 5.2, y0: 0.15, y1: f.h, tx0: -7.3, tx1: 4.0, thw: 5.0 }, col, MAT.HULL);     // walls, sloped face, roof
  hb.block({ x0: -8.4, x1: -7.3, hw: 4.0, y0: 0.6, y1: 2.8, tx0: -8.1, thw: 3.8 }, shade(col, 0.9), MAT.HULL);   // rear overhang
  hb.rodZ(-5.6, f.h - 0.9, -6.0, 6.0, 0.45, 0.45, shade(col, 0.88), MAT.HULL, { seg: 10 });                      // rangefinder
  for (const sg of [-1, 1]) hb.cyl(-5.6, f.h - 1.5, sg * 5.75, 0.75, 0.7, 0.62, 0.6, f.h - 0.3, light, MAT.HULL, { seg: 10 });
  for (const sg of [-1, 1]) hb.cylinder(-3.2, f.h - 0.1, sg * 2.4, 0.45, 0.4, f.h + 0.5, shadow, MAT.HULL, { seg: 8 });
  hb.box(-1.6, f.h + 0.04, 0, 2.6, 0.1, 2.0, light, MAT.HULL);
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.port - 0.5, x1: f.port + 0.45, hw: 0.85, zc: z, y0: f.trunY - 0.65, y1: f.trunY + 0.65 }, dark, MAT.DARK);
  }
}

/**
 * A gun house of the flat-roofed, sloped-face kind (Italian and French turrets of the 1930s). o: { rear (m behind the training axis), hw
 * (half width), slope (how far back the face plate slopes at the roof), ears (rear rangefinder hood radius, 0 = none), tubeHw }.
 */
function boxHouse(o) {
  return (hb, col, dark, f) => {
    const light = shade(col, 1.08), shadow = shade(col, 0.82), r = o.hw + 0.05;
    hb.cylinder(0, -0.1, 0, r, r + 0.05, 0.2, shadow, MAT.HULL, { seg: 26 });
    hb.block({ x0: -o.rear, x1: f.face, hw: o.hw, y0: 0.15, y1: f.h, tx0: -o.rear + 0.2, tx1: f.face - o.slope, thw: o.hw * 0.95 }, col, MAT.HULL);   // walls, sloped face, roof
    hb.block({ x0: -o.rear - 1.0, x1: -o.rear + 0.2, hw: o.hw * 0.57, y0: 0.5, y1: f.h * 0.66, tx0: -o.rear - 0.8, thw: o.hw * 0.53 }, shade(col, 0.9), MAT.HULL);   // rear overhang
    if (o.ears) hb.cyl(-o.rear + 1.2, f.h - 0.2, 0, o.ears, o.ears * 1.3, o.ears * 0.9, o.ears * 1.15, f.h + o.ears, light, MAT.HULL, { seg: 12 });   // rangefinder hood
    for (const sg of [-1, 1]) hb.cylinder(-o.rear * 0.33, f.h - 0.1, sg * o.hw * 0.53, 0.4, 0.36, f.h + 0.5, shadow, MAT.HULL, { seg: 8 });   // periscope hoods
    for (let i = 0; i < f.n; i++) {
      const z = (i - (f.n - 1) / 2) * f.spacing;
      hb.block({ x0: f.port - 0.5, x1: f.port + 0.4, hw: o.tubeHw ?? 0.8, zc: z, y0: f.trunY - 0.6, y1: f.trunY + 0.6 }, dark, MAT.DARK);
    }
  };
}
const houseLit381 = boxHouse({ rear: 6.6, hw: 6.0, slope: 3.2, ears: 1.0 });       // Italian 381/50 triple (Littorio class)
const houseLit152 = boxHouse({ rear: 4.4, hw: 3.2, slope: 1.8, ears: 0, tubeHw: 0.4 });   // Italian 152/55 triple
const houseRich380 = boxHouse({ rear: 7.9, hw: 6.3, slope: 3.4, ears: 1.1 });      // French 380 mm quadruple (Richelieu class)
const houseFr152 = boxHouse({ rear: 5.0, hw: 3.3, slope: 1.5, ears: 0, tubeHw: 0.4 });    // French 152 mm Mle 1936 triple
const houseIt152 = boxHouse({ rear: 3.9, hw: 2.9, slope: 1.5, ears: 0, tubeHw: 0.4 });   // Italian 152 mm twin (Montecuccoli class)
const houseZara203 = boxHouse({ rear: 4.9, hw: 3.5, slope: 1.6, ears: 0.5, tubeHw: 0.6 });   // Italian 203/53 twin (Zara class)
const houseFr152_30 = boxHouse({ rear: 3.7, hw: 3.2, slope: 1.5, ears: 0, tubeHw: 0.4 });   // French 152 mm Mle 1930 triple (La Galissonniere class)
const houseFr203 = boxHouse({ rear: 3.6, hw: 3.3, slope: 1.5, ears: 0.4, tubeHw: 0.6 });   // French 203 mm twin (Algerie)
const houseUs152 = boxHouse({ rear: 4.2, hw: 3.4, slope: 2.0, ears: 0, tubeHw: 0.4 });   // US 6 in/47 Mk 16 triple (Cleveland class)
const houseUs203 = boxHouse({ rear: 4.8, hw: 4.0, slope: 2.2, ears: 0.4, tubeHw: 0.6 });   // US 8 in/55 Mk 12 triple (Baltimore class)
const houseType41_152 = boxHouse({ rear: 3.2, hw: 2.6, slope: 1.0, ears: 0, tubeHw: 0.4 });   // Japanese 15.2 cm twin (Agano class)
const houseBrit152 = boxHouse({ rear: 3.9, hw: 3.2, slope: 1.4, ears: 0, tubeHw: 0.4 });   // British 6 in triple (Town class)
const houseBrit203 = boxHouse({ rear: 4.4, hw: 3.6, slope: 1.8, ears: 0.5, tubeHw: 0.6 });   // British 8 in twin (County class)
const houseType3_127 = boxHouse({ rear: 3.4, hw: 2.3, slope: 1.2, ears: 0, tubeHw: 0.35 });   // Japanese 12.7 cm twin (Kagero class)
const houseBrit120 = boxHouse({ rear: 2.0, hw: 1.7, slope: 0.8, ears: 0, tubeHw: 0.3 });   // British 4.7 in twin (Tribal class)
const houseDe150_2 = boxHouse({ rear: 2.6, hw: 2.4, slope: 1.0, ears: 0, tubeHw: 0.35 });   // German 15 cm Drh LC/38 twin (Type 1936A)
const houseType3_203 = boxHouse({ rear: 5.2, hw: 3.4, slope: 1.7, ears: 0.6, tubeHw: 0.6 });   // Japanese 20 cm twin (Takao class)
const houseDrh203 = boxHouse({ rear: 4.8, hw: 3.3, slope: 1.2, ears: 0.5, tubeHw: 0.6 });   // German 20.3 cm twin (Admiral Hipper class)

/** German 15 cm twin turret (Bismarck's secondary battery): sloped face and roof edges, rangefinder hoods at the rear corners. */
function houseDrh28(hb, col, dark, f) {
  const light = shade(col, 1.08), shadow = shade(col, 0.82);
  hb.cylinder(0, -0.05, 0, 2.6, 2.65, 0.12, shadow, MAT.HULL, { seg: 20 });
  hb.block({ x0: -3.6, x1: f.face, hw: 2.5, y0: 0.1, y1: f.h, tx0: -3.3, tx1: 2.3, thw: 2.2 }, col, MAT.HULL);
  for (const sg of [-1, 1]) hb.block({ x0: -3.0, x1: -1.9, hw: 0.3, zc: sg * 2.6, y0: 1.5, y1: 2.4, tx0: -2.9, tx1: -2.1, thw: 0.25 }, light, MAT.HULL);
  hb.cylinder(-1.2, f.h - 0.05, 1.1, 0.28, 0.25, f.h + 0.35, shadow, MAT.HULL, { seg: 6 });
  for (let i = 0; i < f.n; i++) {
    const z = (i - (f.n - 1) / 2) * f.spacing;
    hb.block({ x0: f.port - 0.3, x1: f.port + 0.25, hw: 0.4, zc: z, y0: f.trunY - 0.4, y1: f.trunY + 0.4 }, dark, MAT.DARK);
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

const HOUSES = { mk7: houseMk7, type94: houseType94, type3_155: houseType3, drh28_150: houseDrh28, lit381: houseLit381, lit152: houseLit152, rich380: houseRich380, fr152: houseFr152, it152: houseIt152, us152: houseUs152, brit152: houseBrit152, de150_2: houseDe150_2, de150_1: houseMk30, fr138: houseMk30, brit120: houseBrit120, type3_127: houseType3_127, brit203: houseBrit203, type41_152: houseType41_152, us203: houseUs203, fr203: houseFr203, fr152_30: houseFr152_30, zara203: houseZara203, type3_203: houseType3_203, drh203: houseDrh203, drh34: houseDrh34, mk28: houseMk28, mk30: houseMk30 };

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
