// Procedural WWII carrier aircraft. One generator for monoplanes and biplanes driven by a spec sheet
// (dimensions of the real aircraft). Model space: +x = nose, +y = up, +z = starboard, origin near the
// centre of gravity. Every plane is built as separate groups so that parts can fly off or be hidden:
//   whole  fuselage + both wings + tail (the normal, intact aircraft)
//   body   fuselage, engine, canopy, fixed gear     wingL / wingR     tail (rear fuselage + tailplane + fin)
//   prop   rotating propeller (origin on the engine axis)     gear   retractable undercarriage
//   ordnance   torpedo or bomb hung under the fuselage
// The land-based bombers (spec.engines: several engines) are built by heavy.js from the sheets of bomberdata.js with the same groups, plus
//   prop (one propeller, hub at the origin; propsOf(spec) gives the place of each one)   engN (the nacelle of engine N)   burnN (the same, charred and glowing)
//   cabin (single-engine: the fuselage seen from the pilot's seat, open over the cockpit)   bay (the open bomb doors)   hull (the fuselage from just behind the pilot, drawn instead of the nose and the flight deck when the view is from the pilot's seat)
import { loadoutsOf, bombsIn } from '../data/loadouts.js';
import { cockpitEye } from './cockpit.js';
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';
import { drawHeavy, propMounts, bayPivot } from './heavy.js';
import { HEAVY } from './bomberdata.js';
import { planeGuns, drawGunHead } from './planeGuns.js';
import { drawFixedGuns } from './fixedGuns.js';
import { drawV4Plane, drawV4Heavy } from './v4plane.js';
import * as D3A_V4 from './aircraft/d3a_v4.js';
import * as A6M_V4 from './aircraft/a6m_v4.js';
import * as SBD_V4 from './aircraft/sbd_v4.js';
import * as TBF_V4 from './aircraft/tbf_v4.js';
import * as IL2_V4 from './aircraft/il2_v4.js';
import * as BF109_V4 from './aircraft/bf109_v4.js';
import * as B29_V4 from './aircraft/b29_v4.js';
import * as B17_V4 from './aircraft/b17_v4.js';
import * as HE111_V4 from './aircraft/he111_v4.js';
import * as LANCASTER_V4 from './aircraft/lancaster_v4.js';
import * as B5N_V4 from './aircraft/b5n_v4.js';
import * as F6F_V4 from './aircraft/f6f_v4.js';
import * as F4F_V4 from './aircraft/f4f_v4.js';
import * as FM2_V4 from './aircraft/fm2_v4.js';
import * as JU87_V4 from './aircraft/ju87_v4.js';
import * as RO43_V4 from './aircraft/ro43_v4.js';

const PI = Math.PI;
const D2R = PI / 180;

// ---- paint schemes and national markings -----------------------------------------------------------------
export const PAINT = {
  USA: { top: '#3b4a63', bot: '#c4c8ca', acc: '#e8e6dc' },
  Japan: { top: '#6c7556', bot: '#bcc0a8', acc: '#d9a23a' },
  USSR: { top: '#4d5a3a', bot: '#8fa6bb', acc: '#c42a24' },
  UK: { top: '#4b5a44', bot: '#8d9b9e', acc: '#2a2a2a' },
  Germany: { top: '#55604b', bot: '#8da3b7', acc: '#1c1c1c' },
  France: { top: '#6b7d66', bot: '#c9cecf', acc: '#b04040' },
  Italy: { top: '#8a8456', bot: '#7d8a92', acc: '#e8e6dc' },
};

