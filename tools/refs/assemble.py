#!/usr/bin/env python3
"""Elements built from the repeated objects found by instances.py, and where the model has every one of them.

  python3 tools/refs/assemble.py refs/<dir>/full refs/<dir>/instances.json tools/refs/<id>_elements.json js/game/model/ships/<id>_elements.js

The config lists the elements: { "id": "e0", "type": "t25", "parts": [kind, kind, ...], "forward_deg": 90 }: `parts[0]` is the kind of the object that stands for the element (a gun shield), the other kinds are
the objects that belong to it (a ring under it): the nearest member of each kind to the first copy joins it (within 1.2 m across and 1.5 m high). `forward_deg` is where the first copy of the main
object faces in the ship's frame (0 = ahead, 90 = to starboard): the other copies are turned by their measured turn from it. The mesh is written with its origin at the middle of the foot of the main
object, the axes of the ship, the colours of the model; the placements (position of that foot, facing in the game's convention) are those measured on the model, one for every copy of the main object.
"""
import sys, json, os, base64
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
src, instf, cfgf, outf = pos_args[:4]
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
C = np.fromfile(os.path.join(src, 'col.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
K = json.load(open(instf))
cfg = json.load(open(cfgf))
SC = 400

key = np.round(P / 0.02).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
J = inv.reshape(-1)[I]
rows = np.repeat(np.arange(nf), 3); cols = nf + J.reshape(-1)
g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(nf + int(J.max()) + 1, nf + int(J.max()) + 1))
_, lab = connected_components(g, directed=False)
lt = lab[:nf]


def foot(V):
    lo = V[:, 1].min(); f = V[V[:, 1] < lo + 0.3]
    return np.array([f[:, 0].mean(), lo, f[:, 2].mean()])


def obj_tris(k):
    return np.where(lt == k)[0]


b64 = lambda a: base64.b64encode(a.tobytes()).decode()
kinds_out, placements = {}, []
for el in cfg['elements']:
    main = K[el['parts'][0]]
    ref = main['instances'][0]
    tri = [obj_tris(ref['obj'])]
    o0 = foot(P[np.unique(I[tri[0]])])
    for pk in el['parts'][1:]:
        best, bd = None, 1e9
        for m in K[pk]['instances']:
            d = np.hypot(m['x'] - o0[0], m['z'] - o0[2])
            if d < 1.2 and abs(m['y'] - o0[1]) < 1.5 and d < bd:
                best, bd = m, d
        if best is not None:
            tri.append(obj_tris(best['obj']))
        else:
            print(f"element {el['id']}: no member of kind {pk} next to the main object", file=sys.stderr)
    cyl = el.get('cylinder')                       # { radius, y0, y1 }: the whole objects (never cut) whose centre stands in the cylinder over the foot of a copy; every copy is checked against the first
    if cyl:
        ids_all = np.unique(lt)
        sums = np.zeros((lab.max() + 1, 3)); cn = np.zeros(lab.max() + 1)
        cen = P[I].mean(axis=1); np.add.at(sums, lt, cen); np.add.at(cn, lt, 1)
        ocen = sums / np.maximum(cn[:, None], 1)
        hullk = np.argmax(cn)
        def inside(o):
            ok = (cn > 0) & (np.hypot(ocen[:, 0] - o[0], ocen[:, 2] - o[2]) < cyl['radius']) & (ocen[:, 1] > o[1] + cyl['y0']) & (ocen[:, 1] < o[1] + cyl['y1'])
            ok[hullk] = False
            return [int(k) for k in np.where(ok)[0]]
        sets = []
        for m in main['instances']:
            ks = inside(np.array([m['x'], m['y'], m['z']]))
            sets.append(sorted(int(cn[k]) for k in ks if cn[k] >= 100))
        ref_set = sets[0]
        same = sum(1 for q in sets if q == ref_set)
        print(f"element {el['id']}: the cylinder takes {len(ref_set)} objects ({sum(ref_set)} triangles) on the first copy; {same} of {len(sets)} copies have exactly the same objects", file=sys.stderr)
        keys = inside(o0)
        gun_keys = []
        for k in keys:                                       # a long thin object is a gun: it is drawn as the guns of the mount, so that it elevates and recoils
            Vk = P[np.unique(I[obj_tris(k)])]
            ext = np.sort(Vk.max(0) - Vk.min(0))
            if ext[2] >= float(el.get('gun_min_len', 1.0)) and ext[1] < 0.3 and ext[0] < 0.3:
                gun_keys.append(k)
        tri = [obj_tris(k) for k in keys if k not in gun_keys]
        print(f"   {len(gun_keys)} thin objects of {len(keys)} are guns", file=sys.stderr)
        from collections import Counter
        cs = Counter(tuple(q) for q in sets)
        print('   the groups of copies (objects of 100 triangles or more):', [(v, list(k)) for k, v in cs.most_common(4)], file=sys.stderr)
    tris = I[np.concatenate(tri)]
    used = np.unique(tris)
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    f = np.radians(el.get('forward_deg', 90))                      # the copy is written in the mount's own frame: u (forward, the way the slot faces), y up, w (starboard of the mount)
    d = P[used] - o0
    pos = np.stack([d[:, 0] * np.cos(f) + d[:, 2] * np.sin(f), d[:, 1], -d[:, 0] * np.sin(f) + d[:, 2] * np.cos(f)], axis=1).astype(np.float32)
    idx = remap[tris].astype(np.uint32)
    q = np.round(pos * SC).astype(np.int16)
    gun_piece = None
    if cyl and gun_keys:
        gt = I[np.concatenate([obj_tris(k) for k in gun_keys])]
        gu = np.unique(gt); gr = -np.ones(nv, dtype=np.int64); gr[gu] = np.arange(len(gu))
        dg = P[gu] - o0
        gp = np.stack([dg[:, 0] * np.cos(f) + dg[:, 2] * np.sin(f), dg[:, 1], -dg[:, 0] * np.sin(f) + dg[:, 2] * np.cos(f)], axis=1)
        tx, ty = el.get('trunnion', [0.0, 1.0])
        gp = (gp - np.array([tx, ty, 0.0])).astype(np.float32)               # the guns' origin is the trunnion of the game's mount, so that they sit where the model has them at rest
        gq = np.round(gp * SC).astype(np.int16)
        gi = gr[gt].astype(np.uint32)
        gcol = C[gu]
        gun_piece = {'nv': int(len(gp)), 'ni': int(gi.size), 'pos': b64(gq), 'col': b64(gcol), 'idx': b64(gi.astype(np.uint16)), 'wide': False}
    kinds_out[el['id']] = {'guns': gun_piece, 'house': {'nv': int(len(pos)), 'ni': int(idx.size), 'pos': b64(q), 'col': b64(C[used]), 'idx': b64(idx.astype(np.uint16)), 'wide': False}, 'type': el['type']}
    for m in main['instances']:
        yaw = (el.get('forward_deg', 90) - m['yaw']) % 360
        if yaw > 180: yaw -= 360
        placements.append({'kind': el['id'], 'type': el['type'], 'x': m['x'], 'y': m['y'], 'z': m['z'], 'yaw': round(float(np.radians(yaw)), 5), 'err': m['err']})
    print(f"element {el['id']} ({el['type']}): {len(np.unique(tris))} vertices, {len(tris)} triangles, placed {len(main['instances'])} times", file=sys.stderr)
head = (f"// Elements copied from the reference model of the {cfg.get('ship', '')} (see docs/CREDITS.md) by tools/refs/instances.py + assemble.py: the mesh of each (origin at the middle of its foot, the ship's axes)\n"
        "// and the places where the model has it (x, y, z of the foot over the waterline, yaw in the game's convention). Positions in 2.5 mm steps.\n"
        f"export const MOUNT_SCALE = {SC};\nexport const KINDS = ")
open(outf, 'w').write(head + json.dumps(kinds_out) + ';\nexport const PLACEMENTS = ' + json.dumps(placements) + ';\n')
print(f'{outf}: {os.path.getsize(outf) / 1e3:.0f} kB', file=sys.stderr)
