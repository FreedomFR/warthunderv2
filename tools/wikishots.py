"""Cut out the side views of tools/wikishots.mjs (<id>_black.png and <id>_white.png of one ship: the same picture on a black and on a white background) and write them
as transparent WebP at one scale for all ships (a destroyer is half as long as a battleship):
    python3 tools/wikishots.py out/wiki wiki/ships [--ppm=6] [--only=id,id]
alpha = 1 - (white - black) / white, colour = black / alpha."""
import json, os, sys
from PIL import Image, ImageChops, ImageMath

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a[2:].split('=', 1) for a in sys.argv[3:] if a.startswith('--') and '=' in a)
TPPM = float(opts.get('ppm', 6)); only = opts['only'].split(',') if 'only' in opts else None
meta = json.load(open(os.path.join(src, 'meta.json'))); os.makedirs(dst, exist_ok=True)
for id_ in sorted(meta):
    if only and id_ not in only: continue
    bp, wp = os.path.join(src, id_ + '_black.png'), os.path.join(src, id_ + '_white.png')
    if not (os.path.exists(bp) and os.path.exists(wp)): continue
    B, Wh = Image.open(bp).convert('RGB'), Image.open(wp).convert('RGB')
    wv = Wh.getpixel((3, 3)); bv = B.getpixel((3, 3))
    d = ImageChops.subtract(Wh, B).split()
    # transparency from each channel (the same up to rounding): the mean of the three
    alphas = [d[i].point(lambda v, w=max(1, wv[i] - bv[i]): max(0, min(255, round(255 - v * 255 / w)))) for i in range(3)]
    A = ImageMath.eval("convert((a + b + c) / 3, 'L')", a=alphas[0].convert('F'), b=alphas[1].convert('F'), c=alphas[2].convert('F'))
    chans = [ImageMath.eval("convert(min(c * 255 / (a + 1), 255), 'L')", c=B.split()[i].convert('F'), a=A.convert('F')) for i in range(3)]
    A = A.point(lambda v: 0 if v < 6 else v)
    box = A.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box: print(id_, 'empty'); continue
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(A.width, box[2] + pad), min(A.height, box[3] + pad))
    im = Image.merge('RGBA', (*chans, A)).crop(box)
    s = TPPM / meta[id_]['ppm']
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = os.path.join(dst, id_ + '.webp')
    im.save(out, 'WEBP', quality=84, method=6, alpha_quality=90)
    print(id_, im.size, os.path.getsize(out) // 1024, 'KB')
