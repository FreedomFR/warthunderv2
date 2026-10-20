// The multi-engine land-based bombers (B-17, G4M, Lancaster, He 111, SM.79, LeO 451): the generator for aircraft with `spec.engines`.
// planes.js hands every part of such an aircraft to drawHeavy(); the data is in bomberdata.js. Same model space and the same part groups as the
// single-engine generator (see planes.js), plus
//   engN    the engine nacelle number N (a piece that can come off or burn)       bay     the bomb doors, open
//   prop    ONE propeller whose hub is at the origin (propMounts() says where each engine's propeller goes)
// All distances in a spec sheet are `d`: metres from the tip of the nose, along the fuselage (the origin of the model is `cg` behind it).
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';
import { panel, insignia, disc, drawBomb, PAINT, GROUND_PITCH } from './planes.js';

const PI = Math.PI, D2R = PI / 180;
const sgnpow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
const lerp = (a, b, t) => a + (b - a) * t;

/** The fuselage of a spec as functions of x: { X(d), at(x) -> { ry, rz, yc, e }, range(xa, xb) -> stations, noseX, tailX }. */
export function frameOf(s) {
  const cg = s.cg, X = (d) => cg - d;
  const st = s.body.map(([d, ry, rz, yc = 0, e = 2]) => ({ x: X(d), ry, rz, yc, e })).sort((a, b) => b.x - a.x);
  const at = (x) => {
    if (x >= st[0].x) return { ...st[0], x };
    for (let i = 0; i + 1 < st.length; i++) {
      if (x <= st[i].x && x >= st[i + 1].x) {
        const t = (st[i].x - x) / ((st[i].x - st[i + 1].x) || 1);
        return { x, ry: lerp(st[i].ry, st[i + 1].ry, t), rz: lerp(st[i].rz, st[i + 1].rz, t), yc: lerp(st[i].yc, st[i + 1].yc, t), e: lerp(st[i].e, st[i + 1].e, t) };
      }
    }
    return { ...st[st.length - 1], x };
  };
  const range = (xa, xb) => {
    const out = [at(xa)];
    for (const q of st) if (q.x < xa - 1e-6 && q.x > xb + 1e-6) out.push(q);
    out.push(at(xb));
    return out;
  };
  return { X, at, range, noseX: cg, tailX: cg - s.L };
}

/** A point on the skin of the fuselage at x, angle th (degrees; 0 starboard, 90 up, 180 port, 270 down), `lift` metres out. */
function surf(F, x, th, lift = 0) {
  const q = F.at(x), a = th * D2R, p = 2 / q.e;
  return [x, q.yc + (q.ry + lift) * sgnpow(Math.sin(a), p), (q.rz + lift) * sgnpow(Math.cos(a), p)];
}

/** Lofted body along x with superelliptic sections (exponent e = 2 an ellipse, more a squarer section). */
function loftH(b, st, col, mat, o = {}) {
  const n = o.seg || 16, rings = [];
  for (let i = 0; i < st.length; i++) {
    const s = st[i], prev = st[Math.max(0, i - 1)], next = st[Math.min(st.length - 1, i + 1)];
    const dx = next.x - prev.x || 1e-3;
    const slope = ((next.ry + next.rz) - (prev.ry + prev.rz)) * 0.5 / dx;
    const e = s.e || 2, p = 2 / e, ring = [];
    for (let k = 0; k < n; k++) {
      const th = (k / n) * PI * 2, sn = Math.sin(th), cs = Math.cos(th);
      const ry = Math.max(s.ry, 1e-3), rz = Math.max(s.rz, 1e-3);
      let ny = sgnpow(sn, 2 - p) / ry, nz = sgnpow(cs, 2 - p) / rz;
      const l = Math.hypot(ny, nz) || 1; ny /= l; nz /= l;
      const c = typeof col === 'function' ? col(sn) : col;
      ring.push(b.vert(s.x, (s.yc || 0) + ry * sgnpow(sn, p), (s.zc || 0) + rz * sgnpow(cs, p), -slope, ny, nz, c, mat, o.ao));
    }
    rings.push(ring);
  }
  const flip = st[0].x > st[st.length - 1].x;
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    if (flip) b.quadIdx(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
    else b.quadIdx(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]);
  }
}

/** A grid of panes laid on the skin of the fuselage between d0..d1 and the angles a0..a1; the gaps between the panes are the frames. */
function panes(b, F, o, col, mat = MAT.GLASS) {
  const gap = o.gap ?? 0.16, lift = o.lift ?? 0.025, nu = o.nu || 2, nv = o.nv || 2;
  const one = (a0, a1) => {
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const xa = F.X(o.d0 + (o.d1 - o.d0) * (i + gap / 2) / nu), xb = F.X(o.d0 + (o.d1 - o.d0) * (i + 1 - gap / 2) / nu);
      const ta = a0 + (a1 - a0) * (j + gap / 2) / nv, tb = a0 + (a1 - a0) * (j + 1 - gap / 2) / nv;
      const q = F.at((xa + xb) / 2);
      b.quad(surf(F, xa, ta, lift), surf(F, xb, ta, lift), surf(F, xb, tb, lift), surf(F, xa, tb, lift), col, mat, [(xa + xb) / 2, q.yc, 0], 1);
    }
  };
  one(o.a0, o.a1);
  if (o.sym) one(180 - o.a1, 180 - o.a0);
}

