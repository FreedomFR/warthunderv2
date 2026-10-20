// Spec sheets of the land-based bombers (one per nation), read by heavy.js. No imports: planes.js builds PLANES from this.
// All the distances `d` are metres from the tip of the nose along the fuselage; `cg` is the distance of the model's origin from the nose. Heights `y` are
// relative to the axis of the fuselage, `z` to starboard. What was measured on the three-view drawings (a line drawing of each type, see CHANGELOG) is in
// the notes; the rest comes from the published dimensions (length, span, wing area, tailplane span, propeller diameter) and is marked `estimated`.
// body: stations [d, half height, half width, centre height, section exponent (2 ellipse, 3 squarish)].
// engines: { d (propeller plane), z, y, r (cowling radius), len (cowling), aft (d where the nacelle ends), type, chin (radiator under an inline), gear (the main
//   wheel retracts into it), dir (+1 / -1: sense of rotation) }, numbered from the port wing tip to the starboard one.
// wing.plan: [u (fraction of the half span), leading edge d, trailing edge d] (a panel between each two); tail.tp: tailplane root and tip edges; tail.fins: [{ z, th, sec: [[y, leading edge d, trailing edge d]] }].

const ENGINE_DEFAULTS = { gear: true, dir: 1 };

/** The sections of an elliptical fin from y0 to y1, whose widest chord runs from d0 to d1 (an ellipse, a little leaning aft towards the top; the ends are cut at 15 % of the chord). */
function oval(y0, y1, d0, d1, lean = 0.3, n = 7) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 2 * t - 1, c = (d1 - d0) * Math.max(0.16, Math.sqrt(Math.max(0, 1 - u * u)));
    const mid = (d0 + d1) / 2 + lean * (t - 0.5) * (d1 - d0);
    out.push([y0 + (y1 - y0) * t, mid - c * 0.5, mid + c * 0.5]);
  }
  return out;
}

/** Fills in what the generic code reads (fus, engine, prop, wing.x ...) from the sheet. */
function finalize(s) {
  const X = (d) => s.cg - d;
  const ryMax = Math.max(...s.body.map((q) => q[1])), rzMax = Math.max(...s.body.map((q) => q[2]));
  s.fus = { r: rzMax, ar: ryMax / rzMax, x: X(s.insD) };
  s.engines = s.engines.map((e) => ({ ...ENGINE_DEFAULTS, ...e }));
  const e0 = s.engines[0];
  s.engine = { type: e0.type, r: e0.r, len: e0.len };
  s.prop = { ...s.prop, x: 0 };
  const w = s.wing, p0 = w.plan[0], pN = w.plan[w.plan.length - 1];
  w.cr = p0[2] - p0[1]; w.ct = pN[2] - pN[1]; w.x = X((p0[1] + p0[2]) / 2);
  w.sweep = (pN[1] + pN[2]) / 2 - (p0[1] + p0[2]) / 2; w.t = w.cr * (w.tc ?? 0.16);
  const t = s.tail, tp = t.tp;
  t.x = X((tp.le0 + tp.te0) / 2); t.chord = tp.te0 - tp.le0;
  const f0 = t.fins[0];
  t.fin = f0.sec[f0.sec.length - 1][0] - f0.sec[0][0]; t.finChord = Math.max(...f0.sec.map((q) => q[2] - q[1])) * 0.8;      // the mean chord is about 0.8 of the widest one
  const c = (s.cabin || [])[0] || { d0: 3, d1: 5, h: 0.5 };
  s.canopy = [{ x0: X(c.d1), x1: X(c.d0), tx1: X(c.d0 + (c.d1 - c.d0) * 0.1), h: c.h }];
  s.eye = { x: X(s.eyeD[0]), y: s.eyeD[1], z: s.eyeD[2] };
  const gearEngines = s.engines.filter((e) => e.gear);
  s.groundY = s.gearGeom.leg + s.gearGeom.wr - gearEngines.reduce((a, e) => a + e.y, 0) / gearEngines.length;
  s.gear = 'retract'; s.ordnance = 'bay'; s.heavy = true;
  return s;
}

