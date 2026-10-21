#!/bin/bash
# The measured check of a ship against its plans.json entry: renders the matte views on the GPU (Windows Node under WSL) and prints the silhouette differences.
#   tools/refs/chk.sh tade [side|top|both]
ship=$1; views=${2:-both}
cd "$(dirname "$0")/../.."
if [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/refs/check.mjs "$ship" out/check >/dev/null; else node tools/refs/check.mjs "$ship" out/check >/dev/null; fi
for v in side top; do
  if [ "$views" = both ] || [ "$views" = $v ]; then echo "== $ship $v"; python3 tools/refs/silhouette.py "$ship" $v out/check/${ship}_${v}_render.png | tail -${LINES_OUT:-14}; fi
done
