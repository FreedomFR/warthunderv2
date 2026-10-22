"""A picture of tools/refs/pair.sh or `gltf.mjs crop` with a grid in GAME metres, to read positions: x along the ship (bow +, to the right), and y above the waterline (side view, --view side)
or z to starboard (top view, starboard at the bottom, --view top):
    python3 tools/refs/gcrop.py in.png out.png --cx 20 --c 8 --w 40 --h 20 --view side [--step 1] [--label 5]
cx, c = the centre of the window (c = cy above the waterline for a side view, cz for a top view), w, h = the window in metres (the same as the crop)."""
import argparse
from PIL import Image, ImageDraw
ap = argparse.ArgumentParser()
ap.add_argument('inp'); ap.add_argument('out'); ap.add_argument('--cx', type=float, required=True); ap.add_argument('--c', type=float, default=0)
ap.add_argument('--w', type=float, required=True); ap.add_argument('--h', type=float, required=True); ap.add_argument('--view', default='side')
ap.add_argument('--step', type=float, default=1); ap.add_argument('--label', type=float, default=5)
a = ap.parse_args()
im = Image.open(a.inp).convert('RGB'); W, H = im.size; sx = W / a.w; sy = H / a.h
d = ImageDraw.Draw(im, 'RGBA')
import math
x = math.ceil((a.cx - a.w / 2) / a.step) * a.step
while x <= a.cx + a.w / 2:
    px = (x - (a.cx - a.w / 2)) * sx; big = abs(x / a.label - round(x / a.label)) < 1e-6
    d.line([px, 0, px, H], fill=(0, 140, 255, 150 if big else 45), width=1)
    if big: d.text((px + 2, 2), f'{x:g}', fill=(0, 60, 200, 255))
    x += a.step
y = math.ceil((a.c - a.h / 2) / a.step) * a.step
while y <= a.c + a.h / 2:
    py = H - (y - (a.c - a.h / 2)) * sy if a.view == 'side' else (y - (a.c - a.h / 2)) * sy; big = abs(y / a.label - round(y / a.label)) < 1e-6
    d.line([0, py, W, py], fill=(230, 80, 0, 150 if big else 45), width=1)
    if big: d.text((2, py + 1), f'{y:g}', fill=(200, 60, 0, 255))
    y += a.step
im.save(a.out)
