#!/usr/bin/env python3
"""The gun houses and barrels of every kind of mount of a ship baked from its reference model (tools/refs/shiplayout.mjs wrote the layout, tools/refs/bake.py + decimate.mjs the arrays):
  python3 tools/refs/bakemounts2.py refs/<id>/baked_full refs/<id>/layout.json js/game/model/ships/<id>_mounts_baked.js refs/<id>/mounts_mask.json [--tris=6000] [--guns=3000]
For each kind of mount (variant, calibre, barrels) the first one is read: the pieces of the model that touch its house (the pieces joined to it by shared vertices, inside a box a little wider than the
house the game draws), in the mount's own frame, simplified; the house is what lies behind the front of the house box, the barrels what lies in front (or in the corridor of the barrels). The barrels
are drawn as guns about the trunnion of the family; the light AA keeps its own barrels. The tight box of what was taken goes to the mask (bakeship.mjs leaves it out of the hull mesh).
Needs numpy, scipy and open3d.
"""
import sys, json, os, base64
import numpy as np
import open3d as o3d
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, layf, outf, maskf = pos_args[:4]
TRIS_H, TRIS_G = int(fl.get('tris', 12000)), int(fl.get('guns', 5000))
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3)
C = np.fromfile(os.path.join(src, 'col.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
lay = json.load(open(layf))
over = json.load(open(fl['override'])) if 'override' in fl else {}          # --override=file.json: { key: { mount: 'm0', house: [x0, x1, z0, z1, y0, y1], reach } } where the house the game draws is not the one of the model
SC = 400

b64 = lambda a: base64.b64encode(a.tobytes()).decode()

def piece(sel, loc, target, shift):
    """One piece of the model in the mount frame, simplified by meshoptimizer (tools/refs/decimate.mjs: edge collapses onto existing vertices)."""
    import subprocess, tempfile, shutil
    tris = I[sel]
    if len(tris) < 4:
        return None
    used = np.unique(tris)
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    pos0 = (loc[used] - shift).astype(np.float32)
    idx0 = remap[tris].astype(np.uint32)
    col0 = C[used]
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
    q = np.round(pos0 * SC).astype(np.int16)
    return {'nv': int(len(pos0)), 'ni': int(idx0.size), 'pos': b64(q), 'col': b64(col0), 'idx': b64(idx0.astype(np.uint16) if len(pos0) < 65536 else idx0), 'wide': bool(len(pos0) >= 65536)}, pos0, idx0




def read_mount(m, key=None):
    """The triangles of the model that belong to this mount: (houseSel, gunSel, loc, ...) or None."""
    yaw = m['yaw']; cs, sn = np.cos(yaw), np.sin(yaw)
    dx, dz = P[:, 0] - m['x'], P[:, 2] - m['z']
    loc = np.stack([dx * cs + dz * sn, P[:, 1] - m['y'], -dx * sn + dz * cs], axis=1)             # u forward, y over the pivot, w starboard
    cen = loc[I].mean(axis=1)
    ov = over.get(key, {})
    x0, x1, z0, z1, y0, y1 = ov.get('house', m['house'])
    if 'reach' in ov:
        m = {**m, 'reach': ov['reach']}
    marg = float(fl.get('margin', 0.9))
    wmax = max(abs(z0), abs(z1)) + marg
    cand = (cen[:, 0] > x0 - marg) & (cen[:, 0] < max(x1, m['reach']) + 0.6) & (np.abs(cen[:, 2]) < wmax + (1.2 if not m['aa'] else 0)) & (cen[:, 1] > y0 - 0.3) & (cen[:, 1] < y1 + 4.0)
    ids = np.where(cand)[0]
    seeds = (cen[ids, 0] > x0 - 0.1) & (cen[ids, 0] < x1 + 0.1) & (cen[ids, 2] > z0 - 0.1) & (cen[ids, 2] < z1 + 0.1) & (cen[ids, 1] > y0 - 0.1) & (cen[ids, 1] < y1 + 0.3)
    if not seeds.any():
        return None
    tri = I[ids]
    u, inv = np.unique(tri, return_inverse=True)
    inv = inv.reshape(-1, 3)
    n_t, n_v = len(ids), len(u)
    rows = np.repeat(np.arange(n_t), 3); cols = n_t + inv.reshape(-1)
    g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n_t + n_v, n_t + n_v))
    _, lab = connected_components(g, directed=False)
    keep_labels = np.unique(lab[:n_t][seeds])
    S = ids[np.isin(lab[:n_t], keep_labels)]
    cut = x1 - 0.3
    # what is joined to the house but lies outside the box a little wider than it (a rail, a ladder, the next structure) is not the mount's
    inreg = (cen[S, 0] > x0 - 0.5) & (cen[S, 0] < max(x1, m['reach']) + 0.5) & (np.abs(cen[S, 2]) < max(abs(z0), abs(z1)) + 0.5) & (cen[S, 1] > y0 - 0.5) & (cen[S, 1] < max(y1, m['trun'][1] + 3.0) + 1.0)
    S = S[inreg]
    houseSel = np.zeros(nf, bool); gunSel = np.zeros(nf, bool)
    houseSel[S[cen[S, 0] <= cut]] = True
    gunSel[S[cen[S, 0] > cut]] = True
    if not m['aa'] and m['cal'] > 20:
        hw = max(0.7, ((m['n'] - 1) / 2) * m['spacing'] + 0.8 + (0.6 if m['cal'] >= 300 else 0))
        ty = m['trun'][1]
        corridor = (cen[:, 0] > cut) & (cen[:, 0] < m['reach'] + 0.6) & (np.abs(cen[:, 2]) < hw) & (cen[:, 1] > ty - 1.8) & (cen[:, 1] < ty + 2.6 + 0.85 * (cen[:, 0] - cut))                # (a cone: barrels at rest may be raised)
        gunSel |= corridor & ~houseSel
    if m['aa'] or m['cal'] <= 20:
        gunSel[:] = False
        houseSel[S] = True                                                                               # the whole piece (its barrels included) is the house for the light AA
    return houseSel, gunSel, loc


