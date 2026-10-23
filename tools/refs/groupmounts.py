#!/usr/bin/env python3
"""The mounts of a ship copied from a reference model whose groups are the ship's own elements (an OBJ with one named group per turret, shield, gun...).

  node tools/refs/gltf.mjs bakeraw refs/<dir>/src refs/<dir>/bake --loa=263 --draft=<waterline over the lowest point>
  python3 tools/refs/groupmounts.py refs/<dir>/bake tools/refs/<id>_groupmounts.json js/game/model/ships/<id>_elements.js [--report=out/groupmounts/<id>.json]

The config: { "ship": "Yamato", "elements": [ { "id": "t46", "type": "main", "material": "JGM164_460mm45", "min_tris": 5000, "split": true }, ... ] }
An element is the set of groups whose material name contains `material` (and with at least `min_tris` triangles): the copies of one kind of mount. For each one the tool
  - cuts the group into its connected objects (vertices welded to 1 cm);
  - with `split`: the barrels are the objects at least `barrel_len` long and 3 times longer than thick, the cradles the objects that touch a barrel's rear end; together the GUNS; the rest is the HOUSE;
  - measures the training axis (the middle of the footprint of the biggest object of the house, at its lowest point), the way the barrels point (the rest direction), and the trunnion (the rear of the
    cradle, or of the barrel, at the height of the barrels' axis);
  - checks that all copies are the same element (same triangle count, same shape when turned to face the same way).
The mesh of the first copy is written once, in the mount's frame (house: origin at the training axis on its lowest point, the way the barrels point = +x; guns: origin at the trunnion), the placements
(x, y, z over the waterline and the rest direction in the game's convention: the angle of +x of the mount in the ship's (x, z) plane) for every copy.
Needs numpy and scipy.
"""
import sys, json, os, base64
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
fl = dict((x[2:].split('=') + ['1'])[:2] for x in sys.argv[1:] if x.startswith('--'))
src, cfgf, outf = pos_args[:3]
SC = 400
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
C = np.fromfile(os.path.join(src, 'colfull.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32)
if np.einsum('ij,ij->i', P[I[:, 0]], np.cross(P[I[:, 1]], P[I[:, 2]])).sum() > 0:      # a model exported mirrored is wound the other way (see shipgroups.py)
    I = I[:, [0, 2, 1]]
cfg = json.load(open(cfgf))
mats = [m['name'] for m in info['mats']]
parts = info['parts']
tp = VP[I[:, 0]]
b64 = lambda a: base64.b64encode(a.tobytes()).decode()


def components(tris):
    key = np.round(P[I[tris]].reshape(-1, 3) / 0.01).astype(np.int64)
    u, inv = np.unique(key, axis=0, return_inverse=True)
    J = inv.reshape(-1, 3)
    n = len(tris)
    rows = np.repeat(np.arange(n), 3); cols = n + J.reshape(-1)
    g = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n + len(u), n + len(u)))
    _, lab = connected_components(g, directed=False)
    return lab[:n]


def bbox(tris):
    V = P[I[tris]].reshape(-1, 3)
    return V.min(0), V.max(0)


def has(m, name):
    return name == m[:-1] if m.endswith('$') else m in name      # a material written with a final $ must match the whole name (mesh_1$ is not mesh_10)


