// Sun shadow map light matrix (orthographic, camera-relative coordinates).
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * out: Float32Array(16), sun: unit vector towards the sun, (cx, cy, cz): centre of the shadowed region in
 * camera-relative coordinates, R: half extent (m), size: shadow map size in texels.
 * The centre is snapped to texel increments so shadows do not shimmer when the camera moves.
 */
export function lightMatrix(out, sun, cx, cy, cz, R, size) {
  const f = [-sun[0], -sun[1], -sun[2]];                         // light travel direction
  let right = cross(f, [0, 1, 0]);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-3) right = [1, 0, 0];
  right = norm(right);
  const up = cross(right, f);
  const c = [cx, cy, cz];
  const texel = (2 * R) / size;
  const cr = dot(c, right), cu = dot(c, up);
  const sr = Math.round(cr / texel) * texel, su = Math.round(cu / texel) * texel;
  const cc = [cx + right[0] * (sr - cr) + up[0] * (su - cu), cy + right[1] * (sr - cr) + up[1] * (su - cu), cz + right[2] * (sr - cr) + up[2] * (su - cu)];
  const D = R + 160;                                            // depth half range
  const rows = [
    [right[0] / R, right[1] / R, right[2] / R, -dot(cc, right) / R],
    [up[0] / R, up[1] / R, up[2] / R, -dot(cc, up) / R],
    [f[0] / (2 * D), f[1] / (2 * D), f[2] / (2 * D), (-dot(cc, f) + D) / (2 * D)],
    [0, 0, 0, 1],
  ];
  for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) out[col * 4 + r] = rows[r][col];
  return { texelWorld: texel, depthRange: 2 * D };
}
