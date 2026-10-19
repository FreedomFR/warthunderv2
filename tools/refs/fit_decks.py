"""Turn the profile of a drawing into stepped superstructure blocks (tweaks.decks), so that the model's silhouette follows the plan.

    python3 tools/refs/fit_decks.py <ship> --fb "0:7.4,0.1:5.2,0.5:4.8,1:3.4" [--min 2.0] [--tol 0.8] [--skip 0.10-0.30,0.70-0.80] [--hw 0.42]

Reads out/check/<ship>_side.json (written by silhouette.py: the drawing's height above the waterline at every station) and, when there is one,
out/check/<ship>_top.json (the drawing's half-breadth). A stretch of the length where the drawing stays at one height more than 1.0 m above the
deck is one block: f range, height above the local deck (the --fb table is the model's deck line), half-width = --hw x the plan half-breadth there
(narrower for higher stretches). --skip ranges (fractions from the bow) are left out: turrets, funnels, masts and cranes are placed separately.
Prints lines to paste into the ship's tweaks entry.
"""
import argparse, json, re
ap = argparse.ArgumentParser(); ap.add_argument('ship'); ap.add_argument('--fb', required=True)
ap.add_argument('--min', type=float, default=2.0, help='shortest block (m)'); ap.add_argument('--tol', type=float, default=0.8)
ap.add_argument('--skip', default=''); ap.add_argument('--hw', type=float, default=0.42); ap.add_argument('--dir', default='out/check')
ap.add_argument('--above', type=float, default=1.2, help='blocks only where the drawing is this much above the deck (m)')
a = ap.parse_args()
L = json.load(open('tools/refs/plans.json'))[a.ship]['loa']
fb = sorted((float(x.split(':')[0]), float(x.split(':')[1])) for x in a.fb.split(','))
def deck(f):
    for (f0, h0), (f1, h1) in zip(fb, fb[1:]):
        if f0 <= f <= f1: return h0 + (h1 - h0) * (f - f0) / (f1 - f0 or 1)
    return fb[-1][1] if f > fb[-1][0] else fb[0][1]
skip = [tuple(float(v) for v in r.split('-')) for r in a.skip.split(',') if r]
side = json.load(open(f'{a.dir}/{a.ship}_side.json'))['stations']
try: top = {round(f, 3): dr for f, dr, m in json.load(open(f'{a.dir}/{a.ship}_top.json'))['stations']}
except Exception: top = {}
def hw_at(f):
    if not top: return 6.0
    k = min(top, key=lambda t: abs(t - f)); return max(top[k], 2.0)
# stations from the bow (f = 0) to the stern
rows = sorted(((f, dr) for f, dr, m in side), key=lambda r: r[0])
blocks = []
cur = None
for f, h in rows:
    ab = h - deck(f)
    if any(s0 <= f <= s1 for s0, s1 in skip) or ab < a.above:
        cur = None; continue
    if cur and abs(h - cur['hs'][-1]) <= a.tol and f - cur['f1'] < 0.006: cur['f1'] = f; cur['hs'].append(h)
    else:
        cur = {'f0': f, 'f1': f, 'hs': [h]}; blocks.append(cur)
out = []
hmax = max((max(b['hs']) for b in blocks), default=1)
for b in blocks:
    ln = (b['f1'] - b['f0']) * L
    if ln < a.min: continue
    h = sorted(b['hs'])[len(b['hs']) // 2]
    fm = (b['f0'] + b['f1']) / 2
    top_above = h - deck(fm)
    hw = hw_at(fm) * a.hw * (1 - 0.45 * min(1, (h - 8) / max(hmax - 8, 1)))
    out.append(f"      {{ f: [{b['f0']:.3f}, {b['f1']:.3f}], hw: {max(hw, 1.4):.1f}, y: [0, {top_above:.1f}] }},   // {ln:.1f} m, top {h:.1f} m")
print('    decks: [\n' + '\n'.join(out) + '\n    ],')
