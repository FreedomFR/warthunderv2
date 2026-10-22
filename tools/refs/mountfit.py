#!/usr/bin/env python3
"""The numbers of a gun mount read on a reference model (the PLY of `gltf.mjs export`): where its barrels are and how thick, to put in a FAMILY entry of js/game/model/mounts.js.

  python3 tools/refs/mountfit.py refs/<id>/upright.ply <cx> <cz> <yaw> --u0=9.5 --u1=24 --y0=8 --y1=16 [--w=9] [--rest=0]

(cx, cz) = the training axis in game metres, yaw = where the mount points (0 = ahead, 90 = starboard, 180 = astern), u0..u1 = the stretch in front of the gun house to read (the barrels clear of
the face), y0..y1 = the heights to search for the axis of the barrels. Prints: the height of the barrel axis, the lateral position of each barrel, the radius along the barrel
(u from the training axis) and the muzzle. Barrels at rest lie nearly level; a mount caught elevated gives a shorter length and a larger radius (the numbers say which).
"""
import sys
import numpy as np
import trimesh
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity

a = sys.argv[1:]
pos = [x for x in a if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in a if x.startswith('--'))
ply, cx, cz, yaw = pos[0], float(pos[1]), float(pos[2]), float(pos[3])
U0, U1, W = float(fl.get('u0', 9)), float(fl.get('u1', 24)), float(fl.get('w', 9))
Y0, Y1 = float(fl.get('y0', 0)), float(fl.get('y1', 30))
mesh = trimesh.load(ply, process=False)
V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces)
tri = V[F]
R = max(U1, W) * 1.6
keep = (np.abs(tri[:, :, 0].mean(1) - cx) < R) & (np.abs(tri[:, :, 2].mean(1) - cz) < R) & (tri[:, :, 1].max(1) >= Y0) & (tri[:, :, 1].min(1) <= Y1)
tri = tri[keep]


def cut(h):
    t = tri[(tri[:, :, 1].min(1) <= h) & (tri[:, :, 1].max(1) >= h)]
    segs = []
    for T in t:
        d = T[:, 1] - h
        pts = []
        for i in range(3):
            j = (i + 1) % 3
            if (d[i] > 0) != (d[j] > 0):
                f = d[i] / (d[i] - d[j])
                p = T[i] + (T[j] - T[i]) * f
                pts.append((p[0], p[2]))
        if len(pts) == 2 and pts[0] != pts[1]:
            segs.append(LineString(pts))
    if not segs:
        return None
    lines = unary_union(segs).buffer(0.08, cap_style=2, join_style=2)
    polys = [Polygon(q.exterior) for q in (lines.geoms if isinstance(lines, MultiPolygon) else [lines]) if isinstance(q, Polygon)]
    if not polys:
        return None
    g = unary_union(polys).buffer(-0.08, join_style=2)
    g = affinity.translate(affinity.rotate(g, -yaw, origin=(cx, cz)), -cx, -cz)
    return g.intersection(box(U0, -W, U1, W))


best = None
for h in np.arange(Y0, Y1, 0.05):
    g = cut(h)
    if g is None or g.is_empty:
        continue
    score = g.area
    if best is None or score > best[0]:
        best = (score, h, g)
if best is None:
    print('nothing found'); sys.exit(1)
_, ay, g = best
print(f'barrel axis at y = {ay:.2f} (searched {Y0}..{Y1})')
parts = sorted([p for p in (g.geoms if isinstance(g, MultiPolygon) else [g]) if isinstance(p, Polygon) and p.area > 0.3], key=lambda p: p.centroid.y)
print(f'{len(parts)} barrels (strips) at this height')
for p in parts:
    x0, z0, x1, z1 = p.bounds
    print(f'  w centre {p.centroid.y:+.2f}  u {x0:.2f}..{x1:.2f}  widest {z1 - z0:.2f}')
if parts:
    ws = [p.centroid.y for p in parts]
    if len(ws) > 1:
        print(f'  spacing {np.mean(np.diff(ws)):.2f}')
    p = parts[len(parts) // 2]
    x0, z0, x1, z1 = p.bounds
    print('radius along the middle barrel (u from the axis -> r):')
    for u in np.arange(x0 + 0.05, x1, max(0.5, (x1 - x0) / 14)):
        s = p.intersection(LineString([(u, -W), (u, W)]))
        if not s.is_empty:
            b = s.bounds
            print(f'  u {u:6.2f}  r {(b[3] - b[1]) / 2:.3f}')
    print(f'  muzzle at u = {x1:.2f}')
