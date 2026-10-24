// A ship drawn from the groups of a reference model (ships/<id>_v4.js, tools/refs/shipgroups.py): after the procedural build (which keeps giving the hit volumes, the solids and the arcs) the hull and structure,
// the fine detail and the destroyable parts are replaced by the model's own triangles, recoloured with the game's paint so that the ship keeps its livery: the texture colour only decides what
// is wood (a warm colour on an upward face: the planking) and how light or dark a spot is against its kind (a window, a hatch, a plate).
import { MeshBuilder, MAT, rgb } from './meshbuilder.js';
import { decodeBaked, cutBaked } from './bakedmesh.js';
import { buildHitModel, addPartSurfaces } from './v4hit.js';

const lum = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;
const CHROMA = 0.6, CHROMA_HULL = 0.4, CHROMA_PLAIN = 0.12;      // how much of the texture's colour variations the paint takes (1 = all of it); 'plain': a part that keeps almost none of it (launchers a model paints red)

/** Split a decoded piece into triangles of the materials it is drawn with. cls: 'hull' (plating), anything else (paint of the structure). */
function paint(piece, scale, pal, cls, ref, maxY = Infinity) {
  const d = decodeBaked(piece, scale), out = new Map();
  const base = { hull: rgb(pal.hull), deck: rgb(pal.deck), sup: rgb(pal.sup) };
  const put = (mat, i, col, up = false) => {
    let o = out.get(mat);
    if (!o) { o = { pos: [], nrm: [], col: [] }; out.set(mat, o); }
    for (let k = 0; k < 3; k++) { const v = d.idx[i + k] * 3; o.pos.push(d.pos[v], d.pos[v + 1], d.pos[v + 2]); if (up) o.nrm.push(0, 1, 0); else o.nrm.push(d.nrm[v], d.nrm[v + 1], d.nrm[v + 2]); o.col.push(col[0], col[1], col[2]); }
  };
  const tri = d.idx.length / 3;
  let topY = -Infinity; if (cls === 'flightdeck') for (let v = 1; v < d.pos.length; v += 3) topY = Math.max(topY, d.pos[v]);
  for (let t = 0; t < tri; t++) {
    const i = t * 3;
    let r = 0, g = 0, b = 0, ny = 0;
    for (let k = 0; k < 3; k++) { const v = d.idx[i + k] * 3; r += d.col[v]; g += d.col[v + 1]; b += d.col[v + 2]; ny += d.nrm[v + 1]; }
    r /= 3; g /= 3; b /= 3; ny /= 3;
    if (maxY < Infinity) {                                  // a wreck: the part below `maxY` only, charred
      let cy = 0; for (let k = 0; k < 3; k++) cy += d.pos[d.idx[i + k] * 3 + 1];
      if (cy / 3 > maxY) continue;
      const c = rgb(pal.dark), m2 = 0.7 + 0.6 * lum(r, g, b);
      put(MAT.DARK, i, [c[0] * m2, c[1] * m2, c[2] * m2]);
      continue;
    }
    const l = lum(r, g, b), m = Math.max(0.55, Math.min(1.35, l / ref.lum));
    const warm = (r - b) / 255 > 0.1 && r >= g;
    if (ny > 0.8 && warm && cls !== 'flightdeck') { const c = base.deck, k = Math.max(0.6, Math.min(1.3, l / ref.deck)); put(MAT.DECK, i, [c[0] * k, c[1] * k, c[2] * k]); continue; }
    // the weather deck: the horizontal faces of the hull plating above the water (their winding is not reliable in these models: the face may be wound downwards), planking in the deck colour, lit as a deck
    let cy = 0; for (let k = 0; k < 3; k++) cy += d.pos[d.idx[i + k] * 3 + 1];
    if ((cls === 'hull' || cls === 'deck') && Math.abs(ny) > 0.8 && cy / 3 > 3) { const c = base.deck, k = Math.max(0.85, Math.min(1.15, l / ref.lum)); put(MAT.DECK, i, [c[0] * k, c[1] * k, c[2] * k], true); continue; }
    if (cls === 'flightdeck') {      // the face's own normal decides (the smoothed normals at the corners of a huge triangle lean over and would leave patches unpainted); the winding of such a plate is not reliable, so the top is the highest level of the piece
      const A = d.idx[i] * 3, B = d.idx[i + 1] * 3, Cc = d.idx[i + 2] * 3;
      const ux = d.pos[B] - d.pos[A], uy = d.pos[B + 1] - d.pos[A + 1], uz = d.pos[B + 2] - d.pos[A + 2], vx = d.pos[Cc] - d.pos[A], vy = d.pos[Cc + 1] - d.pos[A + 1], vz = d.pos[Cc + 2] - d.pos[A + 2];
      const nx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (Math.abs(nyy) > 0.8 * Math.hypot(nx, nyy, nz) && (d.pos[A + 1] + d.pos[B + 1] + d.pos[Cc + 1]) / 3 > topY - 0.3) {      // (cut into small triangles: the baked occlusion lives on the vertices, and a huge one would show it as a pyramid)
        let o = out.get(MAT.DECK); if (!o) { o = { pos: [], nrm: [], col: [] }; out.set(MAT.DECK, o); }
        const split = (p0, p1, p2) => {
          const l01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), l20 = Math.hypot(p0[0] - p2[0], p0[1] - p2[1], p0[2] - p2[2]);
          const lm = Math.max(l01, l12, l20);
          if (lm <= 4) { for (const q of [p0, p1, p2]) { o.pos.push(q[0], q[1], q[2]); o.nrm.push(0, 1, 0); o.col.push(base.deck[0], base.deck[1], base.deck[2]); } return; }
          const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
          if (lm === l01) { const m = mid(p0, p1); split(p0, m, p2); split(m, p1, p2); } else if (lm === l12) { const m = mid(p1, p2); split(p0, p1, m); split(p0, m, p2); } else { const m = mid(p2, p0); split(p0, p1, m); split(m, p1, p2); }
        };
        split([d.pos[A], d.pos[A + 1], d.pos[A + 2]], [d.pos[B], d.pos[B + 1], d.pos[B + 2]], [d.pos[Cc], d.pos[Cc + 1], d.pos[Cc + 2]]);
        continue;
      }
    }       // the flight deck: its upper face flat, in the deck colour (a few huge triangles: the texture colours and the smoothed normals at their corners would stain it)
    const c = cls === 'hull' ? base.hull : base.sup;
    // the model's own colour variations (rust, red lead, a painted marking, a tarred plate) ride on the livery's paint: the chroma of the texture against the ship's median chroma, kept within bounds
    const lr = Math.max(1, 0.3 * r + 0.59 * g + 0.11 * b), K = cls === 'hull' ? CHROMA_HULL : cls === 'plain' ? CHROMA_PLAIN : CHROMA;
    const cm = (v, rf) => Math.pow(Math.max(0.5, Math.min(1.7, (v / lr) / rf)), K);
    put(cls === 'hull' ? MAT.SKIN : MAT.HULL, i, [Math.min(255, c[0] * m * cm(r, ref.cr)), Math.min(255, c[1] * m * cm(g, ref.cg)), Math.min(255, c[2] * m * cm(b, ref.cb))]);
  }
  return out;
}

