#!/bin/bash
# The reference model and the game side by side on the same window (reference left, game right):
#   tools/refs/pair.sh <ship> <refdir> <loa> <waterline> <out.png> --az=135 --el=20 --cx=10 --cy=5 --cz=0 --w=30 --h=20 [--s=30]
# <refdir> = refs/<id>/src, <waterline> = the height of the waterline above the lowest point of the reference (m), cx/cy/cz in game metres (cy above the waterline)
ship=$1; ref=$2; loa=$3; wl=$4; out=$5; shift 5
cd "$(dirname "$0")/../.."
node tools/refs/gltf.mjs crop "$ref" "${out%.png}_ref.png" --loa=$loa --draft=$wl "$@" >/dev/null
if [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/refs/pair.mjs "$ship" "${out%.png}_game.png" "$@" >/dev/null; else node tools/refs/pair.mjs "$ship" "${out%.png}_game.png" "$@" >/dev/null; fi
python3 - "$out" <<'PY'
import sys
from PIL import Image
o = sys.argv[1]; a = Image.open(o[:-4] + '_ref.png').convert('RGB'); b = Image.open(o[:-4] + '_game.png').convert('RGB')
b = b.resize(a.size)
im = Image.new('RGB', (a.width * 2 + 8, a.height), (255, 0, 0)); im.paste(a, (0, 0)); im.paste(b, (a.width + 8, 0)); im.save(o)
PY
echo "$out"
