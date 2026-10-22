#!/usr/bin/env python3
"""The training axis of a mount from its barbette: the centre and radius of the round outline cut at a height under the gun house.
  python3 tools/refs/mountaxis.py refs/<id>/upright.ply <cx> <cz> <y> [--r=8]     (cx, cz: a first guess in game metres, y: a height through the barbette ring)
"""
import sys
import numpy as np
import trimesh
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
from shapely.ops import unary_union

a = sys.argv[1:]
pos = [x for x in a if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in a if x.startswith('--'))
ply, cx, cz, y = pos[0], float(pos[1]), float(pos[2]), float(pos[3])
R = float(fl.get('r', 8))
m = trimesh.load(ply, process=False)
V, F = np.asarray(m.vertices), np.asarray(m.faces)
tri = V[F]
tri = tri[(np.abs(tri[:, :, 0].mean(1) - cx) < R * 2.2) & (np.abs(tri[:, :, 2].mean(1) - cz) < R * 2.2)]
t = tri[(tri[:, :, 1].min(1) <= y) & (tri[:, :, 1].max(1) >= y)]
segs = []
for T in t:
    d = T[:, 1] - y
    pts = []
    for i in range(3):
        j = (i + 1) % 3
        if (d[i] > 0) != (d[j] > 0):
            f = d[i] / (d[i] - d[j]); p = T[i] + (T[j] - T[i]) * f; pts.append((p[0], p[2]))
    if len(pts) == 2 and pts[0] != pts[1]:
        segs.append(LineString(pts))
lines = unary_union(segs).buffer(0.1, cap_style=2, join_style=2)
polys = [Polygon(q.exterior) for q in (lines.geoms if isinstance(lines, MultiPolygon) else [lines]) if isinstance(q, Polygon)]
best = min(polys, key=lambda p: p.centroid.distance(Point(cx, cz)))
c = best.centroid
x0, z0, x1, z1 = best.bounds
print(f'outline at y={y}: centre x {c.x:.2f}, z {c.y:.2f}; extent x {x0:.2f}..{x1:.2f} ({x1 - x0:.2f} m), z {z0:.2f}..{z1:.2f} ({z1 - z0:.2f} m); area {best.area:.1f} m2 (a circle of that area: r {np.sqrt(best.area / np.pi):.2f})')
