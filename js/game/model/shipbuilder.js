// Spec-driven ship builder. Reads a real-ship spec sheet (dimensions, turret / funnel / mast
// positions as fractions of the overall length, class, paint) and builds the full 3D model plus the
// gameplay data derived from it (mount positions and arcs, smoke points, buoyancy points, hit zones).
// Per-ship hand-tuning goes through `tweaks` (see js/game/model/tweaks.js).
import { MeshBuilder, MAT, rgb, shade, mix } from './meshbuilder.js';
import { buildHull } from './hull.js';
import * as PT from './parts.js';
import { makeRng } from '../math.js';

const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);
const D2R = Math.PI / 180;

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function makePalette(spec, tw) {
  const p = spec.paint || {};
  const sup = p.superstructure || '#8a9096';
  const pal = {
    hull: p.hull || '#59616a', boot: p.boot || '#1b1d20', deck: p.deck || '#6b6258',
    sup, dark: '#202327', cap: '#18191b', funnel: p.funnel || sup, mast: rgb(shade(sup, 0.82)).map(Math.round),
    boat: '#8c9296', glass: '#0e151b', ...(tw.pal || {}),
  };
  // linoleum / teak decks: keep them from looking orange-bright under the strong sun
  pal.deck = '#' + mix(pal.deck, '#5b5348', 0.42).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  for (const k of ['mast']) if (Array.isArray(pal[k])) pal[k] = '#' + pal[k].map((v) => v.toString(16).padStart(2, '0')).join('');
  return pal;
}

function hullParams(spec, tw) {
  const t = spec.type, L = spec.loa;
  const B = spec.beamWaterline || spec.beam * 0.96;
  const D = spec.draft;
  const dd = t === 'DD';
  const fbBow = (dd ? 0.048 : 0.050) * L, fbMid = (dd ? 0.029 : 0.030) * L, fbSt = (dd ? 0.031 : 0.032) * L;
  const preset = {
    DD: { bow: { rake: 0.026 * L, pr: 1.7, forefoot: 3, entrance: 0.36, m: 2.3, q: 1.3, flare: 0.3, flareLen: 0.45 }, stern: { run: 0.24, transom: 0.62, overhang: 2.2, rise: 3.0, m: 1.6 }, mid: { pb: 2.3, flare: 0.04 } },
    CL: { bow: { rake: 0.024 * L, pr: 1.5, forefoot: 5, entrance: 0.31, m: 2.3, q: 1.2, flare: 0.28, flareLen: 0.4 }, stern: { run: 0.22, transom: 0.34, overhang: 4, rise: 6, m: 1.8 }, mid: { pb: 3.0, flare: 0.03 } },
    CA: { bow: { rake: 0.025 * L, pr: 1.5, forefoot: 5, entrance: 0.31, m: 2.3, q: 1.2, flare: 0.28, flareLen: 0.4 }, stern: { run: 0.22, transom: 0.34, overhang: 4, rise: 6, m: 1.8 }, mid: { pb: 3.2, flare: 0.03 } },
    BB: { bow: { rake: 0.028 * L, pr: 1.4, forefoot: 8, entrance: 0.29, m: 2.4, q: 1.2, flare: 0.3, flareLen: 0.4 }, stern: { run: 0.22, transom: 0.26, overhang: 5, rise: 10, m: 1.9 }, mid: { pb: 4.5, flare: 0.01 } },
    CV: { bow: { rake: 0.02 * L, pr: 1.4, forefoot: 6, entrance: 0.24, m: 2.2, q: 1.1, flare: 0.5, flareLen: 0.3 }, stern: { run: 0.20, transom: 0.55, overhang: 5, rise: 8, m: 1.7 }, mid: { pb: 4.5, flare: 0.28 } },
  }[t];
  const flareMid = clamp(spec.beam / B - 1, 0, 0.5);
  const fb = tw.fb || [[0, fbBow], [0.06, fbBow * 0.88], [0.22, fbMid * 1.15], [0.5, fbMid], [0.8, fbMid * 0.98], [1, fbSt]];
  return {
    L, B, D, fb, stations: 110,
    bow: { ...preset.bow, ...(tw.bow || {}) }, stern: { ...preset.stern, ...(tw.stern || {}) },
    mid: { ...preset.mid, flare: t === 'CV' ? preset.mid.flare : Math.max(preset.mid.flare, flareMid), ...(tw.mid || {}) },
    camber: dd ? 0.18 : 0.3, bulwark: dd ? 0.85 : 0.95,
  };
}