export function reference(pieces, scale) {
  // the median lightness of what is not wood, and of the wood, over the whole ship: what the game's paint colour stands for
  const ls = [], ws = [], cr = [], cg = [], cb = [];
  for (const p of pieces) {
    const d = decodeBaked(p, scale);
    for (let t = 0; t < d.idx.length; t += 3 * 4) {
      const v = d.idx[t] * 3, r = d.col[v], g = d.col[v + 1], b = d.col[v + 2], l = lum(r, g, b);
      const wood = (r - b) / 255 > 0.1 && r >= g && d.nrm[v + 1] > 0.8;
      (wood ? ws : ls).push(l);
      if (!wood) { const lr = Math.max(1, 0.3 * r + 0.59 * g + 0.11 * b); cr.push(r / lr); cg.push(g / lr); cb.push(b / lr); }
    }
  }
  const med = (a, dflt) => { if (!a.length) return dflt; a.sort((x, y) => x - y); return a[a.length >> 1] || dflt; };
  return { lum: med(ls, 0.3), deck: med(ws, 0.35), cr: med(cr, 1), cg: med(cg, 1), cb: med(cb, 1) };
}

/** Draw a piece into a builder with the game's paint (see the head of the file); `ref` from reference(). */
export function paintInto(nb, piece, scale, pal, cls, ref, maxY = Infinity) {
  for (const [mat, o] of paint(piece, scale, pal, cls, ref, maxY)) nb.raw(o.pos, o.nrm, o.col, Uint32Array.from({ length: o.pos.length / 3 }, (_, i) => i), mat);
}

