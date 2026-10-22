"""Side view of a reference (from `gltf.mjs views ... --s=S`) cut in four stretches with a grid in fractions of the length (green, label = fraction at the LEFT edge, decreasing to the right
because the bow is on the right) and metres above the waterline (blue):
    python3 tools/refs/gridview.py refs/tade/hi/side_starboard.png refs/tade/hi 22 88.4 2.6      # image, out dir, px per metre, LOA, waterline height above the lowest point (m)
Writes g0..g3.png. Position of an object = left label - pixel / (px per metre * LOA) (pixel counted from the left edge of the crop)."""
import subprocess, sys
from PIL import Image
img, out, S, L, wl = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
pad = 2
im = Image.open(img); H = im.size[1]
stern, bow, wlrow = pad * S, (L + pad) * S, H - (pad + wl) * S
for k, (a, b) in enumerate([(0, 0.3), (0.25, 0.55), (0.5, 0.8), (0.75, 1.0)]):
    subprocess.run(['python3', 'tools/refs/grid.py', img, f'{out}/g{k}.png', '--stern', str(stern), '--bow', str(bow), '--loa', str(L), '--y0', '0', '--y1', str(int(H)), '--view', 'side', '--wl', str(wlrow), '--f0', str(a), '--f1', str(b), '--scale', '1.0', '--step', '0.01'], check=True, capture_output=True)
print('left labels: 0.30 / 0.55 / 0.80 / 1.00; px per 0.05 of length =', round(0.05 * L * S))
