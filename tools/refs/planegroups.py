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
clear = np.zeros(len(I), bool)
_n = np.cross(Q[I[:, 1]] - Q[I[:, 0]], Q[I[:, 2]] - Q[I[:, 0]]); absnz = np.abs(_n[:, 2]) / (np.linalg.norm(_n, axis=1) + 1e-12)
if AL is not None and cfg.get('alpha', True):
    ta = (AL[I].min(1) if cfg.get('alpha_mode', 'min') == 'min' else AL[I].mean(1)) / 255.0; clear = ta < cfg.get('alpha_min', 0.8)      # (a card of a wire is opaque only on its line: a triangle that has a clear corner is not kept)
for r in cfg.get('rules', []):
    m = np.ones(len(I), bool)
    if 'line' in r:      # [x0, y0, z0, x1, y1, z1, radius]: the triangles whose centre is within the radius of this segment (a wire or a stay of the model)
        l = np.array(r['line'][:6], dtype=float); a0, a1 = l[:3], l[3:]; dv = a1 - a0; tt = np.clip(((cen - a0) @ dv) / (dv @ dv), 0, 1)
        m &= np.linalg.norm(cen - (a0 + np.outer(tt, dv)), axis=1) < r['line'][6]
    if 'absnz' in r: m &= absnz >= r['absnz']      # (a rule on the triangles that face sideways: a flat card standing in the middle plane of the model)
    if 'clear' in r: m &= clear == bool(r['clear'])      # (a rule on the transparent triangles only, or on the opaque ones: the glass of a model that has one material)
    if 'material' in r: m &= sel_mats(r['material'])[tmat]
    if 'colour' in r:      # [r0, r1, g0, g1, b0, b1]: the mean colour of the triangle (the red inside of a brake, a stripe)
        q = r['colour']; mc = C[I].mean(1); m &= (mc[:, 0] >= q[0]) & (mc[:, 0] <= q[1]) & (mc[:, 1] >= q[2]) & (mc[:, 1] <= q[3]) & (mc[:, 2] >= q[4]) & (mc[:, 2] <= q[5])
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
    print('transparent triangles dropped:', int((clear & (part == '')).sum()))
    if cfg.get('alpha_drop', True): part[clear & (part == '')] = 'drop'      # ("alpha_drop": false keeps the clear triangles that no rule took, with the model's colour)
part[dm & (part == '')] = 'drop'
wz, tx = cfg.get('wing_z', 1e9), cfg.get('tail_x', -1e9)
rest = part == ''
part[rest & (cen[:, 0] < tx)] = 'tail'
rest = part == ''
part[rest & (cen[:, 2] >= wz)] = 'wingR'; part[rest & (cen[:, 2] <= -wz)] = 'wingL'
part[part == ''] = 'body'

if cfg.get('wing_envelope'):
    # the stays that run from the fuselage to the tips of the wings, welded to the wing of the model: along the span, the wing keeps the box (x, y) that the reference side (`side`, the one with the least of
    # them) fills, widened by `margin`; what lies outside it (a wire, a pole) is dropped on both wings. "wing_envelope": {"side": "R", "margin": [0.04, 0.04], "pct": 1.5, "bin": 0.15}
    we = cfg['wing_envelope']; ref = 'wing' + we.get('side', 'R'); mg = we.get('margin', [0.04, 0.04]); pc = we.get('pct', 1.5); bw_ = we.get('bin', 0.15)
    rs = part == ref; az = np.abs(cen[:, 2]); nb = int(np.ceil(az.max() / bw_)) + 1
    lo = np.full((nb, 2), np.nan); hi = np.full((nb, 2), np.nan)
    for b_ in range(nb):
        t = rs & (az >= b_ * bw_) & (az < (b_ + 1) * bw_)
        if t.sum() > 20:
            lo[b_] = np.percentile(cen[t][:, :2], pc, axis=0); hi[b_] = np.percentile(cen[t][:, :2], 100 - pc, axis=0)
            if 'ytop' in we: hi[b_, 1] = np.percentile(cen[t][:, 1], we['ytop'])      # (a wire along the top of the wing is a few per cent of its triangles in every slice: a lower percentile than the tips)
    for nm in ('wingL', 'wingR'):
        t = np.where(part == nm)[0]; bi = np.minimum((az[t] / bw_).astype(int), nb - 1)
        ok = ~np.isnan(lo[bi][:, 0]); out = ok & ((cen[t][:, 0] < lo[bi][:, 0] - mg[0]) | (cen[t][:, 0] > hi[bi][:, 0] + mg[0]) | (cen[t][:, 1] < lo[bi][:, 1] - mg[1]) | (cen[t][:, 1] > hi[bi][:, 1] + mg[1]))
        part[t[out]] = 'drop'; print(f'{nm}: {int(out.sum())} triangles outside the envelope dropped')

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

