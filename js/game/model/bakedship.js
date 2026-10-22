// A ship drawn from a baked reference mesh (ships/<id>_baked.js, made by tools/refs/bake.py + bakeship.mjs): after the procedural build the hull and structure mesh and the intact look of the
// destroyable parts are replaced by the model's own triangles; the procedural geometry stays for the simulation (hit volumes, solids, arcs), the ruins, the fine detail, the mounts and the spinners.
import { MeshBuilder, MAT } from './meshbuilder.js';
import { decodeBaked } from './bakedmesh.js';

export function applyBaked(model, baked, scale) {
  const nb = new MeshBuilder();
  const draw = (piece) => { const d = decodeBaked(piece, scale); nb.raw(d.pos, d.nrm, d.col, d.idx, MAT.HULL); };
  if (baked.static) draw(baked.static);
  const ids = [];
  for (const p of model.parts) if (baked.parts[p.id]) { nb.group(p.id, () => draw(baked.parts[p.id])); ids.push(p.id); }
  const built = nb.build();
  model.mesh = built;
  for (const p of model.parts) if (baked.parts[p.id]) p.mesh = built.groups[p.id];
  return model;
}