def analyse(gtris, el):
    gm = el.get('gun_materials'); gbox = el.get('gun_box')
    if gm or gbox:     # the pieces of the guns' materials (or the triangles whose centre lies in the box `gun_box` of the model: the barrel of a gun whose house and barrel are one piece) are separated from the rest first (a barrel touching its cradle is not one object)
        if gbox:
            cen = P[I[gtris]].mean(axis=1)
            isg = (cen[:, 0] >= gbox[0]) & (cen[:, 0] <= gbox[1]) & (cen[:, 1] >= gbox[2]) & (cen[:, 1] <= gbox[3]) & (cen[:, 2] >= gbox[4]) & (cen[:, 2] <= gbox[5])
        else:
            isg = np.array([parts[tp[t]]['mat'] >= 0 and any(m in mats[parts[tp[t]]['mat']] for m in gm) for t in gtris])
        lab = np.zeros(len(gtris), dtype=np.int64)
        if (~isg).any(): lab[~isg] = components(gtris[~isg])
        if isg.any(): lab[isg] = components(gtris[isg]) + (lab.max() + 1)
        gun_set = set(int(k) for k in np.unique(lab[isg]))
        if el.get('gun_min_len') and gun_set:     # only the long pieces of those materials are guns, the others (rails, sights) belong to the house
            def hlen(k):
                V = P[I[gtris[lab == k]]].reshape(-1, 3); return max(np.ptp(V[:, 0]), np.ptp(V[:, 2]))
            gun_set = set(k for k in gun_set if hlen(k) >= float(el['gun_min_len']))
    else:
        lab = components(gtris); gun_set = set()
    comps = {int(k): gtris[lab == k] for k in np.unique(lab)}
    info_c = {k: bbox(t) for k, t in comps.items()}
    house_k = max((k for k in comps if k not in gun_set), key=lambda k: np.prod(info_c[k][1] - info_c[k][0] + 1e-3))
    barrels = []
    if el.get('split'):
        blen = float(el.get('barrel_len', 2.0))
        for k, (lo, hi) in info_c.items():
            ext = hi - lo
            length, width = max(ext[0], ext[2]), min(ext[0], ext[2])
            if k != house_k and length >= blen and length >= float(el.get('barrel_ratio', 3.0)) * max(width, 0.05) and ext[1] <= length / 3 and ext[1] >= 0.1 and comps[k].size >= 20:
                barrels.append(k)
        if barrels:                                          # the guns are the longest of them (the others are rails, sights, ladders)
            Lmax = max(max(info_c[k][1][0] - info_c[k][0][0], info_c[k][1][2] - info_c[k][0][2]) for k in barrels)
            barrels = [k for k in barrels if max(info_c[k][1][0] - info_c[k][0][0], info_c[k][1][2] - info_c[k][0][2]) >= 0.6 * Lmax]
    if gun_set:          # a model whose materials say which pieces are the guns: those, whatever their shape
        barrels = [k for k in gun_set if comps[k].size >= 20]
    # the way the barrels point: along their long axis, towards the side away from the middle of the rest of the mount
    hlo, hhi = info_c[house_k]
    yaw = 0.0
    if barrels:
        rest = np.concatenate([comps[k] for k in comps if k not in barrels])
        hc = P[I[rest]].reshape(-1, 3).mean(0)
        bc = np.mean([(info_c[k][0] + info_c[k][1]) / 2 for k in barrels], axis=0)
        exts = np.array([info_c[k][1] - info_c[k][0] for k in barrels]).mean(0)
        axis = np.array([1.0, 0, 0]) if exts[0] >= exts[2] else np.array([0, 0, 1.0])
        sign = 1.0 if np.dot(bc - hc, axis) >= 0 else -1.0
        v = axis * sign
        if el.get('barrel_axis') == 'exact':      # a gun trained off the ship's axes at rest: the way its barrels really point (principal axis of their points in plan), so that its elevation turns about the right line
            Vb = np.concatenate([P[I[comps[k]]].reshape(-1, 3) for k in barrels])[:, [0, 2]]
            Vb = Vb - Vb.mean(0)
            w_, U_ = np.linalg.eigh(Vb.T @ Vb)
            d_ = U_[:, 1]
            if np.dot(d_, [v[0], v[2]]) < 0: d_ = -d_
            v = np.array([d_[0], 0, d_[1]])
        yaw = float(np.degrees(np.arctan2(v[2], v[0])))
    elif el.get('facing') == 'thin':                      # no separate guns, but long thin pieces (the barrels) that stick out of the mount: it faces from the middle of the rest to them, snapped to a right angle when it is within 25 degrees
        thin = [k for k, (lo, hi) in info_c.items() if max(hi[0] - lo[0], hi[2] - lo[2]) >= float(el.get('thin_len', 0.9)) and max(hi[0] - lo[0], hi[2] - lo[2]) >= 3.5 * max(min(hi[0] - lo[0], hi[2] - lo[2]), 0.02) and hi[1] - lo[1] < 0.6 * max(hi[0] - lo[0], hi[2] - lo[2])]
        if thin:
            rest = [k for k in comps if k not in thin]
            def cen(ks): t_ = np.concatenate([comps[k] for k in ks]); V_ = P[I[t_]].reshape(-1, 3); return V_.mean(0)
            d = cen(thin) - (cen(rest) if rest else cen(list(comps)))
            yaw = float(np.degrees(np.arctan2(d[2], d[0])))
            sn = np.round(yaw / 90) * 90
            if abs(((yaw - sn + 180) % 360) - 180) < 25: yaw = float(sn)
    elif el.get('facing') == 'mass':                       # no barrels to tell the way: it faces away from the heavy side (a shield's slot, an open gun's muzzles), snapped to a right angle
        tt = np.concatenate(list(comps.values()))
        A, B, Cc = P[I[tt, 0]], P[I[tt, 1]], P[I[tt, 2]]
        ar = np.linalg.norm(np.cross(B - A, Cc - A), axis=1) / 2
        cen = ((A + B + Cc) / 3 * ar[:, None]).sum(0) / ar.sum()
        lo, hi = bbox(tt)
        d = cen - (lo + hi) / 2
        yaw = float(np.round(np.degrees(np.arctan2(-d[2], -d[0])) / 90) * 90)
    elif 'yaw' in el:
        yaw = float(el['yaw'])
    return comps, info_c, house_k, barrels, float(yaw)