// ---- aircraft specification sheets --------------------------------------------------------------------------
// The tailplane span is the TOTAL span (the three aircraft with a drawing -- SBD 5.4 m, B5N 4.9 m, Skua 4.9 m -- were measured on it; the others
// are 0.33 of the wing span, estimated: they had been drawn at about half the real size). The Ju 87's tailplane is the model's 5.1 m (0.37 of the span;
// a 1:72 sheet had given 3.0 m).
// L length, span, fus: {r maximum radius, ar ratio height/width}, engine: {r cowl radius, len, type},
// wing: {cr root chord, ct tip chord, x mid-chord position, y height, dih dihedral, gull inverted gull, sweep, t thickness}
export const PLANES = {
  sbd: {      // measured on the model (tools/refs/planegroups.py --measures); the retractable undercarriage is drawn by the game (the model has it up)
    name: 'SBD-3 Dauntless', nation: 'USA', role: 'dive', kind: 'mono', L: 9.84, span: 12.65, mass: 4.2, S: 30.2, hp: 3.2, bombKg: 450,
    fus: { r: 0.7, ar: 1.15, x: -0.2 }, engine: { type: 'radial', r: 0.76, len: 1.4 }, prop: { r: 1.6, n: 3, x: 0 },
    wing: { cr: 3.09, ct: 1.1, x: 0.52, y: -0.52, dih: 0.75, sweep: 0.24, t: 0.34 },
    tail: { x: -4.55, chord: 1.37, span: 5.33, fin: 2.0, finChord: 2.0, y: 0.41 }, canopy: [{ x0: 0.65, x1: 2.0, tx1: 1.7, h: 0.62 }, { x0: -0.55, x1: 0.6, tx1: 0.35, h: 0.5 }],
    gear: 'retract', ordnance: 'bomb', stripes: false, groundY: 1.9, v4: SBD_V4, paint: 'sbd', crease: 75,
  },
  tbf: {      // measured on the model (tools/refs/planegroups.py --measures); the retractable undercarriage is drawn by the game (the model has it up)
    name: 'TBF-1C Avenger', nation: 'USA', role: 'torp', kind: 'mono', L: 12.21, span: 16.5, mass: 7.0, S: 49.2, hp: 4.5,
    fus: { r: 0.9, ar: 1.1, x: -0.6 }, engine: { type: 'radial', r: 0.95, len: 1.5 }, prop: { r: 2.0, n: 3, x: 0 },
    wing: { cr: 3.58, ct: 1.3, x: 0.52, y: -0.03, dih: 0.85, sweep: 0.25, t: 0.42 },
    tail: { x: -5.9, chord: 2.1, span: 6.43, fin: 2.2, finChord: 2.6, y: 0.9 }, canopy: [{ x0: 0.8, x1: 2.3, tx1: 1.9, h: 1.0 }, { x0: -0.6, x1: 0.8, tx1: 0.4, h: 0.9 }],
    gear: 'retract', ordnance: 'torp', turret: true, groundY: 2.2, v4: TBF_V4, paint: 'tbf', crease: 75,
  },
  d3a: {      // measured on the model (tools/refs/planegroups.py --probe): the elliptic wing 3.5 m of chord at the root, the tailplane 4.3 m, the fixed spatted undercarriage, two canopies
    name: 'Aichi D3A1 Type 99', nation: 'Japan', role: 'dive', kind: 'mono', L: 10.67, span: 14.365, mass: 3.6, S: 34.9, hp: 2.8, bombKg: 250,
    fus: { r: 0.6, ar: 1.3, x: -0.4 }, engine: { type: 'radial', r: 0.64, len: 1.3 }, prop: { r: 1.46, n: 3, x: 0 },
    wing: { cr: 3.5, ct: 0.5, x: 0.77, y: -0.45, dih: 0.6, sweep: 0.3, t: 0.3, elliptic: true },
    tail: { x: -5.15, chord: 1.9, span: 4.32, fin: 1.8, finChord: 2.3, y: 0.0 }, canopy: [{ x0: 0.75, x1: 1.65, tx1: 1.35, h: 0.4 }, { x0: -0.46, x1: 0.7, tx1: 0.3, h: 0.4 }],
    gear: 'spats', ordnance: 'bomb', groundY: 2.16, v4: D3A_V4, paint: 'd3a',
    canopyLoft: { yb: 0.55, exp: 0.8, prof: [[-0.85, 0.70, 0.12], [-0.6, 0.88, 0.16], [-0.3, 0.93, 0.24], [-0.1, 0.96, 0.32], [0.0, 0.98, 0.35], [0.4, 1.0, 0.35], [1.0, 1.01, 0.36], [1.5, 1.03, 0.36], [1.65, 0.9, 0.3], [1.8, 0.8, 0.22], [1.9, 0.76, 0.12]], frames: [-0.2, 0.2, 0.62, 1.05, 1.5, 1.75] },      // (the envelope of the canopy of the model: its panes are opaque and mixed with the interior there)
  },
  b5n: {      // measured on the model (tools/refs/planegroups.py --measures): the wing 3.7 m of chord at the root and 0.9 m at the tip, the tailplane 4.9 m, the long glasshouse of the three crew, three blades of 1.75 m; the model has the gear up: the game's wheels
    name: 'Nakajima B5N2 Type 97', nation: 'Japan', role: 'torp', kind: 'mono', L: 10.33, span: 15.52, mass: 3.8, S: 37.7, hp: 2.9,
    fus: { r: 0.6, ar: 1.35, x: -0.4 }, engine: { type: 'radial', r: 0.66, len: 1.3 }, prop: { r: 1.75, n: 3, x: 0 },
    wing: { cr: 3.7, ct: 0.95, x: 0.42, y: -0.4, dih: 0.65, sweep: 0.65, t: 0.3 },
    tail: { x: -4.83, chord: 1.75, span: 4.94, fin: 1.7, finChord: 2.0, y: 0.0 }, canopy: [{ x0: -1.4, x1: 2.2, tx1: 1.9, h: 0.55 }],
    gear: 'retract', ordnance: 'torp', groundY: 2.2, tailWheel: 'game', v4: B5N_V4, paint: 'b5n',
  },
  swordfish: {
    name: 'Fairey Swordfish', nation: 'UK', role: 'torp', kind: 'bi', L: 11.0, span: 13.9, mass: 3.4, hp: 3.4,
    fus: { r: 0.62, ar: 1.1, x: -0.6 }, engine: { type: 'radial', r: 0.75, len: 1.1 }, prop: { r: 1.75, n: 3, x: 0 },
    wing: { cr: 1.95, ct: 1.95, x: 0.95, y: 0.0, gap: 1.75, dih: 0.0, sweep: 0.5, t: 0.14, stagger: 0.1 },
    tail: { x: -5.3, chord: 2.0, span: 4.6, fin: 1.4, finChord: 1.6, y: 0.2 }, canopy: [{ x0: -0.2, x1: 0.5, tx1: 0.3, h: 0.2, open: true }, { x0: -2.0, x1: -1.4, tx1: -1.6, h: 0.2, open: true }],
    gear: 'fixedbig', ordnance: 'torp',
  },
  skua: {
    name: 'Blackburn Skua', nation: 'UK', role: 'dive', kind: 'mono', L: 10.85, span: 14.1, mass: 3.8, hp: 3.2, bombKg: 230,
    fus: { r: 0.62, ar: 1.15, x: -0.4 }, engine: { type: 'radial', r: 0.72, len: 1.2 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 2.8, ct: 1.4, x: -0.2, y: -0.3, dih: 0.4, sweep: 0.4, t: 0.34 },
    tail: { x: -4.4, chord: 1.4, span: 4.9, fin: 1.4, finChord: 1.7, y: 0.15 }, canopy: [{ x0: 0.0, x1: 1.5, tx1: 1.15, h: 0.6 }, { x0: -2.0, x1: -0.7, tx1: -1.0, h: 0.5 }],
    gear: 'retract', ordnance: 'bomb',
  },
  ju87: {      // the shape is a Ju 87 B-2 (tools/refs/planegroups.py --measures; no spats, the leg fairings and the open wheels as modelled): the inverted gull wing, the braced tailplane 5.1 m across, the fixed undercarriage and the tail wheel are in the model, which stands nose up at 11 degrees on them
    name: 'Junkers Ju 87 C Stuka', nation: 'Germany', role: 'dive', kind: 'mono', L: 11.2, span: 13.8, mass: 4.6, S: 31.9, hp: 3.6, bombKg: 500, siren: true,
    fus: { r: 0.62, ar: 1.2, x: -0.3 }, engine: { type: 'inline', r: 0.46, len: 1.9 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 3.3, ct: 1.1, x: 0.5, y: -0.45, dih: 0.0, gull: 0.95, sweep: 0.15, t: 0.4 },
    tail: { x: -5.4, chord: 1.0, span: 5.1, fin: 1.9, finChord: 1.9, y: 0.95 }, canopy: [{ x0: 0.2, x1: 1.77, tx1: 1.2, h: 0.78 }, { x0: -1.68, x1: -0.6, tx1: -0.9, h: 1.14 }],
    gear: 'spats', ordnance: 'bomb', groundY: 1.93, groundPitch: 0.19, bombPos: { x: 1.1, y: -0.55, wx: 1.1, wy: -0.45, wz: 3.6, wdz: 0.5 }, v4: JU87_V4, paint: 'ju87',
  },
  fi167: {
    name: 'Fieseler Fi 167', nation: 'Germany', role: 'torp', kind: 'bi', L: 11.4, span: 13.5, mass: 4.2, hp: 3.5,
    fus: { r: 0.64, ar: 1.15, x: -0.4 }, engine: { type: 'inline', r: 0.48, len: 1.8 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 1.9, ct: 1.5, x: 0.40, y: 0.0, gap: 1.7, dih: 0.0, sweep: 0.3, t: 0.14, stagger: 0.3, lowerShort: 0.78 },
    tail: { x: -5.6, chord: 1.5, span: 4.5, fin: 1.4, finChord: 1.7, y: 0.25 }, canopy: [{ x0: -0.1, x1: 2.2, tx1: 1.7, h: 0.66 }],
    gear: 'retract', ordnance: 'torp',
  },
  ln401: {
    name: 'Loire-Nieuport LN.401', nation: 'France', role: 'dive', kind: 'mono', L: 9.7, span: 14.0, mass: 2.9, hp: 2.7, bombKg: 225,
    fus: { r: 0.5, ar: 1.3, x: -0.2 }, engine: { type: 'inline', r: 0.42, len: 1.8 }, prop: { r: 1.5, n: 3, x: 0 },
    wing: { cr: 2.4, ct: 1.2, x: -0.1, y: -0.35, dih: 0.0, gull: 0.85, kneeFrac: 0.23, tipRise: 0.95, sweep: 0.2, t: 0.3 },
    tail: { x: -4.3, chord: 1.6, span: 3.9, plates: { h: 1.7, chord: 1.5 }, fin: 1.4, finChord: 1.6, y: 0.15 }, canopy: [{ x0: 0.0, x1: 1.9, tx1: 1.5, h: 0.6 }],
    gear: 'spats', ordnance: 'bomb',
  },
  pl10: {
    name: 'Levasseur PL.10', nation: 'France', role: 'torp', kind: 'bi', L: 12.0, span: 15.5, mass: 4.0, hp: 3.6,
    fus: { r: 0.66, ar: 1.1, x: -0.6 }, engine: { type: 'inline', r: 0.5, len: 1.7 }, prop: { r: 1.9, n: 3, x: 0 },
    wing: { cr: 2.1, ct: 2.1, x: 0.1, y: 0.0, gap: 1.9, dih: 0.0, sweep: 0.2, t: 0.15, stagger: 0.5 },
    tail: { x: -4.5, chord: 1.6, span: 5.1, fin: 1.5, finChord: 1.7, y: 0.25 }, canopy: [{ x0: -0.2, x1: 0.6, tx1: 0.4, h: 0.2, open: true }, { x0: -2.1, x1: -1.5, tx1: -1.7, h: 0.2, open: true }],
    gear: 'fixedbig', ordnance: 'torp',
  },
  re2001: {
    name: 'Reggiane Re.2001', nation: 'Italy', role: 'dive', kind: 'mono', L: 8.2, span: 11.0, mass: 2.6, hp: 2.6, bombKg: 250,
    fus: { r: 0.46, ar: 1.15, x: -0.2 }, engine: { type: 'inline', r: 0.4, len: 1.7 }, prop: { r: 1.45, n: 3, x: 0 },
    wing: { cr: 2.2, ct: 1.0, x: 0.40, y: -0.28, dih: 0.3, sweep: 0.25, t: 0.26, elliptic: true },
    tail: { x: -4.0, chord: 1.4, span: 3.6, fin: 1.5, finChord: 2.0, y: 0.1 }, canopy: [{ x0: -0.1, x1: 1.5, tx1: 1.15, h: 0.52 }],
    gear: 'retract', ordnance: 'bomb',
  },
  re2001t: {
    name: 'Reggiane Re.2001 G', nation: 'Italy', role: 'torp', kind: 'mono', L: 8.2, span: 11.0, mass: 2.8, hp: 2.6,
    fus: { r: 0.46, ar: 1.15, x: -0.2 }, engine: { type: 'inline', r: 0.4, len: 1.7 }, prop: { r: 1.45, n: 3, x: 0 },
    wing: { cr: 2.2, ct: 1.0, x: 0.40, y: -0.28, dih: 0.3, sweep: 0.25, t: 0.26, elliptic: true },
    tail: { x: -4.0, chord: 1.4, span: 3.6, fin: 1.5, finChord: 2.0, y: 0.1 }, canopy: [{ x0: -0.1, x1: 1.5, tx1: 1.15, h: 0.52 }],
    gear: 'retract', ordnance: 'torp',
  },
  // ---- fighters (the dimensions are the real ones, the rest estimated like the other aircraft) ----
  f6f: {      // measured on the model (tools/refs/planegroups.py --measures): the wing 3.1 m of chord at the root and 1.5 m at the tip, the tailplane 5.6 m, the glass of the canopy, three blades of 2.0 m; the model has the gear up (the wheels lie flat in the wings): the game's wheels
    name: 'Grumman F6F-3 Hellcat', nation: 'USA', role: 'fighter', kind: 'mono', L: 10.33, span: 13.06, mass: 5.6, S: 31.0, hp: 4.2,
    fus: { r: 0.78, ar: 1.28, x: -0.6 }, engine: { type: 'radial', r: 0.9, len: 1.4 }, prop: { r: 2.0, n: 3, x: 0 },
    wing: { cr: 3.1, ct: 1.55, x: 0.6, y: -0.26, dih: 0.45, sweep: 0.3, t: 0.38 },
    tail: { x: -4.93, chord: 1.63, span: 5.62, fin: 1.9, finChord: 2.4, y: 0.37 }, canopy: [{ x0: -0.4, x1: 1.1, tx1: 0.8, h: 0.7 }],
    gear: 'retract', ordnance: null, groundY: 2.35, tailWheel: 'game', v4: F6F_V4, paint: 'f6f',
  },
  f4f: {      // measured on the model (tools/refs/planegroups.py --measures): the wing 2.44 m of chord at the root and 1.5 m at the tip (24 m2), the tailplane 4.15 m, the glass of the canopy, three blades of 1.6 m; the model has the gear up (the wheels lie in the fuselage): the game's wheels
    name: 'Grumman F4F-3 Wildcat', nation: 'USA', role: 'fighter', kind: 'mono', L: 8.82, span: 11.58, mass: 3.4, S: 24.15, hp: 3.0,
    fus: { r: 0.62, ar: 1.3, x: -0.5 }, engine: { type: 'radial', r: 0.62, len: 1.1 }, prop: { r: 1.6, n: 3, x: 0 },
    wing: { cr: 2.44, ct: 1.5, x: 0.45, y: 0.07, dih: 0.35, sweep: 0.15, t: 0.3 },
    tail: { x: -4.55, chord: 1.41, span: 4.15, fin: 1.5, finChord: 1.9, y: 0.61 }, canopy: [{ x0: -0.25, x1: 0.95, tx1: 0.7, h: 0.55 }],
    gear: 'retract', ordnance: null, groundY: 1.95, tailWheel: 'game', v4: F4F_V4, paint: 'f4f',
  },
  fm2: {      // measured on the model (tools/refs/planegroups.py --measures): the wing 2.4 m of chord at the root and 1.5 m at the tip, the tailplane 4.2 m, the long sliding hood, three blades of 1.6 m; the model has the gear up (the wheels lie in the fuselage): the game's wheels
    name: 'General Motors FM-2 Wildcat', nation: 'USA', role: 'fighter', kind: 'mono', L: 8.93, span: 11.58, mass: 3.75, S: 24.15, hp: 3.2,
    fus: { r: 0.62, ar: 1.3, x: -0.5 }, engine: { type: 'radial', r: 0.66, len: 1.2 }, prop: { r: 1.6, n: 3, x: 0 },
    wing: { cr: 2.4, ct: 1.5, x: 0.58, y: 0.04, dih: 0.3, sweep: 0.15, t: 0.3 },
    tail: { x: -4.55, chord: 1.46, span: 4.22, fin: 1.45, finChord: 1.9, y: 0.54 }, canopy: [{ x0: -0.85, x1: 1.0, tx1: 0.75, h: 0.55 }],
    gear: 'retract', ordnance: null, groundY: 1.95, tailWheel: 'game', v4: FM2_V4, paint: 'fm2',
  },
  a6m: {      // measured on the model (tools/refs/planegroups.py --measures); the retractable undercarriage is drawn by the game (the model has it up)
    name: 'Mitsubishi A6M2 Zero', nation: 'Japan', role: 'fighter', kind: 'mono', L: 8.97, span: 12.0, mass: 2.45, S: 22.44, hp: 2.4,
    fus: { r: 0.62, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.62, len: 1.3 }, prop: { r: 1.49, n: 3, x: 0 },
    wing: { cr: 2.5, ct: 0.9, x: 1.05, y: 0.0, dih: 0.1, sweep: 0.1, t: 0.3 },
    tail: { x: -3.6, chord: 1.7, span: 3.9, fin: 1.5, finChord: 2.2, y: 0.0 }, canopy: [{ x0: 0.1, x1: 1.5, tx1: 1.2, h: 0.7 }],
    gear: 'retract', ordnance: null, groundY: 1.9, v4: A6M_V4, paint: 'a6m',
  },
  // The Ilyushin Il-2 Type 3 (a Soviet ground-attack aircraft: not in the air group of a fleet, the Soviet Union has no ships in the game yet), drawn from its model
  // (tools/refs/planegroups.py --measures): the span 14.6 m, the wing 3.5 m of chord at the root and 0.9 m at the tip, the tailplane 5.0 m, the fin 2.0 m over it
  il2: {
    name: 'Ilyushin Il-2 Type 3', nation: 'USSR', role: 'attack', kind: 'mono', L: 12.12, span: 14.6, mass: 6.1, S: 38.5, hp: 5.0, bombKg: 400,
    fus: { r: 0.6, ar: 1.2, x: -0.9 }, engine: { type: 'inline', r: 0.62, len: 2.4 }, prop: { r: 2.0, n: 3, x: 0 },
    wing: { cr: 3.5, ct: 0.9, x: 0.85, y: -0.4, dih: 0.3, sweep: 0.3, t: 0.3 },
    tail: { x: -5.4, chord: 2.0, span: 5.0, fin: 2.0, finChord: 2.4, y: 0.23 }, canopy: [{ x0: 0.5, x1: 1.7, tx1: 1.4, h: 0.72 }, { x0: -1.6, x1: -0.1, tx1: -0.6, h: 0.6 }],
    gear: 'retract', ordnance: 'bomb', stripes: false, groundY: 2.2, v4: IL2_V4, paint: 'il2', crease: 75,
  },
  fulmar: {
    name: 'Fairey Fulmar', nation: 'UK', role: 'fighter', kind: 'mono', L: 12.2, span: 14.1, mass: 4.6, hp: 3.6,
    fus: { r: 0.62, ar: 1.15, x: -0.5 }, engine: { type: 'inline', r: 0.55, len: 1.9 }, prop: { r: 1.75, n: 3, x: 0 },
    wing: { cr: 3.0, ct: 1.5, x: 0.3, y: -0.35, dih: 0.3, sweep: 0.4, t: 0.34 },
    tail: { x: -5.4, chord: 1.6, span: 4.7, fin: 1.6, finChord: 2.0, y: 0.2 }, canopy: [{ x0: 0.1, x1: 1.5, tx1: 1.1, h: 0.55 }, { x0: -1.9, x1: -0.7, tx1: -0.9, h: 0.5 }],
    gear: 'retract', ordnance: null,
  },
  bf109t: {      // drawn from the model of a Bf 109 F-4 (tools/refs/planegroups.py --measures): the T-2's longer wing tips are not modelled; the hook stays procedural, the undercarriage is the game's (the model has it up)
    name: 'Messerschmitt Bf 109 F-4', nation: 'Germany', role: 'fighter', kind: 'mono', L: 8.85, span: 10.24, mass: 2.9, S: 16.05, hp: 2.6,
    fus: { r: 0.55, ar: 1.0, x: -0.3 }, engine: { type: 'inline', r: 0.42, len: 1.8 }, prop: { r: 1.46, n: 3, x: 0 },
    wing: { cr: 1.9, ct: 0.45, x: 0.45, y: -0.12, dih: 0.3, sweep: 0.1, t: 0.2 },
    tail: { x: -4.4, chord: 0.9, span: 2.95, fin: 1.2, finChord: 1.5, y: 0.15 }, canopy: [{ x0: -0.75, x1: 1.4, tx1: 1.0, h: 0.63 }],
    gear: 'retract', ordnance: null, groundY: 1.5, tailWheel: 'game', v4: BF109_V4, paint: 'bf109',
  },
  d520: {
    name: 'Dewoitine D.520 (navalised)', nation: 'France', role: 'fighter', kind: 'mono', L: 8.76, span: 10.2, mass: 2.8, hp: 2.5,
    fus: { r: 0.5, ar: 1.15, x: -0.3 }, engine: { type: 'inline', r: 0.43, len: 1.8 }, prop: { r: 1.5, n: 3, x: 0 },
    wing: { cr: 2.2, ct: 1.0, x: 0.4, y: -0.3, dih: 0.3, sweep: 0.2, t: 0.26 },
    tail: { x: -4.0, chord: 1.3, span: 3.6, fin: 1.4, finChord: 1.8, y: 0.15 }, canopy: [{ x0: -0.1, x1: 1.6, tx1: 1.2, h: 0.5 }],
    gear: 'retract', ordnance: null,
  },
  mc202: {
    name: 'Macchi C.202 Folgore', nation: 'Italy', role: 'fighter', kind: 'mono', L: 8.85, span: 10.6, mass: 2.9, hp: 2.6,
    fus: { r: 0.5, ar: 1.15, x: -0.3 }, engine: { type: 'inline', r: 0.43, len: 1.8 }, prop: { r: 1.5, n: 3, x: 0 },
    wing: { cr: 2.2, ct: 1.0, x: 0.4, y: -0.3, dih: 0.3, sweep: 0.2, t: 0.26 },
    tail: { x: -4.0, chord: 1.3, span: 3.7, fin: 1.4, finChord: 1.8, y: 0.15 }, canopy: [{ x0: -0.1, x1: 1.6, tx1: 1.2, h: 0.5 }],
    gear: 'retract', ordnance: null,
  },
  // ---- land-based bombers: several engines, built by heavy.js from the sheets of bomberdata.js ----
  ...HEAVY,
  b17: { ...HEAVY.b17, paintRGB: HEAVY.b17.paint, v4: B17_V4, paint: 'b17' },          // the B-17 is drawn from the pieces of its model, like the B-29
  lancaster: { ...HEAVY.lancaster, paintRGB: HEAVY.lancaster.paint, v4: LANCASTER_V4, paint: 'lancaster' },
  he111: { ...HEAVY.he111, paintRGB: HEAVY.he111.paint, v4: HE111_V4, paint: 'he111' },
  b29: { ...HEAVY.b29, groundY: 3.0, v4: B29_V4, paint: 'b29' },          // the B-29 is drawn from the pieces of its model (model/v4plane.js drawV4Heavy)
};