/** Tower tiers by ship type (sizes scale with the ship). */
function towerTiers(spec) {
  const L = spec.loa, B = spec.beam, t = spec.type;
  const n = { DD: 2, CL: 3, CA: 4, BB: 5, CV: 3 }[t];
  const th = { DD: 2.5, CL: 3.0, CA: 3.0, BB: 3.7, CV: 3.2 }[t];
  const len0 = clamp(0.058 * L, 5.5, 16), w0 = clamp(0.42 * B, 4.5, 14);
  const tiers = [];
  for (let i = 0; i < n; i++) {
    const s = Math.pow(0.84, i);
    tiers.push({ len: len0 * s, w: w0 * Math.pow(0.86, i), h: th * (i === 0 ? 1.1 : 1), rake: 0.9 + i * 0.25, wings: i === 1 || i === 2 ? 1.0 : 0, dx: -i * 0.15 * len0 * 0.3 });
  }
  return tiers;
}

/**
 * Japanese pagoda foremast: many stacked, slightly offset tiers with projecting platforms.
 * n tiers from a base of (len0 x w0), total height `h`.
 */
export function pagodaTiers(len0, w0, n, h, shrink = 0.86, rake = 1.2) {
  const tiers = [];
  const hs = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const k = 1.15 - 0.5 * (i / Math.max(1, n - 1)); hs.push(k); sum += k; }
  for (let i = 0; i < n; i++) {
    const s = Math.pow(shrink, i);
    tiers.push({ len: len0 * s, w: w0 * Math.pow(shrink, i * 0.9), h: h * hs[i] / sum, rake: rake * (0.6 + 0.2 * (i % 3)), dx: -0.55 * i, wings: i % 2 === 1 ? 1.4 : 0.7, windows: true });
  }
  return tiers;
}

function kindOf(desc, ...words) { return words.some((w) => new RegExp(w, 'i').test(desc || '')); }

