// The cockpit seen from the pilot's seat: the instrument panel with working dials (airspeed, artificial horizon, altimeter, compass, climb, revolutions, clock and
// engine gauges: the shader draws them from the flight state, see MAT.GAUGE), the coaming and the glare shield, the windscreen and the canopy rails, the side walls,
// the control stick (it moves with the controls), the throttle quadrant, a reflector sight, and the blur of the propeller disc. Built in the frame of the aircraft
// (x forward, y up, z to starboard), round the eye of the pilot, so it is drawn with the matrix of the aircraft.
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';
import { propMounts } from './heavy.js';

/** Where the pilot's eye is in the aircraft's frame, and whether the cockpit is open (a biplane's, a Swordfish's). */
export function cockpitEye(spec) {
  if (spec.eye) return { x: spec.eye.x, y: spec.eye.y, z: spec.eye.z, open: false, bi: false };      // a bomber: the left seat of a flight deck, given in the sheet
  const cn = spec.canopy[0], ry0 = spec.fus.r * spec.fus.ar;
  if (cn.open) {
    // an open cockpit: the head over the coaming, behind the little windscreen (a biplane's pilot looks out under the upper wing, model/planes.js upperWingY)
    return { x: cn.x0 + 0.2, y: ry0 * 0.78 + cn.h + 0.3, z: 0, open: true, bi: spec.kind === 'bi' };
  }
  // under a canopy: the eye a hand's breadth under the roof, a little more than half a metre behind the top of the windscreen
  const C = canopyFrame(spec);
  const x = Math.min(Math.max(C.xWt - 0.6, cn.x0 + 0.35), cn.x1 - 0.5);
  return { x, y: Math.max(C.roof - 0.2, C.sill + 0.24), z: 0, open: false, bi: spec.kind === 'bi' };
}

/**
 * The glazing of the pilot's canopy as the outside model draws it (model/planes.js): the base of the glass (yb) and its half width there, the roof and its half width, the windscreen
 * from its foot (x1) to its top (xWt), the back of the hood (x0); the edge of the opening in the fuselage under it (sill, its half width) and the radii of the fuselage.
 */
export function canopyFrame(spec) {
  const cn = spec.canopy[0], rz0 = spec.fus.r, ry0 = rz0 * spec.fus.ar, yb = ry0 * 0.78;
  return {
    x0: cn.x0, x1: cn.x1, xWt: (cn.tx1 ?? cn.x1) - 0.15, xRt: cn.x0 + 0.25, yb: yb - 0.04, roof: yb + cn.h * 0.92, hwB: rz0 * 0.7, hwT: rz0 * 0.3,
    sill: ry0 * 0.866, hwS: rz0 * 0.5, ry0, rz0,
  };
}

// interior colours by nation: [walls, panel, trim]
const INTERIOR = {
  USA: ['#5f6f4a', '#1b1c1d', '#2c2e2a'],
  Japan: ['#6d7566', '#202221', '#34382f'],
  UK: ['#3d4538', '#17181a', '#26292a'],
  Germany: ['#4a4d52', '#1a1b1d', '#2b2d30'],
  France: ['#6a7078', '#1d1e20', '#2f3234'],
  Italy: ['#626a58', '#1c1d1d', '#2d302c'],
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A flat quad with texture coordinates in the colour (r = u, g = v, b = the tag), the normal turned towards `eye`. corners: bottom-left, bottom-right, top-right, top-left. */
function face(b, c, mat, tag, eye, ao = 1) {
  let n = norm(cross(sub(c[1], c[0]), sub(c[3], c[0])));
  const mid = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2, (c[0][2] + c[2][2]) / 2];
  if (dot(n, sub(eye, mid)) < 0) n = [-n[0], -n[1], -n[2]];
  const uv = [[0, 0], [255, 0], [255, 255], [0, 255]];
  const v = c.map((p, i) => b.vert(p[0], p[1], p[2], n[0], n[1], n[2], [uv[i][0], uv[i][1], tag], mat, ao));
  b.tri(v[0], v[1], v[2]); b.tri(v[0], v[2], v[3]);
}

/** A flat quad facing the eye (its normal turned towards it: the faces of the tub are seen from inside). */
function q4(b, a, c, d, e, col, mat, eye, ao = 1) {
  const m = [(a[0] + c[0] + d[0] + e[0]) / 4, (a[1] + c[1] + d[1] + e[1]) / 4, (a[2] + c[2] + d[2] + e[2]) / 4];
  b.quad(a, c, d, e, col, mat, [2 * m[0] - eye[0], 2 * m[1] - eye[1], 2 * m[2] - eye[2]], ao);
}

/** A panel (a rectangle by its centre, its axes and half sizes), flat-coloured. */
function slab(b, o, ax, ay, hx, hy, col, mat, eye, ao = 1) {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [o[0] + ax[0] * hx * sx + ay[0] * hy * sy, o[1] + ax[1] * hx * sx + ay[1] * hy * sy, o[2] + ax[2] * hx * sx + ay[2] * hy * sy]);
  let n = norm(cross(sub(c[1], c[0]), sub(c[3], c[0])));
  if (dot(n, sub(eye, o)) < 0) n = [-n[0], -n[1], -n[2]];
  const v = c.map((p) => b.vert(p[0], p[1], p[2], n[0], n[1], n[2], col, mat, ao));
  b.tri(v[0], v[1], v[2]); b.tri(v[0], v[2], v[3]);
}

