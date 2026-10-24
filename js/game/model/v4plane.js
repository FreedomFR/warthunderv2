// An aircraft drawn from the pieces of its reference model (aircraft/<key>_v4.js, tools/refs/planegroups.py): the body (fuselage, cowl, fixed undercarriage), the tail, the two wings, the
// propeller, the retractable undercarriage and the panes of the canopy, in the frame of the game's aircraft, with the colour of the textures at each vertex (the camouflage, the markings and
// the panel lines are the model's own). The groups are the ones of planes.js `drawPlane`: whole / body / tail / wingL / wingR / prop / gear / cabin; the hook and the ordnance stay procedural.
import { MAT, rgb, shade } from './meshbuilder.js';
import { decodeBaked } from './bakedmesh.js';
import { airPaintId } from './airpaint.js';
import { drawHeavy } from './heavy.js';

const GLASS = rgb('#3d5560');

let crease = null;      // (the crease angle of the skin pieces being drawn: a clustered mesh needs its normals smoothed over a wider angle)
function add(b, v4, key, mat = MAT.AIRCRAFT, col = null) {
  const piece = v4.PLANE[key];
  if (!piece) return;
  const d = decodeBaked(piece, v4.SCALE, mat === MAT.AIRPAINT ? (crease ?? 40) : 40);
  if (col) { const c = new Uint8Array(d.col.length); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; } b.raw(d.pos, d.nrm, c, d.idx, mat); return; }
  b.raw(d.pos, d.nrm, d.col, d.idx, mat);
}

/**
 * A canopy of clear glass drawn from the envelope measured on the model (`canopy: { yb, prof: [[x, top, half width], ...], frames: [x, ...] }` of the sheet): a rounded tunnel whose section follows
 * the profile, the panes (clear: material PANE) and the frames painted like the skin. Used when the model's own canopy cannot be told from its interior.
 */
function drawCanopyLoft(b, c, paintId) {
  const N = 20, P = c.prof, yb = c.yb, ex = c.exp ?? 0.8;
  const at = (x) => {      // (top, half width) at x, by linear interpolation of the stations
    if (x <= P[0][0]) return [P[0][1], P[0][2]];
    for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const t = (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return [P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t, P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t]; }
    return [P[P.length - 1][1], P[P.length - 1][2]];
  };
  const pt = (x, k, out = 0) => {      // the point of the section at x, angle k of N (0 = starboard sill, N / 2 = the top, N = port sill), and its normal
    const [top, w] = at(x), h = Math.max(top - yb, 0.01), a = Math.PI * k / N, cs = Math.cos(a), sn = Math.sin(a);
    const z = w * Math.sign(cs) * Math.pow(Math.abs(cs), ex), y = yb + h * Math.pow(Math.max(sn, 0), ex);
    let ny = (y - yb) / (h * h), nz = z / (w * w + 1e-6); const l = Math.hypot(ny, nz) || 1; ny /= l; nz /= l;
    return { p: [x, y + ny * out, z + nz * out], n: [0, ny, nz] };
  };
  const xs = []; for (let x = P[0][0]; x < P[P.length - 1][0] - 1e-6; x += 0.08) xs.push(x); xs.push(P[P.length - 1][0]);
  const glass = [0, 0, 0], ring = (x, out, col, mat) => { const r = []; for (let k = 0; k <= N; k++) { const q = pt(x, k, out); r.push(b.vert(q.p[0], q.p[1], q.p[2], 0, q.n[1], q.n[2], col, mat)); } return r; };
  let prev = ring(xs[0], 0, glass, MAT.PANE);
  for (let i = 1; i < xs.length; i++) {
    const cur = ring(xs[i], 0, glass, MAT.PANE);
    for (let k = 0; k < N; k++) { b.tri(prev[k], cur[k], cur[k + 1]); b.tri(prev[k], cur[k + 1], prev[k + 1]); }
    prev = cur;
  }
  const fc = [paintId, 0, 0], fm = paintId >= 0 ? MAT.AIRPAINT : MAT.AIRCRAFT, fcol = paintId >= 0 ? fc : rgb('#4b5a3b');
  const band = (xa, xb, ka, kb, out) => {      // a strip of frame: from x xa to xb, angles ka to kb
    const A = pt(xa, ka, out), B = pt(xb, ka, out), C = pt(xb, kb, out), D = pt(xa, kb, out), ref = [(xa + xb) / 2, yb + 0.05, 0];
    b.quad(A.p, B.p, C.p, D.p, fcol, fm, ref, 1);
  };
  for (const fx of c.frames) for (let k = 0; k < N; k++) band(fx - 0.022, fx + 0.022, k, k + 1, 0.012);
  const rails = c.rails ?? [0, N / 4, N / 2, 3 * N / 4, N];
  for (const rk of rails) for (let i = 1; i < xs.length; i++) band(xs[i - 1], xs[i], Math.max(rk - 0.35, 0), Math.min(rk + 0.35, N), 0.012);
}