export function buildShipModel(spec, tw = {}) {
  const b = new MeshBuilder();
  const rnd = makeRng(hashStr(spec.id));
  const pal = makePalette(spec, tw);
  const t = spec.type;
  const hp = hullParams(spec, tw);
  const L = hp.L, B = hp.B;
  const carrier = t === 'CV';
  hp.hullCol = pal.hull; hp.deckCol = carrier ? '#3a3835' : pal.deck; hp.bulwarkCol = pal.hull;
  if (carrier) { hp.bulwark = 0; }
  const fdY = carrier ? (tw.flightDeckY ?? 17.2) : 0;
  if (carrier && !tw.fb) {
    const top = fdY - 1.3;
    hp.fb = [[0, top], [0.1, top], [0.5, top - 0.4], [0.9, top - 0.3], [1, top - 0.2]];
  }
  const hull = buildHull(b, hp);
  const X = (f) => hull.fracToX(f), Y = (x) => hull.deckY(x);
  const sil = spec.silhouette || {};
  const model = {
    id: spec.id, spec, L, B, D: hp.D, mounts: [], smoke: [], aa: [], tubes: [], floatPts: [], hull, pal,
    topY: 0, catapults: [], hangar: null, island: null, deckPoints: [],
  };
  let topY = Y(0) + 4;
  const note = (y) => { if (y > topY) topY = y; };
  const houseH = { DD: 2.2, CL: 3.0, CA: 3.2, BB: 3.6, CV: 0 }[t];

  // -------- funnels first (they decide where the central deckhouse ends) --------
  const fun = sil.funnels || { count: 1, fractionFromBow: [0.5], heightAboveDeckM: 12 };
  const fF = fun.fractionFromBow && fun.fractionFromBow.length ? fun.fractionFromBow : [0.5];
  const fCount = Math.max(fun.count || fF.length, 0);
  const funLz = clamp((tw.funnelW ?? (t === 'DD' ? 0.30 : t === 'CV' ? 0.2 : 0.26)) * B, 2.4, 11);
  const funLx = funLz * (tw.funnelLen ?? (t === 'BB' ? 1.55 : 1.45));

  // -------- central deckhouse --------
  const towerF = (sil.masts && sil.masts[0] && sil.masts[0].fractionFromBow) || 0.33;
  if (!carrier) {
    const fLast = fF.length ? Math.max(...fF) : 0.55;
    const hx0 = X(towerF - 0.035), hx1 = X(Math.max(fLast + 0.035, towerF + 0.05));
    const hw = (tw.houseW ?? (t === 'BB' ? 0.36 : t === 'DD' ? 0.34 : 0.32)) * B;
    const hy = Y((hx0 + hx1) / 2);
    const col = rgb(pal.sup);
    b.block({ x0: hx1, x1: hx0, hw, y0: hy - 0.3, y1: hy + houseH, tx1: hx0 - 2.2, thw: hw * 0.97 }, col, MAT.HULL, {});
    // windows / portholes band along the sides
    for (const sg of [-1, 1]) b.block({ x0: hx1 + 1, x1: hx0 - 1, hw: 0.04, zc: sg * (hw + 0.02), y0: hy + houseH * 0.35, y1: hy + houseH * 0.65 }, rgb(pal.glass), MAT.GLASS);
    model.house = { x0: hx1, x1: hx0, hw, y: hy + houseH };
  }

  // -------- funnels --------
  for (let i = 0; i < Math.min(fCount, fF.length); i++) {
    const x = X(fF[i]);
    const y0 = (carrier ? 0 : Y(x) + houseH);
    const fh = fun.heightAboveDeckM || (t === 'DD' ? 11 : 18);
    if (carrier) continue;
    const small = tw.funnelScale ? tw.funnelScale[i] ?? 1 : 1;
    PT.funnel(b, { x, y0, h: fh * small, lx: funLx * (tw.funnelX?.[i] ?? 1), lz: funLz * (tw.funnelZ?.[i] ?? 1), rake: tw.funnelRake ?? fh * 0.14, band: tw.funnelBand }, pal);
    model.smoke.push([x - (tw.funnelRake ?? fh * 0.14) * 0.9, y0 + fh * small, 0]);
    note(y0 + fh);
  }

  // -------- bridge tower / island --------
  if (!carrier) {
    const x = X(towerF);
    const y0 = Y(x) + (towerF > 0.2 ? 0 : 0);
    const tiers = tw.tiers || (tw.pagoda ? pagodaTiers(...tw.pagoda) : towerTiers(spec));
    const r = PT.tower(b, { x, y0, tiers }, pal);
    let y = r.topY;
    const topW = tiers[tiers.length - 1].w;
    // main director on top + radar, then a mast
    const mastDesc = (sil.masts && sil.masts[0] && sil.masts[0].kind) || '';
    const mastH = (sil.masts && sil.masts[0] && sil.masts[0].heightAboveWaterM) || (t === 'DD' ? 22 : 40);
    const mastTopY = Math.max(mastH, y + 4);
    const dirKind = spec.nation === 'Japan' ? 'drum' : 'box';
    PT.director(b, { x: x + 0.3, y, z: 0, w: topW * 0.7, l: topW * 0.75, h: t === 'DD' ? 1.6 : 2.4, kind: tw.dirKind || dirKind }, pal);
    y += t === 'DD' ? 2.0 : 3.0;
    if (kindOf(mastDesc, 'tripod')) {
      PT.tripod(b, { x: x - 1, y0: r.tops[Math.max(0, tiers.length - 3)] , h: mastTopY - r.tops[Math.max(0, tiers.length - 3)], legSpread: topW * 0.6, legBack: 4, legFront: 2, platforms: [0.55], yards: [[0.8, 8]] }, pal);
    } else if (kindOf(mastDesc, 'cage|lattice')) {
      PT.cageMast(b, { x: x - 1, y0: r.tops[Math.max(0, tiers.length - 3)], h: mastTopY - r.tops[Math.max(0, tiers.length - 3)] - 4, r0: 2.4, r1: 1.0 }, pal);
    } else {
      PT.poleMast(b, { x: x - 0.8, y0: y, h: Math.max(mastTopY - y, 6), r: 0.38, yards: [[0.55, 9], [0.8, 6]] }, pal);
    }
    // radar
    const rkind = ['USA', 'UK'].includes(spec.nation) ? 'bedspring' : 'box';
    PT.radar(b, { x: x - 0.8, y: Math.max(mastTopY - 3.5, y), z: 0, kind: rkind, w: Math.min(7, 0.2 * B + 2) }, pal);
    PT.radar(b, { x: x + 2, y: r.tops[Math.max(0, tiers.length - 2)], z: topW * 0.2, kind: 'dish' }, pal);
    note(mastTopY + 2);
    model.bridge = { x, y: r.topY };
    {
      const hx0 = model.house ? model.house.x1 : x - 8, hx1 = model.house ? model.house.x0 : x + 8;
      model.superBox = { x0: Math.min(hx0, x - tiers[0].len / 2), x1: Math.max(hx1, x + tiers[0].len / 2), hw: Math.max(model.house ? model.house.hw : 0, tiers[0].w / 2), y1: r.topY };
    }
    PT.pennant(b, x - 0.8, mastTopY + 0.2, 0.3, 4.5, 0, '#ffffff');
  }

  // -------- secondary mast(s) --------
  if (!carrier) {
    const masts = sil.masts || [];
    for (let i = 1; i < masts.length; i++) {
      const m = masts[i];
      const x = X(m.fractionFromBow);
      let y0 = Y(x) + (model.house && x < model.house.x1 + 0.1 && x > model.house.x0 - 0.1 ? 0 : 0);
      if (model.house && x <= model.house.x1 && x >= model.house.x0 - 1e-9 + 0) y0 = model.house.y - 0.0;
      const h = Math.max((m.heightAboveWaterM || 30) - y0, 8);
      if (kindOf(m.kind, 'tripod')) PT.tripod(b, { x, y0, h, legSpread: 3.5, legBack: 4, legFront: 1.5, platforms: [0.6], yards: [[0.78, 7]] }, pal);
      else PT.poleMast(b, { x, y0, h, r: 0.36, yards: [[0.6, 8]] }, pal);
      note(y0 + h);
    }
  }

  // -------- guns: helpers --------
  const mountRec = (group, kind, cal, n, bore, x, z, y, arcC, arcH, extra = {}) => {
    const rec = { group, kind, cal, n, bore, x, z, y, arcC, arcH, ...extra };
    model.mounts.push(rec);
    return rec;
  };
  const arcFor = (x, z) => {
    const side = Math.abs(z) > B * 0.22;
    if (side) return z > 0 ? [90 * D2R, 105 * D2R] : [-90 * D2R, 105 * D2R];
    if (x > L * 0.1) return [0, 152 * D2R];
    if (x < -L * 0.1) return [Math.PI, 148 * D2R];
    return [0, 170 * D2R];
  };
  const mainCal = spec.main.caliberMm;
  const mainKind = tw.mainKind || (mainCal >= 150 ? 'turret' : 'dp');
  const calM = mainCal / 1000;
  const barbH = 0.55 + calM * 4.2;
  const houseTopOf = (n) => 1.5 + calM * 5.0;

  // -------- main battery --------
  if (!carrier || tw.carrierMainOnDeck) {
    const levelY = {};
    for (const m of spec.main.mounts) {
      const x = X(m.fractionFromBow), deckY = Y(x);
      const lvl = m.level || 0;
      const sideZ = m.z ?? 0;
      let pivot = deckY + barbH;
      if (lvl >= 1) pivot = deckY + barbH + (houseTopOf() * 0.9 + 0.4) * lvl;
      if (mainKind === 'dp' && lvl >= 1) pivot = deckY + 1.0 + 2.6 * lvl;
      const r = Math.max(calM * 6, 1.1);
      PT.barbette(b, x, sideZ, mainKind === 'turret' ? r : 0.9, deckY - 0.2, pivot, pal.hull);
      const [ac, ah] = arcFor(x, sideZ);
      mountRec('main', mainKind, mainCal, m.guns, spec.main.boreCalibers, x, sideZ, pivot, ac, ah, { label: m.label, bore: spec.main.boreCalibers });
      note(pivot + 3.5);
    }
  }

  // -------- secondary battery --------
  const secs = spec.secondary || [];
  secs.forEach((s, si) => {
    const cal = s.caliberMm, per = s.gunsPerMount || 1;
    const kind = tw.secKind?.[si] || (cal >= 140 ? 'turret' : per >= 2 ? 'dp' : 'dp');
    const calS = cal / 1000;
    const total = s.mounts || 0;
    if (cal < 70 || total === 0) return;
    let pos = s.positions && s.positions.length === total ? s.positions : null;
    if (!pos) {
      pos = [];
      const a = si === 0 ? 0.3 : 0.45, c = si === 0 ? 0.66 : 0.6;
      for (let i = 0; i < total; i++) pos.push({ fractionFromBow: a + (c - a) * ((Math.floor(i / 2) + 0.5) / Math.max(1, Math.ceil(total / 2))), side: i % 2 ? 'port' : 'starboard' });
    }
    for (const p of pos) {
      const x = X(p.fractionFromBow);
      const sg = p.side === 'port' ? -1 : p.side === 'starboard' ? 1 : 0;
      const hbd = hull.halfBeamDeck(x);
      const onHouse = model.house && x <= model.house.x1 + 0.1 && x >= model.house.x0 - 0.1 && !carrier;
      const zz = sg * (onHouse ? Math.min(model.house.hw * 0.92, hbd * 0.85) : hbd * (kind === 'turret' ? 0.55 : 0.78));
      const lvl = (tw.secLevel ?? 0);
      const deckY = Y(x) + (onHouse ? houseH : 0) + lvl;
      const sc = kind === 'turret' ? Math.max(calS * 4, 1.0) : 0.9;
      if (kind === 'turret') PT.barbette(b, x, zz, sc, deckY - 0.2, deckY + 0.5 + calS * 3, pal.hull);
      const pivot = kind === 'turret' ? deckY + 0.5 + calS * 3 : deckY + 0.55;
      if (kind !== 'turret') PT.tub(b, x, deckY - 0.1, zz, 1.2 + calS * 3, 0.6, pal);
      const [ac, ah] = arcFor(x, zz);
      mountRec('sec', kind, cal, per, s.boreCalibers || 40, x, zz, pivot, sg === 0 ? ac : ac, ah, { bore: s.boreCalibers || 40, si });
      note(pivot + 2);
    }
  });

  // -------- torpedo tubes --------
  if (spec.torpedoes && spec.torpedoes.tubes) {
    const tq = spec.torpedoes;
    const fr = Array.isArray(tq.fractionFromBow) && tq.fractionFromBow.length ? tq.fractionFromBow : [0.58];
    const per = Math.max(1, Math.round(tq.tubes / fr.length));
    for (const f of fr) {
      const x = X(f);
      const y = Y(x) + (model.house && x < model.house.x1 && x > model.house.x0 ? houseH : 0);
      const kind = t === 'DD' ? 1 : 0;
      PT.torpedoTubes(b, { x, y, z: 0, n: per, r: (tq.caliberMm || 533) / 2000, len: 4.6 + (tq.caliberMm || 533) / 600 }, pal);
      model.tubes.push({ x, y: y + 1, z: 0, n: per, side: 0 });
    }
  }

  // -------- aircraft facilities (cruisers / battleships) --------
  if (!carrier && spec.aircraft && spec.aircraft.catapults > 0) {
    const mid = kindOf(spec.aircraft.hangar + ' ' + spec.aircraft.notes, 'amidships|between the funnels|athwart');
    const f0 = mid ? 0.575 : 0.84;
    const nCat = spec.aircraft.catapults;
    for (let i = 0; i < nCat; i++) {
      const sg = nCat === 1 ? 0 : (i === 0 ? -1 : 1);
      const x = X(f0), y = Y(x) + 0.2;
      const z = sg * (mid ? B * 0.12 : B * 0.2);
      PT.catapult(b, { x, y, z, len: 18, yaw: sg * 0.5 * (mid ? 1 : 0) }, pal);
      PT.aircraft(b, { x: x + 3, y: y + 0.4, z, yaw: sg * 0.5 * (mid ? 1 : 0), kind: 'float', col: '#8a8f93', scale: 1.0 }, pal);
    }
    PT.crane(b, { x: X(f0 + 0.07), y0: Y(X(f0 + 0.07)), z: 0, h: 7, len: 14, side: 1 }, pal);
  }

  // -------- ship-specific extras (see tweaks.js) --------
  if (tw.extra) tw.extra({ b, hull, X, Y, pal, model, spec, rnd, PT, houseH, note, MAT, rgb, shade });

  // -------- carrier flight deck --------
  if (carrier) buildCarrier(b, model, spec, hull, pal, tw, X, Y, fdY, rnd, note);

  // -------- AA guns, boats, rails, clutter --------
  const aaTotal = tw.aaCount ?? clamp(Math.round(L / (carrier ? 8 : 9)), 6, 40);
  for (let i = 0; i < aaTotal; i++) {
    const f = 0.10 + 0.82 * rnd();
    const x = X(f);
    const sg = rnd() < 0.5 ? -1 : 1;
    let y = Y(x), z = sg * hull.halfBeamDeck(x) * (0.55 + 0.35 * rnd());
    if (model.house && x < model.house.x1 && x > model.house.x0 && !carrier) { y += houseH; z = sg * model.house.hw * (0.5 + 0.4 * rnd()); }
    if (carrier) { y = fdY - 2.4; z = sg * (hull.halfBeamDeck(x) + 1.0); }
    const kind = rnd() < (L > 150 ? 0.4 : 0.15) ? 'bofors4' : rnd() < 0.5 ? 'bofors2' : 'oerlikon';
    PT.aaGun(b, x, y, z, kind, sg * 1.2 + (rnd() - 0.5), pal);
    model.aa.push([x, y + 1.2, z]);
  }
  if (!carrier) {
    PT.forecastle(b, hull, X(0.04), pal);
    PT.deckRails(b, hull, X(0.02), X(0.28), 0.9, pal, 6);
    PT.deckRails(b, hull, X(0.62), X(0.97), 0.9, pal, 6);
    PT.deckClutter(b, hull, X(0.05), X(0.30), Math.round(L / 20), rnd, pal);
    PT.deckClutter(b, hull, X(0.64), X(0.96), Math.round(L / 18), rnd, pal);
    const nb = L > 150 ? 2 : 1;
    for (let i = 0; i < nb; i++) for (const sg of [-1, 1]) {
      const x = X(0.46 + i * 0.07), hy = Y(x) + (model.house && x < model.house.x1 && x > model.house.x0 ? houseH : 0);
      PT.boat(b, { x, y: hy + 0.4, z: sg * (model.house ? model.house.hw * 0.75 : hull.halfBeamDeck(x) * 0.7), yaw: 0, len: L > 150 ? 10 : 7 }, pal);
    }
    PT.pennant(b, X(0.985), Y(X(0.985)) + 0.8, 0, 3.5, 0, '#ffffff');
  }

  // -------- buoyancy sample points & hit zones --------
  const hbw = B / 2 * 0.92;
  model.floatPts = [[L * 0.40, 0], [-L * 0.40, 0], [L * 0.15, hbw], [L * 0.15, -hbw], [-L * 0.15, hbw], [-L * 0.15, -hbw], [0, hbw], [0, -hbw]];
  const mFr = spec.main.mounts.map((m) => m.fractionFromBow);
  model.zones = {
    // fractions of overall length from the bow
    citadel: [Math.min(...mFr, 0.3) - 0.02, Math.max(...mFr, 0.7) + 0.03],
    engine: [Math.min(...(fF.length ? fF : [0.45])) - 0.07, Math.max(...(fF.length ? fF : [0.55])) + 0.07],
    bridge: towerF,
  };
  model.topY = topY;
  model.radius = Math.hypot(L / 2, topY);
  model.mesh = b.build();
  return model;
}