// ---- national markings that follow the curve of the fuselage ---------------------------------------------------
/** z of the skin of the fuselage at height y (on the side `side`), `lift` metres out. */
function sideZ(F, x, y, side, lift) {
  const q = F.at(x), u = Math.min(0.96, Math.abs(y - q.yc) / q.ry);
  return side * (q.rz * Math.pow(1 - Math.pow(u, q.e), 1 / q.e) + lift);
}

function sideRing(b, F, x, y, r0, r1, side, col, lift) {
  const n = 20, q = F.at(x);
  for (let k = 0; k < n; k++) {
    const a0 = k / n * PI * 2, a1 = (k + 1) / n * PI * 2, P = (r, a) => { const xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r; return [xx, yy, sideZ(F, xx, yy, side, lift)]; };
    b.quad(P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1), col, MAT.AIRCRAFT, [x, q.yc, 0], 1);
  }
}

function sideRect(b, F, x0, x1, y0, y1, side, col, lift) {
  const q = F.at((x0 + x1) / 2), P = (xx, yy) => [xx, yy, sideZ(F, xx, yy, side, lift)];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const xa = lerp(x0, x1, i / 2), xb = lerp(x0, x1, (i + 1) / 2), ya = lerp(y0, y1, j / 2), yb = lerp(y0, y1, (j + 1) / 2);
    b.quad(P(xa, ya), P(xb, ya), P(xb, yb), P(xa, yb), col, MAT.AIRCRAFT, [(x0 + x1) / 2, q.yc, 0], 1);
  }
}

/** The national marking on a side of the fuselage, centred at (x, y), `r` its radius. */
function marking(b, F, nation, x, y, r, side) {
  const w = rgb('#f0eee6'), blue = rgb('#1f3a78'), red = rgb('#c7192a');
  switch (nation) {
    case 'USA':
      sideRing(b, F, x, y, 0, r, side, blue, 0.012); sideRing(b, F, x, y, 0, r * 0.62, side, w, 0.02);
      for (const dx of [-1, 1]) { sideRect(b, F, x + dx * r * 1.0 - r * 0.45, x + dx * r * 1.0 + r * 0.45, y - r * 0.28, y + r * 0.28, side, blue, 0.012); sideRect(b, F, x + dx * r * 1.05 - r * 0.4, x + dx * r * 1.05 + r * 0.4, y - r * 0.2, y + r * 0.2, side, w, 0.02); }
      break;
    case 'Japan': sideRing(b, F, x, y, 0, r * 0.9, side, red, 0.012); break;
    case 'UK':
      sideRing(b, F, x, y, 0, r, side, blue, 0.012); sideRing(b, F, x, y, 0, r * 0.66, side, w, 0.02); sideRing(b, F, x, y, 0, r * 0.33, side, red, 0.028);
      break;
    case 'France':
      sideRing(b, F, x, y, 0, r, side, red, 0.012); sideRing(b, F, x, y, 0, r * 0.66, side, w, 0.02); sideRing(b, F, x, y, 0, r * 0.33, side, blue, 0.028);
      break;
    case 'Germany': {
      const k = rgb('#111111');
      sideRect(b, F, x - r * 1.15, x + r * 1.15, y - r * 0.38, y + r * 0.38, side, w, 0.012); sideRect(b, F, x - r * 0.38, x + r * 0.38, y - r * 1.15, y + r * 1.15, side, w, 0.012);
      sideRect(b, F, x - r * 1.05, x + r * 1.05, y - r * 0.28, y + r * 0.28, side, k, 0.02); sideRect(b, F, x - r * 0.28, x + r * 0.28, y - r * 1.05, y + r * 1.05, side, k, 0.02);
      break;
    }
    case 'Italy':
      sideRing(b, F, x, y, 0, r * 0.9, side, w, 0.012); sideRect(b, F, x - r * 0.18, x + r * 0.18, y - r * 0.62, y + r * 0.62, side, rgb('#3a2418'), 0.02);
      break;
    default: break;
  }
}

// ---- guns and turrets ----------------------------------------------------------------------------------------
function barrels(b, x0, y, z, n, len, gap, dark, r = 0.032) {
  for (let k = 0; k < n; k++) {
    const zz = z + (k - (n - 1) / 2) * gap;
    b.rod(x0, x0 + len, y, zz, r, r * 0.8, dark, MAT.DARK, { seg: 6 });
  }
}

