#!/usr/bin/env python3
"""An aircraft drawn from its reference model (model/v4plane.js): the model cut into the pieces the game draws and destroys, in the frame of the game's aircraft.

  node tools/refs/gltf.mjs bakeraw refs/<id>/src refs/<id>/bake --loa=<anything> --draft=0        (GLTF_MATNAME=tex names the materials after their textures)
  python3 tools/refs/bake.py refs/<id>/bake --split=0.12 --rawout=refs/<id>/split                  (the mesh cut into small triangles, the colour of the textures at every vertex)
  python3 tools/refs/planegroups.py refs/<id>/split tools/refs/<key>_planegroups.json js/game/model/aircraft/<key>_v4.js [--probe] [--picture=out/planes/<key>.png]

The model is turned about the vertical so that the nose points to +x (the axis of the fuselage by PCA of the pieces `fuselage`, the side of the pieces `nose`), scaled so that its span (or its
length) is the real one, and moved so that the origin is 0.42 of the length behind the nose (as model/planes.js has it: `noseX = 0.42 L`), the axis of the engine at y = 0 and the middle of the
wings at z = 0. Every triangle then goes to a piece by the first rule it meets: a `material` regex on the names of the textures, a `box` [x0, x1, y0, y1, z0, z1] on its centre (game frame, metres),
else by place (`wing_z`: beyond this |z| it is a wing, `tail_x`: behind this x it is the tail). The pieces: body, tail, wing (wingL / wingR by the side), prop (the hub and the blades: turns about the
x axis), gear (the retractable undercarriage with its doors and the tail wheel: drawn while it is down), glass (the canopy panes: drawn as glass), canopy (a canopy that is painted in the texture of
the model: drawn with the body, not from the pilot's seat), drop (not kept: the gunner's gun, the pilot, a stray). Each piece is
simplified to its budget of triangles (quadric decimation, the boundary kept) and written as the other `*_v4.js` files (quantised positions, the colour of the texture at each vertex).
`--probe` prints what is in the model (extents of each material in the game frame, the measures that the spec sheet needs) and writes nothing.
"""
import sys, json, os, re, base64
import numpy as np
import open3d as o3d

pos_args = [a for a in sys.argv[1:] if not a.startswith('--')]
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
src, cfgf = pos_args[0], pos_args[1]
outf = pos_args[2] if len(pos_args) > 2 else None
cfg = json.load(open(cfgf))
SC = 400

info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3).astype(np.int64)
C = np.fromfile(os.path.join(src, 'colfull.u8'), dtype=np.uint8).reshape(nv, 3)
VM = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
AL = np.fromfile(os.path.join(src, 'alpha.u8'), dtype=np.uint8) if os.path.exists(os.path.join(src, 'alpha.u8')) else None      # (bake.py --alpha=1)
names = [m.get('name') or m.get('diffuse') or str(i) for i, m in enumerate(info['mats'])]
mname = lambda i: names[i] if 0 <= i < len(names) else ''

def sel_mats(rx):
    r = re.compile(rx, re.I)
    return np.array([bool(r.search(n)) for n in names])

# ---- the frame of the game ----
dropm = sel_mats(cfg['drop']) if cfg.get('drop') else np.zeros(len(names), bool)
fusm = sel_mats(cfg['fuselage']) if cfg.get('fuselage') else np.ones(len(names), bool)
nosem = sel_mats(cfg['nose']) if cfg.get('nose') else np.ones(len(names), bool)
vf = fusm[VM]; vn = nosem[VM]
if cfg.get('yaw') is not None:
    yaw = np.radians(cfg['yaw']); f = np.array([np.cos(yaw), np.sin(yaw)])