// ---------------------------------------------------------------------------------------------
function buildCarrier(b, model, spec, hull, pal, tw, X, Y, fdY, rnd, note) {
  const L = spec.loa;
  const fdL = spec.flightDeckLength || L * 0.97;
  const fdW = spec.flightDeckWidth || spec.beam;
  const x1 = L / 2 + (tw.fdBowOver ?? 3) - (L - fdL) * 0.3, x0 = x1 - fdL;
  const hw = fdW / 2;
  const col = rgb(tw.flightDeckCol || '#3b3a37');
  const sil = spec.silhouette || {};
  const isl = sil.island || { side: 'starboard', fractionFromBow: 0.5, lengthM: 40, heightAboveDeckM: 15 };
  const sg = isl.side === 'port' ? -1 : 1;
  // slab: chamfered bow, squarer stern
  const poly = [[x1, -hw * 0.7], [x1 - hw * 0.35, -hw], [x0 + hw * 0.4, -hw], [x0, -hw * 0.82], [x0, hw * 0.82], [x0 + hw * 0.4, hw], [x1 - hw * 0.35, hw], [x1, hw * 0.7]];
  b.prism(poly, fdY - 1.1, fdY, col, MAT.FLIGHT, { sideCol: rgb(pal.hull), topCol: col, topMat: MAT.FLIGHT, bottom: true });
  // support gallery under the overhang
  b.block({ x0: x0 + 5, x1: x1 - 12, hw: hw * 0.92, y0: fdY - 2.3, y1: fdY - 1.1, tx0: x0 + 6, tx1: x1 - 14, thw: hw * 0.98 }, shade(rgb(pal.hull), 0.8), MAT.HULL);
  // markings: centre line, edge lines, landing area lines
  const mk = rgb('#cfcdc4');
  b.decal((x0 + x1) / 2, fdY + 0.01, 0, fdL * 0.46, 0.18, mk, MAT.HULL);
  for (const s2 of [-1, 1]) b.decal((x0 + x1) / 2 - fdL * 0.02, fdY + 0.01, s2 * (hw - 1.0), fdL * 0.47, 0.12, mk, MAT.HULL);
  for (let i = 0; i < 8; i++) b.decal(x0 + 12 + i * 3.2, fdY + 0.012, 0, 0.05, hw * 0.55, shade(mk, 0.4), MAT.HULL);   // arrester wires
  // elevators
  const els = (sil.flightDeckNotes ? null : null) || tw.elevators || [0.28, 0.6, 0.83];
  for (const [i, f] of els.entries()) {
    const x = X(f);
    if (i === els.length - 1 && tw.deckEdge) { b.decal(x, fdY + 0.015, -hw + 5, 8, 7.5, rgb('#524f49'), MAT.HULL); continue; }
    b.decal(x, fdY + 0.015, 0, 8.5, hw * 0.34, rgb('#55524c'), MAT.HULL);
  }
  // island
  const ix = X(isl.fractionFromBow);
  const il = clamp(isl.lengthM || 40, 18, 60), ih = isl.heightAboveDeckM || 15;
  const iz = sg * (hw - 5.5);
  b.block({ x0: ix - il / 2, x1: ix + il / 2, hw: 3.4, zc: iz, y0: fdY, y1: fdY + ih * 0.55, tx1: ix + il / 2 - 2, thw: 3.1 }, rgb(pal.sup), MAT.HULL);
  b.block({ x0: ix - il * 0.28, x1: ix + il * 0.26, hw: 3.0, zc: iz, y0: fdY + ih * 0.55, y1: fdY + ih * 0.85, tx1: ix + il * 0.26 - 2 }, rgb(pal.sup), MAT.HULL);
  b.block({ x0: ix - il * 0.1, x1: ix + il * 0.22, hw: 2.6, zc: iz, y0: fdY + ih * 0.85, y1: fdY + ih, tx1: ix + il * 0.22 - 1.5 }, rgb(pal.sup), MAT.HULL);
  for (const [y, h] of [[0.2, 2.2], [0.62, 1.6]]) b.block({ x0: ix + il * 0.1, x1: ix + il / 2 + 0.07, hw: 3.1, zc: iz, y0: fdY + ih * y, y1: fdY + ih * y + h * 0.5 }, rgb(pal.glass), MAT.GLASS);
  // funnel(s) integrated in the island
  const fun = sil.funnels || { count: 1, fractionFromBow: [isl.fractionFromBow - 0.01], heightAboveDeckM: ih * 0.8 };
  const fPos = (fun.fractionFromBow && fun.fractionFromBow.length ? fun.fractionFromBow : [isl.fractionFromBow - 0.015]).slice(0, Math.max(1, fun.count || 1));
  for (const f of fPos) {
    const x = X(f);
    if (tw.noFunnels) break;
    PT.funnel(b, { x, y0: fdY + ih * 0.3, h: Math.max(ih * 0.8, 8), lx: il * 0.34, lz: 4.2, rake: 1.2, z: iz }, pal);
    model.smoke.push([x - 1, fdY + ih * 0.3 + Math.max(ih * 0.8, 8), iz]);
  }
  // mast / radar on the island
  PT.poleMast(b, { x: ix + il * 0.1, y0: fdY + ih, h: 14, z: iz, r: 0.3, yards: [[0.6, 7]] }, pal);
  PT.radar(b, { x: ix + il * 0.1, y: fdY + ih + 8, z: iz, kind: ['USA', 'UK'].includes(spec.nation) ? 'bedspring' : 'box', w: 6 }, pal);
  PT.director(b, { x: ix + il * 0.2, y: fdY + ih, z: iz, w: 3.4, l: 3.2, h: 2.2, kind: spec.nation === 'Japan' ? 'drum' : 'box' }, pal);
  note(fdY + ih + 16);
  model.island = { x: ix, z: iz, y: fdY + ih };
  model.superBox = { x0: ix - il / 2, x1: ix + il / 2, hw: 3.4, zc: iz, y1: fdY + ih };
  model.deckPoints = { x0, x1, hw, y: fdY };
  model.fdY = fdY;
  // carrier AA / DP guns in sponsons along both sides of the flight deck
  const mc = spec.main;
  const total = mc.gunsTotal || 8;
  const per = Math.max(1, Math.round(total / mc.mounts.length));
  // distribute mounts using spec fractions
  mc.mounts.forEach((m, i) => {
    const x = X(m.fractionFromBow);
    const sgm = (m.side === 'port' ? -1 : m.side === 'starboard' ? 1 : (i % 2 ? -1 : 1));
    const z = sgm * (hull.halfBeamDeck(x) + (tw.sponsonOut ?? 1.5));
    const y = fdY - 3.2;
    b.block({ x0: x - 2.6, x1: x + 2.6, hw: 2.2, zc: z, y0: y - 1.2, y1: y, tx0: x - 2.0, tx1: x + 2.0, thw: 1.8 }, shade(rgb(pal.hull), 1.1), MAT.HULL);
    model.mounts.push({ group: 'main', kind: 'dp', cal: mc.caliberMm, n: m.guns, bore: mc.boreCalibers, x, z, y: y + 0.1, arcC: sgm * 90 * D2R, arcH: 110 * D2R, label: m.label || ('S' + i) });
  });
  // parked aircraft on the aft part of the deck
  const nPlanes = Math.min(14, (spec.aircraft && spec.aircraft.capacity ? Math.round(spec.aircraft.capacity * 0.15) : 8));
  for (let i = 0; i < nPlanes; i++) {
    const x = x0 + 8 + i * 5.2 * (1 + (i % 2) * 0.1);
    const z = -sg * (hw * 0.45 + (i % 3 - 1) * 4);
    PT.aircraft(b, { x, y: fdY + 0.05, z, yaw: 0, kind: 'fighter', col: pal.sup, scale: 1.1 }, pal);
  }
  PT.deckRails(b, hull, x0 + 2, x1 - 4, 0.8, pal, 8);
}
