// Spec-driven ship builder. Reads a real-ship spec sheet (dimensions, turret / funnel / mast
// positions as fractions of the overall length, class, paint) and builds the full 3D model plus the
// gameplay data derived from it (mount positions and arcs, smoke points, buoyancy points, hit zones).
// Per-ship hand-tuning goes through `tweaks` (see js/game/model/tweaks.js).
import { MeshBuilder, MAT, rgb, shade, mix } from './meshbuilder.js';
import { buildHull } from './hull.js';
import { ELEMENTS } from './elements.js';
import { applyV4 } from './v4ship.js';
import * as PT from './parts.js';
import { makeRng } from '../math.js';
import { computeClearance, computeTubeArcs, inFoot, barrelBlocked } from './clearance.js';
import { clearHouses, houseRect } from './layout.js';
import { defaultScrews } from './screws.js';
import { paintOf, hullNumber, LIVERY, MARKS, PALETTES } from './livery.js';
import * as DT from './details.js';
import { mountDims } from './mounts.js';

const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);
const D2R = Math.PI / 180;

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function makePalette(spec, tw) {
  const p = spec.paint || {};
  const sup = p.superstructure || '#8a9096';
  const pal = {
    hull: p.hull || '#59616a', boot: p.boot || '#1b1d20', deck: p.deck || '#6b6258',
    sup, dark: '#202327', cap: p.cap || '#18191b', funnel: p.funnel || sup, mast: rgb(shade(sup, 0.82)).map(Math.round),
    boat: '#8c9296', glass: '#0e151b', ...(tw.pal || {}),
  };
  const lv = spec.id in LIVERY ? LIVERY[spec.id] : LIVERY[spec.baseId || spec.id];      // (a variant has its own paint when it is listed, even as null: the plain colours of its sheet)
  if (MARKS[spec.baseId || spec.id]?.top) pal.top = MARKS[spec.baseId || spec.id].top;
  if (lv) { const m = PALETTES[lv.pal]; pal.hull = m[1]; pal.sup = m[2]; pal.funnel = m[1]; pal.mast = m[1]; pal.boat = m[2]; }
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
    camber: tw.camber ?? (dd ? 0.18 : 0.3), bulwark: tw.bulwark ?? (dd ? 0.85 : 0.95),
    planWL: tw.planWL, planDeck: tw.planDeck, bulwarkF: tw.bulwarkF, draftProfile: tw.keel,
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

/** Light AA mount families by nation: model variant, number of barrels, calibre (mm), selection weight. */
const AA_KINDS = {
  USA: [{ g: 'bofors40', v: 'bofors', n: 4, cal: 40, bore: 56, w: 0.32, label: 'Bofors 40 mm quadruple' }, { g: 'bofors40', v: 'bofors', n: 2, cal: 40, bore: 56, w: 0.2, label: 'Bofors 40 mm double' }, { g: 'oerlikon20', v: 'oerlikon', n: 1, cal: 20, bore: 70, w: 0.48, label: 'Oerlikon 20 mm' }],
  UK: [{ g: 'pompom', v: 'bofors', n: 4, cal: 40, bore: 39, w: 0.3, label: 'Pom-pom 40 mm' }, { g: 'bofors40', v: 'bofors', n: 2, cal: 40, bore: 56, w: 0.2, label: 'Bofors 40 mm' }, { g: 'oerlikon20', v: 'oerlikon', n: 1, cal: 20, bore: 70, w: 0.5, label: 'Oerlikon 20 mm' }],
  Japan: [{ g: 't96_25', v: 'iijn25', n: 3, cal: 25, bore: 60, w: 0.52, label: 'Type 96 de 25 mm triple' }, { g: 't96_25', v: 'iijn25', n: 2, cal: 25, bore: 60, w: 0.2, label: 'Type 96 de 25 mm double' }, { g: 't93_13', v: 'oerlikon', n: 1, cal: 13, bore: 76, w: 0.28, label: 'Type 93 de 13,2 mm' }],
  Germany: [{ g: 'flak37', v: 'bofors', n: 2, cal: 37, bore: 83, w: 0.36, label: 'Flak 37 mm double' }, { g: 'flak38', v: 'iijn25', n: 4, cal: 20, bore: 65, w: 0.22, label: 'Flakvierling 20 mm' }, { g: 'flak38', v: 'oerlikon', n: 1, cal: 20, bore: 65, w: 0.42, label: 'Flak 20 mm' }],
  France: [{ g: 'fr37_1933', v: 'bofors', n: 2, cal: 37, bore: 50, w: 0.4, label: 'Mitrailleuse de 37 mm' }, { g: 'hotchkiss13', v: 'iijn25', n: 2, cal: 13, bore: 76, w: 0.3, label: 'Hotchkiss 13,2 mm double' }, { g: 'oerlikon20', v: 'oerlikon', n: 1, cal: 20, bore: 70, w: 0.3, label: 'Oerlikon 20 mm' }],
  Italy: [{ g: 'breda37', v: 'bofors', n: 2, cal: 37, bore: 54, w: 0.4, label: 'Breda 37 mm double' }, { g: 'breda20', v: 'iijn25', n: 2, cal: 20, bore: 65, w: 0.3, label: 'Breda 20 mm double' }, { g: 'breda20', v: 'oerlikon', n: 1, cal: 20, bore: 65, w: 0.3, label: 'Breda 20 mm' }],
};

/** Plan outline [[fraction from bow, half-width], ...] (forward to aft, starboard side) -> closed [x, z] polygon, mirrored to port. */
function planPoly(plan, X, zc = 0) {
  return [...plan.map(([f, w]) => [X(f), zc + w]), ...plan.slice().reverse().map(([f, w]) => [X(f), zc - w])];
}

/** Light AA mount types by key, for the measured layouts (tweaks.aa). */
const AA_TYPES = {
  q40: { g: 'bofors40', v: 'bofors', n: 4, cal: 40, bore: 56, tub: 2.3, label: 'Bofors 40 mm quadruple' },
  t40: { g: 'bofors40', v: 'bofors', n: 2, cal: 40, bore: 56, tub: 1.8, label: 'Bofors 40 mm double' },
  o20: { g: 'oerlikon20', v: 'oerlikon', n: 1, cal: 20, bore: 70, label: 'Oerlikon 20 mm' },
  t25: { g: 't96_25', v: 'iijn25', n: 3, cal: 25, bore: 60, tub: 1.6, label: 'Type 96 de 25 mm triple' },
  d25: { g: 't96_25', v: 'iijn25', n: 2, cal: 25, bore: 60, label: 'Type 96 de 25 mm double' },
  s25: { g: 't96_25', v: 'oerlikon', n: 1, cal: 25, bore: 60, label: 'Type 96 de 25 mm simple' },
  m13: { g: 't93_13', v: 'iijn25', n: 2, cal: 13, bore: 76, label: 'Type 93 de 13,2 mm double' },
  q13: { g: 'hotchkiss13', v: 'iijn25', n: 4, cal: 13, bore: 76, label: 'Hotchkiss 13,2 mm quadruple' },
  s37: { g: 'fr37_1925', v: 'bofors', n: 1, cal: 37, bore: 50, label: '37 mm Mle 1925 simple' },
  f37: { g: 'fr37_1933', v: 'bofors', n: 2, cal: 37, bore: 50, tub: 1.7, label: '37 mm Mle 1933 double' },
  t37: { g: 'flak37', v: 'bofors', n: 2, cal: 37, bore: 83, tub: 1.7, label: 'Flak 37 mm double' },
  q20: { g: 'flak38', v: 'iijn25', n: 4, cal: 20, bore: 65, tub: 1.6, label: 'Flakvierling 20 mm' },
  q11: { g: 'm1_28', v: 'bofors', n: 4, cal: 28, bore: 75, tub: 2.3, label: 'Mitrailleuse de 1,1 in quadruple' },
  p40: { g: 'pompom', v: 'bofors', n: 4, cal: 40, bore: 39, tub: 2.3, label: 'Pom-pom 40 mm octuple' },
  f20: { g: 'flak38', v: 'oerlikon', n: 1, cal: 20, bore: 65, label: 'Flak 20 mm' },
  i37: { g: 'breda37', v: 'breda37', n: 2, cal: 37, bore: 54, label: 'Breda 37/54 double' },
  b20: { g: 'breda20', v: 'oerlikon', n: 1, cal: 20, bore: 65, label: 'Breda 20/65 single' },
  b20d: { g: 'scotti20', v: 'iijn25', n: 2, cal: 20, bore: 70, label: 'Scotti 20/70 double' },
  p20: { g: 'phalanx20', v: 'phalanx', n: 1, cal: 20, bore: 76, label: 'Phalanx Mk 15 20 mm' },
};

/** What turns on a ship (the screws and the rudders are in `model.spinners`): a search radar sweeps round (rad/s, by kind) and a fire-control director follows the guns. */
const radarSpin = (o) => (o.kind === 'yagi' ? undefined : { x: o.x, y: o.y, z: o.z || 0, rate: o.kind === 'dish' ? 1.9 : o.kind === 'box' ? 1.2 : 0.8 });
const dirTrack = (o) => ({ track: { x: o.x, y: o.y, z: o.z || 0 } });

function kindOf(desc, ...words) { return words.some((w) => new RegExp(w, 'i').test(desc || '')); }

/**
 * The eye of the bridge camera: a spot on a roof of the superstructure near the tower (standing at its front edge or on a wing) with the longest clear view
 * ahead, out of the way of the centre-line mast and its stays. solids: bounding boxes [x0, x1, y0, y1, z0, z1] of everything built.
 */
function bridgeEye(model, solids, L) {
  const tx = model.bridge.towerX, top = model.topY;
  // anything that stands at the height of the eye, or reaches it, within 2 m: a funnel, a mast, a wall
  const inside = (x, y, z, m) => { for (const s of solids) if (s[3] > y - 1.2 && s[2] < y + 2 && x > s[0] - m && x < s[1] + m && z > s[4] - m && z < s[5] + m) return true; return false; };
  // distance along a ray (direction dx, dy, dz) to the first box, capped
  const ray = (x, y, z, dx, dy, dz, cap) => {
    let best = cap;
    for (const s of solids) {
      let t0 = 0, t1 = best;
      for (const [o, d, lo, hi] of [[x, dx, s[0], s[1]], [y, dy, s[2], s[3]], [z, dz, s[4], s[5]]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t1 = -1; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) break;
      }
      if (t1 >= t0 && t0 < best && t0 > 0) best = t0;
    }
    return best;
  };
  let best = null;
  for (const [x, y, z] of model.bridge.cands || []) {
    if (inside(x, y, z, 0.3)) continue;
    // clear view ahead, on a fan of rays over the width and the height of the picture; near obstacles in it cost more than far ones
    let score = 0, n = 0, worst = 60;
    for (const pitch of [-0.04, 0.08]) for (const yaw of [0, -0.15, 0.15, -0.3, 0.3, -0.5, 0.5]) {
      const d = Math.min(ray(x, y, z, Math.cos(yaw), pitch, Math.sin(yaw), 60), 60), w = 1 - Math.abs(yaw);
      score += w * (d / 5 - (d < 7 ? 6 : 0)); n++;
      if (Math.abs(yaw) < 0.4) worst = Math.min(worst, d);
    }
    score = score / n * 4 + 6 * (y / top) - Math.abs(x - tx) * 0.05 - (Math.abs(z) < 1.2 ? 5 : 0) + Math.min(worst, 25) * 0.8;
    if (!best || score > best.score) best = { x, y, z, score };
  }
  delete model.bridge.cands;
  if (best) { model.bridge.x = best.x; model.bridge.y = best.y; model.bridge.z = best.z; }
  else { model.bridge.x = tx + 5; model.bridge.y = Math.max(model.bridge.y, top * 0.6); model.bridge.z = 2.5; }
}

export function buildShipModel(spec, tw = {}) {
  const b = new MeshBuilder();
  b.solids = [];
  const rnd = makeRng(hashStr(spec.id));
  const pal = makePalette(spec, tw);
  const t = spec.type;
  const hp = hullParams(spec, tw);
  const L = hp.L, B = hp.B;
  const carrier = t === 'CV';
  // tw.boat: a small craft (a motor torpedo boat): none of the equipment of a ship is put on it by itself (no deckhouse, funnel, tower, mast, boats, rafts, ventilators, random light guns),
  // everything is in the tweaks: decks, aa, props, rudders and tw.extra, which also sets model.bridge and model.superBox
  const boat = !!tw.boat;
  // tw.own: a ship drawn bespoke from a reference (ships/<id>.js): like a boat the generic equipment (deckhouse, funnel, tower, masts, radars, boats, rafts, vents, clutter) is left out, its extra() draws all of it
  const bare = boat || !!tw.own;
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
    id: spec.id, spec, L, B, D: hp.D, mounts: [], smoke: [], aa: [], aaMounts: [], tubes: [], missileMounts: [], floatPts: [], hull, pal,
    topY: 0, catapults: [], hangar: null, island: null, deckPoints: [], parts: [], deckSlots: [], paint: paintOf(spec),
  };
  // A destroyable piece: built into its own mesh (+ an optional wrecked version drawn once it is destroyed).
  const part = (id, kind, label, fn, ruinFn, extra = {}) => {
    const bb = b.group(id, fn);
    if (!isFinite(bb[0])) return null;
    if (ruinFn) b.group(id + '_ruin', ruinFn);
    if (extra.fine) b.group(id + '_fine', extra.fine);
    const p = { id, kind, label, bb, hasRuin: !!ruinFn, hasFine: !!extra.fine, ...extra };
    delete p.fine;
    model.parts.push(p);
    return p;
  };
  const charred = (pal0) => shade(rgb(pal0.dark), 1.1);

  // -------- propulsion under water (tweaks.props / tweaks.rudders, measured on the plans where they show the underwater body) --------
  //   props: [{ f, z (a prop off the centreline has its twin on the other side), depth (shaft axis below the waterline), d, blades,
  //             toF (where the shaft enters the hull or its bossing), strutF (shaft bracket), skeg: true (the shaft runs in a skeg) }]
  //   rudders: [{ f, z, top, bottom (depths below the waterline), chord }]
  model.shafts = []; model.rudders = []; model.spinners = [];
  // tw.bulb: a bulbous forefoot { f0, f1 (its extent from the bow), y (centre below the waterline), h, w }
  if (tw.bulb) { const q = tw.bulb; b.sphere((X(q.f0) + X(q.f1)) / 2, -q.y, 0, (X(q.f0) - X(q.f1)) / 2, q.h / 2, q.w / 2, rgb(pal.boot), MAT.SKIN, { seg: 16, rings: 10 }); }
  // a class whose underwater body was not measured gets the screws and the rudder its shafts and draught call for (for the eye: the damage model keeps its own shafts)
  const dflt = tw.props ? null : defaultScrews(spec);
  for (const pr of tw.props || dflt?.props || []) {
    for (const sg of pr.z ? [1, -1] : [0]) {
      const x = X(pr.f), z = sg * Math.abs(pr.z || 0), y = -pr.depth, xe = X(pr.toF ?? pr.f - 0.08);
      { const id = 'spin' + model.spinners.length; b.group(id, () => PT.propeller(b, { x, y, z, d: pr.d, blades: pr.blades, hand: sg || 1, phase: sg * 0.4 })); model.spinners.push({ id, kind: 'prop', x, y, z, side: sg }); }
      b.rod(x + pr.d * 0.1, xe, y, z, pr.d * 0.06, pr.d * 0.07, rgb('#77706a'), MAT.HULL, { seg: 10 });
      if (pr.skeg) b.block({ x0: X(pr.f - 0.004) , x1: xe, hw: 0.6, zc: z, y0: y - pr.d * 0.1, y1: y + pr.d * 0.45, tx0: X(pr.f - 0.004) }, rgb(pal.boot), MAT.SKIN);
      else if (pr.strutF) {
        const xs = X(pr.strutF), top = [xs, y + pr.d * 0.55, z * 0.55];
        b.beam([xs, y, z], top, 0.35, 0.9, rgb(pal.boot), MAT.HULL);
        b.beam([xs, y, z], [xs, y + pr.d * 0.5, z * 1.15], 0.35, 0.9, rgb(pal.boot), MAT.HULL);
      }
      if (!dflt) model.shafts.push({ x: (x + xe) / 2, z, y, hx: Math.abs(xe - x) / 2, side: Math.sign(z) });
    }
  }
  for (const r of tw.rudders || (tw.props ? null : dflt?.rudders) || []) {
    for (const sg of r.z ? [1, -1] : [0]) {
      { const o = { x: X(r.f), z: sg * Math.abs(r.z || 0), y0: -r.bottom, y1: -r.top, chord: r.chord, t: r.t, stock: r.stock, round: r.round }, id = 'spin' + model.spinners.length; b.group(id, () => PT.rudder(b, o, pal)); model.spinners.push({ id, kind: 'rudder', x: o.x + o.chord * 0.25, y: o.y1, z: o.z }); }
      if (!dflt) model.rudders.push({ x: X(r.f), z: sg * Math.abs(r.z || 0) });
    }
  }
  let topY = Y(0) + 4;
  const note = (y) => { if (y > topY) topY = y; };
  const houseH = tw.houseH ?? { DD: 2.2, CL: 3.0, CA: 3.2, BB: 3.6, CV: 0 }[t];
  const dirKind = spec.nation === 'Japan' ? 'drum' : 'box';

  // -------- funnels first (they decide where the central deckhouse ends) --------
  const fun = sil.funnels || { count: 1, fractionFromBow: [0.5], heightAboveDeckM: 12 };
  const fF = fun.fractionFromBow && fun.fractionFromBow.length ? fun.fractionFromBow : [0.5];
  const fCount = Math.max(fun.count || fF.length, 0);
  const funLz = clamp((tw.funnelW ?? (t === 'DD' ? 0.30 : t === 'CV' ? 0.2 : 0.26)) * B, 2.4, 11);
  const funLx = funLz * (tw.funnelLen ?? (t === 'BB' ? 1.55 : 1.45));

  // -------- central deckhouse --------
  // the tower stands where tw.towerF says (the foremast can be abaft it): the deckhouse has to reach the front of the bridge
  const towerF = tw.towerF ?? ((sil.masts && sil.masts[0] && sil.masts[0].fractionFromBow) || 0.33);
  if (!carrier && !bare && tw.house?.plan) {
    // measured outline of the deckhouse: [[fraction from bow, half-width (m)], ...] from forward to aft, mirrored to port
    const pl = tw.house.plan, fs = pl.map((q) => q[0]);
    const hx0 = X(Math.min(...fs)), hx1 = X(Math.max(...fs));
    const hw = Math.max(...pl.map((q) => q[1]));
    const hy = Y((hx0 + hx1) / 2);
    b.prism(planPoly(pl, X), hy - 0.6, hy + houseH, rgb(pal.sup), MAT.HULL);
    model.house = { x0: hx1, x1: hx0, hw, y: hy + houseH };
  } else if (!carrier && !bare) {
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

  // -------- measured superstructure blocks (tweaks.decks); heights are above the local deck --------
  const deckBox = { x0: Infinity, x1: -Infinity, hw: 0, y1: -Infinity };
  const fineRails = [];
  for (const d of (!carrier && tw.decks) || []) {
    const fs = d.plan ? d.plan.map((q) => q[0]) : d.f;
    const xf = X(Math.min(...fs)), xa = X(Math.max(...fs)), xm = (xf + xa) / 2;
    const y0 = Y(xm) + d.y[0], y1 = Y(xm) + d.y[1], zc = d.z || 0;
    const col = d.col ? rgb(pal[d.col] || d.col) : rgb(pal.sup);
    const hw = d.hw ?? Math.max(...d.plan.map((q) => q[1])), tp = d.taper ?? 1;
    if (d.plan) b.prism(planPoly(d.plan, X, zc), y0, y1, col, MAT.HULL, { topScale: tp });
    else if (d.round) b.cyl(xm, y0, zc, (xf - xa) / 2, hw, (xf - xa) / 2 * tp, hw * tp, y1, col, MAT.HULL, { seg: 18 });
    else b.block({ x0: xa, x1: xf, hw, zc, y0, y1, tx1: xf - (d.rake || 0), tx0: xa + (d.rakeA || 0), thw: hw * tp }, col, MAT.HULL);
    if (d.windows && !d.round && !d.plan) PT.windowBand(b, xa, xf - (d.rake || 0) * 0.4, hw * tp, y0 + (y1 - y0) * 0.45, Math.min((y1 - y0) * 0.3, 1.0), pal, true, true);
    // d.wings: open bridge wings (m beyond the sides) at the top of the level; d.rail: guard rails round its roof (fine detail)
    if (d.wings) b.block({ x0: xf - (xf - xa) * 0.35, x1: xf - (d.rake || 0) - 0.2, hw: hw * tp + d.wings, zc, y0: y1 - 0.25, y1: y1 + 0.08 }, shade(col, 0.9), MAT.HULL);
    if (d.rail && !d.round) fineRails.push([(xa + xf) / 2, y1, zc, (xf - xa) / 2 - 0.2, hw * tp - 0.15]);
    deckBox.x0 = Math.min(deckBox.x0, xa); deckBox.x1 = Math.max(deckBox.x1, xf); deckBox.hw = Math.max(deckBox.hw, hw + Math.abs(zc)); deckBox.y1 = Math.max(deckBox.y1, y1);
    note(y1);
  }

  const supportBelow = (x, z, y) => {
    const hb = hull.halfBeamDeck(x);
    let base = Math.abs(z) < hb ? Y(x) - hull.camber * Math.pow(z / (hb || 1), 2) : -9;
    for (const s of b.solids) if (s[3] <= y + 0.1 && s[3] > base && inFoot(s, x, z, 0.3)) base = s[3];
    return base;
  };
  // the foot of a mast or of one of its legs: it stands on the roof under it, not in the air above it (a base measured on the plan can float over a deck that the model builds lower)
  const lowerBase = (x, z, y) => { const sp = supportBelow(x, z, y + 0.15); return y - sp > 0.5 && y - sp < 30 ? sp : y; };
  const funnelTops = [];
  // -------- funnels --------
  for (let i = 0; i < Math.min(fCount, fF.length); i++) {
    const x = X(fF[i]);
    if (carrier || bare) continue;
    // tw.funnels[i]: measured { lx, lz (m), y0 (base above the deck), h, rake, top (top / base size) }
    const fw = tw.funnels?.[i] || {};
    let y0 = Y(x) + (fw.y0 ?? houseH);
    const small = tw.funnelScale ? tw.funnelScale[i] ?? 1 : 1;
    let fh = (fw.h ?? tw.funnelH ?? fun.heightAboveDeckM ?? (t === 'DD' ? 11 : 18)) * small;
    // a funnel stands on what is under it (a deckhouse, or the deck itself where there is none): a base that would float above it is brought down and the funnel keeps its top
    { const base = supportBelow(x, 0, y0 + 0.2); if (y0 - base > 0.4 && y0 - base < 4) { fh += y0 - base; y0 = base; } }
    const flx = fw.lx ?? funLx * (tw.funnelX?.[i] ?? 1), flz = fw.lz ?? funLz * (tw.funnelZ?.[i] ?? 1);
    const top = fw.top ?? tw.funnelTop ?? 0.88, rake = fw.rake ?? tw.funnelRake ?? fh * 0.14;
    const fo = { x, y0, h: fh, lx: flx, lz: flz, topLx: flx * top, topLz: flz * top, rake, band: tw.funnelBand, capSlope: fw.capSlope, pipes: fw.pipes };
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => PT.funnel(b, fo, pal), () => PT.funnelRuin(b, fo, pal), { fine: () => PT.funnelDetail(b, fo, pal) });
    model.smoke.push([x - rake * 0.9, y0 + fh, 0]);
    funnelTops.push([x - rake * 0.9, y0 + fh, 0]);
    note(y0 + fh);
  }

  // what a mount stands on: the highest roof or deck under it (within 1 m of its footprint centre)
  // -------- bridge tower / island --------
  if (!carrier && !bare) {
    const x = X(towerF);
    const y0 = Y(x) + (tw.towerY0 ?? 0);
    const tiers = tw.tiers || (tw.pagoda ? pagodaTiers(...tw.pagoda) : towerTiers(spec));
    let r = null;
    part('tower', 'bridge', 'Passerelle', () => { r = PT.tower(b, { x, y0, tiers }, pal); },
      () => PT.tower(b, { x, y0, tiers: tiers.slice(0, 1).map((t) => ({ ...t, col: charred(pal), windows: false, wings: 0 })) }, pal),
      { fine: () => PT.towerDetail(b, { x, y0, tiers }, pal) });
    let y = r.topY;
    const topW = tiers[tiers.length - 1].w;
    // main director on top + radar, then a mast
    const mastDesc = (sil.masts && sil.masts[0] && sil.masts[0].kind) || '';
    const mastH = (sil.masts && sil.masts[0] && sil.masts[0].heightAboveWaterM) || (t === 'DD' ? 22 : 40);
    const ensLen = clamp(L * 0.021, 2.2, 6.2);
    const ensOnFore = !(sil.masts && sil.masts.length > 1);
    const mastTopY = Math.max(mastH, y + 4);
    // tw.dir0: measured main director { dx, w, l, h }; tw.foremast: { dx, y0 (base above the deck) }
    const d0 = tw.dir0 || {};
    const dirO = { x: x + (d0.dx ?? 0.3), y, z: 0, w: d0.w ?? topW * 0.7, l: d0.l ?? topW * 0.75, h: d0.h ?? (t === 'DD' ? 1.6 : 2.4), kind: tw.dirKind || dirKind };
    part('director0', 'director', 'Directeur de tir avant', () => PT.director(b, dirO, pal), () => b.cylinder(dirO.x, dirO.y, 0, 0.5, 0.4, dirO.y + 0.7, rgb(charred(pal)), MAT.DARK, { seg: 6 }), dirTrack(dirO));
    y += t === 'DD' ? 2.0 : 3.0;
    if (tw.foremast?.y0 != null) y = Y(x) + tw.foremast.y0;
    const mx = x + (tw.foremast?.dx ?? -0.8);
    // tw.foremast.base: where the legs of a tripod stand (m above the deck), apex: the height of its apex as a fraction of the mast
    let mastBase = tw.foremast?.base != null ? Y(x) + tw.foremast.base : r.tops[Math.max(0, tiers.length - 3)];
    // rigging of the foremast: forestay to the bow, stays to the funnels, a flag hoist on the yardarms
    const foreFine = () => {
      const top = [mx - 0.1, mastTopY - 0.8, 0], sc = rgb(pal.dark);
      DT.stay(b, top, [X(0.012), Y(X(0.012)) + 1.4, 0], sc, 0.05);
      DT.stay(b, [x - 0.9, mastTopY * 0.82, 0], [X(0.03), Y(X(0.03)) + 1.0, 0.3], sc, 0.04);
      for (const ft of funnelTops.slice(0, 2)) DT.stay(b, [x - 0.9, mastTopY * 0.74, 0], [ft[0], ft[1] - 0.6, 0], sc, 0.04);
      b.rodZ(x - 0.8, mastTopY * 0.66 + 0.1, -4.4, 4.4, 0.06, 0.04, sc, MAT.HULL, { seg: 5 });
      PT.signalHoist(b, x - 0.8, mastTopY * 0.66, 3.2, 4, 1);
      PT.signalHoist(b, x - 0.8, mastTopY * 0.66, -3.6, 5, 4);
    };
    const mastRuin = (mx, my, mh) => () => b.cylinder(mx, my, 0, 0.5, 0.3, my + Math.max(2.5, mh * 0.18), rgb(charred(pal)), MAT.DARK, { seg: 6 });
    if (kindOf(mastDesc, 'tripod')) {
      const sp0 = tw.foremast?.spread ?? topW * 0.6, bk0 = tw.foremast?.back ?? 4, fr0 = tw.foremast?.front ?? 2;
      const feet = [lowerBase(mx - 0.2 + fr0, -sp0, mastBase), lowerBase(mx - 0.2 + fr0, sp0, mastBase), lowerBase(mx - 0.2 - bk0, 0, mastBase)];
      part('mast0', 'mast', 'Mât avant', () => {
        PT.tripod(b, { x: mx - 0.2, y0: mastBase, h: mastTopY - mastBase, legSpread: sp0, legBack: bk0, legFront: fr0, feet, apexFrac: tw.foremast?.apex, platforms: [tw.foremast?.platform ?? 0.55], yards: [[0.8, 8]] }, pal);
        PT.pennant(b, mx, mastTopY + 0.2, 0.3, 4.5, 0, '#ffffff');
        if (ensOnFore) PT.ensign(b, { x: mx - 0.3, y: mastTopY - 7, z: 0, len: ensLen });
      }, mastRuin(mx - 0.2, mastBase, mastTopY - mastBase), { fine: foreFine });
    } else if (kindOf(mastDesc, 'cage|lattice')) {
      mastBase = Math.min(...[[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]].map(([a, c]) => lowerBase(mx - 0.2 + a, c, mastBase)));
      part('mast0', 'mast', 'Mât avant', () => {
        PT.cageMast(b, { x: mx - 0.2, y0: mastBase, h: mastTopY - mastBase - (tw.foremast?.cap ?? 4), r0: tw.foremast?.r0 ?? 2.4, r1: tw.foremast?.r1 ?? 1.0 }, pal);
        PT.pennant(b, x - 0.8, mastTopY + 0.2, 0.3, 4.5, 0, '#ffffff');
        if (ensOnFore) PT.ensign(b, { x: x - 1.1, y: mastTopY - 7, z: 0, len: ensLen });
      }, mastRuin(x - 1, mastBase, mastTopY - mastBase), { fine: foreFine });
    } else {
      y = lowerBase(mx, 0, y);
      part('mast0', 'mast', 'Mât avant', () => {
        PT.poleMast(b, { x: mx, y0: y, h: Math.max(mastTopY - y, 6), r: 0.38, yards: [[0.55, 9], [0.8, 6]] }, pal);
        PT.pennant(b, mx, mastTopY + 0.2, 0.3, 4.5, 0, '#ffffff');
        if (ensOnFore) PT.ensign(b, { x: mx - 0.3, y: mastTopY - 7, z: 0, len: ensLen });
      }, mastRuin(mx, y, Math.max(mastTopY - y, 6)), { fine: foreFine });
    }
    // radar
    const rkind = ['USA', 'UK'].includes(spec.nation) ? 'bedspring' : 'box';
    const ro0 = { x: mx, y: Math.max(mastTopY - 3.5, y), z: 0, kind: rkind, w: Math.min(7, 0.2 * B + 2) }, ro1 = { x: x + 2, y: r.tops[Math.max(0, tiers.length - 2)], z: topW * 0.2, kind: 'dish' };
    if (!tw.noRadar) {      // tw.noRadar: the ship's own extra draws its radars
      part('radar0', 'radar', 'Radar de veille', () => PT.radar(b, ro0, pal), undefined, { spin: radarSpin(ro0) });
      part('radar1', 'radar', 'Radar de surface', () => PT.radar(b, ro1, pal), undefined, { spin: radarSpin(ro1) });
    }
    note(mastTopY + 2);
    // candidate eyes for the bridge camera: outside the front face of every tier, at window height, on the wings and a little ahead (picked in bridgeEye())
    {
      const cands = [];
      tiers.forEach((t, i) => {
        if (t.round || t.h < 1.2) return;
        const yb = r.tops[i] - t.h, xf = x + (t.dx || 0) + t.len / 2 - (t.rake ?? 0) * 0.5;
        for (const off of [0.9, 2.4, 4.2]) for (const zz of [t.w / 2 + 0.6, t.w / 2 * 0.5, 0]) for (const sg of zz === 0 ? [1] : [-1, 1]) cands.push([xf + off, yb + t.h * 0.6, sg * zz]);
      });
      model.bridge = { x: x + 5, y: r.topY, z: 0, towerX: x, cands };
    }
    {
      const hx0 = model.house ? model.house.x1 : x - 8, hx1 = model.house ? model.house.x0 : x + 8;
      model.superBox = { x0: Math.min(hx0, x - tiers[0].len / 2, deckBox.x0), x1: Math.max(hx1, x + tiers[0].len / 2, deckBox.x1), hw: Math.max(model.house ? model.house.hw : 0, tiers[0].w / 2, deckBox.hw), y1: Math.max(r.topY, deckBox.y1) };
    }
  }

  // -------- secondary mast(s) --------
  if (!carrier && !bare) {
    const masts = sil.masts || [];
    for (let i = 1; i < masts.length; i++) {
      const m = masts[i];
      const x = X(m.fractionFromBow);
      let y0 = Y(x) + (model.house && x < model.house.x1 + 0.1 && x > model.house.x0 - 0.1 ? 0 : 0);
      if (model.house && x <= model.house.x1 && x >= model.house.x0 - 1e-9 + 0) y0 = model.house.y - 0.0;
      if (tw.mastY0?.[i] != null) y0 = Y(x) + tw.mastY0[i];
      const isTri = !tw.mastRake?.[i] && kindOf(m.kind, 'tripod');
      const feet2 = isTri ? [lowerBase(x + 1.5, -3.5, y0), lowerBase(x + 1.5, 3.5, y0), lowerBase(x - 4, 0, y0)] : null;
      if (!isTri) y0 = lowerBase(x, 0, y0);
      const h = Math.max((m.heightAboveWaterM || 30) - y0, 8);
      part('mast' + i, 'mast', 'Mât ' + (i === 1 ? 'arrière' : 'secondaire'), () => {
        if (tw.mastRake?.[i]) {
          // a raked mast (tw.mastRake: how far its head stands forward (+) or aft (-) of its foot, m)
          const top = [x + tw.mastRake[i], y0 + h, 0], col = rgb(pal.mast);
          const mw = clamp(L * 0.0046, 0.35, 1.2);   // a destroyer's mast is a pole, a battleship's a tower
          b.beam([x, y0, 0], top, mw, mw, col, MAT.HULL);
          b.rodZ(x + tw.mastRake[i] * 0.75, y0 + h * 0.75, -4, 4, 0.08, 0.06, col, MAT.HULL, { seg: 5 });
        } else if (kindOf(m.kind, 'tripod')) PT.tripod(b, { x, y0, h, legSpread: 3.5, legBack: 4, legFront: 1.5, feet: feet2, platforms: [0.6], yards: [[0.78, 7]] }, pal);
        else PT.poleMast(b, { x, y0, h, r: 0.36, yards: [[0.6, 8]] }, pal);
        if (i === masts.length - 1) PT.ensign(b, { x: x - 0.7, y: y0 + h * 0.8, z: 0, len: clamp(L * 0.021, 2.2, 6.2) });
      }, () => b.cylinder(x, y0, 0, 0.45, 0.3, y0 + Math.max(2.2, h * 0.16), rgb(charred(pal)), MAT.DARK, { seg: 6 }), {
        fine: () => {
          const sc = rgb(pal.dark), top = [x, y0 + h - 0.6, 0];
          if (i === masts.length - 1) DT.stay(b, top, [X(0.99), Y(X(0.99)) + 1.4, 0], sc, 0.05);
          for (const ft of funnelTops.slice(-2)) DT.stay(b, [x, y0 + h * 0.7, 0], [ft[0], ft[1] - 0.6, 0], sc, 0.04);
          // flat-top antenna wires towards the foremast
          const fx = X((sil.masts[0] && sil.masts[0].fractionFromBow) || 0.33);
          for (const zz of [-1.4, 1.4]) DT.stay(b, [x, y0 + h * 0.92, zz], [fx - 1.0, Math.max(y0 + h * 0.92, 22), zz * 0.6], sc, 0.03);
        },
      });
      note(y0 + h);
    }
  }

  // -------- guns: helpers --------
  const mountRec = (group, kind, cal, n, bore, x, z, y, arcC, arcH, extra = {}) => {
    const rec = { group, kind, cal, n, bore, x, z, y, arcC, arcH, ...extra };
    model.mounts.push(rec);
    return rec;
  };
  // a mount whose spot is inside a structure (a deckhouse the sheet did not know about, a tower tier) or under one stands on the roof when that is a step of
  // 2.2 m or less, otherwise it moves outboard along the deck until it is clear (its footprint of radius rr and its height h free); failing that it takes the roof
  // anyway. Returns [z, y].
  const clash = (x, z, y, rr, h) => {
    let top = -1, over = false;
    for (const s of b.solids) {
      if (s[3] <= y + 0.2) continue;
      let hit = false;
      for (const [dx, dz] of [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr]]) if (inFoot(s, x + dx, z + dz, -0.1)) { hit = true; break; }
      if (!hit) continue;
      if (s[2] <= y + 0.35) top = Math.max(top, s[3]);          // the pivot is in it (or on the very floor of it)
      else if (s[2] < y + h) over = true;                        // it hangs over the mount
    }
    return { top, over };
  };
  const landOn = (x, z, y, rr = 1.0, h = 2.4, toDeck = true, maxLift = 2.2) => {
    // below the deck (a measured height that does not allow for the sheer at the bow and the stern): on the deck
    const hb = hull.halfBeamDeck(x), floor = Y(x) - hull.camber * Math.pow(Math.min(1, Math.abs(z) / (hb || 1)), 2);
    if (toDeck && Math.abs(z) < hb * 0.97 && y < floor - 0.05 && floor - y < 9) y = floor + 0.02;
    if (y < floor - 1.2 && Math.abs(z) < hb) return [z, y];       // a casemate in the side of the hull: nothing to land on
    const c = clash(x, z, y, rr, h);
    if (c.top < 0 && !c.over) return [z, y];
    if (c.top >= 0 && c.top - y <= maxLift) { const c2 = clash(x, z, c.top, rr, h); if (c2.top < 0 && !c2.over) return [z, c.top]; }
    const sg = z < 0 ? -1 : 1, lim = hull.halfBeamDeck(x) - 0.9;
    for (let dz = 0.4; Math.abs(z + sg * dz) < lim && dz < 7; dz += 0.4) { const c3 = clash(x, z + sg * dz, y, rr, h); if (c3.top < 0 && !c3.over) return [z + sg * dz, y]; }
    return [z, c.top >= 0 ? c.top : y];
  };
  /** a pillar from the roof or the deck up to a mount that would otherwise hang in the air (a sponson the sheet knew, the model does not) */
  const pedestal = (x, z, y, r) => {
    const base = supportBelow(x, z, y);
    if (y - base > 0.5 && y - base < 7) b.cylinder(x, base - 0.1, z, r, r * 1.08, y - 0.05, shade(rgb(pal.hull), 1.05), MAT.HULL, { seg: 10 });
  };
  const arcFor = (x, z) => {
    const side = Math.abs(z) > B * 0.22;
    if (side) return z > 0 ? [90 * D2R, 105 * D2R] : [-90 * D2R, 105 * D2R];
    if (x > L * 0.1) return [0, 152 * D2R];
    if (x < -L * 0.1) return [Math.PI, 148 * D2R];
    return [0, 170 * D2R];
  };
  const fdHw0 = carrier ? (tw.fdPlan ? Math.max(...tw.fdPlan.map((q) => q[1])) : (spec.flightDeckWidth || spec.beam) / 2) : 0;   // half-width of the flight deck
  const mainCal = spec.main.caliberMm;
  const mainKind = tw.mainKind || (mainCal >= 150 ? 'turret' : 'dp');
  const calM = mainCal / 1000;
  const barbH = 0.55 + calM * 4.2;

  // -------- main battery --------
  if (!carrier || tw.carrierMainOnDeck) {
    const levelY = {};
    for (const m of spec.main.mounts) {
      const x = X(m.fractionFromBow), deckY = Y(x);
      const lvl = m.level || 0;
      const sideZ = m.z ?? 0;
      const variant = tw.mainVariant && typeof tw.mainVariant === 'object' ? tw.mainVariant[m.guns] : tw.mainVariant;   // an object picks the family by the number of guns
      const dm = mountDims({ kind: mainKind, cal: mainCal, n: m.guns, bore: spec.main.boreCalibers, variant });
      const bh = m.barbM ?? dm.barb ?? barbH;   // m.barbM: this mount's barbette height above the deck, measured on the plan
      let pivot = deckY + bh;
      if (lvl >= 1 && m.barbM == null) pivot = deckY + bh + dm.lift * lvl;
      if (mainKind === 'dp' && lvl >= 1 && m.barbM == null) pivot = deckY + 1.0 + 2.6 * lvl;
      let sideZ2 = sideZ; [sideZ2, pivot] = landOn(x, sideZ, pivot, Math.max(1.2, calM * 9), dm.height + 0.8, false);
      const r = dm.barbR || Math.max(calM * 6, 1.1);
      PT.barbette(b, x, sideZ2, mainKind === 'turret' ? r : 0.9, deckY - 0.2, pivot, pal.hull);
      const [ac, ah0] = arcFor(x, sideZ2), ah = m.arcHalfDeg != null ? m.arcHalfDeg * D2R : ah0;      // m.arcHalfDeg: the traverse limit of this mount (degrees either side of its rest bearing), when it is known
      mountRec('main', mainKind, mainCal, m.guns, spec.main.boreCalibers, x, sideZ2, pivot, ac, ah, { label: m.label, bore: spec.main.boreCalibers, variant });
      note(pivot + dm.height + 0.8);
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
      let zz = p.offsetM != null ? sg * p.offsetM : sg * (onHouse ? Math.min(model.house.hw * 0.92, hbd * 0.85) : hbd * (kind === 'turret' ? 0.55 : 0.78));
      const lvl = (tw.secLevel ?? 0);
      const deckY = p.heightM != null ? Y(x) + p.heightM : Y(x) + (onHouse ? houseH : 0) + lvl;
      const sc = kind === 'turret' ? Math.max(calS * 4, 1.0) : 0.9;
      // a measured mount (heightM) stands on its own barbette from baseM (the deck, or the deckhouse roof it is on)
      let pivot;
      const sponson = carrier && p.offsetM == null && p.heightM == null && sg !== 0;
      if (sponson) {
        // a carrier's guns are not under the flight deck: they stand on sponsons outside its edge, as the main mounts of the other carriers do
        zz = sg * (fdHw0 + 1.4); pivot = fdY - 3.2;
        b.block({ x0: x - 2.4, x1: x + 2.4, hw: 2.0, zc: zz, y0: pivot - 1.1, y1: pivot, tx0: x - 1.9, tx1: x + 1.9, thw: 1.7 }, shade(rgb(pal.hull), 1.1), MAT.HULL);
      } else [zz, pivot] = landOn(x, zz, p.heightM != null ? deckY : kind === 'turret' ? deckY + 0.5 + calS * 3 : deckY + 0.55, Math.max(1.0, calS * 9), kind === 'turret' ? 3.2 : 2.6, false);
      const sv = tw.secVariant?.[si], sdm = sv ? mountDims({ kind, cal, n: per, variant: sv }) : null;
      if (kind === 'turret' && !sponson) PT.barbette(b, x, zz, sdm?.barbR || sc, p.baseM != null ? Y(x) + p.baseM - 0.2 : deckY - 0.2, pivot, pal.hull);
      if (kind !== 'turret' && p.heightM == null && !sponson) PT.tub(b, x, deckY - 0.1, zz, 1.2 + calS * 3, 0.6, pal);
      if (kind !== 'turret' && !sponson) pedestal(x, zz, pivot, 0.9 + calS * 3);
      const [ac, ah] = arcFor(x, zz);
      mountRec('sec', kind, cal, per, s.boreCalibers || 40, x, zz, pivot, sg === 0 ? ac : ac, ah, { bore: s.boreCalibers || 40, si, variant: tw.secVariant?.[si] });
      note(pivot + 2);
    }
  });

  // -------- torpedo tubes --------
  if (spec.torpedoes && spec.torpedoes.tubes && !tw.ownTubes) {      // tw.ownTubes: the ship's own extra draws its tubes and fills model.tubes
    const tq = spec.torpedoes;
    const fr = Array.isArray(tq.fractionFromBow) && tq.fractionFromBow.length ? tq.fractionFromBow : [0.58];
    const per = Math.max(1, Math.round(tq.tubes / fr.length));
    if (tq.bow) fr.length = 0;            // fixed tubes in the bow: their doors and the tubes are drawn by the ship's own extra (tweaks.js), which also fills model.tubes
    fr.forEach((f, fi) => {
      let x = X(f);
      // two mounts at one station (the sheet lists the station once for each) stand either side of the centre line
      const nth = fr.slice(0, fi).filter((g) => g === f).length, twin = fr.filter((g) => g === f).length > 1;
      let z = twin ? (nth % 2 ? 1 : -1) * 2.4 : 0, y;
      [z, y] = landOn(x, z, Y(x) + (model.house && x < model.house.x1 && x > model.house.x0 ? houseH : 0), 1.7, 2.2, false, 5.5);
      const at = tw.tubeAt && tw.tubeAt[fi];      // tw.tubeAt: [x, y, z] of each mount where the reference model has it (the sheet's stations are a profile's guesses)
      if (at) [x, y, z] = at;
      const kind = t === 'DD' ? 1 : 0;
      const to = { x, y, z, n: per, r: (tq.caliberMm || 533) / 2000, len: 4.6 + (tq.caliberMm || 533) / 600 };
      part('tubes' + model.tubes.length, 'tubes', 'Tubes lance-torpilles', () => PT.torpedoTubes(b, to, pal), () => b.box(x, y + 0.3, z, 2.4, 0.6, 1.6, rgb(charred(pal)), MAT.DARK));
      model.tubes.push({ x, y: y + 1, z, n: per, side: 0 });
    });
  }

  // -------- cruise-missile launchers (tw.launchers: [{ sys (id of the system of the sheet's `missiles`), kind ('abl' | 'mk141'), x, y (deck), z, yaw (deg) }]) --------
  (tw.launchers || []).forEach((l, i) => {
    const yaw = (l.yaw || 0) * Math.PI / 180, o = { x: l.x, y: l.y, z: l.z, yaw, kind: l.kind };
    part('launcher' + i, 'launcher', l.kind === 'abl' ? 'Lanceur blindé de missiles' : 'Lanceur de missiles', () => PT.missileBox(b, o, pal), () => b.box(l.x, l.y + 0.3, l.z, 4.2, 0.6, 2.2, rgb(charred(pal)), MAT.DARK), { keep: true, sys: l.sys });
    model.missileMounts.push({ kind: 'ssm', sys: l.sys, x: l.x, y: l.y + 1.2, z: l.z, arcC: yaw, arcH: Math.PI });
  });

  // -------- aircraft facilities (cruisers / battleships) --------
  if (!carrier && spec.aircraft && spec.aircraft.catapults > 0) {
    const mid = kindOf(spec.aircraft.hangar + ' ' + spec.aircraft.notes, 'amidships|between the funnels|athwart');
    // tw.cat: measured { f, z (m off the centreline), yaw (rad, bow end turned outboard; a single catapult turns by yaw), len,
    // y (above the deck), craneF, craneY (base above the deck), craneZ }
    const tc = tw.cat || {};
    const f0 = tc.f ?? (mid ? 0.575 : 0.84);
    const nCat = spec.aircraft.catapults;
    for (let i = 0; i < nCat; i++) {
      const sg = nCat === 1 ? 0 : (i === 0 ? -1 : 1);
      const x = X(f0), y = Y(x) + (tc.y ?? 0.2);
      const z = sg * (tc.z ?? (mid ? B * 0.12 : B * 0.2));
      const cy = nCat === 1 ? (tc.yaw ?? 0) : sg * (tc.yaw ?? 0.5 * (mid ? 1 : 0));
      const len = tc.len ?? 18;
      part('cat' + i, 'catapult', 'Catapulte et hydravion', () => {
        PT.catapult(b, { x, y, z, len, yaw: cy }, pal);
        PT.floatplane(b, { x: x + 3 * Math.cos(cy), y: y + 0.4, z: z + 3 * Math.sin(cy), yaw: cy, nation: spec.nation, scale: 1.0 }, pal);
      }, () => PT.catapult(b, { x, y, z, len, yaw: cy }, { ...pal, sup: charred(pal) }));
    }
    const cf = tc.craneF ?? f0 + 0.07;
    part('crane', 'crane', 'Grue', () => {
      for (const sg of tc.craneBoth ? [1, -1] : [1]) PT.crane(b, { x: X(cf), y0: Y(X(cf)) + (tc.craneY ?? 0), z: sg * (tc.craneZ ?? 0), h: tc.craneH ?? 7, len: tc.craneLen ?? 14, side: (tc.craneSide ?? 1) * (tc.craneBoth && tc.craneInboard ? -sg : 1), dir: tc.craneDir, angle: tc.craneAng, w: tc.craneW }, pal);
    });
  }

  // -------- armoured conning tower (tw.conning: { f, y (base above the deck), h, rx, rz }): an oval drum with vision slits --------
  if (tw.conning) {
    const c = tw.conning, x = X(c.f), y0 = Y(x) + c.y, col = rgb(pal.sup);
    b.cyl(x, y0, 0, c.rx, c.rz, c.rx * 0.97, c.rz * 0.97, y0 + c.h, col, MAT.HULL, { seg: 20 });
    b.cyl(x, y0 + c.h, 0, c.rx * 0.97, c.rz * 0.97, c.rx * 0.8, c.rz * 0.8, y0 + c.h + 0.45, shade(col, 0.9), MAT.HULL, { seg: 20 });
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.32;
      b.box(x + Math.cos(a) * c.rx * 0.985, y0 + c.h * 0.78, Math.sin(a) * c.rz * 0.985, 0.1, 0.22, 0.9, rgb(pal.glass), MAT.GLASS);
    }
    note(y0 + c.h + 0.5);
  }

  // -------- measured fire-control directors (tweaks.directors): { f, z, y (above the deck, or the flight deck of a carrier),
  //          ped (pedestal height), w, l, h, kind } --------
  for (const [i, d] of (tw.directors || []).entries()) {
    const x = X(d.f), y = (carrier ? fdY : Y(x)) + d.y, z = d.z || 0, ped = d.ped || 0, pr = d.pedR ?? 1.1;
    const o = { x, y: y + ped, z, w: d.w ?? 3, l: d.l ?? 3, h: d.h ?? 2.2, kind: d.kind || dirKind };
    part('director' + (i + 1), 'director', d.label || 'Directeur de tir', () => {
      if (ped > 0) b.cylinder(x, y, z, pr, pr * 0.9, y + ped, rgb(pal.sup), MAT.HULL, { seg: 12 });
      PT.director(b, o, pal);
    }, () => b.cylinder(x, y, z, 0.6, 0.45, y + Math.max(0.8, ped * 0.5), rgb(charred(pal)), MAT.DARK, { seg: 6 }), dirTrack(o));
    note(o.y + o.h + 1);
  }

  // -------- ship-specific extras (see tweaks.js) --------
  if (tw.extra) tw.extra({ b, hull, X, Y, pal, model, spec, rnd, PT, DT, houseH, note, MAT, rgb, shade, part });

  // -------- recognition stripes on the forecastle and the quarterdeck --------
  const mk = MARKS[spec.baseId || spec.id];
  if (mk?.stripes && !carrier) {
    const mf = spec.main.mounts.map((m) => m.fractionFromBow), gap = clamp(L * 0.04, 4, 9);
    PT.deckStripes(b, hull, { ...mk.stripes, x0: X(0.012), x1: X(Math.min(...mf)) - gap });
    PT.deckStripes(b, hull, { ...mk.stripes, x0: X(Math.max(...mf)) + gap, x1: X(0.985) });
  }

  // -------- carrier flight deck --------
  if (carrier) buildCarrier(b, model, spec, hull, pal, tw, X, Y, fdY, rnd, note, part);

  // -------- AA guns, boats, rails, clutter --------
  // tw.aa: the measured layout [{ k (AA_TYPES key), f, z (m off the centreline; a mount off the centreline has its twin on the other
  // side), y (m above the deck, or the flight deck of a carrier), one: true for a single mount on one side }]; otherwise spread at random
  // two light mounts never share a spot: a measured mount that would stand in another one slides fore or aft along its deck until it is clear (and is left out
  // when there is no room), and a mount that is not measured is only put where no other is
  const aaTaken = (x, y, z, rad) => model.aaMounts.some((m) => Math.abs(m.y - y) < 2.2 && Math.hypot(m.x - x, m.z - z) < (m.rad || 0.9) + rad) || model.tubes.some((q) => Math.abs(q.y - y) < 2.4 && Math.abs(q.x - x) < 2.8 && Math.abs(q.z - z) < 2.8);
  // the mounts copied from the reference model (model/elements.js): each stands where the model has it, facing the way the model has it, drawn as the model's own house and guns
  const baseId = spec.baseId || spec.id;      // (a variant of a ship, data/variants.js, shares its model: its elements, its livery)
  const elPl = ELEMENTS[baseId] && tw.elements !== false ? ELEMENTS[baseId].PLACEMENTS.filter((q) => !(tw.dropPlacements || []).includes(q.group) && !(tw.dropAA && AA_TYPES[q.type])) : [];      // tw.dropPlacements: the mounts of the model this fit does not have
  for (const pl of elPl.filter((q) => AA_TYPES[q.type])) {
    const ty = AA_TYPES[pl.type];
    model.aaMounts.push({ gun: ty.g, variant: ty.v, cal: ty.cal, n: ty.n, bore: ty.bore, x: pl.x, y: pl.y, z: pl.z, rad: 1.8, yaw0: pl.yaw * Math.PI / 180, label: ty.label, look: `${baseId}/${pl.kind}` });
    model.aa.push([pl.x, pl.y + 1.2, pl.z]);
    note(pl.y + 3);
  }
  // (a light mount of the list that stands within 3.5 m of a copy of the reference model's is that copy; the others, which the model does not have, keep the places measured for them)
  const copiedAA = elPl.some((q) => AA_TYPES[q.type]);
  for (const a of copiedAA && !tw.aaCap ? [] : tw.aa || []) {      // (a ship whose model has its light mounts takes them all, unless the tweak gives `aaCap`)
    const ty = AA_TYPES[a.k], x0 = X(a.f), rad = ty.tub ? ty.tub * 0.55 : 0.55;
    for (const sg of a.z && !a.one ? [1, -1] : [a.z < 0 ? -1 : 1]) {
      if (tw.aaCap && tw.aaCap[ty.cal] != null && model.aaMounts.filter((m) => m.cal === ty.cal).length >= tw.aaCap[ty.cal]) continue;      // tw.aaCap: the number of mounts of a calibre the real ship carried: the copies of the model count, the list only makes up the rest
      if (elPl.some((q) => AA_TYPES[q.type] && AA_TYPES[q.type].cal === ty.cal && Math.hypot(q.x - x0, q.z - (a.one ? a.z : sg * Math.abs(a.z || 0))) < 3.5)) continue;
      let placed = null;
      for (const dx of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5]) {
        const x = x0 + dx;
        const [z, y] = landOn(x, a.one ? a.z : sg * Math.abs(a.z || 0), (carrier ? fdY : Y(x)) + (a.y || 0));
        if (!aaTaken(x, y, z, rad)) { placed = { x, y, z }; break; }
      }
      if (!placed) continue;
      const { x, y, z } = placed;
      if (ty.tub && !a.noTub) PT.tub(b, x, y - 0.05, z, ty.tub, 0.95, pal);
      pedestal(x, z, y, 0.7);
      model.aaMounts.push({ gun: ty.g, variant: ty.v, cal: ty.cal, n: ty.n, bore: ty.bore, x, y, z, rad, yaw0: z ? Math.sign(z) * Math.PI / 2 : (a.f < 0.5 ? 0 : Math.PI), label: ty.label });
      model.aa.push([x, y + 1.2, z]);
      note(y + 3);
    }
  }
  // tw.aaAt: light mounts at given places [{ k (AA_TYPES key), x, y, z, yaw? }] (found on the free deck of the drawn model by tools/refs/freespots.mjs): the ones a model lacks to make up the real count
  for (const a of tw.aaAt || []) {
    const ty = AA_TYPES[a.k];
    model.aaMounts.push({ gun: ty.g, variant: ty.v, cal: ty.cal, n: ty.n, bore: ty.bore, x: a.x, y: a.y, z: a.z, rad: a.look ? 1.8 : ty.n >= 3 ? 1.1 : 0.7, yaw0: a.yaw ?? (a.z >= 0 ? Math.PI / 2 : -Math.PI / 2), label: ty.label, placed: true, look: a.look });      // a.look: 'ship/kind', the mount of a model drawn there
    model.aa.push([a.x, a.y + 1.2, a.z]);
    note(a.y + 3);
  }
  const claimed = new Set();
  for (const pl of elPl.filter((q) => !AA_TYPES[q.type])) {
    let best = null, bd = 80;
    for (const r of model.mounts) {
      if (claimed.has(r) || Math.abs(r.cal - pl.cal) > 6 || (pl.mgroup && r.group !== pl.mgroup)) continue;
      const d = Math.hypot(r.x - pl.x, r.z - pl.z);
      if (d < bd) { best = r; bd = d; }
    }
    if (!best) continue;
    claimed.add(best);
    // the hit volume of the barbette or house the record had (built before the mount was moved) goes with it: what is centred on the old pivot, a few metres across, just under or round it
    const ox = best.x, oy = best.y, oz = best.z;
    for (const q of b.solids) {
      if (q.part || q.strut || Math.abs((q[0] + q[1]) / 2 - ox) > 0.5 || Math.abs((q[4] + q[5]) / 2 - oz) > 0.5 || q[1] - q[0] > 8 || q[5] - q[4] > 8 || q[2] < oy - 2.5 || q[3] > oy + 3.5 || q[3] < oy - 1.5) continue;
      q[0] += pl.x - ox; q[1] += pl.x - ox; q[2] += pl.y - oy; q[3] += pl.y - oy; q[4] += pl.z - oz; q[5] += pl.z - oz;
      if (q.poly) for (const v of q.poly) { v[0] += pl.x - ox; v[1] += pl.z - oz; }
    }
    best.x = pl.x; best.y = pl.y; best.z = pl.z; best.look = `${baseId}/${pl.kind}`;
    const ya = pl.yaw * Math.PI / 180;
    best.arcC = Math.atan2(Math.sin(ya), Math.cos(ya));                         // at rest it points the way the model has it (the arc is centred there)
  }
  // tw.mountAt: [{ group, cal, x, y, z, yaw (deg), kind }]: a gun the sheet has and the model has no copy of goes to a place on the free deck (a record no copy claimed), drawn as the model's mount of that kind
  for (const ma of tw.mountAt || []) {
    const r = model.mounts.find((q) => !claimed.has(q) && Math.abs(q.cal - ma.cal) <= 6 && (!ma.group || q.group === ma.group));
    if (!r) continue;
    claimed.add(r);
    const ox = r.x, oy = r.y, oz = r.z;
    for (const q of b.solids) {
      if (q.part || q.strut || Math.abs((q[0] + q[1]) / 2 - ox) > 0.5 || Math.abs((q[4] + q[5]) / 2 - oz) > 0.5 || q[1] - q[0] > 8 || q[5] - q[4] > 8 || q[2] < oy - 2.5 || q[3] > oy + 3.5 || q[3] < oy - 1.5) continue;
      q[0] += ma.x - ox; q[1] += ma.x - ox; q[2] += ma.y - oy; q[3] += ma.y - oy; q[4] += ma.z - oz; q[5] += ma.z - oz;
      if (q.poly) for (const v of q.poly) { v[0] += ma.x - ox; v[1] += ma.z - oz; }
    }
    r.x = ma.x; r.y = ma.y; r.z = ma.z; r.look = `${baseId}/${ma.kind}`;
    const ya = (ma.yaw || 0) * Math.PI / 180;
    r.arcC = Math.atan2(Math.sin(ya), Math.cos(ya));
  }
  // measured boats (tw.boats: [{ f0, f1, z (a boat off the centreline has its twin on the other side), y (above the deck), cabin, davits }])
  for (const bt of tw.boats || []) {
    for (const sg of bt.z && !bt.one ? [1, -1] : [1]) {
      const x0 = X(bt.f0), x1 = X(bt.f1), xm = (x0 + x1) / 2;
      DT.launch(b, { x: xm, y: (carrier ? fdY : Y(xm)) + bt.y, z: sg * Math.abs(bt.z || 0), yaw: 0, len: Math.abs(x0 - x1), cabin: bt.cabin, davits: bt.davits }, pal);
      note(Y(xm) + bt.y + 2);
    }
  }
  if (!carrier && !bare) {
    PT.forecastle(b, hull, X(0.04), pal);
    if (!tw.noFittings) {      // tw.noFittings: no randomly spread clutter, rafts and ventilators (a ship whose deck is measured)
      PT.deckClutter(b, hull, X(0.05), X(0.30), Math.round(L / 20), rnd, pal);
      PT.deckClutter(b, hull, X(0.64), X(0.96), Math.round(L / 18), rnd, pal);
    }
    // fine detail, drawn only when the ship is close
    const rf = makeRng(hashStr(spec.id + ':fine'));
    b.group('fine', () => {
      for (const [x, y, z, hx, hz] of fineRails) DT.roofRail(b, x, y, z, hx, hz, shade(rgb(pal.sup), 0.8));
      DT.lifelines(b, hull, X(0.975), X(0.025), pal);
      DT.rubbingStrake(b, hull, X(0.9), X(0.08), 1.7, pal);
      DT.anchorAndHawse(b, hull, X(0.05), Math.max(Y(X(0.05)) * 0.58, 2.4), pal);
      DT.mooring(b, hull, X(0.07), X(0.17), pal, 3);
      DT.mooring(b, hull, X(0.85), X(0.96), pal, 3);
      if (t === 'DD') DT.depthCharges(b, hull, X(0.93), pal);
      const nb = tw.boats ? 0 : L > 150 ? 2 : 1;
      // nothing of the clutter stands on a gun: a boat slides along the deck to the nearest free spot, rafts and ventilators are left out where a mount is
      const nearGun = (x, z, rx, rz) => model.mounts.some((m) => { if (!(m.y > Y(m.x) - 1)) return false; const q = houseRect(model, m); return x + rx > q.x0 - 0.5 && x - rx < q.x1 + 0.5 && z + rz > q.z0 - 0.5 && z - rz < q.z1 + 0.5; }) || model.aaMounts.some((m) => Math.abs(m.x - x) < rx + 0.8 && Math.abs(m.z - z) < rz + 0.8 && m.y > Y(m.x) - 1);
      for (let i = 0; i < nb; i++) for (const sg of [-1, 1]) {
        const len = L > 150 ? 10.5 : 7.5, z = sg * (model.house ? model.house.hw * 0.74 : hull.halfBeamDeck(X(0.46)) * 0.66);
        let x = X(0.46 + i * 0.075);
        for (const d of [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06, 0.09, -0.09]) { x = X(0.46 + i * 0.075 + d); if (!nearGun(x, z, len / 2 + 0.6, 2.2) && !nearGun(x, sg * (Math.abs(z) + 1), len / 2 + 0.6, 1)) break; }
        const onH = model.house && x < model.house.x1 && x > model.house.x0;
        const hy = Y(x) + (onH ? houseH : 0);
        DT.launch(b, { x, y: hy + 0.55, z, yaw: 0, len, cabin: i === 0, davits: true }, pal);
      }
      // life rafts stacked along the deckhouse sides and on the quarterdeck
      const nr = tw.noFittings ? 0 : Math.round(clamp(L / 20, 5, 14));
      for (let i = 0; i < nr; i++) {
        const f = i % 2 ? 0.66 + 0.2 * rf() : 0.28 + 0.2 * rf();
        const x = X(f), sg = rf() < 0.5 ? -1 : 1;
        const onH = model.house && x < model.house.x1 && x > model.house.x0;
        const z = sg * Math.max(1.2, (onH ? model.house.hw : hull.halfBeamDeck(x) * 0.8) - 1.0);
        if (nearGun(x, z, 1.8, 1.8)) continue;
        DT.raft(b, x, Y(x) + (onH ? houseH : 0) + 0.15, z, rf() * 3.14, pal);
      }
      // ventilators
      const nv = tw.noFittings ? 0 : Math.round(clamp(L / 14, 6, 18));
      for (let i = 0; i < nv; i++) {
        const f = rf() < 0.5 ? 0.12 + 0.2 * rf() : 0.62 + 0.3 * rf();
        const x = X(f), onH = model.house && x < model.house.x1 && x > model.house.x0;
        const hb = onH ? model.house.hw : hull.halfBeamDeck(x);
        const vz = (rf() * 2 - 1) * hb * 0.7, va = rf() * 6.28, vs = 0.8 + rf() * 0.5;
        if (nearGun(x, vz, 1.2, 1.2)) continue;
        DT.vent(b, x, Y(x) + (onH ? houseH : 0), vz, va, pal, vs);
      }
    });
    PT.pennant(b, X(0.985), Y(X(0.985)) + 0.8, 0, 3.5, 0, '#ffffff');
    PT.ensign(b, { x: X(0.985), y: Y(X(0.985)) + 4.4, z: 0, len: clamp(L * 0.016, 1.6, 4.4), staff: true });
  }
  {
    const num = hullNumber(spec);
    if (num) {
      const nx = X(carrier ? 0.1 : 0.14), nh = clamp(L * 0.011, 1.2, 3.1);
      PT.hullNumber(b, hull, num, { x: nx, y: Math.max(Y(nx) * 0.56 + 0.3, nh), h: nh });
    }
  }

  // the light AA that is not measured goes in last, in the spots the boats, rafts and ventilators have left free
  const aaTotal = tw.aa ? 0 : tw.aaCount ?? clamp(Math.round(L / (carrier ? 8 : 9)), 6, 40);
  const zoneA = Math.max(0.06, towerF - 0.05), zoneB = Math.min(0.9, (fF.length ? Math.max(...fF) : 0.55) + 0.08);
  // a light mount stands clear of everything that rises above its deck: a spot against a tower, a funnel or a turret is drawn again
  const crowded = (x, y, z) => { for (const s of b.solids) if (!(carrier && s[2] > fdY - 1.3) && s[3] > y + 0.35 && s[2] < y + 2.6 && x > s[0] - 1.1 && x < s[1] + 1.1 && z > s[4] - 1.1 && z < s[5] + 1.1) return true; return false; };
  const crowdedByGuns = (x, y, z) => model.mounts.some((m) => Math.abs(m.x - x) < 3.2 + m.cal / 120 && Math.abs(m.z - z) < 3.2 + m.cal / 120 && y < m.y + 3 && y > m.y - 5);
  for (let i = 0; i < aaTotal; i++) {
    let spot = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      // most light AA clusters around the superstructure and funnels, the rest on the open decks
      const f = !carrier && rnd() < 0.65 ? zoneA + (zoneB - zoneA) * rnd() : 0.10 + 0.82 * rnd();
      const x = X(f);
      const sg = rnd() < 0.5 ? -1 : 1;
      let y = Y(x), z = sg * hull.halfBeamDeck(x) * (0.55 + 0.35 * rnd());
      if (model.house && x < model.house.x1 && x > model.house.x0 && !carrier) { y += houseH; z = sg * model.house.hw * (0.5 + 0.4 * rnd()); }
      if (carrier) { y = fdY - 2.4; z = sg * (Math.min(fdHw0, hull.halfBeamDeck(x) + 3.5) + 1.0); }
      // and with a free field of fire outboard (the guns that stand against a wall have none)
      const yaw = sg * Math.PI / 2;
      if (!carrier && supportBelow(x, z, y) < y - 0.6) continue;     // it stands on a deck or a roof, not beyond the edge of one
      if (!crowded(x, y, z) && !crowdedByGuns(x, y, z) && !aaTaken(x, y, z, 1.1) && ![-1, -0.5, 0, 0.5, 1].some((d) => [0.1, 0.45].some((e) => barrelBlocked(b.solids, x, y, z, yaw + d, e, 3.2)))) spot = { x, y, z, sg };
    }
    if (!spot) continue;
    const { x, y, z, sg } = spot;
    // a carrier's light guns stand on sponsons along the edge of the flight deck
    if (carrier) b.block({ x0: x - 1.6, x1: x + 1.6, hw: 1.5, zc: z, y0: y - 0.9, y1: y, tx0: x - 1.3, tx1: x + 1.3, thw: 1.2 }, shade(rgb(pal.hull), 1.1), MAT.HULL);
    const pick = AA_KINDS[spec.nation] || AA_KINDS.USA;
    let rr = rnd() * (L > 150 ? 1 : 0.8), kd = pick[pick.length - 1];
    for (const k of pick) { rr -= k.w; if (rr <= 0) { kd = k; break; } }
    model.aaMounts.push({ gun: kd.g, variant: kd.v, cal: kd.cal, n: kd.n, bore: kd.bore, x, y, z, rad: kd.n >= 3 ? 1.1 : 0.7, yaw0: sg * Math.PI / 2 + (rnd() - 0.5) * 0.4, label: kd.label });
    model.aa.push([x, y + 1.2, z]);
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
  // machinery spaces (spec.machinery.rooms: [kind 'boiler' | 'engine', f0, f1, z, width], from the published arrangements)
  if (spec.machinery?.rooms) model.machinery = spec.machinery.rooms.map(([k, f0, f1, z = 0, w = 0]) => ({ k, x: (X(f0) + X(f1)) / 2, hx: Math.abs(X(f0) - X(f1)) / 2, z, hz: w ? w / 2 : 0 }));
  model.topY = topY;
  model.radius = Math.hypot(L / 2, topY);
  if (model.bridge) bridgeEye(model, b.solids, L);
  // a gun house that is sunk in a deckhouse slides a few tenths of a metre along its deck before the arcs are worked out
  clearHouses(model, b.solids, hull, supportBelow, { carrier });
  computeClearance(model, b.solids, hull, { bothBeams: !!tw.own });
  if (tw.dropTubesWhere) model.tubes = model.tubes.filter((t) => !tw.dropTubesWhere(t));      // tw.dropTubesWhere: the launchers (records with x, z...) this fit has landed
  if (tw.noTubes) model.tubes.length = 0;      // tw.noTubes: the fit of this variant has no torpedo tubes (the model's own tubes are not drawn either: tw.v4Drop)
  if (tw.ownTubes) computeTubeArcs(model, b.solids, !!(spec.torpedoes && spec.torpedoes.bow));      // the ships drawn from a reference model: the launchers' sectors from what stands round them (the others fire 20-160 degrees off the bow on either beam)
  model.solids = b.solids;                 // kept for the audit (tools/audit.mjs)
  b.solids = null;
  const built = b.build(boat ? { aoOpts: { cell: tw.aoCell ?? 0.25, reach: 2.5 } } : undefined);       // (a boat: the occlusion on a grid of 25 cm, the usual 90 cm is the size of its wheelhouse)
  model.mesh = built;
  for (const sp of model.spinners) sp.mesh = built.groups[sp.id];
  for (const p of model.parts) { p.mesh = built.groups[p.id]; p.ruin = p.hasRuin ? built.groups[p.id + '_ruin'] : null; p.fineMesh = p.hasFine ? built.groups[p.id + '_fine'] : null; }
  model.fine = built.groups.fine || null;
  if (tw.v4) applyV4(model, tw.v4, pal, tw.v4Drop, tw.v4Clean);                      // tw.v4: the ship's hull, structure and parts from the groups of its reference model (v4ship.js)
  return model;
}

