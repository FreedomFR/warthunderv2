"""One picture for several ships: the chosen views of each, cropped to the ship (the plain-background pictures of studio.mjs):
    python3 tools/refs/montage.py out/studio/m1.jpg out/studio ship1,ship2,ship3 bow_starboard,stern_port"""
import sys, os
from PIL import Image, ImageDraw, ImageChops
out, d, ships, views = sys.argv[1], sys.argv[2], sys.argv[3].split(','), sys.argv[4].split(',')
tw, th = 640, 360
def tight(im):
    bg = Image.new('RGB', im.size, im.getpixel((4, 4)))
    box = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 14 else 0).getbbox()
    if not box: return im
    m = int(0.04 * max(im.size)); c = im.crop((max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m)))
    r = tw / th; w2, h2 = c.size
    if w2 / h2 < r: w2 = int(h2 * r)
    else: h2 = int(w2 / r)
    o = Image.new('RGB', (w2, h2), im.getpixel((4, 4))); o.paste(c, ((w2 - c.width) // 2, (h2 - c.height) // 2)); return o
sheet = Image.new('RGB', (tw * len(views), th * len(ships)), (0, 0, 0)); dr = ImageDraw.Draw(sheet)
for i, s in enumerate(ships):
    for j, v in enumerate(views):
        f = os.path.join(d, s, v + '.png')
        if not os.path.exists(f): continue
        im = tight(Image.open(f).convert('RGB')).resize((tw, th), Image.LANCZOS); sheet.paste(im, (j * tw, i * th)); dr.text((j * tw + 6, i * th + 4), f'{s} {v}', fill=(255, 255, 0))
sheet.save(out, quality=88); print(out, sheet.size)
