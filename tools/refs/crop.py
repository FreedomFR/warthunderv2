"""Crops and enlarges a part of a picture: python3 tools/refs/crop.py in.png out.png x0 x1 [scale=1.6]  (x0, x1 as fractions of the width)"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]); w, h = im.size; a, b = float(sys.argv[3]), float(sys.argv[4]); k = float(sys.argv[5]) if len(sys.argv) > 5 else 1.6
c = im.crop((int(w * a), 0, int(w * b), h)); c.resize((int(c.width * k), int(c.height * k))).save(sys.argv[2])
