"""Piecewise-constant outline of a drawing's profile: stretches of the length where the silhouette stays at the same height.

    python3 tools/refs/outline.py <ship> [--tol 0.7] [--min 1.5] [--deck 8.1]

Reads out/check/<ship>_side.json (written by silhouette.py). Prints  f0-f1  height (m above the waterline, and above --deck): the
stretches that are the decks, houses, turret roofs, funnels and mast stumps of the drawing, from the stern (f = 1) to the bow (f = 0).
"""
import argparse, json
ap = argparse.ArgumentParser(); ap.add_argument('ship'); ap.add_argument('--tol', type=float, default=0.7)
ap.add_argument('--min', type=float, default=1.5, help='shortest stretch printed (m)'); ap.add_argument('--deck', type=float, default=0)
ap.add_argument('--dir', default='out/check'); ap.add_argument('--loa', type=float)
a = ap.parse_args()
d = json.load(open(f'{a.dir}/{a.ship}_side.json'))['stations']
L = a.loa or json.load(open('tools/refs/plans.json'))[a.ship]['loa']
segs = []
for f, dr, m in d:
    if segs and abs(dr - segs[-1][2][-1]) <= a.tol and abs(f - segs[-1][1]) < 0.004: segs[-1][1] = f; segs[-1][2].append(dr)
    else: segs.append([f, f, [dr]])
print(f'{"f from":>7} {"f to":>7} {"len m":>6} {"h (WL)":>7} {"h-deck":>7}')
for f0, f1, hs in segs:
    ln = abs(f0 - f1) * L
    if ln < a.min: continue
    h = sorted(hs)[len(hs) // 2]
    print(f'{f0:7.3f} {f1:7.3f} {ln:6.1f} {h:7.1f} {h - a.deck:7.1f}')