/** Floatplane carried on a catapult (Kingfisher, Jake, Walrus, Arado 196, Loire 130, Ro.43 style). */
const FLOATPLANES = {
  USA: { name: 'OS2U Kingfisher', nation: 'USA', role: 'float', kind: 'mono', L: 10.3, span: 10.9, fus: { r: 0.55, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.62, len: 1.1 }, prop: { r: 1.4, n: 3, x: 0 }, wing: { cr: 2.0, ct: 1.5, x: -0.1, y: -0.05, dih: 0.15, sweep: 0.1, t: 0.25 }, tail: { x: -4.2, chord: 1.3, span: 2.6, fin: 1.3, finChord: 1.5, y: 0.2 }, canopy: [{ x0: 0.0, x1: 2.2, tx1: 1.8, h: 0.55 }], gear: 'float' },
  Japan: { name: 'Mitsubishi F1M', nation: 'Japan', role: 'float', kind: 'bi', L: 9.5, span: 11.0, fus: { r: 0.5, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.6, len: 1.0 }, prop: { r: 1.5, n: 3, x: 0 }, wing: { cr: 1.5, ct: 1.3, x: 0.0, y: 0.0, gap: 1.5, dih: 0, sweep: 0.2, t: 0.12, stagger: 0.3 }, tail: { x: -3.8, chord: 1.2, span: 2.4, fin: 1.2, finChord: 1.4, y: 0.2 }, canopy: [{ x0: -0.1, x1: 1.6, tx1: 1.2, h: 0.55 }], gear: 'float' },
  UK: { name: 'Supermarine Walrus', nation: 'UK', role: 'float', kind: 'bi', L: 11.4, span: 13.9, fus: { r: 0.8, ar: 1.1, x: -0.2 }, engine: { type: 'radial', r: 0.7, len: 1.0, pusher: true }, prop: { r: 1.6, n: 4, x: -0.2 }, wing: { cr: 2.0, ct: 2.0, x: 0.0, y: 0.1, gap: 1.8, dih: 0, sweep: 0.2, t: 0.14, stagger: 0.2 }, tail: { x: -4.3, chord: 1.6, span: 3.2, fin: 1.6, finChord: 1.6, y: 0.3 }, canopy: [{ x0: 0.7, x1: 2.1, tx1: 1.7, h: 0.5 }], gear: 'float' },
  Germany: { name: 'Arado Ar 196', nation: 'Germany', role: 'float', kind: 'mono', L: 11.0, span: 12.4, fus: { r: 0.58, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.64, len: 1.2 }, prop: { r: 1.5, n: 3, x: 0 }, wing: { cr: 2.2, ct: 1.5, x: -0.1, y: -0.05, dih: 0.2, sweep: 0.2, t: 0.26 }, tail: { x: -4.5, chord: 1.4, span: 2.8, fin: 1.4, finChord: 1.5, y: 0.2 }, canopy: [{ x0: 0.0, x1: 2.6, tx1: 2.1, h: 0.6 }], gear: 'float' },
  France: { name: 'Loire 130', nation: 'France', role: 'float', kind: 'mono', L: 11.3, span: 16.0, fus: { r: 0.7, ar: 1.1, x: -0.4 }, engine: { type: 'inline', r: 0.5, len: 1.1, pusher: true }, prop: { r: 1.6, n: 3, x: -0.4 }, wing: { cr: 2.2, ct: 1.4, x: -0.1, y: 0.6, dih: 0.2, sweep: 0.2, t: 0.26 }, tail: { x: -4.6, chord: 1.4, span: 2.8, fin: 1.4, finChord: 1.5, y: 0.9 }, canopy: [{ x0: 0.6, x1: 2.4, tx1: 2.0, h: 0.5 }], gear: 'float' },
  Italy: { name: 'IMAM Ro.43', nation: 'Italy', role: 'float', kind: 'bi', L: 9.67, span: 11.58, fus: { r: 0.5, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.7, len: 1.0 }, prop: { r: 1.25, n: 2, x: 0 }, wing: { cr: 1.8, ct: 1.5, x: 0.35, y: 0.0, gap: 1.5, dih: 0, sweep: 0.2, t: 0.12, stagger: 0.3 }, tail: { x: -4.7, chord: 1.4, span: 3.57, fin: 2.2, finChord: 1.4, y: 1.3 }, canopy: [{ x0: -0.9, x1: 0.6, tx1: 0.2, h: 0.55 }], gear: 'float', groundY: 1.26, v4: RO43_V4, paint: 'ro43', crease: 75 },      // the model's own central float and its two small ones under the lower wing; measured on it (tools/refs/planegroups.py); drawn at rest on its catapult, so its propeller is part of the whole
};
/** Height of the centre of gravity above the ground when the aircraft sits on its wheels. */
export function groundY(spec) { if (spec.groundY) return spec.groundY; return spec.fus.r * spec.fus.ar + (spec.gear === 'fixedbig' ? 1.15 : spec.gear === 'float' ? 1.06 : 0.95); }

