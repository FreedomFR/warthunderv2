// Reads a glTF given for MEASUREMENT ONLY (refs/<id>/src/scene.gltf, git-ignored; nothing of it goes into the repository) and prints what can be measured:
//   node tools/refs/gltf.mjs survey refs/tade/src        bounding box (length, beam, height), the nodes with their bounds, the materials
//   node tools/refs/gltf.mjs views  refs/tade/src out/tade   orthographic pictures from six sides on a white background (flat grey, shaded by the normal)
//   node tools/refs/gltf.mjs inside refs/tade/src refs/tade/hi/inside.png   the port half cut open along the centre line: the compartments and the machinery, if the model has them
//   node tools/refs/gltf.mjs plan refs/tade/src refs/tade --loa=86.8 --draft=2.6   side.png and top.png as flat silhouettes (the 'drawings' of tools/refs/plans.json, scaled so that the
//                                                    length is the spec's LOA) and the plans.json entry to paste
//   (cut: --zmax=1.8 keeps only what is within 1.8 m of the centre line: funnels, masts, central blocks)
//   node tools/refs/gltf.mjs tables refs/tade/src --loa=86.8 --draft=2.6 --B=8.5 --D=2.6   the hull tables of tools/tweaks.js: planWL, planDeck (fractions of B/2), fb (m above
//                                                    the waterline), keel (fraction of D), from exact cuts of the model every 1/32 of the length; --draft = the height of the
//                                                    waterline above the lowest point of the model, --B the spec's waterline beam, --D the spec's draft
//   node tools/refs/gltf.mjs sections refs/tade/src [step]   half-beam and top of the hull every `step` metres along the length
// The ship is put upright with the bow towards +x: x along the length (bow positive), y up (0 = the lowest point of the keel), z to starboard.
// `--bow=-1` flips the bow if the longest axis points the wrong way, `--up=x|y|z` overrides the vertical axis (y by default).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const COMP = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5120: Int8Array, 5122: Int16Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function nodeMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
}

/**
 * A Wavefront OBJ (some of the models given for measurement come that way: refs/<id>/src/<name>.obj, y up like the glTF ones) read into the same parts: one part per group (`g`) and
 * material, named after its object (`o`) and group, with its own vertex list. `g` carries the names of the materials so that `survey` works.
 */
export function loadObj(file) {
  const text = fs.readFileSync(file, 'latin1');
  const X = [], Yv = [], Zv = [], VT = [];
  const parts = [], mats = [];
  let mtllib = null;
  let obj = '', grp = '', mat = -1, cur = null;
  const open = () => { cur = { name: grp || obj, path: obj && grp && grp !== obj ? `${obj}/${grp}` : grp || obj, node: parts.length, mat, map: new Map(), P: [], UV: [], idx: [] }; parts.push(cur); };
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    const c0 = text.charCodeAt(pos), c1 = text.charCodeAt(pos + 1);
    if (c0 === 118 && c1 === 32) {                                              // v x y z
      const t = text.slice(pos + 2, end).trim().split(/\s+/); X.push(+t[0]); Yv.push(+t[1]); Zv.push(+t[2]);
    } else if (c0 === 118 && c1 === 116) {                                      // vt u v
      const t = text.slice(pos + 3, end).trim().split(/\s+/); VT.push(+t[0], +t[1]);
    } else if (c0 === 102 && c1 === 32) {                                       // f a b c ... (v, v/vt, v/vt/vn, negative indices)
      if (!cur) open();
      const t = text.slice(pos + 2, end).trim().split(/\s+/).map((q) => { const f = q.split('/'); let i = parseInt(f[0], 10), ti = f[1] ? parseInt(f[1], 10) : 0; if (i < 0) i = X.length + i + 1; if (ti < 0) ti = VT.length / 2 + ti + 1; return [i - 1, ti - 1]; });
      const loc = t.map(([vi, ti]) => { const key = vi * 4194304 + (ti + 1); let l = cur.map.get(key); if (l === undefined) { l = cur.P.length / 3; cur.map.set(key, l); cur.P.push(X[vi], Yv[vi], Zv[vi]); cur.UV.push(ti >= 0 ? VT[ti * 2] : 0, ti >= 0 ? VT[ti * 2 + 1] : 0); } return l; });
      for (let k = 1; k + 1 < loc.length; k++) cur.idx.push(loc[0], loc[k], loc[k + 1]);
    } else if (c0 === 111 && c1 === 32) { obj = text.slice(pos + 2, end).trim(); grp = ''; cur = null; }
    else if (c0 === 103 && c1 === 32) { grp = text.slice(pos + 2, end).trim(); cur = null; }
    else if (text.startsWith('mtllib ', pos)) mtllib = text.slice(pos + 7, end).trim();
    else if (text.startsWith('usemtl ', pos)) { const m = text.slice(pos + 7, end).trim(); let i = mats.indexOf(m); if (i < 0) { i = mats.length; mats.push(m); } mat = i; cur = null; }
    pos = end + 1;
  }
  const out = parts.filter((p) => p.idx.length).map((p) => ({ name: p.name, path: p.path, node: p.node, mat: p.mat, V: Float32Array.from(p.P), idx: Uint32Array.from(p.idx), UV: Float32Array.from(p.UV) }));
  // the materials: the diffuse map and the factor of the .mtl next to the .obj
  const info = new Map();
  const mtlFile = mtllib && path.join(path.dirname(file), mtllib);
  if (mtlFile && fs.existsSync(mtlFile)) {
    let cm = null;
    for (const ln of fs.readFileSync(mtlFile, 'latin1').split(/\r?\n/)) {
      const t = ln.trim().split(/\s+/);
      if (t[0] === 'newmtl') { cm = { diffuse: null, factor: [1, 1, 1, 1] }; info.set(t.slice(1).join(' '), cm); }
      else if (cm && t[0] === 'Kd') cm.factor = [+t[1], +t[2], +t[3], 1];
      else if (cm && t[0] === 'map_Kd') cm.diffuse = t.slice(1).join(' ');
    }
  }
  return { g: { materials: mats.map((name) => ({ name, objDiffuse: info.get(name)?.diffuse || null, objFactor: info.get(name)?.factor || [1, 1, 1, 1] })), nodes: [], meshes: [] }, parts: out };
}

