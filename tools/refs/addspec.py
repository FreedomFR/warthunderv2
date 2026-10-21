"""Appends (or replaces, same id) a ship's spec sheet in js/game/data/specs/<nation>.js from a JSON file, in the one-line style of the file:
    python3 tools/refs/addspec.py usa spec_adams.json
The JSON may carry a "measured" note and "estimated" list like the other entries; the entry is validated as JSON before it is written.
"""
import json, os, re, sys
nation, src = sys.argv[1], sys.argv[2]
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'js', 'game', 'data', 'specs', nation + '.js')
spec = json.load(open(src))
line = json.dumps(spec, ensure_ascii=False, separators=(',', ':'))
s = open(path).read()
pat = re.compile(r'\n  \{"id":"%s",.*?\n(?=  \{"id":|\];)' % re.escape(spec['id']), re.S)
if pat.search(s):
    s = pat.sub('\n  ' + line.replace('\\', '\\\\') + ',\n', s, count=1)
else:
    i = s.rindex('\n];')
    body = s[:i].rstrip()
    if not body.endswith(','): body += ','
    s = body + '\n  ' + line + ',\n' + s[i + 1:]
open(path, 'w').write(s)
print('ok', spec['id'], len(line), 'chars ->', path)
