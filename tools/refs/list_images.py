"""List the image files used by Wikipedia articles (to find photographs of a ship on Commons).

    python3 tools/refs/list_images.py "USS Iowa (BB-61)" "Japanese battleship Yamato"
"""
import json, subprocess, urllib.parse, sys, time
def get(u, tries=4):
    for i in range(tries):
        r = subprocess.run(['curl','-sS','-L','-m','60','-A','Mozilla/5.0 (research; contact via github FreedomFR/warthunderv2)',u],capture_output=True)
        if r.stdout[:1] in (b'{', b'[') or u.endswith(('.jpg','.png','.jpeg','.svg')) or b'\x89PNG' in r.stdout[:8] or r.stdout[:3]==b'\xff\xd8\xff':
            return r.stdout
        time.sleep(3 + 3*i)
    return r.stdout
def images_of(page):
    t = urllib.parse.quote(page)
    d = json.loads(get(f'https://en.wikipedia.org/w/api.php?action=query&titles={t}&prop=images&imlimit=100&format=json'))
    out = []
    for p in d['query']['pages'].values():
        out += [i['title'] for i in p.get('images', [])]
    return out
if __name__ == '__main__':
    for page in sys.argv[1:]:
        print('==', page)
        for i in images_of(page): print('  ', i)
        time.sleep(1.5)
