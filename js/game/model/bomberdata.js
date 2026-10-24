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
  s.gear = 'retract'; s.ordnance = s.bay ? 'bay' : null; s.heavy = true;      // (an interceptor has no bay)
  return s;
}

export const HEAVY = {
  // ---- USA: B-17G (22.66 m, 31.62 m, 5.82 m; wing 131.9 m2; four Wright R-1820, 3.5 m propellers), drawn from its model (model/v4plane.js; the model is 23.4 m long with the barrels of its tail guns and
  // 7 m high on its wheels): the stations of the body are the drawing's, the places of the engines, the turrets, the windows, the tail and the fin the model's ----
  b17: finalize({
    name: 'Boeing B-17G Flying Fortress', nation: 'USA', role: 'level', kind: 'mono', L: 22.66, span: 31.62, mass: 24.5, hp: 14, bombKg: 2700,
    cg: 9.84, paint: { top: '#b9bdbf', bot: '#a9aba0', acc: '#e8e6dc' },
    body: [[0, 0.1, 0.08, -0.2], [0.5, 0.62, 0.52, -0.2], [1.0, 0.9, 0.73, -0.2], [1.5, 1.1, 0.9, -0.12], [2.0, 1.12, 0.92, -0.1], [2.5, 1.1, 1.0, -0.12], [3.0, 1.15, 1.07, -0.07],
      [3.5, 1.3, 1.12, 0.02], [4.5, 1.34, 1.18, 0.01], [7.0, 1.35, 1.2, 0.0], [9.0, 1.27, 1.2, -0.1], [10.5, 1.18, 1.2, -0.2], [12.0, 1.1, 1.17, -0.22], [14.0, 1.0, 0.93, -0.23],
      [16.0, 0.85, 0.78, -0.2], [18.0, 0.72, 0.65, -0.16], [19.5, 0.62, 0.58, -0.12], [21.0, 0.45, 0.41, -0.15], [22.0, 0.3, 0.29, -0.15], [22.5, 0.1, 0.1, -0.15]],
    glass: [{ d0: 0.3, d1: 2.9, a0: -30, a1: 82, sym: true, nu: 3, nv: 3 }],
    cabin: [{ d0: 3.4, d1: 6.0, y0: 0.82, h: 0.5, hw: 0.78 }],
    windows: [{ d: 2.9, y: 0.1, w: 0.4, h: 0.3 }, { d: 3.4, y: 0.1, w: 0.4, h: 0.3 }],
    guns: [{ t: 'chin', d: 1.2, r: 0.42, pivot: [8.6, -0.9, 0] }, { t: 'cheek', d: 1.95, y: 0.05, side: -1, pivot: [7.9, 0.4, -0.95] }, { t: 'dome', d: 5.34, r: 0.5, n: 2, len: 1.2, pivot: [4.5, 1.6, 0] },
      { t: 'ball', d: 11.9, r: 0.55, pivot: [-2.05, -0.95, 0], nowin: true },
      { t: 'beam', d: 14.1, y: 0.15, side: 1, w: 0.8, h: 0.55, pivot: [-4.3, 0.5, 1.05] }, { t: 'beam', d: 12.55, y: 0.15, side: -1, w: 0.8, h: 0.55, pivot: [-2.72, 0.5, -1.0] },
      { t: 'tail', d: 22.0, r: 0.4, n: 2, len: 0.8, pivot: [-12.0, 0.95, 0] },
      { t: 'cheek', d: 1.2, y: 0.05, side: 1, pivot: [8.65, 0.4, 0.8] }, { t: 'hatch', d: 9.5, pivot: [0.3, 1.55, 0] }],      // the B-17G has thirteen .50: the two cheek guns of the nose and the gun of the radio room are the last three (the pivots are the places of the turrets and the windows on the model)
    engines: [{ d: 3.59, z: -6.57, y: 0.0, r: 0.78, len: 1.15, aft: 10.5, type: 'radial', gear: false }, { d: 2.94, z: -3.05, y: -0.25, r: 0.78, len: 1.15, aft: 10.5, type: 'radial' },
      { d: 2.94, z: 3.05, y: -0.25, r: 0.78, len: 1.15, aft: 10.5, type: 'radial' }, { d: 3.59, z: 6.57, y: 0.0, r: 0.78, len: 1.15, aft: 10.5, type: 'radial', gear: false }],
    prop: { r: 1.76, n: 3 },
    wing: { plan: [[0, 4.87, 10.77], [0.3, 5.34, 10.44], [1.0, 7.2, 9.05]], y: 0.15, dih: 0.7, tc: 0.18, flaps: [0.1, 0.55], ail: [0.62, 0.97], boots: [0.05, 0.98] },
    tail: { tp: { le0: 17.44, te0: 20.34, le1: 18.74, te1: 19.64 }, span: 13.1, y: 0.7, fins: [{ z: 0, th: 0.2, sec: [[0.9, 14.5, 21.8], [1.5, 16.0, 21.75], [3.0, 18.17, 21.46], [4.0, 18.73, 21.29], [5.0, 19.53, 20.45], [5.07, 19.9, 20.3]] }],
      band: [[-9.5, 3.3, 0.19, -11.3, -11.0, 4.6, 0.13, -9.9]] },
    cutD: 17.34, insD: 15.0, mastD: 5.2, bay: { d0: 6.6, d1: 10.6, hw: 0.45, n: 12, kg: 227, cols: 3, modelDoors: true },
    gearD: 6.4, tailWheelD: 21.0, gearGeom: { wr: 0.56, leg: 2.09 }, eyeD: [4.7, 1.1, -0.42],
  }),

  // ---- USA: B-29 Superfortress (30.18 m, 43.05 m, 8.46 m; wing 161.3 m2; four Wright R-3350, 5.0 m propellers), measured on its model (the stations and the planform are read there; the
  // hull, the wings, the nacelles, the doors and the load come from the model itself, model/v4plane.js: this sheet gives the frame the game works in: where a gun pivots, the bay pivot, the eye) ----
  b29: finalize({
    name: 'Boeing B-29 Superfortress', nation: 'USA', role: 'level', kind: 'mono', L: 30.18, span: 43.05, mass: 47, hp: 18, bombKg: 9000,
    cg: 12.68, paint: { top: '#a9acae', bot: '#b9bbbd', acc: '#e8e6dc' },
    body: [[0, 0.12, 0.12, 0.05], [0.3, 0.7, 0.7, 0.03], [0.6, 1.05, 1.05, 0.0], [1.1, 1.3, 1.22, 0.0], [2.0, 1.38, 1.35, 0.0], [3.0, 1.41, 1.41, 0.0], [4.5, 1.45, 1.42, 0.1], [7.0, 1.4, 1.42, 0.05],
      [12.0, 1.34, 1.41, 0.0], [16.7, 1.33, 1.45, 0.0], [18.2, 1.2, 1.25, 0.08], [19.7, 1.1, 1.15, 0.2], [21.2, 0.95, 1.06, 0.2], [22.7, 0.87, 0.96, 0.15], [24.2, 0.8, 0.86, 0.25],
      [25.7, 0.7, 0.7, 0.35], [27.2, 0.55, 0.55, 0.5], [28.7, 0.4, 0.4, 0.6], [30.0, 0.2, 0.2, 0.72], [30.18, 0.1, 0.1, 0.72]],
    cabin: [{ d0: 2.4, d1: 3.6, h: 0.5 }],
    guns: [{ t: 'dome', d: 4.4, r: 0.4, n: 4, pivot: [8.3, 1.5, 0] }, { t: 'ball', d: 4.8, r: 0.4, n: 2, pivot: [7.9, -1.55, 0], nowin: true }, { t: 'dome', d: 17.7, r: 0.4, n: 2, pivot: [-5.0, 1.45, 0] },
      { t: 'ball', d: 16.8, r: 0.4, n: 2, pivot: [-4.1, -1.5, 0], nowin: true }, { t: 'tail', d: 29.6, r: 0.1, n: 2, pivot: [-16.9, 0.78, 0] }, { t: 'tail', d: 29.6, r: 0.1, n: 1, pivot: [-16.9, 0.6, 0] }],
    engines: [{ d: 6.9, z: -9.47, y: 0.02, r: 0.95, len: 1.4, aft: 14.5, type: 'radial', gear: false }, { d: 6.2, z: -4.23, y: -0.27, r: 0.95, len: 1.4, aft: 14.5, type: 'radial' },
      { d: 6.2, z: 4.23, y: -0.27, r: 0.95, len: 1.4, aft: 14.5, type: 'radial' }, { d: 6.9, z: 9.47, y: 0.02, r: 0.95, len: 1.4, aft: 14.5, type: 'radial', gear: false }],
    prop: { r: 2.4, n: 4 },
    wing: { plan: [[0, 8.35, 14.08], [0.3, 9.25, 13.93], [1.0, 11.38, 13.58]], y: -0.49, dih: 1.56, tc: 0.16, flaps: [0.1, 0.55], ail: [0.62, 0.97] },
    tail: { tp: { le0: 24.76, te0: 27.7, le1: 25.71, te1: 27.17 }, span: 13.1, y: 1.0, fins: [{ z: 0, th: 0.2, sec: [[1.4, 21.68, 29.18], [2.0, 21.68, 28.73], [3.0, 23.36, 28.52], [4.0, 24.37, 28.24], [5.0, 24.92, 27.94], [6.0, 25.43, 27.66], [6.3, 25.7, 27.5]] }],
      band: [[-12.6, 3.6, 0.215, -14.5, -14.7, 5.2, 0.125, -13.4]] },
    cutD: 21.68, insD: 19.0, mastD: 5.0, bay: { d0: 5.38, d1: 16.44, hw: 1.0, n: 20, kg: 227, cols: 2, doors: [[5.5, 9.7], [12.2, 16.4]] },
    gearD: 8.0, tailWheelD: 29.0, gearGeom: { wr: 0.8, leg: 3.0 }, eyeD: [3.1, 0.85, -0.45], groundPitch: 0,      // (a nose wheel: the aircraft stands level on the ground)
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

  // ---- UK: Lancaster B.I (21.13 m, 31.09 m, 6.25 m; wing 120.5 m2; four Merlin, 3.96 m propellers; twin fins), drawn from its model (the model is 22 m long with the barrels of its tail guns: they are left out) ----
  lancaster: finalize({
    name: 'Avro Lancaster B.I', nation: 'UK', role: 'level', kind: 'mono', L: 21.13, span: 31.09, mass: 25.4, hp: 14, bombKg: 6400,
    cg: 9.19, paint: { top: '#4a5236', bot: '#2e3032', acc: '#c8c6bc' },
    body: [[0.5, 0.25, 0.25, -0.35], [0.9, 0.7, 0.51, -0.25], [1.0, 0.98, 0.71, -0.12], [1.5, 1.1, 0.82, 0.0], [2.0, 1.16, 0.9, 0.05, 2.4], [3.0, 1.3, 0.91, 0.12, 2.6], [5.0, 1.38, 0.91, 0.12, 2.8],
      [7.0, 1.38, 0.91, 0.1, 3], [9.0, 1.34, 0.91, 0.05, 3], [12.0, 1.28, 0.91, -0.03, 3], [14.0, 1.12, 0.88, 0.0, 3], [16.0, 0.92, 0.75, 0.1, 2.6], [18.0, 0.72, 0.55, 0.22],
      [19.4, 0.5, 0.38, 0.32], [20.1, 0.3, 0.22, 0.35], [20.4, 0.1, 0.1, 0.35]],
    glass: [{ d0: 0.5, d1: 2.4, a0: -20, a1: 82, sym: true, nu: 2, nv: 3 }],
    cabin: [{ d0: 3.1, d1: 5.6, y0: 0.82, h: 0.6, hw: 0.72 }],
    windows: [{ d: 11.2, y: 0.4, w: 0.3, h: 0.3 }, { d: 12.0, y: 0.4, w: 0.3, h: 0.3 }, { d: 13.8, y: 0.4, w: 0.3, h: 0.3 }, { d: 14.6, y: 0.4, w: 0.3, h: 0.3 }],
    guns: [{ t: 'fturret', d: 0.8, y: -0.05, r: 0.36, pivot: [8.4, 0.65, 0] }, { t: 'dome', d: 13.95, r: 0.55, n: 2, len: 1.0, pivot: [-4.76, 1.55, 0] }, { t: 'tail', d: 21.1, r: 0.5, n: 4, len: 1.0, pivot: [-11.9, 0.55, 0] }],
    engines: [{ d: 3.99, z: -7.7, y: 0.25, r: 0.52, len: 2.2, aft: 8.9, type: 'inline', chin: true, gear: false }, { d: 3.44, z: -3.65, y: -0.05, r: 0.52, len: 2.2, aft: 10.7, type: 'inline', chin: true },
      { d: 3.44, z: 3.65, y: -0.05, r: 0.52, len: 2.2, aft: 10.7, type: 'inline', chin: true }, { d: 3.99, z: 7.7, y: 0.25, r: 0.52, len: 2.2, aft: 8.9, type: 'inline', chin: true, gear: false }],
    prop: { r: 1.9, n: 3 },
    wing: { plan: [[0, 5.7, 10.7], [0.35, 6.1, 10.45], [0.6, 6.5, 10.2], [1.0, 7.7, 9.2]], y: 0.2, dih: 1.0, tc: 0.16, flaps: [0.1, 0.6], ail: [0.68, 0.98], boots: [0.05, 0.98] },
    tail: { tp: { le0: 17.92, te0: 20.36, le1: 18.12, te1: 19.52 }, span: 10.75, y: 0.0,
      fins: [{ z: -5.05, th: 0.2, sec: [[0.3, 18.09, 19.7], [1.0, 18.1, 19.7], [1.5, 18.15, 19.65], [2.0, 18.24, 19.57], [2.5, 18.4, 19.4], [2.86, 18.6, 19.2]] },
        { z: 5.05, th: 0.2, sec: [[0.3, 18.09, 19.7], [1.0, 18.1, 19.7], [1.5, 18.15, 19.65], [2.0, 18.24, 19.57], [2.5, 18.4, 19.4], [2.86, 18.6, 19.2]] }],
      band: [[-9.0, 0.9, 5.17, -10.4, -10.15, 2.3, 5.17, -9.25], [-9.0, 0.9, 4.93, -10.4, -10.15, 2.3, 4.93, -9.25]] },
    cutD: 17.69, insD: 14.2, bay: { d0: 6.0, d1: 15.0, hw: 0.55, n: 6, kg: 1000, cols: 2, modelDoors: true },
    gearD: 6.4, tailWheelD: 19.7, gearGeom: { wr: 0.62, leg: 2.63 }, eyeD: [3.8, 1.2, -0.4],
  }),

  // ---- Germany: He 111 H (16.4 m, 22.6 m, 4.0 m; wing 87.6 m2; two Jumo 211) ----
  he111: finalize({
    name: 'Heinkel He 111 H-6', nation: 'Germany', role: 'level', kind: 'mono', L: 16.4, span: 22.6, mass: 12.0, hp: 8.5, bombKg: 2000,
    cg: 6.82, paint: { top: '#4f5a44', bot: '#8da3b7', acc: '#1c1c1c' },
    body: [[0, 0.08, 0.08, 0], [0.5, 0.5, 0.32, 0], [1.0, 0.8, 0.56, 0], [1.5, 0.95, 0.71, -0.2], [2.0, 1.0, 0.79, -0.22], [2.5, 1.1, 0.83, -0.25], [4.0, 1.15, 0.92, -0.25],
      [5.5, 1.15, 0.98, -0.25], [7.5, 1.1, 0.9, -0.22], [9.0, 0.98, 0.75, -0.15], [10.5, 0.9, 0.68, -0.08], [12.0, 0.8, 0.58, 0.0], [13.3, 0.66, 0.46, 0.08], [14.5, 0.52, 0.3, 0.22],
      [15.6, 0.38, 0.17, 0.27], [16.4, 0.1, 0.08, 0.3]],
    glass: [{ d0: 0.12, d1: 2.9, a0: -45, a1: 80, sym: true, nu: 4, nv: 3 }],
    cabin: [{ d0: 2.3, d1: 3.9, y0: 0.82, h: 0.4, hw: 0.62 }],
    windows: [{ d: 4.3, y: 0.3, w: 0.4, h: 0.4 }, { d: 5.3, y: 0.3, w: 0.4, h: 0.4 }],
    guns: [{ t: 'nose', d: 0.6, y: 0.1, z: 0.25, pivot: [6.2, 0.1, 0.25] }, { t: 'dome', d: 6.3, r: 0.42, n: 1, len: 1.0, pivot: [0.55, 1.35, 0] },
      { t: 'gondola', d0: 6.6, d1: 8.2, ry: 0.4, rz: 0.46, pivot: [-0.7, -1.0, 0] },
      { t: 'beam', d: 7.8, y: 0.3, side: 1, w: 0.6, h: 0.45, pivot: [-1.0, 0.25, 0.85] }, { t: 'beam', d: 7.8, y: 0.3, side: -1, w: 0.6, h: 0.45, pivot: [-1.0, 0.25, -0.85] }],
    engines: [{ d: 0.67, z: -2.7, y: 0.0, r: 0.55, len: 2.0, aft: 7.0, type: 'inline', chin: true }, { d: 0.67, z: 2.7, y: 0.0, r: 0.55, len: 2.0, aft: 7.0, type: 'inline', chin: true }],
    prop: { r: 1.5, n: 3 },
    wing: { plan: [[0, 2.2, 6.8], [0.5, 2.8, 7.0], [0.9, 3.9, 6.6], [1.0, 4.4, 6.3]], y: -0.4, dih: 0.5, tc: 0.17, flaps: [0.1, 0.62], ail: [0.66, 0.97] },
    tail: { tp: { le0: 13.3, te0: 16.0, le1: 14.6, te1: 15.6 }, span: 8.0, y: 0.07, fins: [{ z: 0, th: 0.3, sec: [[0.6, 13.1, 15.9], [1.0, 13.5, 15.9], [1.5, 13.6, 15.8], [2.0, 13.8, 15.7], [2.5, 14.1, 15.5], [2.9, 14.5, 15.3]] }],
      band: [[-7.0, 1.2, 0.16, -8.9, -7.5, 2.6, 0.1, -8.6]] },
    cutD: 13.2, insD: 11.0, bay: { d0: 3.4, d1: 6.6, hw: 0.4, n: 4, kg: 500, cols: 2, modelDoors: true },
    gearD: 3.3, tailWheelD: 14.6, gearGeom: { wr: 0.5, leg: 2.2 }, eyeD: [2.0, 0.7, -0.35],
  }),

  // ---- Italy: SM.79 Sparviero (15.62 m, 21.2 m, 4.1 m; wing 61.7 m2; three Alfa Romeo 126, one in the nose) ----
  sm79: finalize({
    name: 'SIAI-Marchetti SM.79 Sparviero', nation: 'Italy', role: 'level', kind: 'mono', L: 15.62, span: 21.2, mass: 11.0, hp: 7.5, bombKg: 1000,
    cg: 6.4,
    body: [[0, 0.12, 0.12, 0], [0.12, 0.42, 0.42, 0], [0.3, 0.68, 0.68, 0.0], [1.2, 0.72, 0.72, 0.05], [1.8, 0.88, 0.8, 0.1], [2.8, 1.05, 0.88, 0.2], [3.5, 1.2, 0.95, 0.3],
      [5.5, 1.35, 0.95, 0.4], [7.5, 1.35, 0.92, 0.38], [8.5, 1.15, 0.9, 0.3], [10.0, 0.95, 0.78, 0.15], [12.0, 0.75, 0.55, 0.2], [14.0, 0.55, 0.38, 0.28], [15.2, 0.38, 0.22, 0.3], [15.62, 0.12, 0.1, 0.3]],
    glass: [{ d0: 3.3, d1: 5.6, a0: 25, a1: 72, sym: true, nu: 3, nv: 1 }],
    cabin: [],
    windows: [{ d: 3.0, y: 0.35, w: 0.45, h: 0.4 }, { d: 8.0, y: 0.4, w: 0.4, h: 0.4 }],
    guns: [{ t: 'nose', d: 7.5, y: 1.78, z: 0.0, aft: true }, { t: 'gondola', d0: 6.6, d1: 9.2, ry: 0.45, rz: 0.42 }, { t: 'beam', d: 9.8, y: 0.15, side: 1, w: 0.5, h: 0.4 }, { t: 'beam', d: 9.8, y: 0.15, side: -1, w: 0.5, h: 0.4 }],
    engines: [{ d: 3.6, z: -3.2, y: -0.35, r: 0.62, len: 1.2, aft: 8.4, type: 'radial' }, { d: 0.05, z: 0, y: 0.0, r: 0.7, len: 1.2, type: 'radial', nose: true, gear: false, dir: -1 },
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

  // ---- USA: Lockheed P-38G Lightning, a land-based interceptor (11.53 m, 15.85 m, 3.9 m high; wing 30.4 m2; two Allison V-1710 with turbochargers, 3.5 m three-blade propellers turning outward, a tricycle
  // undercarriage; one 20 mm and four .50 in the nose), drawn from its model (the model is 11.7 m long and 16.1 m across): the central pod, the two booms with their engines and the tail between the fins
  // are the model's pieces (model/v4plane.js); this sheet gives the frame the game works in (the stations of the pod, the engines, the planform for the hit volume, the places of the guns and the eye) ----
  p38: finalize({
    name: 'Lockheed P-38G Lightning', nation: 'USA', role: 'interceptor', kind: 'mono', L: 11.53, span: 15.85, mass: 7.1, S: 30.43, hp: 5.5, bombKg: 0,
    cg: 4.9, paint: { top: '#55563d', bot: '#8d9193', acc: '#e8e6dc' },
    body: [[0, 0.06, 0.06, -0.23], [0.3, 0.31, 0.28, -0.17], [0.8, 0.5, 0.38, -0.17], [1.1, 0.57, 0.41, -0.17], [1.9, 0.67, 0.47, -0.17], [2.55, 0.72, 0.47, -0.15], [3.2, 0.91, 0.5, 0.015],
      [3.5, 0.93, 0.5, 0.03], [4.2, 0.81, 0.45, -0.01], [4.8, 0.63, 0.4, -0.08], [5.3, 0.43, 0.3, -0.12], [5.7, 0.2, 0.2, -0.15], [6.05, 0.05, 0.05, -0.16]],
    cabin: [{ d0: 2.7, d1: 4.8, y0: 0.5, h: 0.45, hw: 0.43 }],
    guns: [],
    engines: [{ d: 1.6, z: -2.4446, y: 0.0, r: 0.55, len: 1.4, aft: 6.0, type: 'inline', dir: -1 }, { d: 1.6, z: 2.4446, y: 0.0, r: 0.55, len: 1.4, aft: 6.0, type: 'inline', dir: 1 }],
    prop: { r: 1.76, n: 3 },
    wing: { plan: [[0, 3.1, 5.95], [0.3, 2.4, 5.8], [0.477, 3.4, 5.43], [0.728, 3.59, 5.09], [0.98, 3.83, 4.59]], y: 0.05, dih: 0.63, tc: 0.14, flaps: [0.1, 0.55], ail: [0.6, 0.97] },
    tail: { tp: { le0: 10.16, te0: 11.33, le1: 10.16, te1: 11.33 }, span: 6.7, y: 0.41,
      fins: [{ z: -2.44, th: 0.08, sec: [[-0.3, 10.56, 11.29], [0.0, 10.26, 11.54], [0.6, 10.14, 11.65], [1.2, 10.33, 11.55], [1.5, 10.49, 11.39], [1.8, 10.74, 11.15]] },
        { z: 2.44, th: 0.08, sec: [[-0.3, 10.56, 11.29], [0.0, 10.26, 11.54], [0.6, 10.14, 11.65], [1.2, 10.33, 11.55], [1.5, 10.49, 11.39], [1.8, 10.74, 11.15]] }],
      band: [[-5.5, 0.85, 2.49, -6.6, -6.45, 1.45, 2.49, -5.7], [-5.5, 0.85, 2.39, -6.6, -6.45, 1.45, 2.39, -5.7]] },
    cutD: 6.1, insD: 3.8, mastD: 3.5,
    gearD: 3.4, noseGear: { d: 1.1, wr: 0.26 }, tailWheelD: 6.0, gearGeom: { wr: 0.36, leg: 1.8 }, eyeD: [3.3, 0.55, 0], groundPitch: 0,
  }),
};
