"""Measure how far a model is from its plan: compare the silhouette of a matte render (?matte=1, flat green background) with the
silhouette of a profile or plan-view drawing, column by column, in metres.

    python3 tools/refs/silhouette.py <ship> <view> <render.png> [--out out/check]

<view> is 'side' (starboard profile, bow to the right: the height of the top of the silhouette above the waterline at each point of the
length) or 'top' (plan view, bow to the right: the half-breadth at each point). The drawing and its calibration (stern / stem x, the
waterline or the centre line, the crop) come from tools/refs/plans.json, the camera from the same file (see check.mjs, which renders it).
Prints the mean and worst differences, the stretches of the length where they exceed the tolerance, and writes a picture: grey where
both agree, red where only the drawing has something, blue where only the model has.
"""
import argparse, json, math, os
from PIL import Image, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('ship'); ap.add_argument('view'); ap.add_argument('render')
ap.add_argument('--out', default='out/check'); ap.add_argument('--tol', type=float, default=None)
a = ap.parse_args()
cfg = json.load(open(os.path.join(HERE, 'plans.json')))[a.ship]
L = cfg['loa']
cam = cfg['camera'][a.view]
ref = cfg[a.view]
tol = a.tol if a.tol is not None else ref.get('tol', 1.0)

# ---- model mask (anything that is not the green matte) ----
r = Image.open(a.render).convert('RGB')
W, H = r.size
ppm = H / (2 * cam['dist'] * math.tan(math.radians(cam['fov']) / 2))
rp = r.load()
mask_m = Image.new('L', (W, H), 0); mp = mask_m.load()
for y in range(H):
    for x in range(W):
        c = rp[x, y]
        if not (c[1] > c[0] + 60 and c[1] > c[2] + 60): mp[x, y] = 255
# remove features under ~0.4 m wide (lifeline stanchions, wires): the drawings show them as hairlines too
if a.view == 'side': mask_m = mask_m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)); mp = mask_m.load()
cx, cy = W / 2, H / 2 + (cam.get('lookY', 0) * ppm if a.view == 'side' else 0)

# ---- drawing mask (ink, closed so that stippled fills become solid) ----
d = Image.open(os.path.join(HERE, '..', '..', ref['file'])).convert('RGBA')
bg = Image.new('RGBA', d.size, (255, 255, 255, 255)); bg.alpha_composite(d); d = bg.convert('L')
for e in ref.get('erase', []): d.paste(255, tuple(e))      # parts of the sheet that are not the ship (legend, aircraft, wireless aerials)
x0, y0, x1, y1 = ref['crop']
d = d.crop((x0, y0, x1, y1))
ink = d.point(lambda v: 255 if v < ref.get('threshold', 200) else 0)
k = ref.get('close', 5)
ink = ink.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
if ref.get('open', a.view == 'side'): ink = ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
dppm = (ref['bow'] - ref['stern']) / L
vppm = dppm * ref.get('vscale', 1)        # some drawings are not drawn to the same scale vertically (checked on known depths)
base = (ref['wl'] if a.view == 'side' else ref['cl']) - y0

# ---- profiles along the length, every 0.5 m ----
def model_at(xm):
    """top height (side) or half-breadth (top) of the model at xm metres from midships (+ = forward)."""
    px = int(round(cx + xm * ppm))
    if px < 0 or px >= W: return None
    if a.view == 'side':
        for py in range(0, int(cy)):
            if all(mp[px, py + j] for j in range(min(4, int(cy) - py))): return (cy - py) / ppm
        return 0.0
    # top view: starboard is towards the bottom of the image (bow to the right)
    for py in range(H - 1, int(cy), -1):
        if all(mp[px, py - j] for j in range(4)): return (py - cy) / ppm
    return 0.0

dp = ink.load()
def drawing_at(xm):
    px = int(round(ref['stern'] - x0 + (xm + L / 2) * dppm))
    if px < 0 or px >= ink.width: return None
    n = max(2, int(0.3 * dppm))
    if a.view == 'side':
        for py in range(0, int(base)):
            if all(dp[px, py + j] for j in range(min(n, int(base) - py))): return (base - py) / vppm
        return 0.0
    for py in range(ink.height - 1, int(base), -1):
        if all(dp[px, py - j] for j in range(n)): return (py - base) / dppm
    return 0.0

def model_bottom(xm):
    px = int(round(cx + xm * ppm))
    if px < 0 or px >= W: return None
    for py in range(H - 1, int(cy), -1):
        if all(mp[px, py - j] for j in range(4)): return (py - cy) / ppm
    return 0.0

def drawing_bottom(xm):
    px = int(round(ref['stern'] - x0 + (xm + L / 2) * dppm))
    if px < 0 or px >= ink.width: return None
    n = max(2, int(0.3 * dppm))
    for py in range(ink.height - 1, int(base), -1):
        if all(dp[px, py - j] for j in range(n)): return (py - base) / (vppm if a.view == 'side' else dppm)
    return 0.0

