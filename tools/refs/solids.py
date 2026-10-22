#!/usr/bin/env python3
"""The solid masses of a reference model from exact horizontal cross-sections (trimesh + shapely), to be redrawn as prisms / lofts in js/game/model/ships/<id>.js.

  node tools/refs/gltf.mjs export refs/<id>/src refs/<id>/upright.ply --loa=263 --draft=10.4        # the model in the game frame, once
  python3 tools/refs/solids.py refs/<id>/upright.ply --x0=-110 --x1=60 --y0=5.5 --y1=45 [--step=0.25] [--min=0.8] [--open=0.5] [--tol=0.12] [--iou=0.9]
                               [--floor=deck.json] [--mask=mounts.json] > masses.json

Every `step` metres the model is cut by a plane; the closed outlines of the cut are the footprint of what stands at that height (rails, wires, masts, ladders are open lines and fall out; `--open`
removes thin loops by an opening of that radius, `--min` is the smallest area kept, in m2). `--floor` = [[x, y], ...] the deck: nothing below it + 0.25 m is kept (the hull is the builder's);
`--mask` = [{x, z, r, y}, ...] cuts a disc out of every slice above y (the mounts the game draws itself). Runs of slices whose footprint stays the same (IoU >= --iou) are one solid:
[{ y0, y1, rings: [outer, hole, ...], top: ring | null }] where `top` is the footprint at the top of a run when it is no longer the same as at the bottom (a taper: draw it as a loft).
Everything in game metres (x along the ship, bow +; y over the waterline; z to starboard). Prints a summary to stderr, the JSON to stdout.
"""
import sys, json
import numpy as np
import trimesh
from shapely.geometry import Polygon, MultiPolygon, Point, LineString, box
from shapely.ops import unary_union, polygonize

a = sys.argv[1:]
pos = [x for x in a if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in a if x.startswith('--'))
ply = pos[0]
X0, X1, Y0, Y1 = float(fl.get('x0', -1e9)), float(fl.get('x1', 1e9)), float(fl.get('y0', 0)), float(fl.get('y1', 50))
GAP = float(fl.get('gap', 0.12))
LOFT = int(fl.get('loft', 0))                                                       # --loft=48: a run whose outline drifts slowly (a taper) is one loft between its first and last outline, resampled to 48 points
LOFTMAX = float(fl.get('loftmax', 0.6))
STEP, MINA, OPEN, TOL, IOU = float(fl.get('step', 0.25)), float(fl.get('min', 0.8)), float(fl.get('open', 0.5)), float(fl.get('tol', 0.12)), float(fl.get('iou', 0.9))
floor = json.load(open(fl['floor'])) if 'floor' in fl else None
masks = json.load(open(fl['mask'])) if 'mask' in fl else []

mesh = trimesh.load(ply, process=False)
V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces)
print(f'{len(V)} vertices, {len(F)} triangles', file=sys.stderr)
# keep the triangles in the window: their vertices' x and y ranges
tri = V[F]
keep = (tri[:, :, 0].max(1) >= X0 - 1) & (tri[:, :, 0].min(1) <= X1 + 1) & (tri[:, :, 1].max(1) >= Y0 - 0.5) & (tri[:, :, 1].min(1) <= Y1 + 0.5)
tri = tri[keep]
print(f'{len(tri)} triangles in the window', file=sys.stderr)


def floor_at(x):
    if not floor:
        return -1e9
    xs = [p[0] for p in floor]
    return float(np.interp(x, xs, [p[1] for p in floor]))


def slice_at(h):
    """Closed outlines of the cut at height h: the union of every area the cut lines enclose."""
    lo, hi = tri[:, :, 1].min(1), tri[:, :, 1].max(1)
    t = tri[(lo <= h) & (hi >= h)]
    if len(t) == 0:
        return None
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
    # the cut lines are rarely closed to the millimetre (the model's vertices are split along its seams): grow them by GAP, fill what they enclose, shrink back
    lines = unary_union(segs).buffer(GAP, cap_style=2, join_style=2)
    polys = []
    for q in (lines.geoms if isinstance(lines, MultiPolygon) else [lines]):
        if isinstance(q, Polygon):
            polys.append(Polygon(q.exterior))                                    # no holes: what the outline encloses is solid
    if not polys:
        return None
    return unary_union(polys).buffer(-GAP, join_style=2)


