// The drawing helpers shared by the ships that are drawn bespoke from a reference model (ships/<id>.js): plans from half-widths, thin walls, railings round a platform, a ship's cutter.
// `kit(b, ctx)` binds them to the mesh builder of the ship being built; `cutter` is passed what the builder gives to `extra(ctx)`.

/** A ship's cutter as seen on the reference: a pointed, round-bilged hull, a darker inside with thwarts, a gunwale, resting on its davits (x, y = the keel, z, length, yaw). */
export function cutter(b, { MAT, rgb, shade }, pal, x, y, z, len, yaw = 0) {
  const col = rgb(pal.boat || '#8b8f90'), inner = shade(col, 0.5), w = len * 0.16;
  const plan = (k) => { const h = w * k; return [[-len / 2, 0], [-len * 0.42, h * 0.55], [-len * 0.2, h * 0.95], [len * 0.1, h], [len * 0.36, h * 0.8], [len / 2, 0], [len * 0.36, -h * 0.8], [len * 0.1, -h], [-len * 0.2, -h * 0.95], [-len * 0.42, -h * 0.55]]; };
  b.push().translate(x, y, z).rotateY(yaw);
  b.prism(plan(0.42), 0, 0.22, shade(col, 0.9), MAT.HULL);
  b.prism(plan(0.78), 0.22, 0.5, col, MAT.HULL);
  b.prism(plan(1.0), 0.5, 0.82, col, MAT.HULL);
  b.prism(plan(0.86), 0.8, 0.84, inner, MAT.DARK);
  for (const t of [-0.28, 0, 0.28]) b.block({ x0: len * t - 0.12, x1: len * t + 0.12, hw: w * 0.9, y0: 0.62, y1: 0.7 }, shade(col, 1.1), MAT.HULL);
  b.pop();
}

/** The helpers bound to a builder: half(pts) a closed plan from [x, half-width] pairs rear to front, wall(p0, p1, y0, y1, th, col) a thin vertical plate along a segment of the plan,
 * ring(cx, cz, r, y, h, col, n) a railing (posts and two chains) round a round platform. */
export function kit(b, { MAT, rgb, shade }) {
  const half = (pts) => [...pts.map(([x, w]) => [x, w]), ...pts.slice().reverse().map(([x, w]) => [x, -w])];
  const wall = (p0, p1, y0, y1, th, col) => {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * th / 2, nz = dx / l * th / 2;
    b.prism([[p0[0] + nx, p0[1] + nz], [p1[0] + nx, p1[1] + nz], [p1[0] - nx, p1[1] - nz], [p0[0] - nx, p0[1] - nz]], y0, y1, col, MAT.HULL);
  };
  const ring = (cx, cz, r, y, h, col, n = 20) => {
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, p = [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      if (i < n) b.beam(p, [p[0], y + h, p[2]], 0.035, 0.035, col, MAT.HULL, { caps: false });
      if (prev) { b.beam([prev[0], y + h, prev[2]], [p[0], y + h, p[2]], 0.03, 0.03, col, MAT.HULL, { caps: false }); b.beam([prev[0], y + h * 0.5, prev[2]], [p[0], y + h * 0.5, p[2]], 0.025, 0.025, col, MAT.HULL, { caps: false }); }
      prev = p;
    }
  };
  return { half, wall, ring };
}