else:
    q = P[vf][:, [0, 2]]; c = q.mean(0); w, V = np.linalg.eigh(np.cov((q - c).T)); f = V[:, 0 if cfg.get('pca') == 'second' else -1]
    if cfg.get('axis_deg') is not None: f = np.array([np.cos(np.radians(cfg['axis_deg'])), np.sin(np.radians(cfg['axis_deg']))])      # (the line of the fuselage in the model, in degrees from its x axis towards z: the sign is found below)      # (pca: 'second' when the span is longer than the length: the long axis is then the wings)
    if cfg.get('nose'):
        cn = P[vn][:, [0, 2]].mean(0)
        if np.dot(cn - c, f) < 0: f = -f
    else:
        # no piece to tell the nose by: the tail is the end with the tall fin
        a = (P[:, [0, 2]] - c) @ f; hi, lo = a.max(), a.min(); span = hi - lo
        yh = P[a > hi - 0.2 * span][:, 1].max(); yl = P[a < lo + 0.2 * span][:, 1].max()
        if yh > yl: f = -f
    if cfg.get('nose_sign'): f = f * cfg['nose_sign']
ux, uz = f
# new x along the nose, new z to starboard (forward x up = right: right = (-uz, 0, ux) in the frame of the bake), y up
Q = np.stack([P[:, 0] * ux + P[:, 2] * uz, P[:, 1], -P[:, 0] * uz + P[:, 2] * ux], axis=1)
keep_v = ~dropm[VM]
wingm = sel_mats(cfg['wing']) if cfg.get('wing') else np.ones(len(names), bool)
sc_cfg = cfg['scale']
if 'span' in sc_cfg:
    z = Q[wingm[VM] & keep_v][:, 2]; scale = sc_cfg['span'] / (z.max() - z.min())
else:
    x = Q[keep_v][:, 0]; scale = sc_cfg['length'] / (x.max() - x.min())
Q *= scale
xn = Q[vn & keep_v][:, 0].max()                                      # the tip of the nose (the spinner, the hub)
xt = Q[keep_v][:, 0].min()
L = xn - xt
zw = Q[wingm[VM] & keep_v][:, 2]
zc = (zw.max() + zw.min()) / 2
hub = Q[vn & keep_v & (Q[:, 0] > xn - cfg.get('hub_depth', 0.5 if cfg.get('nose') else 0.35))]      # (hub_depth: how far behind the tip of the nose the centre of the spinner is read: not so far that the blades count, they are not about the axis)
ax = float(cfg['axis_y']) if 'axis_y' in cfg else float((hub[:, 1].max() + hub[:, 1].min()) / 2)
Q[:, 0] -= xn - 0.42 * L; Q[:, 1] -= ax; Q[:, 2] -= zc
low = Q[keep_v][:, 1].min()
print(f'turned {np.degrees(np.arctan2(uz, ux)):.1f} deg, scale {scale:.4f}, length {L:.2f} m, span {zw.max() - zw.min():.2f} m, axis {ax:.2f} m above the lowest point, ground {-low:.2f} m under the axis (origin x: nose at {0.42 * L:.2f})')

if fl.get('probe'):
    print('material                      tris     x0..x1        y0..y1        z0..z1')
    tm = VM[I[:, 0]]
    for i, n in enumerate(names):
        t = np.where(tm == i)[0]
        if len(t) == 0: continue
        v = np.unique(I[t]); q = Q[v]
        print(f'{n[:28]:28} {len(t):6}  {q[:,0].min():6.2f}..{q[:,0].max():6.2f} {q[:,1].min():6.2f}..{q[:,1].max():6.2f} {q[:,2].min():6.2f}..{q[:,2].max():6.2f}')
    sys.exit(0)

# ---- the pieces ----
cen = Q[I].mean(1)
tmat = VM[I[:, 0]]
part = np.full(len(I), '', dtype=object)
for r in cfg.get('rules', []):
    m = np.ones(len(I), bool)
    if 'material' in r: m &= sel_mats(r['material'])[tmat]
    if 'box' in r:
        b = r['box']
        m &= (cen[:, 0] >= b[0]) & (cen[:, 0] <= b[1]) & (cen[:, 1] >= b[2]) & (cen[:, 1] <= b[3]) & (cen[:, 2] >= b[4]) & (cen[:, 2] <= b[5])
    m &= part == ''
    if r['part'] == 'wing':
        part[m & (cen[:, 2] >= 0)] = 'wingR'; part[m & (cen[:, 2] < 0)] = 'wingL'
    else:
        part[m] = r['part']