/** Where each propeller turns, in the aircraft frame: [{ x, y, z, dir }] (the 'prop' mesh has its hub at the origin). A single engine is modelled on the axis: identity. */
export function propsOf(spec) { return spec.engines ? propMounts(spec) : [{ x: 0, y: 0, z: 0, dir: 1 }]; }

export function floatplaneSpec(nation) { return FLOATPLANES[nation] || FLOATPLANES.USA; }

/**
 * Where an aircraft burns: the places smoke and flames come from, in the frame of the model (x forward, y up, z to starboard).
 * { engines: [{ x, y, z }] (just behind each propeller, where the cowling ends), wings: { L, R } (the root of each wing, where the fuel is), tail: { x, y, z } }
 */
const siteCache = new Map();
export function damageSites(spec) {
  let d = siteCache.get(spec.name);
  if (d) return d;
  const w = spec.wing, wy = (w.y || 0) + (spec.kind === 'bi' ? (w.gap || 0) * 0.5 : 0);
  const engines = spec.engines
    ? propMounts(spec).map((m) => ({ x: m.x - 1.0, y: m.y, z: m.z }))
    : [{ x: spec.engine && spec.engine.pusher ? (spec.prop.x || 0) + 0.8 : spec.L * 0.42 - 0.7, y: 0, z: 0 }];
  // (the wing engines: the SM.79 has one in the nose as well, on the axis)
  const root = spec.engines ? Math.max(spec.span * 0.08, Math.min(...spec.engines.map((e) => Math.abs(e.z)).filter((z) => z > 0.5)) * 0.9) : spec.span * 0.14;
  d = { engines, wings: { L: { x: w.x - 0.2, y: wy, z: -root }, R: { x: w.x - 0.2, y: wy, z: root } }, tail: { x: spec.tail.x, y: spec.tail.y || 0.2, z: 0 } };
  siteCache.set(spec.name, d);
  return d;
}

/**
 * What each nation flies, role by role (the first of a list is the usual one; a type can be listed twice to be met twice as often): from its carriers ('dive' | 'torp' | 'fighter')
 * and from its airfields ('fighter' | 'level': land-based types come in as models are added, so list them under `base`).
 */
const ROSTER = {
  USA: { dive: ['sbd'], torp: ['tbf'], fighter: ['f6f', 'f4f', 'fm2'], level: ['b17'] }, Japan: { dive: ['d3a'], torp: ['b5n'], fighter: ['a6m'], level: ['g4m'] },
  UK: { dive: ['skua'], torp: ['swordfish'], fighter: ['fulmar'], level: ['lancaster'] }, USSR: { dive: ['il2'] },
  Germany: { dive: ['ju87'], torp: ['fi167'], fighter: ['bf109t'], level: ['he111'] }, France: { dive: ['ln401'], torp: ['pl10'], fighter: ['d520'], level: ['leo451'] },
  Italy: { dive: ['re2001'], torp: ['re2001t'], fighter: ['mc202'], level: ['sm79'] },
};
const ROSTER_BASE = {};      // the same shape: the roles that an airfield fills differently from a carrier

/** A stable number in [0, 1) from a name: the same carrier or airfield always flies the same type of a role. */
function pickOf(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/**
 * Which aircraft a nation flies for a role ('dive' | 'torp' | 'fighter' from its carriers, 'level': the land-based bomber of its airfields). `who` names the carrier or the airfield
 * (a ship's name, a base's id): when the nation has several types for the role, the name picks one, always the same; without it the usual type. `site`: 'base' for an airfield.
 */
export function planeTypeFor(nation, role, who, site) {
  const n = ROSTER[nation] ? nation : null, list = n && ((site === 'base' && ROSTER_BASE[n] && ROSTER_BASE[n][role]) || ROSTER[n][role]);
  if (!n) return { dive: 'sbd', torp: 'tbf', fighter: 'f6f', level: 'b17' }[role];
  if (!list || !list.length) return undefined;
  return list.length === 1 || who == null ? list[0] : list[Math.floor(pickOf(role + ':' + who) * list.length)];
}

/** Every type a nation can field for a role (carrier and airfield): to prepare the pictures, to list who flies what. */
export function planeTypesFor(nation, role) {
  const out = new Set([...(ROSTER[nation] && ROSTER[nation][role] || []), ...(ROSTER_BASE[nation] && ROSTER_BASE[nation][role] || [])]);
  return [...out];
}

/**
 * The height of a biplane's upper wing: 55 % of the gap above the axis, but never lower than the roof of the pilot's canopy (or the top of his head in an open cockpit)
 * and a hand's breadth over it: the wing does not cut through the canopy nor through the pilot's eyes.
 */
export function upperWingY(s) {
  const w = s.wing, c = s.canopy[0], ry0 = s.fus.r * s.fus.ar, yb = ry0 * 0.78;
  const top = c.open ? yb + c.h + 0.5 : yb + c.h * 0.92;
  return Math.max(w.gap * 0.55, top + 0.18 + w.t / 2);
}

/** The opening over the cockpit of a single-engine aircraft (the skin left out from the pilot's seat): { x0, x1 (along the aircraft), sn (how far down the sides) }. */
export function cockpitHole(s) {
  const c = s.canopy[0], ry0 = s.fus.r * s.fus.ar;
  if (c.open) return { x0: c.x0 - 0.05, x1: c.x1 + 0.02, sn: 0.6 };
  // (a long greenhouse runs on far ahead of the instrument panel: the skin is closed again just ahead of it, under the coaming; see model/cockpit.js)
  return { x0: c.x0, x1: Math.min(c.x1, cockpitEye(s).x + 1.0), sn: 0.74 };
}

// ---- low level helpers --------------------------------------------------------------------------------------

/** Lofted body along x: stations {x, ry, rz, yc, zc}. */
function loft(b, st, col, mat, o = {}) {
  const n = o.seg || 12;
  const rings = [], ys = [];
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    const prev = st[Math.max(0, i - 1)], next = st[Math.min(st.length - 1, i + 1)];
    const dx = next.x - prev.x || 1e-3;
    const slope = ((next.ry + next.rz) - (prev.ry + prev.rz)) * 0.5 / dx;      // dR/dx
    const ring = [];
    for (let k = 0; k < n; k++) {
      const th = (k / n) * PI * 2, sn = Math.sin(th), cs = Math.cos(th);
      const ry = Math.max(s.ry, 1e-3), rz = Math.max(s.rz, 1e-3);
      let ny = sn / ry, nz = cs / rz;
      const l = Math.hypot(ny, nz) || 1; ny /= l; nz /= l;
      const c = typeof col === 'function' ? col(sn) : col;
      ring.push(b.vert(s.x, (s.yc || 0) + ry * sn, (s.zc || 0) + rz * cs, -slope, ny, nz, c, mat, o.ao));
      ys.push(sn);
    }
    rings.push(ring);
  }
  // o.hole: { x0, x1, sn } the skin is left open between x0 and x1 over the top of each section (where the sine of the angle round it is above sn): the cockpit
  // opening, seen from the pilot's seat (a section's own top, so that the opening follows a fuselage that narrows towards the engine)
  const H = o.hole, open = (i, k) => H && st[i].x >= H.x0 - 1e-6 && st[i].x <= H.x1 + 1e-6 && ys[i * n + k] > H.sn;
  // wound counter-clockwise seen from outside whichever way the stations run along x
  const flip = st[0].x > st[st.length - 1].x;
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (open(i, k) && open(i, k2) && open(i + 1, k) && open(i + 1, k2)) continue;
      if (flip) b.quadIdx(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
      else b.quadIdx(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]);
    }
  }
  return rings;
}

/** Closed slab from the mid-surface corners A (root LE), B (tip LE), C (tip TE), D (root TE) with thickness th0 / th1. */
export function panel(b, A, B, C, D, th0, th1, top, bot, mat = MAT.AIRCRAFT) {
  const up = (P, t) => [P[0], P[1] + t / 2, P[2]], dn = (P, t) => [P[0], P[1] - t / 2, P[2]];
  const At = up(A, th0), Dt = up(D, th0), Bt = up(B, th1), Ct = up(C, th1);
  const Ab = dn(A, th0), Db = dn(D, th0), Bb = dn(B, th1), Cb = dn(C, th1);
  const ref = [(A[0] + B[0] + C[0] + D[0]) / 4, (A[1] + B[1] + C[1] + D[1]) / 4, (A[2] + B[2] + C[2] + D[2]) / 4];
  const edge = shade(top, 0.92);
  b.quad(At, Dt, Ct, Bt, top, mat, ref, 1);          // upper surface
  b.quad(Ab, Bb, Cb, Db, bot, mat, ref, 0.85);       // lower surface
  b.quad(At, Bt, Bb, Ab, edge, mat, ref, 1);         // leading edge
  b.quad(Dt, Db, Cb, Ct, edge, mat, ref, 1);         // trailing edge
  b.quad(Bt, Ct, Cb, Bb, edge, mat, ref, 1);         // tip
  b.quad(At, Ab, Db, Dt, edge, mat, ref, 1);         // root
}

