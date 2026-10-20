// The look of a military base: buildBaseModel(layout, nation) turns the layout of sim/bases.js into the meshes that render/baseVisual.js draws.
//
//   ground       the flat work (runway, taxiways, aprons, roads, yards) a few centimetres above the levelled ground. Built in the frame of the base: origin at the
//                centre (layout.x, layout.z) at the height of the pad, +x along the axis, +z across it (to the right of +x), so it is placed with the heading of the base.
//   groundFine   the small flat detail (lamps, joints, centre lines, oil stains), drawn only up close
//   deco         the upright things that are not parts of the base (windsock, flag poles, floodlights), always drawn
//   decoFine     fences, vehicles, drums, drawn only up close
//   parts[i]     one per layout.parts[i]: a mesh (shared between buildings alike) with groups body / body_ruin / fine / spin, built in the frame of the building;
//                { x, y, z, heading } is where it stands (world) and the heading to draw it with
//   guns[i]      one per layout.guns[i]: the emplacement (groups body / fine) and the mount to draw on it (mount: spec for getMountModel, mountY: height of the axis)
// Nothing here needs a GPU: the meshes are plain buffers (MeshBuilder.build()).
import { MeshBuilder, MAT } from './meshbuilder.js';
import { makeRng } from '../math.js';
import { glyphIndex } from './glyphs.js';
import { buildPartMesh } from './baseParts.js';
import { buildEmplacement, gunMountSpec } from './baseGuns.js';
import { C, shade, mix, palOf, earthOf, dirtOf, slab, bar, disc, vehicle, drums, flagStaff, mast, camoNet, hash2 } from './baseKit.js';
import { roofRail } from './details.js';

const PI = Math.PI;
const Y_SHOULDER = 0.1, Y_ROAD = 0.115, Y_TAXI = 0.13, Y_RUNWAY = 0.145, Y_APRON = 0.155, Y_MARK = 0.19, Y_STAIN = 0.2;

// ---- flat work -------------------------------------------------------------------------------------------------------------------------------------------------------------

/** An oriented rectangle on the ground: centre (cx, cz), half length hl along the angle `ang` (0 = +x), half width hw. */
function rect(b, cx, cz, hl, hw, ang, y, col, mat = MAT.CANVAS) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [cx + u * c - v * s, y, cz + u * s + v * c];
  b.quad(P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw), col, mat, [cx, y - 1, cz], 1);
}
/** A strip of width w from (x0, z0) to (x1, z1). */
function strip(b, x0, z0, x1, z1, w, y, col, mat = MAT.CANVAS) {
  const l = Math.hypot(x1 - x0, z1 - z0);
  if (l < 0.01) return;
  rect(b, (x0 + x1) / 2, (z0 + z1) / 2, l / 2, w / 2, Math.atan2(z1 - z0, x1 - x0), y, col, mat);
}
/** A glyph painted on the ground, reading upright for someone who looks along `dir` (angle, 0 = +x) with the ground to his front. */
function glyph(b, ch, cx, cz, w, h, dir, y, mat = MAT.GLYPH) {
  const gi = glyphIndex(ch);
  if (gi < 0) return;
  const c = Math.cos(dir), s = Math.sin(dir);
  // u runs to the right of the reader, v from the top (far) to the bottom (near)
  const at = (u, v) => {
    const right = (u - 0.5) * w, fwd = (0.5 - v) * h;
    // forward = (c, s) in (x, z), the reader's right hand = forward x up = (-s, c)
    return [cx + fwd * c + right * (-s), y, cz + fwd * s + right * c];
  };
  const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => ({ p: at(u, v), col: [gi, u * 255, v * 255] }));
  const ids = q.map((e) => b.vert(e.p[0], e.p[1], e.p[2], 0, 1, 0, e.col, mat, 1));
  // the winding that faces up
  const e1 = [q[1].p[0] - q[0].p[0], q[1].p[2] - q[0].p[2]], e2 = [q[2].p[0] - q[0].p[0], q[2].p[2] - q[0].p[2]];
  const ny = e1[1] * e2[0] - e1[0] * e2[1];            // y component of (e1 x e2) in (x, z): ex*... sign decides the facing
  if (ny > 0) b.quadIdx(ids[0], ids[1], ids[2], ids[3]); else b.quadIdx(ids[0], ids[3], ids[2], ids[1]);
}

const wrapHeading = (a) => ((a % (PI * 2)) + PI * 2) % (PI * 2);

