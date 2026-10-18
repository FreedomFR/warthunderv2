"""Zoom on a stretch of a drawing with a grid in fractions of the length (green) and metres (blue), to read positions and heights.

    python3 tools/refs/grid.py <drawing> <out.png> --stern X --bow X --loa M --y0 PX --y1 PX --view side --wl Y [--f0 0.3 --f1 0.5] [--scale 2]
    python3 tools/refs/grid.py <drawing> <out.png> --stern X --bow X --loa M --y0 PX --y1 PX --view top --cl Y  [...]

side: horizontal lines every metre above the waterline (y = wl); top: every 2 m off the centre line (y = cl). --vscale as in plans.json.
"""
import argparse
from PIL import Image, ImageDraw
ap = argparse.ArgumentParser()
ap.add_argument('drawing'); ap.add_argument('out')
ap.add_argument('--stern', type=float, required=True); ap.add_argument('--bow', type=float, required=True)
ap.add_argument('--loa', type=float, required=True); ap.add_argument('--y0', type=int, required=True); ap.add_argument('--y1', type=int, required=True)
ap.add_argument('--view', default='side'); ap.add_argument('--wl', type=float); ap.add_argument('--cl', type=float)
ap.add_argument('--f0', type=float, default=0); ap.add_argument('--f1', type=float, default=1)
ap.add_argument('--scale', type=float, default=2); ap.add_argument('--vscale', type=float, default=1)
ap.add_argument('--step', type=float, default=0.01)
a = ap.parse_args()
im = Image.open(a.drawing).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
ppm = (a.bow - a.stern) / a.loa; vppm = ppm * a.vscale
x0 = int(a.bow - a.f1 * (a.bow - a.stern)); x1 = int(a.bow - a.f0 * (a.bow - a.stern))
c = im.crop((x0, a.y0, x1, a.y1)); s = a.scale
c = c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS); d = ImageDraw.Draw(c)
k0 = int(a.f0 / a.step); k1 = int(a.f1 / a.step) + 1
for k in range(k0, k1 + 1):
    f = k * a.step; X = (a.bow - f * (a.bow - a.stern) - x0) * s
    if 0 <= X < c.width:
        major = k % 5 == 0
        d.line([(X, 0), (X, c.height)], fill=(0, 200, 0) if major else (170, 225, 170))
        if major: d.text((X + 2, 2), '%.2f' % f, fill=(0, 90, 0))
if a.view == 'side':
    for m in range(-14, 60):
        Y = (a.wl - m * vppm - a.y0) * s
        if 0 <= Y < c.height:
            d.line([(0, Y), (c.width, Y)], fill=(0, 0, 255) if m % 5 == 0 else (150, 150, 255))
            if m % 5 == 0: d.text((2, Y + 1), '%dm' % m, fill=(0, 0, 200))
else:
    for zz in range(-24, 25, 2):
        Y = (a.cl + zz * ppm - a.y0) * s
        if 0 <= Y < c.height:
            d.line([(0, Y), (c.width, Y)], fill=(0, 0, 255) if zz % 4 == 0 else (150, 150, 255))
            if zz % 4 == 0: d.text((2, Y + 1), str(zz), fill=(0, 0, 200))
c.save(a.out); print(a.out, c.size)