/** Flat disc (national marking) lying in a plane. axis 'y' (wing) or 'z' (fuselage side). sign +1/-1 outward. */
export function disc(b, cx, cy, cz, r, axis, sign, col, mat = MAT.AIRCRAFT, lift = 0.012) {
  const n = 14;
  const pt = (a, rr) => (axis === 'y' ? [cx + Math.cos(a) * rr, cy + sign * lift, cz + Math.sin(a) * rr] : [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + sign * lift]);
  const c0 = pt(0, 0);
  const ref = axis === 'y' ? [cx, cy - sign, cz] : [cx, cy, cz - sign];
  for (let i = 0; i < n; i++) b.triFlat(c0, pt(i / n * PI * 2, r), pt((i + 1) / n * PI * 2, r), col, mat, ref, 1);
}
function bar(b, cx, cy, cz, hx, hz, axis, sign, col) {
  const l = 0.014;
  if (axis === 'y') b.quad([cx - hx, cy + sign * l, cz - hz], [cx + hx, cy + sign * l, cz - hz], [cx + hx, cy + sign * l, cz + hz], [cx - hx, cy + sign * l, cz + hz], col, MAT.AIRCRAFT, [cx, cy - sign, cz], 1);
  else b.quad([cx - hx, cy - hz, cz + sign * l], [cx + hx, cy - hz, cz + sign * l], [cx + hx, cy + hz, cz + sign * l], [cx - hx, cy + hz, cz + sign * l], col, MAT.AIRCRAFT, [cx, cy, cz - sign], 1);
}
/** National insignia on a surface. */
export function insignia(b, nation, cx, cy, cz, r, axis, sign) {
  const w = rgb('#f0eee6');
  switch (nation) {
    case 'USA': {
      disc(b, cx, cy, cz, r, axis, sign, rgb('#1f3a78'), MAT.AIRCRAFT, 0.012);
      disc(b, cx, cy, cz, r * 0.62, axis, sign, w, MAT.AIRCRAFT, 0.016);
      if (axis === 'y') {       // on a wing the bars run along the span: along the chord they would hang over the edges
        bar(b, cx, cy, cz - r * 1.5, r * 0.2, r * 0.62, axis, sign, w);
        bar(b, cx, cy, cz + r * 1.5, r * 0.2, r * 0.62, axis, sign, w);
      } else {
        bar(b, cx - r * 1.5, cy, cz, r * 0.62, r * 0.2, axis, sign, w);
        bar(b, cx + r * 1.5, cy, cz, r * 0.62, r * 0.2, axis, sign, w);
      }
      break;
    }
    case 'Japan': disc(b, cx, cy, cz, r * 0.82, axis, sign, rgb('#c7192a'), MAT.AIRCRAFT, 0.012); break;
    case 'UK': case 'France': {
      const outer = nation === 'UK' ? '#1f3a78' : '#1f3a78', mid = '#f0eee6', inner = '#c7192a';
      disc(b, cx, cy, cz, r, axis, sign, rgb(outer), MAT.AIRCRAFT, 0.012);
      disc(b, cx, cy, cz, r * 0.66, axis, sign, rgb(mid), MAT.AIRCRAFT, 0.016);
      disc(b, cx, cy, cz, r * 0.33, axis, sign, rgb(nation === 'UK' ? inner : inner), MAT.AIRCRAFT, 0.02);
      break;
    }
    case 'Germany': {
      bar(b, cx, cy, cz, r * 1.05, r * 0.3, axis, sign, rgb('#111111'));
      bar(b, cx, cy, cz, r * 0.3, r * 1.05, axis, sign, rgb('#111111'));
      break;
    }
    case 'Italy': {
      disc(b, cx, cy, cz, r * 0.9, axis, sign, w, MAT.AIRCRAFT, 0.012);
      bar(b, cx, cy, cz, r * 0.18, r * 0.62, axis, sign, rgb('#3a2418'));
      break;
    }
    case 'USSR': {        // the red star (a disc of red with a smaller disc of the camouflage colour would not do: the five points are drawn as kites from the centre)
      const red = rgb('#c42a24'), pt = (a, rr) => (axis === 'y' ? [cx + Math.cos(a) * rr, cy + sign * 0.014, cz + Math.sin(a) * rr] : [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + sign * 0.014]);
      const ref = axis === 'y' ? [cx, cy - sign, cz] : [cx, cy, cz - sign], c0 = pt(0, 0);
      for (let i = 0; i < 5; i++) {
        const a = -PI / 2 + i * PI * 2 / 5, tip = pt(a, r * 1.05), l = pt(a - PI / 5, r * 0.42), rt = pt(a + PI / 5, r * 0.42);
        b.triFlat(c0, l, tip, red, MAT.AIRCRAFT, ref, 1); b.triFlat(c0, tip, rt, red, MAT.AIRCRAFT, ref, 1);
      }
      break;
    }
    default: break;
  }
}

// ---- the generator -----------------------------------------------------------------------------------------

/**
 * Draw (part of) an aircraft into builder b. part: 'whole' | 'body' | 'wingL' | 'wingR' | 'tail' | 'prop' | 'gear' | 'hook' | 'ordnance'.
 */