/** The runway: asphalt in patches of slightly different tone, the rubber of the landings, the edge lines, the centre dashes, the thresholds and the numbers. */
function runway(g, gf, rw, pal, rng, headingDeg) {
  const len = rw.len, hw = rw.hw, hl = len / 2;
  const tone = [76, 76, 78];
  // gravel shoulder (the cleared strip round the runway)
  rect(g, 0, 0, hl + 14, hw + 7, 0, Y_SHOULDER, C(pal.dirt[0]), MAT.TERRAIN);
  rect(g, 0, 0, hl + 14, hw + 3.5, 0, Y_SHOULDER + 0.004, C(pal.dirt[1]), MAT.TERRAIN);
  const seg = 28, n = Math.ceil(len / seg);
  for (let i = 0; i < n; i++) {
    const s0 = -hl + i * seg, s1 = Math.min(hl, s0 + seg);
    const k = 0.93 + 0.14 * hash2(i, 11), c = [tone[0] * k, tone[1] * k, tone[2] * (k + 0.01)];
    rect(g, (s0 + s1) / 2, 0, (s1 - s0) / 2 + 0.02, hw, 0, Y_RUNWAY, c);
    // a patch of newer or older surface here and there
    if (hash2(i, 5) < 0.2) rect(g, (s0 + s1) / 2 + (hash2(i, 6) - 0.5) * 8, (hash2(i, 7) - 0.5) * hw * 1.3, 4 + hash2(i, 8) * 7, 2.5 + hash2(i, 9) * 5, 0, Y_RUNWAY + 0.01, [c[0] * 0.93, c[1] * 0.93, c[2] * 0.94]);
  }
  // black rubber where the wheels come down, at both ends, and the lighter worn strip down the middle
  for (const e of [-1, 1]) {
    const rc = hl - Math.min(330, len * 0.3);
    rect(g, e * rc, 0, 55, hw * 0.5, 0, Y_RUNWAY + 0.012, [64, 64, 68]);
    rect(g, e * rc, 0, 55, hw * 0.16, 0, Y_RUNWAY + 0.02, [57, 57, 61]);
  }
  const white = C('#d8d6c8'), edge = hw - 1.4;
  for (const sgn of [-1, 1]) strip(g, -hl + 3, sgn * edge, hl - 3, sgn * edge, 0.9, Y_MARK, white);
  for (let s = -hl + 60; s < hl - 60; s += 50) strip(g, s, 0, s + 30, 0, 0.9, Y_MARK, white);
  // thresholds: eight bars across the end, the runway numbers behind them
  for (const e of [-1, 1]) {
    const dir = e > 0 ? PI : 0;                    // the pilot of the approach at the end e looks towards the middle (direction -e)
    for (let k = 0; k < 8; k++) {
      const t = (k - 3.5) * (hw * 2 - 6) / 8;
      strip(g, e * (hl - 3), t, e * (hl - 27), t, 1.8, Y_MARK, white);
    }
    // the number is the heading of the approach (the way the aircraft lands), in tens of degrees
    const hdg = e < 0 ? headingDeg : (headingDeg + 180) % 360;
    let num = Math.round(hdg / 10); if (num === 0) num = 36;
    const txt = String(num).padStart(2, '0');
    const gh = 10, gw = 5.4, gap = 2.0, total = txt.length * gw + (txt.length - 1) * gap;
    const dirAng = e < 0 ? 0 : PI;                 // looking along the runway from the end at -hl towards +hl is the +x direction
    for (let i = 0; i < txt.length; i++) {
      // the reader looks along dirAng; the digits are laid out to his right
      const off = (i + 0.5) * (gw + gap) - gap / 2 - total / 2;
      const rx = -Math.sin(dirAng), rz = Math.cos(dirAng);       // to the right of the reader
      const sx = e * (hl - 40) + rx * off * 0, sz = 0;
      glyph(g, txt[i], e * (hl - 40) + rx * off, sz + rz * off, gw, gh, dirAng, Y_MARK + 0.01);
    }
  }
  // fine: the lamps along both edges and the taxi-in lights
  for (let s = -hl + 10; s < hl; s += 60) for (const sgn of [-1, 1]) {
    slab(gf, s, 0.14, sgn * (hw + 1.4), 0.32, 0.22, 0.32, C('#e6e0b8'), MAT.EMISSIVE);
  }
  for (const e of [-1, 1]) for (let k = 0; k < 8; k++) slab(gf, e * (hl + 2), 0.12, (k - 3.5) * 6.5, 0.3, 0.2, 0.3, e < 0 ? C('#9ae0a8') : C('#e08a8a'), MAT.EMISSIVE);
}