/** The team band on the fin (tinted with the team colour by the renderer): two quads on the sides of the fin, as the procedural aircraft have them. */
function finBand(b, s) {
  const t = s.tail, fy = s.fus.r * s.fus.ar * 0.15, tx = t.x, acc = rgb('#e8e6dc'), zz = s.finHalf ?? 0.075;
  b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, zz], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, zz], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, zz], [tx - t.finChord * 0.2, fy + t.fin * 0.82, zz], acc, MAT.TEAMBAND, [tx, fy, -1], 1);
  b.quad([tx - t.finChord * 0.05, fy + t.fin * 0.5, -zz], [tx - t.finChord * 0.2, fy + t.fin * 0.82, -zz], [tx - t.finChord * 0.2 - 0.33, fy + t.fin * 0.82, -zz], [tx - t.finChord * 0.05 - 0.35, fy + t.fin * 0.5, -zz], acc, MAT.TEAMBAND, [tx, fy, 1], 1);
}

/** Draw `part` of the aircraft `s` (its sheet has `v4`: the module of the pieces) into the builder. The parts that stay procedural ('hook', 'ordnance') are not drawn here. */
export function drawV4Plane(b, s, part) {
  crease = s.crease ?? null;
  const v4 = s.v4, all = part === 'whole';
  // (an aircraft with a paint scheme is painted by the shader from the scheme table: the skin pieces carry its number, the model's own colours are not used)
  const id = s.paint ? airPaintId(s.paint) : -1;
  const skin = (key) => (id >= 0 ? add(b, v4, key, MAT.AIRPAINT, [id, 0, 0]) : add(b, v4, key));
  if (all || part === 'body') { skin('body'); add(b, v4, 'tyres', MAT.AIRCRAFT); if (s.canopyLoft) drawCanopyLoft(b, s.canopyLoft, id); else { skin('canopy'); add(b, v4, 'glass', MAT.PANE, GLASS); } }
  if (part === 'cabin') { skin('body'); add(b, v4, 'tyres', MAT.AIRCRAFT); }          // (from the pilot's seat: the panes of his canopy are not drawn)
  if (all || part === 'tail' || part === 'cabin' && false) { skin('tail'); finBand(b, s); }
  if (all || part === 'wingR') skin('wingR');
  if (all || part === 'wingL') skin('wingL');
  if (part === 'prop' || all && s.role === 'float') add(b, v4, 'prop', MAT.AIRCRAFT);      // (a catapult aircraft is drawn at rest, whole, with the propeller of its model in place)
  if (part === 'gear') add(b, v4, 'gear');
}

/**
 * A multi-engine aircraft drawn from the pieces of its model (the groups of heavy.js drawHeavy): body (with the panes of the flight deck), tail, wingL / wingR (with their nacelles
 * and engines), hull (the body behind the pilot's seat), prop (ONE propeller whose hub is at the origin), gear, bay (the doors, open), ordnance (the load of the bay), burnN (the
 * charred nacelle drawn over a burning engine). The closed doors of the bay and the team band on the fin stay procedural: the model has the bay open.
 */
/** The sheet as the procedural drawing of heavy.js reads it (its paint is a table of colours, not the name of a scheme). */
const proc = (s) => ({ ...s, paint: s.paintRGB || { top: '#b9bdbf', bot: '#a9aba0', acc: '#e8e6dc' } });

