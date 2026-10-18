"""Compare the planform and the side view of an aircraft model with a 3-view drawing, in metres.

    python3 tools/refs/planecheck.py <key> [--out out/check]      (after: node tools/refs/planecheck.mjs <key>)

tools/refs/plans.json -> "planes": { key: { "length", "span", "top": {file, crop, flip, threshold}, "side": {...} } } : the real length and span
(printed on the drawing or in the references), and for each view the drawing, the crop of that view on the sheet, flip when the nose points
right, ink threshold. Both silhouettes are aligned on the nose and on the vertical centre of their bounding box, the drawing is scaled so that its
longest dimension equals the real length (top view: span across); then the width (top) or the height (side) of the two are compared along the
length, every 0.1 m, and the model's own length and span are printed against the real ones.
"""
import argparse, json, math, os
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('key'); ap.add_argument('--out', default='out/check'); a = ap.parse_args()
cfg = json.load(open(os.path.join(HERE, 'plans.json')))['planes'][a.key]
FOV, H = 8, 1000
ppm = H / 60.0 * 1.0        # the camera fills 60 m over the height

def silhouette(img, thr, fill=True, dil=3, invert=False, opn=0):
    g = img.convert('L')
    if invert: g = g.point(lambda v: 255 - v)        # light lines on a dark ground (blueprints)
    ink = g.point(lambda v: 255 if v < thr else 0)
    if opn: ink = ink.filter(ImageFilter.MinFilter(opn)).filter(ImageFilter.MaxFilter(opn))   # remove hairlines (aerial wires, dimension lines)
    if dil: ink = ink.filter(ImageFilter.MaxFilter(dil))
    if not fill: return ink
    # fill the inside of the outline: flood the outside from the corners on the inverse, what stays is the silhouette
    inv = ink.point(lambda v: 0 if v else 255).convert('L')
    w, h = inv.size
    for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if inv.getpixel(pt) == 255: ImageDraw.floodfill(inv, pt, 128)
    return inv.point(lambda v: 0 if v == 128 else 255)

def bbox(m):
    b = m.getbbox(); return b

def profile(m, axis_len, axis_other, ppm_):
    """for every 0.1 m along x: extent along y (top: width, side: height), in metres; and the bbox."""
    px = m.load(); W, Hh = m.size; b = m.getbbox()
    x0, y0, x1, y1 = b
    out = {}
    step = max(1, round(0.1 * ppm_))
    for x in range(x0, x1, step):
        ys = [y for y in range(y0, y1) if px[x, y]]
        out[round((x - x0) / ppm_, 1)] = ((max(ys) - min(ys) + 1) / ppm_, ((max(ys) + min(ys)) / 2 - (y0 + y1) / 2) / ppm_) if ys else (0, 0)
    return out, ((x1 - x0) / ppm_, (y1 - y0) / ppm_)

res = {}
for view in ('top', 'side'):
    if view not in cfg: continue
    d = cfg[view]
    r = Image.open(os.path.join(a.out, f'plane_{a.key}_{view}.png')).convert('RGB')
    rp = r.load(); W, Hh = r.size
    mm = Image.new('L', (W, Hh), 0); mp = mm.load()
    for y in range(Hh):
        for x in range(W):
            c = rp[x, y]
            if not (c[1] > c[0] + 60 and c[1] > c[2] + 60): mp[x, y] = 255
    mprof, (ml, mh) = profile(mm, 0, 0, ppm)
    im = Image.open(os.path.join(HERE, '..', '..', d['file'])).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    x0, y0, x1, y1 = d['crop']; im = im.crop((x0, y0, x1, y1))
    bgc = (0, 0, 0) if d.get('invert') else (255, 255, 255)
    for e in d.get('preErase', []): ImageDraw.Draw(im).rectangle(e, fill=bgc)      # rectangles in the crop, before the rotation
    if d.get('rotate'): im = im.rotate(d['rotate'], expand=True, fillcolor=bgc)     # counter-clockwise degrees: nose to the left
    if d.get('flip'): im = im.transpose(Image.FLIP_LEFT_RIGHT)
    for e in d.get('erase', []): ImageDraw.Draw(im).rectangle(e, fill=bgc)
    ds = silhouette(im, d.get('threshold', 140), True, d.get('dilate', 3), d.get('invert', False), d.get('open', 0))
    ds.save(os.path.join(a.out, f'plane_{a.key}_{view}_drawing.png'))
    bx0, by0, bx1, by1 = bbox(ds)
    # scale: the drawing's length (x extent) is the real length, or the real span for a view marked scaleBy: span (top view, no propeller disc)
    L = cfg['length']
    dppm = (by1 - by0) / cfg['span'] if d.get('scaleBy') == 'span' else (bx1 - bx0) / L
    dprof, (dl, dh) = profile(ds, 0, 0, dppm)
    errs = []
    for x, (w, c) in mprof.items():
        if x in dprof: errs.append((x, dprof[x][0], w, w - dprof[x][0]))
    mean = sum(abs(e[3]) for e in errs) / max(1, len(errs))
    worst = max(errs, key=lambda e: abs(e[3])) if errs else None
    if os.environ.get('PLANE_TABLE') and view == 'top':
        print('   x from nose: drawing / model width (m)')
        print('   ' + '  '.join('%.0f:%.1f/%.1f' % (x, dprof[x][0], mprof[x][0]) for x in sorted(mprof) if x in dprof and abs(x - round(x)) < 0.05))
    dim = 'span' if view == 'top' else 'height'
    print(f'{a.key} {view}: model length {ml:.2f} m (real {L}), model {dim} {mh:.2f} m, drawing {dim} {dh:.2f} m' + (f' (real span {cfg["span"]})' if view == 'top' else '')
          + f'; mean |{dim} difference| {mean:.2f} m, worst {abs(worst[3]):.2f} m at {worst[0]:.1f} m from the nose (drawing {worst[1]:.2f}, model {worst[2]:.2f})')
    # picture: both silhouettes, aligned on the nose and the centre, drawn at the model scale
    k = ppm / dppm
    dimg = ds.resize((max(1, round(ds.width * k)), max(1, round(ds.height * k))))
    bb = bbox(dimg); mb = bbox(mm)
    pic = Image.new('RGB', (W, Hh), (255, 255, 255))
    dd = Image.new('L', (W, Hh), 0); mm2 = Image.new('L', (W, Hh), 0)
    dd.paste(dimg.crop(bb), (mb[0], round((mb[1] + mb[3]) / 2 - (bb[3] - bb[1]) / 2)))
    mm2.paste(mm.crop(mb), (mb[0], mb[1]))
    both = Image.new('L', (W, Hh), 0)
    from PIL import ImageChops
    both = ImageChops.multiply(dd, mm2); od = ImageChops.subtract(dd, mm2); om = ImageChops.subtract(mm2, dd)
    pic.paste((150, 150, 150), (0, 0, W, Hh), both); pic.paste((230, 30, 30), (0, 0, W, Hh), od); pic.paste((30, 80, 230), (0, 0, W, Hh), om)
    pic.crop((max(0, mb[0] - 20), max(0, mb[1] - 20), min(W, mb[2] + 20), min(Hh, mb[3] + 20))).save(os.path.join(a.out, f'plane_{a.key}_{view}_diff.png'))