def decimate(V, Ci, T, budget, bw=None, weld=0.002, name=''):
    bw = cfg.get('boundary', 40.0) if bw is None else bw
    if budget <= 0 or len(T) <= budget:
        return V, Ci, T
    m = o3d.geometry.TriangleMesh()
    m.vertices = o3d.utility.Vector3dVector(V); m.triangles = o3d.utility.Vector3iVector(T.astype(np.int32)); m.vertex_colors = o3d.utility.Vector3dVector(Ci / 255.0)
    m.merge_close_vertices(weld); m.remove_degenerate_triangles(); m.remove_duplicated_triangles()
    if name in cfg.get('cluster', []):
        # a model made of loose shells (a fuselage with its interior, panels that do not share their edges) that the quadric decimation cannot reduce without eating its ends: the vertices are
        # gathered in cells of a grid whose size is found so that the triangles come near the budget (thin sheets, the wings, must not use it: the two skins would merge)
        lo, hi = 0.005, 0.5
        sc = np.array(cfg.get('cluster_scale', {}).get(name, [1, 1, 1]), dtype=np.float64)      # (`cluster_scale`: [1, 4, 1] makes the cells four times finer in height: a wing is a thin sheet, its two skins must stay apart)
        m.vertices = o3d.utility.Vector3dVector(np.asarray(m.vertices) * sc)
        ct = getattr(o3d.geometry.SimplificationContraction, cfg.get('cluster_contraction', 'Average'))      # (Average, Quadric, Center)
        for _ in range(14):
            vx = (lo * hi) ** 0.5
            t = m.simplify_vertex_clustering(vx, contraction=ct)
            if len(t.triangles) > budget: lo = vx
            else: hi = vx
        m = m.simplify_vertex_clustering(hi, contraction=ct)
        m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
        return np.asarray(m.vertices) / sc, np.clip(np.asarray(m.vertex_colors) * 255, 0, 255), np.asarray(m.triangles)
    m = m.simplify_quadric_decimation(target_number_of_triangles=int(budget), boundary_weight=float(bw))
    m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
    return np.asarray(m.vertices), np.clip(np.asarray(m.vertex_colors) * 255, 0, 255), np.asarray(m.triangles)

def refine(V, T, tree, C0, maxedge, minedge, thr, fine=None):
    # a triangle is cut in four where the paint changes under it (the colour of the model at its middle is not the mean of the colours at its corners: a roundel, a stripe, a panel edge), as long as
    # its longest edge is above `minedge`; and whatever the paint, one longer than `maxedge`. The colours are read at the vertices from the full-resolution mesh.
    V = np.asarray(V); T = np.asarray(T, dtype=np.int64)
    for _ in range(6):
        _, kv = tree.query(V); Cv = C0[kv].astype(np.float64)
        cen = V[T].mean(1); _, kc = tree.query(cen); Cc2 = C0[kc].astype(np.float64)
        diff = np.abs(Cc2 - Cv[T].mean(1)).max(axis=1)
        # (and the middle of each edge: a long thin triangle has its paint change along its length, which its centre does not show)
        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
            mid = (V[T[:, a_]] + V[T[:, b_]]) / 2; _, km = tree.query(mid)
            diff = np.maximum(diff, np.abs(C0[km].astype(np.float64) - (Cv[T[:, a_]] + Cv[T[:, b_]]) / 2).max(axis=1))
        e = np.stack([np.linalg.norm(V[T[:, 1]] - V[T[:, 0]], axis=1), np.linalg.norm(V[T[:, 2]] - V[T[:, 1]], axis=1), np.linalg.norm(V[T[:, 0]] - V[T[:, 2]], axis=1)], axis=1)
        em = e.max(axis=1)
        big = ((diff > thr) & (em > minedge)) | (em > maxedge)
        if fine: big |= (diff > fine[0]) & (em > fine[1])      # `fine`: [difference, edge]: a sharp edge of paint (a roundel against the camouflage) is followed down to a finer mesh than the soft mottling
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
    if name in cfg.get('recentre', {}): V = V - np.array(cfg['recentre'][name])      # (a piece that turns or is placed by the game: its own origin, e.g. the hub of the propeller)
    q = np.round(V * SC).astype(np.int16)
    idx = T.astype(np.uint32)
    wide = int(len(V)) > 65535
    pieces[name] = {'nv': int(len(V)), 'ni': int(idx.size), 'pos': pack(q), 'col': '' if name in cfg.get('nocolor', []) else pack(np.round(Cc).astype(np.uint8)), 'idx': pack(idx.astype(np.uint32 if wide else np.uint16)), 'wide': wide,
                    'bb': [round(float(x), 3) for x in (V.min(0).tolist() + V.max(0).tolist())]}
    print(f'{name:6} -> {len(T):6} triangles  box x {V[:,0].min():.2f}..{V[:,0].max():.2f}  y {V[:,1].min():.2f}..{V[:,1].max():.2f}  z {V[:,2].min():.2f}..{V[:,2].max():.2f}')