// ---------------------------------------------------------------------------------------------
function buildCarrier(b, model, spec, hull, pal, tw, X, Y, fdY, rnd, note, part) {
  const L = spec.loa;
  const fdL = spec.flightDeckLength || L * 0.97;
  const fdW = spec.flightDeckWidth || spec.beam;
  // tw.fdPlan: the measured outline of the flight deck, [[fraction from the bow, half-width (m)], ...] from the bow end to the stern end
  const fp = tw.fdPlan;
  const x1 = fp ? Math.max(...fp.map((q) => X(q[0]))) : L / 2 + (tw.fdBowOver ?? 3) - (L - fdL) * 0.3, x0 = fp ? Math.min(...fp.map((q) => X(q[0]))) : x1 - fdL;
  const hw = fp ? Math.max(...fp.map((q) => q[1])) : fdW / 2;
  const col = rgb(tw.flightDeckCol || spec.paint?.deck || '#3b3a37');   // flight deck stain, linoleum, planking: the colour of the spec sheet
  const sil = spec.silhouette || {};
  const isl = sil.island || { side: 'starboard', fractionFromBow: 0.5, lengthM: 40, heightAboveDeckM: 15 };
  const sg = isl.side === 'port' ? -1 : 1;
  // slab: chamfered bow, squarer stern
  const poly = fp ? [...fp.map(([f, w]) => [X(f), -w]), ...fp.slice().reverse().map(([f, w]) => [X(f), w])]
    : [[x1, -hw * 0.7], [x1 - hw * 0.35, -hw], [x0 + hw * 0.4, -hw], [x0, -hw * 0.82], [x0, hw * 0.82], [x0 + hw * 0.4, hw], [x1 - hw * 0.35, hw], [x1, hw * 0.7]];
  b.prism(poly, fdY - 1.1, fdY, col, MAT.FLIGHT, { sideCol: rgb(pal.hull), topCol: col, topMat: MAT.FLIGHT, bottom: true });
  // support gallery under the overhang
  if (!tw.noGallery) b.block({ x0: x0 + 5, x1: x1 - 12, hw: hw * 0.92, y0: fdY - 2.3, y1: fdY - 1.1, tx0: x0 + 6, tx1: x1 - 14, thw: hw * 0.98 }, shade(rgb(pal.hull), 0.8), MAT.HULL);
  // markings: centre line, edge lines, landing area lines
  const mk = rgb('#cfcdc4');
  b.decal((x0 + x1) / 2, fdY + 0.01, 0, fdL * 0.46, 0.18, mk, MAT.HULL);
  for (const s2 of [-1, 1]) b.decal((x0 + x1) / 2 - fdL * 0.02, fdY + 0.01, s2 * (hw - 1.0), fdL * 0.47, 0.12, mk, MAT.HULL);
  model.wires = [];
  for (let i = 0; i < 8; i++) { b.decal(x0 + 12 + i * 3.2, fdY + 0.012, 0, 0.05, hw * 0.55, shade(mk, 0.4), MAT.HULL); model.wires.push(x0 + 12 + i * 3.2); }   // arrester wires
  // elevators
  const els = (sil.flightDeckNotes ? null : null) || tw.elevators || [0.28, 0.6, 0.83];
  model.elevators = [];       // the lifts as the deck operations use them: centre, half-length, half-width (the sim moves a platform and the aircraft on it)
  for (const [i, f] of els.entries()) {
    const x = X(f);
    if (i === els.length - 1 && tw.deckEdge) { const ed = tw.edgeLift || { z: -hw + 5, hl: 8, hw: 7.5 }; b.decal(x, fdY + 0.015, ed.z, ed.hl, ed.hw, rgb('#524f49'), MAT.HULL); model.elevators.push({ x, z: ed.z, hl: ed.hl, hw: ed.hw, edge: true }); continue; }      // tw.edgeLift: the measured deck-edge lift { z, hl, hw }
    const es = Array.isArray(tw.elevSize?.[0]) ? tw.elevSize[i] : tw.elevSize || [8.5, hw * 0.34];      // measured half-length and half-width of the lifts (one pair for all, or one pair each)
    const ez = Array.isArray(tw.elevZ) ? tw.elevZ[i] : tw.elevZ ?? 0;      // (one offset from the centre line for all the lifts, or one each)
    b.decal(x, fdY + 0.015, ez, es[0], es[1], rgb('#55524c'), MAT.HULL);
    model.elevators.push({ x, z: ez, hl: es[0], hw: es[1], edge: false });
  }
  // island
  const ix = X(isl.fractionFromBow);
  const il = clamp(isl.lengthM || 40, 18, 60), ih = isl.heightAboveDeckM || 15;
  // tw.island: measured { z (off the centreline), hw (half-width), funnelTop, mastF, mastTop (m above the flight deck) }
  const ti = tw.island || {};
  const iz = sg * (ti.z ?? hw - 5.5), ihw = ti.hw ?? 3.4;
  const dark = shade(rgb(pal.dark), 1.1);
  part('tower', 'bridge', 'Îlot', () => {
    if (ti.blocks) {
      // measured blocks: { f: [from, to], z, hw, y: [from, to] (m above the flight deck), windows }
      for (const k of ti.blocks) {
        const xa = X(k.f[1]), xf = X(k.f[0]);
        b.block({ x0: xa, x1: xf, hw: k.hw, zc: sg * (k.z ?? ti.z), y0: fdY + k.y[0], y1: fdY + k.y[1], tx1: xf - (k.rake || 0), thw: k.hw * (k.taper ?? 1) }, rgb(pal.sup), MAT.HULL);
        if (k.windows) b.block({ x0: xa + 1, x1: xf + 0.07 - (k.rake || 0) * 0.4, hw: k.hw * 0.9, zc: sg * (k.z ?? ti.z), y0: fdY + k.y[0] + (k.y[1] - k.y[0]) * 0.45, y1: fdY + k.y[0] + (k.y[1] - k.y[0]) * 0.7 }, rgb(pal.glass), MAT.GLASS);
      }
      return;
    }
    b.block({ x0: ix - il / 2, x1: ix + il / 2, hw: ihw, zc: iz, y0: fdY, y1: fdY + ih * 0.55, tx1: ix + il / 2 - 2, thw: ihw * 0.91 }, rgb(pal.sup), MAT.HULL);
    b.block({ x0: ix - il * 0.28, x1: ix + il * 0.26, hw: ihw * 0.88, zc: iz, y0: fdY + ih * 0.55, y1: fdY + ih * 0.85, tx1: ix + il * 0.26 - 2 }, rgb(pal.sup), MAT.HULL);
    b.block({ x0: ix - il * 0.1, x1: ix + il * 0.22, hw: ihw * 0.76, zc: iz, y0: fdY + ih * 0.85, y1: fdY + ih, tx1: ix + il * 0.22 - 1.5 }, rgb(pal.sup), MAT.HULL);
    // window bands, each along the face of its own tier
    for (const [y, h, xf, w] of [[0.2, 2.2, ix + il / 2 - 0.4, ihw * 0.92], [0.62, 1.6, ix + il * 0.26 - 0.6, ihw * 0.82]]) b.block({ x0: ix + il * 0.1 - 6, x1: xf, hw: w, zc: iz, y0: fdY + ih * y, y1: fdY + ih * y + h * 0.5 }, rgb(pal.glass), MAT.GLASS);
  }, () => b.block({ x0: ix - il / 2, x1: ix + il / 2, hw: ihw, zc: iz, y0: fdY, y1: fdY + ih * 0.3, tx1: ix + il / 2 - 3, thw: ihw * 0.76 }, dark, MAT.DARK));
  // funnel(s) integrated in the island
  const fun = sil.funnels || { count: 1, fractionFromBow: [isl.fractionFromBow - 0.01], heightAboveDeckM: ih * 0.8 };
  const fPos = (fun.fractionFromBow && fun.fractionFromBow.length ? fun.fractionFromBow : [isl.fractionFromBow - 0.015]).slice(0, Math.max(1, fun.count || 1));
  fPos.forEach((f, i) => {
    const x = X(f);
    if (tw.noFunnels) return;
    const fh = ti.funnelTop != null ? ti.funnelTop - ih * 0.3 : Math.max(ih * 0.8, 8);
    const fo = { x, y0: fdY + ih * 0.3, h: fh, lx: ti.funnelLx ?? il * 0.34, lz: ti.funnelLz ?? 4.2, rake: 1.2, z: iz };
    part('funnel' + i, 'funnel', 'Cheminée ' + (i + 1), () => PT.funnel(b, fo, pal), () => PT.funnelRuin(b, fo, pal));
    model.smoke.push([x - 1, fdY + ih * 0.3 + fh, iz]);
  });
  // mast / radar on the island
  // ti.mastY0 (the foot of the mast above the flight deck, default the island top), ti.radarF / radarY, ti.dirF / dirY (above the flight deck)
  const my0 = ti.mastY0 ?? ih, imx = ti.mastF != null ? X(ti.mastF) : ix + il * 0.1, imh = ti.mastTop != null ? ti.mastTop - my0 : 14;
  part('mast0', 'mast', 'Mât de l\'îlot', () => { PT.poleMast(b, { x: imx, y0: fdY + my0, h: imh, z: iz, r: 0.3, yards: [[0.6, 7]] }, pal); PT.ensign(b, { x: imx - 0.5, y: fdY + my0 + imh * 0.75, z: iz, len: clamp(L * 0.02, 3, 6) }); }, () => b.cylinder(imx, fdY + my0, iz, 0.4, 0.25, fdY + my0 + 2.5, dark, MAT.DARK, { seg: 6 }));
  const rdx = ti.radarF != null ? X(ti.radarF) : imx;
  const rco = { x: rdx, y: fdY + (ti.radarY ?? my0 + imh * 0.57), z: iz, kind: ti.radarKind || (['USA', 'UK'].includes(spec.nation) ? 'bedspring' : 'box'), w: 6 };
  part('radar0', 'radar', 'Radar de veille', () => PT.radar(b, rco, pal), undefined, { spin: radarSpin(rco) });
  const dgx = ti.dirF != null ? X(ti.dirF) : ix + il * 0.2, dgy = ti.dirY ?? ih;
  part('director0', 'director', 'Directeur de tir', () => PT.director(b, { x: dgx, y: fdY + dgy, z: iz, w: 3.4, l: 3.2, h: 2.2, kind: spec.nation === 'Japan' ? 'drum' : 'box' }, pal), () => b.cylinder(dgx, fdY + dgy, iz, 0.5, 0.4, fdY + dgy + 0.7, dark, MAT.DARK, { seg: 6 }), dirTrack({ x: dgx, y: fdY + dgy, z: iz }));
  note(fdY + my0 + imh + 2);
  model.island = { x: ix, z: iz, y: fdY + ih };
  // the bridge camera looks out of the front of the island, over the flight deck
  {
    const cands = [];
    for (const off of [0.6, 2, 4]) for (const f of [0.5, 0.65, 0.8]) for (const dz of [0, 2.5, -2.5]) cands.push([ix + il / 2 + off, fdY + ih * f, iz + dz]);
    model.bridge = { x: ix + il / 2 + 0.6, y: fdY + ih * 0.7, z: iz, towerX: ix, cands };
  }
  model.superBox = { x0: ix - il / 2, x1: ix + il / 2, hw: ihw, zc: iz, y1: fdY + ih };
  model.deckPoints = { x0, x1, hw, y: fdY };
  model.fdY = fdY;
  // carrier AA / DP guns in sponsons along both sides of the flight deck
  const mc = spec.main;
  const total = mc.gunsTotal || 8;
  const per = Math.max(1, Math.round(total / mc.mounts.length));
  // distribute mounts using spec fractions
  mc.mounts.forEach((m, i) => {
    const x = X(m.fractionFromBow);
    const sgm = (m.side === 'port' ? -1 : m.side === 'starboard' ? 1 : /^P/.test(m.label || '') ? -1 : /^S/.test(m.label || '') ? 1 : (i % 2 ? -1 : 1));   // the label (S-fwd-1, P-aft-2) says the side when the sheet does not
    // m.offsetM / m.fdHeightM: a measured mount on the flight deck (Essex: the twin 5in pairs fore and aft of the island)
    const onFD = m.fdHeightM != null;
    const z = onFD ? sgm * m.offsetM : sgm * (m.sponsonZ ?? hull.halfBeamDeck(x) + (tw.sponsonOut ?? 1.5));      // m.sponsonZ: the measured offset of the sponson from the centre line
    const y = onFD ? fdY + m.fdHeightM : fdY - 3.2;
    if (!onFD) b.block({ x0: x - 2.6, x1: x + 2.6, hw: 2.2, zc: z, y0: y - 1.2, y1: y, tx0: x - 2.0, tx1: x + 2.0, thw: 1.8 }, shade(rgb(pal.hull), 1.1), MAT.HULL);
    else if (m.fdHeightM > 0.2) b.cylinder(x, fdY, z, 2.0, 2.0, y, shade(rgb(pal.sup), 0.95), MAT.HULL, { seg: 16 });
    const variant = tw.mainVariant && typeof tw.mainVariant === 'object' ? tw.mainVariant[m.guns] : tw.mainVariant;
    // the mounts on the flight deck fire ahead (or astern) and across the deck to either side; the sponson mounts cover their own side
    const arcC = onFD ? (x > model.island.x ? 0 : Math.PI) : sgm * 90 * D2R, arcH = onFD ? 155 * D2R : 110 * D2R;
    model.mounts.push({ group: 'main', kind: m.guns === 1 && variant === 'mk30' ? 'shield' : 'dp', cal: mc.caliberMm, n: m.guns, bore: mc.boreCalibers, x, z, y: y + 0.1, arcC, arcH, label: m.label || ('S' + i), variant });
  });
  // parked aircraft on the aft part of the deck, wings folded: three staggered rows across the deck (drawn as separate instances, fewer as the air group takes off)
  const nPlanes = Math.min(16, (spec.aircraft && spec.aircraft.capacity ? Math.round(spec.aircraft.capacity * 0.17) : 8));
  for (let i = 0; i < nPlanes; i++) {
    const row = i % 3, col = Math.floor(i / 3);
    const x = x0 + 13 + col * 13 + (row === 1 ? 5 : 0);
    const z = -sg * (hw - 5.2 - row * 8.4);
    model.deckSlots.push({ x, y: fdY + 0.04, z, yaw: 0 });
  }
  PT.deckRails(b, hull, x0 + 2, x1 - 4, 0.8, pal, 8);
  // fine detail: catwalk nets along the deck edge, hangar openings on open-hangar carriers, anchors, boats and rafts
  const rf = makeRng(hashStr(spec.id + ':fine'));
  b.group('fine', () => {
    DT.deckNets(b, x0, x1, hw, fdY, pal);
    if (['USA', 'Japan', 'France'].includes(spec.nation) && !tw.closedHangar) DT.hangarOpenings(b, hull, X(0.64), X(0.16), fdY - 6.6, fdY - 3.7, pal);
    DT.anchorAndHawse(b, hull, X(0.06), Math.max(fdY * 0.42, 3), pal);
    for (const sgn of [-1, 1]) {
      const bx = X(0.58 + 0.05 * sgn * 0);
      DT.launch(b, { x: bx, y: fdY - 5.2, z: sgn * (hull.halfBeamDeck(bx) + 0.9), yaw: 0, len: 9.5, cabin: sgn > 0, davits: false }, pal);
    }
    for (let i = 0; i < 8; i++) {
      const x = X(0.15 + rf() * 0.7), sgn = rf() < 0.5 ? -1 : 1;
      DT.raft(b, x, fdY - 2.15, sgn * (hull.halfBeamDeck(x) + 1.2), rf() * 3.14, pal);
    }
  });
}
