#!/usr/bin/env python3
"""A ship built from a reference model whose groups are the ship's own elements: every group that is not a mount becomes an element of the game (hull, structure, fine detail, destroyable part).

  node tools/refs/gltf.mjs bakeraw refs/<dir>/src refs/<dir>/bake --loa= --draft=            (the group of every vertex, the colour of the textures)
  python3 tools/refs/shipgroups.py refs/<dir>/bake tools/refs/<id>_shipgroups.json js/game/model/ships/<id>_v4.js

The config: { "ship": "Yamato", "skip_groups": [...names of the mounts' groups...], "skip_material": ["CM001_Propeller"],
  "rules": [ { "match": "regex on the material name", "to": "hull" | "static" | "fine" | "part", "id": "...", "kind": "director" | ..., "label": "...", "spin": {...}, "track": true } ... ],
  "cuts": [ { "group": "MidBack_DeckHouseShape", "id": "tower", "kind": "bridge", "label": "Passerelle", "box": [x0, x1, y0, y1, z0, z1] } ] }
A rule may name a `group` regex instead of `match`. The first rule that matches a group decides; a group no rule matches is `static`. `cuts` take the triangles of a group whose centre lies in a box
out of it and make a part of them (the tower and the funnel of the Yamato are inside one big group). Everything keeps the model's own triangles (nothing is simplified) and its texture colours
(the game recolours them with its own paint: see model/v4ship.js); positions in 5 mm steps, in the game's frame.
Needs numpy.
"""
import sys, json, os, re, base64
import numpy as np

pos_args = [x for x in sys.argv[1:] if not x.startswith('--')]
src, cfgf, outf = pos_args[:3]
SC = 200
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(np.float64)
C = np.fromfile(os.path.join(src, 'colfull.u8'), dtype=np.uint8).reshape(nv, 3)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32)
cfg = json.load(open(cfgf))
mats = [{'name': m['name']} for m in info['mats']]
parts = info['parts']
# a model exported mirrored (`--mirror=1`) comes out with the triangles wound the other way: the signed volume of the whole mesh says which way is out (the game's frame is left-handed: negative when the winding is the game's), and the winding is flipped otherwise
vol = np.einsum('ij,ij->i', P[I[:, 0]], np.cross(P[I[:, 1]], P[I[:, 2]])).sum() / 6
if vol > 0:
    I = I[:, [0, 2, 1]]
    print('triangles flipped (signed volume %.0f m3)' % vol, file=sys.stderr)
tp = VP[I[:, 0]]
b64 = lambda a: base64.b64encode(a.tobytes()).decode()


def pack(tris):
    t = I[tris]
    used = np.unique(t)
    remap = -np.ones(nv, dtype=np.int64); remap[used] = np.arange(len(used))
    q = np.round(P[used] * SC).astype(np.int16)
    idx = remap[t].astype(np.uint32)
    wide = len(used) >= 65536
    return {'nv': int(len(used)), 'ni': int(idx.size), 'pos': b64(q), 'col': b64(C[used]), 'idx': b64(idx if wide else idx.astype(np.uint16)), 'wide': bool(wide)}


skip_g = set(cfg.get('skip_groups', []))
if cfg.get('use_claimed') and os.path.exists(os.path.join(src, 'claimed.json')):      # the pieces groupmounts.py took for the mounts (a model whose materials are merged has no group per mount)
    skip_g |= set(json.load(open(os.path.join(src, 'claimed.json'))))
skip_m = [re.compile(x) for x in cfg.get('skip_material', [])]
rules = [(re.compile(r['match']) if 'match' in r else None, re.compile(r['group']) if 'group' in r else None, r) for r in cfg['rules']]
cuts = {}
for c in cfg.get('cuts', []):
    cuts.setdefault(c['group'], []).append(c)
