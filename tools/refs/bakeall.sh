#!/bin/bash
# One ship baked from its reference model: tools/refs/bakeall.sh <shipId> <refsdir> <loa> <draft> <tris> [bakeraw flags: --bow=1 --mirror=1]
id=$1; ref=$2; loa=$3; draft=$4; tris=$5; shift 5
cd "$(dirname "$0")/../.."
node tools/refs/gltf.mjs bakeraw refs/$ref/src refs/$ref/bake --loa=$loa --draft=$draft "$@" || exit 1
node tools/refs/shiplayout.mjs $id > refs/$ref/layout.json || exit 1
python3 tools/refs/bake.py refs/$ref/bake --tris=100000000 $BAKE_FLAGS --out=refs/$ref/baked_full 2>&1 | tail -1
node tools/refs/decimate.mjs refs/$ref/baked_full refs/$ref/baked --tris=$tris $DECIMATE_FLAGS 2>&1 | tail -1
python3 tools/refs/bakemounts2.py refs/$ref/baked_full refs/$ref/layout.json js/game/model/ships/${id}_mounts_baked.js refs/$ref/mounts_mask.json $MOUNTS_FLAGS 2>&1 | tail -12
node tools/refs/bakeship.mjs refs/$ref/baked refs/$ref/layout.json js/game/model/ships/${id}_baked.js --mask=refs/$ref/mounts_mask.json $BAKESHIP_FLAGS
