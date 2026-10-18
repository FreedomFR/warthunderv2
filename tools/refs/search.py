"""Search Wikimedia Commons for files (photographs, plans) and print title, size and licence.

    python3 tools/refs/search.py "Iowa class battleship plan" [limit]
"""
import json, subprocess, sys, urllib.parse
UA = 'Mozilla/5.0 (research; contact via github FreedomFR/warthunderv2)'
q, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30
u = ('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&format=json'
     f'&gsrlimit={n}&gsrsearch={urllib.parse.quote(q)}&prop=imageinfo&iiprop=size%7Cextmetadata&iiextmetadatafilter=LicenseShortName')
d = json.loads(subprocess.run(['curl', '-sS', '-m', '60', '-A', UA, u], capture_output=True).stdout or b'{}')
pages = sorted((d.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
for p in pages:
    ii = (p.get('imageinfo') or [{}])[0]
    em = ii.get('extmetadata') or {}
    lic = em.get('LicenseShortName', {}).get('value', '?') if isinstance(em, dict) else '?'
    print(f"{ii.get('width', 0):>5}x{ii.get('height', 0):<5} {lic:<16} {p['title'][5:]}")
