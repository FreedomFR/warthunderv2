// Reading the baked reference meshes (ships/<id>_baked.js, ships/<id>_mounts_baked.js, made by tools/refs/bake*.py): base64 pieces -> positions in metres, smooth normals, colours, indices.

/** One baked piece { pos (int16 x y z), col (u8 r g b), idx (u16 or u32), wide } at the given quantisation scale: typed arrays ready for MeshBuilder.raw. */
export function decodeBaked(piece, scale, creaseDeg = 40) {
  const bytes = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const q = new Int16Array(bytes(piece.pos).buffer), col = piece.col ? bytes(piece.col) : new Uint8Array(q.length), ib = bytes(piece.idx).buffer;      // (no colour: a piece that the shader paints)
  const idx = piece.wide ? new Uint32Array(ib) : new Uint16Array(ib);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / scale;
  // crease-aware normals: a corner takes the area weighted normal of the faces round its vertex that lie within 40 degrees of its own face, so a flat deck stays flat and a wall edge stays sharp
  const nT = idx.length / 3, fn = new Float32Array(nT * 3), start = new Uint32Array(pos.length / 3 + 1);
  for (let t = 0; t < nT; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;               // not normalised: its length is twice the area
    for (let k = 0; k < 3; k++) start[idx[t * 3 + k] + 1]++;
  }
  for (let v = 0; v < start.length - 1; v++) start[v + 1] += start[v];
  const fill = start.slice(0, -1), adj = new Uint32Array(nT * 3);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) adj[fill[idx[t * 3 + k]]++] = t;
  const P2 = new Float32Array(nT * 9), N2 = new Float32Array(nT * 9), C2 = new Uint8Array(nT * 9), I2 = new Uint32Array(nT * 3);
  const COS = Math.cos(creaseDeg * Math.PI / 180);
  for (let t = 0; t < nT; t++) {
    const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      let nx = 0, ny = 0, nz = 0;
      for (let q = start[v]; q < start[v + 1]; q++) {
        const u = adj[q], gx = fn[u * 3], gy = fn[u * 3 + 1], gz = fn[u * 3 + 2], gl = Math.hypot(gx, gy, gz) || 1;
        if ((fx * gx + fy * gy + fz * gz) / (fl * gl) > COS) { nx += gx; ny += gy; nz += gz; }
      }
      const l = Math.hypot(nx, ny, nz) || 1, o = t * 9 + k * 3;
      N2[o] = nx / l; N2[o + 1] = ny / l; N2[o + 2] = nz / l;
      P2[o] = pos[v * 3]; P2[o + 1] = pos[v * 3 + 1]; P2[o + 2] = pos[v * 3 + 2];
      C2[o] = col[v * 3]; C2[o + 1] = col[v * 3 + 1]; C2[o + 2] = col[v * 3 + 2];
      I2[t * 3 + k] = t * 3 + k;
    }
  }
  return { pos: P2, nrm: N2, col: C2, idx: I2 };
}

/** The geometry of a baked piece only (positions in metres, indices): for what does not need normals or colours. */
export function decodeBakedGeometry(piece, scale) {
  const bytes = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const q = new Int16Array(bytes(piece.pos).buffer), ib = bytes(piece.idx).buffer;
  const idx = piece.wide ? new Uint32Array(ib) : new Uint16Array(ib);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = q[i] / scale;
  return { pos, idx };
}

/** A baked piece without the triangles for which drop(cx, cy, cz, area) is true (the vertices left unused are dropped): { pos, col, idx, wide } like the original. */
export function cutBaked(piece, scale, drop) {
  const bytes = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const q = new Int16Array(bytes(piece.pos).buffer), col = bytes(piece.col), ib = bytes(piece.idx).buffer;
  const idx = piece.wide ? new Uint32Array(ib) : new Uint16Array(ib);
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = (q[b] - q[a]) / scale, uy = (q[b + 1] - q[a + 1]) / scale, uz = (q[b + 2] - q[a + 2]) / scale, vx = (q[c] - q[a]) / scale, vy = (q[c + 1] - q[a + 1]) / scale, vz = (q[c + 2] - q[a + 2]) / scale;
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    if (!drop((q[a] + q[b] + q[c]) / 3 / scale, (q[a + 1] + q[b + 1] + q[c + 1]) / 3 / scale, (q[a + 2] + q[b + 2] + q[c + 2]) / 3 / scale, area)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const used = new Map(); let n = 0;
  for (const v of keep) if (!used.has(v)) used.set(v, n++);
  const nq = new Int16Array(n * 3), nc = new Uint8Array(n * 3);
  for (const [v, k] of used) { nq[k * 3] = q[v * 3]; nq[k * 3 + 1] = q[v * 3 + 1]; nq[k * 3 + 2] = q[v * 3 + 2]; nc[k * 3] = col[v * 3]; nc[k * 3 + 1] = col[v * 3 + 1]; nc[k * 3 + 2] = col[v * 3 + 2]; }
  const wide = n >= 65536, ni = wide ? new Uint32Array(keep.length) : new Uint16Array(keep.length);
  for (let i = 0; i < keep.length; i++) ni[i] = used.get(keep[i]);
  const b64 = (a) => { let s = ''; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return { nv: n, ni: keep.length, pos: b64(nq), col: b64(nc), idx: b64(ni), wide };
}
