// A ship drawn from the groups of a reference model (ships/<id>_v4.js, tools/refs/shipgroups.py): after the procedural build (which keeps giving the hit volumes, the solids and the arcs) the hull and structure,
// the fine detail and the destroyable parts are replaced by the model's own triangles, recoloured with the game's paint so that the ship keeps its livery: the texture colour only decides what
// is wood (a warm colour on an upward face: the planking) and how light or dark a spot is against its kind (a window, a hatch, a plate).
import { MeshBuilder, MAT, rgb } from './meshbuilder.js';
import { decodeBaked } from './bakedmesh.js';

const lum = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;

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
    if (ny > 0.8 && warm) { const c = base.deck, k = Math.max(0.6, Math.min(1.3, l / ref.deck)); put(MAT.DECK, i, [c[0] * k, c[1] * k, c[2] * k]); continue; }
    if (cls === 'flightdeck' && ny > 0.8) { put(MAT.DECK, i, base.deck, true); continue; }       // the flight deck: its upper face flat, in the deck colour (a few huge triangles: the texture colours and the smoothed normals at their corners would stain it)
    const c = cls === 'hull' ? base.hull : base.sup;
    put(cls === 'hull' ? MAT.SKIN : MAT.HULL, i, [Math.min(255, c[0] * m), Math.min(255, c[1] * m), Math.min(255, c[2] * m)]);
  }
  return out;
}

export function reference(pieces, scale) {
  // the median lightness of what is not wood, and of the wood, over the whole ship: what the game's paint colour stands for
  const ls = [], ws = [];
  for (const p of pieces) {
    const d = decodeBaked(p, scale);
    for (let t = 0; t < d.idx.length; t += 3 * 4) {
      const v = d.idx[t] * 3, r = d.col[v], g = d.col[v + 1], b = d.col[v + 2], l = lum(r, g, b);
      ((r - b) / 255 > 0.1 && r >= g && d.nrm[v + 1] > 0.8 ? ws : ls).push(l);
    }
  }
  const med = (a, dflt) => { if (!a.length) return dflt; a.sort((x, y) => x - y); return a[a.length >> 1] || dflt; };
  return { lum: med(ls, 0.3), deck: med(ws, 0.35) };
}

/** Draw a piece into a builder with the game's paint (see the head of the file); `ref` from reference(). */
export function paintInto(nb, piece, scale, pal, cls, ref, maxY = Infinity) {
  for (const [mat, o] of paint(piece, scale, pal, cls, ref, maxY)) nb.raw(o.pos, o.nrm, o.col, Uint32Array.from({ length: o.pos.length / 3 }, (_, i) => i), mat);
}

export function applyV4(model, data, pal) {
  const sc = data.SCALE, S = data.SHIP;
  const nb = new MeshBuilder();
  const ref = reference([...Object.values(S.static), ...(S.fine ? [S.fine] : []), ...Object.values(S.parts).map((p) => p.mesh)], sc);
  const draw = (piece, cls) => paintInto(nb, piece, sc, pal, cls, ref);
  for (const [cls, piece] of Object.entries(S.static)) draw(piece, cls);
  if (S.fine) nb.group('fine', () => draw(S.fine, 'fine'));
  const parts = [];
  for (const [id, p] of Object.entries(S.parts)) {
    nb.group(id, () => draw(p.mesh, 'part'));
    // the wreck: the lowest third of the piece, charred
    const lo = p.bb[1], hi = p.bb[4], cut = lo + (hi - lo) * 0.33;
    nb.group(id + '_ruin', () => paintInto(nb, p.mesh, sc, pal, 'part', ref, cut));
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
  model.parts = parts;
  return model;
}
