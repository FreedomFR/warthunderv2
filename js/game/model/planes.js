// Procedural WWII carrier aircraft. One generator for monoplanes and biplanes driven by a spec sheet
// (dimensions of the real aircraft). Model space: +x = nose, +y = up, +z = starboard, origin near the
// centre of gravity. Every plane is built as separate groups so that parts can fly off or be hidden:
//   whole  fuselage + both wings + tail (the normal, intact aircraft)
//   body   fuselage, engine, canopy, fixed gear     wingL / wingR     tail (rear fuselage + tailplane + fin)
//   prop   rotating propeller (origin on the engine axis)     gear   retractable undercarriage
//   ordnance   torpedo or bomb hung under the fuselage
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';

const PI = Math.PI;
const D2R = PI / 180;

// ---- paint schemes and national markings -----------------------------------------------------------------
const PAINT = {
  USA: { top: '#3b4a63', bot: '#c4c8ca', acc: '#e8e6dc' },
  Japan: { top: '#6c7556', bot: '#bcc0a8', acc: '#d9a23a' },
  UK: { top: '#4b5a44', bot: '#8d9b9e', acc: '#2a2a2a' },
  Germany: { top: '#55604b', bot: '#8da3b7', acc: '#1c1c1c' },
  France: { top: '#6b7d66', bot: '#c9cecf', acc: '#b04040' },
  Italy: { top: '#8a8456', bot: '#7d8a92', acc: '#e8e6dc' },
};

