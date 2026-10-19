"""Hull tables read off the drawings of tools/refs/plans.json, ready to paste into tools/game/model/tweaks.js:

    python3 tools/refs/hull.py <ship> [--n 24]

  planDeck : half-breadth of the deck edge from the plan view, as a fraction of the maximum (the model's B / 2 is the maximum)
  fb       : freeboard, the lower envelope of the profile above the waterline (the deck between the superstructures: rolling minimum
             over +-4 m, so that guns, boats and houses do not count), in metres
  keel     : depth of the keel line below the waterline as a fraction of the draft (when the drawing shows the underwater body)
"""
import argparse, json, os
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))

def auto_rulers(d, region, thr=0.22, dark=235):
    """rows of the sheet that are observer-height lines: dark in at least thr of a sky region (x0, x1, y0, y1)"""
    x0, x1, y0, y1 = region; px = d.load(); rows = []
    for y in range(y0, y1):
        n = sum(1 for x in range(x0, x1) if px[x, y] < dark)
        if n > (x1 - x0) * thr: rows.append(y)
    groups = []
    for y in rows:
        if groups and y - groups[-1][-1] <= 3: groups[-1].append(y)
        else: groups.append([y])
    return [(g[0], g[-1]) for g in groups]

ap = argparse.ArgumentParser(); ap.add_argument('ship'); ap.add_argument('--n', type=int, default=24)
ap.add_argument('--B', type=float, default=None, help='the model waterline beam (m): planDeck ratios are then relative to B / 2 (they can exceed 1), as the builder reads them')
a = ap.parse_args()
cfg = json.load(open(os.path.join(HERE, 'plans.json')))[a.ship]
L = cfg['loa']

def load(ref):
    d = Image.open(os.path.join(HERE, '..', '..', ref['file'])).convert('RGBA')
    bg = Image.new('RGBA', d.size, (255, 255, 255, 255)); bg.alpha_composite(d); d = bg.convert('L')
    for e in ref.get('erase', []): d.paste(255, tuple(e))
    for y in ref.get('rulers', []): d.paste(255, (0, int(y) - 2, d.width, int(y) + 3))
    if ref.get('rulerRegion'):
        for y0_, y1_ in auto_rulers(d, ref['rulerRegion']): d.paste(255, (0, y0_ - 4, d.width, y1_ + 5))
    x0, y0, x1, y1 = ref['crop']; d = d.crop((x0, y0, x1, y1))
    ink = d.point(lambda v: 255 if v < ref.get('threshold', 200) else 0)
    if ref.get('dilate'): ink = ink.filter(ImageFilter.MaxFilter(ref['dilate']))
    k = ref.get('close', 3)
    ink = ink.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    ko = ref.get('open', 3 if ref is cfg.get('side') else 0)
    if ko: ink = ink.filter(ImageFilter.MinFilter(ko)).filter(ImageFilter.MaxFilter(ko))
    return ink, x0, y0

def col_top(ink, px, y_from, y_to, run):
    dp = ink.load()
    for py in range(y_from, y_to):
        if all(dp[px, py + j] for j in range(run)): return py
    return None

fs = [i / a.n for i in range(a.n + 1)]
if 'top' in cfg:
    ref = cfg['top']; ink, x0, y0 = load(ref); dppm = (ref['bow'] - ref['stern']) / L; cl = ref['cl'] - y0
    run = max(2, int(0.3 * dppm)); out = []
    for f in fs:
        px = int(round(ref['bow'] - x0 - f * (ref['bow'] - ref['stern'])))
        px = min(max(px, int(ref['stern'] - x0) + 1), int(ref['bow'] - x0) - 1)
        dp = ink.load(); bot = None
        for py in range(ink.height - 1, int(cl), -1):
            if all(dp[px, py - j] for j in range(run)): bot = py; break
        out.append(((bot - cl) / dppm) if bot else 0)
    mx = a.B / 2 if a.B else max(out)
    print('planDeck: [' + ', '.join('[%.3f, %.3f]' % (f, h / mx) for f, h in zip(fs, out)) + '],   // half-breadth reference %.2f m' % mx)
if 'side' in cfg:
    ref = cfg['side']; ink, x0, y0 = load(ref); dppm = (ref['bow'] - ref['stern']) / L; vppm = dppm * ref.get('vscale', 1)
    base = ref['wl'] - y0; run = max(2, int(0.3 * dppm))
    hs, ks = [], []
    for i in range(int(L * 2) + 1):
        xm = i / 2; f = xm / L
        px = int(round(ref['bow'] - x0 - xm * dppm)); px = min(max(px, int(ref['stern'] - x0) + 1), int(ref['bow'] - x0) - 1)
        t = col_top(ink, px, 0, int(base), run)
        hs.append(((base - t) / vppm) if t is not None else 0)
        if ref.get('under'):
            dp = ink.load(); bot = None
            for py in range(ink.height - 1, int(base), -1):
                if all(dp[px, py - j] for j in range(run)): bot = py; break
            ks.append(((bot - base) / vppm) if bot else 0)
    def env(f):
        i = int(round(f * L * 2)); w = 8
        lo = max(0, i - w); hi = min(len(hs) - 1, i + w)
        return min(hs[lo:hi + 1])
    print('fb:       [' + ', '.join('[%.3f, %.2f]' % (f, env(f)) for f in fs) + '],   // lower envelope of the profile above the waterline, m')
    print('bow top at the stem: %.2f m, at the stern: %.2f m' % (max(hs[0:6]), max(hs[-6:])))
    if ks:
        mx = max(ks)
        print('keel:     [' + ', '.join('[%.3f, %.2f]' % (f, ks[min(len(ks) - 1, int(round(f * L * 2)))] / mx) for f in fs) + '],   // depth below the waterline / max (%.2f m)' % mx)
