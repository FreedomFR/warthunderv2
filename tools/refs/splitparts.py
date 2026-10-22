#!/usr/bin/env python3
"""The connected objects of every material as parts: for a model whose meshes are merged by material (one mesh per texture), the copies of a turret, a boat, a director are told apart again.

  GLTF_MATNAME=tex GLTF_DROP='regex' node tools/refs/gltf.mjs bakeraw refs/<dir>/src refs/<dir>/bake --loa= --draft=
  python3 tools/refs/splitparts.py refs/<dir>/bake [--weld=0.01]

Rewrites vpart.i32 and the `parts` of info.json: one part per connected object (vertices welded to 1 cm), named `<material>#<k>` (k in order of the position along the ship), with its material; the catalogue
(`catalog.py`), `groupmounts.py` and `shipgroups.py` then work on them as on the groups of a model whose groups are named.
"""
import sys, json, os
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src = pos_args[0]
W = float(fl.get('weld', 0.01))
MERGE = fl.get('merge')                              # --merge=regex --gap=0.3: the objects of the materials that match, whose boxes lie within `gap` metres, are one part (the pieces of a turret: house, cradles, barrels)
GAP = float(fl.get('gap', 0.3))
FAMILY = fl.get('family')                            # --family=regex: the materials that match are one family when the parts are merged (a gun and its mount are two textures of one mount)
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VM = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
key = np.round(P / W).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
inv = inv.reshape(-1)
J = inv[I]
nw = int(inv.max()) + 1
rows = np.repeat(np.arange(nf), 3); cols = nf + J.reshape(-1)
g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nf + nw, nf + nw))
_, lab = connected_components(g, directed=False)
# a component only joins triangles of one material: split by material too
tm = VM[I[:, 0]]
comp = lab[:nf]
keyc = comp.astype(np.int64) * 1000 + tm
ids, first = np.unique(keyc, return_index=True)
cx = np.array([P[I[np.where(keyc == k)[0]]].reshape(-1, 3)[:, 0].mean() for k in ids])
if MERGE:
    import re
    rx = re.compile(MERGE)
    comp_boxes = {}
    for k in ids:
        t = np.where(keyc == k)[0]
        V = P[I[t]].reshape(-1, 3)
        comp_boxes[int(k)] = (V.min(0), V.max(0), t)
    par = {int(k): int(k) for k in ids}
    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    by_mat = {}
    for k in ids:
        m = int(k % 1000); nm = info['mats'][m]['name']
        if rx.search(nm):
            fam = 'family' if (FAMILY and re.search(FAMILY, nm)) else m
            by_mat.setdefault(fam, []).append(int(k))
    for m, lst in by_mat.items():
        for a_i in range(len(lst)):
            la, ha, _ = comp_boxes[lst[a_i]]
            for b_i in range(a_i + 1, len(lst)):
                lb, hb, _ = comp_boxes[lst[b_i]]
                if np.all(la - GAP <= hb) and np.all(lb - GAP <= ha):
                    par[find(lst[a_i])] = find(lst[b_i])
    # the merged key of every triangle
    remap = {int(k): find(int(k)) for k in ids}
    keyc = np.array([remap[int(k)] for k in keyc], dtype=np.int64)
    ids, first = np.unique(keyc, return_index=True)
    cx = np.array([P[I[np.where(keyc == k)[0]]].reshape(-1, 3)[:, 0].mean() for k in ids])
order = np.argsort(cx)
rank = np.empty(len(ids), int); rank[order] = np.arange(len(ids))
part_of_key = {int(k): int(r) for k, r in zip(ids, rank)}
tp = np.array([part_of_key[int(k)] for k in keyc], dtype=np.int32)
vp = np.zeros(nv, dtype=np.int32)
vp[I.reshape(-1)] = np.repeat(tp, 3)
mats = info['mats']
counts = {}
parts = [None] * len(ids)
for k, r in zip(ids, rank):
    m = int(k % 1000)
    nm = mats[m]['name'] if m >= 0 else '?'
    counts[nm] = counts.get(nm, 0) + 1
    parts[r] = {'name': f'{nm}#{counts[nm] - 1}', 'mat': m}
vp.tofile(os.path.join(src, 'vpart.i32'))
info['parts'] = parts
json.dump(info, open(os.path.join(src, 'info.json'), 'w'))
print(f'{len(parts)} parts from {len(mats)} materials ({nf} triangles)', file=sys.stderr)