/** Loads the glTF in `dir` into world-space triangles: parts = [{ name, node, mat, V: Float32Array (x,y,z...), idx, bb }]. */
export function load(dir) {
  const obj = fs.existsSync(path.join(dir, 'scene.gltf')) ? null : fs.readdirSync(dir).find((f) => /\.obj$/i.test(f));
  if (obj) return loadObj(path.join(dir, obj));
  const g = JSON.parse(fs.readFileSync(path.join(dir, 'scene.gltf'), 'utf8'));
  const bin = fs.readFileSync(path.join(dir, g.buffers[0].uri || 'scene.bin'));
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const acc = (i) => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView], C = COMP[a.componentType], n = NC[a.type];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * C.BYTES_PER_ELEMENT;
    const out = new (C === Float32Array ? Float32Array : Uint32Array)(a.count * n);
    const get = { 5126: 'getFloat32', 5123: 'getUint16', 5125: 'getUint32', 5121: 'getUint8', 5120: 'getInt8', 5122: 'getInt16' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get](off + k * stride + c * C.BYTES_PER_ELEMENT, true);
    return out;
  };
  const parts = [], names = new Map();
  const walk = (ni, M, path) => {
    const n = g.nodes[ni], W = mul(M, nodeMatrix(n)), p = path ? `${path}/${n.name || ni}` : n.name || String(ni);
    if (n.mesh != null) {
      for (const pr of g.meshes[n.mesh].primitives) {
        if (pr.mode != null && pr.mode !== 4) continue;
        const P = acc(pr.attributes.POSITION), I = pr.indices != null ? acc(pr.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
        const V = new Float32Array(P.length);
        for (let i = 0; i < P.length; i += 3) {
          const x = P[i], y = P[i + 1], z = P[i + 2];
          V[i] = W[0] * x + W[4] * y + W[8] * z + W[12]; V[i + 1] = W[1] * x + W[5] * y + W[9] * z + W[13]; V[i + 2] = W[2] * x + W[6] * y + W[10] * z + W[14];
        }
        const UV = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null;
        parts.push({ name: n.name || g.meshes[n.mesh].name || String(ni), path: p, node: ni, mat: pr.material, V, idx: I, UV });
      }
    }
    for (const c of n.children || []) walk(c, W, p);
  };
  const scene = g.scenes[g.scene || 0];
  for (const r of scene.nodes) walk(r, ident(), '');
  return { g, parts };
}

/** Puts the ship upright (bow +x, y up from the keel, z starboard, x origin at the middle) and returns { parts, L, B, H, x0 }. */
export function upright(model, opts = {}) {
  const { parts } = model;
  const bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
  for (const p of parts) for (let i = 0; i < p.V.length; i += 3) for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], p.V[i + k]); bb[1][k] = Math.max(bb[1][k], p.V[i + k]); }
  const ext = [0, 1, 2].map((k) => bb[1][k] - bb[0][k]);
  const lenAx = ext.indexOf(Math.max(...ext));
  const others = [0, 1, 2].filter((k) => k !== lenAx);
  const upAx = opts.up ? 'xyz'.indexOf(opts.up) : 1;                          // glTF is y-up once the node transforms are applied
  const beamAx = [0, 1, 2].find((k) => k !== lenAx && k !== upAx);
  // the bow is where the hull is narrower near the end: compare the beam in the first and the last tenth of the length
  const beamAt = (lo, hi) => { let a = 1e9, b = -1e9; for (const p of parts) for (let i = 0; i < p.V.length; i += 3) { const t = (p.V[i + lenAx] - bb[0][lenAx]) / ext[lenAx]; if (t >= lo && t <= hi) { a = Math.min(a, p.V[i + beamAx]); b = Math.max(b, p.V[i + beamAx]); } } return b - a; };
  const sgn = opts.bow ?? (beamAt(0, 0.08) < beamAt(0.92, 1) ? -1 : 1);       // the narrower end is the bow; sgn = +1 when the bow is at the high end of the length axis
  // handedness: x forward, y up, z starboard (right-handed would give z to port, so the beam axis is signed to keep x × y = -z as in the game)
  const cx = (bb[0][lenAx] + bb[1][lenAx]) / 2, cz = (bb[0][beamAx] + bb[1][beamAx]) / 2;
  // which sign of the beam axis is starboard: the game has +z starboard with x forward and y up, i.e. a left-handed frame; keep the orientation of the source (x fwd, y up) and take z so that (x, y, z) is left-handed
  const src = [0, 0, 0]; src[lenAx] = sgn; const up = [0, 0, 0]; up[upAx] = 1;
  const cr = [src[1] * up[2] - src[2] * up[1], src[2] * up[0] - src[0] * up[2], src[0] * up[1] - src[1] * up[0]];     // forward x up (right-handed: points to port)
  const sz = -cr[beamAx] * (opts.mirror ? -1 : 1);                                                                 // starboard = -port (`--mirror=1`: a model exported mirrored, the island on the wrong side)
  for (const p of parts) {
    const V = new Float32Array(p.V.length);
    for (let i = 0; i < V.length; i += 3) { V[i] = (p.V[i + lenAx] - cx) * sgn; V[i + 1] = p.V[i + upAx] - bb[0][upAx]; V[i + 2] = (p.V[i + beamAx] - cz) * (sz || 1); }
    p.V = V;
  }
  const out = { parts, L: ext[lenAx], B: ext[beamAx], H: ext[upAx], axes: { lenAx, upAx, beamAx, sgn } };
  out.bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
  for (const p of parts) { p.bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]; for (let i = 0; i < p.V.length; i += 3) for (let k = 0; k < 3; k++) { p.bb[0][k] = Math.min(p.bb[0][k], p.V[i + k]); p.bb[1][k] = Math.max(p.bb[1][k], p.V[i + k]); out.bb[0][k] = Math.min(out.bb[0][k], p.V[i + k]); out.bb[1][k] = Math.max(out.bb[1][k], p.V[i + k]); } }
  return out;
}