// gauge types (the tag of a GAUGE quad is type * 16): see the shader
export const GAUGE = { SPEED: 0, HORIZON: 1, ALT: 2, COMPASS: 3, CLIMB: 4, RPM: 5, CLOCK: 6, TEMP: 7 };

/** The meshes of a cockpit: { interior, stick, disc, eye, pivot } (the stick is built round its pivot; the disc is the blur of the propeller, in the plane of the propeller). */
export function buildCockpit(spec) {
  if (spec.engines) return buildHeavyCockpit(spec);
  const E = cockpitEye(spec);
  const eyeP = [E.x, E.y, E.z];
  const P = (x, y, z) => [E.x + x, E.y + y, E.z + z];
  const [wallHex, panelHex, trimHex] = INTERIOR[spec.nation] || INTERIOR.USA;
  const wall = shade(rgb(wallHex), 0.62), panel = rgb(panelHex), trim = shade(rgb(trimHex), 0.7), metal = rgb('#3a3c3e');
  const hw = Math.max(0.3, Math.min(0.42, spec.fus.r * 0.8));
  const b = new MeshBuilder();
  const IN = MAT.INTERIOR;

  if (!E.open) buildClosedTub(b, spec, E, { wall, panel, trim, metal, IN, eyeP });
  else {
  // ---- the instrument panel: a little behind the cowling, tilted back, the dials on it ----
    const open = E.open;
    const panelC = P(open ? 0.46 : 0.56, open ? -0.27 : -0.30, 0);
    const tilt = 0.2;                                           // the top leans back towards the pilot
    const uY = [-Math.sin(tilt), Math.cos(tilt), 0], uZ = [0, 0, 1];
    const ph = open ? 0.17 : 0.19, pw = open ? 0.27 : hw * 0.95;
    slab(b, panelC, uZ, uY, pw, ph, panel, IN, eyeP);
    // a rim round the panel, the coaming above it (black, with a shade over the dials), the sills at its sides
    const top = [panelC[0] + uY[0] * ph, panelC[1] + uY[1] * ph, panelC[2]];
    b.beam([top[0], top[1], -pw], [top[0], top[1], pw], 0.03, 0.028, shade(trim, 0.7), IN);
    slab(b, [top[0] + 0.12, top[1] + 0.012, 0], [1, 0, 0], [0, 0, 1], 0.15, pw + 0.02, shade(panel, 0.9), IN, eyeP);     // glare shield (a slab laid flat: x forward, z across)
    // the dials: two rows of three and the small ones at the sides
    const dial = (type, du, dv, r) => {
      const o = [panelC[0] + uY[0] * dv - 0.006, panelC[1] + uY[1] * dv, panelC[2] + du];
      const R = [0, 0, r], U = [uY[0] * r, uY[1] * r, 0];
      face(b, [[o[0] - R[0] - U[0], o[1] - R[1] - U[1], o[2] - R[2] - U[2]], [o[0] + R[0] - U[0], o[1] + R[1] - U[1], o[2] + R[2] - U[2]], [o[0] + R[0] + U[0], o[1] + R[1] + U[1], o[2] + R[2] + U[2]], [o[0] - R[0] + U[0], o[1] - R[1] + U[1], o[2] - R[2] + U[2]]], MAT.GAUGE, type * 16, eyeP);
    };
    const g = open ? 0.056 : 0.066, sp = g * 2.35;
    dial(GAUGE.SPEED, -sp, 0.075, g); dial(GAUGE.HORIZON, 0, 0.075, g * 1.12); dial(GAUGE.ALT, sp, 0.075, g);
    dial(GAUGE.COMPASS, -sp, -0.075, g); dial(GAUGE.CLIMB, 0, -0.075, g); dial(GAUGE.RPM, sp, -0.075, g);
    if (!open) {
      dial(GAUGE.CLOCK, -pw + 0.07, 0.11, g * 0.62); dial(GAUGE.TEMP, -pw + 0.07, -0.01, g * 0.62);
      dial(GAUGE.TEMP, pw - 0.07, 0.11, g * 0.62); dial(GAUGE.TEMP, pw - 0.07, -0.01, g * 0.62);
      // switches and a row of small lamps under the dials
      for (let i = -4; i <= 4; i++) b.box(panelC[0] - 0.01 + uY[0] * -0.165, panelC[1] + uY[1] * -0.165, i * 0.05, 0.012, 0.012, 0.01, i % 3 ? shade(metal, 1.2) : rgb('#7a2a1c'), IN);
    }
  
    // ---- the windscreen, the canopy and the structure round the pilot ----
    const rail = (a, c, w = 0.035) => b.beam(P(...a), P(...c), w, w, shade(trim, 0.9), IN);
    if (!open) {
      const y0 = -0.10, yTop = 0.2, xFront = 0.62, xBow = 0.18;
      // the two windscreen pillars and the bow across the top; a centre pillar on the types that had one
      for (const s of [-1, 1]) rail([xFront, y0, s * (hw * 0.9)], [xBow, yTop, s * (hw * 0.82)], 0.04);
      rail([xBow, yTop, -hw * 0.82], [xBow, yTop, hw * 0.82], 0.035);
      if (spec.nation === 'Germany' || spec.nation === 'Italy' || spec.nation === 'France') rail([xFront - 0.02, y0, 0], [xBow, yTop, 0], 0.03);
      // sliding hood rails and the sills, the frames of the side windows, the sidewalls
      for (const s of [-1, 1]) {
        rail([xBow, yTop, s * hw * 0.82], [-0.7, yTop - 0.02, s * hw * 0.9], 0.03);
        rail([xFront - 0.1, y0 - 0.06, s * hw * 0.94], [-0.8, y0 - 0.06, s * hw * 1.0], 0.04);
        rail([-0.25, y0 - 0.06, s * hw * 0.97], [-0.25, yTop - 0.02, s * hw * 0.88], 0.028);
        rail([-0.7, y0 - 0.06, s * hw * 1.0], [-0.7, yTop - 0.02, s * hw * 0.9], 0.03);
        slab(b, P(0.0, y0 - 0.32, s * hw * 0.98), [1, 0, 0], [0, 1, 0], 0.75, 0.27, wall, IN, eyeP, 0.8);
      }
    } else {
      // an open cockpit: the leather coaming round it and a small windscreen on a frame
      for (const s of [-1, 1]) { rail([0.3, -0.23, s * 0.3], [-0.45, -0.23, s * 0.32], 0.07); slab(b, P(0.0, -0.32, s * 0.33), [1, 0, 0], [0, 1, 0], 0.5, 0.2, wall, IN, eyeP, 0.8); }
      rail([0.3, -0.23, -0.3], [0.3, -0.23, 0.3], 0.07);
      rail([0.4, -0.12, -0.27], [0.4, 0.1, -0.22], 0.025); rail([0.4, -0.12, 0.27], [0.4, 0.1, 0.22], 0.025);
      rail([0.4, 0.1, -0.22], [0.4, 0.1, 0.22], 0.025);
    }
    // the sidewall consoles: throttle quadrant on the left, trim wheel and a lever on the right
    b.box(...P(0.2, -0.36, -hw * 0.82), 0.16, 0.05, 0.05, metal, IN);
    b.beam(P(0.2, -0.33, -hw * 0.82), P(0.14, -0.2, -hw * 0.8), 0.022, 0.022, shade(trim, 1.3), IN);
    b.sphere(...P(0.14, -0.19, -hw * 0.8), 0.028, 0.028, 0.028, rgb('#8a2a1e'), IN, { seg: 8, rings: 5 });
    b.beam(P(0.24, -0.33, -hw * 0.82), P(0.2, -0.22, -hw * 0.78), 0.018, 0.018, shade(trim, 1.3), IN);
    b.sphere(...P(0.2, -0.215, -hw * 0.78), 0.024, 0.024, 0.024, rgb('#2a4e8a'), IN, { seg: 8, rings: 5 });
    b.cyl(E.x + 0.1, E.y - 0.37, E.z + hw * 0.8, 0.05, 0.05, 0.05, 0.05, E.y - 0.34, shade(metal, 1.3), IN, { seg: 14 });
    // the reflector sight: the glass in front of the pilot, the ring and the dot are drawn on it by the shader
    if (!open) {
      b.box(...P(0.46, -0.075, 0), 0.07, 0.02, 0.05, shade(panel, 1.2), IN);
      const sg = P(0.42, 0.01, 0), sz = 0.07;
      face(b, [[sg[0] - 0.03, sg[1] - sz, sg[2] - sz], [sg[0] - 0.03, sg[1] - sz, sg[2] + sz], [sg[0] - 0.05, sg[1] + sz, sg[2] + sz], [sg[0] - 0.05, sg[1] + sz, sg[2] - sz]], MAT.SIGHT, 0, eyeP);
      b.beam(P(0.44, -0.06, -sz), P(0.38, 0.07, -sz), 0.012, 0.012, shade(metal, 1.1), IN);
      b.beam(P(0.44, -0.06, sz), P(0.38, 0.07, sz), 0.012, 0.012, shade(metal, 1.1), IN);
    }
    // the floor under the pilot's feet and the seat pan
    slab(b, P(-0.05, -0.64, 0), [1, 0, 0], [0, 0, 1], 0.8, hw * 0.98, shade(panel, 1.1), IN, eyeP, 0.8);
    b.box(...P(-0.32, -0.5, 0), 0.4, 0.06, hw * 1.2, shade(wall, 0.8), IN);
  }
  const interior = b.build({ ao: false });

  // ---- the stick: built round its pivot (the foot, between the pilot's knees) ----
  const sb = new MeshBuilder();
  sb.beam([0, 0, 0], [-0.03, 0.42, 0], 0.03, 0.03, shade(metal, 1.1), IN);
  sb.box(-0.03, 0.43, 0, 0.05, 0.07, 0.05, rgb('#1b1b1c'), IN);                    // the grip
  sb.box(-0.02, 0.47, 0.02, 0.012, 0.012, 0.012, rgb('#8a2a1e'), IN);                // the gun button
  sb.cyl(0, -0.02, 0, 0.045, 0.045, 0.045, 0.045, 0.03, shade(metal, 0.8), IN, { seg: 10 });
  const stick = sb.build({ ao: false });

  // ---- the blur of the propeller: a disc in the plane of the propeller, drawn with a pattern that the shader turns ----
  let disc = null;
  if (spec.prop) {
    const db = new MeshBuilder();
    const r = spec.prop.r, n = 40;
    const c = [spec.engine && spec.engine.pusher ? spec.prop.x - 0.9 : spec.L * 0.42 + 0.02, 0, 0];
    const ctr = db.vert(c[0], c[1], c[2], 1, 0, 0, [128, 128, spec.prop.n * 16], MAT.DISC, 1);
    const ring = [];
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; ring.push(db.vert(c[0], Math.cos(a) * r, Math.sin(a) * r, 1, 0, 0, [Math.round(128 + 127 * Math.sin(a)), Math.round(128 + 127 * Math.cos(a)), spec.prop.n * 16], MAT.DISC, 1)); }
    for (let i = 0; i < n; i++) db.tri(ctr, ring[i], ring[i + 1]);
    disc = db.build({ ao: false });
  }
  return { interior, stick, disc, eye: E, pivot: E.open ? P(0.1, -0.62, 0) : E.pivot };
}