def to_mount(pts, origin, yaw_deg):
    a = np.radians(yaw_deg)
    c, s = np.cos(a), np.sin(a)
    d = pts - origin
    return np.stack([d[:, 0] * c + d[:, 2] * s, d[:, 1], -d[:, 0] * s + d[:, 2] * c], axis=1)


def pack(tri_ids, origin, yaw_deg, shift):
    tris = I[tri_ids]
    used = np.unique(tris)
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    pos = (to_mount(P[used], origin, yaw_deg) - shift).astype(np.float32)
    idx = remap[tris].astype(np.uint32)
    q = np.round(pos * SC).astype(np.int16)
    return {'nv': int(len(pos)), 'ni': int(idx.size), 'pos': b64(q), 'col': b64(C[used]), 'idx': b64(idx.astype(np.uint16) if len(pos) < 65536 else idx), 'wide': bool(len(pos) >= 65536)}


kinds, placements, report = {}, [], []
# a model whose materials are merged has no group per mount: `layout_match` picks, for each mount record of the game that matches ({"group": "main", "cal": 127}), the whole objects (connected pieces of
# one material) that lie entirely inside a window round the record (`radius`, `below`, `above` in metres), pieces taken by an earlier element left out. Nothing is cut.
LAYOUT = json.load(open(cfg['layout'])) if cfg.get('layout') else None
if LAYOUT or any('template' in e or 'cluster' in e for e in cfg['elements']):
    order = np.argsort(tp, kind='stable'); tps = tp[order]
    st = np.searchsorted(tps, np.arange(len(parts))); en = np.searchsorted(tps, np.arange(len(parts)), side='right')
    PBMIN = np.full((len(parts), 3), 1e9); PBMAX = np.full((len(parts), 3), -1e9); PN = en - st
    for k in range(len(parts)):
        if PN[k]:
            V = P[I[order[st[k]:en[k]]]].reshape(-1, 3); PBMIN[k] = V.min(0); PBMAX[k] = V.max(0)
claimed = set()
PCEN = (PBMIN + PBMAX) / 2 if 'PBMIN' in dir() else None
PKEY = {}


def part_key(k):
    e = np.round(np.sort(PBMAX[k] - PBMIN[k]), 2)
    return (int(parts[k]['mat']), int(PN[k]), float(e[0]), float(e[1]), float(e[2]))


