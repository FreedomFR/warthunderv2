// The guns of the bases: the mount of each gun (the same meshes as on the ships, see mounts.js) and what it stands on - a concrete emplacement with a ring wall,
// an earth bank and sandbags for the heavy coastal guns, a round sandbagged pit with ammunition boxes for the light anti-aircraft guns.
// Emplacements are built in the frame of the gun: the origin on the ground at the training axis, +x the way the gun points when its train is 0.
import { MeshBuilder, MAT } from './meshbuilder.js';
import { makeRng } from '../math.js';
import { mountDims } from './mounts.js';
import { C, shade, slab, bar, disc, ring, smoothQuad, sandbags, hash2 } from './baseKit.js';

const PI = Math.PI;

// the family of mount used for the heavy guns of each nation (a measured gun house of roughly the same calibre); the other calibres use the generic turret
const COASTAL_FAMILY = { Japan: 'type3_203', Germany: 'drh203', Italy: 'zara203', France: 'fr203', UK: 'brit203' };

/** The mount spec (for getMountModel) of a gun of a layout. */
export function gunMountSpec(g, pal) {
  if (g.kind === 'aa') {
    const big = g.cal >= 37;
    return { kind: 'aa', cal: g.cal, n: g.n, bore: g.cal >= 40 ? 56 : g.cal >= 37 ? 63 : 60, col: pal.roof2, variant: big ? 'bofors' : g.n >= 2 && g.cal <= 20 ? 'iijn25' : 'iijn25' };
  }
  const variant = COASTAL_FAMILY[g.nation || ''] ;
  return { kind: 'turret', cal: g.cal, n: g.n, bore: 45, col: pal.roof2, variant };
}

/** A smooth slope between two circles (rIn, yIn) -> (rOut, yOut): a bank of earth. gap = [angle, width] leaves an opening. */
function bank(b, rIn, yIn, rOut, yOut, col, gap, seg = 28) {
  const a0 = gap ? gap[0] + gap[1] / 2 : 0, span = gap ? PI * 2 - gap[1] : PI * 2;
  const dy = yIn - yOut, dr = rOut - rIn, l = Math.hypot(dy, dr) || 1, nr = dy / l, ny = dr / l;
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + span * i / seg, t1 = a0 + span * (i + 1) / seg, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    smoothQuad(b, [[rIn * c0, yIn, rIn * s0], [rIn * c1, yIn, rIn * s1], [rOut * c1, yOut, rOut * s1], [rOut * c0, yOut, rOut * s0]],
      [[nr * c0, ny, nr * s0], [nr * c1, ny, nr * s1], [nr * c1, ny, nr * s1], [nr * c0, ny, nr * s0]], col, MAT.TERRAIN, 1);
  }
}

/**
 * The emplacement of a coastal gun. Returns { mesh (groups: body, fine), mountY (height of the training axis) }.
 */
