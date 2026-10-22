#!/usr/bin/env python3
"""The gun mounts of a ship copied one by one from its reference model, as the model's own objects.

  node tools/refs/shiplayout.mjs <id> > refs/<dir>/layout.json
  python3 tools/refs/bake.py refs/<dir>/bake --split=0 --tris=1000000000 --out=refs/<dir>/full
  python3 tools/refs/elements.py refs/<dir>/full refs/<dir>/layout.json js/game/model/ships/<id>_elements.js [--report=out/elements/<id>.json]

The model is cut into its connected objects (vertices welded to 2 cm): the hull is the biggest one, a turret house, a barrel, a cupola, a shield are objects of their own. For each mount of the
game (position, yaw, the box of its house from the layout) the objects whose centre lies in its house box make its HOUSE, the objects in the corridor in front of it its GUNS; nothing is cut out of
a bigger mesh, so nothing of the neighbouring structure comes with it. Mounts whose objects have the same triangle counts are the same element (one copy is kept, the others are placed): the 46 cm
turrets A and B are one kind, C another; the 25 mm shields are one kind for all 40. The copy is written in the mount's own frame (house: origin at the training axis; guns: origin at the trunnion).
A mount that the model has no house for (a ring and a barrel only) is left to the game's own drawing. Output: a JS module { MOUNT_SCALE, KINDS: { id: { house, guns } }, MOUNT_KIND: { mountName: id } }.
Needs numpy and scipy, and node (tools/refs/decimate.mjs) for the simplification of the big copies (--house=20000 --guns=8000 triangles at most).
"""
import sys, json, os, base64, subprocess, tempfile, shutil
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, layf, outf = pos_args[:3]
MAXH, MAXG = int(fl.get('house', 20000)), int(fl.get('guns', 8000))
SC = 400
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3)
C = np.fromfile(os.path.join(src, 'col.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
lay = json.load(open(layf))
b64 = lambda a: base64.b64encode(a.tobytes()).decode()

# ---- the objects of the model ----
key = np.round(P / 0.02).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
J = inv.reshape(-1)[I]
nw = int(J.max()) + 1
rows = np.repeat(np.arange(nf), 3); cols = nf + J.reshape(-1)
g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nf + nw, nf + nw))
_, lab = connected_components(g, directed=False)
lt = lab[:nf]
ids, cnt = np.unique(lt, return_counts=True)
hull = ids[np.argmax(cnt)]
cen = P[I].mean(axis=1)
print(f'{len(ids)} objects, the hull has {cnt.max()} triangles', file=sys.stderr)
# per-object centre (mean of its triangle centres) and triangle count
order = np.argsort(lt, kind='stable')
bounds = np.searchsorted(lt[order], ids)
objs = {}
for k, i0 in zip(ids, bounds):
    pass
oc = {}
sums = np.zeros((lab.max() + 1, 3)); cn = np.zeros(lab.max() + 1)
np.add.at(sums, lt, cen); np.add.at(cn, lt, 1)
ocen = sums / np.maximum(cn[:, None], 1)
omin = np.full((lab.max() + 1, 3), 1e9); omax = np.full((lab.max() + 1, 3), -1e9)
for k3 in range(3):
    np.minimum.at(omin[:, k3], lt, cen[:, k3]); np.maximum.at(omax[:, k3], lt, cen[:, k3])
CORE = int(fl.get('core', 120))                    # an object of that many triangles is part of the mount; smaller ones (rails, bolts, ladders) only if they stand against one


def frame(m):
    c, s = np.cos(m['yaw']), np.sin(m['yaw'])
    def to_local(pts):
        dx, dz = pts[:, 0] - m['x'], pts[:, 2] - m['z']
        return np.stack([dx * c + dz * s, pts[:, 1] - m['y'], -dx * s + dz * c], axis=1)
    return to_local


def objects_in(m, box_u, box_w, box_y, REL=0.4):
    """The objects (not the hull) of a mount: those of CORE triangles whose centre is in the box of the mount frame, and the small ones that touch them (within 15 cm)."""
    L = frame(m)(ocen)
    ok = (cn > 0) & (L[:, 0] > box_u[0]) & (L[:, 0] < box_u[1]) & (np.abs(L[:, 2]) < box_w) & (L[:, 1] > box_y[0]) & (L[:, 1] < box_y[1])
    ok[hull] = False
    top = cn[ok].max() if ok.any() else 0
    big = ok & (cn >= max(CORE, REL * top))                   # the main objects: those that are not much smaller than the biggest one in the box (a deck plate under a shield, a rail, a ladder are not the mount)
    bigs = np.where(big)[0]
    if len(bigs) == 0:
        return []
    lo, hi = omin[bigs].min(0) - 0.15, omax[bigs].max(0) + 0.15
    near = ok & (cn < CORE) & np.all(ocen >= lo, axis=1) & np.all(ocen <= hi, axis=1)
    return [int(k) for k in np.where(big | near)[0]]


