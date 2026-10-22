// Triangulation of a polygon with holes (ear clipping after the holes are bridged into the outline), for the flat caps of the solids read from a reference model (MeshBuilder.slab).
// Points are [x, z]; returns triangles as index triples into the flattened ring list given to it (outer ring first, then the holes).

const area2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; };
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
function segCross(a, b, c, d) {
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Triangles of the outer ring minus the holes: [[i, j, k], ...] with indices into [...outer, ...hole0, ...hole1] (every triangle counter-clockwise). */
export function triangulate(rings) {
  const pts = rings.flat();
  // work on a list of indices; the outer ring counter-clockwise, the holes clockwise
  const offs = []; let o = 0;
  for (const r of rings) { offs.push(o); o += r.length; }
  const idx = rings.map((r, k) => { const ids = r.map((_, i) => offs[k] + i); return (area2(r) > 0) === (k === 0) ? ids : ids.reverse(); });
  let poly = idx[0].slice();
  // bridge each hole (the one reaching furthest right first) to the nearest outline vertex that sees it
  const holes = idx.slice(1).sort((a, b) => Math.max(...b.map((i) => pts[i][0])) - Math.max(...a.map((i) => pts[i][0])));
  for (const h of holes) {
    let best = null;
    for (let hi = 0; hi < h.length; hi++) for (let pi = 0; pi < poly.length; pi++) {
      const a = pts[h[hi]], b = pts[poly[pi]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (best && d >= best.d) continue;
      let ok = true;
      for (let q = 0; q < poly.length && ok; q++) if (segCross(a, b, pts[poly[q]], pts[poly[(q + 1) % poly.length]])) ok = false;
      for (const h2 of [h, ...holes]) for (let q = 0; q < h2.length && ok; q++) if (segCross(a, b, pts[h2[q]], pts[h2[(q + 1) % h2.length]])) ok = false;
      if (ok) best = { d, hi, pi };
    }
    if (!best) continue;
    const hh = [...h.slice(best.hi), ...h.slice(0, best.hi), h[best.hi]];
    poly = [...poly.slice(0, best.pi + 1), ...hh, poly[best.pi], ...poly.slice(best.pi + 1)];
  }
  const tris = [];
  let guard = poly.length * poly.length + 10;
  while (poly.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < poly.length; i++) {
      const ia = poly[(i + poly.length - 1) % poly.length], ib = poly[i], ic = poly[(i + 1) % poly.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ear = true;
      for (const j of poly) { if (j === ia || j === ib || j === ic) continue; const p = pts[j]; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue; if (inTri(p, a, b, c)) { ear = false; break; } }
      if (!ear) continue;
      tris.push([ia, ib, ic]); poly.splice(i, 1); cut = true; break;
    }
    if (!cut) poly.splice(0, 1);                                     // degenerate leftovers: drop a vertex rather than loop
  }
  if (poly.length === 3) tris.push([poly[0], poly[1], poly[2]]);
  return tris;
}