ex = ref.get('exclude', [])   # stretches (fractions from the bow) where the drawing shows something the model does not try to have
rows, errs = [], []
xm = -L / 2
while xm <= L / 2:
    f = (L / 2 - xm) / L
    m, dr = model_at(xm), drawing_at(xm)
    if m is not None and dr is not None and not any(e[0] <= f <= e[1] for e in ex):
        rows.append((f, dr, m, m - dr)); errs.append(abs(m - dr))
    xm += 0.5

under = []
if a.view == 'side' and ref.get('under'):
    xm = -L / 2
    while xm <= L / 2:
        m, dr = model_bottom(xm), drawing_bottom(xm)
        if m is not None and dr is not None: under.append(((L / 2 - xm) / L, dr, m, m - dr))
        xm += 0.5

# stretches where the difference exceeds the tolerance
bad, cur = [], None
for f, dr, m, e in rows:
    if abs(e) > tol:
        if cur and f - cur[1] <= 0.006: cur[1] = f; cur[2].append(e); cur[3].append((dr, m))
        else:
            cur = [f, f, [e], [(dr, m)]]; bad.append(cur)
    else: cur = None
label = 'height above the waterline' if a.view == 'side' else 'half-breadth'
print(f'{a.ship} {a.view}: {label}, {len(rows)} stations, mean |error| {sum(errs) / max(1, len(errs)):.2f} m, worst {max(errs or [0]):.2f} m, '
      f'{sum(1 for e in errs if e > tol) / max(1, len(errs)) * 100:.0f}% of the length beyond {tol} m')
for b0, b1, es, pairs in sorted(bad, key=lambda b: -max(abs(e) for e in b[2]))[:14]:
    i = max(range(len(es)), key=lambda j: abs(es[j]))
    print(f'  f {b0:.3f}-{b1:.3f} ({abs(b1 - b0) * L:4.1f} m): drawing {pairs[i][0]:5.1f} m, model {pairs[i][1]:5.1f} m, error {es[i]:+5.1f} m')

if under:
    ue = [abs(e) for *_, e in under]
    print(f'  under water (depth of the bottom of the silhouette): mean |error| {sum(ue) / len(ue):.2f} m, worst {max(ue):.2f} m')
    worst = sorted(under, key=lambda r: -abs(r[3]))[:8]
    for f, dr, m, e in sorted(worst):
        print(f'    f {f:.3f}: drawing {dr:5.1f} m, model {m:5.1f} m, error {e:+5.1f} m')

# ---- picture: both masks in the model frame ----
os.makedirs(a.out, exist_ok=True)
kk = ppm / dppm
kv = ppm / (vppm if a.view == 'side' else dppm)
dimg = ink.resize((max(1, round(ink.width * kk)), max(1, round(ink.height * kv))))
ox, oy = round(cx - L / 2 * ppm - (ref['stern'] - x0) * kk), round(cy - base * kv)
dm = Image.new('L', (W, H), 0); dm.paste(dimg, (ox, oy))
if a.view == 'side' and not ref.get('under'):      # only above the waterline
    cut = Image.new('L', (W, H), 0); cut.paste(255, (0, 0, W, int(cy))); dm = ImageChops.multiply(dm, cut); mm = ImageChops.multiply(mask_m, cut)
else: mm = mask_m
both = ImageChops.multiply(dm, mm)
only_d = ImageChops.subtract(dm, mm); only_m = ImageChops.subtract(mm, dm)
pic = Image.new('RGB', (W, H), (255, 255, 255))
pic.paste((150, 150, 150), (0, 0, W, H), both); pic.paste((230, 30, 30), (0, 0, W, H), only_d); pic.paste((30, 80, 230), (0, 0, W, H), only_m)
xa, xb = max(0, round(cx - L * 0.53 * ppm)), min(W, round(cx + L * 0.53 * ppm))
ya, yb = (max(0, round(cy - L * 0.2 * ppm)), min(H, round(cy + (14 if ref.get('under') else 2) * ppm))) if a.view == 'side' else (max(0, round(cy - L * 0.1 * ppm)), min(H, round(cy + L * 0.1 * ppm)))
fn = os.path.join(a.out, f'{a.ship}_{a.view}.png')
pic.crop((xa, ya, xb, yb)).save(fn)
json.dump({'ship': a.ship, 'view': a.view, 'mean': sum(errs) / max(1, len(errs)), 'worst': max(errs or [0]), 'stations': [[round(f, 4), round(dr, 2), round(m, 2)] for f, dr, m, _ in rows]},
          open(os.path.join(a.out, f'{a.ship}_{a.view}.json'), 'w'))
print('picture', fn)