function drawGuns(b, s, F, wantTail, col) {
  const { dark, glass, skin } = col;
  const cut = s.cutD ?? 1e9;
  for (const g of s.guns || []) {
    const isTail = (g.d ?? g.d0) > cut;
    if (isTail !== wantTail) continue;
    const x = F.X(g.d ?? g.d0), q = F.at(x);
    switch (g.t) {
      case 'dome': {            // a dorsal turret: ring, glazed dome and the guns
        const yb = q.yc + q.ry * 0.97;
        b.cylinder(x, yb - 0.05, 0, g.r * 1.08, g.r * 1.0, yb + 0.1, shade(skin, 0.85), MAT.AIRCRAFT, { seg: 14 });
        b.sphere(x, yb + 0.1, 0, g.r, g.r * 0.95, g.r, glass, MAT.CANOPY, { seg: 14, rings: 8 });
        b.beam([x - g.r * 0.95, yb + 0.1, 0], [x, yb + 0.1 + g.r * 0.95, 0], 0.035, 0.035, shade(skin, 0.7), MAT.CANOPY, { caps: false });
        b.beam([x + g.r * 0.95, yb + 0.1, 0], [x, yb + 0.1 + g.r * 0.95, 0], 0.035, 0.035, shade(skin, 0.7), MAT.CANOPY, { caps: false });
        barrels(b, x + g.r * 0.5, yb + g.r * 0.45, 0, g.n || 2, g.len || 1.2, 0.2, dark);
        break;
      }
      case 'ball': {            // the ball turret hung under the belly
        const yb = q.yc - q.ry * 0.9;
        b.sphere(x, yb - g.r * 0.35, 0, g.r, g.r, g.r, shade(skin, 0.85), MAT.AIRCRAFT, { seg: 14, rings: 9 });
        b.sphere(x + g.r * 0.45, yb - g.r * 0.6, 0, g.r * 0.4, g.r * 0.34, g.r * 0.5, glass, MAT.GLASS, { seg: 8, rings: 5 });
        barrels(b, x + g.r * 0.5, yb - g.r * 0.5, 0, g.n || 2, g.len || 1.1, 0.2, dark);
        break;
      }
      case 'chin': {            // a chin turret under the nose
        const yb = q.yc - q.ry * 0.95;
        b.sphere(x, yb - g.r * 0.25, 0, g.r * 1.15, g.r * 0.85, g.r, shade(skin, 0.8), MAT.AIRCRAFT, { seg: 12, rings: 7 });
        b.sphere(x + g.r * 0.6, yb - g.r * 0.2, 0, g.r * 0.5, g.r * 0.45, g.r * 0.7, glass, MAT.GLASS, { seg: 8, rings: 5 });
        barrels(b, x + g.r * 0.9, yb - g.r * 0.25, 0, 2, g.len || 0.9, 0.18, dark);
        break;
      }
      case 'nose': {            // a small ball mount in the glazing of the nose
        const zz = (g.z || 0), yy = g.y ?? 0;
        b.sphere(x, yy, zz, 0.14, 0.14, 0.14, shade(skin, 0.6), MAT.DARK, { seg: 8, rings: 5 });
        barrels(b, x, yy, zz, g.n || 1, g.len || 0.8, 0.12, dark);
        break;
      }
      case 'fturret': {         // a turret at the tip of the nose (a Lancaster's): a glazed dome that looks forward
        b.sphere(x, g.y ?? 0, 0, g.r * 1.1, g.r, g.r, glass, MAT.CANOPY, { seg: 12, rings: 7 });
        b.sphere(x, g.y ?? 0, 0, g.r * 1.12, g.r * 0.1, g.r * 1.02, shade(skin, 0.7), MAT.AIRCRAFT, { seg: 12, rings: 4 });
        barrels(b, x - g.r * 0.1, g.y ?? 0, 0, 2, g.len || 0.9, 0.2, dark, 0.026);
        break;
      }
      case 'tail': {            // the gunner's position at the tip of the tail, the guns pointing aft
        const y = q.yc;
        b.sphere(x + g.r * 0.5, y, 0, g.r * 1.7, g.r, g.r * 0.95, glass, MAT.GLASS, { seg: 12, rings: 7 });
        b.sphere(x + g.r * 0.5, y, 0, g.r * 1.72, g.r * 0.08, g.r * 0.97, shade(skin, 0.7), MAT.AIRCRAFT, { seg: 12, rings: 4 });
        for (let k = 0; k < (g.n || 2); k++) {
          const zz = (k - ((g.n || 2) - 1) / 2) * 0.17;
          b.rod(x - g.r * 1.2 - (g.len || 0.9), x - g.r * 1.2, y + (k % 2 ? 0.05 : -0.05), zz, 0.028, 0.034, dark, MAT.DARK, { seg: 6 });
        }
        break;
      }
      case 'beam': {            // a gun at a window of the side
        const side = g.side || 1, zz = side * (q.rz + 0.02);
        b.box(x, g.y ?? 0.1, zz, g.w || 0.7, g.h || 0.55, 0.05, glass, MAT.GLASS);
        b.beam([x + 0.2, g.y ?? 0.1, zz + side * 0.05], [x + 0.2 + (g.len || 0.5), (g.y ?? 0.1) + 0.02, zz + side * (g.out || 0.45)], 0.05, 0.05, dark, MAT.DARK);
        break;
      }
      case 'blister': {         // a glazed blister on the side of the fuselage
        const side = g.side || 1;
        b.sphere(x, g.y ?? 0.2, side * q.rz * 0.92, g.r * 0.85, g.r, g.r * 0.8, glass, MAT.CANOPY, { seg: 10, rings: 6 });
        break;
      }
      case 'gondola': {         // a ventral gondola (He 111's Bola, SM.79's, LeO 451's retractable tub)
        const x0 = F.X(g.d0), x1 = F.X(g.d1), yb = q.yc - q.ry;
        const st = [{ x: x0, ry: 0.06, rz: 0.06 }, { x: lerp(x0, x1, 0.12), ry: g.ry * 0.7, rz: g.rz * 0.7 }, { x: lerp(x0, x1, 0.5), ry: g.ry, rz: g.rz }, { x: lerp(x0, x1, 0.88), ry: g.ry * 0.6, rz: g.rz * 0.8 }, { x: x1, ry: 0.06, rz: 0.06 }];
        for (const t of st) t.yc = yb + g.ry * (g.lift ?? 0.15);
        loftH(b, st, (sn) => (sn < 0 ? shade(skin, 0.8) : skin), MAT.AIRCRAFT, { seg: 12 });
        b.box(lerp(x0, x1, 0.3), yb - g.ry * 0.5, 0, (x0 - x1) * 0.28, g.ry * 0.5, g.rz * 1.2, glass, MAT.GLASS);
        b.beam([lerp(x0, x1, 0.15), yb - g.ry * 0.5, 0], [lerp(x0, x1, 0.15) + 0.9, yb - g.ry * 0.65, 0], 0.05, 0.05, dark, MAT.DARK);
        break;
      }
      default: break;
    }
  }
}