/**
 * The cockpit tub of a single-engine aircraft under a canopy, fitted to the opening the outside model leaves in the fuselage from the pilot's seat (model/planes.js, part 'cabin'):
 * the side walls from the sill down to the floor, the instrument panel under a coaming that closes the opening at the front (the dials on it), the firewall under the panel, the
 * armoured back of the seat and the bulkhead behind it, the floor, the seat; the frames of the canopy follow the edges of its glass; the throttle quadrant, the trim wheel, the
 * reflector sight on the coaming. Sets E.pivot (the foot of the stick).
 */
function buildClosedTub(b, spec, E, c) {
  const { wall, panel, trim, metal, IN, eyeP } = c;
  const C = canopyFrame(spec);
  const hw = C.hwS * 0.98, floor = Math.max(E.y - 1.05, -C.ry0 * 0.55), sill = C.sill;
  const xFront = Math.min(C.x1 - 0.04, E.x + 0.8), xBack = Math.max(C.x0 + 0.04, E.x - 0.55);
  const rail = (a, d, w = 0.035, col = shade(trim, 0.9)) => b.beam(a, d, w, w, col, IN);
  // the side walls, from the sill down, from the panel back to the bulkhead; the sill itself, padded
  for (const sg of [-1, 1]) {
    const z = sg * hw;
    q4(b, [xFront, floor, z], [xBack, floor, z], [xBack, sill, z], [xFront, sill, z], wall, IN, eyeP, 0.85);
    rail([xFront + 0.05, sill, z * 1.01], [C.x0 - 0.02, sill, z * 1.01], 0.04, shade(trim, 0.75));
    // a stringer and two frames on the wall
    rail([xFront, sill - 0.25, z * 0.99], [xBack, sill - 0.25, z * 0.99], 0.02, shade(wall, 0.8));
    for (const fx of [E.x + 0.35, E.x - 0.25]) rail([fx, floor, z * 0.99], [fx, sill, z * 0.99], 0.022, shade(wall, 0.8));
  }
  // the instrument panel: its top at the sill, leaning back a little; the coaming over it closes the opening to the foot of the windscreen
  const tilt = 0.18, uY = [-Math.sin(tilt), Math.cos(tilt), 0];
  // (the coaming and the top of the panel at the height of the top of the fuselage ahead, where the skin closes again: no hump of skin in front of the dials)
  const yC = Math.max(sill, C.ry0 * 1.02), ph = Math.min(0.2, (yC - floor) * 0.3), pw = hw * 0.96;
  const panelC = [xFront - uY[0] * ph, yC - ph * uY[1] - 0.015, 0];
  slab(b, panelC, [0, 0, 1], uY, pw, ph, panel, IN, eyeP);
  q4(b, [xFront - 0.02, yC + 0.01, -hw * 1.02], [C.x1 + 0.04, yC + 0.01, -hw * 1.02], [C.x1 + 0.04, yC + 0.01, hw * 1.02], [xFront - 0.02, yC + 0.01, hw * 1.02], shade(panel, 0.9), IN, eyeP, 0.9);
  b.beam([xFront - 0.02, yC + 0.01, -pw], [xFront - 0.02, yC + 0.01, pw], 0.035, 0.03, shade(trim, 0.6), IN);
  for (const sg of [-1, 1]) q4(b, [xFront - 0.02, sill, sg * hw], [C.x1 + 0.04, sill, sg * hw], [C.x1 + 0.04, yC + 0.01, sg * hw], [xFront - 0.02, yC + 0.01, sg * hw], wall, IN, eyeP, 0.8);
  const dial = (type, du, dv, r) => {
    const o = [panelC[0] + uY[0] * dv - 0.006, panelC[1] + uY[1] * dv, panelC[2] + du];
    const R = [0, 0, r], U = [uY[0] * r, uY[1] * r, 0];
    face(b, [[o[0] - R[0] - U[0], o[1] - R[1] - U[1], o[2] - R[2] - U[2]], [o[0] + R[0] - U[0], o[1] + R[1] - U[1], o[2] + R[2] - U[2]], [o[0] + R[0] + U[0], o[1] + R[1] + U[1], o[2] + R[2] + U[2]], [o[0] - R[0] + U[0], o[1] - R[1] + U[1], o[2] - R[2] + U[2]]], MAT.GAUGE, type * 16, eyeP);
  };
  const g = Math.min(0.064, ph * 0.33, pw * 0.2), sp = g * 2.35, dv = ph * 0.45;
  dial(GAUGE.SPEED, -sp, dv, g); dial(GAUGE.HORIZON, 0, dv, g * 1.12); dial(GAUGE.ALT, sp, dv, g);
  dial(GAUGE.COMPASS, -sp, -dv, g); dial(GAUGE.CLIMB, 0, -dv, g); dial(GAUGE.RPM, sp, -dv, g);
  if (pw > sp + g * 2.4) {
    dial(GAUGE.CLOCK, -pw + g * 1.1, dv * 1.2, g * 0.62); dial(GAUGE.TEMP, -pw + g * 1.1, -dv * 0.2, g * 0.62);
    dial(GAUGE.TEMP, pw - g * 1.1, dv * 1.2, g * 0.62); dial(GAUGE.TEMP, pw - g * 1.1, -dv * 0.2, g * 0.62);
  }
  for (let i = -4; i <= 4; i++) if (Math.abs(i * 0.045) < pw - 0.03) b.box(panelC[0] - 0.01 - uY[0] * ph * 0.85, panelC[1] - uY[1] * ph * 0.85, i * 0.045, 0.011, 0.011, 0.01, i % 3 ? shade(metal, 1.2) : rgb('#7a2a1c'), IN);
  // the firewall under the panel (the rudder pedals in front of it), the floor
  const xFw = xFront + 0.02;
  q4(b, [xFw, floor, -hw], [xFw, floor, hw], [xFw, panelC[1] - ph, hw], [xFw, panelC[1] - ph, -hw], shade(panel, 1.15), IN, eyeP, 0.7);
  for (const sg of [-1, 1]) b.box(xFw - 0.12, floor + 0.08, sg * 0.14, 0.05, 0.12, 0.05, shade(metal, 1.1), IN);
  q4(b, [xFw, floor, -hw], [xBack, floor, -hw], [xBack, floor, hw], [xFw, floor, hw], shade(panel, 1.1), IN, eyeP, 0.8);
  // the seat (pan and back, armour plate behind it with a headrest) and the bulkhead that closes the tub
  const seatY = E.y - 0.78;
  b.box(E.x - 0.18, seatY, 0, 0.42, 0.06, hw * 0.75, shade(wall, 0.75), IN);
  b.box(E.x - 0.42, seatY + 0.32, 0, 0.05, 0.6, hw * 0.72, shade(wall, 0.7), IN);
  b.box(E.x - 0.46, E.y - 0.02, 0, 0.06, 0.2, 0.16, rgb('#3b2c22'), IN);              // the headrest
  // (just over the sill: the pilot looks back over it, past his armour plate and headrest, at the rear of the canopy and the tail); a deck over the rest of the opening behind it
  const yBk = sill + 0.08;
  q4(b, [xBack, floor, -hw], [xBack, floor, hw], [xBack, yBk, hw], [xBack, yBk, -hw], shade(wall, 0.6), IN, eyeP, 0.7);
  if (xBack - C.x0 > 0.06) q4(b, [xBack, yBk, -hw], [xBack, yBk, hw], [C.x0 - 0.02, yBk - 0.02, hw], [C.x0 - 0.02, yBk - 0.02, -hw], shade(wall, 0.55), IN, eyeP, 0.7);
  // the canopy frames along the edges of the glass: the windscreen pillars and its top bow, the rails at the base, the hoop over the pilot and the back of the hood
  const fr = shade(trim, 0.95);
  for (const sg of [-1, 1]) {
    rail([C.x1, C.yb, sg * C.hwB], [C.xWt, C.roof, sg * C.hwT], 0.032, fr);
    rail([C.x1, C.yb, sg * C.hwB], [C.x0, C.yb, sg * C.hwB], 0.03, fr);
    rail([C.xWt, C.roof, sg * C.hwT], [C.xRt, C.roof, sg * C.hwT], 0.025, fr);
    rail([C.x0, C.yb, sg * C.hwB], [C.xRt, C.roof, sg * C.hwT], 0.03, fr);
    const xh = E.x - 0.15, k = (xh - C.xRt) / ((C.xWt - C.xRt) || 1);
    if (k > 0 && k < 1) rail([xh, C.yb, sg * C.hwB], [xh, C.roof, sg * C.hwT], 0.026, fr);
  }
  rail([C.xWt, C.roof, -C.hwT], [C.xWt, C.roof, C.hwT], 0.032, fr);
  rail([C.x1, C.yb, -C.hwB], [C.x1, C.yb, C.hwB], 0.03, fr);
  if (spec.nation === 'Germany' || spec.nation === 'Italy' || spec.nation === 'France') rail([C.x1, C.yb, 0], [C.xWt, C.roof, 0], 0.025, fr);
  // the throttle quadrant on the left wall, the trim wheel on the right, the reflector sight on the coaming
  const zL = -hw * 0.92, yq = sill - 0.12;
  b.box(E.x + 0.18, yq, zL, 0.2, 0.05, 0.05, metal, IN);
  b.beam([E.x + 0.2, yq + 0.03, zL], [E.x + 0.14, yq + 0.15, zL * 0.97], 0.022, 0.022, shade(trim, 1.3), IN);
  b.sphere(E.x + 0.14, yq + 0.16, zL * 0.97, 0.028, 0.028, 0.028, rgb('#8a2a1e'), IN, { seg: 8, rings: 5 });
  b.cyl(E.x + 0.1, yq - 0.06, -zL * 0.95, 0.05, 0.05, 0.05, 0.05, yq - 0.03, shade(metal, 1.3), IN, { seg: 14 });
  const sx = xFront - 0.05, sy = yC + 0.03;
  b.box(sx, sy + 0.03, 0, 0.07, 0.03, 0.05, shade(panel, 1.2), IN);
  const sg0 = [sx - 0.03, sy + 0.11, 0], sz = 0.065;
  face(b, [[sg0[0] + 0.01, sg0[1] - sz, -sz], [sg0[0] + 0.01, sg0[1] - sz, sz], [sg0[0] - 0.01, sg0[1] + sz, sz], [sg0[0] - 0.01, sg0[1] + sz, -sz]], MAT.SIGHT, 0, eyeP);
  E.pivot = [E.x + 0.38, floor + 0.04, 0];
}