/** Taxiways: lighter asphalt, a yellow centre line up close. */
function taxiways(g, gf, L, loc, rng) {
  for (const t of L.taxi) {
    const [a, b2] = [loc(t.x0, t.z0), loc(t.x1, t.z1)];
    strip(g, a[0], a[1], b2[0], b2[1], t.w, Y_TAXI, [92, 91, 88]);
    strip(gf, a[0], a[1], b2[0], b2[1], 0.3, Y_TAXI + 0.025, C('#c9b24a'));
  }
}

function aprons(g, gf, L, loc, pal) {
  for (const ap of L.aprons) {
    const c = loc(ap.x, ap.z), ang = ap.ang - L.ang;
    rect(g, c[0], c[1], ap.hl + 4, ap.hw + 4, ang, Y_SHOULDER + 0.012, C(pal.dirt[0]), MAT.TERRAIN);
    const k = C(pal.conc);
    // slabs of concrete in slightly different tones
    const sl = 15, nx = Math.ceil(ap.hl * 2 / sl), nz = Math.ceil(ap.hw * 2 / sl);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const u0 = -ap.hl + i * sl, u1 = Math.min(ap.hl, u0 + sl), v0 = -ap.hw + j * sl, v1 = Math.min(ap.hw, v0 + sl);
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2, f = 0.95 + 0.08 * hash2(i, j + 31);
      rect(g, c[0] + um * ca - vm * sa, c[1] + um * sa + vm * ca, (u1 - u0) / 2 + 0.01, (v1 - v0) / 2 + 0.01, ang, Y_APRON, [k[0] * f, k[1] * f, k[2] * f * 0.99]);
      // the joints
      rect(gf, c[0] + u0 * ca - vm * sa, c[1] + u0 * sa + vm * ca, 0.09, (v1 - v0) / 2, ang, Y_APRON + 0.015, [k[0] * 0.55, k[1] * 0.55, k[2] * 0.55]);
      rect(gf, c[0] + um * ca - v0 * sa, c[1] + um * sa + v0 * ca, (u1 - u0) / 2, 0.09, ang, Y_APRON + 0.015, [k[0] * 0.55, k[1] * 0.55, k[2] * 0.55]);
    }
  }
}

// ---- the sites ---------------------------------------------------------------------------------------------------------------------------------------------------------------

function fence(b, s0, s1, t0, t1, rng, step = 4.2, gaps = []) {
  const col = C('#5c5f58'), wire = C('#46484a');
  const edge = (xa, za, xb, zb) => {
    const l = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(l / step));
    for (let i = 0; i <= n; i++) {
      const f = i / n, x = xa + (xb - xa) * f, z = za + (zb - za) * f;
      if (gaps.some((q) => Math.hypot(q[0] - x, q[1] - z) < q[2])) continue;
      slab(b, x, 0.95, z, 0.12, 1.9, 0.12, col, MAT.HULL);
    }
    for (const y of [0.5, 1.0, 1.5, 1.9]) b.beam([xa, y, za], [xb, y, zb], 0.025, 0.025, wire, MAT.DARK, { caps: false });
  };
  edge(s0, t0, s1, t0); edge(s1, t0, s1, t1); edge(s1, t1, s0, t1); edge(s0, t1, s0, t0);
}

function windsock(b, x, z, yaw) {
  b.cylinder(x, 0, z, 0.16, 0.1, 7.4, C('#cfcbbd'), MAT.HULL, { seg: 6 });
  b.push().translate(x, 7.3, z).rotateY(-yaw).rotateZ(-PI / 2 + 0.28);
  const rings = 5, len = 3.4;
  for (let i = 0; i < rings; i++) {
    const r0 = 0.55 - 0.07 * i, r1 = 0.55 - 0.07 * (i + 1);
    b.cyl(0, len * i / rings, 0, r0, r0, r1, r1, len * (i + 1) / rings, i % 2 ? C('#e8e4da') : C('#d8631d'), MAT.CANVAS, { seg: 10, capTop: false });
  }
  b.pop();
  b.beam([x - 0.4, 7.2, z], [x + 0.4, 7.2, z], 0.1, 0.1, C('#2d2f2e'), MAT.HULL);
}