export const HEAVY = {
  // ---- USA: B-17G (22.66 m, 31.62 m, 5.82 m; wing 131.9 m2; four Wright R-1820, 3.5 m propellers) ----
  b17: finalize({
    name: 'Boeing B-17G Flying Fortress', nation: 'USA', role: 'level', kind: 'mono', L: 22.66, span: 31.62, mass: 24.5, hp: 14, bombKg: 2700,
    cg: 8.6, paint: { top: '#5b5f3f', bot: '#a9aba0', acc: '#e8e6dc' },
    body: [[0, 0.1, 0.08, -0.2], [0.5, 0.62, 0.52, -0.2], [1.0, 0.9, 0.73, -0.2], [1.5, 1.1, 0.9, -0.12], [2.0, 1.12, 0.92, -0.1], [2.5, 1.1, 1.0, -0.12], [3.0, 1.15, 1.07, -0.07],
      [3.5, 1.3, 1.12, 0.02], [4.5, 1.34, 1.18, 0.01], [7.0, 1.35, 1.2, 0.0], [9.0, 1.27, 1.2, -0.1], [10.5, 1.18, 1.2, -0.2], [12.0, 1.1, 1.17, -0.22], [14.0, 1.0, 0.93, -0.23],
      [16.0, 0.85, 0.78, -0.2], [18.0, 0.72, 0.65, -0.16], [19.5, 0.62, 0.58, -0.12], [21.0, 0.45, 0.41, -0.15], [22.0, 0.3, 0.29, -0.15], [22.5, 0.1, 0.1, -0.15]],
    glass: [{ d0: 0.3, d1: 2.9, a0: -30, a1: 82, sym: true, nu: 3, nv: 3 }],
    cabin: [{ d0: 3.4, d1: 6.0, y0: 0.82, h: 0.5, hw: 0.78 }],
    windows: [{ d: 2.9, y: 0.1, w: 0.4, h: 0.3 }, { d: 3.4, y: 0.1, w: 0.4, h: 0.3 }],
    guns: [{ t: 'chin', d: 1.9, r: 0.42 }, { t: 'nose', d: 0.8, y: 0.0, z: 0.0 }, { t: 'dome', d: 5.3, r: 0.5, n: 2, len: 1.2 }, { t: 'ball', d: 10.9, r: 0.62 },
      { t: 'beam', d: 13.1, y: 0.15, side: 1, w: 0.8, h: 0.55 }, { t: 'beam', d: 14.4, y: 0.15, side: -1, w: 0.8, h: 0.55 }, { t: 'tail', d: 21.38, r: 0.4, n: 2, len: 0.8 }],
    engines: [{ d: 3.0, z: -6.5, y: -0.1, r: 0.76, len: 1.15, aft: 6.9, type: 'radial', gear: false }, { d: 2.7, z: -2.9, y: -0.28, r: 0.76, len: 1.15, aft: 7.3, type: 'radial' },
      { d: 2.7, z: 2.9, y: -0.28, r: 0.76, len: 1.15, aft: 7.3, type: 'radial' }, { d: 3.0, z: 6.5, y: -0.1, r: 0.76, len: 1.15, aft: 6.9, type: 'radial', gear: false }],
    prop: { r: 1.76, n: 3 },
    wing: { plan: [[0, 4.7, 10.4], [0.3, 5.0, 9.8], [1.0, 6.75, 8.2]], y: -0.45, dih: 1.0, tc: 0.18, flaps: [0.1, 0.55], ail: [0.62, 0.97], boots: [0.05, 0.98] },
    tail: { tp: { le0: 16.4, te0: 19.5, le1: 17.9, te1: 19.1 }, span: 12.6, y: 0.3, fins: [{ z: 0, th: 0.18, sec: [[0.4, 8.5, 21.0], [1.4, 11.0, 20.8], [2.9, 14.9, 20.5], [3.9, 17.4, 20.2], [4.45, 18.4, 19.9]] }] },
    cutD: 15.6, insD: 15.0, mastD: 5.2, bay: { d0: 6.6, d1: 10.6, hw: 0.45, n: 12, kg: 227, cols: 3 },
    gearD: 6.4, tailWheelD: 21.0, gearGeom: { wr: 0.56, leg: 2.09 }, eyeD: [4.1, 1.1, -0.42],
  }),

  // ---- Japan: G4M1 Betty (19.97 m, 24.89 m, 4.9 m; wing 78.1 m2; two Kasei 11 radials) ----
  g4m: finalize({
    name: 'Mitsubishi G4M1 Type 1 (Betty)', nation: 'Japan', role: 'level', kind: 'mono', L: 19.97, span: 24.89, mass: 9.5, hp: 7, bombKg: 800,
    cg: 8.0,
    body: [[0, 0.1, 0.08, 0.1], [0.5, 0.53, 0.56, 0.16], [1.0, 0.75, 0.71, 0.16], [1.5, 0.93, 0.81, 0.1], [2.0, 0.99, 0.86, 0.13], [3.0, 1.15, 0.93, 0.16], [4.0, 1.22, 0.94, 0.14],
      [5.0, 1.27, 0.94, 0.1], [7.0, 1.37, 0.98, -0.02], [9.0, 1.4, 1.0, -0.04], [11.0, 1.35, 1.0, 0.0], [13.0, 1.2, 0.98, 0.0], [15.0, 1.15, 0.94, -0.02], [16.0, 1.1, 0.91, -0.04],
      [17.5, 0.95, 0.78, -0.02], [18.5, 0.7, 0.55, -0.16], [19.3, 0.4, 0.3, -0.29], [19.97, 0.12, 0.1, -0.35]],
    glass: [{ d0: 0.2, d1: 3.4, a0: -30, a1: 80, sym: true, nu: 5, nv: 3 }, { d0: 18.3, d1: 19.7, a0: -20, a1: 80, sym: true, nu: 2, nv: 2 }],
    cabin: [{ d0: 3.0, d1: 6.0, y0: 0.76, h: 0.6, hw: 0.72 }],
    windows: [{ d: 6.6, y: 0.2, w: 0.45, h: 0.35 }, { d: 7.3, y: 0.2, w: 0.45, h: 0.35 }],
    guns: [{ t: 'nose', d: 0.8, y: -0.05, z: 0.0 }, { t: 'dome', d: 9.0, r: 0.48, n: 1, len: 1.5 }, { t: 'blister', d: 11.6, y: 0.2, side: 1, r: 0.5 }, { t: 'blister', d: 11.6, y: 0.2, side: -1, r: 0.5 },
      { t: 'tail', d: 18.51, r: 0.3, n: 1, len: 1.1 }],
    engines: [{ d: 2.9, z: -2.8, y: -0.2, r: 0.82, len: 1.3, aft: 8.8, type: 'radial' }, { d: 2.9, z: 2.8, y: -0.2, r: 0.82, len: 1.3, aft: 8.8, type: 'radial' }],
    prop: { r: 1.7, n: 3 },
    wing: { plan: [[0, 5.2, 10.0], [0.35, 5.7, 9.3], [1.0, 6.7, 7.7]], y: -0.25, dih: 0.8, tc: 0.17, flaps: [0.1, 0.6], ail: [0.65, 0.97] },
    tail: { tp: { le0: 16.45, te0: 19.3, le1: 17.3, te1: 18.6 }, span: 9.75, y: 0.3, fins: [{ z: 0, th: 0.16, sec: [[0.3, 8.5, 19.35], [1.4, 10.6, 19.15], [2.5, 13.9, 18.95], [3.65, 18.0, 18.7]] }] },
    cutD: 14.6, insD: 13.3, bay: { d0: 5.6, d1: 9.4, hw: 0.45, n: 1, kg: 800 },
    gearD: 6.2, tailWheelD: 18.2, gearGeom: { wr: 0.55, leg: 1.84 }, eyeD: [3.4, 1.0, -0.38],
  }),

  // ---- UK: Lancaster B.I (21.13 m, 31.09 m, 6.25 m; wing 120.5 m2; four Merlin, 3.96 m propellers; twin fins) ----
  lancaster: finalize({
    name: 'Avro Lancaster B.I', nation: 'UK', role: 'level', kind: 'mono', L: 21.13, span: 31.09, mass: 25.4, hp: 14, bombKg: 6400,
    cg: 8.4, paint: { top: '#4a5236', bot: '#2e3032', acc: '#c8c6bc' },
    body: [[0.5, 0.25, 0.25, -0.35], [0.9, 0.7, 0.51, -0.25], [1.0, 0.98, 0.71, -0.12], [1.5, 1.1, 0.82, 0.0], [2.0, 1.16, 0.9, 0.05, 2.4], [3.0, 1.3, 0.91, 0.12, 2.6], [5.0, 1.38, 0.91, 0.12, 2.8],
      [7.0, 1.38, 0.91, 0.1, 3], [9.0, 1.34, 0.91, 0.05, 3], [12.0, 1.28, 0.91, -0.03, 3], [14.0, 1.12, 0.88, 0.0, 3], [16.0, 0.92, 0.75, 0.1, 2.6], [18.0, 0.72, 0.55, 0.22],
      [19.4, 0.5, 0.38, 0.32], [20.1, 0.3, 0.22, 0.35], [20.4, 0.1, 0.1, 0.35]],
    glass: [{ d0: 0.5, d1: 2.4, a0: -20, a1: 82, sym: true, nu: 2, nv: 3 }],
    cabin: [{ d0: 3.1, d1: 5.6, y0: 0.82, h: 0.6, hw: 0.72 }],
    windows: [{ d: 11.2, y: 0.4, w: 0.3, h: 0.3 }, { d: 12.0, y: 0.4, w: 0.3, h: 0.3 }, { d: 13.8, y: 0.4, w: 0.3, h: 0.3 }, { d: 14.6, y: 0.4, w: 0.3, h: 0.3 }],
    guns: [{ t: 'fturret', d: 0.9, y: -0.05, r: 0.36 }, { t: 'dome', d: 10.6, r: 0.55, n: 2, len: 1.0 }, { t: 'tail', d: 19.53, r: 0.5, n: 4, len: 1.0 }],
    engines: [{ d: 3.9, z: -7.8, y: 0.05, r: 0.52, len: 2.2, aft: 8.4, type: 'inline', chin: true, gear: false }, { d: 3.3, z: -3.5, y: 0.05, r: 0.52, len: 2.2, aft: 10.6, type: 'inline', chin: true },
      { d: 3.3, z: 3.5, y: 0.05, r: 0.52, len: 2.2, aft: 10.6, type: 'inline', chin: true }, { d: 3.9, z: 7.8, y: 0.05, r: 0.52, len: 2.2, aft: 8.4, type: 'inline', chin: true, gear: false }],
    prop: { r: 1.98, n: 3 },
    wing: { plan: [[0, 5.1, 10.8], [0.5, 5.75, 10.0], [1.0, 7.05, 9.2]], y: 0.05, dih: 0.9, tc: 0.16, flaps: [0.1, 0.6], ail: [0.68, 0.98], boots: [0.05, 0.98] },
    tail: { tp: { le0: 16.9, te0: 19.6, le1: 17.3, te1: 19.2 }, span: 10.2, y: 0.3,
      fins: [{ z: -4.6, th: 0.14, sec: oval(-0.7, 3.9, 17.5, 20.5, 0.1) }, { z: 4.6, th: 0.14, sec: oval(-0.7, 3.9, 17.5, 20.5, 0.1) }] },
    cutD: 16.5, insD: 14.2, bay: { d0: 6.0, d1: 15.0, hw: 0.55, n: 6, kg: 1000, cols: 2 },
    gearD: 6.4, tailWheelD: 19.7, gearGeom: { wr: 0.62, leg: 2.63 }, eyeD: [3.8, 1.2, -0.4],
  }),

  // ---- Germany: He 111 H (16.4 m, 22.6 m, 4.0 m; wing 87.6 m2; two Jumo 211) ----
  he111: finalize({
    name: 'Heinkel He 111 H-6', nation: 'Germany', role: 'level', kind: 'mono', L: 16.4, span: 22.6, mass: 12.0, hp: 8.5, bombKg: 2000,
    cg: 6.6, paint: { top: '#4f5a44', bot: '#8da3b7', acc: '#1c1c1c' },
    body: [[0, 0.08, 0.08, 0], [0.5, 0.5, 0.32, 0], [1.0, 0.8, 0.56, 0], [1.5, 0.95, 0.71, -0.2], [2.0, 1.0, 0.79, -0.22], [2.5, 1.1, 0.83, -0.25], [4.0, 1.15, 0.92, -0.25],
      [5.5, 1.15, 0.98, -0.25], [7.5, 1.1, 0.9, -0.22], [9.0, 0.98, 0.75, -0.15], [10.5, 0.9, 0.68, -0.08], [12.0, 0.8, 0.58, 0.0], [13.3, 0.66, 0.46, 0.08], [14.5, 0.52, 0.3, 0.22],
      [15.6, 0.38, 0.17, 0.27], [16.4, 0.1, 0.08, 0.3]],
    glass: [{ d0: 0.12, d1: 2.9, a0: -45, a1: 80, sym: true, nu: 4, nv: 3 }],
    cabin: [{ d0: 2.3, d1: 3.9, y0: 0.82, h: 0.4, hw: 0.62 }],
    windows: [{ d: 4.3, y: 0.3, w: 0.4, h: 0.4 }, { d: 5.3, y: 0.3, w: 0.4, h: 0.4 }],
    guns: [{ t: 'nose', d: 0.8, y: 0.15, z: 0.3 }, { t: 'dome', d: 6.0, r: 0.42, n: 1, len: 1.0 }, { t: 'gondola', d0: 5.8, d1: 9.2, ry: 0.4, rz: 0.46 },
      { t: 'beam', d: 7.8, y: 0.3, side: 1, w: 0.6, h: 0.45 }, { t: 'beam', d: 7.8, y: 0.3, side: -1, w: 0.6, h: 0.45 }],
    engines: [{ d: 0.8, z: -2.8, y: -0.45, r: 0.55, len: 2.0, aft: 6.4, type: 'inline', chin: true }, { d: 0.8, z: 2.8, y: -0.45, r: 0.55, len: 2.0, aft: 6.4, type: 'inline', chin: true }],
    prop: { r: 1.75, n: 3 },
    wing: { plan: [[0, 1.9, 7.6], [0.5, 3.2, 7.25], [0.9, 4.35, 6.9], [1.0, 4.85, 6.3]], y: -0.55, dih: 0.5, tc: 0.17, flaps: [0.1, 0.62], ail: [0.66, 0.97] },
    tail: { tp: { le0: 13.4, te0: 16.1, le1: 14.4, te1: 15.8 }, span: 7.7, y: 0.3, fins: [{ z: 0, th: 0.14, sec: [[0.4, 11.0, 16.1], [1.2, 12.6, 16.0], [2.1, 14.0, 15.9], [2.5, 15.0, 15.7]] }] },
    cutD: 12.9, insD: 11.0, bay: { d0: 3.4, d1: 6.6, hw: 0.4, n: 4, kg: 500, cols: 2 },
    gearD: 4.4, tailWheelD: 15.4, gearGeom: { wr: 0.5, leg: 1.74 }, eyeD: [2.0, 0.7, -0.35],
  }),

  // ---- Italy: SM.79 Sparviero (15.62 m, 21.2 m, 4.1 m; wing 61.7 m2; three Alfa Romeo 126, one in the nose) ----
  sm79: finalize({
    name: 'SIAI-Marchetti SM.79 Sparviero', nation: 'Italy', role: 'level', kind: 'mono', L: 15.62, span: 21.2, mass: 11.0, hp: 7.5, bombKg: 1000,
    cg: 6.4,
    body: [[0, 0.12, 0.12, 0], [0.12, 0.38, 0.38, 0], [0.3, 0.6, 0.6, 0.0], [1.2, 0.64, 0.64, 0.05], [1.7, 0.85, 0.78, 0.1], [2.8, 1.05, 0.88, 0.2], [3.5, 1.2, 0.95, 0.3],
      [5.5, 1.35, 0.95, 0.4], [7.5, 1.35, 0.92, 0.38], [8.5, 1.15, 0.9, 0.3], [10.0, 0.95, 0.78, 0.15], [12.0, 0.75, 0.55, 0.2], [14.0, 0.55, 0.38, 0.28], [15.2, 0.38, 0.22, 0.3], [15.62, 0.12, 0.1, 0.3]],
    glass: [{ d0: 3.3, d1: 5.6, a0: 25, a1: 72, sym: true, nu: 3, nv: 1 }],
    cabin: [],
    windows: [{ d: 3.0, y: 0.35, w: 0.45, h: 0.4 }, { d: 8.0, y: 0.4, w: 0.4, h: 0.4 }],
    guns: [{ t: 'nose', d: 7.5, y: 1.78, z: 0.0, len: 0.9 }, { t: 'gondola', d0: 6.6, d1: 9.2, ry: 0.45, rz: 0.42 }, { t: 'beam', d: 9.8, y: 0.15, side: 1, w: 0.5, h: 0.4 }, { t: 'beam', d: 9.8, y: 0.15, side: -1, w: 0.5, h: 0.4 }],
    engines: [{ d: 3.6, z: -3.2, y: -0.35, r: 0.62, len: 1.2, aft: 8.4, type: 'radial' }, { d: 0.05, z: 0, y: 0.0, r: 0.62, len: 1.15, type: 'radial', nose: true, gear: false, dir: -1 },
      { d: 3.6, z: 3.2, y: -0.35, r: 0.62, len: 1.2, aft: 8.4, type: 'radial' }],
    prop: { r: 1.55, n: 3 },
    wing: { plan: [[0, 5.0, 8.9], [0.38, 5.4, 8.6], [1.0, 6.5, 7.9]], y: -0.55, dih: 0.5, tc: 0.17, flaps: [0.1, 0.6], ail: [0.66, 0.97] },
    tail: { tp: { le0: 12.7, te0: 14.9, le1: 13.5, te1: 14.8 }, span: 8.0, y: 0.45, fins: [{ z: 0, th: 0.14, sec: [[0.55, 12.2, 15.4], [1.3, 13.2, 15.4], [2.5, 14.2, 15.1]] }] },
    cutD: 12.3, insD: 11.0, bay: { d0: 5.4, d1: 8.2, hw: 0.4, n: 4, kg: 250, cols: 2 },
    gearD: 4.9, tailWheelD: 15.0, gearGeom: { wr: 0.48, leg: 1.3 }, eyeD: [3.7, 1.4, -0.35],
  }),

  // ---- France: LeO 451 (17.17 m, 22.52 m, 5.24 m; wing 66 m2; two Gnome-Rhone 14N, twin fins) ----
  leo451: finalize({
    name: 'Lioré et Olivier LeO 451', nation: 'France', role: 'level', kind: 'mono', L: 17.17, span: 22.52, mass: 11.4, hp: 8, bombKg: 1500,
    cg: 7.0,
    body: [[0, 0.1, 0.1, 0], [0.25, 0.45, 0.4, -0.05], [0.9, 0.75, 0.65, -0.05], [2.0, 0.98, 0.78, 0.0], [3.2, 1.08, 0.82, 0.05], [5.0, 1.12, 0.82, 0.08], [7.5, 1.1, 0.8, 0.05],
      [10.0, 0.98, 0.72, 0.08], [12.0, 0.8, 0.55, 0.15], [14.0, 0.62, 0.4, 0.22], [16.0, 0.4, 0.26, 0.28], [17.17, 0.12, 0.1, 0.3]],
    glass: [{ d0: 0.2, d1: 2.6, a0: -35, a1: 80, sym: true, nu: 4, nv: 3 }],
    cabin: [{ d0: 2.8, d1: 4.9, y0: 0.82, h: 0.45, hw: 0.56 }],
    windows: [{ d: 5.4, y: 0.25, w: 0.4, h: 0.3 }, { d: 6.4, y: 0.25, w: 0.4, h: 0.3 }],
    guns: [{ t: 'nose', d: 0.8, y: 0.0, z: 0.0 }, { t: 'dome', d: 9.0, r: 0.42, n: 1, len: 1.3 }, { t: 'gondola', d0: 7.6, d1: 9.8, ry: 0.4, rz: 0.4 }],
    engines: [{ d: 2.3, z: -2.9, y: -0.2, r: 0.66, len: 1.25, aft: 9.4, type: 'radial', dir: 1 }, { d: 2.3, z: 2.9, y: -0.2, r: 0.66, len: 1.25, aft: 9.4, type: 'radial', dir: -1 }],
    prop: { r: 1.6, n: 3 },
    wing: { plan: [[0, 5.0, 9.3], [0.3, 5.5, 9.0], [1.0, 6.6, 8.2]], y: -0.3, dih: 0.5, tc: 0.17, flaps: [0.1, 0.6], ail: [0.66, 0.97] },
    tail: { tp: { le0: 13.6, te0: 15.7, le1: 14.3, te1: 15.5 }, span: 7.8, y: 0.4,
      fins: [{ z: -3.6, th: 0.12, sec: oval(-0.8, 3.6, 13.6, 15.9, 0.1) }, { z: 3.6, th: 0.12, sec: oval(-0.8, 3.6, 13.6, 15.9, 0.1) }] },
    cutD: 13.3, insD: 11.6, bay: { d0: 5.4, d1: 8.4, hw: 0.4, n: 6, kg: 250, cols: 2 },
    gearD: 5.5, tailWheelD: 15.2, gearGeom: { wr: 0.5, leg: 2.3 }, eyeD: [3.1, 1.15, -0.32],
  }),
};
