#!/usr/bin/env python3
"""A window on a baked reference model, each triangle in the colour of its texture (or of its material, or of its part), to see what the pieces and the materials are:
python3 tools/refs/matcrop.py refs/<dir>/bake out.png --az=180 --el=20 --cx=70 --cy=12 --cz=15 --w=40 --h=25 --s=20 [--color=tex|mat|part] [--mats=3,5] [--parts=regex] [--hide=regex]
az / el as the game's preview (180 = starboard side, 0 = port, 90 = from ahead, 270 = from astern); cx, cy, cz = the centre of the window in the game's frame (y over the waterline);
`--label=1` writes the number of each material that is drawn (colour = material) at its first triangle in the window. Needs `split` parts (`splitparts.py`) only for --parts / --color=part."""
import sys, json, os, re, colorsys
import numpy as np
from PIL import Image, ImageDraw

pos = [a for a in sys.argv[1:] if not a.startswith('--')]
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
src, outf = pos[:2]
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(float)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VM = np.fromfile(os.path.join(src, 'vmat.i16'), dtype=np.int16)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32)
Cf = os.path.join(src, 'colfull.u8')
C = np.fromfile(Cf, dtype=np.uint8).reshape(nv, 3).astype(float) if os.path.exists(Cf) else np.full((nv, 3), 160.0)
az, el = np.radians(float(fl.get('az', 180))), np.radians(float(fl.get('el', 0)))
cx, cy, cz = float(fl.get('cx', 0)), float(fl.get('cy', 10)), float(fl.get('cz', 0))
w, h, S = float(fl.get('w', 60)), float(fl.get('h', 30)), float(fl.get('s', 12))
back = np.array([np.sin(az) * np.cos(el), np.sin(el), -np.cos(az) * np.cos(el)])       # from the model to the camera
right = np.cross([0, 1, 0], back); right /= np.linalg.norm(right)
up = np.cross(back, right)
W, H = int(w * S), int(h * S)
tri = I
sel = np.ones(nf, bool)
if 'mats' in fl: sel &= np.isin(VM[tri[:, 0]], [int(a) for a in fl['mats'].split(',')])
names = [p['name'] for p in info['parts']]
if 'parts' in fl:
    rx = re.compile(fl['parts']); ok = np.array([bool(rx.search(n)) for n in names]); sel &= ok[VP[tri[:, 0]]]
if 'hide' in fl:
    rx = re.compile(fl['hide']); ok = np.array([bool(rx.search(n)) for n in names]); sel &= ~ok[VP[tri[:, 0]]]
Pc = P - np.array([cx, cy, cz])
U = Pc @ right; V = Pc @ up; D = Pc @ back
tu, tv, td = U[tri], V[tri], D[tri]
inwin = (tu.max(1) > -w / 2) & (tu.min(1) < w / 2) & (tv.max(1) > -h / 2) & (tv.min(1) < h / 2)
sel &= inwin
idx = np.where(sel)[0]
idx = idx[np.argsort(td[idx].mean(1))]               # far first
nrm = np.cross(P[tri[idx, 1]] - P[tri[idx, 0]], P[tri[idx, 2]] - P[tri[idx, 0]])
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
light = np.array([0.35, 0.8, 0.5]); light /= np.linalg.norm(light)
shade = 0.5 + 0.5 * np.abs(nrm @ light)
mode = fl.get('color', 'tex')
nm = len(info['mats'])
hue = lambda i, n: tuple(int(255 * v) for v in colorsys.hsv_to_rgb((i * 0.618) % 1, 0.75, 0.95))
im = Image.new('RGB', (W, H), (28, 30, 34)); dr = ImageDraw.Draw(im)
seen = {}
for k, t in enumerate(idx):
    a = tri[t]
    if mode == 'tex': col = tuple(int(min(255, x * shade[k] * 1.2)) for x in C[a].mean(0))
    elif mode == 'mat': col = hue(int(VM[a[0]]), nm)
    else: col = hue(int(VP[a[0]]), 1)
    pts = [(W / 2 + tu[t, j] * S, H / 2 - tv[t, j] * S) for j in range(3)]
    dr.polygon(pts, fill=col)
    if fl.get('label'): seen[int(VM[a[0]])] = pts[0]
for m, p in seen.items():
    if 0 <= p[0] < W and 0 <= p[1] < H: dr.text(p, str(m), fill=(255, 255, 255))
if fl.get('grid'):      # --grid=5: lines every 5 m, labelled with the model's coordinate along the axis that each screen direction follows (for the views along an axis)
    g = float(fl['grid']); cen = np.array([cx, cy, cz])
    def lab(vec, off):
        ax = int(np.argmax(np.abs(vec))); return 'xyz'[ax] + '=' + ('%g' % round(cen[ax] + vec[ax] * off, 2))
    for k in range(int(-w / 2 / g) - 1, int(w / 2 / g) + 2):
        u = k * g
        if abs(u) <= w / 2:
            dr.line([(W / 2 + u * S, 0), (W / 2 + u * S, H)], fill=(90, 90, 40)); dr.text((W / 2 + u * S + 2, 2), lab(right, u), fill=(255, 255, 120))
    for k in range(int(-h / 2 / g) - 1, int(h / 2 / g) + 2):
        v = k * g
        if abs(v) <= h / 2:
            dr.line([(0, H / 2 - v * S), (W, H / 2 - v * S)], fill=(90, 90, 40)); dr.text((2, H / 2 - v * S - 10), lab(up, v), fill=(255, 255, 120))
im.save(outf)
print('wrote', outf, W, 'x', H, len(idx), 'triangles')
