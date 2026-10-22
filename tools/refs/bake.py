#!/usr/bin/env python3
"""A reference model baked for the game: the colour of its textures read at every vertex, the mesh welded and simplified (quadric decimation), cut into the pieces the game destroys, packed in the
game's vertex format.

  node tools/refs/gltf.mjs bakeraw refs/<id>/src refs/<id>/bake --loa=263 --draft=10.4 [--bow=1] [--mirror=1]     # raw arrays in the game frame (once)
  python3 tools/refs/bake.py refs/<id>/bake --tris=150000 [--tex=512] [--eps=0.02] --out=refs/<id>/baked

Writes <out>/mesh.npz-like raw files: pos.f32, col.u8 (rgb), idx.u32 and info.json. Needs numpy, PIL and open3d (pip install --user numpy pillow open3d).
"""
import sys, json, os, time
import numpy as np
from PIL import Image
import open3d as o3d

a = sys.argv[1:]
pos_args = [x for x in a if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in a if x.startswith('--'))
src = pos_args[0]
TRIS = int(fl.get('tris', 150000))
TEX = int(fl.get('tex', 512))
EPS = float(fl.get('eps', 0.02))
out = fl.get('out', os.path.join(os.path.dirname(src.rstrip('/')), 'baked'))
os.makedirs(out, exist_ok=True)
t0 = time.time()
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
pos = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3)
uv = np.fromfile(os.path.join(src, 'uv.f32'), dtype=np.float32).reshape(nv, 2)
vm = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
idx = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
print(f'{nv} vertices, {nf} triangles', file=sys.stderr)

# the colour of the textures at each vertex
col = np.full((nv, 3), 0.6, dtype=np.float32)
texdir = os.path.join(os.path.dirname(src.rstrip('/')), 'src')
for mi, m in enumerate(info['mats']):
    sel = np.where(vm == mi)[0]
    if len(sel) == 0:
        continue
    f = np.array(m['factor'][:3], dtype=np.float32)
    if m['diffuse']:
        try:
            im = Image.open(os.path.join(texdir, m['diffuse'])).convert('RGB')
            im.thumbnail((TEX, TEX))
            arr = np.asarray(im, dtype=np.float32) / 255.0
            h, w = arr.shape[:2]
            u = np.mod(uv[sel, 0], 1.0); v = np.mod(uv[sel, 1], 1.0)
            c = arr[np.clip((v * h).astype(int), 0, h - 1), np.clip((u * w).astype(int), 0, w - 1)]
            col[sel] = c * f
            continue
        except Exception as e:
            print('texture', m['diffuse'], e, file=sys.stderr)
    col[sel] = f
(np.clip(col, 0, 1) * 255).astype(np.uint8).tofile(os.path.join(src, 'colfull.u8'))               # the full resolution colours, for bakemounts.py
print(f'colours read ({time.time() - t0:.0f} s)', file=sys.stderr)

mesh = o3d.geometry.TriangleMesh()
mesh.vertices = o3d.utility.Vector3dVector(pos.astype(np.float64))
mesh.triangles = o3d.utility.Vector3iVector(idx.astype(np.int32))
mesh.vertex_colors = o3d.utility.Vector3dVector(col.astype(np.float64))
mesh.merge_close_vertices(EPS)
mesh.remove_degenerate_triangles()
mesh.remove_duplicated_triangles()
mesh.remove_unreferenced_vertices()
print(f'welded: {len(mesh.vertices)} vertices, {len(mesh.triangles)} triangles ({time.time() - t0:.0f} s)', file=sys.stderr)
if len(mesh.triangles) > TRIS:
    mesh = mesh.simplify_quadric_decimation(target_number_of_triangles=TRIS)
    mesh.remove_degenerate_triangles()
    mesh.remove_unreferenced_vertices()
print(f'simplified: {len(mesh.vertices)} vertices, {len(mesh.triangles)} triangles ({time.time() - t0:.0f} s)', file=sys.stderr)
P = np.asarray(mesh.vertices, dtype=np.float32)
C = (np.clip(np.asarray(mesh.vertex_colors), 0, 1) * 255).astype(np.uint8)
I = np.asarray(mesh.triangles, dtype=np.uint32)
P.tofile(os.path.join(out, 'pos.f32')); C.tofile(os.path.join(out, 'col.u8')); I.tofile(os.path.join(out, 'idx.u32'))
json.dump({'vertices': len(P), 'triangles': len(I)}, open(os.path.join(out, 'info.json'), 'w'))
print(f'written to {out} ({time.time() - t0:.0f} s)', file=sys.stderr)
