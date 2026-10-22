"""Stack pictures with their names: python3 tools/refs/stack.py out.png a.png b.png ... (vertical)"""
import sys
from PIL import Image, ImageDraw
ims = [Image.open(f).convert('RGB') for f in sys.argv[2:]]
w = max(i.width for i in ims); h = sum(i.height + 14 for i in ims)
o = Image.new('RGB', (w, h), (255, 255, 255)); d = ImageDraw.Draw(o); y = 0
for f, i in zip(sys.argv[2:], ims):
    d.text((4, y), f.split('/')[-1], fill=(200, 0, 0)); o.paste(i, (0, y + 14)); y += i.height + 14
o.save(sys.argv[1])