// ---- pictures ----
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Orthographic z-buffer render. view: { h, v, d } = the model axes that go right, up and towards the viewer (signs: 'x' or '-x'). */
export function render(m, view, s, opts = {}) {
  const ax = (a) => ({ i: 'xyz'.indexOf(a.replace('-', '')), k: a.startsWith('-') ? -1 : 1 });
  const H = ax(view.h), Vv = ax(view.v), D = ax(view.d);
  const lo = [1e9, 1e9], hi = [-1e9, -1e9];
  for (const p of m.parts) for (let i = 0; i < p.V.length; i += 3) { const a = p.V[i + H.i] * H.k, b = p.V[i + Vv.i] * Vv.k; lo[0] = Math.min(lo[0], a); hi[0] = Math.max(hi[0], a); lo[1] = Math.min(lo[1], b); hi[1] = Math.max(hi[1], b); }
  // opts.window = [h0, h1, v0, v1] (metres in the view): only that part of the view is drawn (no padding)
  if (opts.window) { lo[0] = opts.window[0]; hi[0] = opts.window[1]; lo[1] = opts.window[2]; hi[1] = opts.window[3]; }
  const pad = opts.window ? 0 : 2, W = Math.ceil((hi[0] - lo[0] + 2 * pad) * s), HH = Math.ceil((hi[1] - lo[1] + 2 * pad) * s);
  const zb = new Float32Array(W * HH).fill(-1e9), img = Buffer.alloc(W * HH * 3, 255);
  const Ld = [0.4, 0.75, 0.5]; const ll = Math.hypot(...Ld);
  const sel = opts.xmin != null ? (p) => p.bb[1][0] >= opts.xmin : () => true;
  for (const p of m.parts) {
    if (!sel(p)) continue;
    const tint = opts.tint ? opts.tint(p) : null;
    for (let t = 0; t < p.idx.length; t += 3) {
      const tri = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o], p.V[o + 1], p.V[o + 2]]; });
      const e1 = tri[1].map((v, k) => v - tri[0][k]), e2 = tri[2].map((v, k) => v - tri[0][k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const nl = Math.hypot(...n) || 1;
      const dn = Math.abs(n[D.i] / nl);                                              // facing the viewer
      const lam = Math.abs((n[0] * Ld[0] + n[1] * Ld[1] + n[2] * Ld[2]) / nl / ll);
      const g = Math.round(70 + 150 * (0.35 * dn + 0.65 * lam));
      const col = tint || [g, g, g + 6];
      const P = tri.map((v) => [(v[H.i] * H.k - lo[0] + pad) * s, (hi[1] - v[Vv.i] * Vv.k + pad) * s, v[D.i] * D.k]);
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(HH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const a = ((P[1][1] - P[2][1]) * (px - P[2][0]) + (P[2][0] - P[1][0]) * (py - P[2][1])) / den;
        const b = ((P[2][1] - P[0][1]) * (px - P[2][0]) + (P[0][0] - P[2][0]) * (py - P[2][1])) / den;
        const c = 1 - a - b;
        if (a < -0.001 || b < -0.001 || c < -0.001) continue;
        const z = a * P[0][2] + b * P[1][2] + c * P[2][2];
        const o = y * W + x;
        if (z > zb[o]) { zb[o] = z; img[o * 3] = col[0]; img[o * 3 + 1] = col[1]; img[o * 3 + 2] = col[2]; }
      }
    }
  }
  return { img, W, H: HH, lo, hi, s, pad };
}

/** A copy of the model turned for an oblique orthographic view: az = where the camera stands (deg, 180 = starboard beam, 90 = ahead, as in the game's preview), el = its height angle. */
export function turned(m, az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180;
  // camera offset direction in the game's frame: (sin az cos el, sin el, -cos az cos el) with x east / z south and the bow towards +x (heading 90): the model's x is the bow, z starboard
  // so the camera sits at model (cx, cy, cz) = (sin az ... ) mapped: ahead (az 90) is +x, starboard beam (az 180) is +z
  const cx = Math.sin(a) * Math.cos(e), cz = -Math.cos(a) * Math.cos(e), cy = Math.sin(e);
  // the view frame: d = towards the camera, h = right, v = up
  const d = [cx, cy, cz], up0 = [0, 1, 0];
  let h = [up0[1] * d[2] - up0[2] * d[1], up0[2] * d[0] - up0[0] * d[2], up0[0] * d[1] - up0[1] * d[0]]; const hl = Math.hypot(...h); h = h.map((x) => x / hl);
  const v = [d[1] * h[2] - d[2] * h[1], d[2] * h[0] - d[0] * h[2], d[0] * h[1] - d[1] * h[0]];
  // h must point to the viewer's right: for a camera on the starboard side looking at the ship the bow is on the right
  const parts = m.parts.map((p) => { const V = new Float32Array(p.V.length); for (let i = 0; i < V.length; i += 3) { const x = p.V[i], y = p.V[i + 1], z = p.V[i + 2]; V[i] = x * h[0] + y * h[1] + z * h[2]; V[i + 1] = x * v[0] + y * v[1] + z * v[2]; V[i + 2] = x * d[0] + y * d[1] + z * d[2]; } return { ...p, V, bb: [[0, 0, 0], [0, 0, 0]] }; });
  return { ...m, parts, basis: { h, v, d } };
}

