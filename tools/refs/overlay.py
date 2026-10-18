"""Overlay a profile drawing on a far, narrow-angle side view of the model (almost orthographic) at the same scale.

    python3 tools/refs/overlay.py <render.png> <drawing.jpg> <out.jpg> --loa 270.4 --dist 3000 --fov 6 --look-y 15
                                  --stern-x 30 --bow-x 1872 --wl-y 346 [--crop-y0 0 --crop-y1 370] [--flip]

The render must come from the preview scene with heading 90, az 180 (starboard profile, bow to the right), el 0, lookX 0 and the
given dist / fov / lookY (tools/refs/views.mjs --profile writes that camera). On the drawing, give the x of the stern and of the stem at
deck level and the y of the waterline (pixels); --flip when the drawing has the bow on the left. The dark lines of the drawing are
painted red over the render, so differences in length, height and position show directly.
"""
import argparse, math
from PIL import Image, ImageOps, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('render'); ap.add_argument('drawing'); ap.add_argument('out')
ap.add_argument('--loa', type=float, required=True); ap.add_argument('--dist', type=float, default=3000)
ap.add_argument('--fov', type=float, default=6); ap.add_argument('--look-y', type=float, default=15)
ap.add_argument('--stern-x', type=float, required=True); ap.add_argument('--bow-x', type=float, required=True)
ap.add_argument('--wl-y', type=float, required=True)
ap.add_argument('--crop-y0', type=int, default=None); ap.add_argument('--crop-y1', type=int, default=None)
ap.add_argument('--flip', action='store_true'); ap.add_argument('--stack', action='store_true', help='drawing above the render instead of on it'); ap.add_argument('--threshold', type=int, default=110)
a = ap.parse_args()

r = Image.open(a.render).convert('RGB')
W, H = r.size
ppm = H / (2 * a.dist * math.tan(math.radians(a.fov) / 2))   # render pixels per metre at the ship
cx, cy = W / 2, H / 2 + a.look_y * ppm                       # model origin (midships, waterline) in the render

d = Image.open(a.drawing).convert('L')
if a.crop_y0 is not None: d = d.crop((0, a.crop_y0, d.width, a.crop_y1)); wl = a.wl_y - a.crop_y0
else: wl = a.wl_y
sx, bx = a.stern_x, a.bow_x
if a.flip: d = ImageOps.mirror(d); sx, bx = d.width - sx, d.width - bx
dppm = abs(bx - sx) / a.loa                                   # drawing pixels per metre
k = ppm / dppm
d = d.resize((max(1, round(d.width * k)), max(1, round(d.height * k))), Image.LANCZOS)
# drawing point (sx, wl) -> render point (cx - L/2 * ppm, cy)
ox, oy = round(cx - a.loa / 2 * ppm - sx * k), round(cy - wl * k)
mask = d.point(lambda v: 255 if v < a.threshold else 0)
red = Image.new('RGB', d.size, (255, 30, 30))
out = r.copy()
x0, x1 = max(0, round(cx - a.loa * 0.56 * ppm)), min(W, round(cx + a.loa * 0.56 * ppm))
y0, y1 = max(0, round(cy - a.loa * 0.22 * ppm)), min(H, round(cy + a.loa * 0.06 * ppm))
if a.stack:
    top = Image.new('RGB', (W, H), (255, 255, 255))
    top.paste(Image.merge('RGB', (d, d, d)), (ox, oy))
    top, out = top.crop((x0, y0, x1, y1)), out.crop((x0, y0, x1, y1))
    both = Image.new('RGB', (top.width, top.height * 2))
    both.paste(top, (0, 0)); both.paste(out, (0, top.height))
    both.save(a.out, quality=92)
else:
    out.paste(red, (ox, oy), mask)
    out.crop((x0, y0, x1, y1)).save(a.out, quality=92)
print(a.out, 'render px/m %.2f' % ppm)
