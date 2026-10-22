import sys, glob, os
from PIL import Image, ImageDraw
# usage: sheet.py out.jpg dir [cols] [maxframes]
out, d = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
files = sorted(glob.glob(os.path.join(d, '**', '*.png'), recursive=True))
if len(sys.argv) > 4: files = files[::max(1, len(files)//int(sys.argv[4]))][:int(sys.argv[4])]
def tight(im):
    # crop to what differs from the background (the corner colour), with a margin, so that a small model fills its tile (plain-background pictures of tools/refs/studio.mjs)
    from PIL import ImageChops
    bg = Image.new('RGB', im.size, im.getpixel((4, 4)))
    box = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 14 else 0).getbbox()
    if not box: return im
    m = int(0.04 * max(im.size)); x0, y0, x1, y1 = max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)
    c = im.crop((x0, y0, x1, y1)); r = im.size[0] / im.size[1]
    w2, h2 = c.size
    if w2 / h2 < r: w2 = int(h2 * r)
    else: h2 = int(w2 / r)
    out = Image.new('RGB', (w2, h2), im.getpixel((4, 4))); out.paste(c, ((w2 - c.width) // 2, (h2 - c.height) // 2)); return out
TIGHT = os.environ.get('TIGHT', '1') == '1'
ims = [Image.open(f).convert('RGB') for f in files]
if TIGHT: ims = [tight(i) for i in ims]
if not ims: raise SystemExit('no frames')
w, h = ims[0].size
tw = 640; th = int(h * tw / w)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
dr = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    im = im.resize((tw, th), Image.LANCZOS)
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
    dr.text(((i % cols) * tw + 6, (i // cols) * th + 4), os.path.relpath(f, d), fill=(255, 255, 0))
sheet.save(out, quality=88)
print(out, sheet.size, len(ims))