export function drawV4Heavy(b, s, part) {
  crease = s.crease ?? null;
  const v4 = s.v4, all = part === 'whole', X = (d) => s.cg - d;
  const pid = s.paint ? airPaintId(s.paint) : -1, skin = (key) => (pid >= 0 ? add(b, v4, key, MAT.AIRPAINT, [pid, 0, 0]) : add(b, v4, key));
  const closedBay = () => {
    const o = s.bay, ry = Math.max(...s.body.map((q) => q[1])), r = ry * 0.97, hw = o.hw, th = Math.asin(Math.min(0.95, hw / r)), col = shade(rgb('#aeb0b2'), 0.8);
    for (const [d0, d1] of o.doors) {
      const x0 = X(d0), x1 = X(d1);
      for (let k = 0; k < 6; k++) {
        const a0 = -th + 2 * th * k / 6, a1 = -th + 2 * th * (k + 1) / 6;
        b.quad([x1, -r * Math.cos(a0) + 0.01, r * Math.sin(a0)], [x0, -r * Math.cos(a0) + 0.01, r * Math.sin(a0)], [x0, -r * Math.cos(a1) + 0.01, r * Math.sin(a1)], [x1, -r * Math.cos(a1) + 0.01, r * Math.sin(a1)], col, MAT.AIRCRAFT, [(x0 + x1) / 2, -r * 2, 0], 1);
      }
    }
  };
  if (all || part === 'body') { skin('body'); add(b, v4, 'guns'); add(b, v4, 'glass', MAT.PANE, GLASS); if (s.bay && !s.bay.modelDoors) closedBay(); }
  if (part === 'hull') skin('hull');
  if (all || part === 'tail') {
    skin('tail');
    // the team band on both faces of the fin, laid on its skin (it narrows towards the top: the corners follow it)
    for (const q of s.tail.band || []) for (const sd of [1, -1]) b.quad([q[0], q[1], sd * q[2]], [q[3], q[1], sd * q[2]], [q[4], q[5], sd * q[6]], [q[7], q[5], sd * q[6]], rgb('#e8e6dc'), MAT.TEAMBAND, [q[0], q[1], sd * (q[2] + 1)], 1);
  }
  if (all || part === 'wingR') skin('wingR');
  if (all || part === 'wingL') skin('wingL');
  if (part === 'prop') add(b, v4, 'prop', MAT.AIRCRAFT);
  // (a model that has its undercarriage up, its bay shut or no load in it leaves these to the sheet: the game's own wheels, doors and bombs)
  if (part === 'gear') { if (v4.PLANE.gear) add(b, v4, 'gear'); else drawHeavy(b, proc(s), 'gear'); }
  if (part === 'bay') { if (v4.PLANE.bay) add(b, v4, 'bay'); else drawHeavy(b, proc(s), 'bay'); }
  const em = /^eng(\d)$/.exec(part);
  if (em) add(b, v4, 'burn' + em[1]);          // (the engine as a piece of its own: the nacelle of its burning twin)
  if (part === 'ordnance') { if (v4.PLANE.ordnance) add(b, v4, 'ordnance'); else drawHeavy(b, proc(s), 'ordnance'); }
  const bm = /^burn(\d)$/.exec(part);
  if (bm && s.engines[+bm[1]]) {
    const e = s.engines[+bm[1]], piece = v4.PLANE[part];
    if (piece) {
      add(b, v4, part, MAT.AIRCRAFT, [29, 27, 25]);      // (the renderer draws it a little larger than the nacelle)
    }
    // the glowing patches in the black of the cowling and along the nacelle
    const x0 = X(e.d), xe = X(e.aft ?? e.d + e.len + 2.6), hot = rgb('#ff6a12');
    for (let k = 0; k < 9; k++) {
      const a = (k * 2.399) % (Math.PI * 2), u = 0.15 + ((k * 0.37) % 0.8), x = x0 - 0.3 + (xe - (x0 - 0.3)) * u * 0.7, rr = e.r * (0.98 - 0.25 * u);
      b.box(x, e.y + Math.sin(a) * rr, e.z + Math.cos(a) * rr, 0.42, 0.1, 0.1, hot, MAT.EMISSIVE);
    }
  }
}
