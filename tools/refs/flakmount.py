#!/usr/bin/env python3
"""The quadruple 20 mm AA gun of the bases, copied from its reference model (a single mesh: carriage, shield, cradle with its four barrels, gunner's seat).

  node tools/refs/gltf.mjs bakeraw refs/flakvierling/src refs/flakvierling/bake --loa=4.1 --draft=0
  python3 tools/refs/flakmount.py refs/flakvierling/bake js/game/model/ships/flak_elements.js [--picture=out/flak/classes.png]
  python3 tools/refs/flakmount.py refs/flak88_v8/bake js/game/model/ships/flak_elements.js --kind=flak88 --merge=1 --noturn=1 --pitch=.. --trx=.. --try=.. --z0=0 --band=..   (the other guns of the bases)

The model faces -x with the barrels raised: it is turned to face +x, cut into its connected pieces (vertices welded to 4 mm), and the pieces that elevate with the barrels (the cradle, the four
barrels, the magazines, the sights, the gunner's seat) are told from the ones that train only (the trail and outriggers, the pedestal, the shield plates) by their place about the axis of the
barrels: the guns are turned down to level about the trunnion (origin of their frame) so that the game can raise them, the house keeps the origin at the training axis on the ground. The
output has the shape of the other `*_elements.js` (KINDS with a house and guns mesh), one kind `flak4`, for the guns of the bases (model/baseGuns.js).
"""
import sys, json, os, base64
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, outf = pos_args[:2]
SC = 400
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
C = np.fromfile(os.path.join(src, 'colfull.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
if not fl.get('noturn'):
    P = P * np.array([-1.0, 1.0, -1.0])      # half a turn about the vertical: the barrels face +x (--noturn=1: the model already faces +x)
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
if fl.get('paint'):                                      # --paint=r,g,b: a model drawn in flat dark materials takes this paint (the darkest stays a little darker than it, the lighter parts lighter)
    pc = np.array([float(x) for x in fl['paint'].split(',')]); lum = C.astype(float).mean(axis=1, keepdims=True) / 255
    C = np.clip(pc * (0.7 + 2.2 * lum), 0, 255).astype(np.uint8)

# the connected pieces
key = np.round(P / 0.004).astype(np.int64)
u, inv = np.unique(key, axis=0, return_inverse=True)
n = len(u)
rows = np.concatenate([inv[I[:, 0]], inv[I[:, 1]]]); cols = np.concatenate([inv[I[:, 1]], inv[I[:, 2]]])
_, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)), directed=False)
comp = lab[inv[I[:, 0]]]
ids = np.unique(comp)
box = {c: (P[np.unique(I[comp == c])].min(0), P[np.unique(I[comp == c])].max(0)) for c in ids}

# the axis of the barrels: the four long thin pieces of the barrels rise at 31.5 degrees (the model's pose); the trunnion is the point of the axis above the middle of the carriage
pitch = float(fl.get('pitch', 31.5)); PR = np.radians(pitch)
D = np.array([np.cos(PR), np.sin(PR), 0.0])
z0 = float(fl.get('z0', -0.085))                       # the centre line of the model (it is not on z = 0)
t0 = np.array([float(fl.get('trx', 0.45)), float(fl.get('try', 1.13)), z0])
Nn = np.array([-D[1], D[0], 0.0])
bandw = float(fl.get('band', 0.34)); amin = float(fl.get('amin', -0.55))
elev = set()
for c in ids:
    m = (box[c][0] + box[c][1]) / 2
    along = float(np.dot(m - t0, D)); off = abs(float(np.dot(m - t0, Nn)))
    if off < bandw and along > amin and m[1] > 0.5: elev.add(int(c))
if fl.get('elevmat') or fl.get('elevids'):                # a model whose elevating parts are told by their material or by hand (--elevmat=2 --elevids=65,82: piece numbers of the weld)
    vmat = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
    em = {int(x) for x in str(fl.get('elevmat', '')).split(',') if x}
    elev = {int(c) for c in ids if int(np.bincount(vmat[np.unique(I[comp == c])]).argmax()) in em}
    elev |= {int(x) for x in str(fl.get('elevids', '')).split(',') if x}
    elev -= {int(x) for x in str(fl.get('notelev', '')).split(',') if x}
print(len(elev), 'pieces elevate:', sorted(elev))

def rot(V, a):                                          # a turn about the z axis through the trunnion (negative: the guns come down to level)
    c_, s_ = np.cos(a), np.sin(a); d = V - t0
    return np.stack([d[:, 0] * c_ - d[:, 1] * s_, d[:, 0] * s_ + d[:, 1] * c_, d[:, 2]], axis=1)

