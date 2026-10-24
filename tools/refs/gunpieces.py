#!/usr/bin/env python3
"""List the connected pieces of a baked single gun and draw them (side and top views, one colour per piece, the piece number written on it), to tell what elevates with the barrel:
python3 tools/refs/gunpieces.py refs/<id>/bake out/gun/<id>.png [--min=200] [--px=300]"""
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
src, out = pos[:2]
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
vmat = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
key = np.round(P / 0.004).astype(np.int64)
u, inv = np.unique(key, axis=0, return_inverse=True)
n = len(u)
rows = np.concatenate([inv[I[:, 0]], inv[I[:, 1]]]); cols = np.concatenate([inv[I[:, 1]], inv[I[:, 2]]])
_, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)), directed=False)
comp = lab[inv[I[:, 0]]]
ids, cnt = np.unique(comp, return_counts=True)
mn = int(fl.get('min', 200))
big = [(int(c), int(k)) for c, k in zip(ids, cnt) if k >= mn]
print(len(ids), 'pieces,', len(big), 'with at least', mn, 'triangles')
rng = np.random.RandomState(3)
cols_ = {c: tuple(int(v) for v in rng.randint(60, 255, 3)) for c, _ in big}
for c, k in sorted(big, key=lambda t: -t[1]):
    V = P[np.unique(I[comp == c])]
    print('piece %4d  tris %6d  mat %d  x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f' % (c, k, int(np.bincount(vmat[np.unique(I[comp == c])]).argmax()), V[:, 0].min(), V[:, 0].max(), V[:, 1].min(), V[:, 1].max(), V[:, 2].min(), V[:, 2].max()))
px = float(fl.get('px', 300)); lo = P.min(0); hi = P.max(0)
W = int((hi[0] - lo[0]) * px) + 20; H1 = int((hi[1] - lo[1]) * px) + 20; H2 = int((hi[2] - lo[2]) * px) + 20
img = Image.new('RGB', (W, H1 + H2 + 10), (20, 20, 20)); d = ImageDraw.Draw(img)
tc = np.array([cols_.get(int(c), (90, 90, 90)) for c in comp])
mid = P[I].mean(1)
def draw(ax_v, off, flip, depth_ax):
    order = np.argsort(mid[:, depth_ax] * (1 if depth_ax == 2 else -1))
    if depth_ax == 2: order = order[::-1]
    for t in order:
        q = P[I[t]]
        pts = [((v[0] - lo[0]) * px + 10, off + ((hi[ax_v] - v[ax_v]) if flip else (v[ax_v] - lo[ax_v])) * px + 10) for v in q]
        d.polygon(pts, fill=tuple(int(x) for x in tc[t]))
    for c, _ in big:
        V = P[np.unique(I[comp == c])]; m = V.mean(0)
        d.text(((m[0] - lo[0]) * px + 10, off + ((hi[ax_v] - m[ax_v]) if flip else (m[ax_v] - lo[ax_v])) * px + 10), str(c), fill=(255, 255, 255))
draw(1, 0, True, 2)
draw(2, H1 + 10, False, 1)
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
img.save(out)
