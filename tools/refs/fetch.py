"""Download reference photographs from Wikimedia Commons (en.wikipedia.org as a fallback host) with their licence and author.

    python3 tools/refs/fetch.py <ship id> "<File title on Commons>" ["<another title>" ...]

Images go to refs/<ship id>/ (override with REFS_DIR; the folder is git-ignored: only measurements and observations taken from the
photographs belong in the repository), and one line per image is appended to refs/<ship id>/sources.jsonl. Commons rate-limits: the
script waits 4 s between files and retries on 429. Find titles with tools/refs/list_images.py <article> or on commons.wikimedia.org.
Check the licence (public domain, CC BY-SA...) before relying on a picture, and credit it in README.md.
"""
import json, subprocess, urllib.parse, sys, time, os, re
ROOT = os.environ.get('REFS_DIR', 'refs')
UA='Mozilla/5.0 (research; contact via github FreedomFR/warthunderv2)'
def curl(u, out=None, tries=5):
    for i in range(tries):
        args=['curl','-sS','-L','-m','120','-A',UA,u]
        if out: args += ['-o', out, '-w', '%{http_code}']
        r=subprocess.run(args,capture_output=True)
        if out:
            if r.stdout.decode()[:3]=='200': return True
        else:
            if r.stdout[:1]==b'{': return r.stdout
        time.sleep(4+4*i)
    return None if not out else False
def fetch(ship, title, width=1600):
    t=urllib.parse.quote('File:'+title)
    d=None
    for host in ('commons.wikimedia.org','en.wikipedia.org'):
        raw=curl(f'https://{host}/w/api.php?action=query&titles={t}&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth={width}&format=json')
        if not raw: continue
        d=json.loads(raw)
        if any('imageinfo' in p for p in d['query']['pages'].values()): break
    if not d: print('FAIL info', title); return
    for p in d['query']['pages'].values():
        ii=(p.get('imageinfo') or [None])[0]
        if not ii: print('missing', title); return
        em=ii.get('extmetadata',{})
        meta={'title':title,'url':ii['descriptionurl'],'w':ii['width'],'h':ii['height'],'license':em.get('LicenseShortName',{}).get('value'),'artist':re.sub('<[^>]+>','',em.get('Artist',{}).get('value',''))[:120],'credit':re.sub('<[^>]+>','',em.get('Credit',{}).get('value',''))[:120]}
        os.makedirs(os.path.join(ROOT, ship), exist_ok=True)
        fn=re.sub(r'[^A-Za-z0-9._-]+','_',title)
        fn=os.path.splitext(fn)[0][:70]+'.jpg'
        ok=curl(ii.get('thumburl') or ii['url'], out=os.path.join(ROOT, ship, fn))
        meta['file']=fn; meta['ok']=ok
        open(os.path.join(ROOT, ship, 'sources.jsonl'),'a').write(json.dumps(meta)+'\n')
        print(ship, fn, meta['license'], ok)
if __name__=='__main__':
    ship=sys.argv[1]
    for t in sys.argv[2:]:
        fetch(ship,t); time.sleep(4)
