import sys, glob, os
from PIL import Image, ImageDraw
# usage: sheet.py out.jpg dir [cols] [maxframes]
out, d = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
files = sorted(glob.glob(os.path.join(d, '**', '*.png'), recursive=True))
if len(sys.argv) > 4: files = files[::max(1, len(files)//int(sys.argv[4]))][:int(sys.argv[4])]
ims = [Image.open(f).convert('RGB') for f in files]
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