def clean(g, h):
    if g is None or g.is_empty:
        return None
    # the hull's own deck and sides: only what stands above the deck line (x intervals where the deck is higher than this slice are cut away)
    if floor:
        xs = np.linspace(X0, X1, int((X1 - X0) / 0.5) + 1)
        bad = [x for x in xs if floor_at(x) + 0.25 > h]
        if bad:
            runs, s0, prev = [], bad[0], bad[0]
            for x in bad[1:]:
                if x - prev > 0.6:
                    runs.append((s0, prev)); s0 = x
                prev = x
            runs.append((s0, prev))
            for r0, r1 in runs:
                g = g.difference(box(r0 - 0.25, -60, r1 + 0.25, 60))
    g = g.intersection(box(X0, -60, X1, 60))
    for m in masks:
        if h >= m['y']:
            g = g.difference(Point(m['x'], m['z']).buffer(m['r']))
    if g.is_empty:
        return None
    g = g.buffer(-OPEN).buffer(OPEN) if OPEN > 0 else g          # the opening drops what is thinner than twice OPEN
    g = g.simplify(TOL, preserve_topology=True)
    parts = [p for p in (g.geoms if isinstance(g, MultiPolygon) else [g]) if isinstance(p, Polygon) and p.area >= MINA]
    return parts or None


heights = np.arange(Y0 + STEP / 2, Y1, STEP)
def one(h):
    return clean(slice_at(h), h)


from multiprocessing import Pool
with Pool() as pool:                                                              # every height on its own process (the arrays are shared by the fork)
    slices = pool.map(one, list(heights), chunksize=2)
print(f'{sum(1 for s in slices if s)} of {len(slices)} slices not empty', file=sys.stderr)

# runs: each blob follows the blob of the slice below it that overlaps it most
def iou(p, q):
    u = p.union(q).area
    return p.intersection(q).area / u if u else 0.0


runs, open_runs = [], []
for k, parts in enumerate(slices):
    h0 = Y0 + k * STEP
    nxt = []
    used = set()
    for p in parts or []:
        best, bi = None, 0.0
        for r in open_runs:
            if id(r) in used:
                continue
            v = iou(r['top'], p) if LOFT else iou(r['base'], p)
            if v > bi:
                best, bi = r, v
        if best is not None and bi >= IOU and (not LOFT or iou(best['base'], p) >= LOFTMAX):
            best['y1'] = h0 + STEP
            best['top'] = p
            used.add(id(best))
            nxt.append(best)
        else:
            r = {'y0': h0, 'y1': h0 + STEP, 'base': p, 'top': p}
            runs.append(r)
            nxt.append(r)
    open_runs = nxt


def resample(c):
    """The outline as LOFT points, counter-clockwise, starting at its point of greatest x: two outlines of the same blob then correspond point to point."""
    from shapely.geometry import LinearRing
    from shapely.geometry.polygon import orient
    pg = orient(Polygon(c), 1.0)
    lr = LinearRing(pg.exterior.coords)
    pts = [lr.interpolate(i / LOFT, normalized=True) for i in range(LOFT)]
    k = max(range(LOFT), key=lambda i: pts[i].x)
    pts = pts[k:] + pts[:k]
    return [[round(q.x, 2), round(q.y, 2)] for q in pts]


def ring(c):
    return [[round(x, 2), round(z, 2)] for x, z in list(c.coords)[:-1]]


out = []
for r in runs:
    if r['y1'] - r['y0'] < STEP * 1.5 and r['base'].area < 6:
        continue
    base = r['base']
    rec = {'y0': round(r['y0'], 2), 'y1': round(r['y1'], 2), 'rings': [ring(base.exterior)] + [ring(i) for i in base.interiors]}
    if LOFT and r['top'] is not base and not list(base.interiors) and not list(r['top'].interiors) and r['y1'] - r['y0'] > STEP * 1.5:
        ra, rb = resample(base.exterior), resample(r['top'].exterior)
        best = min(range(LOFT), key=lambda k: sum((ra[i][0] - rb[(i + k) % LOFT][0]) ** 2 + (ra[i][1] - rb[(i + k) % LOFT][1]) ** 2 for i in range(LOFT)))   # the turn that brings the two outlines closest
        rb = rb[best:] + rb[:best]
        rms = (sum((ra[i][0] - rb[i][0]) ** 2 + (ra[i][1] - rb[i][1]) ** 2 for i in range(LOFT)) / LOFT) ** 0.5
        if rms < float(fl.get('loftrms', 0.9)):                                        # outlines that do not match point to point would twist: keep the plain extrusion
            rec['rings'] = [ra]
            rec['top'] = rb
    out.append(rec)
print(f'{len(out)} solids, {sum(len(o["rings"][0]) for o in out)} corners', file=sys.stderr)
json.dump(out, sys.stdout)
