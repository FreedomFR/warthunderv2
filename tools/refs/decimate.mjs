// Simplifies a welded baked mesh with meshoptimizer (edge collapses onto existing vertices: no stray vertices, unlike a quadric optimum): node tools/refs/decimate.mjs <in dir> <out dir> --tris=200000 [--cw=0.3]
// Reads pos.f32 / col.u8 / idx.u32 (tools/refs/bake.py with a triangle target above the mesh size writes them welded), writes the same names. The colour is an attribute of the collapse (weight --cw).
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const a = process.argv.slice(2), pos = a.filter((x) => !x.startsWith('--')), fl = Object.fromEntries(a.filter((x) => x.startsWith('--')).map((x) => { const [k, v] = x.slice(2).split('='); return [k, v ?? '1']; }));
const [dir, out] = pos;
const TRIS = +(fl.tris || 200000), CW = +(fl.cw ?? 0.3);
const rd = (f, T) => { const b = fs.readFileSync(path.join(dir, f)); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = rd('pos.f32', Float32Array), C = rd('col.u8', Uint8Array), I = rd('idx.u32', Uint32Array);
await MeshoptSimplifier.ready;
const att = new Float32Array(C.length); for (let i = 0; i < C.length; i++) att[i] = C[i] / 255;
const target = TRIS * 3;
let [idx, err] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, att, 3, [CW, CW, CW], null, Math.min(target, I.length), +(fl.err ?? 0.003), ['LockBorder']);
console.error(`${I.length / 3} -> ${idx.length / 3} triangles (error ${err.toFixed(4)})`);
// compact the vertices
const map = new Int32Array(P.length / 3).fill(-1); let n = 0;
for (const v of idx) if (map[v] < 0) map[v] = n++;
const p2 = new Float32Array(n * 3), c2 = new Uint8Array(n * 3), i2 = new Uint32Array(idx.length);
for (let v = 0; v < map.length; v++) if (map[v] >= 0) { p2.set(P.subarray(v * 3, v * 3 + 3), map[v] * 3); c2.set(C.subarray(v * 3, v * 3 + 3), map[v] * 3); }
for (let k = 0; k < idx.length; k++) i2[k] = map[idx[k]];
fs.mkdirSync(out, { recursive: true });
const w = (f, arr) => fs.writeFileSync(path.join(out, f), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
w('pos.f32', p2); w('col.u8', c2); w('idx.u32', i2);
fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ vertices: n, triangles: i2.length / 3 }));
console.error(`${out}: ${n} vertices, ${i2.length / 3} triangles`);
