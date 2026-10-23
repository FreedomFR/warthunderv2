#!/usr/bin/env python3
"""A picture of the cuts of a shipgroups config on the baked model: the triangles whose centre lies in a box of `cuts` are coloured by the cut (the others grey), side view above and plan below,
with the boxes drawn: python3 tools/refs/cutview.py refs/<dir>/bake tools/refs/<id>_shipgroups.json out/cuts.png [--x0=-30 --x1=60 --s=14]
`drop` cuts are drawn red. Use it to place the boxes of the funnels, the tower, the masts... before running shipgroups.py (`--hide=regex` leaves out the parts whose name matches, the hull for instance)."""
import sys, json, os, re, colorsys
import numpy as np
from PIL import Image, ImageDraw
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
fl = dict((a[2:].split('=') + ['1'])[:2] for a in sys.argv[1:] if a.startswith('--'))
src, cfgf, outf = pos[:3]
info = json.load(open(os.path.join(src, 'info.json')))
nv, nf = info['vertices'], info['triangles']
P = np.fromfile(os.path.join(src, 'pos.f32'), dtype=np.float32).reshape(nv, 3).astype(float)
I = np.fromfile(os.path.join(src, 'idx.u32'), dtype=np.uint32).reshape(nf, 3)
VP = np.fromfile(os.path.join(src, 'vpart.i32'), dtype=np.int32)
cfg = json.load(open(cfgf)); cuts = cfg.get('cuts', [])
cen = P[I].mean(axis=1)
x0 = float(fl.get('x0', P[:, 0].min() - 2)); x1 = float(fl.get('x1', P[:, 0].max() + 2)); S = float(fl.get('s', 12))
ymax = float(fl.get('ymax', P[:, 1].max() + 2)); zmax = float(np.abs(P[:, 2]).max() + 2)
W = int((x1 - x0) * S) + 40; Hs = int((ymax + 3) * S) + 20; Hp = int(zmax * 2 * S) + 20
im = Image.new('RGB', (W, Hs + Hp), (28, 30, 34)); dr = ImageDraw.Draw(im)
sx = lambda x: 20 + (x - x0) * S; sy = lambda y: Hs - 10 - (y + 3) * S; pz = lambda z: Hs + 10 + (z + zmax) * S
hide = re.compile(fl['hide']) if 'hide' in fl else None
names = [p['name'] for p in info['parts']]
tp = VP[I[:, 0]]
colr = {}
for i, c in enumerate(cuts):
    colr[i] = (255, 60, 60) if c.get('drop') else tuple(int(255 * v) for v in colorsys.hsv_to_rgb((i * 0.173) % 1, 0.7, 1))
which = np.full(nf, -1)
for i, c in enumerate(cuts):
    b = c['box']
    m = (cen[:, 0] >= b[0]) & (cen[:, 0] <= b[1]) & (cen[:, 1] >= b[2]) & (cen[:, 1] <= b[3]) & (cen[:, 2] >= b[4]) & (cen[:, 2] <= b[5]) & (which < 0)
    which[m] = i
for t in range(nf):
    if hide and hide.search(names[tp[t]]): continue
    col = colr[which[t]] if which[t] >= 0 else (110, 112, 118)
    a, b_, c_ = P[I[t]]
    dr.polygon([(sx(v[0]), sy(v[1])) for v in (a, b_, c_)], outline=col)
    dr.polygon([(sx(v[0]), pz(v[2])) for v in (a, b_, c_)], outline=col)
for i, c in enumerate(cuts):
    b = c['box']
    dr.rectangle([sx(b[0]), sy(b[3]), sx(b[1]), sy(b[2])], outline=(255, 255, 255)); dr.text((sx(b[0]) + 2, sy(b[3]) - 10), f"{i}:{c['id']}", fill=(255, 255, 255))
    dr.rectangle([sx(b[0]), pz(b[4]), sx(b[1]), pz(b[5])], outline=(255, 255, 255))
for x in range(int(np.ceil(x0 / 10)) * 10, int(x1), 10):
    dr.line([(sx(x), sy(-3)), (sx(x), sy(-3) + 8)], fill=(255, 255, 0)); dr.text((sx(x) - 8, sy(-3) + 10), str(x), fill=(255, 255, 0))
for y in range(0, int(ymax), 5):
    dr.line([(8, sy(y)), (18, sy(y))], fill=(255, 255, 0)); dr.text((0, sy(y) - 14), str(y), fill=(255, 255, 0))
im.save(outf); print(outf, im.size)