// ---- aircraft specification sheets --------------------------------------------------------------------------
// The tailplane span is the TOTAL span (the three aircraft with a drawing -- SBD 5.4 m, B5N 4.9 m, Skua 4.9 m -- were measured on it; the others
// are 0.33 of the wing span, estimated: they had been drawn at about half the real size).
// L length, span, fus: {r maximum radius, ar ratio height/width}, engine: {r cowl radius, len, type},
// wing: {cr root chord, ct tip chord, x mid-chord position, y height, dih dihedral, gull inverted gull, sweep, t thickness}
export const PLANES = {
  sbd: {
    name: 'SBD-3 Dauntless', nation: 'USA', role: 'dive', kind: 'mono', L: 9.7, span: 12.65, mass: 3.2, hp: 3.2, bombKg: 450,
    fus: { r: 0.62, ar: 1.18, x: -0.2 }, engine: { type: 'radial', r: 0.74, len: 1.35 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 3.0, ct: 1.3, x: 0.80, y: -0.32, dih: 0.35, sweep: 0.45, t: 0.34 },
    tail: { x: -4.25, chord: 1.6, span: 5.4, fin: 1.55, finChord: 1.8, y: 0.15 }, canopy: [{ x0: 0.1, x1: 1.4, tx1: 1.1, h: 0.62 }, { x0: -1.9, x1: -0.7, tx1: -0.9, h: 0.5 }],
    gear: 'retract', ordnance: 'bomb', stripes: false,
  },
  tbf: {
    name: 'TBF-1 Avenger', nation: 'USA', role: 'torp', kind: 'mono', L: 12.2, span: 16.5, mass: 5.6, hp: 4.5,
    fus: { r: 0.98, ar: 1.12, x: -0.6 }, engine: { type: 'radial', r: 0.95, len: 1.5 }, prop: { r: 2.0, n: 3, x: 0 },
    wing: { cr: 3.3, ct: 1.7, x: -0.3, y: -0.42, dih: 0.55, sweep: 0.6, t: 0.42 },
    tail: { x: -4.9, chord: 1.8, span: 5.4, fin: 1.9, finChord: 2.2, y: 0.35 }, canopy: [{ x0: 0.4, x1: 1.8, tx1: 1.4, h: 0.62 }, { x0: -2.6, x1: -1.1, tx1: -1.4, h: 0.55 }],
    gear: 'retract', ordnance: 'torp', turret: true,
  },
  d3a: {
    name: 'Aichi D3A1 Type 99', nation: 'Japan', role: 'dive', kind: 'mono', L: 10.2, span: 14.4, mass: 3.6, hp: 2.8, bombKg: 250,
    fus: { r: 0.58, ar: 1.15, x: -0.4 }, engine: { type: 'radial', r: 0.64, len: 1.1 }, prop: { r: 1.55, n: 3, x: 0 },
    wing: { cr: 2.5, ct: 1.0, x: -0.2, y: -0.28, dih: 0.3, sweep: 0.3, t: 0.3, elliptic: true },
    tail: { x: -4.2, chord: 1.3, span: 4.8, fin: 1.45, finChord: 1.6, y: 0.1 }, canopy: [{ x0: 0.0, x1: 1.5, tx1: 1.2, h: 0.62 }, { x0: -2.0, x1: -0.8, tx1: -1.0, h: 0.5 }],
    gear: 'spats', ordnance: 'bomb',
  },
  b5n: {
    name: 'Nakajima B5N2 Type 97', nation: 'Japan', role: 'torp', kind: 'mono', L: 10.3, span: 15.5, mass: 3.8, hp: 2.9,
    fus: { r: 0.6, ar: 1.2, x: -0.6 }, engine: { type: 'radial', r: 0.64, len: 1.1 }, prop: { r: 1.6, n: 3, x: 0 },
    wing: { cr: 3.3, ct: 1.2, x: 1.00, y: -0.2, dih: 0.4, sweep: 0.35, t: 0.3 },
    tail: { x: -4.2, chord: 1.3, span: 4.9, fin: 1.4, finChord: 1.7, y: 0.25 }, canopy: [{ x0: 0.2, x1: 3.3, tx1: 2.9, h: 0.72 }],
    gear: 'retract', ordnance: 'torp',
  },
  swordfish: {
    name: 'Fairey Swordfish', nation: 'UK', role: 'torp', kind: 'bi', L: 10.9, span: 13.9, mass: 3.4, hp: 3.4,
    fus: { r: 0.62, ar: 1.1, x: -0.6 }, engine: { type: 'radial', r: 0.75, len: 1.1 }, prop: { r: 1.75, n: 3, x: 0 },
    wing: { cr: 1.95, ct: 1.95, x: 0.1, y: 0.0, gap: 1.75, dih: 0.0, sweep: 0.5, t: 0.14, stagger: 0.5 },
    tail: { x: -4.1, chord: 1.5, span: 4.6, fin: 1.4, finChord: 1.6, y: 0.2 }, canopy: [{ x0: -0.2, x1: 0.5, tx1: 0.3, h: 0.2, open: true }, { x0: -2.0, x1: -1.4, tx1: -1.6, h: 0.2, open: true }],
    gear: 'fixedbig', ordnance: 'torp',
  },
  skua: {
    name: 'Blackburn Skua', nation: 'UK', role: 'dive', kind: 'mono', L: 10.85, span: 14.1, mass: 3.8, hp: 3.2, bombKg: 230,
    fus: { r: 0.62, ar: 1.15, x: -0.4 }, engine: { type: 'radial', r: 0.72, len: 1.2 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 2.8, ct: 1.4, x: -0.2, y: -0.3, dih: 0.4, sweep: 0.4, t: 0.34 },
    tail: { x: -4.4, chord: 1.4, span: 4.9, fin: 1.4, finChord: 1.7, y: 0.15 }, canopy: [{ x0: 0.0, x1: 1.5, tx1: 1.15, h: 0.6 }, { x0: -2.0, x1: -0.7, tx1: -1.0, h: 0.5 }],
    gear: 'retract', ordnance: 'bomb',
  },
  ju87: {
    name: 'Junkers Ju 87 C Stuka', nation: 'Germany', role: 'dive', kind: 'mono', L: 11.1, span: 13.8, mass: 4.6, hp: 3.6, bombKg: 500, siren: true,
    fus: { r: 0.62, ar: 1.2, x: -0.3 }, engine: { type: 'inline', r: 0.46, len: 1.9 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 3.0, ct: 1.5, x: -0.1, y: -0.45, dih: 0.0, gull: 0.95, sweep: 0.15, t: 0.4 },
    tail: { x: -4.8, chord: 1.4, span: 4.6, fin: 1.7, finChord: 1.9, y: 0.2 }, canopy: [{ x0: 0.0, x1: 2.9, tx1: 2.2, h: 0.78 }],
    gear: 'spats', ordnance: 'bomb',
  },
  fi167: {
    name: 'Fieseler Fi 167', nation: 'Germany', role: 'torp', kind: 'bi', L: 11.4, span: 13.5, mass: 4.2, hp: 3.5,
    fus: { r: 0.64, ar: 1.15, x: -0.4 }, engine: { type: 'inline', r: 0.48, len: 1.8 }, prop: { r: 1.7, n: 3, x: 0 },
    wing: { cr: 1.9, ct: 1.5, x: 0.0, y: 0.0, gap: 1.7, dih: 0.0, sweep: 0.3, t: 0.14, stagger: 0.3, lowerShort: 0.78 },
    tail: { x: -4.4, chord: 1.5, span: 4.5, fin: 1.4, finChord: 1.7, y: 0.25 }, canopy: [{ x0: -0.1, x1: 2.2, tx1: 1.7, h: 0.66 }],
    gear: 'retract', ordnance: 'torp',
  },
  ln401: {
    name: 'Loire-Nieuport LN.401', nation: 'France', role: 'dive', kind: 'mono', L: 9.7, span: 14.0, mass: 2.9, hp: 2.7, bombKg: 225,
    fus: { r: 0.5, ar: 1.15, x: -0.2 }, engine: { type: 'inline', r: 0.42, len: 1.8 }, prop: { r: 1.5, n: 3, x: 0 },
    wing: { cr: 2.4, ct: 1.2, x: -0.1, y: -0.35, dih: 0.0, gull: 0.85, sweep: 0.2, t: 0.3 },
    tail: { x: -4.0, chord: 1.2, span: 4.6, fin: 1.4, finChord: 1.6, y: 0.15 }, canopy: [{ x0: 0.0, x1: 1.9, tx1: 1.5, h: 0.6 }],
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
    wing: { cr: 2.2, ct: 1.0, x: -0.1, y: -0.28, dih: 0.3, sweep: 0.25, t: 0.26, elliptic: true },
    tail: { x: -3.2, chord: 1.1, span: 3.6, fin: 1.1, finChord: 1.4, y: 0.1 }, canopy: [{ x0: -0.1, x1: 1.5, tx1: 1.15, h: 0.52 }],
    gear: 'retract', ordnance: 'bomb',
  },
  re2001t: {
    name: 'Reggiane Re.2001 G', nation: 'Italy', role: 'torp', kind: 'mono', L: 8.2, span: 11.0, mass: 2.8, hp: 2.6,
    fus: { r: 0.46, ar: 1.15, x: -0.2 }, engine: { type: 'inline', r: 0.4, len: 1.7 }, prop: { r: 1.45, n: 3, x: 0 },
    wing: { cr: 2.2, ct: 1.0, x: -0.1, y: -0.28, dih: 0.3, sweep: 0.25, t: 0.26, elliptic: true },
    tail: { x: -3.2, chord: 1.1, span: 3.6, fin: 1.1, finChord: 1.4, y: 0.1 }, canopy: [{ x0: -0.1, x1: 1.5, tx1: 1.15, h: 0.52 }],
    gear: 'retract', ordnance: 'torp',
  },
};

