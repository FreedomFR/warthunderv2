// The cockpit seen from the pilot's seat: the instrument panel with working dials (airspeed, artificial horizon, altimeter, compass, climb, revolutions, clock and
// engine gauges: the shader draws them from the flight state, see MAT.GAUGE), the coaming and the glare shield, the windscreen and the canopy rails, the side walls,
// the control stick (it moves with the controls), the throttle quadrant, a reflector sight, and the blur of the propeller disc. Built in the frame of the aircraft
// (x forward, y up, z to starboard), round the eye of the pilot, so it is drawn with the matrix of the aircraft.
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';

/** Where the pilot's eye is in the aircraft's frame, and whether the cockpit is open (a biplane's, a Swordfish's). */
export function cockpitEye(spec) {
  const cn = spec.canopy[0], ry0 = spec.fus.r * spec.fus.ar;
  let ey = ry0 * 0.78 + cn.h * 1.05;
  if (spec.kind === 'bi') ey = Math.max(ey, spec.wing.gap * 0.55 + spec.wing.t + 0.35);
  return { x: cn.x0 + 0.2, y: ey, z: 0, open: !!cn.open, bi: spec.kind === 'bi' };
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
  const E = cockpitEye(spec);
  const eyeP = [E.x, E.y, E.z];
  const P = (x, y, z) => [E.x + x, E.y + y, E.z + z];
  const [wallHex, panelHex, trimHex] = INTERIOR[spec.nation] || INTERIOR.USA;
  const wall = shade(rgb(wallHex), 0.62), panel = rgb(panelHex), trim = shade(rgb(trimHex), 0.7), metal = rgb('#3a3c3e');
  const hw = Math.max(0.3, Math.min(0.42, spec.fus.r * 0.8));
  const b = new MeshBuilder();
  const IN = MAT.INTERIOR;

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
  return { interior, stick, disc, eye: E, pivot: P(0.1, -0.62, 0) };
}

const cache = new Map();
export function getCockpit(typeKey, spec) {
  let c = cache.get(typeKey);
  if (!c) { c = buildCockpit(spec); cache.set(typeKey, c); }
  return c;
}
