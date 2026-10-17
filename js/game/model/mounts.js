// Articulated gun mounts. Every mount produces two meshes that are drawn as separate instances so
// they can move independently:
//   house : the rotating gun house / shield / platform (origin = vertical training axis at deck level)
//   guns  : the barrels (origin = trunnion, barrels along +x, elevate about the z axis, recoil along x)
import { MeshBuilder, MAT, rgb, shade } from './meshbuilder.js';

const cache = new Map();

/**
 * spec: { kind: 'turret' | 'dp' | 'shield' | 'aa', cal (mm), n (barrels), bore (calibers),
 *         col (paint), dark, rows? , quad? }
 * returns { house, guns, trunnion: [x, y], muzzleX, barrelLen, height }  (house/guns are built meshes)
 */
export function getMountModel(spec) {
  const key = [spec.kind, spec.cal, spec.n, spec.bore, spec.col, spec.variant || ''].join('|');
  let m = cache.get(key);
  if (!m) { m = makeMount(spec); cache.set(key, m); }
  return m;
}

function makeMount(s) {
  const col = rgb(s.col || '#6b7076');
  const dark = rgb(s.dark || '#1d1f22');
  const hb = new MeshBuilder(), gb = new MeshBuilder();
  const calM = s.cal / 1000;
  const n = s.n;
  let trunY = 0, trunX = 0, barrelLen = (s.bore || 45) * calM, height = 0, br0 = 0.6 * calM, br1 = 0.42 * calM;

  if (s.kind === 'aa') {
    aaMount(hb, gb, s, col, dark);
    return {
      house: hb.build(), guns: gb.build(), trunnion: [s._tx || 0, s._ty || 1.1], muzzleX: (s._tx || 0) + (s._len || 1.5),
      barrelLen: s._len || 1.5, height: 2, recoil: 0.05,
    };
  }

  const spacing = Math.max(0.5, calM * (n >= 3 ? 6.6 : 5.6));
  const wid = (n - 1) * spacing + calM * 11 + 0.5;
  const len = Math.max(2.2, calM * 26);
  const h = 1.5 + calM * 5.0;
  height = h;

  if (s.kind === 'turret') {
    // gun house: sloped face, tapering sides, small rear overhang
    const x0 = -len * 0.5, x1 = len * 0.42;
    hb.block({ x0, x1, hw: wid / 2, y0: 0, y1: h, tx0: x0 + len * 0.02, tx1: x1 - len * 0.2, thw: wid / 2 * 0.9, sideCol: col }, col, MAT.HULL);
    // rear counterweight bulge + roof hatches
    hb.block({ x0: x0 - len * 0.05, x1: x0 + len * 0.1, hw: wid / 2 * 0.85, y0: h * 0.2, y1: h * 0.82, top: true }, shade(col, 0.95), MAT.HULL);
    hb.box(x0 + len * 0.28, h + 0.1, wid * 0.22, len * 0.12, 0.2, calM * 2.4, shade(col, 1.1), MAT.HULL);
    hb.box(x0 + len * 0.28, h + 0.1, -wid * 0.22, len * 0.12, 0.2, calM * 2.4, shade(col, 1.1), MAT.HULL);
    // rangefinder hood on large turrets
    if (calM > 0.3) hb.rodZ(x0 + len * 0.12, h * 0.62, -wid / 2 - calM * 1.2, wid / 2 + calM * 1.2, calM * 0.22, calM * 0.22, shade(col, 0.9), MAT.HULL);
    // gun ports
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * spacing;
      hb.block({ x0: x1 - len * 0.2 - 0.05, x1: x1 - len * 0.2 + 0.06, hw: calM * 1.25, zc: z, y0: h * 0.3, y1: h * 0.3 + calM * 2.0 }, dark, MAT.DARK);
    }
    trunX = x1 - len * 0.2 - len * 0.12;
    trunY = h * 0.3 + calM;
  } else if (s.kind === 'dp') {
    // enclosed dual-purpose mount (rounded octagonal house)
    const r = Math.max(wid / 2, 1.1), L2 = Math.max(len * 0.9, 2.2);
    const oct = [];
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; oct.push([Math.cos(a) * L2 * 0.5, Math.sin(a) * r]); }
    hb.prism(oct, 0, h, col, MAT.HULL, { topScale: 0.88, topDx: -L2 * 0.04 });
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * spacing;
      hb.block({ x0: L2 * 0.43, x1: L2 * 0.5, hw: calM * 1.1, zc: z, y0: h * 0.25, y1: h * 0.25 + calM * 1.7 }, dark, MAT.DARK);
    }
    trunX = L2 * 0.38; trunY = h * 0.25 + calM * 0.8;
  } else if (s.kind === 'shield') {
    // open mount behind a shield
    hb.cylinder(0, 0, 0, Math.max(wid * 0.45, 0.6), Math.max(wid * 0.45, 0.6), h * 0.4, col, MAT.HULL, { seg: 10 });
    hb.block({ x0: 0.1, x1: 0.35, hw: wid / 2, y0: h * 0.2, y1: h, tx0: 0.0, tx1: 0.25 }, col, MAT.HULL);
    hb.block({ x0: -len * 0.25, x1: 0.1, hw: wid / 2, y0: h * 0.2, y1: h * 0.45 }, shade(col, 0.9), MAT.HULL, {});
    trunX = 0.1; trunY = h * 0.55;
  }

  // ---- barrels ----
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * spacing;
    const sleeve = Math.min(barrelLen * 0.16, 2.6);
    const breech = (s.kind === 'turret' ? 0.5 : 0.3) * len * 0.4;
    // gun slide / blast bag at the breech end
    gb.rod(-breech, sleeve, 0, z, br0 * 1.3, br0 * 1.15, shade(col, 0.85), MAT.HULL, { seg: 10 });
    gb.rod(sleeve * 0.9, barrelLen, 0, z, br0, br1, dark, MAT.DARK, { seg: 10 });
    // muzzle ring
    gb.rod(barrelLen - 0.18 * calM * 3, barrelLen, 0, z, br1 * 1.12, br1 * 1.1, dark, MAT.DARK, { seg: 8 });
  }
  return { house: hb.build(), guns: gb.build(), trunnion: [trunX, trunY], muzzleX: barrelLen, barrelLen, height, recoil: Math.min(0.9, calM * 2.2) };
}

