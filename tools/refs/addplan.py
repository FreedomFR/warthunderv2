"""Adds (or replaces) an entry of tools/refs/plans.json from the JSON that `node tools/refs/gltf.mjs plan ...` prints, keeping the file's layout:
    node tools/refs/gltf.mjs plan refs/adams/src refs/adams --loa=133.2 --draft=4.6 | python3 tools/refs/addplan.py [--camera-look-y 10]
"""
import json, os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__)); path = os.path.join(HERE, 'plans.json')
new = json.load(sys.stdin)
d = json.load(open(path))
look = float(sys.argv[sys.argv.index('--camera-look-y') + 1]) if '--camera-look-y' in sys.argv else 10
for k, v in new.items():
    dist = round(v['loa'] * 6.63)
    v['camera'] = {'side': {'dist': dist, 'fov': 4, 'lookY': look, 'el': 0}, 'top': {'dist': dist, 'fov': 4, 'lookY': 0, 'el': 89.5}}
    d[k] = v
open(path, 'w').write(json.dumps(d, indent=2) + '\n')