kept = {}
for name in sorted(set(part) - {'drop'}):
    if cfg.get('mirror_wings') and name == ('wingR' if cfg['mirror_wings'] == 'L' else 'wingL'): continue      # (made from the other wing below)
    t = np.where(part == name)[0]
    if name == 'body' and cfg.get('body_overlap'):      # (the body also carries the first `body_overlap` metres of the wings, so that the cut between the pieces, eroded by the simplification, shows no gap)
        t = np.concatenate([t, np.where(np.isin(part, ['wingL', 'wingR']) & (np.abs(cen[:, 2]) < wz + cfg['body_overlap']))[0]])
    used = np.unique(I[t]); remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    V, Cc, T = Q[used], C[used].astype(np.float64), remap[I[t]]
    V0, C0 = V, Cc
    V, Cc, T = decimate(V, Cc, T, budget.get(name, 0), cfg.get('boundary_by_piece', {}).get(name), cfg.get('weld_by_piece', {}).get(name, 0.002), name)
    if cfg.get('refine') and name not in cfg.get('norefine', []):      # (the colour is then read again, at every vertex, from the full-resolution mesh)
        tree = cKDTree(V0)
        ov = cfg.get('refine_by_piece', {}).get(name, {})      # (a piece whose texture is busy, the wings with their rivets, can be given its own thresholds)
        V, T = refine(V, T, tree, C0, cfg['refine'], ov.get('minedge', cfg.get('minedge', 0.1)), ov.get('colthr', cfg.get('colthr', 28)), ov.get('fine', cfg.get('fine')))
        d, k = tree.query(V); Cc = C0[k]
    nd = cfg.get('needles', {}).get(name)
    if nd:      # the decimation of a model made of loose shells leaves spikes: long thin triangles standing out of the surface; the ones in the box ("box", game frame) with a longest edge above "edge" and an area under "ar" of that edge squared are dropped
        V = np.asarray(V); T = np.asarray(T, dtype=np.int64); tri = V[T]
        e = np.stack([np.linalg.norm(tri[:, 1] - tri[:, 0], axis=1), np.linalg.norm(tri[:, 2] - tri[:, 1], axis=1), np.linalg.norm(tri[:, 0] - tri[:, 2], axis=1)], 1).max(1)
        ar = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) / 2
        ctr = tri.mean(1); b = nd['box']
        inb = (ctr[:, 0] >= b[0]) & (ctr[:, 0] <= b[1]) & (ctr[:, 1] >= b[2]) & (ctr[:, 1] <= b[3]) & (ctr[:, 2] >= b[4]) & (ctr[:, 2] <= b[5])
        bad = inb & (e > nd['edge']) & (ar < nd.get('ar', 0.15) * e * e)
        print(f'{name}: {int(bad.sum())} needle triangles dropped')
        T = T[~bad]; used = np.unique(T); remap = -np.ones(len(V), dtype=np.int64); remap[used] = np.arange(len(used)); V, Cc, T = V[used], np.asarray(Cc)[used], remap[T]
    kept[name] = (V, Cc, T)
    make_piece(name, V, Cc, T)
if cfg.get('mirror_wings'):      # an aircraft is symmetrical: the model's other wing may carry what the first does not (a stay, a hatch left open)
    src_n, dst_n = ('wingL', 'wingR') if cfg['mirror_wings'] == 'L' else ('wingR', 'wingL')
    V, Cc, T = kept[src_n]
    kept[dst_n] = (V * np.array([1.0, 1.0, -1.0]), Cc, T[:, ::-1]); make_piece(dst_n, *kept[dst_n])