def find_copies(tpl, min_frac=0.9, tol=0.06):
    """The copies of a set of pieces (a mount found once): the same pieces (same material, triangle count and size) at the same places relative to the biggest one, turned by a multiple of 90 degrees about the
    vertical and shifted (also in height). Returns a list of lists of pieces, the template first."""
    if not PKEY:
        for k in range(len(parts)):
            if PN[k] >= 4:
                PKEY.setdefault(part_key(k), []).append(k)
    anchor = max(tpl, key=lambda k: PN[k]); A = PCEN[anchor]
    tot = sum(PN[k] for k in tpl)
    out = [list(tpl)]; used = set(tpl)
    cands = [k for k in PKEY.get(part_key(anchor), []) if k not in used and k not in claimed]
    rots = [np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]]) for a in np.radians([0, 90, 180, 270])]
    for c in cands:
        if c in used:
            continue
        best = None
        for R in rots:
            C = PCEN[c]; m = [c]; tris = PN[c]
            ok = True
            for t in tpl:
                if t == anchor:
                    continue
                pc = R @ (PCEN[t] - A) + C
                hit = None
                for q in PKEY.get(part_key(t), []):
                    if q in used or q in claimed or q in m:
                        continue
                    if np.abs(PCEN[q] - pc).max() < tol:
                        hit = q; break
                if hit is not None:
                    m.append(hit); tris += PN[hit]
            if best is None or tris > best[0]:
                best = (tris, m)
        if best and best[0] >= min_frac * tot:
            out.append(best[1]); used.update(best[1])
    return out


