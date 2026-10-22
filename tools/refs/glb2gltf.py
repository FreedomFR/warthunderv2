#!/usr/bin/env python3
"""A .glb unpacked into the scene.gltf + scene.bin + textures/ that tools/refs/gltf.mjs reads: python3 tools/refs/glb2gltf.py model.glb refs/<id>/src"""
import sys, json, struct, os
src, out = sys.argv[1:3]
os.makedirs(os.path.join(out, 'textures'), exist_ok=True)
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
g = json.loads(b[20:20 + jl])
off = 20 + jl
binchunk = b''
while off < len(b):
    cl, ct = struct.unpack('<II', b[off:off + 8])
    if ct == 0x004E4942:
        binchunk = b[off + 8:off + 8 + cl]
    off += 8 + cl
open(os.path.join(out, 'scene.bin'), 'wb').write(binchunk)
for i, im in enumerate(g.get('images', [])):
    if 'bufferView' in im:
        bv = g['bufferViews'][im['bufferView']]
        data = binchunk[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        ext = 'png' if im.get('mimeType', '').endswith('png') else 'jpg'
        name = f'textures/img{i}.{ext}'
        open(os.path.join(out, name), 'wb').write(data)
        im['uri'] = name
        del im['bufferView']
g['buffers'] = [{'uri': 'scene.bin', 'byteLength': len(binchunk)}]
json.dump(g, open(os.path.join(out, 'scene.gltf'), 'w'))
print(out, len(g['nodes']), 'nodes', len(g['meshes']), 'meshes', len(g.get('images', [])), 'images')
