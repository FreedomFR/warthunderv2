#!/usr/bin/env python3
"""The mounts a model really has, by material: the pieces of the given materials are joined when their boxes are closer than --gap (m), and every group is listed with its centre, size and triangles.
    python3 tools/refs/clusters.py refs/<id>/bake <material substring>[,<substring>...] [--gap=0.4] [--min=50]
Prints one line per cluster (x, z, lowest y, size, triangles, pieces), sorted along the ship, and the count: what to compare with the real armament."""
import sys, json, os
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, mats_arg = pos_args[:2]
GAP = float(fl.get('gap', 0.4)); MIN = int(fl.get('min', 50))
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32); tp = VP[I[:, 0]]
want = mats_arg.split(',')
sel = [k for k, p in enumerate(info['parts']) if p['mat'] >= 0 and any(w in info['mats'][p['mat']]['name'] for w in want)]
order = np.argsort(tp, kind='stable'); st = np.searchsorted(tp[order], np.arange(len(info['parts']))); en = np.searchsorted(tp[order], np.arange(len(info['parts'])), side='right')
lo = np.zeros((len(sel), 3)); hi = np.zeros((len(sel), 3)); nt = np.zeros(len(sel), int)
for i, k in enumerate(sel):
    V = P[I[order[st[k]:en[k]]]].reshape(-1, 3); lo[i] = V.min(0); hi[i] = V.max(0); nt[i] = en[k] - st[k]
# pieces whose boxes (grown by the gap) overlap are one cluster
n = len(sel); rows, cols = [], []
srt = np.argsort(lo[:, 0])
for a in range(n):
    i = srt[a]
    for b in range(a + 1, n):
        j = srt[b]
        if lo[j, 0] > hi[i, 0] + GAP: break
        if lo[j, 1] <= hi[i, 1] + GAP and hi[j, 1] >= lo[i, 1] - GAP and lo[j, 2] <= hi[i, 2] + GAP and hi[j, 2] >= lo[i, 2] - GAP:
            rows.append(i); cols.append(j)
g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
_, lab = connected_components(g, directed=False)
out = []
for c in np.unique(lab):
    m = lab == c
    if nt[m].sum() < MIN: continue
    l, h = lo[m].min(0), hi[m].max(0)
    out.append(((l[0] + h[0]) / 2, (l[2] + h[2]) / 2, l[1], h - l, int(nt[m].sum()), int(m.sum())))
out.sort()
for x, z, y, e, t, p in out: print(f'x {x:8.2f} z {z:7.2f} y {y:5.2f}  size {e[0]:5.2f} x {e[1]:5.2f} x {e[2]:5.2f}  {t:6d} tris {p:4d} pieces')
print(len(out), 'clusters,', sum(o[4] for o in out), 'triangles', file=sys.stderr)