export function drawPlane(b, s, { part = 'whole', key = null } = {}) {
  if (s.engines) { if (s.v4) drawV4Heavy(b, s, part); else drawHeavy(b, s, part); if (key) drawFixedGuns(b, s, key, part); return; }          // several engines: heavy.js
  if (s.v4 && part === 'gear' && !s.v4.PLANE.gear && s.gear !== 'float' && s.gear !== 'spats') { drawGear(b, s, rgb((PAINT[s.nation] || PAINT.USA).top), rgb('#25272a'), false); if (s.tailWheel === 'game') drawTailWheel(b, s, rgb('#25272a')); return; }          // the model has its undercarriage up: the game's own, down (the model's tail wheel stays)
  if (s.v4 && part !== 'hook' && part !== 'ordnance') { drawV4Plane(b, s, part); if (s.tailWheel === 'game' && s.gear === 'spats' && (part === 'body' || part === 'whole')) drawTailWheel(b, s, rgb('#25272a')); if (key) drawFixedGuns(b, s, key, part); return; }          // drawn from the pieces of its reference model (v4plane.js); the hook and the load stay procedural
  const P = PAINT[s.nation] || PAINT.USA;
  const top = rgb(P.top), bot = rgb(P.bot), acc = rgb(P.acc);
  const dark = rgb('#25272a'), glass = rgb('#33485a');
  const all = part === 'whole';
  const f = s.fus, e = s.engine, w = s.wing, t = s.tail;
  const noseX = s.L * 0.42;
  const tailX = noseX - s.L;
  const rz0 = f.r, ry0 = f.r * f.ar;
  const aftCut = t.x + t.chord * 0.2;            // the fuselage is split here: 'tail' group is behind
  const radialR = e.r;

  // ----- fuselage: station list from nose to tail (x decreasing) -----
  const stationsAt = (xa, xb) => {
    const all2 = [];
    const cowlEnd = noseX - 0.25 - e.len;
    const add = (x, ry, rz, yc = 0) => { if (x <= xa + 1e-6 && x >= xb - 1e-6) all2.push({ x, ry, rz, yc }); };
    if (e.pusher) {
      add(noseX, ry0 * 0.25, rz0 * 0.25); add(noseX - 0.4, ry0 * 0.75, rz0 * 0.75);
    } else if (e.type === 'radial') {
      add(noseX, radialR * 0.18, radialR * 0.18);
      add(noseX - 0.12, radialR * 0.55, radialR * 0.55);
      add(noseX - 0.28, radialR, radialR);
      add(cowlEnd + 0.3, radialR * 0.98, radialR * 0.98);
      add(cowlEnd, Math.max(ry0, radialR * 0.9), Math.max(rz0, radialR * 0.9));
    } else {
      add(noseX, e.r * 0.2, e.r * 0.2);
      add(noseX - 0.1, e.r * 0.62, e.r * 0.62);
      add(noseX - 0.35, e.r * 0.92, e.r * 0.95, -e.r * 0.05);
      add(cowlEnd + 0.1, e.r * 1.18, e.r * 1.05);
      add(cowlEnd - 0.6, ry0 * 0.98, rz0 * 0.9);
    }
    add(f.x + 0.8, ry0, rz0);
    add(f.x - 0.6, ry0 * 0.97, rz0 * 0.95);
    add(f.x - 1.9, ry0 * 0.8, rz0 * 0.78, ry0 * 0.05);
    add(aftCut, ry0 * 0.55, rz0 * 0.55, ry0 * 0.12);
    add((aftCut + tailX) / 2, ry0 * 0.34, rz0 * 0.32, ry0 * 0.2);
    add(tailX, 0.1, 0.07, ry0 * 0.28);
    return all2.sort((p, q) => q.x - p.x);
  };
  const skin = (sn) => (sn < -0.25 ? bot : top);

  const cabin = part === 'cabin';
  if (all || part === 'body' || cabin) {
    let st = stationsAt(noseX, aftCut);
    const cp = s.canopy[0];
    if (cabin) {
      // seen from the pilot's seat: stations at the two ends of the cockpit, and the skin open over it (the cockpit tub of model/cockpit.js fills the opening)
      const lerpSt = (x) => {
        for (let i = 0; i + 1 < st.length; i++) {
          const a = st[i], c = st[i + 1];
          if (x <= a.x && x >= c.x) { const t = (a.x - x) / (a.x - c.x || 1); return { x, ry: a.ry + (c.ry - a.ry) * t, rz: a.rz + (c.rz - a.rz) * t, yc: (a.yc || 0) + ((c.yc || 0) - (a.yc || 0)) * t }; }
        }
        return null;
      };
      for (const x of [cp.x0, cp.x1, cockpitHole(s).x1]) { const q = lerpSt(x); if (q && !st.some((t) => Math.abs(t.x - x) < 0.02)) st.push(q); }
      st = st.sort((p, q) => q.x - p.x);
    }
    loft(b, st, skin, MAT.AIRCRAFT, cabin ? { hole: cockpitHole(s) } : {});
    // engine details
    if (e.type === 'radial' && !e.pusher) {
      for (let k = 0; k < 9; k++) {   // exhaust stubs / cowl flaps
        const a = k / 9 * PI * 2;
        b.box(noseX - 1.1, Math.sin(a) * radialR * 0.98, Math.cos(a) * radialR * 0.98, 0.22, 0.08, 0.08, shade(top, 0.7), MAT.DARK);
      }
    } else if (e.type === 'inline') {
      // chin radiator and exhausts
      b.box(noseX - 1.5, -e.r * 1.0, 0, 0.9, 0.3, e.r * 0.8, shade(bot, 0.7), MAT.DARK);
      for (let k = -3; k <= 3; k++) if (k !== 0) b.box(noseX - 0.7 - Math.abs(k) * 0.14, e.r * 0.28, k * 0.1 + Math.sign(k) * 0.18, 0.18, 0.1, 0.06, dark, MAT.DARK);
    }
    // canopy: glazed greenhouse with metal frames (from the pilot's seat, his own canopy without its glass and without himself)
    for (const c of s.canopy) {
      const own = cabin && c === cp;
      const yb = ry0 * 0.78, h = c.h;
      if (c.open && own) {
        b.block({ x0: c.x1 - 0.05, x1: c.x1 + 0.03, hw: rz0 * 0.5, y0: yb + h * 0.3, y1: yb + h * 0.85, tx1: c.x1 - 0.2 }, glass, MAT.PANE);   // windscreen
      } else if (c.open) {
        b.block({ x0: c.x0, x1: c.x1, hw: rz0 * 0.55, y0: yb, y1: yb + h * 0.5 }, shade(dark, 0.9), MAT.DARK, { top: false });
        // the crewman's head over the coaming (the pilot's is not drawn from his seat): at the height of the eye of model/cockpit.js
        b.sphere((c.x0 + c.x1) / 2, yb + h + 0.27, 0, 0.13, 0.15, 0.12, rgb('#d9b99b'), MAT.CANOPY, { seg: 7, rings: 4 });
        b.sphere((c.x0 + c.x1) / 2, yb + h + 0.33, 0, 0.15, 0.13, 0.14, rgb('#3a2f25'), MAT.CANOPY, { seg: 7, rings: 4, half: true });   // helmet
        b.block({ x0: (c.x0 + c.x1) / 2 - 0.15, x1: (c.x0 + c.x1) / 2 + 0.1, hw: 0.22, y0: yb + h * 0.5, y1: yb + h + 0.14 }, rgb('#4a4436'), MAT.CANOPY);   // shoulders
        b.block({ x0: c.x1 - 0.05, x1: c.x1 + 0.03, hw: rz0 * 0.5, y0: yb + h * 0.3, y1: yb + h * 0.85, tx1: c.x1 - 0.2 }, glass, MAT.PANE);   // windscreen
      } else {
        if (own) continue;        // (from inside, the frames of the cockpit tub follow the glass instead)
        b.block({ x0: c.x0, x1: c.x1, hw: rz0 * 0.7, y0: yb - 0.04, y1: yb + h * 0.92, tx0: c.x0 + 0.25, tx1: c.tx1 - 0.15, thw: rz0 * 0.3 }, glass, MAT.PANE);
        for (const sz of [-1, 1]) b.beam([c.x0, yb, sz * rz0 * 0.72], [(c.x0 + c.x1) / 2, yb + h, sz * rz0 * 0.45], 0.05, 0.05, shade(top, 0.8), MAT.CANOPY, { caps: false });
        b.beam([c.x0 + (c.x1 - c.x0) * 0.35, yb + h * 0.1, -rz0 * 0.7], [c.x0 + (c.x1 - c.x0) * 0.35, yb + h * 0.95, 0], 0.05, 0.05, shade(top, 0.8), MAT.CANOPY, { caps: false });
      }
    }
    if (s.turret) b.sphere(f.x - 1.2, ry0 * 0.95, 0, 0.5, 0.42, 0.5, shade(top, 1.05), MAT.AIRCRAFT, { seg: 10, rings: 6, half: true });   // Avenger dorsal turret
    // antenna mast + pitot
    b.beam([f.x + 0.2, ry0 * 0.9, 0], [f.x + 0.2 - 0.55, ry0 * 0.9 + 0.55, 0], 0.04, 0.04, dark, MAT.DARK, { caps: false });
    // fuselage insignia (left and right)
    insignia(b, s.nation, f.x - 1.9, ry0 * 0.1, rz0 * 0.8, ry0 * 0.5, 'z', 1);
    insignia(b, s.nation, f.x - 1.9, ry0 * 0.1, -rz0 * 0.8, ry0 * 0.5, 'z', -1);
    // team band is added by the renderer through the tint of MAT.FLAG parts; fixed gear belongs to the body
    if (s.gear === 'spats' || s.gear === 'fixedbig') drawGear(b, s, top, dark, true);
  }

  // ----- tail -----
  if (all || part === 'tail') {
    const st = stationsAt(aftCut, tailX);
    loft(b, st, skin, MAT.AIRCRAFT);
    const tx = t.x, ty = t.y + ry0 * 0.15;
    for (const sg of [-1, 1]) {
      panel(b, [tx + t.chord * 0.6, ty, sg * 0.15], [tx + t.chord * 0.55 - 0.25, ty, sg * t.span / 2], [tx - t.chord * 0.1, ty, sg * t.span / 2], [tx - t.chord * 0.4, ty, sg * 0.15], 0.1, 0.06, top, bot);
    }
    // fin and rudder (t.plates: twin end-plate fins at the tailplane tips instead of a central one: LN.401)
    const fy = ry0 * 0.15;
    if (t.plates) {
      const ph = t.plates.h, pc = t.plates.chord;
      for (const sg of [-1, 1]) {
        const z0 = sg * t.span / 2, y0 = ty - ph * 0.5, y1 = ty + ph * 0.5;
        for (const fz of [0.05, -0.05]) b.quad([tx + pc * 0.5, y0, z0 + fz], [tx + pc * 0.5 - 0.2, y1, z0 + fz], [tx - pc * 0.5, y1 - 0.1, z0 + fz], [tx - pc * 0.5, y0, z0 + fz], top, MAT.AIRCRAFT, [tx, ty, z0 + fz * 40], 1);
      }
    } else {
    b.quad([tx + t.finChord * 0.4, fy, 0.05], [tx + t.finChord * 0.4 - 0.4, fy + t.fin, 0.05], [tx - t.finChord * 0.3, fy + t.fin * 0.95, 0.05], [tx - t.finChord * 0.45, fy, 0.05], top, MAT.AIRCRAFT, [tx, fy, -1], 1);
    b.quad([tx + t.finChord * 0.4, fy, -0.05], [tx - t.finChord * 0.45, fy, -0.05], [tx - t.finChord * 0.3, fy + t.fin * 0.95, -0.05], [tx + t.finChord * 0.4 - 0.4, fy + t.fin, -0.05], top, MAT.AIRCRAFT, [tx, fy, 1], 1);
    b.quad([tx + t.finChord * 0.4, fy, 0.05], [tx - t.finChord * 0.45, fy, 0.05], [tx - t.finChord * 0.45, fy, -0.05], [tx + t.finChord * 0.4, fy, -0.05], top, MAT.AIRCRAFT, [tx, fy + 1, 0], 1);
    // team identification band on the fin (tinted with the team colour by the renderer)
    b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, 0.062], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, 0.062], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, 0.062], [tx - t.finChord * 0.2, fy + t.fin * 0.82, 0.062], acc, MAT.TEAMBAND, [tx, fy, -1], 1);
    b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, -0.062], [tx - t.finChord * 0.2, fy + t.fin * 0.82, -0.062], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, -0.062], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, -0.062], acc, MAT.TEAMBAND, [tx, fy, 1], 1);
    }   // end of the central fin
    // tail wheel
    if (s.gear === 'float') b.beam([tx + 0.3, ry0 * 0.05, 0], [tx + 0.4, -ry0 * 0.5, 0], 0.07, 0.07, dark, MAT.DARK);
  }

  // ----- wings -----
  const wingSide = (sg) => {
    if (s.kind === 'bi') { biplaneWing(b, s, sg, top, bot, acc); return; }
    const hs = s.span / 2;
    const cr = w.cr, ct = w.ct;
    const yr = w.y, x0 = w.x;
    if (w.gull) {
      // inverted gull: the inner panel drops from the fuselage, the outer panel rises
      const kneeZ = hs * (w.kneeFrac ?? 0.3), drop = w.gull, rise = w.tipRise ?? 0.6;   // kneeFrac: where the wing bends (fraction of the half span), tipRise: how far the tip stands above the knee line
      const root = [[x0 + cr / 2, yr + 0.1, 0.0], [x0 - cr / 2, yr + 0.1, 0.0]];
      const knee = [[x0 + cr * 0.34 + 0.1, yr - drop * 0.5, sg * kneeZ], [x0 - cr * 0.34, yr - drop * 0.5, sg * kneeZ]];
      const tip = [[x0 + ct / 2 + w.sweep * 0.5, yr - drop * 0.1 + rise, sg * hs], [x0 - ct / 2 + w.sweep * 0.5, yr - drop * 0.1 + rise, sg * hs]];
      panel(b, root[0], knee[0], knee[1], root[1], w.t * 1.05, w.t * 0.9, top, bot);
      panel(b, knee[0], tip[0], tip[1], knee[1], w.t * 0.9, w.t * 0.5, top, bot);
      // the roundel sits on the outer panel, at 72 % of the half span: its height and the thickness of the panel there
      const fr = (0.72 * hs - kneeZ) / (hs - kneeZ), ym = (yr - drop * 0.5) + ((yr - drop * 0.1 + rise) - (yr - drop * 0.5)) * fr, hh = w.t * (0.9 - 0.4 * fr) / 2;
      const ri = Math.min(0.55, hs * 0.08);
      insignia(b, s.nation, x0 - 0.1 + w.sweep * 0.3, ym + hh + 0.05, sg * hs * 0.72, ri, 'y', 1);
      insignia(b, s.nation, x0 - 0.1 + w.sweep * 0.3, ym - hh - 0.05, sg * hs * 0.72, ri, 'y', -1);
      // wing leading-edge stripe (team colour)
      return;
    }
    const sweep = w.sweep, dih = w.dih;
    if (w.elliptic) {
      // elliptic planform approximated with 3 panels
      let prev = { c: cr, z: 0, le: x0 + cr / 2, y: yr };
      for (const u of [0.45, 0.8, 1.0]) {
        const c = u >= 1 ? Math.max(ct * 0.45, 0.35) : cr * Math.sqrt(1 - u * u) * 0.95 + ct * 0.05;
        const cur = { c, z: sg * hs * u, le: x0 + c / 2 + sweep * u * 0.4, y: yr + dih * u };
        panel(b, [prev.le, prev.y, prev.z], [cur.le, cur.y, cur.z], [cur.le - cur.c, cur.y, cur.z], [prev.le - prev.c, prev.y, prev.z], w.t * (1 - 0.5 * (prev.z ? Math.abs(prev.z) / hs : 0)), w.t * (1 - 0.6 * u), top, bot);
        prev = cur;
      }
    } else {
      const A = [x0 + cr / 2, yr, 0], B = [x0 + ct / 2 + sweep, yr + dih, sg * hs], C = [x0 - ct / 2 + sweep, yr + dih, sg * hs], D = [x0 - cr / 2, yr, 0];
      panel(b, A, B, C, D, w.t, w.t * 0.45, top, bot);
    }
    insignia(b, s.nation, x0 - 0.15, yr + dih * 0.65 + w.t * 0.32 + 0.05, sg * hs * 0.68, Math.min(0.62, hs * 0.09), 'y', 1);
    insignia(b, s.nation, x0 - 0.15, yr + dih * 0.65 - w.t * 0.32 - 0.05, sg * hs * 0.68, Math.min(0.62, hs * 0.09), 'y', -1);
  };
  if (all || part === 'wingR') wingSide(1);
  if (all || part === 'wingL') wingSide(-1);
  if (key) drawFixedGuns(b, s, key, part);          // the barrels of the guns in the wings and the cowling

  // ----- propeller -----
  if (part === 'prop') {
    const px = e.pusher ? s.prop.x - 0.9 : noseX + 0.02;
    const r = s.prop.r, n = s.prop.n;
    b.sphere(px + 0.02, 0, 0, e.pusher ? 0.2 : Math.max(0.2, e.r * 0.34), Math.max(0.2, e.r * 0.3), Math.max(0.2, e.r * 0.3), shade(top, 0.8), MAT.DARK, { seg: 10, rings: 6 });
    for (let k = 0; k < n; k++) {
      b.push().translate(px, 0, 0).rotateX(k / n * PI * 2);
      b.block({ x0: -0.07, x1: 0.09, hw: 0.11, zc: 0, y0: 0.15, y1: r, tx0: -0.04, tx1: 0.05, thw: 0.06 }, dark, MAT.DARK);
      b.block({ x0: -0.05, x1: 0.07, hw: 0.075, y0: r * 0.86, y1: r, tx0: -0.03, tx1: 0.04, thw: 0.05 }, rgb('#e4c13c'), MAT.DARK, { top: true });
      b.pop();
    }
  }

  // ----- retractable undercarriage (drawn only while it is down) -----
  if (part === 'gear' && s.gear !== 'float') { drawGear(b, s, top, dark, false); drawTailWheel(b, s, dark); }
  if ((all || part === 'body') && (s.gear === 'spats' || s.gear === 'fixedbig')) drawTailWheel(b, s, dark);

  // ----- arrester hook: the shank points aft from its pivot (origin of this part, see hookPivot) -----
  if (part === 'hook') {
    const hl = HOOK_LEN;
    b.beam([0, 0, 0], [-hl, 0, 0], 0.07, 0.07, dark, MAT.DARK);
    b.beam([-hl, 0, 0], [-hl - 0.18, -0.2, 0], 0.07, 0.07, rgb('#8a8a86'), MAT.DARK);       // the bare steel of the hook point
    b.block({ x0: -0.25, x1: 0.05, hw: 0.12, y0: -0.1, y1: 0.1 }, shade(top, 0.8), MAT.AIRCRAFT);   // the housing
  }
  if (part === 'gear' && s.gear === 'float') drawFloats(b, s, top, dark);
  if (all && s.gear === 'float') drawFloats(b, s, top, dark);

  // ----- ordnance -----
  if (part === 'ordnance') {
    if (s.ordnance === 'torp') drawTorpedo(b, 0, -(ry0 + 0.36), 0, 1);
    else if (s.ordnance === 'bomb') {
      // the usual load of the type (data/loadouts.js): the big bomb under the fuselage, the small ones under the wings, in pairs
      const key = Object.keys(PLANES).find((k) => PLANES[k] === s), ords = key ? bombsIn(loadoutsOf(key)[0]) : [];
      const bp = s.bombPos || {};      // (a sheet measured on its model says where the racks are: the crutch under the fuselage and the racks under the wings)
      const cx = bp.x ?? 0.2, cy = bp.y ?? -(ry0 + 0.32);
      if (!ords.length) drawBomb(b, cx, cy, 0, s.bombKg || 250);
      else ords.slice(0, 5).forEach((o, i) => {
        if (i === 0) drawBomb(b, cx, cy, 0, o.kg);
        else drawBomb(b, bp.wx ?? s.wing.x + 0.2, bp.wy ?? s.wing.y - 0.42, (i % 2 ? -1 : 1) * ((bp.wz ?? s.span * 0.2) + (bp.wdz ?? 0.55) * Math.floor((i - 1) / 2)), o.kg);
      });
    }
  }
}