export function applyV4(model, data, pal, drop = [], clean = [], opts = {}) {
  // clean: [{ x, z, r, y0, maxArea }]: the small triangles (details of what stood there: a turret's roller path, its fittings) of the static pieces above y0 within r of (x, z) are left out: what a fit has landed leaves no trace
  if (clean.length) {
    const gone = (x, y, z, a) => clean.some((c) => y >= c.y0 && Math.hypot(x - c.x, z - c.z) <= c.r && a <= c.maxArea);
    const S0 = data.SHIP;
    data = { SCALE: data.SCALE, SHIP: { ...S0, static: Object.fromEntries(Object.entries(S0.static).map(([k, p]) => [k, cutBaked(p, data.SCALE, gone)])), ...(S0.fine ? { fine: cutBaked(S0.fine, data.SCALE, gone) } : {}) } };      // (the fine detail too)
  }      // drop: ids of parts the fit of this ship does not have (not drawn, no hit volume)
  const sc = data.SCALE, S = data.SHIP;
  const nb = new MeshBuilder();
  const ref = reference([...Object.values(S.static), ...(S.fine ? [S.fine] : []), ...Object.values(S.parts).map((p) => p.mesh)], sc);
  const draw = (piece, cls) => paintInto(nb, piece, sc, pal, cls, ref);
  for (const [cls, piece] of Object.entries(S.static)) draw(piece, cls);
  if (S.fine) nb.group('fine', () => draw(S.fine, 'fine'));
  // opts.lifts: the pits of the lifts of a carrier, black outlines on the flight deck at the places and sizes the sim moves its platforms (the model's deck is repainted flat in the deck colour)
  if (opts.lifts && model.elevators && model.fdY != null) {
    const col = rgb('#17191c'), y = model.fdY + 0.03, w = 0.22;
    for (const e of model.elevators) {
      if (e.edge) continue;
      nb.decal(e.x, y, e.z - e.hw, e.hl + w, w, col, MAT.HULL); nb.decal(e.x, y, e.z + e.hw, e.hl + w, w, col, MAT.HULL);
      nb.decal(e.x - e.hl, y, e.z, w, e.hw + w, col, MAT.HULL); nb.decal(e.x + e.hl, y, e.z, w, e.hw + w, col, MAT.HULL);
    }
  }
  const parts = [];
  for (const [id, p] of Object.entries(S.parts)) {
    if (drop.includes(id)) continue;
    nb.group(id, () => draw(p.mesh, p.plain ? 'plain' : 'part'));
    // the wreck: the lowest third of the piece, charred
    const lo = p.bb[1], hi = p.bb[4], cut = lo + (hi - lo) * 0.33;
    nb.group(id + '_ruin', () => paintInto(nb, p.mesh, sc, pal, p.plain ? 'plain' : 'part', ref, cut));
    const ctr = [(p.bb[0] + p.bb[3]) / 2, p.bb[1], (p.bb[2] + p.bb[5]) / 2];
    const def = { id, kind: p.kind, label: p.label, bb: p.bb.slice(), hasRuin: true, hasFine: false };
    if (p.spin) def.spin = { x: ctr[0], y: (p.bb[1] + p.bb[4]) / 2, z: ctr[2], rate: 1.6 };
    if (p.track) def.track = { x: ctr[0], y: (p.bb[1] + p.bb[4]) / 2, z: ctr[2] };
    parts.push(def);
  }
  const built = nb.build();
  model.mesh = built;
  model.fine = built.groups.fine || null;
  for (const p of parts) { p.mesh = built.groups[p.id]; p.ruin = built.groups[p.id + '_ruin']; p.fineMesh = null; }
  model.parts = [...parts, ...model.parts.filter((p) => p.keep)];      // (what the procedural build adds that the model does not have, such as the missile launchers of a later fit, stays)
  model.hit = addPartSurfaces(buildHitModel(data, drop), model.parts.filter((p) => p.keep));      // the hit volumes made from what is drawn (v4hit.js)
  return model;
}