for nm, c in cfg.get('copies', {}).items():
    # a piece made from the triangles of another one that lie in a box (game frame): the hull seen from the pilot's seat, the charred nacelle drawn over a burning engine
    V, Cc, T = kept[c['from']]; b = c['box']; ct = V[T].mean(1)
    sel = (ct[:, 0] >= b[0]) & (ct[:, 0] <= b[1]) & (ct[:, 1] >= b[2]) & (ct[:, 1] <= b[3]) & (ct[:, 2] >= b[4]) & (ct[:, 2] <= b[5])
    if c.get('axis'):      # [y, z, x0, r0, x1, r1]: only what lies within a radius of this axis that grows from r0 at x0 to r1 at x1 (a nacelle without the wing it runs through)
        ay, az, xa, ra, xb, rb = c['axis']; rr = np.hypot(ct[:, 1] - ay, ct[:, 2] - az); lim = ra + (rb - ra) * np.clip((ct[:, 0] - xa) / (xb - xa), 0, 1)
        sel &= rr <= lim
    T = T[sel]; used = np.unique(T); remap = -np.ones(len(V), dtype=np.int64); remap[used] = np.arange(len(used)); V, Cc, T = V[used], Cc[used], remap[T]
    if c.get('budget'): V, Cc, T = decimate(V, Cc, T, c['budget'])
    kept[nm] = (V, Cc, T); make_piece(nm, V, Cc, T)

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

if fl.get('views'):
    # three orthographic views (top, side, front) of the pieces, each coloured by its piece, the dropped triangles in yellow: --views=out/planes/<key>_views.png [--vpx=900]
    from PIL import Image
    cols = {'body': (160, 160, 160), 'tail': (80, 160, 220), 'wingL': (230, 130, 60), 'wingR': (60, 200, 90), 'prop': (230, 60, 60), 'gear': (200, 60, 200), 'glass': (60, 220, 230), 'canopy': (240, 200, 60), 'drop': (255, 255, 0)}
    for i in range(8): cols.setdefault(f'eng{i}', (90 + 20 * i, 120, 255 - 25 * i)); cols.setdefault(f'burn{i}', (120, 70, 40)); cols.setdefault('bay', (255, 120, 200))
    Wv = int(fl['vpx']) if isinstance(fl.get('vpx'), str) else 900
    ci = np.array([cols.get(p, (255, 255, 255)) for p in part], dtype=np.uint8)
    ctr = Q[I].mean(1); lo3, hi3 = ctr.min(0), ctr.max(0)
    if fl.get('vbox'):      # --vbox=x0,x1,y0,y1,z0,z1: only what is in this box (game frame), to look closer
        vb = [float(x) for x in fl['vbox'].split(',')]; lo3, hi3 = np.array(vb[0::2]), np.array(vb[1::2])
        inb = ((ctr >= lo3) & (ctr <= hi3)).all(1); ctr = ctr[inb]; ci = ci[inb]
    panels = []
    for (u, v, dep, sg) in ((0, 2, 1, 1), (0, 1, 2, 1), (2, 1, 0, 1)):
        ext_u, ext_v = hi3[u] - lo3[u] + 0.4, hi3[v] - lo3[v] + 0.4; s = min((Wv - 20) / ext_u, (Wv * 0.7 - 20) / ext_v)
        Hh = int(ext_v * s) + 20; im = np.full((Hh, Wv, 3), 34, np.uint8)
        order = np.argsort(ctr[:, dep])      # far to near: the top view looks down, the side view from starboard, the front view from the nose
        X = ((ctr[order, u] - lo3[u] + 0.2) * s + 10).astype(int); Y = ((hi3[v] - ctr[order, v] + 0.2) * s + 10).astype(int)
        okp = (X >= 1) & (X < Wv - 1) & (Y >= 1) & (Y < Hh - 1)
        X, Y, Cc = X[okp], Y[okp], ci[order][okp]
        for dx in (0, 1):
            for dy in (0, 1): im[Y + dy - 0, X + dx - 0] = Cc
        panels.append(im)
    Hmax = max(p.shape[0] for p in panels)
    out = np.concatenate([np.pad(p, ((0, Hmax - p.shape[0]), (0, 0), (0, 0)), constant_values=34) for p in panels], axis=0)
    os.makedirs(os.path.dirname(fl['views']) or '.', exist_ok=True)
    Image.fromarray(out).save(fl['views']); print('views', fl['views'], out.shape)