/** Where the arrester hook is hinged (aircraft frame) and how long it is. */
export const HOOK_LEN = 1.1;
export function hookPivot(s) { return [s.tail.x + 1.3, -s.fus.r * s.fus.ar * 0.4]; }
/** How far behind the aircraft's origin the tip of the lowered hook trails (m). */
export function hookBack(s) { return -(s.tail.x + 1.3 - HOOK_LEN * Math.cos(0.62)); }
/** Nose-up attitude of the aircraft on its three wheels (rad); the tail wheel is drawn to touch the ground at this attitude. */
export const GROUND_PITCH = 0.14;

/** Tail wheel on its strut, long enough to hold the aircraft at GROUND_PITCH. */
function drawTailWheel(b, s, dark) {
  const w = s.wing, ry0 = s.fus.r * s.fus.ar;
  const wr = 0.16, xt = s.tail.x + 0.35;
  const yTop = -ry0 * 0.25;
  const yc = -groundY(s) + (w.x + 0.45 - xt) * Math.tan(GROUND_PITCH) + wr;
  b.beam([xt + 0.1, yTop, 0], [xt, yc, 0], 0.09, 0.09, dark, MAT.DARK);
  b.rodZ(xt, yc, -0.07, 0.07, wr, wr, rgb('#1b1b1b'), MAT.CANVAS, { seg: 8 });
}

function drawGear(b, s, top, dark, fixed) {
  const w = s.wing, hs = s.span / 2, ry0 = s.fus.r * s.fus.ar;
  const track = fixed && s.gear === 'fixedbig' ? 1.6 : hs * 0.2;
  const legTopY = s.kind === 'bi' ? -ry0 * 0.7 : w.y - 0.1;
  const wr = s.gear === 'fixedbig' ? 0.42 : 0.3;
  const gy = -(s.groundY || (ry0 + (s.gear === 'fixedbig' ? 1.15 : 0.95)));          // (a sheet that gives groundY, measured on its model: the wheels touch the ground it stands on)
  for (const sg of [-1, 1]) {
    b.beam([w.x + 0.25, legTopY, sg * track * 0.9], [w.x + 0.45, gy + wr, sg * track], 0.12, 0.12, shade(top, 0.75), MAT.AIRCRAFT);
    b.rodZ(w.x + 0.45, gy + wr, sg * track - 0.12, sg * track + 0.12, wr, wr, rgb('#1b1b1b'), MAT.CANVAS, { seg: 10 });
    if (s.gear === 'spats') {
      // streamlined wheel spat
      b.sphere(w.x + 0.45, gy + wr * 0.9, sg * (track + 0.1), 0.85, 0.5, 0.26, shade(top, 0.9), MAT.AIRCRAFT, { seg: 9, rings: 6 });
    }
  }
  if (s.gear === 'fixedbig') b.beam([w.x + 0.45, gy + wr, -track], [w.x + 0.45, gy + wr, track], 0.07, 0.07, dark, MAT.DARK);
}

function drawFloats(b, s, top, dark) {
  const ry0 = s.fus.r * s.fus.ar;
  const cx = s.wing.x - 0.2, len = s.L * 0.55;
  const fy = -(ry0 + 0.7);
  // central float
  const st = [
    { x: cx + len * 0.5, ry: 0.06, rz: 0.06, yc: fy + 0.1 }, { x: cx + len * 0.42, ry: 0.32, rz: 0.26, yc: fy }, { x: cx + len * 0.1, ry: 0.36, rz: 0.3, yc: fy },
    { x: cx - len * 0.3, ry: 0.3, rz: 0.26, yc: fy + 0.03 }, { x: cx - len * 0.5, ry: 0.07, rz: 0.06, yc: fy + 0.2 },
  ];
  loft(b, st, shade(top, 1.05), MAT.AIRCRAFT);
  for (const sg of [-1, 1]) {
    b.beam([cx + 0.7, -ry0 * 0.6, sg * 0.35], [cx + 0.9, fy + 0.2, sg * 0.15], 0.07, 0.07, dark, MAT.DARK);
    b.beam([cx - 0.7, -ry0 * 0.6, sg * 0.35], [cx - 0.9, fy + 0.2, sg * 0.15], 0.07, 0.07, dark, MAT.DARK);
    if (s.kind === 'mono' || s.kind === 'bi') {
      b.beam([cx, s.wing.y - 0.1, sg * s.span * 0.2], [cx, fy + 0.5, sg * s.span * 0.3], 0.06, 0.06, dark, MAT.DARK);
      b.sphere(cx, fy + 0.5, sg * s.span * 0.3, 0.5, 0.12, 0.12, shade(top, 1.0), MAT.AIRCRAFT, { seg: 8, rings: 4 });
    }
  }
}

function biplaneWing(b, s, sg, top, bot, acc) {
  const w = s.wing, hs = s.span / 2, gap = w.gap;
  const lowerSpan = hs * (w.lowerShort || 1);
  const yU = upperWingY(s), yL = -gap * 0.45;
  const xU = w.x + (w.stagger || 0), xL = w.x - (w.stagger || 0);
  // upper wing
  panel(b, [xU + w.cr / 2, yU, sg * 0.1], [xU + w.ct / 2 + w.sweep, yU + w.dih, sg * hs], [xU - w.ct / 2 + w.sweep, yU + w.dih, sg * hs], [xU - w.cr / 2, yU, sg * 0.1], w.t, w.t * 0.8, top, bot);
  // lower wing
  panel(b, [xL + w.cr / 2, yL, sg * 0.2], [xL + w.ct / 2 + w.sweep * 0.5, yL, sg * lowerSpan], [xL - w.ct / 2 + w.sweep * 0.5, yL, sg * lowerSpan], [xL - w.cr / 2, yL, sg * 0.2], w.t, w.t * 0.8, top, bot);
  insignia(b, s.nation, xU - 0.1, yU + w.dih * 0.6 + w.t * 0.5 + 0.06, sg * hs * 0.66, Math.min(0.7, hs * 0.1), 'y', 1);
  insignia(b, s.nation, xL - 0.1, yL - w.t * 0.5 - 0.06, sg * lowerSpan * 0.66, Math.min(0.7, hs * 0.1), 'y', -1);
  // interplane struts (N-struts) and cabane struts
  const strut = shade(top, 0.7);
  for (const u of [0.38, 0.8]) {
    const zz = sg * hs * u * (u > 0.7 ? lowerSpan / hs : 1);
    for (const dx of [0.7, -0.7]) b.beam([xU + dx * (w.cr / 2) * 0.8, yU - w.t / 2, zz], [xL + dx * (w.cr / 2) * 0.8, yL + w.t / 2, zz], 0.07, 0.07, strut, MAT.AIRCRAFT);
  }
  const ry0 = s.fus.r * s.fus.ar;
  b.beam([w.x + 0.5, ry0 * 0.7, sg * 0.35], [xU + 0.4, yU - w.t / 2, sg * 0.9], 0.06, 0.06, strut, MAT.AIRCRAFT);
  // bracing wires
  b.beam([xU, yU - w.t / 2, sg * hs * 0.38], [xL, yL + w.t / 2, sg * 0.4], 0.018, 0.018, shade(strut, 0.6), MAT.DARK, { caps: false });
}

