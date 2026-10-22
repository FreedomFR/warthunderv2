#!/usr/bin/env python3
"""The named objects of a reference model (an OBJ whose groups are the ship's own elements), in the game's frame, grouped by what they are.

  node tools/refs/gltf.mjs bakeraw refs/<dir>/src refs/<dir>/bake --loa= --draft=       (writes the arrays with the group of every vertex)
  python3 tools/refs/catalog.py refs/<dir>/bake [--min=0]

For every group: its material (the model names it after the part: 460mm45, 155mm_60, 25mm_Type96...), triangles, size and place. Groups with the same material, triangle count and size are
copies of one element: printed as one line with their count. This is the list an element-by-element copy works from.
"""
import sys, json, os
import numpy as np
from collections import defaultdict

src = sys.argv[1]
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32)
parts = info['parts']
mats = info['mats']
tp = VP[I[:, 0]]
kinds = defaultdict(list)
for k, pr in enumerate(parts):
    t = np.where(tp == k)[0]
    if len(t) == 0:
        continue
    V = P[np.unique(I[t])]
    lo, hi = V.min(0), V.max(0)
    mname = mats[pr['mat']]['name'] if pr['mat'] >= 0 else '?'
    kinds[(mname, len(t), tuple(np.round(np.sort(hi - lo), 1)))].append((pr['name'], lo, hi))
rows = sorted(kinds.items(), key=lambda kv: (-len(kv[1]) * kv[0][1]))
print(f"{'copies':>6} {'tris':>6}  {'size (m)':<22} material / first group")
for (m, n, dims), lst in rows:
    print(f"{len(lst):>6} {n:>6}  {str(list(dims)):<22} {m[:44]}  [{lst[0][0]}]")