// ---- engines -----------------------------------------------------------------------------------------------
/** The nacelle of engine `e`: the cowling, the body that runs back to d = aft. */
function nacelle(b, s, F, e, skin, dark, charred = false) {
  const x0 = F.X(e.d), r = e.r, xe = F.X(e.aft ?? e.d + e.len + 2.6), xc = x0 - e.len;
  const y = e.y, z = e.z;
  const st = [];
  const add = (x, ry, rz, yc = y) => st.push({ x, ry, rz, yc, zc: z });
  if (e.type === 'radial') {
    add(x0 - 0.02, r * 0.2, r * 0.2); add(x0 - 0.12, r * 0.6, r * 0.6); add(x0 - 0.3, r, r);
    add(xc + 0.3, r * 0.99, r * 0.99); add(xc, r * 0.93, r * 0.93);
  } else {
    add(x0 - 0.02, r * 0.2, r * 0.2); add(x0 - 0.15, r * 0.7, r * 0.7); add(x0 - 0.45, r * 0.94, r * 0.96);
    add(xc + 0.2, r * 1.0, r * 0.98); add(xc, r * 0.96, r * 0.94);
  }
  add(lerp(xc, xe, 0.18), r * 0.9 * (e.ar || 1), r * 0.86, y - r * 0.04);
  add(lerp(xc, xe, 0.5), r * 0.76 * (e.ar || 1), r * 0.7, y - r * 0.08);
  add(lerp(xc, xe, 0.82), r * 0.4 * (e.ar || 1), r * 0.34, y - r * 0.12);
  add(xe, 0.07, 0.07, y - r * 0.15);
  loftH(b, st, (sn) => (sn < -0.35 ? shade(skin, 0.85) : skin), MAT.AIRCRAFT, { seg: 14 });
  if (charred) {          // a burning engine: the glowing patches in the black of the cowling and along the nacelle
    const hot = rgb('#ff6a12');
    for (let k = 0; k < 9; k++) {
      const a = (k * 2.399) % (PI * 2), u = 0.15 + ((k * 0.37) % 0.8), x = lerp(x0 - 0.3, xe, u * 0.7), rr = r * (0.98 - 0.25 * u);
      b.box(x, y + Math.sin(a) * rr, z + Math.cos(a) * rr, 0.42, 0.1, 0.1, hot, MAT.EMISSIVE);
    }
  }
  // the dark mouth of the cowling, the cowl flaps and the exhausts
  if (e.type === 'radial') {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = k / n * PI * 2;
      b.box(xc + 0.08, y + Math.sin(a) * r * 0.95, z + Math.cos(a) * r * 0.95, 0.3, 0.09, 0.09, shade(skin, 0.6), MAT.DARK);
    }
    b.rod(x0 - 0.3, x0 - 0.1, y, z, r * 0.96, r * 0.6, shade(dark, 0.9), MAT.DARK, { seg: 16 });       // the dark face of the engine in the mouth of the cowling
  } else {
    for (let k = -3; k <= 3; k++) b.box(xc + 0.5 + Math.abs(k) * 0.1, y + r * 0.62, z + k * 0.11, 0.16, 0.08, 0.06, dark, MAT.DARK);
    if (e.chin) {            // the radiator under the cowling
      b.box(lerp(x0, xc, 0.55), y - r * 1.0, z, Math.abs(xc - x0) * 0.7, r * 0.5, r * 1.1, shade(skin, 0.75), MAT.DARK);
      b.box(lerp(x0, xc, 0.2), y - r * 1.02, z, 0.18, r * 0.36, r * 0.9, rgb('#1d1f21'), MAT.DARK);
    }
  }
}

