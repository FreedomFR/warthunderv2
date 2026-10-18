"""The plan view of a drawing above a top view of the model, at the same scale (camera of tools/refs/plans.json 'top').

    python3 tools/refs/stack_top.py <ship> <render.png> <out.jpg> [f0 f1]     (f0..f1: the stretch of the length to show)
"""
import json, math, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ship, render, out = sys.argv[1:4]
f0, f1 = (float(sys.argv[4]), float(sys.argv[5])) if len(sys.argv) > 5 else (0, 1)
cfg = json.load(open(os.path.join(HERE, 'plans.json')))[ship]
L, ref = cfg['loa'], cfg['top']
cam = (cfg.get('camera') or {}).get('top') or {'dist': round(L * 6.63), 'fov': 4}
r = Image.open(render).convert('RGB'); W, H = r.size
ppm = H / (2 * cam['dist'] * math.tan(math.radians(cam['fov']) / 2))
d = Image.open(os.path.join(HERE, '..', '..', ref['file'])).convert('RGB')
x0, y0, x1, y1 = ref['crop']; d = d.crop((x0, y0, x1, y1))
k = ppm / ((ref['bow'] - ref['stern']) / L)
d = d.resize((round(d.width * k), round(d.height * k)))
ox, oy = round(W / 2 - L / 2 * ppm - (ref['stern'] - x0) * k), round(H / 2 - (ref['cl'] - y0) * k)
top = Image.new('RGB', (W, H), (255, 255, 255)); top.paste(d, (ox, oy))
xa, xb = round(W / 2 + (0.5 - f1) * L * ppm), round(W / 2 + (0.5 - f0) * L * ppm)
ya, yb = round(H / 2 - L * 0.085 * ppm), round(H / 2 + L * 0.085 * ppm)
a, b = top.crop((xa, ya, xb, yb)), r.crop((xa, ya, xb, yb))
o = Image.new('RGB', (a.width, a.height * 2)); o.paste(a, (0, 0)); o.paste(b, (0, a.height)); o.save(out, quality=92)
print(out, o.size)
