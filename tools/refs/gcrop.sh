#!/bin/bash
# The reference model on a window with a grid in game metres: tools/refs/gcrop.sh <refdir> <loa> <waterline> <out.png> --view=side|top --cx=20 --c=8 --w=40 --h=20 [--s=30] [--step=1] [--label=5] [--bow=1]
# side: az 180 (starboard side, bow to the right), c = height above the waterline of the window centre; top: seen from above, bow to the right, starboard at the bottom, c = z of the centre
ref=$1; loa=$2; wl=$3; out=$4; shift 4
view=side; cx=0; c=0; w=40; h=20; s=30; step=1; label=5; extra=()
for a in "$@"; do case $a in --view=*) view=${a#*=};; --cx=*) cx=${a#*=};; --c=*) c=${a#*=};; --w=*) w=${a#*=};; --h=*) h=${a#*=};; --s=*) s=${a#*=};; --step=*) step=${a#*=};; --label=*) label=${a#*=};; *) extra+=("$a");; esac; done
cd "$(dirname "$0")/../.."
if [ "$view" = top ]; then az=180; el=88; cy=0; cz=$c; else az=180; el=0; cy=$c; cz=0; fi
node tools/refs/gltf.mjs crop "$ref" "${out%.png}_raw.png" --loa=$loa --draft=$wl --az=$az --el=$el --cx=$cx --cy=$cy --cz=$cz --w=$w --h=$h --s=$s "${extra[@]}" >/dev/null
python3 tools/refs/gcrop.py "${out%.png}_raw.png" "$out" --cx $cx --c $c --w $w --h $h --view $view --step $step --label $label
echo "$out"