def piece(tri_ids, loc_of, shift, target):
    tris = I[tri_ids]
    used = np.unique(tris)
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    pos0 = (loc_of(P[used]) - shift).astype(np.float32)
    idx0 = remap[tris].astype(np.uint32)
    col0 = C[used]
    if len(idx0) > target:
        tmp = tempfile.mkdtemp()
        try:
            pos0.tofile(os.path.join(tmp, 'pos.f32')); col0.tofile(os.path.join(tmp, 'col.u8')); idx0.tofile(os.path.join(tmp, 'idx.u32'))
            here = os.path.dirname(os.path.abspath(__file__))
            subprocess.run(['node', os.path.join(here, 'decimate.mjs'), tmp, tmp + '/out', f'--tris={target}', '--err=0.002'], check=True, capture_output=True)
            pos0 = np.fromfile(os.path.join(tmp, 'out', 'pos.f32'), dtype=np.float32).reshape(-1, 3)
            col0 = np.fromfile(os.path.join(tmp, 'out', 'col.u8'), dtype=np.uint8).reshape(-1, 3)
            idx0 = np.fromfile(os.path.join(tmp, 'out', 'idx.u32'), dtype=np.uint32).reshape(-1, 3)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    else:
        idx0 = idx0.reshape(-1, 3)
    q = np.round(pos0 * SC).astype(np.int16)
    return {'nv': int(len(pos0)), 'ni': int(idx0.size), 'pos': b64(q), 'col': b64(col0), 'idx': b64(idx0.astype(np.uint16) if len(pos0) < 65536 else idx0), 'wide': bool(len(pos0) >= 65536)}


def hull_clip(m, box_u, box_w, box_y, RMAX=0):
    """The triangles of the hull object inside a box of the mount frame that make one piece round the training axis: for a mount that the model fused to its deck (the hood of a cupola on its tub), cut at the box
    and keep the pieces that stand over the axis (the neighbouring structure that the box also takes is a piece of its own and is dropped)."""
    L = frame(m)(cen)
    sel = np.where((lt == hull) & (L[:, 0] > box_u[0]) & (L[:, 0] < box_u[1]) & (np.abs(L[:, 2]) < box_w) & (L[:, 1] > box_y[0]) & (L[:, 1] < box_y[1]))[0]
    if len(sel) == 0:
        return np.zeros(0, dtype=np.int64)
    uv, ivs = np.unique(J[sel], return_inverse=True)
    ivs = ivs.reshape(-1, 3)
    r = np.repeat(np.arange(len(sel)), 3); c = len(sel) + ivs.reshape(-1)
    gg = coo_matrix((np.ones(len(r)), (r, c)), shape=(len(sel) + len(uv), len(sel) + len(uv)))
    _, lb = connected_components(gg, directed=False)
    lb = lb[:len(sel)]
    keep = []
    for k in np.unique(lb):
        t = sel[lb == k]
        if len(t) < 80:
            continue
        Lt = L[t]
        # the flat deck plate that the box also cuts (its edge would show as a saw): flat triangles lying at the foot of the piece are dropped
        e1 = P[I[t, 1]] - P[I[t, 0]]; e2 = P[I[t, 2]] - P[I[t, 0]]
        nn = np.cross(e1, e2); nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        foot = ((np.abs(nn[:, 1]) > 0.3) & (Lt[:, 1] < box_y[0] + 1.0)) | (Lt[:, 1] < box_y[0] + 0.5)
        if RMAX:                                                          # a small mount: nothing farther from the axis than its own radius (the wall of the tub, the neighbour's rail)
            foot |= np.hypot(Lt[:, 0], Lt[:, 2]) > RMAX
        t = t[~foot]; Lt = Lt[~foot]
        if len(t) < 80:
            continue
        if abs(Lt[:, 0].mean()) < 2.2 and abs(Lt[:, 2].mean()) < 2.2:                 # the piece is centred over the axis (within 2 m)
            keep.append(t)
    return np.concatenate(keep) if keep else np.zeros(0, dtype=np.int64)