/** Floatplane carried on a catapult (Kingfisher, Jake, Walrus, Arado 196, Loire 130, Ro.43 style). */
const FLOATPLANES = {
  USA: { name: 'OS2U Kingfisher', nation: 'USA', role: 'float', kind: 'mono', L: 10.3, span: 10.9, fus: { r: 0.55, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.62, len: 1.1 }, prop: { r: 1.4, n: 3, x: 0 }, wing: { cr: 2.0, ct: 1.5, x: -0.1, y: -0.05, dih: 0.15, sweep: 0.1, t: 0.25 }, tail: { x: -4.2, chord: 1.3, span: 2.6, fin: 1.3, finChord: 1.5, y: 0.2 }, canopy: [{ x0: 0.0, x1: 2.2, tx1: 1.8, h: 0.55 }], gear: 'float' },
  Japan: { name: 'Mitsubishi F1M', nation: 'Japan', role: 'float', kind: 'bi', L: 9.5, span: 11.0, fus: { r: 0.5, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.6, len: 1.0 }, prop: { r: 1.5, n: 3, x: 0 }, wing: { cr: 1.5, ct: 1.3, x: 0.0, y: 0.0, gap: 1.5, dih: 0, sweep: 0.2, t: 0.12, stagger: 0.3 }, tail: { x: -3.8, chord: 1.2, span: 2.4, fin: 1.2, finChord: 1.4, y: 0.2 }, canopy: [{ x0: -0.1, x1: 1.6, tx1: 1.2, h: 0.55 }], gear: 'float' },
  UK: { name: 'Supermarine Walrus', nation: 'UK', role: 'float', kind: 'bi', L: 11.4, span: 13.9, fus: { r: 0.8, ar: 1.1, x: -0.2 }, engine: { type: 'radial', r: 0.7, len: 1.0, pusher: true }, prop: { r: 1.6, n: 4, x: -0.2 }, wing: { cr: 2.0, ct: 2.0, x: 0.0, y: 0.1, gap: 1.8, dih: 0, sweep: 0.2, t: 0.14, stagger: 0.2 }, tail: { x: -4.3, chord: 1.6, span: 3.2, fin: 1.6, finChord: 1.6, y: 0.3 }, canopy: [{ x0: 0.7, x1: 2.1, tx1: 1.7, h: 0.5 }], gear: 'float' },
  Germany: { name: 'Arado Ar 196', nation: 'Germany', role: 'float', kind: 'mono', L: 11.0, span: 12.4, fus: { r: 0.58, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.64, len: 1.2 }, prop: { r: 1.5, n: 3, x: 0 }, wing: { cr: 2.2, ct: 1.5, x: -0.1, y: -0.05, dih: 0.2, sweep: 0.2, t: 0.26 }, tail: { x: -4.5, chord: 1.4, span: 2.8, fin: 1.4, finChord: 1.5, y: 0.2 }, canopy: [{ x0: 0.0, x1: 2.6, tx1: 2.1, h: 0.6 }], gear: 'float' },
  France: { name: 'Loire 130', nation: 'France', role: 'float', kind: 'mono', L: 11.3, span: 16.0, fus: { r: 0.7, ar: 1.1, x: -0.4 }, engine: { type: 'inline', r: 0.5, len: 1.1, pusher: true }, prop: { r: 1.6, n: 3, x: -0.4 }, wing: { cr: 2.2, ct: 1.4, x: -0.1, y: 0.6, dih: 0.2, sweep: 0.2, t: 0.26 }, tail: { x: -4.6, chord: 1.4, span: 2.8, fin: 1.4, finChord: 1.5, y: 0.9 }, canopy: [{ x0: 0.6, x1: 2.4, tx1: 2.0, h: 0.5 }], gear: 'float' },
  Italy: { name: 'IMAM Ro.43', nation: 'Italy', role: 'float', kind: 'bi', L: 9.7, span: 11.5, fus: { r: 0.5, ar: 1.1, x: -0.4 }, engine: { type: 'radial', r: 0.6, len: 1.0 }, prop: { r: 1.5, n: 3, x: 0 }, wing: { cr: 1.5, ct: 1.3, x: 0.0, y: 0.0, gap: 1.5, dih: 0, sweep: 0.2, t: 0.12, stagger: 0.3 }, tail: { x: -3.9, chord: 1.2, span: 2.4, fin: 1.2, finChord: 1.4, y: 0.2 }, canopy: [{ x0: -0.1, x1: 1.6, tx1: 1.2, h: 0.55 }], gear: 'float' },
};
/** Height of the centre of gravity above the ground when the aircraft sits on its wheels. */
export function groundY(spec) { return spec.fus.r * spec.fus.ar + (spec.gear === 'fixedbig' ? 1.15 : spec.gear === 'float' ? 1.06 : 0.95); }

