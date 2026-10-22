// A baked reference model cut for the game (tools/refs/bake.py wrote the arrays, tools/refs/shiplayout.mjs the layout): node tools/refs/bakeship.mjs <bakeddir> <layout.json> <out.js> [--margin=0.3]
// The triangles of what the game draws itself (the gun houses and their barrels, the screws and rudders, the parts that turn) are left out; those inside the box of a destroyable part (the
// smallest one that holds them) become that part's piece (its intact look); the rest is the hull and the structure (`static`). Written as a JS module read by model/bakedship.js.
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2), pos = a.filter((x) => !x.startsWith('--')), fl = Object.fromEntries(a.filter((x) => x.startsWith('--')).map((x) => { const [k, v] = x.slice(2).split('='); return [k, v ?? '1']; }));
const [dir, layoutFile, outFile] = pos;
const MARGIN = +(fl.margin ?? 0.3);
const maskBoxes = fl.mask && fs.existsSync(fl.mask) ? JSON.parse(fs.readFileSync(fl.mask, 'utf8')) : {};          // --mask: the tight box of each kind of mount that bakemounts2.py took (mount frame)
const rd = (f, T) => { const b = fs.readFileSync(path.join(dir, f)); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const P = rd('pos.f32', Float32Array), C = rd('col.u8', Uint8Array), I = rd('idx.u32', Uint32Array);
const lay = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
const parts = lay.parts.filter((p) => !p.keep && p.bb.every(Number.isFinite)), keeps = lay.parts.filter((p) => p.keep);
const vol = (b) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
parts.sort((p, q) => vol(p.bb) - vol(q.bb));
const inBox = (b, x, y, z, m) => x > b[0] - m && x < b[3] + m && y > b[1] - m && y < b[4] + m && z > b[2] - m && z < b[5] + m;

const YMAX = +(fl.ymax ?? 1e9);
const masked = (x, y, z) => {
  if (y > YMAX) return true;                                                          // --ymax: stray pieces over the mast tops
  for (const m of lay.mounts) {
    const c = Math.cos(m.yaw), s = Math.sin(m.yaw), dx = x - m.x, dz = z - m.z, u = dx * c + dz * s, w = -dx * s + dz * c, yy = y - m.y;
    const mb = maskBoxes[`${m.variant}|${m.cal}|${m.n}|${m.aa ? 'aa' : 'gun'}`];
    if (mb) { if (u > mb[0] && u < mb[1] && w > mb[2] && w < mb[3] && yy > mb[4] && yy < mb[5]) return true; continue; }
    const [x0, x1, z0, z1, y0, y1] = m.house;
    if (yy > y0 - 0.3 && yy < y1 + 0.5 && u > x0 - MARGIN && u < x1 + MARGIN && w > z0 - MARGIN && w < z1 + MARGIN) return true;
    // the barrels: a corridor in front of the house, as long as the guns, as wide as they stand
    const hw = Math.max(0.7, ((m.n - 1) / 2) * m.spacing + 0.8 + (m.cal >= 300 ? 0.6 : 0));
    if (m.cal > 20 && u >= x1 - 0.2 && u < m.reach + 0.6 && Math.abs(w) < hw && yy > m.trun[1] - 1.8 - (m.cal >= 300 ? 1.0 : 0) && yy < m.trun[1] + 2.6 + (m.cal >= 300 ? 1.0 : 0)) return true;
  }
  for (const sp of lay.spinners) if (sp.bb && inBox([sp.bb[0], sp.bb[1], sp.bb[2], sp.bb[3], sp.bb[4], sp.bb[5]], x, y, z, 0.25)) return true;
  for (const k of keeps) if (inBox(k.bb, x, y, z, 0.2)) return true;
  return false;
};

const groups = { static: [] };
for (const p of parts) groups[p.id] = [];
let dropped = 0;
for (let t = 0; t < I.length; t += 3) {
  const a0 = I[t], a1 = I[t + 1], a2 = I[t + 2];
  const x = (P[a0 * 3] + P[a1 * 3] + P[a2 * 3]) / 3, y = (P[a0 * 3 + 1] + P[a1 * 3 + 1] + P[a2 * 3 + 1]) / 3, z = (P[a0 * 3 + 2] + P[a1 * 3 + 2] + P[a2 * 3 + 2]) / 3;
  if (masked(x, y, z)) { dropped++; continue; }
  let k = 'static';
  for (const p of parts) if (inBox(p.bb, x, y, z, 0.15)) { k = p.id; break; }
  groups[k].push(t);
}
// ---- the structure of the ship as independent pieces: the separate objects of the model (deckhouses, platforms, boats, cranes, gun tubs...) that are not the hull ----
const MAXC = +(fl.chunks ?? 48), MINT = +(fl.minTris ?? 150);
const chunks = [];
if (MAXC > 0) {
  const st = groups.static, par = new Int32Array(P.length / 3).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const t of st) { const r0 = find(I[t]); for (let q = 1; q < 3; q++) { const r = find(I[t + q]); if (r !== r0) par[r] = r0; } }
  const comps = new Map();
  for (const t of st) { const r = find(I[t]); let c = comps.get(r); if (!c) { c = { tris: [], bb: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9] }; comps.set(r, c); } c.tris.push(t); for (let q = 0; q < 3; q++) for (let k = 0; k < 3; k++) { const v = P[I[t + q] * 3 + k]; if (v < c.bb[k]) c.bb[k] = v; if (v > c.bb[k + 3]) c.bb[k + 3] = v; } }
  const L = lay.loa;
  const list = [...comps.values()].sort((a, b) => b.tris.length - a.tris.length);
  const big = list.filter((c) => c.tris.length >= MINT && (c.bb[3] - c.bb[0]) < 0.32 * L && c.bb[1] > -0.3 && (c.bb[4] - c.bb[1]) > 0.25).slice(0, MAXC);
  const taken = new Set();
  big.forEach((c) => { c.members = c.tris.slice(); for (const t of c.tris) taken.add(t); });
  // the small things that stand on a piece go with it (its fittings, rails, ladders)
  for (const c of list) {
    if (big.includes(c) || c.tris.length >= MINT) continue;
    const t0 = c.tris[0], cx = (c.bb[0] + c.bb[3]) / 2, cy = (c.bb[1] + c.bb[4]) / 2, cz = (c.bb[2] + c.bb[5]) / 2;
    let best = null, bv = Infinity;
    for (const b of big) if (inBox(b.bb, cx, cy, cz, 0.2)) { const v = vol(b.bb); if (v < bv) { bv = v; best = b; } }
    if (best) { for (const t of c.tris) { best.members.push(t); taken.add(t); } void t0; }
  }
  groups.static = st.filter((t) => !taken.has(t));
  big.forEach((c, i) => { chunks.push({ id: `c${i}`, tris: c.members, bb: c.bb }); });
  console.error(`${chunks.length} independent pieces (${chunks.reduce((s2, c) => s2 + c.tris.length, 0)} triangles), ${groups.static.length} stay in the hull`);
}
console.error(`dropped ${dropped} triangles on what the game draws; ${Object.entries(groups).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);

const SC = 200;
const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const out = { static: null, parts: {} };
for (const [name, tris] of Object.entries(groups)) {
  if (!tris.length) continue;
  const map = new Map(), vp = [], vc = [], ix = [];
  for (const t of tris) for (let q = 0; q < 3; q++) {
    const v = I[t + q];
    if (!map.has(v)) { map.set(v, vp.length / 3); vp.push(Math.round(P[v * 3] * SC), Math.round(P[v * 3 + 1] * SC), Math.round(P[v * 3 + 2] * SC)); vc.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]); }
    ix.push(map.get(v));
  }
  const wide = vp.length / 3 >= 65536;
  const piece = { nv: vp.length / 3, ni: ix.length, pos: b64(new Int16Array(vp)), col: b64(new Uint8Array(vc)), idx: b64(wide ? new Uint32Array(ix) : new Uint16Array(ix)), wide };
  if (name === 'static') out.static = piece; else out.parts[name] = piece;
}
const dark = (c) => Math.round(c * 0.38);
out.chunks = {};
for (const c of chunks) {
  const { tris, bb } = c;
  const pack = (tl, tint) => {
    const map = new Map(), vp = [], vc = [], ix = [];
    for (const t of tl) for (let q = 0; q < 3; q++) {
      const v = I[t + q];
      if (!map.has(v)) { map.set(v, vp.length / 3); vp.push(Math.round(P[v * 3] * SC), Math.round(P[v * 3 + 1] * SC), Math.round(P[v * 3 + 2] * SC)); vc.push(tint ? dark(C[v * 3]) : C[v * 3], tint ? dark(C[v * 3 + 1]) : C[v * 3 + 1], tint ? dark(C[v * 3 + 2]) : C[v * 3 + 2]); }
      ix.push(map.get(v));
    }
    const wide = vp.length / 3 >= 65536;
    return { nv: vp.length / 3, ni: ix.length, pos: b64(new Int16Array(vp)), col: b64(new Uint8Array(vc)), idx: b64(wide ? new Uint32Array(ix) : new Uint16Array(ix)), wide };
  };
  // the wreck: what stands in the lowest third of the piece, charred
  const cut = bb[1] + (bb[4] - bb[1]) * 0.33;
  const low = tris.filter((t) => (P[I[t] * 3 + 1] + P[I[t + 1] * 3 + 1] + P[I[t + 2] * 3 + 1]) / 3 < cut);
  const h = bb[4] - bb[1], w = Math.max(bb[3] - bb[0], bb[5] - bb[2]);
  const label = h < 1.4 ? 'Plateforme' : h > 4 && w < 3 ? 'Mât secondaire' : w > 6 ? 'Rouf' : 'Équipement';
  out.chunks[c.id] = { label, bb: bb.map((v) => Math.round(v * 100) / 100), piece: pack(tris, false), ruin: low.length ? pack(low, true) : null };
}
const head = `// The ${lay.id}'s hull and structure read on its reference model (see docs/CREDITS.md): its triangles simplified, the colour of its textures at every vertex, cut into the hull and the destroyable parts.\n// Generated by tools/refs/bake.py + bakeship.mjs; read by model/bakedship.js. Positions in 5 mm steps, game frame (x bow +, y over the waterline, z starboard).\nexport const SCALE = ${SC};\nexport const BAKED = `;
fs.writeFileSync(outFile, head + JSON.stringify(out) + ';\n');
console.error(`${outFile}: ${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB`);