dm = dropm[tmat]
if AL is not None and cfg.get('alpha', True):
    ta = (AL[I].min(1) if cfg.get('alpha_mode', 'min') == 'min' else AL[I].mean(1)) / 255.0; clear = ta < cfg.get('alpha_min', 0.8)      # (a card of a wire is opaque only on its line: a triangle that has a clear corner is not kept)
    print('transparent triangles dropped:', int((clear & (part == '')).sum()))
    part[clear & (part == '')] = 'drop'
part[dm & (part == '')] = 'drop'
wz, tx = cfg.get('wing_z', 1e9), cfg.get('tail_x', -1e9)
rest = part == ''
part[rest & (cen[:, 0] < tx)] = 'tail'
rest = part == ''
part[rest & (cen[:, 2] >= wz)] = 'wingR'; part[rest & (cen[:, 2] <= -wz)] = 'wingL'
part[part == ''] = 'body'

def drop_wires():
    # the aerial wires and stays of a model are thin lines of a few triangles that would float in the game: the connected objects that are long and hair-thin are dropped
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    key = np.round(Q / cfg.get('wire_weld', 0.003)).astype(np.int64); u, inv = np.unique(key, axis=0, return_inverse=True); n = len(u)
    rows = np.concatenate([inv[I[:, 0]], inv[I[:, 1]]]); cols = np.concatenate([inv[I[:, 1]], inv[I[:, 2]]])
    _, lab = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)), directed=False)
    comp = lab[inv[I[:, 0]]]
    out = 0
    for c in np.unique(comp):
        t = np.where(comp == c)[0]
        if len(t) > cfg.get('wire_tris', 6000): continue
        v = Q[np.unique(I[t])]; ext = np.sort(v.max(0) - v.min(0))
        if ext[2] > cfg.get('wire_len', 0.8) and (ext[1] < cfg.get('wire_thick', 0.06) or ext[0] < cfg.get('wire_flat', 0.02)):
            part[t] = 'drop'; out += len(t)
    print('wires dropped:', out, 'triangles')

if cfg.get('drop_wires'): drop_wires()

def measures():
    # what the sheet of the aircraft needs, read on the pieces (game frame)
    def vs(nm):
        t = np.where(part == nm)[0]
        return Q[np.unique(I[t])] if len(t) else np.zeros((0, 3))
    w = np.concatenate([vs('wingR'), vs('wingL') * np.array([1, 1, -1])])
    if len(w):
        print('wing |z|  LE x   TE x   chord   y0..y1')
        for z in np.linspace(max(0.8, wz if wz < 1e8 else 0.8), np.abs(w[:, 2]).max() * 0.98, 8):
            q = w[np.abs(w[:, 2] - z) < 0.12]
            if len(q): print(f'  {z:5.2f} {q[:,0].max():6.2f} {q[:,0].min():6.2f} {q[:,0].max() - q[:,0].min():6.2f}  {q[:,1].min():5.2f}..{q[:,1].max():5.2f}')
    t = vs('tail')
    if len(t): print(f'tail x {t[:,0].min():.2f}..{t[:,0].max():.2f}, span {2 * np.abs(t[:,2]).max():.2f}, top {t[:,1].max():.2f}; tailplane (|z|>0.5): x {t[np.abs(t[:,2]) > 0.5][:,0].min():.2f}..{t[np.abs(t[:,2]) > 0.5][:,0].max():.2f} y {np.median(t[np.abs(t[:,2]) > 0.5][:,1]):.2f}')
    bd = np.concatenate([vs('body'), t])
    print('fuselage: x  y0..y1  half width')
    for x in np.linspace(bd[:, 0].min() + 0.3, bd[:, 0].max() - 0.2, 9):
        q = bd[(np.abs(bd[:, 0] - x) < 0.12) & (np.abs(bd[:, 2]) < 1.3)]
        if len(q): print(f'  {x:5.2f}  {q[:,1].min():5.2f}..{q[:,1].max():5.2f}  {np.abs(q[:,2]).max():4.2f}')
    for nm in ('glass', 'canopy', 'prop', 'gear'):
        q = vs(nm)
        if len(q): print(f'{nm}: x {q[:,0].min():.2f}..{q[:,0].max():.2f} y {q[:,1].min():.2f}..{q[:,1].max():.2f} z {q[:,2].min():.2f}..{q[:,2].max():.2f}' + (f' radius {np.hypot(q[:,1], q[:,2]).max():.2f}' if nm == 'prop' else ''))