export function floatplaneSpec(nation) { return FLOATPLANES[nation] || FLOATPLANES.USA; }

/** Which aircraft a nation's carriers fly for a role ('dive' | 'torp'). */
export function planeTypeFor(nation, role) {
  const t = {
    USA: { dive: 'sbd', torp: 'tbf' }, Japan: { dive: 'd3a', torp: 'b5n' }, UK: { dive: 'skua', torp: 'swordfish' },
    Germany: { dive: 'ju87', torp: 'fi167' }, France: { dive: 'ln401', torp: 'pl10' }, Italy: { dive: 're2001', torp: 're2001t' },
  }[nation] || { dive: 'sbd', torp: 'tbf' };
  return t[role];
}

// ---- low level helpers --------------------------------------------------------------------------------------

/** Lofted body along x: stations {x, ry, rz, yc, zc}. */
function loft(b, st, col, mat, o = {}) {
  const n = o.seg || 12;
  const rings = [];
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
    }
    rings.push(ring);
  }
  // wound counter-clockwise seen from outside whichever way the stations run along x
  const flip = st[0].x > st[st.length - 1].x;
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (flip) b.quadIdx(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
      else b.quadIdx(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]);
    }
  }
  return rings;
}

/** Closed slab from the mid-surface corners A (root LE), B (tip LE), C (tip TE), D (root TE) with thickness th0 / th1. */
function panel(b, A, B, C, D, th0, th1, top, bot, mat = MAT.AIRCRAFT) {
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
function disc(b, cx, cy, cz, r, axis, sign, col, mat = MAT.AIRCRAFT, lift = 0.012) {
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
function insignia(b, nation, cx, cy, cz, r, axis, sign) {
  const w = rgb('#f0eee6');
  switch (nation) {
    case 'USA': {
      disc(b, cx, cy, cz, r, axis, sign, rgb('#1f3a78'), MAT.AIRCRAFT, 0.012);
      disc(b, cx, cy, cz, r * 0.62, axis, sign, w, MAT.AIRCRAFT, 0.016);
      bar(b, cx - r * 1.5, cy, cz, r * 0.62, r * 0.2, axis, sign, w);
      bar(b, cx + r * 1.5, cy, cz, r * 0.62, r * 0.2, axis, sign, w);
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
    default: break;
  }
}

// ---- the generator -----------------------------------------------------------------------------------------

/**
 * Draw (part of) an aircraft into builder b. part: 'whole' | 'body' | 'wingL' | 'wingR' | 'tail' | 'prop' | 'gear' | 'ordnance'.
 */
export function drawPlane(b, s, { part = 'whole' } = {}) {
  const P = PAINT[s.nation] || PAINT.USA;
  const top = rgb(P.top), bot = rgb(P.bot), acc = rgb(P.acc);
  const dark = rgb('#25272a'), glass = rgb('#0f161c');
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

  if (all || part === 'body') {
    const st = stationsAt(noseX, aftCut);
    // a station right at the cut so the two halves meet
    loft(b, st, skin, MAT.AIRCRAFT);
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
    // canopy: glazed greenhouse with metal frames
    for (const c of s.canopy) {
      const yb = ry0 * 0.78, h = c.h;
      if (c.open) {
        b.block({ x0: c.x0, x1: c.x1, hw: rz0 * 0.55, y0: yb, y1: yb + h * 0.5 }, shade(dark, 0.9), MAT.DARK, { top: false });
        b.sphere((c.x0 + c.x1) / 2, yb + h * 0.7, 0, 0.22, 0.22, 0.2, rgb('#d9b99b'), MAT.CANVAS, { seg: 7, rings: 4 });      // pilot's head
        b.sphere((c.x0 + c.x1) / 2, yb + h * 0.94, 0, 0.26, 0.2, 0.24, rgb('#3a2f25'), MAT.CANVAS, { seg: 7, rings: 4, half: true });   // helmet
        b.block({ x0: c.x1 - 0.05, x1: c.x1 + 0.03, hw: rz0 * 0.5, y0: yb + h * 0.3, y1: yb + h * 0.85, tx1: c.x1 - 0.2 }, glass, MAT.GLASS);   // windscreen
      } else {
        b.block({ x0: c.x0, x1: c.x1, hw: rz0 * 0.72, y0: yb - 0.04, y1: yb + h, tx0: c.x0 + 0.05, tx1: c.tx1, thw: rz0 * 0.5 }, glass, MAT.GLASS);
        for (const sz of [-1, 1]) b.beam([c.x0, yb, sz * rz0 * 0.72], [(c.x0 + c.x1) / 2, yb + h, sz * rz0 * 0.45], 0.05, 0.05, shade(top, 0.8), MAT.AIRCRAFT, { caps: false });
        b.beam([c.x0 + (c.x1 - c.x0) * 0.35, yb + h * 0.1, -rz0 * 0.7], [c.x0 + (c.x1 - c.x0) * 0.35, yb + h * 0.95, 0], 0.05, 0.05, shade(top, 0.8), MAT.AIRCRAFT, { caps: false });
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
    // fin and rudder
    const fy = ry0 * 0.15;
    b.quad([tx + t.finChord * 0.4, fy, 0.05], [tx + t.finChord * 0.4 - 0.4, fy + t.fin, 0.05], [tx - t.finChord * 0.3, fy + t.fin * 0.95, 0.05], [tx - t.finChord * 0.45, fy, 0.05], top, MAT.AIRCRAFT, [tx, fy, -1], 1);
    b.quad([tx + t.finChord * 0.4, fy, -0.05], [tx - t.finChord * 0.45, fy, -0.05], [tx - t.finChord * 0.3, fy + t.fin * 0.95, -0.05], [tx + t.finChord * 0.4 - 0.4, fy + t.fin, -0.05], top, MAT.AIRCRAFT, [tx, fy, 1], 1);
    b.quad([tx + t.finChord * 0.4, fy, 0.05], [tx - t.finChord * 0.45, fy, 0.05], [tx - t.finChord * 0.45, fy, -0.05], [tx + t.finChord * 0.4, fy, -0.05], top, MAT.AIRCRAFT, [tx, fy + 1, 0], 1);
    // team identification band on the fin (tinted with the team colour by the renderer)
    b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, 0.062], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, 0.062], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, 0.062], [tx - t.finChord * 0.2, fy + t.fin * 0.82, 0.062], acc, MAT.FLAG, [tx, fy, -1], 1);
    b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, -0.062], [tx - t.finChord * 0.2, fy + t.fin * 0.82, -0.062], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, -0.062], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, -0.062], acc, MAT.FLAG, [tx, fy, 1], 1);
    // tail wheel
    if (s.gear !== 'float' && s.gear !== 'retract') b.cylinder(tx + 0.3, -ry0 * 0.1, 0, 0.05, 0.05, ry0 * 0.15, dark, MAT.DARK, { seg: 5 });
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
      const kneeZ = hs * 0.3, drop = w.gull;
      const root = [[x0 + cr / 2, yr + 0.1, 0.0], [x0 - cr / 2, yr + 0.1, 0.0]];
      const knee = [[x0 + cr * 0.34 + 0.1, yr - drop * 0.5, sg * kneeZ], [x0 - cr * 0.34, yr - drop * 0.5, sg * kneeZ]];
      const tip = [[x0 + ct / 2 + w.sweep * 0.5, yr - drop * 0.1 + 0.6, sg * hs], [x0 - ct / 2 + w.sweep * 0.5, yr - drop * 0.1 + 0.6, sg * hs]];
      panel(b, root[0], knee[0], knee[1], root[1], w.t * 1.05, w.t * 0.9, top, bot);
      panel(b, knee[0], tip[0], tip[1], knee[1], w.t * 0.9, w.t * 0.5, top, bot);
      insignia(b, s.nation, x0 - 0.1, yr - drop * 0.1 + 0.62 + w.t * 0.3, sg * hs * 0.72, 0.55, 'y', 1);
      insignia(b, s.nation, x0 - 0.1, yr - drop * 0.1 + 0.62 - w.t * 0.3, sg * hs * 0.72, 0.55, 'y', -1);
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
    insignia(b, s.nation, x0 - 0.15, yr + dih * 0.65 + w.t * 0.32, sg * hs * 0.68, Math.min(0.62, hs * 0.09), 'y', 1);
    insignia(b, s.nation, x0 - 0.15, yr + dih * 0.65 - w.t * 0.32, sg * hs * 0.68, Math.min(0.62, hs * 0.09), 'y', -1);
    // aileron hint and wing-root fillet
    b.quad([x0 - cr / 2 + 0.2, yr + w.t * 0.3, sg * hs * 0.55], [x0 - cr / 2 + 0.2 + sweep * 0.5, yr + dih * 0.65 + w.t * 0.2, sg * hs * 0.95], [x0 - ct / 2 + sweep, yr + dih * 0.9 + w.t * 0.2, sg * hs * 0.95], [x0 - cr / 2 + 0.05, yr + w.t * 0.3, sg * hs * 0.55], shade(top, 0.82), MAT.AIRCRAFT, [x0, yr - 1, sg * hs * 0.7], 1);
  };
  if (all || part === 'wingR') wingSide(1);
  if (all || part === 'wingL') wingSide(-1);

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
  if (part === 'gear' && s.gear !== 'float') drawGear(b, s, top, dark, false);
  if (part === 'gear' && s.gear === 'float') drawFloats(b, s, top, dark);
  if (all && s.gear === 'float') drawFloats(b, s, top, dark);

  // ----- ordnance -----
  if (part === 'ordnance') {
    if (s.ordnance === 'torp') drawTorpedo(b, 0, -(ry0 + 0.36), 0, 1);
    else if (s.ordnance === 'bomb') drawBomb(b, 0.2, -(ry0 + 0.32), 0, s.bombKg || 250);
  }
}