/** The hinge line of the bomb doors: [x, y] of the middle of the bay at the belly (the open doors are scaled about it as they swing). */
export function bayPivot(s) {
  const F = frameOf(s), xm = F.X((s.bay.d0 + s.bay.d1) / 2), q = F.at(xm);
  return [xm, q.yc - q.ry * 0.9];
}

/** Where the propeller of each engine is in the aircraft frame: [{ x, y, z, dir }] (the 'prop' mesh has its hub at the origin). */
export function propMounts(s) {
  const X = (d) => s.cg - d;
  return s.engines.map((e) => ({ x: X(e.d) + 0.02, y: e.y, z: e.z, dir: e.dir || 1 }));
}

function propeller(b, s, dark, top) {
  const r = s.prop.r, n = s.prop.n, e = s.engines[0];
  b.sphere(0.02, 0, 0, Math.max(0.2, e.r * 0.34), Math.max(0.2, e.r * 0.3), Math.max(0.2, e.r * 0.3), shade(top, 0.8), MAT.DARK, { seg: 10, rings: 6 });
  for (let k = 0; k < n; k++) {
    b.push().translate(0, 0, 0).rotateX(k / n * PI * 2);
    b.block({ x0: -0.07, x1: 0.09, hw: 0.13, zc: 0, y0: 0.2, y1: r, tx0: -0.04, tx1: 0.05, thw: 0.08 }, dark, MAT.DARK);
    b.block({ x0: -0.05, x1: 0.07, hw: 0.09, y0: r * 0.86, y1: r, tx0: -0.03, tx1: 0.04, thw: 0.06 }, rgb('#e4c13c'), MAT.DARK, { top: true });
    b.pop();
  }
}

// ---- wings and tail ----------------------------------------------------------------------------------------
/** The planform of a wing as panels: spec.wing.plan = [[u (fraction of the half span), leading edge d, trailing edge d], ...]. Returns the height of the mid-surface at u. */
function wingY(s, u) { return s.wing.y + s.wing.dih * u; }

function wingH(b, s, F, sg, top, bot, dark) {
  const w = s.wing, hs = s.span / 2, plan = w.plan;
  for (let i = 0; i + 1 < plan.length; i++) {
    const [u0, le0, te0] = plan[i], [u1, le1, te1] = plan[i + 1];
    const c0 = te0 - le0, c1 = te1 - le1;
    const th0 = c0 * (w.tc ?? 0.16) * (1 - 0.3 * u0), th1 = c1 * (w.tc ?? 0.16) * (1 - 0.3 * u1);
    panel(b, [F.X(le0), wingY(s, u0), sg * u0 * hs], [F.X(le1), wingY(s, u1), sg * u1 * hs], [F.X(te1), wingY(s, u1), sg * u1 * hs], [F.X(te0), wingY(s, u0), sg * u0 * hs], th0, th1, top, bot);
  }
  // the chord and the half thickness at u, by interpolation of the plan
  const at = (u) => {
    for (let i = 0; i + 1 < plan.length; i++) if (u <= plan[i + 1][0] + 1e-9) {
      const t = (u - plan[i][0]) / ((plan[i + 1][0] - plan[i][0]) || 1);
      return { le: lerp(plan[i][1], plan[i + 1][1], t), te: lerp(plan[i][2], plan[i + 1][2], t) };
    }
    return { le: plan[plan.length - 1][1], te: plan[plan.length - 1][2] };
  };
  const thick = (u, c) => c * (w.tc ?? 0.16) * (1 - 0.3 * u);
  // flaps, ailerons and the leading edge boots, laid on the surfaces as darker strips
  const strip = (u0, u1, f0, f1, col, below = false) => {
    const A = at(u0), B = at(u1);
    const pt = (u, a, f) => {
      const x = F.X(lerp(a.le, a.te, f)), yy = wingY(s, u) + (below ? -1 : 1) * (thick(u, a.te - a.le) / 2 + 0.014);
      return [x, yy, sg * u * hs];
    };
    const p0 = pt(u0, A, f0), p1 = pt(u1, B, f0), p2 = pt(u1, B, f1), p3 = pt(u0, A, f1);
    b.quad(p0, p1, p2, p3, col, MAT.AIRCRAFT, [p0[0], p0[1] + (below ? 1 : -1), p0[2]], 1);
  };
  const dk = shade(top, 0.78), dkb = shade(bot, 0.8);
  for (const below of [false, true]) {
    const cc = below ? dkb : dk;
    if (w.flaps) strip(w.flaps[0], w.flaps[1], 0.72, 1.0, cc, below);
    if (w.ail) strip(w.ail[0], w.ail[1], 0.76, 1.0, cc, below);
  }
  if (w.boots) strip(w.boots[0], w.boots[1], 0.0, 0.07, rgb('#2a2b2b'), false);
  // the national marking, out on the wing
  const A = at(0.7), r = Math.min(0.9, hs * 0.07), xm = F.X(lerp(A.le, A.te, 0.5));
  const ym = wingY(s, 0.7), th = thick(0.7, A.te - A.le) / 2;
  for (const sd of [1, -1]) {
    const yy = ym + sd * (th + 0.05), zz = sg * hs * 0.7;
    if (s.nation === 'France') {            // the cocarde: red outside, blue in the middle (the single-engine generator's UK-like one is for the carrier types)
      disc(b, xm, yy, zz, r, 'y', sd, rgb('#c7192a'), MAT.AIRCRAFT, 0.012); disc(b, xm, yy, zz, r * 0.66, 'y', sd, rgb('#f0eee6'), MAT.AIRCRAFT, 0.016); disc(b, xm, yy, zz, r * 0.33, 'y', sd, rgb('#1f3a78'), MAT.AIRCRAFT, 0.02);
    } else insignia(b, s.nation, xm, yy, zz, r, 'y', sd);
  }
}

