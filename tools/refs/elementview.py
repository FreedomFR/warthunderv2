#!/usr/bin/env python3
"""A picture of the house and the guns of a kind of an *_elements.js (flat shaded, side / top / front, the guns raised to the given elevation about their trunnion):
python3 tools/refs/elementview.py js/game/model/ships/flak_elements.js flak4 out/flak/view.png [--elev=0]"""
import sys, json, base64, re
import numpy as np
from PIL import Image, ImageDraw
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
src = open(pos[0]).read()
SC = int(re.search(r'MOUNT_SCALE = (\d+)', src).group(1))
kinds = json.loads(src[src.index('export const KINDS = ') + 21: src.index(';\nexport const PLACEMENTS')])
k = kinds[pos[1]]
def dec(m):
    V = np.frombuffer(base64.b64decode(m['pos']), dtype=np.int16).reshape(-1, 3).astype(float) / SC
    C = np.frombuffer(base64.b64decode(m['col']), dtype=np.uint8).reshape(-1, 3)
    I = np.frombuffer(base64.b64decode(m['idx']), dtype=np.uint16 if not m['wide'] else np.uint32).reshape(-1, 3)
    return V, C, I
el = np.radians(float(fl.get('elev', 0)))
meshes = [dec(k['house'])]
if k.get('guns'):
    V, C, I = dec(k['guns']); c, s = np.cos(el), np.sin(el)
    V = np.stack([V[:, 0] * c - V[:, 1] * s, V[:, 0] * s + V[:, 1] * c, V[:, 2]], axis=1) + np.array([k['trunnion'][0], k['trunnion'][1], 0])
    if fl.get('tint'): C = (C.astype(float) * 0.45 + np.array([150, 20, 20]) * 0.55).astype(np.uint8)      # --tint=1: the guns in red (what elevates)
    meshes.append((V, C, I))
else:
    pass
if k.get('guns') is None: pass
W = 560; S = float(fl.get('scale', 120)) if False else int(fl.get('scale', 120))
out = Image.new('RGB', (W * 3, 460), (40, 44, 48))
def draw(view, ox):
    dr = ImageDraw.Draw(out)
    items = []
    for V, C, I in meshes:
        for t in I:
            a, b, c = V[t[0]], V[t[1]], V[t[2]]
            n = np.cross(b - a, c - a); n = n / (np.linalg.norm(n) + 1e-9)
            depth = {'side': -(a[2] + b[2] + c[2]), 'top': (a[1] + b[1] + c[1]), 'front': (a[0] + b[0] + c[0])}[view]
            shade = 0.45 + 0.55 * abs(n @ np.array([0.4, 0.8, 0.45]) / 1.0)
            col = tuple(int(min(255, x * shade * 1.1)) for x in (C[t[0]].astype(int) + C[t[1]] + C[t[2]]) / 3)
            pts = [((v[0] if view != 'front' else v[2]) * S + ox, (460 - 60 - v[1] * S) if view != 'top' else (230 - v[2] * S)) for v in (a, b, c)]
            items.append((depth, pts, col))
    for d, pts, col in sorted(items, key=lambda x: x[0]): dr.polygon(pts, fill=col)
draw('side', 190); draw('top', W + 190); draw('front', 2 * W + 280)
out.save(pos[2])
