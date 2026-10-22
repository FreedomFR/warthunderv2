// Reading the baked reference meshes (ships/<id>_baked.js, ships/<id>_mounts_baked.js, made by tools/refs/bake*.py): base64 pieces -> positions in metres, smooth normals, colours, indices.

/** One baked piece { pos (int16 x y z), col (u8 r g b), idx (u16 or u32), wide } at the given quantisation scale: typed arrays ready for MeshBuilder.raw. */
export function decodeBaked(piece, scale) {
  const bytes = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const q = new Int16Array(bytes(piece.pos).buffer), col = bytes(piece.col), ib = bytes(piece.idx).buffer;
  const idx = piece.wide ? new Uint32Array(ib) : new Uint16Array(ib);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / scale;
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;                      // area weighted
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return { pos, nrm, col, idx };
}