/** A vertical surface: sections [y, le d, te d] bottom to top, in the plane z = zc, `th` thick. */
function finH(b, F, f, top) {
  const sec = f.sec, th = f.th ?? 0.14;
  for (let i = 0; i + 1 < sec.length; i++) {
    const [y0, l0, t0] = sec[i], [y1, l1, t1] = sec[i + 1];
    b.push().translate(0, 0, f.z).rotateX(-PI / 2);
    // in this frame the local z axis is the height and the local y axis (the thickness of a panel) is the athwartships direction
    panel(b, [F.X(l0), 0, y0], [F.X(l1), 0, y1], [F.X(t1), 0, y1], [F.X(t0), 0, y0], th, th * 0.8, top, top);
    b.pop();
  }
}

function tailH(b, s, F, top, bot, acc, dark) {
  const tp = s.tail.tp, hs = s.tail.span / 2, ty = s.tail.y;
  for (const sg of [-1, 1]) {
    const th0 = (tp.te0 - tp.le0) * 0.11, th1 = (tp.te1 - tp.le1) * 0.09;
    panel(b, [F.X(tp.le0), ty, sg * 0.2], [F.X(tp.le1), ty + 0.05, sg * hs], [F.X(tp.te1), ty + 0.05, sg * hs], [F.X(tp.te0), ty, sg * 0.2], th0, th1, top, bot);
    // the elevator hinge line
    const cx = (a, bb, f) => lerp(a, bb, f);
    const p0 = [F.X(cx(tp.le0, tp.te0, 0.62)), ty + th0 / 2 + 0.012, sg * 0.3], p1 = [F.X(cx(tp.le1, tp.te1, 0.62)), ty + 0.05 + th1 / 2 + 0.012, sg * hs * 0.97], p2 = [F.X(tp.te1), p1[1], p1[2]], p3 = [F.X(tp.te0), p0[1], p0[2]];
    b.quad(p0, p1, p2, p3, shade(top, 0.8), MAT.AIRCRAFT, [p0[0], p0[1] - 1, p0[2]], 1);
  }
  for (const f of s.tail.fins) {
    finH(b, F, f, top);
    // the team band on the fin, on both faces
    const mid = f.sec[Math.floor(f.sec.length / 2)], hi = f.sec[f.sec.length - 1], lo = f.sec[0];
    const yA = lerp(lo[0], hi[0], 0.45), yB = lerp(lo[0], hi[0], 0.78), band = (yy) => { const k = (yy - lo[0]) / ((hi[0] - lo[0]) || 1); return [lerp(lo[1], hi[1], k), lerp(lo[2], hi[2], k)]; };
    const [la, ta] = band(yA), [lb, tb] = band(yB);
    for (const sd of [1, -1]) {
      const zz = f.z + sd * ((f.th ?? 0.14) * 0.5 + 0.012);
      const q = [[F.X(lerp(la, ta, 0.5)), yA, zz], [F.X(lerp(la, ta, 0.9)), yA, zz], [F.X(lerp(lb, tb, 0.9)), yB, zz], [F.X(lerp(lb, tb, 0.5)), yB, zz]];
      b.quad(q[0], q[1], q[2], q[3], acc, MAT.FLAG, [q[0][0], q[0][1], zz - sd], 1);
    }
    void mid;
  }
}

// ---- landing gear -------------------------------------------------------------------------------------------
/** Height of the origin above the ground when the aircraft stands on its wheels. */
export function heavyGroundY(s) { return s.groundY; }