kinds, mount_kind, sigs, report = {}, {}, {}, []
for m in lay['mounts']:
    x0, x1, z0, z1, y0, y1 = m['house']
    mg = float(fl.get('margin', 1.2))
    hw = max(abs(z0), abs(z1)) + mg
    # the house: the objects centred in the box of the game's house, a little wider (and, for a gun mount, up to the front of the house)
    house = objects_in(m, (x0 - mg, x1 + mg), hw, (y0 - 0.4, y1 + 0.6)) if not m['aa'] else objects_in(m, (x0 - mg, x1 + mg), hw, (y0 - 0.4, y1 + 1.2), REL=float(fl.get('relaa', 0.75)))
    if not house:
        report.append({'mount': m['name'], 'kind': m['variant'], 'result': 'no object in the house box'})
        continue
    guns = []
    if not m['aa'] and m['cal'] > 20:
        ghw = max(0.7, ((m['n'] - 1) / 2) * m['spacing'] + 0.9)
        ty = m['trun'][1]
        guns = [k for k in objects_in(m, (x1 - 1.5, m['reach'] + 1.0), ghw, (ty - 2.2, ty + 3.2)) if k not in house]
    # a long thin object of the house box (a barrel, its sleeve) is a gun, not a part of the house: it must be able to elevate
    if not m['aa'] and m['cal'] > 20:
        to_l = frame(m)
        for k in list(house):
            tk = np.where(lt == k)[0]
            Lk = to_l(P[I[tk]].reshape(-1, 3))
            ext = Lk.max(0) - Lk.min(0)
            if ext[0] >= 2.2 and ext[0] >= 2.0 * max(ext[1], ext[2]) and Lk[:, 0].mean() > 0.0:
                house.remove(k); guns.append(k)
    ht = np.isin(lt, house); gt = np.isin(lt, guns)
    clip = np.zeros(0, dtype=np.int64)
    if not m['aa'] and fl.get('clip', '1') == '1':
        clip = hull_clip(m, (x0 - 1.6, x1 + 1.6), max(abs(z0), abs(z1)) + 1.6, (y0 - 0.1, y1 + 1.5), RMAX=(max(abs(x0), abs(x1), abs(z0), abs(z1)) + float(fl.get('rmax', 0.9)) if m['cal'] <= 200 else 0))
        ht[clip] = True
    topn = max(int(cn[k]) for k in house)
    sig = (m['variant'], m['cal'], m['n'], int(len(clip) // 50), tuple(sorted(int(cn[k]) for k in house if cn[k] >= max(CORE, 0.4 * topn))), tuple(sorted(int(cn[k]) for k in guns if cn[k] >= CORE)))
    report.append({'mount': m['name'], 'kind': m['variant'], 'house_objects': len(house), 'house_tris': int(ht.sum()), 'clipped': int(len(clip)), 'guns_objects': len(guns), 'guns_tris': int(gt.sum())})
    if sig in sigs:
        mount_kind[m['name']] = sigs[sig]
        continue
    kid = f"k{len(kinds)}"
    sigs[sig] = kid
    mount_kind[m['name']] = kid
    to_local = frame(m)
    ent = {'variant': m['variant'], 'cal': m['cal'], 'n': m['n'], 'aa': m['aa'], 'from': m['name']}
    ent['house'] = piece(np.where(ht)[0], to_local, np.zeros(3), MAXH)
    if gt.any():
        ent['guns'] = piece(np.where(gt)[0], to_local, np.array([m['trun'][0], m['trun'][1], 0.0]), MAXG)
    kinds[kid] = ent
    print(f"{kid} {m['variant']}|{m['cal']} (from {m['name']}): house {int(ht.sum())} triangles in {len(house)} objects, guns {int(gt.sum())} in {len(guns)}", file=sys.stderr)
copied = sum(1 for k in mount_kind)
print(f'{copied} of {len(lay["mounts"])} mounts copied from the model, {len(kinds)} different elements', file=sys.stderr)
head = (f"// The gun mounts of the {lay['id']} copied from its reference model (see docs/CREDITS.md), element by element: one copy of each different mount in its own frame (house: origin at the training axis;\n"
        "// guns: origin at the trunnion), placed on every mount that has the same objects in the model. Generated by tools/refs/elements.py; read by model/elements.js. Positions in 2.5 mm steps.\n"
        f"export const MOUNT_SCALE = {SC};\nexport const KINDS = ")
open(outf, 'w').write(head + json.dumps(kinds) + ';\nexport const MOUNT_KIND = ' + json.dumps(mount_kind) + ';\n')
if 'report' in fl:
    os.makedirs(os.path.dirname(fl['report']) or '.', exist_ok=True)
    json.dump(report, open(fl['report'], 'w'), indent=1)
print(f'{outf}: {os.path.getsize(outf) / 1e6:.2f} MB', file=sys.stderr)
if 'debug' in fl:
    for m in lay['mounts']:
        if m['name'] == fl['debug']:
            x0, x1, z0, z1, y0, y1 = m['house']
            L = frame(m)(ocen)
            sel = [k for k in np.where((cn >= CORE))[0] if k != hull and abs(L[k, 0]) < 6 and abs(L[k, 2]) < 6 and -2 < L[k, 1] < 5]
            for k in sel: print(k, int(cn[k]), 'local centre', L[k].round(2), 'size', (omax[k] - omin[k]).round(2))