def pack(tri_ids, V, target=0):
    """The triangles tri_ids at the positions V, welded at 1 mm and (target > 0) simplified with meshoptimizer to about `target` triangles: a detailed model of a gun has 50 000 triangles and a base has a dozen guns."""
    tris = I[tri_ids]; used = np.unique(tris)
    if target:
        import subprocess, tempfile, shutil
        k = np.round(V[used] / 0.001).astype(np.int64)
        _, first, inv2 = np.unique(k, axis=0, return_index=True, return_inverse=True)
        remap = -np.ones(nv, dtype=np.int64); remap[used] = inv2
        pos0 = V[used][first].astype(np.float32); col0 = C[used][first]
        idx0 = remap[tris]
        idx0 = idx0[(idx0[:, 0] != idx0[:, 1]) & (idx0[:, 1] != idx0[:, 2]) & (idx0[:, 0] != idx0[:, 2])].astype(np.uint32)
        if len(idx0) > target:
            tmp = tempfile.mkdtemp()
            try:
                pos0.tofile(os.path.join(tmp, 'pos.f32')); col0.tofile(os.path.join(tmp, 'col.u8')); idx0.tofile(os.path.join(tmp, 'idx.u32'))
                here = os.path.dirname(os.path.abspath(__file__))
                subprocess.run(['node', os.path.join(here, 'decimate.mjs'), tmp, tmp + '/out', f'--tris={target}'], check=True, capture_output=True)
                pos0 = np.fromfile(os.path.join(tmp, 'out', 'pos.f32'), dtype=np.float32).reshape(-1, 3)
                col0 = np.fromfile(os.path.join(tmp, 'out', 'col.u8'), dtype=np.uint8).reshape(-1, 3)
                idx0 = np.fromfile(os.path.join(tmp, 'out', 'idx.u32'), dtype=np.uint32).reshape(-1, 3)
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
        else:
            idx0 = idx0.reshape(-1, 3)
        wide = len(pos0) >= 65536
        return {'nv': int(len(pos0)), 'ni': int(idx0.size), 'pos': b64(np.round(pos0 * SC).astype(np.int16)), 'col': b64(col0), 'idx': b64(idx0.astype(np.uint32 if wide else np.uint16)), 'wide': bool(wide)}
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    q = np.round(V[used] * SC).astype(np.int16)
    idx = remap[tris].astype(np.uint32)
    return {'nv': int(len(used)), 'ni': int(idx.size), 'pos': b64(q), 'col': b64(C[used]), 'idx': b64(idx.astype(np.uint16)), 'wide': False}

gun_t = np.where(np.isin(comp, list(elev)))[0]; house_t = np.where(~np.isin(comp, list(elev)))[0]
Vg = rot(P, -PR)                                        # every vertex turned down (only the guns use it)
# the house: origin at the training axis (the middle of the footprint of the carriage) on its lowest point
hv = P[np.unique(I[house_t])]
foot = hv[hv[:, 1] < 0.45]
org = np.array([float(fl.get('ox', (foot[:, 0].min() + foot[:, 0].max()) / 2 if not 'ox' in fl else fl['ox'])), float(hv[:, 1].min()), z0])
print('training axis', org.round(3))
Vh = P - org
muz = float(np.max((Vg[np.unique(I[gun_t])])[:, 0]))      # the muzzle, from the trunnion
# the trunnion in the house frame: where the pivot stands over the training axis
trun_h = (t0 - org)
KIND = fl.get('kind', 'flak4')
T_H, T_G = int(fl.get('tris_house', 0)), int(fl.get('tris_guns', 0))      # --tris_house= / --tris_guns=: simplify to about that many triangles
kd = {'house': pack(house_t, Vh, T_H), 'guns': pack(gun_t, Vg, T_G), 'type': 'aa', 'from': KIND, 'trunnion': [round(float(trun_h[0]), 3), round(float(trun_h[1]), 3)], 'muzzle': round(muz, 3)}
head2 = ("// The anti-aircraft guns of the bases (Flakvierling, Flak 38, Flak 42, Flak 36, 40 mm Bofors and Vickers-Terni, the 38 cm turret), copied from their reference models (see docs/CREDITS.md; tools/refs/flakmount.py): the mesh of the carriage and shield (house: origin at the\n"
         "// training axis on the ground, the way the barrels point = +x) and of the cradle with its four barrels (guns: origin at the trunnion, level), as in the other *_elements.js.\n"
         f"export const MOUNT_SCALE = {SC};\nexport const KINDS = ")
kinds = {}
if fl.get('merge') and os.path.exists(outf):                 # --merge=1: keep the other kinds of the file (the guns of the bases share one file)
    txt = open(outf).read()
    kinds = json.loads(txt[txt.index('export const KINDS = ') + len('export const KINDS = '):txt.index(';\nexport const PLACEMENTS')])
kinds[KIND] = kd
open(outf, 'w').write(head2.replace('\\n', '\n') + json.dumps(kinds) + ';\nexport const PLACEMENTS = [];\n')
print('written', outf, 'house tris', len(house_t), 'guns tris', len(gun_t), 'muzzle', round(muz, 2))
json.dump({'elev': sorted(elev)}, open('/tmp/flak_elev.json', 'w'))