function gearH(b, s, F, skin, dark) {
  const g = s.gearGeom, tyre = rgb('#1b1b1b'), hub = rgb('#9a9c98');
  const xg = F.X(s.gearD);
  for (const e of s.engines) {
    if (!e.gear) continue;
    const yw = -s.groundY + g.wr, z = e.z;
    b.beam([xg - 0.1, e.y - e.r * 0.3, z], [xg, yw, z + Math.sign(z) * 0.05], 0.2, 0.26, shade(skin, 0.7), MAT.AIRCRAFT);
    b.beam([xg + 0.5, e.y - e.r * 0.3, z], [xg + 0.05, yw + 0.2, z + Math.sign(z) * 0.05], 0.09, 0.09, dark, MAT.DARK);      // the drag strut
    const side = Math.sign(z) || 1;
    b.rodZ(xg, yw, z - 0.2, z + 0.2, g.wr, g.wr, tyre, MAT.CANVAS, { seg: 14 });
    b.rodZ(xg, yw, z + side * 0.2, z + side * 0.23, g.wr * 0.55, g.wr * 0.55, hub, MAT.DARK, { seg: 10 });
    b.rodZ(xg, yw, z - side * 0.2, z - side * 0.23, g.wr * 0.55, g.wr * 0.55, hub, MAT.DARK, { seg: 10 });
    // the doors that stay under the nacelle
    b.box(xg - 0.2, e.y - e.r * 0.78, z + side * (g.wr * 0.28 + 0.15), 1.4, 0.05, 0.06 + 0.02, shade(skin, 0.75), MAT.AIRCRAFT);
  }
  // the tail wheel, long enough to hold the aircraft at the attitude of GROUND_PITCH
  const xt = F.X(s.tailWheelD), wr = 0.24, q = F.at(xt);
  const yc = -s.groundY + (xg - xt) * Math.tan(GROUND_PITCH) + wr;
  b.beam([xt + 0.1, q.yc - q.ry * 0.5, 0], [xt, yc, 0], 0.13, 0.13, dark, MAT.DARK);
  b.rodZ(xt, yc, -0.1, 0.1, wr, wr, tyre, MAT.CANVAS, { seg: 10 });
}

// ---- the bomb bay -------------------------------------------------------------------------------------------
function bayDoors(b, s, F, skin, dark) {
  const o = s.bay, x0 = F.X(o.d0), x1 = F.X(o.d1), xm = (x0 + x1) / 2, q = F.at(xm), yb = q.yc - q.ry * 0.9;
  for (const sg of [-1, 1]) {
    // a door hinged along the side of the opening and hanging open
    const zi = sg * o.hw, zo = sg * (o.hw + 0.55), yo = yb - 0.55;
    const A = [x0, yb, zi], B = [x1, yb, zi], C = [x1, yo, zo], D = [x0, yo, zo];
    b.quad(A, B, C, D, shade(skin, 0.8), MAT.AIRCRAFT, [xm, yb + 1, 0], 1);
    b.quad(D, C, B, A, rgb('#2b2d2b'), MAT.DARK, [xm, yb - 1, zo * 2], 1);
  }
  // the dark opening
  b.quad([x0, yb + 0.02, -o.hw], [x1, yb + 0.02, -o.hw], [x1, yb + 0.02, o.hw], [x0, yb + 0.02, o.hw], rgb('#1a1c1b'), MAT.DARK, [xm, yb + 1, 0], 1);
}

function bombLoad(b, s, F) {
  const o = s.bay, x0 = F.X(o.d0), x1 = F.X(o.d1), xm = (x0 + x1) / 2, q = F.at(xm), yb = q.yc - q.ry * 0.9;
  const n = o.n, cols = o.cols || (n > 1 ? 2 : 1), rows = Math.ceil(n / cols), len = Math.abs(x0 - x1);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = lerp(x0, x1, (r + 0.5) / rows) + 0.2, z = cols > 1 ? (c - (cols - 1) / 2) * Math.min(0.5, o.hw * 1.3 / cols) : 0;
    drawBomb(b, x, yb + 0.05 - (o.kg > 600 ? 0.18 : 0), z, o.kg);
  }
  void len;
}

