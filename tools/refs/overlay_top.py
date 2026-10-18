"""Draw a plan-view drawing (red lines) over a top view of the model rendered with the camera of tools/refs/plans.json ('top').

    python3 tools/refs/overlay_top.py <ship> <render.png> <out.jpg>
"""
import json, math, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ship, render, out = sys.argv[1:4]
cfg = json.load(open(os.path.join(HERE, 'plans.json')))[ship]
L, ref = cfg['loa'], cfg['top']
cam = (cfg.get('camera') or {}).get('top') or {'dist': round(L * 6.63), 'fov': 4}
r = Image.open(render).convert('RGB'); W, H = r.size
ppm = H / (2 * cam['dist'] * math.tan(math.radians(cam['fov']) / 2))
d = Image.open(os.path.join(HERE, '..', '..', ref['file'])).convert('L')
x0, y0, x1, y1 = ref['crop']; d = d.crop((x0, y0, x1, y1))
k = ppm / ((ref['bow'] - ref['stern']) / L)
d = d.resize((round(d.width * k), round(d.height * k)))
ox, oy = round(W / 2 - L / 2 * ppm - (ref['stern'] - x0) * k), round(H / 2 - (ref['cl'] - y0) * k)
mask = d.point(lambda v: 255 if v < 110 else 0)
r.paste(Image.new('RGB', d.size, (255, 30, 30)), (ox, oy), mask)
r.crop((max(0, round(W / 2 - L * 0.53 * ppm)), max(0, round(H / 2 - L * 0.1 * ppm)), min(W, round(W / 2 + L * 0.53 * ppm)), min(H, round(H / 2 + L * 0.1 * ppm)))).save(out, quality=92)
print(out)
