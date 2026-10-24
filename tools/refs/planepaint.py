#!/usr/bin/env python3
"""What an aircraft model is painted with, read from the colours of its textures (to be turned into a paint scheme of the game, model/airpaint.js): the colour of the upper and of the lower
surfaces, the colour of the cowling, the red (or other) disc markings with their place and size in the game frame of tools/refs/planegroups.py.

  python3 tools/refs/planepaint.py refs/<id>/split tools/refs/<key>_planegroups.json [--r=140 --g=90 --b=90 | --sel=r0,r1,g0,g1,b0,b1]

It reads the same files and does the same turn as planegroups.py (it executes its first half), then prints: median sRGB of the faces that look up / down, of the first 0.8 m behind the nose tip
(cowling), and the clusters of vertices that are red (r above the first number, g and b below the others): the centre (x, y, z), the radius and the way the face looks.
"""
import sys, re
import numpy as np
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
code = open(__file__.replace('planepaint.py', 'planegroups.py')).read().split("if fl.get('probe')")[0]
sys.argv = [sys.argv[0]] + pos[:2]
exec(code)
keep = ~dropm[VM]
# the face normals: from the triangles
tri = Q[I]; n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); ln = np.linalg.norm(n, axis=1) + 1e-12; n = n / ln[:, None]
cen = tri.mean(1); col = C[I].mean(1)
ok = keep[I[:, 0]] & (np.abs(cen[:, 2]) > 0.0)
def med(m, label):
    q = col[m & ok]
    if len(q): print(f'{label:34} {len(q):7} faces  median sRGB ({int(np.median(q[:,0]))}, {int(np.median(q[:,1]))}, {int(np.median(q[:,2]))})  = #{int(np.median(q[:,0])):02x}{int(np.median(q[:,1])):02x}{int(np.median(q[:,2])):02x}')
body = (np.abs(cen[:, 2]) < 0.7) & (cen[:, 0] < 2.5) & (cen[:, 0] > -2.5)
red = (col[:, 0] > float(fl.get('r', 140))) & (col[:, 1] < float(fl.get('g', 90))) & (col[:, 2] < float(fl.get('b', 90)))
if fl.get('sel'):      # --sel=r0,r1,g0,g1,b0,b1: the markings are another colour (the blue disc of the American insignia, the black of a cross)
    q = [float(v) for v in fl['sel'].split(',')]
    red = (col[:, 0] >= q[0]) & (col[:, 0] <= q[1]) & (col[:, 1] >= q[2]) & (col[:, 1] <= q[3]) & (col[:, 2] >= q[4]) & (col[:, 2] <= q[5])
med((n[:, 1] > 0.6) & ~red, 'upper surfaces (not red)')
med((n[:, 1] < -0.6) & ~red, 'lower surfaces (not red)')
med((np.abs(n[:, 2]) > 0.6) & ~red & body, 'fuselage sides (not red)')
xn = 0.42 * L
med((cen[:, 0] > xn - 0.9) & (cen[:, 0] < xn - 0.35) & (np.hypot(cen[:, 1], cen[:, 2]) < 0.7), 'cowling ring')
med((cen[:, 0] > xn - 0.35) & (np.hypot(cen[:, 1], cen[:, 2]) < 0.3), 'spinner')
# red clusters by neighbourhood
from scipy.spatial import cKDTree
idx = np.where(red & ok)[0]
print(len(idx), 'red faces')
if len(idx):
    P = cen[idx]; T = cKDTree(P); seen = np.zeros(len(idx), bool); k = 0
    for i in range(len(idx)):
        if seen[i]: continue
        st = [i]; seen[i] = True; mem = []
        while st:
            a = st.pop(); mem.append(a)
            for b in T.query_ball_point(P[a], 0.12):
                if not seen[b]: seen[b] = True; st.append(b)
        if len(mem) < 30: continue
        q = P[mem]; nn = n[idx[mem]].mean(0)
        ext = q.max(0) - q.min(0)
        print(f'cluster {k}: {len(mem):6} faces  centre ({q[:,0].mean():6.2f}, {q[:,1].mean():6.2f}, {q[:,2].mean():6.2f})  extent ({ext[0]:.2f}, {ext[1]:.2f}, {ext[2]:.2f})  normal ({nn[0]:5.2f}, {nn[1]:5.2f}, {nn[2]:5.2f})')
        k += 1
