#!/bin/bash
# Records every scene of the v0.2.0 trailer on the GPU (Windows Node under WSL2, see CLAUDE.md): 1920x1080, 60 fps, with the game sounds.
#   node server.mjs 8080 &      then      tools/trailer/record-0.2.0.sh out/f60
OUT=${1:-out/f60}
for sc in isles isle_fire shellcam cockpit split boom torp dive carrier duel fire_baltimore fire_takao fleets med end; do
  echo "== $sc $(date +%T)"
  GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/trailer/record.mjs $sc $OUT --w 1920 --h 1080 --fps 60 --audio 1 --grid 32 --fft 256 2>&1 | grep -E "\[T\]|rror|done|audio"
done
echo "== finished $(date +%T)"