function floodlight(b, x, z, yaw, h = 12) {
  b.cylinder(x, 0, z, 0.2, 0.14, h, C('#7e8179'), MAT.HULL, { seg: 6 });
  b.push().translate(x, h, z).rotateY(-yaw);
  b.beam([0, 0, -1.0], [0, 0, 1.0], 0.1, 0.1, C('#7e8179'), MAT.HULL);
  for (const sz of [-0.8, 0.8]) { slab(b, 0.25, -0.05, sz, 0.35, 0.55, 0.7, C('#4a4d4b'), MAT.HULL); slab(b, 0.45, -0.05, sz, 0.05, 0.4, 0.55, C('#f2e8b0'), MAT.EMISSIVE); }
  b.pop();
}

/** The ground work and the decoration of an airfield. Coordinates are in the frame of the base. */
function airfieldSite(L, loc, pal, rng, g, gf, d, df) {
  const rw = L.runway, len = rw.len, hw = rw.hw;
  const headingDeg = ((L.heading * 180 / PI) % 360 + 360) % 360;
  runway(g, gf, rw, pal, rng, headingDeg);
  taxiways(g, gf, L, loc, rng);
  aprons(g, gf, L, loc, pal);
  // roads: behind the hangars and spurs to the apron
  const ty = hw + 205;
  strip(g, -340, ty, 360, ty, 7, Y_ROAD, C(pal.dirt[2]), MAT.TERRAIN);
  for (const s of [-10, 260, -len / 2 + 120]) strip(g, s, hw + 146, s, ty, 6, Y_ROAD, C(pal.dirt[2]), MAT.TERRAIN);
  strip(g, -len / 2 + 120, ty, -len / 2 + 120, ty + 40, 6, Y_ROAD, C(pal.dirt[2]), MAT.TERRAIN);
  strip(g, 200, ty, 235, ty + 28, 6, Y_ROAD, C(pal.dirt[2]), MAT.TERRAIN);
  // oil stains and tie-down rings where the aircraft park
  for (let i = 0; i < L.slots.length; i++) {
    const sl = L.slots[i], p = loc(sl.x, sl.z);
    disc(gf, p[0] + 1.5, Y_STAIN, p[1], 1.6 + hash2(i, 3) * 1.3, [118, 115, 108], MAT.CANVAS, { salt: i }, 10, 2.6);
  }
  // upright decoration: windsock beside the runway, flag poles at the barracks and the tower, floodlights round the apron
  windsock(d, 300, -hw - 17, 0.6 + hash2(L.id, 1) * 0.8);
  windsock(d, -len / 2 + 60, hw + 18, 2.4 + hash2(L.id, 2) * 0.8);
  const bk = L.parts.filter((q) => q.kind === 'barracks');
  if (bk.length) {
    const q = bk.reduce((a, c) => { a[0] += c.x; a[1] += c.z; return a; }, [0, 0]).map((v) => v / bk.length), p = loc(q[0], q[1]);
    flagStaff(d, p[0] - 22, 0, p[1] - 3, 11, 4.2);
  }
  for (let i = 0; i < 6; i++) {
    const s = (i - 2.5) * 100, t = hw + 52;
    floodlight(d, s, t, -PI / 2, 11);
  }
  mast(d, -len / 2 + 160, 0, hw + 120, 16, '#8c8f86');
  // fences round the fuel dump and the barracks, and between the field and the buildings
  const tk = L.parts.filter((q) => q.kind === 'tank' || q.kind === 'depot').map((q) => loc(q.x, q.z));
  if (tk.length) {
    const s0 = Math.min(...tk.map((p) => p[0])) - 20, s1 = Math.max(...tk.map((p) => p[0])) + 20, t0 = Math.min(...tk.map((p) => p[1])) - 20, t1 = Math.max(...tk.map((p) => p[1])) + 20;
    fence(df, s0, s1, t0, t1, rng, 4.5, [[(s0 + s1) / 2, t0, 8]]);
  }
  if (bk.length) {
    const p = bk.map((q) => loc(q.x, q.z)), s0 = Math.min(...p.map((v) => v[0])) - 26, s1 = Math.max(...p.map((v) => v[0])) + 26, t0 = Math.min(...p.map((v) => v[1])) - 14, t1 = Math.max(...p.map((v) => v[1])) + 14;
    fence(df, s0, s1, t0, t1, rng, 4.5, [[s0 + 14, t0, 8]]);
  }
  // vehicles and stacks of drums
  const nat = palOf(L.nation), vcol = shade(C(nat.wall), 0.85);
  const veh = [['truck', -180, hw + 136, 0.1], ['truck', -60, hw + 139, PI], ['bowser', 90, hw + 137, 0.05], ['jeep', 180, hw + 128, 1.2], ['truck', 232, hw + 140, 3.0], ['bowser', -len / 2 + 150, hw + 200, 1.55], ['jeep', -48, hw + 112, 0.3], ['truck', 150, hw + 210, 0.0]];
  for (const [kind, s, t, yaw] of veh) vehicle(df, s, 0.12, t, yaw, kind, kind === 'bowser' ? '#6e7062' : vcol);
  const dr = [[-len / 2 + 105, hw + 195], [-len / 2 + 140, hw + 262], [-60, hw + 188], [130, hw + 190], [-len / 2 + 190, hw + 238]];
  dr.forEach(([s, t], i) => drums(df, s, 0.1, t, 3 + (i % 2), 2 + ((i >> 1) % 2), hash2(i, 1) * 3, i % 2 ? '#5c6048' : '#7a4a3a'));
}