if fl.get('measures') or fl.get('probe2'): measures()

def pack(a):
    return base64.b64encode(a.tobytes()).decode()

def decimate(V, Ci, T, budget):
    if budget <= 0 or len(T) <= budget:
        return V, Ci, T
    m = o3d.geometry.TriangleMesh()
    m.vertices = o3d.utility.Vector3dVector(V); m.triangles = o3d.utility.Vector3iVector(T.astype(np.int32)); m.vertex_colors = o3d.utility.Vector3dVector(Ci / 255.0)
    m.merge_close_vertices(0.002); m.remove_degenerate_triangles(); m.remove_duplicated_triangles()
    m = m.simplify_quadric_decimation(target_number_of_triangles=int(budget), boundary_weight=float(cfg.get('boundary', 40.0)))
    m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
    return np.asarray(m.vertices), np.clip(np.asarray(m.vertex_colors) * 255, 0, 255), np.asarray(m.triangles)

def refine(V, T, tree, C0, maxedge, minedge, thr):
    # a triangle is cut in four where the paint changes under it (the colour of the model at its middle is not the mean of the colours at its corners: a roundel, a stripe, a panel edge), as long as
    # its longest edge is above `minedge`; and whatever the paint, one longer than `maxedge`. The colours are read at the vertices from the full-resolution mesh.
    V = np.asarray(V); T = np.asarray(T, dtype=np.int64)
    for _ in range(6):
        _, kv = tree.query(V); Cv = C0[kv].astype(np.float64)
        cen = V[T].mean(1); _, kc = tree.query(cen); Cc2 = C0[kc].astype(np.float64)
        diff = np.abs(Cc2 - Cv[T].mean(1)).max(axis=1)
        e = np.stack([np.linalg.norm(V[T[:, 1]] - V[T[:, 0]], axis=1), np.linalg.norm(V[T[:, 2]] - V[T[:, 1]], axis=1), np.linalg.norm(V[T[:, 0]] - V[T[:, 2]], axis=1)], axis=1)
        em = e.max(axis=1)
        big = ((diff > thr) & (em > minedge)) | (em > maxedge)
        if not big.any(): break
        keep, tb = T[~big], T[big]
        k = len(tb); n0 = len(V)
        a, b, c = tb[:, 0], tb[:, 1], tb[:, 2]
        V = np.concatenate([V, (V[a] + V[b]) / 2, (V[b] + V[c]) / 2, (V[c] + V[a]) / 2])
        ab = n0 + np.arange(k); bc = n0 + k + np.arange(k); ca = n0 + 2 * k + np.arange(k)
        T = np.concatenate([keep, np.concatenate([np.stack([a, ab, ca], 1), np.stack([ab, b, bc], 1), np.stack([ca, bc, c], 1), np.stack([ab, bc, ca], 1)])])
    return V, T

pieces = {}
budget = cfg.get('budget', {})
from scipy.spatial import cKDTree
def make_piece(name, V, Cc, T):
    if name in cfg.get('recolor', {}): Cc = np.tile(np.array(cfg['recolor'][name], dtype=np.float64), (len(V), 1))      # (a piece the model leaves unpainted: the blades of the propeller)
    q = np.round(V * SC).astype(np.int16)
    idx = T.astype(np.uint32)
    wide = int(len(V)) > 65535
    pieces[name] = {'nv': int(len(V)), 'ni': int(idx.size), 'pos': pack(q), 'col': pack(np.round(Cc).astype(np.uint8)), 'idx': pack(idx.astype(np.uint32 if wide else np.uint16)), 'wide': wide,
                    'bb': [round(float(x), 3) for x in (V.min(0).tolist() + V.max(0).tolist())]}
    print(f'{name:6} -> {len(T):6} triangles  box x {V[:,0].min():.2f}..{V[:,0].max():.2f}  y {V[:,1].min():.2f}..{V[:,1].max():.2f}  z {V[:,2].min():.2f}..{V[:,2].max():.2f}')