/**
 * The flight deck of a multi-engine bomber, seen from the pilot's seat (the left one): the wide panel with the pilot's flight instruments and a bank of engine
 * gauges (a revolution counter and a temperature gauge for each engine), the co-pilot's side of it, the windscreen frames, the pedestal with a throttle lever for
 * every engine, the overhead switches, the floor and the seat; the yoke is a mesh of its own that turns and slides with the controls (its wheel turns about the column).
 */
function buildHeavyCockpit(spec) {
  const E = cockpitEye(spec), eyeP = [E.x, E.y, E.z];
  const P = (x, y, z) => [E.x + x, E.y + y, E.z + z];
  const [wallHex, panelHex, trimHex] = INTERIOR[spec.nation] || INTERIOR.USA;
  const wall = shade(rgb(wallHex), 0.62), panel = rgb(panelHex), trim = shade(rgb(trimHex), 0.7), metal = rgb('#3a3c3e');
  const b = new MeshBuilder();
  const IN = MAT.INTERIOR;
  const n = spec.engines.length;
  const hw = 0.92;                                           // half width of the flight deck
  const cz = -E.z;                                           // the axis of the aircraft, from the pilot's (left) seat: the flight deck is built round it
  // the panel: ahead of the pilot, its top leaning back; it runs from the left wall to the pedestal and beyond (the co-pilot's)
  const tilt = 0.25, uY = [-Math.sin(tilt), Math.cos(tilt), 0];
  const pz = cz, pw = hw * 0.86, ph = 0.24;                  // centre (relative to the eye: on the axis), half width, half height
  const panelC = P(0.62, -0.3, pz);
  slab(b, panelC, [0, 0, 1], uY, pw, ph, panel, IN, eyeP);
  const top = [panelC[0] + uY[0] * ph, panelC[1] + uY[1] * ph, panelC[2]];
  b.beam([top[0], top[1], panelC[2] - pw], [top[0], top[1], panelC[2] + pw], 0.03, 0.028, shade(trim, 0.7), IN);
  slab(b, [top[0] + 0.13, top[1] + 0.012, panelC[2]], [1, 0, 0], [0, 0, 1], 0.16, pw + 0.02, shade(panel, 0.9), IN, eyeP);       // the glare shield
  const dial = (type, du, dv, r) => {
    const o = [panelC[0] + uY[0] * dv - 0.006, panelC[1] + uY[1] * dv, panelC[2] + du];
    const R = [0, 0, r], U = [uY[0] * r, uY[1] * r, 0];
    face(b, [[o[0] - R[0] - U[0], o[1] - R[1] - U[1], o[2] - R[2] - U[2]], [o[0] + R[0] - U[0], o[1] + R[1] - U[1], o[2] + R[2] - U[2]], [o[0] + R[0] + U[0], o[1] + R[1] + U[1], o[2] + R[2] + U[2]], [o[0] - R[0] + U[0], o[1] - R[1] + U[1], o[2] - R[2] + U[2]]], MAT.GAUGE, type * 16, eyeP);
  };
  // the pilot's six flight instruments (in front of him: z = -pz relative to the panel centre)
  const g = 0.058, sp = g * 2.35, zp = -pz - 0.02;
  dial(GAUGE.SPEED, zp - sp, 0.1, g); dial(GAUGE.HORIZON, zp, 0.1, g * 1.12); dial(GAUGE.ALT, zp + sp, 0.1, g);
  dial(GAUGE.COMPASS, zp - sp, -0.06, g); dial(GAUGE.CLIMB, zp, -0.06, g); dial(GAUGE.CLOCK, zp + sp, -0.06, g * 0.8);
  // the engine gauges in the middle: a revolution counter above a temperature gauge for each engine
  const ge = 0.036, ps = Math.min(ge * 2.5, 0.5 / n);
  for (let i = 0; i < n; i++) { const dz = (i - (n - 1) / 2) * ps * 1.15 + 0.1; dial(GAUGE.RPM, dz, 0.1, ge); dial(GAUGE.TEMP, dz, 0.01, ge); }
  // the co-pilot's: a speed indicator, a horizon and an altimeter, smaller
  const zc = 2 * cz - pz;                                    // in front of the co-pilot (his seat is as far right of the axis as the pilot's is left)
  dial(GAUGE.SPEED, zc, 0.1, g * 0.8); dial(GAUGE.HORIZON, zc, -0.03, g * 0.85); dial(GAUGE.ALT, zc - sp * 0.8, -0.03, g * 0.7);
  for (let i = -5; i <= 5; i++) b.box(panelC[0] - 0.01 + uY[0] * -0.2, panelC[1] + uY[1] * -0.2, panelC[2] + i * 0.1, 0.012, 0.012, 0.01, i % 3 ? shade(metal, 1.2) : rgb('#7a2a1c'), IN);   // switches and lamps under the dials
  // the windscreen: pillars, the bow over the top, the centre mullion, the side window frames and the walls
  const rail = (a, c, w = 0.035) => b.beam(P(...a), P(...c), w, w, shade(trim, 0.9), IN);
  const y0 = -0.12, yTop = 0.3, xF = 0.7, xB = 0.1;
  for (const z of [-hw * 0.95, -0.15, 0.15, hw * 0.95]) rail([xF, y0, cz + z], [xB, yTop, cz + z * 0.9], 0.045);
  rail([xB, yTop, cz - hw * 0.86], [xB, yTop, cz + hw * 0.86], 0.04);
  rail([xF, y0 + 0.03, cz - hw * 0.95], [xF, y0 + 0.03, cz + hw * 0.95], 0.04);
  for (const s of [-1, 1]) {
    rail([xB, yTop, cz + s * hw * 0.86], [-0.9, yTop - 0.04, cz + s * hw * 0.95], 0.035);
    rail([xF - 0.1, y0 - 0.06, cz + s * hw], [-0.9, y0 - 0.06, cz + s * hw], 0.045);
    rail([-0.3, y0 - 0.06, cz + s * hw * 0.98], [-0.3, yTop - 0.05, cz + s * hw * 0.9], 0.03);
    slab(b, P(0.0, y0 - 0.52, cz + s * hw), [1, 0, 0], [0, 1, 0], 0.9, 0.28, wall, IN, eyeP, 0.8);
  }
  // the pedestal between the seats with a throttle and a mixture lever for each engine, and the trim wheels
  const pxz = cz;
  b.box(...P(0.25, -0.55, pxz), 0.7, 0.28, 0.2, shade(metal, 0.9), IN);
  for (let i = 0; i < n; i++) {
    const zz = pxz + (i - (n - 1) / 2) * 0.045;
    b.beam(P(0.45 - i * 0.012, -0.42, zz), P(0.4 - i * 0.012, -0.24, zz), 0.013, 0.013, shade(trim, 1.3), IN);
    b.sphere(...P(0.4 - i * 0.012, -0.23, zz), 0.019, 0.019, 0.019, i % 2 ? rgb('#2a4e8a') : rgb('#8a2a1e'), IN, { seg: 8, rings: 5 });
  }
  // the overhead panel
  slab(b, P(0.25, 0.46, pxz), [1, 0, 0], [0, 0, 1], 0.35, 0.3, shade(panel, 1.1), IN, eyeP);
  for (let i = -3; i <= 3; i++) b.box(...P(0.25 + (i % 2) * 0.1, 0.44, pxz + i * 0.07), 0.025, 0.025, 0.02, shade(metal, 1.3), IN);
  // the bulkhead behind the seats (the hull drawn from here on has no inside): dark, with the doorway to the rest of the aircraft
  // (wider and taller than the fuselage there: it is drawn only from the seat, and the inside of the skin must not show round it)
  const dz = -E.z, bx = -0.85;
  for (const [z0, z1] of [[-2, dz - 0.32], [dz + 0.32, 2.2]]) q4(b, P(bx, -1.4, z0), P(bx, -1.4, z1), P(bx, 1.4, z1), P(bx, 1.4, z0), shade(wall, 0.55), IN, eyeP, 0.7);
  q4(b, P(bx, 0.3, dz - 0.32), P(bx, 0.3, dz + 0.32), P(bx, 1.4, dz + 0.32), P(bx, 1.4, dz - 0.32), shade(wall, 0.55), IN, eyeP, 0.7);
  q4(b, P(bx, -1.4, dz - 0.32), P(bx, -1.4, dz + 0.32), P(bx, -0.76, dz + 0.32), P(bx, -0.76, dz - 0.32), shade(wall, 0.55), IN, eyeP, 0.7);
  q4(b, P(bx - 0.25, -0.76, dz - 0.32), P(bx - 0.25, -0.76, dz + 0.32), P(bx - 0.25, 0.3, dz + 0.32), P(bx - 0.25, 0.3, dz - 0.32), rgb('#0c0d0e'), IN, eyeP, 0.6);
  for (const sg of [-1, 1]) q4(b, P(bx, -0.76, dz + sg * 0.32), P(bx - 0.25, -0.76, dz + sg * 0.32), P(bx - 0.25, 0.3, dz + sg * 0.32), P(bx, 0.3, dz + sg * 0.32), shade(wall, 0.4), IN, eyeP, 0.6);
  // the walls of the flight deck from the floor to the window sills, and the ceiling over the seats
  for (const s of [-1, 1]) q4(b, P(0.75, -0.76, cz + s * hw), P(-0.85, -0.76, cz + s * hw), P(-0.85, y0 - 0.06, cz + s * hw), P(0.75, y0 - 0.06, cz + s * hw), wall, IN, eyeP, 0.85);
  q4(b, P(-0.85, yTop + 0.02, cz - hw), P(-0.85, yTop + 0.02, cz + hw), P(-0.3, yTop + 0.02, cz + hw), P(-0.3, yTop + 0.02, cz - hw), shade(wall, 0.7), IN, eyeP, 0.8);
  // the floor, the seat pan and the back of the seat, the co-pilot's seat
  slab(b, P(-0.05, -0.74, cz), [1, 0, 0], [0, 0, 1], 0.9, hw * 0.98, shade(panel, 1.1), IN, eyeP, 0.8);
  b.box(...P(-0.34, -0.56, 0), 0.46, 0.07, 0.5, shade(wall, 0.8), IN);
  b.box(...P(-0.6, -0.2, 0), 0.07, 0.7, 0.5, shade(wall, 0.85), IN);
  b.box(...P(-0.34, -0.56, 2 * cz), 0.46, 0.07, 0.5, shade(wall, 0.8), IN);
  const interior = b.build({ ao: false });

  // the yoke: built round the pivot, where the column enters the panel; the column points at the pilot (-x), the wheel is a ring in the plane across x
  const sb = new MeshBuilder();
  const L = 0.5, R = 0.17;
  sb.beam([0, 0, 0], [-L, 0.02, 0], 0.045, 0.045, shade(metal, 1.1), IN);
  const ring = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ring.push([-L, 0.04 + Math.sin(a) * R, Math.cos(a) * R * 1.25]); }
  for (let i = 0; i < 16; i++) sb.beam(ring[i], ring[(i + 1) % 16], 0.028, 0.028, rgb('#1b1b1c'), IN);
  sb.beam([-L, 0.04, 0], [-L, 0.04 + R, R * 0.2], 0.03, 0.03, shade(metal, 1.0), IN);
  for (const s of [-1, 1]) sb.beam([-L, 0.04, 0], [-L, 0.04 - R * 0.2, s * R * 1.2], 0.03, 0.03, shade(metal, 1.0), IN);
  sb.sphere(-L, 0.04, 0, 0.04, 0.04, 0.04, shade(metal, 1.1), IN, { seg: 8, rings: 5 });
  const stick = sb.build({ ao: false });

  // the blur of one propeller, with its hub at the origin: the aircraft draws it at the place of each engine
  const db = new MeshBuilder();
  const r = spec.prop.r, nn = 40, c = [0, 0, 0];
  const ctr = db.vert(c[0], c[1], c[2], 1, 0, 0, [128, 128, spec.prop.n * 16], MAT.DISC, 1);
  const rg = [];
  for (let i = 0; i <= nn; i++) { const a = i / nn * Math.PI * 2; rg.push(db.vert(c[0], Math.cos(a) * r, Math.sin(a) * r, 1, 0, 0, [Math.round(128 + 127 * Math.sin(a)), Math.round(128 + 127 * Math.cos(a)), spec.prop.n * 16], MAT.DISC, 1)); }
  for (let i = 0; i < nn; i++) db.tri(ctr, rg[i], rg[i + 1]);
  const disc = db.build({ ao: false });
  return { interior, stick, disc, discMounts: propMounts(spec), eye: E, pivot: P(0.78, -0.4, 0) };
}

const cache = new Map();
export function getCockpit(typeKey, spec) {
  let c = cache.get(typeKey);
  if (!c) { c = buildCockpit(spec); cache.set(typeKey, c); }
  return c;
}