export function buildEmplacement(g, pal, seed) {
  const rng = makeRng(seed);
  const b = new MeshBuilder();
  const conc = C(pal.conc), earth = C(pal.earth);
  if (g.kind === 'aa') {
    const R = 3.1, sand = C('#8c8160');
    b.group('body', () => {
      disc(b, 0, 0.05, 0, R + 1.6, shade(C('#6a6650'), 1.0), MAT.CANVAS, null, 18);
      disc(b, 0, 0.09, 0, R - 0.1, shade(C('#6f6a58'), 1.0), MAT.CANVAS, null, 16);
      // three courses of sandbags with a gap at the back, each a little smaller than the one below
      for (let k = 0; k < 3; k++) ring(b, 0, 0, R - 0.45 - k * 0.12, R + 0.35 - k * 0.12, 0.05 + k * 0.4, 0.45 + k * 0.4, shade(sand, 0.92 + 0.08 * k), MAT.CANVAS, { seg: 20, gap: [PI, 0.9], topCol: shade(sand, 1.05 + 0.05 * k) });
    });
    b.group('fine', () => {
      // ammunition boxes and a few clips by the gun
      for (let i = 0; i < 3; i++) {
        const a = PI + (i - 1) * 0.5;
        slab(b, Math.cos(a) * (R - 1.0), 0.4, Math.sin(a) * (R - 1.0), 0.7, 0.4, 0.45, i === 1 ? C('#5d6148') : C('#6c6248'), MAT.HULL);
        slab(b, Math.cos(a) * (R - 1.0), 0.65, Math.sin(a) * (R - 1.0), 0.72, 0.06, 0.47, C('#2d2f2b'), MAT.HULL);
      }
      b.cylinder(-1.5, 0.1, 1.4, 0.18, 0.18, 0.7, C('#6d7160'), MAT.HULL, { seg: 6 });
      b.cylinder(-1.9, 0.1, 1.1, 0.18, 0.18, 0.7, C('#7a6b50'), MAT.HULL, { seg: 6 });
    });
    return { mesh: b.build(), mountY: 0.1, radius: R + 2 };
  }
  // heavy gun
  const d = mountDims({ kind: 'turret', cal: g.cal, n: g.n, bore: 45, variant: COASTAL_FAMILY[g.nation || ''] });
  const bR = Math.max(d.barbR || 0, 0.3 + g.cal / 1000 * 11), py = 2.3, R0 = bR + 4.3;
  b.group('body', () => {
    // foundation and the sloped bank of earth outside the parapet
    b.cyl(0, -1.5, 0, R0 + 3.2, R0 + 3.2, R0 + 3.1, R0 + 3.1, 0.3, shade(conc, 0.9), MAT.CANVAS, { seg: 24 });
    bank(b, R0 + 1.2, 1.55, R0 + 7.5, 0.0, shade(earth, 0.95), [PI, 1.3]);
    ring(b, 0, 0, R0, R0 + 1.2, 0.3, 1.55, shade(conc, 1.0), MAT.CANVAS, { seg: 28, gap: [PI, 1.3], topCol: shade(conc, 1.12) });
    // the barbette the turret turns on, with the training collar
    b.cyl(0, 0.3, 0, bR, bR, bR * 0.99, bR * 0.99, py, shade(conc, 1.05), MAT.CANVAS, { seg: 28, capTop: true, topCol: shade(conc, 0.7) });
    b.cyl(0, py - 0.18, 0, bR + 0.22, bR + 0.22, bR + 0.22, bR + 0.22, py, shade(conc, 0.7), MAT.CANVAS, { seg: 28, capTop: false });
    // the entrance of the magazine at the back: a concrete box with a steel door, and the ramp down
    bar(b, -R0 - 3.2, -R0 - 0.2, 0.0, 2.6, -2.0, 2.0, shade(conc, 0.95), MAT.CANVAS);
    slab(b, -R0 - 0.19, 1.2, 0, 0.1, 2.2, 2.3, C('#121415'), MAT.DARK);
    slab(b, -R0 - 3.3 + 1.6, 2.7, 0, 3.4, 0.25, 4.4, shade(conc, 1.1), MAT.CANVAS);
  });
  b.group('fine', () => {
    // sandbags along the top of the parapet, ready-use lockers, a ladder up the barbette, cable drums
    const n = 36, sand = C('#8c8160');
    for (let i = 0; i < n; i++) {
      const a = PI + 0.7 + (PI * 2 - 1.4) * (i + 0.5) / n;
      b.push().translate(Math.cos(a) * (R0 + 0.6), 1.55, Math.sin(a) * (R0 + 0.6)).rotateY(-(a + PI / 2));
      slab(b, 0, 0.2, 0, 1.15, 0.4, 0.62, shade(sand, 0.9 + 0.1 * hash2(i, seed)), MAT.CANVAS);
      b.pop();
    }
    for (const s of [-1, 1]) slab(b, -bR - 1.6, 0.75, s * 2.4, 1.2, 0.9, 0.8, C('#55583f'), MAT.HULL);
    for (let y = 0.5; y < py - 0.2; y += 0.45) b.beam([bR * 0.7, y, bR * 0.72], [bR * 0.7 + 0.1, y, bR * 0.72 + 0.4], 0.04, 0.04, C('#2b2d2e'), MAT.DARK, { caps: false });
    b.cylinder(bR + 1.6, 0.3, -2.2, 0.55, 0.55, 1.1, C('#7a5a34'), MAT.HULL, { seg: 8 });
    // a stack of shells in their cradle
    for (let i = 0; i < 4; i++) b.cylinder(-R0 - 1.0, 0.45 + i * 0.01, -2.6 + i * 0.42, 0.17, 0.15, 0.45 + i * 0.01 + 1.2, C('#4c4f45'), MAT.HULL, { seg: 6 });
  });
  return { mesh: b.build(), mountY: py, radius: R0 + 8 };
}