/** Aerial torpedo: cylinder with rounded nose, contra-rotating props and fins (origin = centre). */
export function drawTorpedo(b, x, y, z, scale = 1) {
  const len = 5.3 * scale, r = 0.225 * scale;
  const body = rgb('#5d6468'), warm = rgb('#9a7a3a'), dark = rgb('#2a2c2e');
  const st = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n, xx = x + len / 2 - u * len;
    let rr = r;
    if (u < 0.1) rr = r * Math.sqrt(1 - Math.pow(1 - u / 0.1, 2));
    else if (u > 0.82) rr = r * (1 - 0.6 * (u - 0.82) / 0.18);
    st.push({ x: xx, ry: Math.max(rr, 0.02), rz: Math.max(rr, 0.02), yc: y, zc: z });
  }
  loft(b, st, (sn) => (sn > 0.8 ? warm : body), MAT.HULL, { seg: 10 });
  b.cylinder(x - len / 2 - 0.05, y - 0.02, z, 0.05, 0.02, y + 0.02, dark, MAT.DARK, { seg: 4 });
  const xt = x - len / 2 + 0.3;
  b.box(xt, y, z, 0.5, 0.04, r * 4.2, dark, MAT.DARK);
  b.box(xt, y, z, 0.5, r * 4.2, 0.04, dark, MAT.DARK);
  b.box(x + len * 0.18, y + r * 0.9, z, 0.18, 0.07, 0.1, dark, MAT.DARK);       // exploder pistol
}

/** General purpose bomb (centre = origin), mass decides the size. */
export function drawBomb(b, x, y, z, kg = 250) {
  const sc = Math.cbrt(kg / 250);
  const len = 1.45 * sc, r = 0.2 * sc;
  const body = rgb('#4c5648'), band = rgb('#d6b43a'), dark = rgb('#24272a');
  const st = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const u = i / n, xx = x + len * 0.5 - u * len;
    let rr = r;
    if (u < 0.2) rr = r * Math.sqrt(1 - Math.pow(1 - u / 0.2, 2));
    else if (u > 0.62) rr = r * (1 - 0.72 * (u - 0.62) / 0.38);
    st.push({ x: xx, ry: Math.max(rr, 0.02), rz: Math.max(rr, 0.02), yc: y, zc: z });
  }
  loft(b, st, (sn) => body, MAT.HULL, { seg: 9 });
  b.cylinder(x + len * 0.18, y - 0.0, z, r * 1.01, r * 1.01, y + 0.0, band, MAT.HULL, { seg: 3 });
  const xt = x - len * 0.4;
  b.box(xt, y, z, len * 0.28, 0.03, r * 3.4, dark, MAT.DARK);
  b.box(xt, y, z, len * 0.28, r * 3.4, 0.03, dark, MAT.DARK);
}

// ---- complete, GPU-ready aircraft models --------------------------------------------------------------------
const cache = new Map();

/**
 * Build (once) the meshes of an aircraft type. Returns { spec, meshes: { whole, body, wingL, wingR, tail, prop, gear, ordnance, ... } (built
 * mesh descriptors; a bomber has the extra pieces listed at the top), radius, groundY, props: [{ x, y, z, dir }], bayPivot }.
 */
export function getPlaneModel(typeKey) {
  let m = cache.get(typeKey);
  if (m) return m;
  const spec = PLANES[typeKey];
  const out = {};
  const parts = ['whole', 'body', 'wingL', 'wingR', 'tail', 'prop', 'gear', 'hook', 'ordnance'];
  if (!spec.engines) parts.push('cabin');      // the fuselage seen from the pilot's seat: open over the cockpit, his own canopy without its glass
  if (spec.engines) parts.push('bay', 'hull', ...spec.engines.map((e, i) => 'eng' + i), ...spec.engines.map((e, i) => 'burn' + i));      // the open bomb doors, the hull seen from the pilot's seat, the engines as pieces of their own
  for (const part of parts) {
    const b = new MeshBuilder();
    drawPlane(b, spec, { part, key: typeKey });
    out[part] = b.vertexCount ? b.build(spec.v4 ? { ao: false } : {}) : null;      // (no baked occlusion on a model drawn from reference pieces: its many small triangles make it blotchy)
  }
  // the guns of each gun position, each in its own frame (they turn: render/aircraftVisual.js)
  const guns = planeGuns(spec, typeKey);
  for (const g of guns) { const b = new MeshBuilder(); drawGunHead(b, g); out['gun' + g.id] = b.build(); }
  const ry0 = spec.fus.r * spec.fus.ar;
  m = { key: typeKey, spec, meshes: out, guns, radius: Math.hypot(spec.span / 2, spec.L / 2), groundY: spec.groundY || ry0 + (spec.gear === 'fixedbig' ? 1.15 : 0.95), props: propsOf(spec), bayPivot: spec.bay ? bayPivot(spec) : null };
  cache.set(typeKey, m);
  return m;
}

/** Catapult floatplane meshes (no ordnance, floats drawn with the whole). */
export function getFloatplaneModel(nation) {
  const spec = floatplaneSpec(nation);
  const key = 'float:' + nation;
  let m = cache.get(key);
  if (m) return m;
  const b = new MeshBuilder();
  drawPlane(b, spec, { part: 'whole' });
  m = { key, spec, meshes: { whole: b.build() } };
  cache.set(key, m);
  return m;
}

/** A naval shell of unit length along +x (nose forward): AP = ogive with a ballistic cap and a dark body, HE = blunter ogive with a fuze and a yellow band. */
export function drawShell(b, type = 'AP') {
  const ap = type === 'AP';
  const len = 1, r = 0.125;
  const body = ap ? rgb('#3d4144') : rgb('#6a7048'), cap = ap ? rgb('#d9d4c4') : rgb('#2a2d2f'), band = rgb('#cfa83a'), cu = rgb('#b4762f');
  const st = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n, xx = len * 0.5 - u * len;
    let rr = r;
    const og = ap ? 0.34 : 0.24;                                 // length of the ogive
    if (u < og) rr = r * Math.sqrt(1 - Math.pow(1 - u / og, 2) * (ap ? 0.92 : 0.97));
    else if (u > 0.9) rr = r * (1 - 0.14 * (u - 0.9) / 0.1);     // boat tail
    st.push({ x: xx, ry: Math.max(rr, 0.012), rz: Math.max(rr, 0.012), yc: 0, zc: 0 });
  }
  loft(b, st, body, MAT.HULL, { seg: 12 });
  const capLen = ap ? 0.13 : 0.07, ogv = ap ? 0.34 : 0.24, u0 = capLen;
  const capR = r * Math.sqrt(1 - Math.pow(1 - u0 / ogv, 2) * (ap ? 0.92 : 0.97)) + 0.004;
  b.rod(len * 0.5 - capLen, len * 0.5, 0, 0, capR, 0.014, cap, MAT.HULL, { seg: 12, capTop: true });                   // the ballistic cap / the fuze
  b.rod(-len * 0.3, -len * 0.25, 0, 0, r * 1.02, r * 1.02, ap ? cu : band, MAT.HULL, { seg: 12, capTop: false });      // the driving band
  if (!ap) b.rod(len * 0.12, len * 0.17, 0, 0, r * 1.02, r * 1.02, band, MAT.HULL, { seg: 12, capTop: false });         // the yellow HE band
}

/** A ship-launched missile (origin = centre, nose towards +x): 'sam' the 4.7 m RIM-24 Tartar (white body, four wings and four tail fins), 'asroc' the 4.5 m rocket with its torpedo payload. */
export function drawMissile(b, kind) {
  if (kind === 'harpoon' || kind === 'tomahawk') {            // the cruise missiles: a slim white body with its booster behind, pop-out wings and tail fins
    const tl = kind === 'tomahawk', len = tl ? 6.25 : 5.4, r = tl ? 0.26 : 0.17;
    const body = rgb(tl ? '#cfd2cf' : '#d8d6cc'), nose = rgb(tl ? '#6d7276' : '#c9772c'), dark = rgb('#2a2c2e'), band = rgb('#9a9ea2');
    b.rod(-len / 2, len * 0.34, 0, 0, r, r, body, MAT.HULL, { seg: 12, capTop: false });
    b.rod(len * 0.34, len / 2, 0, 0, r, 0.025, nose, MAT.HULL, { seg: 12, capTop: true });                                          // the nose
    b.rod(-len / 2, -len / 2 + (tl ? 0.8 : 0.7), 0, 0, r * 1.04, r * 1.04, band, MAT.HULL, { seg: 12, capTop: false });                // the booster
    const fin = (x0, x1, span, th, ang0) => { for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2 + ang0), s2 = Math.sin(a * Math.PI / 2 + ang0); b.beam([x0, c * r, s2 * r], [x1, c * (r + span), s2 * (r + span)], th, th, dark, MAT.DARK, { caps: false }); } };
    fin(-len / 2 + 0.1, -len / 2 + 0.55, tl ? 0.38 : 0.3, 0.035, Math.PI / 4);
    if (tl) { for (const sz of [-1, 1]) b.beam([0.2, 0, sz * r], [0.55, 0, sz * 1.33], 0.045, 0.045, dark, MAT.DARK, { caps: false }); }
    else fin(len * 0.02, len * 0.12, 0.36, 0.03, 0);
    return;
  }
  const asroc = kind === 'asroc', len = asroc ? 4.5 : 4.7, r = asroc ? 0.19 : 0.17;
  const body = rgb(asroc ? '#8c9096' : '#d6d8d4'), dark = rgb('#2a2c2e'), band = rgb(asroc ? '#c9a23a' : '#9aa0a4');
  b.rod(-len / 2, len * 0.28, 0, 0, r, r, body, MAT.HULL, { seg: 12, capTop: false });
  b.rod(len * 0.28, len / 2, 0, 0, r, 0.02, asroc ? rgb('#5d6468') : dark, MAT.HULL, { seg: 12, capTop: true });                  // the nose
  b.rod(-len / 2, -len / 2 + 0.5, 0, 0, r * 1.02, r * 1.02, band, MAT.HULL, { seg: 12, capTop: false });                       // the booster band
  const fin = (x0, x1, span, th) => { for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2), s2 = Math.sin(a * Math.PI / 2); b.beam([x0, c * r, s2 * r], [x1, c * (r + span), s2 * (r + span)], th, th, body, MAT.HULL, { caps: false }); } };
  fin(-len / 2 + 0.15, -len / 2 + 0.75, 0.42, 0.04);
  if (!asroc) fin(0.35, 0.95, 0.3, 0.035);
}

/** Standalone ordnance meshes, for the objects in flight: { bomb250, bomb500, torpedo, shellAP, shellHE, missileSam, missileAsroc }. */
export function buildOrdnanceMeshes() {
  const mk = (fn) => { const b = new MeshBuilder(); fn(b); return b.build(); };
  return {
    bomb250: mk((b) => drawBomb(b, 0, 0, 0, 250)),
    bomb500: mk((b) => drawBomb(b, 0, 0, 0, 500)),
    torpedo: mk((b) => drawTorpedo(b, 0, 0, 0, 1)),
    shellAP: mk((b) => drawShell(b, 'AP')),
    shellHE: mk((b) => drawShell(b, 'HE')),
    missileSam: mk((b) => drawMissile(b, 'sam')),
    missileAsroc: mk((b) => drawMissile(b, 'asroc')),
    missileHarpoon: mk((b) => drawMissile(b, 'harpoon')),
    missileTomahawk: mk((b) => drawMissile(b, 'tomahawk')),
  };
}
