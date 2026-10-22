"""Draw the plan view of each ship in an arcs.json (tools/audit/arcs.mjs): the deck outline, the structures, the arcs of the guns (main red, secondary orange)
and of the light AA (blue; a solid wedge when the sector is limited, nothing is drawn for a free circle). A black cross marks a mount with no arc at all."""
import json, math, sys, os
from PIL import Image, ImageDraw
data = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
S = 7.0
for sh in data:
    L, B = sh['L'], sh['B']
    W, H = int(L * S + 120), int(B * S * 1.0 + 220)
    im = Image.new('RGB', (W, H), (236, 238, 240)); d = ImageDraw.Draw(im, 'RGBA')
    X = lambda x: 60 + (x + L / 2) * S          # bow on the right
    Z = lambda z: H / 2 + z * S
    top = [(X(x), Z(-w)) for x, w in sh['outline']]; bot = [(X(x), Z(w)) for x, w in sh['outline']]
    d.polygon(sh['outline'] and (top + bot[::-1]) or [], fill=(205, 210, 214), outline=(90, 90, 90))
    for s in sorted(sh['solids'], key=lambda s: s['b'][3]):
        x0, x1, y0, y1, z0, z1 = s['b']
        shade = int(max(0, min(1, y1 / 45)) * 90)
        col = (120 + shade, 125 + shade, 130 + shade, 150)
        if s['poly']: d.polygon([(X(p[0]), Z(p[1])) for p in s['poly']], fill=col, outline=(70, 70, 70, 200))
        elif s['round']: d.ellipse([X(x0), Z(z0), X(x1), Z(z1)], fill=col, outline=(70, 70, 70, 200))
        else: d.rectangle([X(x0), Z(z0), X(x1), Z(z1)], fill=col, outline=(70, 70, 70, 120))
    def wedge(x, z, c, a, b, r, col):
        # ship angle 0 = bow (+x), +90 = starboard (+z): in the picture x right, z down
        pts = [(X(x), Z(z))]
        n = max(2, int(abs(b - a) / 0.05))
        for k in range(n + 1):
            t = c + a + (b - a) * k / n
            pts.append((X(x + r * math.cos(t)), Z(z + r * math.sin(t))))
        d.polygon(pts, fill=col)
    for m in sh['mounts']:
        full = 2 * m['h']
        col = (220, 40, 40, 70) if m['g'] == 'main' else (240, 150, 20, 70)
        r = 7 + m["cal"] / 40
        if m['no']: d.line([X(m['x']) - 6, Z(m['z']) - 6, X(m['x']) + 6, Z(m['z']) + 6], fill=(0, 0, 0), width=3); d.line([X(m['x']) - 6, Z(m['z']) + 6, X(m['x']) + 6, Z(m['z']) - 6], fill=(0, 0, 0), width=3)
        else: wedge(m['x'], m['z'], m['c'], m['a'], m['b'], r, col)
        d.ellipse([X(m['x']) - 4, Z(m['z']) - 4, X(m['x']) + 4, Z(m['z']) + 4], fill=(180, 0, 0) if m['g'] == 'main' else (200, 110, 0))
    for t in sh.get('tubes', []):
        for q in t['s']: wedge(t['x'], t['z'], 0, q[0], q[1], 9, (30, 150, 60, 80))
        d.rectangle([X(t['x']) - 3, Z(t['z']) - 3, X(t['x']) + 3, Z(t['z']) + 3], fill=(20, 110, 40))
    for q in sh.get('missiles', []):
        wedge(q['x'], q['z'], q['c'], -q['h'], q['h'], 14, (150, 40, 200, 60))
        d.polygon([(X(q['x']), Z(q['z']) - 5), (X(q['x']) + 5, Z(q['z'])), (X(q['x']), Z(q['z']) + 5), (X(q['x']) - 5, Z(q['z']))], fill=(110, 20, 160))
    for a in sh['aa']:
        if a['no']: d.line([X(a['x']) - 4, Z(a['z']) - 4, X(a['x']) + 4, Z(a['z']) + 4], fill=(0, 0, 0), width=2); d.line([X(a['x']) - 4, Z(a['z']) + 4, X(a['x']) + 4, Z(a['z']) - 4], fill=(0, 0, 0), width=2); continue
        if a['b'] - a['a'] < 6.2: wedge(a['x'], a['z'], a['c'], a['a'], a['b'], 5, (20, 80, 230, 120))
        d.ellipse([X(a['x']) - 2.5, Z(a['z']) - 2.5, X(a['x']) + 2.5, Z(a['z']) + 2.5], fill=(10, 60, 200))
    d.text((8, 6), f"{sh['id']}   L={L} m   red = main, orange = secondary, blue = light AA with a blind sector, green = torpedo launchers, purple = missile launchers, X = no arc", fill=(0, 0, 0))
    im.save(f"{out}/{sh['id']}.png")