out = {'static': {}, 'fine': {}, 'parts': {}}
stats = {}
static_tris, fine_tris = {}, {}
part_tris = {}
cut_ids = {}
for k, p in enumerate(parts):
    t = np.where(tp == k)[0]
    if len(t) == 0 or p['name'] in skip_g:
        continue
    mname = mats[p['mat']]['name'] if p['mat'] >= 0 else ''
    if any(r.search(mname) for r in skip_m):
        continue
    gcuts = list(cuts.get(p['name'], [])) + [c for c in cfg.get('cuts', []) if c.get('gre') and re.search(c['group'], p['name'])]
    # a rule that makes this group a part of its own is not cut again
    if gcuts and not any((rm is not None and rm.search(mname) and r['to'] == 'part') for rm, rg, r in rules):
        cen = P[I[t]].mean(axis=1)
        taken = np.zeros(len(t), bool)
        for c in gcuts:
            x0, x1, y0, y1, z0, z1 = c['box']
            inb = (cen[:, 0] >= x0) & (cen[:, 0] <= x1) & (cen[:, 1] >= y0) & (cen[:, 1] <= y1) & (cen[:, 2] >= z0) & (cen[:, 2] <= z1) & ~taken
            if not c.get('drop'):      # drop: the triangles in the box are left out (the screws and rudders: the game draws and turns its own)
                part_tris.setdefault(c['id'], {'rule': c, 'tris': []})['tris'].append(t[inb])
            taken |= inb
        t = t[~taken]
        if len(t) == 0:
            continue
    dest = 'static'; rule = None
    Vp = P[I[t]].reshape(-1, 3); plen = float(Vp[:, 0].max() - Vp[:, 0].min())
    for rm, rg, r in rules:
        if 'min_len' in r and plen < r['min_len']:      # a rule for the long pieces only (the hull plating of a model whose materials are merged)
            continue
        if (rm is not None and rm.search(mname)) or (rg is not None and rg.search(p['name'])) or (rm is None and rg is None and 'min_len' in r):
            dest = r['to']; rule = r; break
    if dest == 'part':
        pid = rule.get('id', p['name'])
        if rule.get('per_group', True) and 'id' not in rule:
            pid = p['name']
        part_tris.setdefault(pid, {'rule': rule, 'tris': []})['tris'].append(t)
    elif dest == 'fine':
        fine_tris.setdefault('fine', []).append(t)
    elif dest == 'skip':
        continue
    else:
        static_tris.setdefault(rule['cls'] if rule and 'cls' in rule else mname, []).append(t)
    stats[(dest, mname)] = stats.get((dest, mname), 0) + len(t)

res = {'static': {}, 'fine': None, 'parts': {}}
for cls, lst in static_tris.items():
    res['static'][cls] = pack(np.concatenate(lst))
if fine_tris:
    res['fine'] = pack(np.concatenate(fine_tris['fine']))
for pid, d in part_tris.items():
    tr = np.concatenate(d['tris'])
    if len(tr) == 0:
        continue
    V = P[I[tr]].reshape(-1, 3)
    r = d['rule']
    res['parts'][pid] = {'kind': r.get('kind', 'structure'), 'label': r.get('label', pid), 'spin': r.get('spin'), 'track': r.get('track'), 'bb': [round(float(v), 3) for v in np.concatenate([V.min(0), V.max(0)])], 'mesh': pack(tr)}
total = sum(len(np.concatenate(l)) for l in static_tris.values()) + (len(np.concatenate(fine_tris['fine'])) if fine_tris else 0) + sum(len(np.concatenate(d['tris'])) for d in part_tris.values())
print(f"{total} triangles: static {sum(len(np.concatenate(l)) for l in static_tris.values())} in {len(static_tris)} classes, fine {len(np.concatenate(fine_tris['fine'])) if fine_tris else 0}, {len(res['parts'])} parts", file=sys.stderr)
for k, v in sorted(stats.items(), key=lambda kv: -kv[1])[:14]:
    print(f'   {v:>7} {k[0]:>7} {k[1]}', file=sys.stderr)
head = (f"// The {cfg.get('ship', '')} built from its reference model (see docs/CREDITS.md; tools/refs/shipgroups.py): every group that is not a mount, with its own triangles and the colours of its textures; model/v4ship.js\n"
        f"// recolours them with the game's paint. Positions in 5 mm steps, game frame (x bow +, y over the waterline, z starboard).\nexport const SCALE = {SC};\nexport const SHIP = ")
open(outf, 'w').write(head + json.dumps(res) + ';\n')
print(f'{outf}: {os.path.getsize(outf) / 1e6:.2f} MB', file=sys.stderr)