function batterySite(L, loc, pal, rng, g, gf, d, df) {
  const gunsC = L.guns.filter((q) => q.kind === 'coastal').map((q) => loc(q.x, q.z));
  const tt = gunsC.map((p) => p[1]), span = (Math.max(...tt) - Math.min(...tt)) / 2 + 36;
  rect(g, -8, 0, 62, span + 6, 0, Y_SHOULDER, C(pal.dirt[1]), MAT.TERRAIN);
  rect(g, 0, 0, 56, span, 0, Y_SHOULDER + 0.005, shade(C(pal.dirt[1]), 0.93), MAT.TERRAIN);
  const road = C(pal.dirt[2]);
  strip(g, 6, -span + 6, 6, span - 6, 5, Y_ROAD, road, MAT.TERRAIN);
  strip(g, -100, 0, 6, 0, 6, Y_ROAD, road, MAT.TERRAIN);
  for (const p of gunsC) strip(g, 6, p[1], p[0] - 12, p[1], 4.5, Y_ROAD, road, MAT.TERRAIN);
  for (const q of L.parts.filter((q) => q.kind === 'bunker')) { const p = loc(q.x, q.z); strip(g, p[0], Math.sign(p[1]) * 6, p[0], p[1] - Math.sign(p[1]) * 8, 4, Y_ROAD, road, MAT.TERRAIN); }
  // the national flag at the post, a mast, the fence all round
  const post = L.parts.find((q) => q.kind === 'post');
  if (post) { const p = loc(post.x, post.z); flagStaff(d, p[0] - 12, 0, p[1] - 9, 10, 3.6); }
  mast(d, -78, 0, span - 12, 14, '#8c8f86');
  fence(df, -80, 62, -span - 12, span + 12, rng, 4.5, [[-80, 0, 8]]);
  const vcol = shade(C(palOf(L.nation).wall), 0.85);
  vehicle(df, -70, 0.12, 12, 0.2, 'truck', vcol);
  vehicle(df, -58, 0.12, -22, 0.9, 'jeep', vcol);
  drums(df, -62, 0.1, span - 16, 3, 2, 0.3, '#5c6048');
  camoNet(df, -64, 12, 6.5, 3.8, 3.2, 0.2, [pal.roof, pal.roof2, pal.roof3, pal.wall], L.id);
  drums(df, -66, 0.1, -span + 18, 2, 2, 1.0, '#7a4a3a');
}

// ---- parts -------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** How a building sits: the angle `a` of its canonical frame in its own frame, and its dimensions in that frame (D along the long side). */
export function orientPart(part, L) {
  const dTurn = part.heading - L.heading;
  const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
  const t = -(part.x - L.x) * sa + (part.z - L.z) * ca;
  const tgt = Math.abs(t) > 8 ? [0, -Math.sign(t)] : [1, 0];                // towards the axis of the base, else towards the front
  const ex = [Math.cos(dTurn), Math.sin(dTurn)], ez = [-Math.sin(dTurn), Math.cos(dTurn)];
  const tp = [tgt[0] * ex[0] + tgt[1] * ex[1], tgt[0] * ez[0] + tgt[1] * ez[1]];
  const longX = part.l >= part.w, sideDoor = part.kind === 'barracks';
  let best = null;
  for (const a of longX ? [0, PI] : [PI / 2, -PI / 2]) {
    const tcx = tp[0] * Math.cos(a) - tp[1] * Math.sin(a), tcz = tp[0] * Math.sin(a) + tp[1] * Math.cos(a);
    const score = sideDoor ? tcz : tcx;
    if (!best || score > best.score) best = { a, score };
  }
  return { a: best.a, D: longX ? part.l : part.w, Wd: longX ? part.w : part.l };
}