kept = {}
for name in sorted(set(part) - {'drop'}):
    if cfg.get('mirror_wings') and name == ('wingR' if cfg['mirror_wings'] == 'L' else 'wingL'): continue      # (made from the other wing below)
    t = np.where(part == name)[0]
    used = np.unique(I[t]); remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    V, Cc, T = Q[used], C[used].astype(np.float64), remap[I[t]]
    V0, C0 = V, Cc
    V, Cc, T = decimate(V, Cc, T, budget.get(name, 0))
    if cfg.get('refine') and name not in cfg.get('norefine', []):      # (the colour is then read again, at every vertex, from the full-resolution mesh)
        tree = cKDTree(V0)
        V, T = refine(V, T, tree, C0, cfg['refine'], cfg.get('minedge', 0.1), cfg.get('colthr', 28))
        d, k = tree.query(V); Cc = C0[k]
    kept[name] = (V, Cc, T)
    make_piece(name, V, Cc, T)
if cfg.get('mirror_wings'):      # an aircraft is symmetrical: the model's other wing may carry what the first does not (a stay, a hatch left open)
    src_n, dst_n = ('wingL', 'wingR') if cfg['mirror_wings'] == 'L' else ('wingR', 'wingL')
    V, Cc, T = kept[src_n]
    make_piece(dst_n, V * np.array([1.0, 1.0, -1.0]), Cc, T[:, ::-1])

if fl.get('picture'):
    from PIL import Image
    cols = {'body': (150, 150, 150), 'tail': (80, 160, 220), 'wingL': (220, 120, 60), 'wingR': (60, 200, 90), 'prop': (230, 60, 60), 'gear': (200, 60, 200), 'glass': (60, 220, 230), 'canopy': (240, 200, 60), 'drop': (255, 255, 0)}
    W = 1300; s = W / (L * 1.25 + 2); img = Image.new('RGB', (W * 3 // 2 + 40, 1200), (30, 32, 36)); px = img.load()
    for k in np.argsort(Q[I[:, 0]][:, 1]):
        pass
    ci = np.array([cols.get(p, (255, 255, 255)) for p in part])
    for (u, v, ox, oy) in ((0, 1, 20, 300), (0, 2, 20, 850)):
        sel = np.arange(0, len(I), max(1, len(I) // 250000))
        X = (Q[I[sel]].mean(1)[:, u] * s + ox + 0.42 * L * s).astype(int); Y = (oy - Q[I[sel]].mean(1)[:, v] * s).astype(int)
        for a, b, c in zip(X, Y, ci[sel]):
            if 0 <= a < img.width and 0 <= b < img.height: px[a, b] = tuple(c)
    # front view (z, y)
    X = (Q[I].mean(1)[:, 2] * s + 1100).astype(int); Y = (300 - Q[I].mean(1)[:, 1] * s).astype(int)
    for a, b, c in zip(X[::6], Y[::6], ci[::6]):
        if 0 <= a < img.width and 0 <= b < img.height: px[a, b] = tuple(c)
    os.makedirs(os.path.dirname(fl['picture']) or '.', exist_ok=True)
    img.save(fl['picture']); print('picture', fl['picture'])

if outf:
    keys = [k for k in ('body', 'tail', 'wingL', 'wingR', 'prop', 'gear', 'glass', 'canopy') if k in pieces]
    head = (f"// The {cfg.get('name', cfg.get('key', 'aircraft'))} built from its reference model (see docs/CREDITS.md; tools/refs/planegroups.py): the pieces the game draws and destroys (model/v4plane.js), in the frame of the game's aircraft\n"
            f"// (+x the nose, +y up, +z starboard; the axis of the engine at y = 0, the origin {0.42 * L:.2f} m behind the nose tip of {L:.2f} m), positions in 2.5 mm steps, the colour of the texture at each vertex.\n"
            f"export const SCALE = {SC};\nexport const MEASURES = {json.dumps({'length': round(float(L), 3), 'span': round(float(zw.max() - zw.min()), 3), 'ground': round(float(-low), 3), 'nose': round(float(0.42 * L), 3)})};\nexport const PLANE = ")
    open(outf, 'w').write(head + json.dumps({k: pieces[k] for k in keys}) + ';\n')
    print('written', outf, os.path.getsize(outf) // 1024, 'KB')
