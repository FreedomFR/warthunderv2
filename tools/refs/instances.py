#!/usr/bin/env python3
"""The repeated objects of a reference model, found by their shape and measured one by one (no boxes, no guessing from the game's own positions).

  python3 tools/refs/bake.py refs/<dir>/bake --split=0 --tris=1000000000 --out=refs/<dir>/full      # the coloured, unsplit mesh (once)
  python3 tools/refs/instances.py refs/<dir>/full refs/<dir>/instances.json [--min-tris=100] [--tol=0.025]

The model is cut into its connected objects (vertices welded to 2 cm). Objects with the same triangle count and the same size are candidates for being copies of one another; each candidate is
fitted onto the first one by a rotation about the vertical axis and a translation (searched by the distance between the two point sets, 1 degree steps then refined; a mirrored copy would be a different
kind), and kept in the group only if the two coincide to within --tol metres on average. For each group: the copy to draw (the first object, in a frame whose origin is the middle of its foot and whose
axes are the ship's), and for every instance its measured position and its turn from that copy, with the residual of the fit. Printed as a table; written as JSON (`kinds`).
Needs numpy and scipy.
"""
import sys, json, os
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, outf = pos_args[:2]
MINT = int(fl.get('min-tris', 100))
TOL = float(fl.get('tol', 0.025))
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)

key = np.round(P / 0.02).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
J = inv.reshape(-1)[I]
rows = np.repeat(np.arange(nf), 3); cols = nf + J.reshape(-1)
g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nf + int(J.max()) + 1, nf + int(J.max()) + 1))
_, lab = connected_components(g, directed=False)
lt = lab[:nf]
ids, cnt = np.unique(lt, return_counts=True)
hull = ids[np.argmax(cnt)]
order = np.argsort(lt, kind='stable')
starts = np.searchsorted(lt[order], ids)
ends = np.append(starts[1:], len(order))
print(f'{len(ids)} objects, the hull has {cnt.max()} triangles', file=sys.stderr)

objs = {}
for k, a, b in zip(ids, starts, ends):
    if k == hull or b - a < MINT:
        continue
    tri = order[a:b]
    v = np.unique(I[tri])
    V = P[v]
    objs[int(k)] = {'tri': tri, 'v': v, 'V': V, 'n': int(b - a), 'dims': np.sort(V.max(0) - V.min(0))}

# candidate groups: same triangle count, same dimensions (within 2 % or 2 cm)
groups = []
for k, o in sorted(objs.items(), key=lambda kv: -kv[1]['n']):
    for gp in groups:
        r = objs[gp[0]]
        if r['n'] == o['n'] and np.all(np.abs(r['dims'] - o['dims']) <= np.maximum(0.02, 0.02 * r['dims'])):
            gp.append(k); break
    else:
        groups.append([k])
groups = [gp for gp in groups if len(gp) >= 2]
print(f'{len(groups)} groups of objects with the same triangle count and size', file=sys.stderr)


def foot_origin(V):
    lo = V[:, 1].min()
    f = V[V[:, 1] < lo + 0.3]
    return np.array([f[:, 0].mean(), lo, f[:, 2].mean()])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def fit(ref, other):
    """The turn (about y) and the shift that bring the reference onto another object; returns (yaw, residual) with the points taken on the vertices."""
    A = ref - ref.mean(0)
    sub = np.linspace(0, len(other) - 1, min(len(other), 400)).astype(int)
    tree = cKDTree(other)
    best = (1e9, 0.0)
    for deg in range(0, 360, 3):
        R = rot_y(np.radians(deg))
        T = (A @ R.T)[sub] + other.mean(0)
        d, _ = tree.query(T)
        if d.mean() < best[0]:
            best = (d.mean(), deg)
    deg = best[1]
    ref_tree = None
    for step in (1.0, 0.25, 0.05):
        cand = np.arange(deg - 3 * step, deg + 3.01 * step, step)
        scores = []
        for dd in cand:
            R = rot_y(np.radians(dd))
            T = (A @ R.T)[sub] + other.mean(0)
            d, _ = tree.query(T)
            scores.append(d.mean())
        deg = cand[int(np.argmin(scores))]
    R = rot_y(np.radians(deg))
    # a final shift: the mean offset between the matched points
    T = A @ R.T + other.mean(0)
    d, idx = tree.query(T)
    shift = (other[idx] - T).mean(0)
    T2 = T + shift
    d2, _ = tree.query(T2)
    # and the reverse (the other object may have parts the reference has not)
    d3, _ = cKDTree(T2).query(other)
    return deg % 360, float(max(d2.mean(), d3.mean())), shift


kinds = []
for gp in groups:
    ref = objs[gp[0]]
    members = [gp[0]]
    inst = [{'obj': gp[0], 'x': 0, 'y': 0, 'z': 0}]
    o0 = foot_origin(ref['V'])
    inst[0].update({'x': round(float(o0[0]), 3), 'y': round(float(o0[1]), 3), 'z': round(float(o0[2]), 3), 'yaw': 0.0, 'err': 0.0})
    rejected = []
    for k in gp[1:]:
        o = objs[k]
        deg, err, shift = fit(ref['V'], o['V'])
        if err > TOL:
            rejected.append((k, round(err, 3)))
            continue
        # the foot of the reference, turned and shifted, is the foot of this object
        c = ref['V'].mean(0)
        R = rot_y(np.radians(deg))
        pos = (o0 - c) @ R.T + o['V'].mean(0) + shift
        inst.append({'obj': k, 'x': round(float(pos[0]), 3), 'y': round(float(pos[1]), 3), 'z': round(float(pos[2]), 3), 'yaw': round(float(deg), 2), 'err': round(err, 4)})
    if len(inst) < 2:
        continue
    kinds.append({'tris': ref['n'], 'dims': [round(float(x), 2) for x in ref['dims']], 'count': len(inst), 'rejected': rejected, 'instances': inst, 'ref_obj': gp[0]})

kinds.sort(key=lambda k: -k['count'] * k['tris'])
print(f"{'kind':>4} {'copies':>6} {'tris':>6}  size (m)            worst fit (cm)  turns")
for i, k in enumerate(kinds[:40]):
    yaws = sorted({round(x['yaw'] / 15) * 15 % 360 for x in k['instances']})
    print(f"{i:>4} {k['count']:>6} {k['tris']:>6}  {k['dims']}  {max(x['err'] for x in k['instances']) * 100:>6.1f}      {yaws}  (rejected {len(k['rejected'])})")
json.dump(kinds, open(outf, 'w'))
print(f'{len(kinds)} kinds of repeated objects -> {outf}', file=sys.stderr)
