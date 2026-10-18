// Per-ship hand tuning of the generated models (see shipbuilder.js for the options).
// Keyed by spec id. Anything not listed here is built purely from the spec sheet.
//
//   pagoda: [baseLength, baseWidth, tiers, height]   Japanese pagoda foremast
//   tiers:  explicit bridge tiers                      [{ len, w, h, dx, rake, wings }]
//   elevators / deckEdge: carrier lifts (fractions from the bow; the last one is on the deck edge when deckEdge)
//   funnelW / funnelLen / funnelRake / funnelScale     funnel proportions
//   extra(ctx): free-hand additions with the MeshBuilder (ctx.b) and the parts library (ctx.PT)

/** Shokaku class: two funnels trunked out to the starboard side and turned downwards. */
function shokakuFunnels({ b, X, spec, pal, model, MAT, rgb, shade, part }) {
  const hw = (spec.flightDeckWidth || spec.beam) / 2;
  const col = rgb(pal.funnel), dark = rgb(pal.cap), char = shade(rgb(pal.dark), 1.1);
  const fdY = 17.2;
  [0.475, 0.535].forEach((f, i) => {
    const x = X(f), y = fdY - 5.5, z0 = hw * 0.55, z1 = hw * 0.55 + 6.2;
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => {
      b.rodZ(x, y, z0, z1, 1.9, 1.9, col, MAT.HULL, { seg: 12 });
      b.cylinder(x, y - 7.5, z1, 1.9, 1.9, y + 1.9, col, MAT.HULL, { seg: 12, capTop: false });
      b.cylinder(x, y - 8.0, z1, 1.95, 1.95, y - 7.2, dark, MAT.DARK, { seg: 12 });
    }, () => {
      b.rodZ(x, y, z0, z0 + 2.2, 1.9, 1.9, char, MAT.DARK, { seg: 12 });
      b.cylinder(x, y - 1.5, z0 + 2.2, 1.8, 1.4, y + 1.0, char, MAT.DARK, { seg: 10 });
    });
    model.smoke.push([x, y - 8.0, z1]);
  });
}

/** Bismarck: tall tower bridge with three large rangefinder drums. */
function bismarckTower({ b, model, pal, MAT, rgb, shade }) {
  const br = model.bridge;
  if (!br) return;
  const col = shade(rgb(pal.sup), 0.92);
  // the drums are part of the tower: they are destroyed with it
  b.group('tower', () => {
    for (const [dy, r] of [[-12.5, 2.5], [-7.5, 2.3], [-2.5, 2.1]]) {
      b.cyl(br.x + 2.5, br.y + dy, 0, r, r, r * 0.95, r * 0.95, br.y + dy + 2.3, col, MAT.HULL, { seg: 14 });
      b.rodZ(br.x + 2.5, br.y + dy + 1.2, -r * 1.7, r * 1.7, 0.28, 0.28, shade(col, 0.8), MAT.HULL);
    }
  });
}

export const TWEAKS = {
  iowa: { mainVariant: 'mk7', secVariant: ['mk28'] },
  fletcher: { mainVariant: 'mk30' },
  cleveland: { secVariant: ['mk28'] },
  baltimore: { secVariant: ['mk28'] },
  yamato: { mainVariant: 'type94', pagoda: [17, 14, 8, 28], dirKind: 'drum', funnelW: 0.24, funnelLen: 1.35, funnelRake: 2.2 },
  takao: { pagoda: [13, 11, 9, 34], dirKind: 'drum', funnelRake: 3.0 },
  kagero: { dirKind: 'drum', tiers: [{ len: 6.5, w: 5.4, h: 2.4, rake: 1.2 }, { len: 5.2, w: 4.4, h: 2.2, rake: 1, wings: 0.8 }, { len: 4, w: 3.4, h: 2.0, rake: 0.8 }] },
  agano: { dirKind: 'drum' },
  bismarck: { mainVariant: 'drh34', funnelRake: 2.6, extra: bismarckTower },
  shokaku: { noFunnels: true, elevators: [0.22, 0.56, 0.80], extra: shokakuFunnels },
  essex: { mainVariant: { 2: 'mk28', 1: 'mk30' }, elevators: [0.27, 0.80, 0.50], deckEdge: true },
  illustrious: { elevators: [0.30, 0.75] },
  graf_zeppelin: { elevators: [0.27, 0.52, 0.80] },
  bearn: { elevators: [0.30, 0.47, 0.72] },
  aquila: { elevators: [0.27, 0.77] },
};