// ---- anti-aircraft mounts (kept simple: platform + barrels) --------------------------------------------
function aaMount(hb, gb, s, col, dark) {
  const n = s.n;
  const v = s.variant || 'bofors';
  if (v === 'oerlikon') {
    hb.cylinder(0, 0, 0, 0.35, 0.3, 0.7, shade(col, 0.9), MAT.HULL, { seg: 8 });
    hb.box(-0.15, 1.0, 0, 0.5, 0.5, 0.45, shade(col, 0.95), MAT.HULL);
    gb.rod(-0.2, 1.1, 0, 0, 0.035, 0.03, dark, MAT.DARK, { seg: 6 });
    s._tx = 0; s._ty = 1.0; s._len = 1.1;
    return;
  }
  if (v === 'iijn25') {   // shielded triple 25 mm
    hb.cylinder(0, 0, 0, 0.6, 0.55, 0.9, shade(col, 0.9), MAT.HULL, { seg: 8 });
    hb.block({ x0: 0.1, x1: 0.35, hw: 0.7, y0: 0.9, y1: 1.9, tx0: 0.02, tx1: 0.2 }, col, MAT.HULL);
    for (let i = 0; i < n; i++) gb.rod(-0.2, 1.2, 0, (i - (n - 1) / 2) * 0.28, 0.04, 0.035, dark, MAT.DARK, { seg: 6 });
    s._tx = 0.1; s._ty = 1.35; s._len = 1.2;
    return;
  }
  // Bofors / generic 40 mm, n = 2 or 4 barrels
  const side = n >= 4 ? 2 : 1;
  hb.cylinder(0, 0, 0, 0.75, 0.7, 0.55, shade(col, 0.9), MAT.HULL, { seg: 10 });
  hb.box(0, 0.9, 0, 1.3, 0.7, 1.3, shade(col, 0.95), MAT.HULL);
  for (const sz of [-0.3, 0.3]) hb.box(-0.2, 1.4, sz * 1.4, 0.5, 0.55, 0.28, col, MAT.HULL);
  for (let i = 0; i < n; i++) {
    const z = ((i % 2) - 0.5) * 0.65, y = (Math.floor(i / 2) - (side - 1) / 2) * 0.45;
    gb.rod(-0.45, 2.1, y, z, 0.07, 0.05, dark, MAT.DARK, { seg: 6 });
  }
  s._tx = 0; s._ty = 1.5; s._len = 2.1;
}