for el in cfg['elements']:
    sel = []
    if 'template' in el:
        T = el['template']; mt = int(T.get('min_part_tris', 4))
        xr, zr = T['x_range'], T['z_range']
        ok = np.where((PN >= mt) & (PBMIN[:, 0] >= T['x'] + xr[0]) & (PBMAX[:, 0] <= T['x'] + xr[1]) & (PBMIN[:, 2] >= T['z'] + zr[0]) & (PBMAX[:, 2] <= T['z'] + zr[1]) & (PBMIN[:, 1] >= T['y'] - T.get('below', 1.5)) & (PBMAX[:, 1] <= T['y'] + T.get('above', 6.0)))[0]
        ok = [int(k) for k in ok if k not in claimed and (not T.get('materials') or (parts[k]['mat'] >= 0 and any(has(m, mats[parts[k]['mat']]) for m in T['materials'])))]
        if not ok:
            print(f"element {el['id']}: nothing in the template window", file=sys.stderr); continue
        inst = find_copies(ok, 0.5)
        if len(inst) > 1:       # the template caught things that belong to the place (a rail, a ladder): keep the pieces that most of the copies have, and look again with those only
            cnt = {k: sum(1 for ks in inst if any(part_key(q) == part_key(k) for q in ks)) for k in ok}
            core = [k for k in ok if cnt[k] >= 0.7 * len(inst)]
            if core:
                ok = core; claimed_before = set(claimed)
                inst = find_copies(ok, float(el.get('min_frac', 0.9)))
        if el.get('grow'):      # the pieces the copies do not share (barrels trained or elevated differently) are given to the nearest copy, within `radius` (m) of its first piece
            gr = el['grow']; rad = float(gr.get('radius', 3.5)); gm = gr.get('materials') or el['template'].get('materials') or []
            anchors = [PCEN[ks[0]] for ks in inst]
            extra = [k for k in range(len(parts)) if PN[k] >= 1 and k not in claimed and not any(k in ks for ks in inst) and parts[k]['mat'] >= 0 and any(m in mats[parts[k]['mat']] for m in gm)]
            for k in extra:
                d = [np.hypot(PCEN[k][0] - a[0], PCEN[k][2] - a[2]) for a in anchors]
                j = int(np.argmin(d))
                if d[j] <= rad: inst[j].append(k)
        if el.get('instance_box'):      # only the copies whose first piece lies in this box [x0, x1, z0, z1] (a template made of a few pieces also finds them elsewhere)
            bx = el['instance_box']
            inst = [ks for ks in inst if bx[0] <= PCEN[ks[0]][0] <= bx[1] and bx[2] <= PCEN[ks[0]][2] <= bx[3]]
        print(f"element {el['id']}: template of {len(ok)} pieces found {len(inst)} times", file=sys.stderr)
        for n, ks in enumerate(inst):
            claimed.update(ks)
            sel.append((ks[0], f"{el['id']}#{n}", np.concatenate([order[st[k]:en[k]] for k in ks])))
    elif 'layout_match' in el:
        R = float(el.get('radius', 4.0)); RX = float(el.get('radius_x', R)); RZ = float(el.get('radius_z', R)); below = float(el.get('below', 1.5)); above = float(el.get('above', 6.0)); mt = int(el.get('min_part_tris', 8))
        for r in LAYOUT['mounts']:
            if not all((r.get(k) in v) if isinstance(v, list) else r.get(k) == v for k, v in el['layout_match'].items()):
                continue
            xr = el.get('x_range', [-RX, RX]); zr = el.get('z_range', [-RZ, RZ])      # x_range / z_range: the window relative to the record, when it is not symmetric (a turret's barrels reach far on one side)
            ok = np.where((PN >= mt) & (PBMIN[:, 0] >= r['x'] + xr[0]) & (PBMAX[:, 0] <= r['x'] + xr[1]) & (PBMIN[:, 2] >= r['z'] + zr[0]) & (PBMAX[:, 2] <= r['z'] + zr[1]) & (PBMIN[:, 1] >= r['y'] - below) & (PBMAX[:, 1] <= r['y'] + above))[0]
            ok = [int(k) for k in ok if k not in claimed and not (el.get('exclude') and parts[k]['mat'] >= 0 and el['exclude'] in mats[parts[k]['mat']])
                  and (not el.get('materials') or (parts[k]['mat'] >= 0 and any(has(m, mats[parts[k]['mat']]) for m in el['materials'])))]
            if len(ok) < int(el.get('min_parts', 1)):
                print(f"element {el['id']}: nothing near {r['name']} ({r['x']}, {r['z']})", file=sys.stderr); continue
            claimed.update(ok)
            sel.append((ok[0], r['name'], np.concatenate([order[st[k]:en[k]] for k in ok])))
    for k, p in enumerate(parts if ('layout_match' not in el and 'template' not in el) else []):
        wm = el.get('materials') or [el['material']]
        if p['mat'] >= 0 and any(has(w, mats[p['mat']]) for w in wm) and not (el.get('exclude') and el['exclude'] in mats[p['mat']]):
            t = np.where(tp == k)[0]
            if len(t) >= int(el.get('min_tris', 0)):
                sel.append((k, p['name'], t))
    if el.get('cluster') and sel:      # a model whose material is one per kind of mount: the pieces of the material are joined when their boxes are within `gap` (m): every group is one mount
        gap = float(el['cluster'].get('gap', 0.4)); mt = int(el['cluster'].get('min_tris', 0))
        ids = [k for k, _, _ in sel]; n = len(ids); par = list(range(n))
        def find(a):
            while par[a] != a: par[a] = par[par[a]]; a = par[a]
            return a
        srt = sorted(range(n), key=lambda i: PBMIN[ids[i], 0])
        for a in range(n):
            i = srt[a]
            for b in range(a + 1, n):
                j = srt[b]
                if PBMIN[ids[j], 0] > PBMAX[ids[i], 0] + gap: break
                if np.all(PBMIN[ids[j]] <= PBMAX[ids[i]] + gap) and np.all(PBMAX[ids[j]] >= PBMIN[ids[i]] - gap): par[find(i)] = find(j)
        groups = {}
        for i in range(n): groups.setdefault(find(i), []).append(i)
        sel2 = []
        for gi, mem in enumerate(sorted(groups.values(), key=lambda m: float(np.mean([PBMIN[ids[i], 0] for i in m])))):
            t = np.concatenate([sel[i][2] for i in mem])
            if len(t) >= mt: sel2.append((ids[mem[0]], f"{el['id']}#{gi}", t))
        sel = sel2
    if not sel:
        print(f"element {el['id']}: no group with material {el.get('material')}", file=sys.stderr); continue
    # a group that is twice the size of the usual one holds two mounts whose parts touch: split it in two by the middle of its objects along the ship (1-D two-means on the centres of its objects)
    med = float(el.get('unit_tris') or np.median([len(t) for _, _, t in sel]))      # unit_tris: the triangles of one mount, when groups of several touching mounts are not twice the median
    fixed = []
    for k, name, t in sel:
        if len(t) > 1.5 * med and len(sel) > 1 and not el.get('layout_match') and not el.get('template'):
            lab = components(t)
            ax = 2 if el.get('split_axis') == 'z' else 0      # split_axis 'z': the two mounts stand side by side across the ship (their barrels would mix along x)
            cs = np.array([(P[I[t[lab == q]]].reshape(-1, 3)[:, ax].min() if el.get('split_key') == 'min' else P[I[t[lab == q]]].reshape(-1, 3)[:, ax].mean()) for q in np.unique(lab)])      # split_key 'min': an object goes by its rear end (the barrel of a mount that reaches over the next one)
            c0, c1 = cs.min(), cs.max()
            for _ in range(20):
                a = np.abs(cs - c0) <= np.abs(cs - c1)
                c0, c1 = cs[a].mean(), cs[~a].mean()
            oa = np.abs(cs - c0) <= np.abs(cs - c1)
            side = oa[np.searchsorted(np.unique(lab), lab)]      # an object goes whole to one of the two mounts
            fixed.append((k, name + 'a', t[side])); fixed.append((k, name + 'b', t[~side]))
            print(f"   group {name} ({len(t)} triangles) holds two mounts: split at {'xz'[ax // 2]} {0.5 * (c0 + c1):.1f}", file=sys.stderr)
        else:
            fixed.append((k, name, t))
    sel = fixed
    for _, _, t in sel:
        claimed.update(int(k) for k in np.unique(tp[t]))      # (shipgroups.py leaves these pieces out when its config says `use_claimed`)
    first = None
    for gi, (k, name, t) in enumerate(sel):
        comps, info_c, house_k, barrels, yaw = analyse(t, el)
        hlo, hhi = info_c[house_k]
        # the cradles: the objects touching the rear end of a barrel along the way it points
        a = np.radians(yaw); fwd = np.array([np.cos(a), 0, np.sin(a)])
        gun_k = list(barrels)
        for b in barrels:
            lo, hi = info_c[b]
            bc = (lo + hi) / 2
            rear = bc - fwd * (np.hypot(hi[0] - lo[0], hi[2] - lo[2]) / 2)
            for k, (clo, chi) in info_c.items():
                if k in gun_k or k == house_k or el.get('no_cradle'):
                    continue
                ext = chi - clo
                if np.all(rear >= clo - np.array([0.25, 0.6, 0.25])) and np.all(rear <= chi + np.array([0.25, 0.6, 0.25])) and ext.max() < 6:
                    gun_k.append(k)
        house_t = np.concatenate([comps[k] for k in comps if k not in gun_k]) if gun_k else t
        # the training axis: the middle of the footprint of the biggest object of the house, at its lowest point
        body = [k for k in comps if k not in gun_k and comps[k].size >= 40] or [house_k]
        blo = np.min([info_c[k][0] for k in body], axis=0); bhi = np.max([info_c[k][1] for k in body], axis=0)
        origin = np.array([(blo[0] + bhi[0]) / 2, hlo[1], (blo[2] + bhi[2]) / 2])
        rec = {'group': name, 'x': round(float(origin[0]), 3), 'y': round(float(origin[1]), 3), 'z': round(float(origin[2]), 3), 'yaw': yaw, 'tris': int(len(t)), 'barrels': len(barrels), 'gun_objects': len(gun_k)}
        trun = None
        if gun_k:
            glo = np.min([info_c[k][0] for k in gun_k], axis=0); ghi = np.max([info_c[k][1] for k in gun_k], axis=0)
            cr = [k for k in gun_k if k not in barrels]
            Lc = to_mount(np.array([info_c[k][0] for k in cr] + [info_c[k][1] for k in cr]), origin, yaw)[:, 0] if cr else None
            Lb = to_mount(np.array([info_c[k][0] for k in barrels] + [info_c[k][1] for k in barrels]), origin, yaw)
            tx = float(Lc.min() + 0.4 * (Lc.max() - Lc.min())) if cr else float(Lb[:, 0].min() + 0.2 * (Lb[:, 0].max() - Lb[:, 0].min()))
            ty = float(Lb[:, 1].mean())
            trun = (tx, ty, float(Lb[:, 0].max()))
            rec['trunnion'] = [round(tx, 3), round(ty, 3)]
            rec['muzzle_from_trunnion'] = round(float(Lb[:, 0].max() - tx), 3)
        if first is None:
            first = {'name': name, 'ntri': int(len(t)), 'house': pack(house_t, origin, yaw, np.zeros(3)), 'trun': trun}
            if gun_k:
                gt = np.concatenate([comps[k] for k in gun_k])
                first['guns'] = pack(gt, origin, yaw, np.array([trun[0], trun[1], 0.0]))
                first['n_guns_tris'] = int(len(gt))
            first['n_house_tris'] = int(len(house_t))
        elif len(t) != first['ntri']:
            rec['warning'] = f"{len(t)} triangles, the first copy has {first['ntri']}"
        al = cfg.get('align', {})
        src_box = [round(float(v), 3) for v in np.concatenate(bbox(t))]          # where the group stands in the model (checked by test/elements.mjs against the placed copy)
        rec = {**rec, 'x': round(rec['x'] + al.get('dx', 0), 3), 'y': round(rec['y'] + al.get('dy', 0), 3), 'z': round(rec['z'] + al.get('dz', 0), 3), 'src_box': src_box, 'align': [al.get('dx', 0), al.get('dy', 0), al.get('dz', 0)]}
        placements.append({'kind': el['id'], 'type': el.get('type', 'main'), 'cal': el.get('cal', 0), 'mgroup': el.get('group', ''), **rec})
        report.append({'element': el['id'], **rec})
    kd = {'house': first['house'], 'guns': first.get('guns'), 'type': el.get('type', 'main'), 'from': first['name']}
    if first['trun']:
        kd['trunnion'] = [round(first['trun'][0], 3), round(first['trun'][1], 3)]
        kd['muzzle'] = round(first['trun'][2] - first['trun'][0], 3)
    kinds[el['id']] = kd
    print(f"element {el['id']}: {len(sel)} copies of {first['name']}: house {first['n_house_tris']} triangles, guns {first.get('n_guns_tris', 0)}", file=sys.stderr)
if claimed:      # the pieces taken by the mounts: shipgroups.py leaves them out of the ship (cfg `use_claimed`)
    json.dump(sorted(parts[k]['name'] for k in claimed), open(os.path.join(src, 'claimed.json'), 'w'))
head = (f"// Mounts of the {cfg.get('ship', '')} copied from its reference model, one element at a time (see docs/CREDITS.md; tools/refs/groupmounts.py): the mesh of each kind in the mount's own frame (house: origin\n"
        "// at the training axis, the way the barrels point = +x; guns: origin at the trunnion) and where the model has every copy (x, y, z over the waterline; yaw = the rest direction in the ship's plane).\n"
        f"export const MOUNT_SCALE = {SC};\nexport const KINDS = ")
open(outf, 'w').write(head + json.dumps(kinds) + ';\nexport const PLACEMENTS = ' + json.dumps(placements) + ';\n')
if 'report' in fl:
    os.makedirs(os.path.dirname(fl['report']) or '.', exist_ok=True)
    json.dump(report, open(fl['report'], 'w'), indent=1)
print(f'{outf}: {os.path.getsize(outf) / 1e3:.0f} kB, {len(placements)} placements', file=sys.stderr)