groups = {}
for m in lay['mounts']:
    groups.setdefault(f"{m['variant']}|{m['cal']}|{m['n']}|{'aa' if m['aa'] else 'gun'}", []).append(m)
out, mask = {}, {}
for key, ms in groups.items():
    # the mount of that kind where the model has the most to show (a turret that the model left without its house is skipped)
    best = None
    ms2 = [mm for mm in ms if mm['name'] == over[key]['mount']] if key in over and 'mount' in over[key] else ms[:12]
    for m in ms2:
        r = read_mount(m, key)
        if r and (best is None or r[0].sum() > best[1][0].sum()):
            best = (m, r)
    if not best:
        print(key, 'no triangle in any house box', file=sys.stderr); continue
    m, (houseSel, gunSel, loc) = best
    tx, ty = m['trun']
    ent = {}
    h = piece(houseSel, loc, min(TRIS_H, int(fl.get('aatris', 1800))) if m['aa'] else TRIS_H, np.zeros(3))
    if h: ent['house'] = h[0]
    if gunSel.sum() >= 100:
        gg = piece(gunSel, loc, TRIS_G, np.array([tx, ty, 0.0]))
        if gg: ent['guns'] = gg[0]
    if not ent:
        continue
    allsel = houseSel | gunSel
    lo, hi = loc[I[allsel]].reshape(-1, 3).min(0), loc[I[allsel]].reshape(-1, 3).max(0)
    mask[key] = [round(float(lo[0]) - 0.15, 2), round(float(hi[0]) + 0.15, 2), round(float(lo[2]) - 0.15, 2), round(float(hi[2]) + 0.15, 2), round(float(lo[1]) - 0.15, 2), round(float(hi[1]) + 0.15, 2)]
    out[key] = ent
    print(f"{key} (mount {m['name']}): house {ent.get('house', {}).get('ni', 0) // 3} tris, guns {ent.get('guns', {}).get('ni', 0) // 3} tris, box u {lo[0]:.1f}..{hi[0]:.1f} w {lo[2]:.1f}..{hi[2]:.1f} y {lo[1]:.1f}..{hi[1]:.1f}", file=sys.stderr)
head = f"// The gun houses and barrels of the {lay['id']}'s kinds of mount read on its reference model (see docs/CREDITS.md): one mount of each kind in its own frame (house: origin at the training axis;\n// guns: origin at the trunnion), simplified, the texture colours at the vertices. Generated by tools/refs/bakemounts2.py; read by model/mounts.js (bakedMount). Positions in 2.5 mm steps.\nexport const MOUNT_SCALE = {SC};\nexport const MOUNTS_BAKED = "
open(outf, 'w').write(head + json.dumps(out) + ';\n')
json.dump(mask, open(maskf, 'w'))
print(f'{outf}: {os.path.getsize(outf) / 1e6:.2f} MB', file=sys.stderr)