const VIEWS = {
  side_starboard: { h: 'x', v: 'y', d: 'z' },
  side_port: { h: '-x', v: 'y', d: '-z' },
  top: { h: 'x', v: '-z', d: 'y' },
  bow: { h: 'z', v: 'y', d: 'x' },
  stern: { h: '-z', v: 'y', d: '-x' },
  bottom: { h: 'x', v: 'z', d: '-y' },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const [cmd, dir, arg] = args;
  const model = load(dir);
  const m = upright(model, { bow: flags.bow ? +flags.bow : undefined, up: flags.up, mirror: !!+(flags.mirror || 0) });
  if (flags.loa) {                                   // the reference scaled to the spec's length (the models are game assets, a few percent off the published figures)
    const k = +flags.loa / m.L;
    for (const p of m.parts) { for (let i = 0; i < p.V.length; i++) p.V[i] *= k; for (const b of p.bb) for (let i = 0; i < 3; i++) b[i] *= k; }
    for (const b of m.bb) for (let i = 0; i < 3; i++) b[i] *= k;
    m.L *= k; m.B *= k; m.H *= k;
  }
  if (cmd === 'survey') {
    const tris = m.parts.reduce((a, p) => a + p.idx.length / 3, 0);
    console.log(`length ${m.L.toFixed(2)} m, beam ${m.B.toFixed(2)} m, height ${m.H.toFixed(2)} m (axes ${JSON.stringify(m.axes)}), ${m.parts.length} primitives, ${tris} triangles`);
    console.log('materials:', (model.g.materials || []).map((x, i) => `${i}:${x.name}`).join(' | '));
    const rows = m.parts.map((p) => `${p.path.padEnd(60).slice(0, 60)} mat ${String(p.mat).padStart(3)} tris ${String(p.idx.length / 3).padStart(6)}  x ${p.bb[0][0].toFixed(1)}..${p.bb[1][0].toFixed(1)}  y ${p.bb[0][1].toFixed(1)}..${p.bb[1][1].toFixed(1)}  z ${p.bb[0][2].toFixed(1)}..${p.bb[1][2].toFixed(1)}`);
    console.log(rows.join('\n'));
  } else if (cmd === 'views') {
    fs.mkdirSync(arg, { recursive: true });
    const s = +(flags.s || 8);
    for (const [name, v] of Object.entries(VIEWS)) { const r = render(m, v, name === 'top' || name.startsWith('side') ? s : s * 1.6); fs.writeFileSync(path.join(arg, `${name}.png`), png(r.W, r.H, r.img)); console.log(name, r.W, 'x', r.H); }
  } else if (cmd === 'inside') {
    // the port half only (z <= 0), seen from starboard: what the model holds inside the hull (compartments, boilers, engines, shafts, magazines), same framing as `views` (gridview.py reads it)
    for (const p of m.parts) { const keep = []; for (let t = 0; t < p.idx.length; t += 3) { const zs = [0, 1, 2].map((q) => p.V[p.idx[t + q] * 3 + 2]); if (Math.max(...zs) <= 0.05) keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]); } p.idx = Uint32Array.from(keep); }
    const r = render(m, VIEWS.side_starboard, +(flags.s || 12));
    fs.mkdirSync(path.dirname(arg), { recursive: true }); fs.writeFileSync(arg, png(r.W, r.H, r.img)); console.log('wrote', arg, r.W, 'x', r.H);
  } else if (cmd === 'crop') {
    // an oblique orthographic window on the reference, to put next to the same window of the game (tools/refs/pair.sh): --az --el (the game's preview angles), the window's centre
    // --cx --cy --cz (model metres: x along the length, y above the WATERLINE (--draft), z to starboard), its size --w --h (m) and the scale --s (px/m)
    const az = +(flags.az ?? 180), el = +(flags.el ?? 8), wl = +(flags.draft || 0);
    const t = turned(m, az, el), b = t.basis;
    const c = [+(flags.cx || 0), +(flags.cy || 0) + wl, +(flags.cz || 0)];
    const ch = c[0] * b.h[0] + c[1] * b.h[1] + c[2] * b.h[2], cv = c[0] * b.v[0] + c[1] * b.v[1] + c[2] * b.v[2];
    const w = +(flags.w || 30), h = +(flags.h || 20);
    const r = render(t, { h: 'x', v: 'y', d: 'z' }, +(flags.s || 30), { window: [ch - w / 2, ch + w / 2, cv - h / 2, cv + h / 2] });
    fs.mkdirSync(path.dirname(arg), { recursive: true }); fs.writeFileSync(arg, png(r.W, r.H, r.img)); console.log('wrote', arg, r.W, 'x', r.H);
  } else if (cmd === 'slice') {
    // the plan outline of everything at height --y (m above the waterline, --draft) as lines (where the plane cuts the triangles), over the window --x0 --x1 (model m, bow +) and half-width --hz,
    // with a ruler: dark ticks every metre on the edges, lines every 5 m; several heights at once: --y=2,3.5,5 writes arg_<y>.png
    const wl = +(flags.draft || 0), x0 = +flags.x0, x1 = +flags.x1, hz = +(flags.hz || 6), S = +(flags.s || 40);
    const tris = []; for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) { const T = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o], p.V[o + 1], p.V[o + 2]]; }); if (Math.max(T[0][0], T[1][0], T[2][0]) < x0 || Math.min(T[0][0], T[1][0], T[2][0]) > x1) continue; tris.push(T); }
    for (const yy of String(flags.y).split(',').map(Number)) {
      const W = Math.round((x1 - x0) * S), H = Math.round(2 * hz * S), img = Buffer.alloc(W * H * 3, 255);
      const put = (x, z, c) => { const px = Math.round((x - x0) * S), py = Math.round((hz - z) * S); if (px >= 0 && px < W && py >= 0 && py < H) { const o = (py * W + px) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } };
      for (let x = Math.ceil(x0); x <= x1; x++) for (let z = -hz; z <= hz; z += 1 / S * 2) if (x % 5 === 0 || Math.abs(z - Math.round(z)) < 1 / S) put(x, z, x % 5 === 0 ? [255, 190, 190] : [225, 235, 255]);
      for (let z = -Math.floor(hz); z <= hz; z++) for (let x = x0; x <= x1; x += 1 / S * 2) put(x, z, z === 0 ? [255, 190, 190] : [225, 235, 255]);
      for (const T of tris) {
        const d = T.map((v) => v[1] - (yy + wl)); if (d[0] > 0 && d[1] > 0 && d[2] > 0 || d[0] < 0 && d[1] < 0 && d[2] < 0) continue;
        const pts = []; for (let e = 0; e < 3; e++) { const a = T[e], b2 = T[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3]; if ((da < 0) !== (db < 0)) { const k = da / (da - db); pts.push([a[0] + (b2[0] - a[0]) * k, a[2] + (b2[2] - a[2]) * k]); } }
        if (pts.length === 2) { const n = Math.ceil(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * S) + 1; for (let i = 0; i <= n; i++) put(pts[0][0] + (pts[1][0] - pts[0][0]) * i / n, pts[0][1] + (pts[1][1] - pts[0][1]) * i / n, [20, 20, 20]); }
      }
      const f = String(flags.y).includes(',') ? arg.replace(/\.png$/, `_${yy}.png`) : arg; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, png(W, H, img)); console.log('wrote', f, W, 'x', H);
    }
  } else if (cmd === 'outline') {
    // the closed outlines (chains of the cut segments) at height --y (m above the waterline) inside the window --x0 --x1 --z0 --z1, simplified to --tol (m, default 0.12), longest first, as
    // [x, z] points (model metres): a MEASUREMENT of the plan of a block, to be redrawn by hand with a few points (never pasted whole into the models)
    const wl = +(flags.draft || 0), yy = +flags.y + wl, tol = +(flags.tol || 0.12), x0 = +flags.x0, x1 = +flags.x1, z0 = +(flags.z0 ?? -99), z1 = +(flags.z1 ?? 99), minl = +(flags.minlen || 1.5);
    const segs = [];
    for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) {
      const T = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o], p.V[o + 1], p.V[o + 2]]; });
      const d = T.map((v) => v[1] - yy); if (d[0] > 0 && d[1] > 0 && d[2] > 0 || d[0] < 0 && d[1] < 0 && d[2] < 0) continue;
      const pts = []; for (let e = 0; e < 3; e++) { const a = T[e], b2 = T[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3]; if ((da < 0) !== (db < 0)) { const k = da / (da - db); pts.push([a[0] + (b2[0] - a[0]) * k, a[2] + (b2[2] - a[2]) * k]); } }
      if (pts.length === 2 && pts[0][0] >= x0 - 1 && pts[0][0] <= x1 + 1) segs.push(pts);
    }
    // chain the segments by their end points (rounded to 2 cm)
    const key = (q) => `${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`, ends = new Map();
    segs.forEach((sg, i) => { for (const q of sg) { const k = key(q); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const used = new Array(segs.length).fill(false), chains = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue; used[i] = true; let chain = [segs[i][0], segs[i][1]];
      for (let dir = 0; dir < 2; dir++) {
        for (;;) {
          const tail = chain[chain.length - 1], nx = (ends.get(key(tail)) || []).find((j) => !used[j]);
          if (nx === undefined) break; used[nx] = true; const sg = segs[nx]; chain.push(key(sg[0]) === key(tail) ? sg[1] : sg[0]);
        }
        chain.reverse();
      }
      chains.push(chain);
    }
    const dp = (pts, e) => { if (pts.length < 3) return pts; let dmax = 0, im = 0; const [a, b2] = [pts[0], pts[pts.length - 1]], L2 = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1e-9;
      for (let i = 1; i < pts.length - 1; i++) { const d2 = Math.abs((b2[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b2[1] - a[1])) / L2; if (d2 > dmax) { dmax = d2; im = i; } }
      return dmax > e ? [...dp(pts.slice(0, im + 1), e).slice(0, -1), ...dp(pts.slice(im), e)] : [a, b2]; };
    const simp = (c, e) => { const closed = Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]) < 0.05; if (!closed) return dp(c, e); let k = 0, dm = 0; c.forEach((q, i) => { const d2 = Math.hypot(q[0] - c[0][0], q[1] - c[0][1]); if (d2 > dm) { dm = d2; k = i; } }); return [...dp(c.slice(0, k + 1), e).slice(0, -1), ...dp(c.slice(k), e)]; };
    const out = chains.map((c) => { let len = 0; for (let i = 1; i < c.length; i++) len += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]); const xs = c.map((q) => q[0]), zs = c.map((q) => q[1]); return { c, len, bb: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] }; })
      .filter((o) => o.len >= minl && o.bb[0] >= x0 && o.bb[1] <= x1 + 2 && o.bb[2] >= z0 && o.bb[3] <= z1).sort((a, b2) => (flags.sortx ? a.bb[0] - b2.bb[0] : b2.len - a.len));
    for (const o of out.slice(0, +(flags.n || 8))) console.log(`len ${o.len.toFixed(1)} m  x ${o.bb[0].toFixed(2)}..${o.bb[1].toFixed(2)}  z ${o.bb[2].toFixed(2)}..${o.bb[3].toFixed(2)}  ${simp(o.c, tol).map((q) => `[${q[0].toFixed(2)},${q[1].toFixed(2)}]`).join('')}`);
  } else if (cmd === 'quarters') {
    // the oblique views the studio takes of the game's model (tools/refs/studio.mjs), as orthographic pictures of the reference, to compare them side by side
    fs.mkdirSync(arg, { recursive: true });
    const s = +(flags.s || 8);
    for (const [name, [az, el]] of Object.entries({ bow_starboard: [135, 20], bow_port: [45, 20], stern_starboard: [225, 20], stern_port: [315, 20], bow: [90, 8], stern: [270, 8] })) {
      const t = turned(m, az, el), r = render(t, { h: 'x', v: 'y', d: 'z' }, s);
      fs.writeFileSync(path.join(arg, `${name}.png`), png(r.W, r.H, r.img)); console.log(name, r.W, 'x', r.H);
    }
  } else if (cmd === 'plan') {
    const k = 1, draft = +(flags.draft || 0)   /* depth of the waterline above the lowest point of the model */, S = +(flags.s || 12);
    const id = path.basename(arg), flat = () => [0, 0, 0];
    fs.mkdirSync(arg, { recursive: true });
    const out = {};
    for (const [name, v] of [['side', VIEWS.side_starboard], ['top', VIEWS.top]]) {
      const r = render(m, v, S, { tint: flat });
      fs.writeFileSync(path.join(arg, `${name}.png`), png(r.W, r.H, r.img));
      const stern = Math.round(r.pad * S), bow = Math.round((r.hi[0] - r.lo[0] + r.pad) * S);
      out[name] = { file: `refs/${id}/${name}.png`, source: `matte ${name} view of the reference model (${flags.credit || 'see docs/CREDITS.md'}), rendered by tools/refs/gltf.mjs, kept out of the repository`, crop: [0, 0, r.W, r.H], stern, bow, close: 3, tol: name === 'side' ? 0.3 : 0.2 };
      if (name === 'side') out.side.wl = Math.round((r.hi[1] - draft + r.pad) * S); else out.top.cl = Math.round((r.hi[1] + r.pad) * S);
    }
    out.loa = +(m.L * k).toFixed(2);
    console.log(JSON.stringify({ [id]: out }, null, 1));
  } else if (cmd === 'profile') {
    // along the length every `step` m: the highest point of the model (and of what is within 0.8 m of the centre line: the masts), and the half-beam at the heights given by --at=1,3,5 (m above the lowest point)
    const step = +(arg || 2), at = (flags.at || '').split(',').filter(Boolean).map(Number);
    console.log(`x(m)   top   topCL  ${at.map((a) => `hw@${a}`).join(' ')}`);
    for (let x = Math.ceil(m.bb[0][0]); x <= m.bb[1][0]; x += step) {
      let top = 0, topC = 0; const hw = at.map(() => 0);
      for (const p of m.parts) for (let i = 0; i < p.V.length; i += 3) if (Math.abs(p.V[i] - x) < step / 2) {
        const y = p.V[i + 1], z = Math.abs(p.V[i + 2]);
        top = Math.max(top, y); if (z < 0.8) topC = Math.max(topC, y);
        at.forEach((a, j) => { if (Math.abs(y - a) < 0.35) hw[j] = Math.max(hw[j], z); });
      }
      console.log(`${x.toFixed(0).padStart(5)} ${top.toFixed(1).padStart(6)} ${topC.toFixed(1).padStart(6)}  ${hw.map((h) => h.toFixed(2).padStart(5)).join(' ')}`);
    }
  } else if (cmd === 'cut') {
    // exact cuts through the triangles: --y=h1,h2 the half-beam at those heights above the lowest point (a waterplane, the deck edge), --z=c the highest point of the hull
    // at c m from the centre line (the sheer line), --x=a,b,c the section at those stations: half-beam at heights 0..H every 0.5 m. Every `arg` m along the length.
    const step = +(arg || 2), hs = (flags.y || '').split(',').filter(Boolean).map(Number), cz = flags.z != null ? +flags.z : null, xs = (flags.x || '').split(',').filter(Boolean).map(Number);
    const tris = [];
    for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) { const o = [0, 1, 2].map((q) => p.idx[t + q] * 3); tris.push(o.map((i) => [p.V[i], p.V[i + 1], p.V[i + 2]])); }
    const cutPlane = (axis, c, fn) => { for (const T of tris) {
      const d = T.map((v) => v[axis] - c);
      if (d[0] > 0 && d[1] > 0 && d[2] > 0 || d[0] < 0 && d[1] < 0 && d[2] < 0) continue;
      for (let e = 0; e < 3; e++) { const a = T[e], b = T[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3]; if ((da < 0) !== (db < 0) || da === 0) { const t = da === db ? 0 : da / (da - db); fn([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } }
    } };
    const bins = (lo, hi) => Math.floor((hi - lo) / step) + 1;
    const x0 = Math.ceil(m.bb[0][0]);
    for (const h of hs) {
      const hw = new Array(bins(x0, m.bb[1][0])).fill(0);
      cutPlane(1, h, (q) => { const k = Math.round((q[0] - x0) / step); if (k >= 0 && k < hw.length && (flags.zmax == null || Math.abs(q[2]) <= +flags.zmax)) hw[k] = Math.max(hw[k], Math.abs(q[2])); });
      if (flags.intervals) {
        // contiguous stretches of the length where something exists at this height (f from the bow, half-beam max): the footprints of the blocks, level by level
        const L = m.bb[1][0] - m.bb[0][0], out = []; let a = null, mx = 0;
        hw.forEach((v, k) => { if (v > +flags.intervals) { if (a === null) { a = k; mx = 0; } mx = Math.max(mx, v); } else if (a !== null) { out.push([a, k - 1, mx]); a = null; } });
        if (a !== null) out.push([a, hw.length - 1, mx]);
        console.log(`y=${h}: ` + out.map(([i, j, w]) => `f ${((m.bb[1][0] - (x0 + j * step)) / L).toFixed(3)}-${((m.bb[1][0] - (x0 + i * step)) / L).toFixed(3)} hw ${w.toFixed(1)}`).join(' | '));
      } else
      console.log(`half-beam at y=${h}: ` + hw.map((v, k) => `${x0 + k * step}:${v.toFixed(2)}`).join(' '));
    }
    if (cz != null) {
      const top = new Array(bins(x0, m.bb[1][0])).fill(0);
      for (const sg of [1, -1]) cutPlane(2, sg * cz, (q) => { const k = Math.round((q[0] - x0) / step); if (k >= 0 && k < top.length && q[1] < (+flags.ymax || 1e9)) top[k] = Math.max(top[k], q[1]); });
      console.log(`highest point at |z|=${cz} (below ${flags.ymax || 'any'}): ` + top.map((v, k) => `${x0 + k * step}:${v.toFixed(2)}`).join(' '));
    }
    for (const x of xs) {
      const rows = []; const H = m.bb[1][1];
      for (let h = 0; h <= Math.min(H, +(flags.hmax || 14)); h += 0.5) { let hw = 0; cutPlane(1, h, (q) => { if (Math.abs(q[0] - x) < step / 2) hw = Math.max(hw, Math.abs(q[2])); }); rows.push(`${h}:${hw.toFixed(2)}`); }
      console.log(`section x=${x}: ` + rows.join(' '));
    }
  } else if (cmd === 'tables') {
    const WL = +flags.draft, B = +flags.B, D = +flags.D, N = +(flags.n || 32);
    const tris = [];
    for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) { const o = [0, 1, 2].map((q) => p.idx[t + q] * 3); tris.push(o.map((i) => [p.V[i], p.V[i + 1], p.V[i + 2]])); }
    const section = (x) => { const seg = []; for (const T of tris) {
      const d = T.map((v) => v[0] - x);
      if (d[0] > 0 && d[1] > 0 && d[2] > 0 || d[0] < 0 && d[1] < 0 && d[2] < 0) continue;
      const pts = []; for (let e = 0; e < 3; e++) { const a = T[e], b = T[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3]; if ((da < 0) !== (db < 0)) { const t = da / (da - db); pts.push([a[2] + (b[2] - a[2]) * t, a[1] + (b[1] - a[1]) * t]); } }
      if (pts.length === 2) seg.push(pts);
    } return seg; };
    // half-beam at height h: the widest crossing of the section with that level (the segments are interpolated, not just their ends)
    const hwAt = (seg, h) => { let w = 0; for (const [a, b] of seg) if ((a[1] - h) * (b[1] - h) <= 0 && a[1] !== b[1]) { const t = (h - a[1]) / (b[1] - a[1]); w = Math.max(w, Math.abs(a[0] + (b[0] - a[0]) * t)); } return w; };
    const bow = m.bb[1][0], Lm = m.bb[1][0] - m.bb[0][0], WLt = [], DKt = [], FBt = [], KLt = [];
    for (let k = 0; k <= N; k++) {
      const f = k / N, x = bow - f * Lm + (k === 0 ? -0.08 : k === N ? 0.08 : 0);
      const seg = section(x);
      if (!seg.length) { WLt.push([f, 0]); DKt.push([f, 0]); FBt.push([f, 0]); KLt.push([f, 0]); continue; }
      const hwWL = hwAt(seg, WL);
      // the deck edge: the highest level up to which the section stays as wide as the waterline (the superstructure is narrower: the hull ends where the width drops)
      let g0 = WL, hwDk = hwWL;
      for (let h = WL + 0.1, miss = 0; h < WL + 20; h += 0.1) { const w = hwAt(seg, h); if (w < 0.88 * hwWL && w < 0.88 * hwDk) { if (++miss >= 6) break; continue; } miss = 0; g0 = h; hwDk = Math.max(hwDk, w); }       // (a gap of up to 0.5 m in the mesh does not end the hull)
      const keel = Math.min(...seg.flat().filter((q) => Math.abs(q[0]) < 1.2).map((q) => q[1]), WL);
      WLt.push([f, +(hwWL / (B / 2)).toFixed(3)]); DKt.push([f, +(hwDk / (B / 2)).toFixed(3)]); FBt.push([f, +(g0 - WL).toFixed(2)]); KLt.push([f, +((WL - keel) / D).toFixed(2)]);
    }
    // clean-up: a freeboard that is not one (a mast or a jackstaff at the ends) takes its neighbour's value, and a 3-point median takes out the single stations where a bridge wing or a gun sponson fooled the cut
    const med3 = (a, i) => { const v = [a[Math.max(0, i - 1)][1], a[i][1], a[Math.min(a.length - 1, i + 1)][1]].sort((p, q) => p - q); return v[1]; };
    for (let i = 0; i < FBt.length; i++) if (FBt[i][1] > 12) FBt[i][1] = FBt[i === 0 ? 1 : i - 1][1];
    for (let i = FBt.length - 1; i >= 0; i--) if (FBt[i][1] > 12) FBt[i][1] = FBt[Math.min(FBt.length - 1, i + 1)][1];
    for (const a of [FBt, DKt, WLt]) { const c = a.map((q) => [...q]); for (let i = 1; i < a.length - 1; i++) a[i][1] = +med3(c, i).toFixed(3); }
    const fmt = (a) => '[' + a.map(([f, v]) => `[${+f.toFixed(3)}, ${v}]`).join(', ') + ']';
    console.log(`fb: ${fmt(FBt)},\nplanDeck: ${fmt(DKt)},\nplanWL: ${fmt(WLt)},\nkeel: ${fmt(KLt)},`);
  } else if (cmd === 'heightmap') {
    // the top of the model seen from above, as characters: height above the waterline (--draft) in metres, 0-9 then a-z for 10-35 (one character per cell); bow to the right,
    // starboard at the bottom. Rows are z (m), columns x. --cell=1 (m)
    const cell = +(flags.cell || 1), WL = +flags.draft, x0 = Math.floor(m.bb[0][0]), nx = Math.ceil((m.bb[1][0] - x0) / cell) + 1, zr = Math.ceil(Math.max(-m.bb[0][2], m.bb[1][2]) / cell), nz = 2 * zr + 1;
    const hm = Array.from({ length: nz }, () => new Float32Array(nx).fill(-99));
    for (const p of m.parts) for (let t = 0; t < p.idx.length; t += 3) {
      const T = [0, 1, 2].map((q) => { const o = p.idx[t + q] * 3; return [p.V[o], p.V[o + 1], p.V[o + 2]]; });
      const xa = Math.min(T[0][0], T[1][0], T[2][0]), xb = Math.max(T[0][0], T[1][0], T[2][0]), za = Math.min(T[0][2], T[1][2], T[2][2]), zb = Math.max(T[0][2], T[1][2], T[2][2]);
      const den = (T[1][2] - T[2][2]) * (T[0][0] - T[2][0]) + (T[2][0] - T[1][0]) * (T[0][2] - T[2][2]);
      if (Math.abs(den) < 1e-12) continue;
      for (let i = Math.floor((xa - x0) / cell); i <= Math.floor((xb - x0) / cell); i++) for (let j = Math.floor((za + zr * cell) / cell); j <= Math.floor((zb + zr * cell) / cell); j++) {
        if (i < 0 || i >= nx || j < 0 || j >= nz) continue;
        // a few sample points in the cell; the height of the triangle there when the point is inside
        for (const [u, v] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
          const px = x0 + (i + u) * cell, pz = (j - zr + v) * cell;
          const a = ((T[1][2] - T[2][2]) * (px - T[2][0]) + (T[2][0] - T[1][0]) * (pz - T[2][2])) / den, b = ((T[2][2] - T[0][2]) * (px - T[2][0]) + (T[0][0] - T[2][0]) * (pz - T[2][2])) / den, c = 1 - a - b;
          if (a < 0 || b < 0 || c < 0) continue;
          const y = a * T[0][1] + b * T[1][1] + c * T[2][1];
          if (y > hm[j][i]) hm[j][i] = y;
        }
      }
    }
    const ch = (v) => v < -50 ? ' ' : v - WL < 0 ? '.' : Math.round(v - WL) < 10 ? String(Math.round(v - WL)) : String.fromCharCode(87 + Math.min(35, Math.round(v - WL)));
    const chunk = +(flags.w || 110), from = flags.from != null ? Math.max(0, Math.round((+flags.from - x0) / cell)) : 0, to = flags.to != null ? Math.min(nx, Math.round((+flags.to - x0) / cell)) : nx;
    for (let a = from; a < to; a += chunk) {
      console.log(`x from ${x0 + a * cell} to ${x0 + Math.min(to, a + chunk) * cell} (stern ... bow); ruler: | every 10 m`);
      console.log('     ' + Array.from({ length: Math.min(chunk, to - a) }, (_, i) => ((x0 + (a + i) * cell) % 10 === 0 ? '|' : ' ')).join(''));
      for (let j = 0; j < nz; j++) console.log(`${String((j - zr) * cell).padStart(4)} ` + Array.from(hm[j].slice(a, a + chunk), ch).join(''));
    }
  } else if (cmd === 'export') {                     // the model in the game frame (x bow +, y over the waterline with --draft, z starboard, metres) as one binary PLY: for tools/refs/solids.py (trimesh, shapely)
    const wl = +(flags.draft || 0), out = arg || 'refs/upright.ply';
    let nv = 0, nf = 0;
    for (const p of m.parts) { nv += p.V.length / 3; nf += p.idx.length / 3; }
    const head = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nf}\nproperty list uchar int vertex_indices\nend_header\n`);
    const vb = Buffer.alloc(nv * 12), fb = Buffer.alloc(nf * 13);
    let vo = 0, fo = 0, base = 0;
    for (const p of m.parts) {
      for (let i = 0; i < p.V.length; i += 3) { vb.writeFloatLE(p.V[i], vo); vb.writeFloatLE(p.V[i + 1] - wl, vo + 4); vb.writeFloatLE(p.V[i + 2], vo + 8); vo += 12; }
      for (let t = 0; t < p.idx.length; t += 3) { fb.writeUInt8(3, fo); fb.writeInt32LE(base + p.idx[t], fo + 1); fb.writeInt32LE(base + p.idx[t + 1], fo + 5); fb.writeInt32LE(base + p.idx[t + 2], fo + 9); fo += 13; }
      base += p.V.length / 3;
    }
    fs.writeFileSync(out, Buffer.concat([head, vb, fb]));
    console.log(`${out}: ${nv} vertices, ${nf} triangles`);
  } else if (cmd === 'bakeraw') {                    // raw arrays for tools/refs/bake.py: positions in the game frame (--loa --draft), uv, material of each vertex, indices, the textures of the materials
    const wl = +(flags.draft || 0), out = arg || 'refs/bake';
    fs.mkdirSync(out, { recursive: true });
    let nv = 0, nf = 0;
    for (const p of m.parts) { nv += p.V.length / 3; nf += p.idx.length / 3; }
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), vm = new Int16Array(nv), ix = new Uint32Array(nf * 3);
    let vo = 0, fo = 0;
    for (const p of m.parts) {
      const n = p.V.length / 3;
      for (let i = 0; i < n; i++) { pos[(vo + i) * 3] = p.V[i * 3]; pos[(vo + i) * 3 + 1] = p.V[i * 3 + 1] - wl; pos[(vo + i) * 3 + 2] = p.V[i * 3 + 2]; if (p.UV) { uv[(vo + i) * 2] = p.UV[i * 2]; uv[(vo + i) * 2 + 1] = p.UV[i * 2 + 1]; } vm[vo + i] = p.mat ?? -1; }
      for (let t = 0; t < p.idx.length; t++) ix[fo * 3 + t] = vo + p.idx[t];
      vo += n; fo += p.idx.length / 3;
    }
    const w = (f, a) => fs.writeFileSync(path.join(out, f), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    w('pos.f32', pos); w('uv.f32', uv); w('vmat.i16', vm); w('idx.u32', ix);
    const mats = (model.g.materials || []).map((mt) => {
      if (mt.objFactor) return { name: mt.name, diffuse: mt.objDiffuse, factor: mt.objFactor };
      const sg = mt.extensions?.KHR_materials_pbrSpecularGlossiness, pbr = mt.pbrMetallicRoughness;
      const ti = sg?.diffuseTexture?.index ?? pbr?.baseColorTexture?.index;
      return { name: mt.name, diffuse: ti != null ? model.g.images[model.g.textures[ti].source].uri : null, factor: sg?.diffuseFactor || pbr?.baseColorFactor || [1, 1, 1, 1] };
    });
    fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ vertices: nv, triangles: nf, mats, L: m.L, flipV: !(model.g.nodes && model.g.nodes.length) }));
    console.log(`${out}: ${nv} vertices, ${nf} triangles, ${mats.length} materials`);
  } else if (cmd === 'sections') {
    const step = +(arg || 2);
    console.log('x (m from the middle), half-beam at deck edge (max |z|), top of the hull (max y of the widest part), keel (min y)');
    for (let x = Math.ceil(m.bb[0][0]); x <= m.bb[1][0]; x += step) {
      let zmax = 0, ytop = 0, ymin = 1e9, ztop = 0;
      for (const p of m.parts) for (let i = 0; i < p.V.length; i += 3) if (Math.abs(p.V[i] - x) < step / 2) { const z = Math.abs(p.V[i + 2]); if (z > zmax) { zmax = z; ytop = p.V[i + 1]; } ymin = Math.min(ymin, p.V[i + 1]); }
      console.log(`${x.toFixed(0).padStart(5)}  hw ${zmax.toFixed(2).padStart(5)}  y@hw ${ytop.toFixed(2).padStart(5)}  keel ${ymin.toFixed(2)}`);
    }
  }
}
