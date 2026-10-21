#!/bin/bash
# An enlarged, gridded stretch of an `inside` picture (gltf.mjs inside): tools/refs/gridin.sh <inside.png> <out.png> <px per metre> <LOA> <waterline height> <f0> <f1> [scale=2.4]
img=$1; out=$2; S=$3; L=$4; wl=$5; f0=$6; f1=$7; k=${8:-2.4}
H=$(python3 -c "from PIL import Image; print(Image.open('$img').size[1])")
python3 - <<PY
import subprocess
S,L,wl,H=$S,$L,$wl,$H
pad=2
subprocess.run(['python3','tools/refs/grid.py','$img','$out','--stern',str(pad*S),'--bow',str((L+pad)*S),'--loa',str(L),'--y0',str(int(H*0.35)),'--y1',str(H),'--view','side','--wl',str(H-(pad+wl)*S-int(H*0.35)),'--f0','$f0','--f1','$f1','--scale','$k','--step','0.01'],check=True)
PY