const partCache = new Map();
function partMesh(kind, nation, pal, biome, D, Wd, h, variant, seed) {
  const key = [kind, nation, biome, D.toFixed(1), Wd.toFixed(1), h.toFixed(1), variant].join('|');
  let m = partCache.get(key);
  if (!m) {
    m = buildPartMesh(kind, { D, Wd, h, pal, nation, variant, seed });
    m.key = key;
    partCache.set(key, m);
  }
  return m;
}
const gunCache = new Map();
function gunBody(g, pal, nation, biome, seed) {
  const key = [g.kind, g.cal, g.n, nation, biome].join('|');
  let m = gunCache.get(key);
  if (!m) { m = buildEmplacement({ ...g, nation }, pal, seed); m.key = key; gunCache.set(key, m); }
  return m;
}

/**
 * The model of a base. layout: an element of terrain.bases (sim/bases.js); nation: whose it is (the camouflage of the buildings), default layout.nation.
 * opts.biome: the biome of the island (the colour of the earth banks). Returns { id, kind, nation, ref, x, z, heading, radius, ground, groundFine, deco, decoFine, parts, guns }; see the top of the file.
 */
export function buildBaseModel(layout, nation = layout.nation, opts = {}) {
  const biome = opts.biome || 'green';
  const dirt = dirtOf(biome);
  const L = layout, pal = { ...palOf(nation), earth: earthOf(biome), dirt }, rng = makeRng((L.id + 1) * 7919 + (L.island + 1) * 104729);
  const ref = L.pads.length ? L.pads[0].y : L.y;
  const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
  const loc = (x, z) => [(x - L.x) * ca + (z - L.z) * sa, -(x - L.x) * sa + (z - L.z) * ca];
  const g = new MeshBuilder(), gf = new MeshBuilder(), d = new MeshBuilder(), df = new MeshBuilder();
  if (L.kind === 'airfield') airfieldSite({ ...L, nation }, loc, pal, rng, g, gf, d, df);
  else batterySite({ ...L, nation }, loc, pal, rng, g, gf, d, df);
  const pack = (b) => (b.triangleCount ? b.build({ ao: false }) : null);
  const parts = L.parts.map((p, i) => {
    const o = orientPart(p, L);
    const m = partMesh(p.kind, nation, pal, biome, o.D, o.Wd, p.h, i % 3, (L.id + 1) * 131 + i * 17 + p.kind.length);
    return { index: i, kind: p.kind, x: p.x, y: p.y, z: p.z, heading: p.heading - o.a, mesh: m.mesh, key: m.key, spin: m.spin, r: Math.hypot(o.D, o.Wd) / 2 + p.h * 0.5 };
  });
  const guns = L.guns.map((q, i) => {
    const e = gunBody(q, pal, nation, biome, (L.id + 1) * 977 + (q.kind === 'aa' ? 5 : 9));
    return { index: i, kind: q.kind, x: q.x, y: q.y, z: q.z, heading: q.heading, mount: gunMountSpec({ ...q, nation }, pal), mountY: e.mountY, body: e.mesh, key: e.key, r: e.radius };
  });
  let radius = 60;
  for (const p of L.pads) radius = Math.max(radius, Math.hypot(p.x - L.x, p.z - L.z) + Math.hypot(p.hl, p.hw));
  for (const p of parts) radius = Math.max(radius, Math.hypot(p.x - L.x, p.z - L.z) + p.r);
  for (const q of guns) radius = Math.max(radius, Math.hypot(q.x - L.x, q.z - L.z) + q.r);
  return { id: L.id, kind: L.kind, nation, ref, x: L.x, z: L.z, heading: L.heading, radius, ground: pack(g), groundFine: pack(gf), deco: pack(d), decoFine: pack(df), parts, guns };
}

/** Free the caches of built meshes (tests that build many bases). */
export function clearBaseCaches() { partCache.clear(); gunCache.clear(); }