// ---- the whole generator ---------------------------------------------------------------------------------------
export function drawHeavy(b, s, part) {
  const P = s.paint || PAINT[s.nation] || PAINT.USA;
  const top = rgb(P.top), bot = rgb(P.bot), acc = rgb(P.acc);
  const dark = rgb('#25272a'), glass = rgb('#33485a');
  const all = part === 'whole', F = frameOf(s), skin = (sn) => (sn < -0.25 ? bot : top);
  const col = { dark, glass, skin: top };
  const cutX = F.X(s.cutD);
  const sideEngines = (sg) => s.engines.filter((e) => Math.sign(e.z) === sg);
  const want = (d) => all || ((d >= s.cutD) === (part === 'tail'));      // what belongs to the fuselage group being drawn

  if (all || part === 'body') {
    loftH(b, F.range(F.noseX, cutX), skin, MAT.AIRCRAFT, { seg: s.seg || 18 });
    for (const o of s.glass || []) if (want(o.d0)) panes(b, F, o, glass);
    for (const c of s.cabin || []) {              // raised glazing: the flight deck
      const q = F.at(F.X((c.d0 + c.d1) / 2));
      b.block({ x0: F.X(c.d1), x1: F.X(c.d0), hw: c.hw, y0: q.yc + q.ry * c.y0, y1: q.yc + q.ry * c.y0 + c.h, tx0: F.X(c.d1 - (c.d1 - c.d0) * 0.18), tx1: F.X(c.d0 + (c.d1 - c.d0) * (c.tip ?? 0.1)), thw: c.hw * 0.62 }, glass, MAT.GLASS);
      for (const sd of [-1, 1]) b.beam([F.X(c.d1), q.yc + q.ry * c.y0, sd * c.hw * 0.98], [F.X((c.d0 + c.d1) / 2), q.yc + q.ry * c.y0 + c.h, sd * c.hw * 0.4], 0.05, 0.05, shade(top, 0.8), MAT.CANOPY, { caps: false });
    }
    for (const w of s.windows || []) {            // small rectangular windows in the sides
      if (!want(w.d)) continue;
      for (const sd of [-1, 1]) {
        const x = F.X(w.d), q = F.at(x), z = sd * (q.rz * sgnpow(Math.cos(Math.asin(Math.min(0.95, Math.abs(w.y - q.yc) / q.ry))), 2 / q.e) + 0.012);
        b.quad([x + w.w / 2, w.y - w.h / 2, z], [x - w.w / 2, w.y - w.h / 2, z], [x - w.w / 2, w.y + w.h / 2, z], [x + w.w / 2, w.y + w.h / 2, z], glass, MAT.GLASS, [x, w.y, 0], 1);
      }
    }
    drawGuns(b, s, F, false, col);
    for (const e of sideEngines(0)) nacelle(b, s, F, e, top, dark);
    if (s.bay) {            // the closed bomb doors: two dark panels along the belly
      const o = s.bay, th = Math.asin(Math.min(0.9, o.hw / F.at(F.X((o.d0 + o.d1) / 2)).rz)) / D2R;
      panes(b, F, { d0: o.d0, d1: o.d1, a0: 270 - th, a1: 270 + th, nu: 2, nv: 2, gap: 0.06, lift: 0.015 }, shade(bot, 0.62), MAT.AIRCRAFT);
    }
    // the national marking on the sides and a dorsal aerial
    const xi = F.X(s.insD), qi = F.at(xi);
    for (const sd of [-1, 1]) marking(b, F, s.nation, xi, qi.yc + qi.ry * 0.05, s.insR ?? qi.ry * 0.45, sd);
    const xa = F.X(s.mastD ?? 5.0), qa = F.at(xa);
    b.beam([xa, qa.yc + qa.ry * 0.95, 0], [xa - 0.5, qa.yc + qa.ry * 0.95 + 0.6, 0], 0.05, 0.05, dark, MAT.DARK, { caps: false });
  }

  if (all || part === 'tail') {
    loftH(b, F.range(cutX, F.tailX), skin, MAT.AIRCRAFT, { seg: s.seg || 18 });
    tailH(b, s, F, top, bot, acc, dark);
    if (!all) for (const o of s.glass || []) if (want(o.d0)) panes(b, F, o, glass);
    drawGuns(b, s, F, true, col);
  }

  if (all || part === 'wingR' || part === 'wingL') {
    const sgs = all ? [1, -1] : [part === 'wingR' ? 1 : -1];
    for (const sg of sgs) {
      wingH(b, s, F, sg, top, bot, dark);
      for (const e of sideEngines(sg)) nacelle(b, s, F, e, top, dark);
    }
  }

  // what is drawn round the pilot's seat instead of the nose and the flight deck: the hull from just behind the seat (the nose has no skin from inside)
  if (part === 'hull') loftH(b, F.range(F.X(s.eyeD[0]) - 0.9, cutX), skin, MAT.AIRCRAFT, { seg: s.seg || 18 });

  if (part === 'prop') propeller(b, s, dark, top);

  if (part === 'gear') gearH(b, s, F, top, dark);

  if (part === 'bay' && s.bay) bayDoors(b, s, F, top, dark);
  if (part === 'ordnance' && s.bay) bombLoad(b, s, F);

  // an engine as a piece of its own: the nacelle (it flies off, or burns on the wing)
  const m = /^eng(\d)$/.exec(part);
  if (m && s.engines[+m[1]]) nacelle(b, s, F, s.engines[+m[1]], top, dark);
  const bm = /^burn(\d)$/.exec(part);
  if (bm && s.engines[+bm[1]]) nacelle(b, s, F, s.engines[+bm[1]], rgb('#1d1b19'), dark, true);

}
