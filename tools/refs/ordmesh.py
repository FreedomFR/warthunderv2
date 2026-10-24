#!/usr/bin/env python3
"""Bombs and torpedoes of the aircraft, from their reference models (baked with GLTF_MATNAME=0 bakeraw + bake.py --split=0 --tris=1000000000): each is turned so that its length lies along x with the
nose on +x (the end with the narrower cross-section: the tail has fins and propellers), centred on its length and on its axis, scaled to the real length, simplified with meshoptimizer and
recoloured (the luminance of the model's materials over the paint given: the model only says where the lights and darks are), then written as pieces of model/ordnance_v4.js:
  python3 tools/refs/ordmesh.py js/game/model/ordnance_v4.js bomb=refs/bomb500_v8/bake,1.45,3000,76,86,72 torpedo=refs/mk12torp_v8/bake,5.2,4000,93,100,104
each spec is <bake dir>,<length in m>,<triangles>,<r>,<g>,<b> of the paint[,flip] (flip: the guess of the nose from the cross-section is wrong for this model)."""
import sys, json, os, base64, subprocess, tempfile, shutil
import numpy as np
out = sys.argv[1]
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
SC = 1000
pieces = {}
for spec in sys.argv[2:]:
    name, rest = spec.split('=', 1)
    d, length, tris, r, g, b, *opt = rest.split(',')
    info = json.load(open(os.path.join(d, 'info.json')))
    nv, nf = info['vertices'], info['triangles']
    P = np.fromfile(os.path.join(d, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
    C = np.fromfile(os.path.join(d, 'colfull.u8'), dtype=np.uint8).reshape(nv, 3)
    I = np.fromfile(os.path.join(d, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
    ext = P.max(0) - P.min(0)
    ax = int(np.argmax(ext))
    perm = [ax] + [i for i in range(3) if i != ax]                      # the length first
    Q = P[:, perm]
    # the body is along x; of the two other axes the vertical one is the one that was y in the model when it is not the length (the origin is the axis: both centred on the middle of the body)
    lo, hi = Q.min(0), Q.max(0)
    span = hi[0] - lo[0]
    def section(sel):
        S = Q[sel]
        return float(np.ptp(S[:, 1]) * np.ptp(S[:, 2])) if len(S) else 0.0
    head = section(Q[:, 0] > hi[0] - span * 0.12); tail = section(Q[:, 0] < lo[0] + span * 0.12)
    if (tail < head) != bool(opt and opt[0] == 'flip'): Q[:, 0] = -Q[:, 0]; Q[:, 2] = -Q[:, 2]; lo, hi = Q.min(0), Q.max(0)      # the nose is the end with the narrower cross-section: turn it to +x (keeping the handedness)
    noseSel = Q[:, 0] > hi[0] - span * 0.25                 # the axis: the middle of the section of the nose end (the fins and the propellers of the tail make the bounding box lopsided)
    cy, cz = (Q[noseSel, 1].min() + Q[noseSel, 1].max()) / 2, (Q[noseSel, 2].min() + Q[noseSel, 2].max()) / 2
    Q = Q - np.array([(lo[0] + hi[0]) / 2, cy, cz])
    Q *= float(length) / span
    if np.linalg.det(np.eye(3)[perm]) < 0: I = I[:, ::-1]               # a swapped pair of axes flips the winding
    # recolour: the luminance of the model over the paint
    lum = C.astype(float).mean(axis=1, keepdims=True) / 255
    pc = np.array([float(r), float(g), float(b)]); lm = max(float(np.median(lum)), 1e-3)
    col = np.clip(pc * (0.55 + 0.45 * lum / lm), 0, 255).astype(np.uint8)
    # weld, simplify
    k = np.round(Q / 0.0005).astype(np.int64)
    _, first, inv = np.unique(k, axis=0, return_index=True, return_inverse=True)
    pos0 = Q[first].astype(np.float32); col0 = col[first]; idx0 = inv[I]
    idx0 = idx0[(idx0[:, 0] != idx0[:, 1]) & (idx0[:, 1] != idx0[:, 2]) & (idx0[:, 0] != idx0[:, 2])].astype(np.uint32)
    if len(idx0) > int(tris):
        tmp = tempfile.mkdtemp()
        try:
            pos0.tofile(os.path.join(tmp, 'pos.f32')); col0.tofile(os.path.join(tmp, 'col.u8')); idx0.tofile(os.path.join(tmp, 'idx.u32'))
            here = os.path.dirname(os.path.abspath(__file__))
            subprocess.run(['node', os.path.join(here, 'decimate.mjs'), tmp, tmp + '/out', f'--tris={int(tris)}'], check=True, capture_output=True)
            pos0 = np.fromfile(os.path.join(tmp, 'out', 'pos.f32'), dtype=np.float32).reshape(-1, 3)
            col0 = np.fromfile(os.path.join(tmp, 'out', 'col.u8'), dtype=np.uint8).reshape(-1, 3)
            idx0 = np.fromfile(os.path.join(tmp, 'out', 'idx.u32'), dtype=np.uint32).reshape(-1, 3)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    else:
        idx0 = idx0.reshape(-1, 3)
    wide = len(pos0) >= 65536
    pieces[name] = {'nv': int(len(pos0)), 'ni': int(idx0.size), 'pos': b64(np.round(pos0 * SC).astype(np.int16)), 'col': b64(col0), 'idx': b64(idx0.astype(np.uint32 if wide else np.uint16)), 'wide': bool(wide), 'length': float(length), 'radius': float(max(np.abs(pos0[:, 1]).max(), np.abs(pos0[:, 2]).max()))}
    print(name, len(idx0), 'triangles, radius', round(pieces[name]['radius'], 3), 'length', length)
head = ("// Bombs and torpedoes of the aircraft, drawn from their reference models (see docs/CREDITS.md; tools/refs/ordmesh.py): each piece lies along x with its nose on +x, centred on its middle and its axis,\n"
        "// at its real length (metres), the paint of the game over the lights and darks of the model. Read by model/planes.js (drawBomb, drawTorpedo).\n"
        f"export const SCALE = {SC};\nexport const ORDNANCE = ")
open(out, 'w').write(head + json.dumps(pieces) + ';\n')
print('written', out, os.path.getsize(out) // 1024, 'KB')