function drawGear(b, s, top, dark, fixed) {
  const w = s.wing, hs = s.span / 2, ry0 = s.fus.r * s.fus.ar;
  const track = fixed && s.gear === 'fixedbig' ? 1.6 : hs * 0.2;
  const legTopY = s.kind === 'bi' ? -ry0 * 0.7 : w.y - 0.1;
  const wr = s.gear === 'fixedbig' ? 0.42 : 0.3;
  const gy = -(ry0 + (s.gear === 'fixedbig' ? 1.15 : 0.95));
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
  const yU = gap * 0.55, yL = -gap * 0.45;
  const xU = w.x + (w.stagger || 0), xL = w.x - (w.stagger || 0);
  // upper wing
  panel(b, [xU + w.cr / 2, yU, sg * 0.1], [xU + w.ct / 2 + w.sweep, yU + w.dih, sg * hs], [xU - w.ct / 2 + w.sweep, yU + w.dih, sg * hs], [xU - w.cr / 2, yU, sg * 0.1], w.t, w.t * 0.8, top, bot);
  // lower wing
  panel(b, [xL + w.cr / 2, yL, sg * 0.2], [xL + w.ct / 2 + w.sweep * 0.5, yL, sg * lowerSpan], [xL - w.ct / 2 + w.sweep * 0.5, yL, sg * lowerSpan], [xL - w.cr / 2, yL, sg * 0.2], w.t, w.t * 0.8, top, bot);
  insignia(b, s.nation, xU - 0.1, yU + w.dih * 0.6 + w.t * 0.5 + 0.02, sg * hs * 0.66, Math.min(0.7, hs * 0.1), 'y', 1);
  insignia(b, s.nation, xL - 0.1, yL - w.t * 0.5 - 0.02, sg * lowerSpan * 0.66, Math.min(0.7, hs * 0.1), 'y', -1);
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
 * Build (once) the meshes of an aircraft type. Returns { spec, meshes: { whole, body, wingL, wingR, tail, prop, gear, ordnance } (built
 * mesh descriptors), radius }.
 */
export function getPlaneModel(typeKey) {
  let m = cache.get(typeKey);
  if (m) return m;
  const spec = PLANES[typeKey];
  const out = {};
  for (const part of ['whole', 'body', 'wingL', 'wingR', 'tail', 'prop', 'gear', 'ordnance']) {
    const b = new MeshBuilder();
    drawPlane(b, spec, { part });
    out[part] = b.vertexCount ? b.build() : null;
  }
  const ry0 = spec.fus.r * spec.fus.ar;
  m = { key: typeKey, spec, meshes: out, radius: Math.hypot(spec.span / 2, spec.L / 2), groundY: ry0 + (spec.gear === 'fixedbig' ? 1.15 : 0.95) };
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

/** Standalone ordnance meshes, for the objects in flight: { bomb250, bomb500, torpedo }. */
export function buildOrdnanceMeshes() {
  const mk = (fn) => { const b = new MeshBuilder(); fn(b); return b.build(); };
  return {
    bomb250: mk((b) => drawBomb(b, 0, 0, 0, 250)),
    bomb500: mk((b) => drawBomb(b, 0, 0, 0, 500)),
    torpedo: mk((b) => drawTorpedo(b, 0, 0, 0, 1)),
  };
}