if fl.get('pic'):      # a picture of the pieces in three views (side and top on the left, front on the right), at --pscale px/m: --pic=out.png [--pview=body,tail] [--pzoom=x0,x1] [--pmat=regex] [--pclip=x0,x1,y0,y1,z0,z1]
    from PIL import Image
    cols = {'body': (170, 170, 170), 'tail': (80, 160, 220), 'wingL': (240, 130, 60), 'wingR': (60, 210, 90), 'prop': (240, 60, 60), 'gear': (210, 60, 210), 'glass': (60, 230, 240), 'canopy': (250, 210, 60), 'drop': (255, 255, 0)}
    show = fl['pview'].split(',') if fl.get('pview') else [k for k in cols if k != 'drop']
    sel = np.isin(part, show)
    if fl.get('pmat'): sel &= sel_mats(fl['pmat'])[tmat]
    if fl.get('pclip'):      # --pclip=x0,x1,y0,y1,z0,z1 (game frame)
        c = [float(v) for v in fl['pclip'].split(',')]
        sel &= (cen[:, 0] >= c[0]) & (cen[:, 0] <= c[1]) & (cen[:, 1] >= c[2]) & (cen[:, 1] <= c[3]) & (cen[:, 2] >= c[4]) & (cen[:, 2] <= c[5])
    cc = cen[sel]; pp = part[sel]
    ci = np.array([cols.get(p, (255, 255, 255)) for p in pp])
    x0, x1 = (float(v) for v in fl['pzoom'].split(',')) if fl.get('pzoom') else (cc[:, 0].min() - 0.3, cc[:, 0].max() + 0.3)
    s = float(fl.get('pscale', 70))
    y0, y1 = cc[:, 1].min() - 0.2, cc[:, 1].max() + 0.2
    zr = max(abs(cc[:, 2].min()), abs(cc[:, 2].max()), 1) + 0.3
    Wl = int((x1 - x0) * s) + 40; Hs = int((y1 - y0) * s) + 40; Ht = int(2 * zr * s) + 40; Wf = int(2 * zr * s) + 40
    img = Image.new('RGB', (Wl + Wf, max(Hs + Ht, Ht)), (30, 32, 36)); px = img.load()
    def dot(a, b, c):
        if 0 <= a < img.width - 1 and 0 <= b < img.height - 1: px[a, b] = px[a + 1, b] = px[a, b + 1] = px[a + 1, b + 1] = tuple(c)
    X = ((cc[:, 0] - x0) * s + 20).astype(int)
    for a, b, c in zip(X, ((y1 - cc[:, 1]) * s + 20).astype(int), ci): dot(a, b, c)
    for a, b, c in zip(X, ((cc[:, 2] + zr) * s + Hs + 20).astype(int), ci): dot(a, b, c)
    for a, b, c in zip(((cc[:, 2] + zr) * s + Wl + 20).astype(int), ((y1 - cc[:, 1]) * s + 20).astype(int), ci): dot(a, b, c)
    d = Image.new('RGB', (1, 1)); os.makedirs(os.path.dirname(fl['pic']) or '.', exist_ok=True)
    img.save(fl['pic']); print('picture', fl['pic'], img.size, 'scale', s, 'px/m  (x0', round(x0, 2), 'y1', round(y1, 2), 'zr', round(zr, 2), ')')

if outf:
    keys = [k for k in ('body', 'tail', 'wingL', 'wingR', 'prop', 'gear', 'glass', 'canopy') if k in pieces] + sorted(k for k in pieces if k not in ('body', 'tail', 'wingL', 'wingR', 'prop', 'gear', 'glass', 'canopy'))
    head = (f"// The {cfg.get('name', cfg.get('key', 'aircraft'))} built from its reference model (see docs/CREDITS.md; tools/refs/planegroups.py): the pieces the game draws and destroys (model/v4plane.js), in the frame of the game's aircraft\n"
            f"// (+x the nose, +y up, +z starboard; the axis of the engine at y = 0, the origin {0.42 * L:.2f} m behind the nose tip of {L:.2f} m), positions in 2.5 mm steps, the colour of the texture at each vertex.\n"
            f"export const SCALE = {SC};\nexport const MEASURES = {json.dumps({'length': round(float(L), 3), 'span': round(float(zw.max() - zw.min()), 3), 'ground': round(float(-low), 3), 'nose': round(float(0.42 * L), 3)})};\nexport const PLANE = ")
    open(outf, 'w').write(head + json.dumps({k: pieces[k] for k in keys}) + ';\n')
    print('written', outf, os.path.getsize(outf) // 1024, 'KB')
