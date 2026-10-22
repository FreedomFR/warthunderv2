// Little silhouettes drawn from the spec sheets: the side profile of a ship (hull length, funnels, masts, turrets, island, flight deck at
// their measured positions, in the paint colours of the class) and the top view of an aircraft. All ships share one scale, so a destroyer
// really looks half as long as a battleship. Heights are exaggerated a little to stay readable at icon size.
const NS = 'http://www.w3.org/2000/svg';
const VX = 1.5;                       // vertical exaggeration
const f1 = (n) => Math.round(n * 10) / 10;

/** Width of a ship's icon as a fraction of the picture (common scale, softened so that destroyers stay readable). */
export const iconScale = (spec) => 0.42 + 0.58 * Math.min(1, spec.loa / 272);

/**
 * The picture of a ship for the wiki: the side view of its 3D model (wiki/ships/<id>.webp, made by tools/wikishots.mjs, one scale for all ships), or, when the file is
 * missing, the silhouette drawn from the spec sheet. A DOM element (the wiki runs in a browser).
 */
export function shipPicture(spec, opts = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'ship-pic';
  const img = new Image();
  img.alt = `${spec.className || spec.id}, vue de côté`;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  img.style.width = opts.full ? '100%' : `${f1(iconScale(spec) * 100)}%`;
  img.onerror = () => { wrap.innerHTML = shipProfile(spec, opts); };
  img.src = `wiki/ships/${spec.id}.webp`;
  wrap.append(img);
  return wrap;
}

/**
 * The picture of an aircraft for the wiki: its 3D model seen from the front, to the right and a little above (wiki/aircraft/<key>.webp, made by tools/wikiplanes.mjs), or, when
 * the file is missing, the top view drawn from the spec sheet. A DOM element.
 */
export function aircraftPicture(a) {
  const wrap = document.createElement('span');
  wrap.className = 'plane-pic';
  const img = new Image();
  img.alt = `${a.name}, vue 3D`;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  img.onerror = () => { wrap.innerHTML = aircraftTop(a.spec); };
  img.src = `wiki/aircraft/${a.key.replace(':', '_')}.webp`;
  wrap.append(img);
  return wrap;
}

/** SVG markup of the side profile (bow to the right). `opts.full`: fill the width of the picture (the big profile of a card). */
export function shipProfile(spec, opts = {}) {
  const L = spec.loa, cv = spec.type === 'CV';
  const sil = spec.silhouette || {};
  const hullH = cv ? 0.06 * L : Math.max(5, Math.min(14, 0.045 * L));
  const baseTop = cv ? hullH + 3 : hullH;
  const tops = [hullH + 6, ...((sil.masts || []).map((m) => m.heightAboveWaterM)), sil.funnels ? baseTop + sil.funnels.heightAboveDeckM : 0, sil.island ? baseTop + sil.island.heightAboveDeckM : 0];
  const top = Math.max(...tops) * VX + 4;
  const W = L + 12, H = f1(top + 6), wl = f1(top);
  const x0 = 6;
  const y = (m) => f1(wl - m * VX);                  // metres above the water -> svg y
  const X = (frac) => f1(x0 + (1 - frac) * L);       // fractionFromBow -> svg x
  const paint = spec.paint || {};
  const hullC = lighten(paint.hull || '#44505e', 0.3), boot = paint.boot || '#222', deckC = lighten(paint.deck || '#445', 0.2), supC = lighten(paint.superstructure || '#8d9aa4', 0.1), line = 'rgba(255,255,255,.4)';
  const out = [];

  // hull: sheer rises towards the bow, raked stem, short transom
  const deckAt = (t) => hullH * (0.9 + 0.35 * t * t * t);      // t: 0 stern .. 1 bow
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([f1(x0 + t * L * 0.985), y(deckAt(t))]); }
  const hull = `M${x0},${y(0.6)} L${pts.map((p) => p.join(',')).join(' L')} L${f1(x0 + L)},${y(deckAt(1) * 1.02)} L${f1(x0 + L * 0.975)},${y(0)} L${f1(x0 + L * 0.03)},${y(0)} Z`;
  out.push(`<path d="${hull}" fill="${hullC}" stroke="${line}"/>`);
  out.push(`<path d="M${f1(x0 + L * 0.03)},${y(0)} L${f1(x0 + L * 0.975)},${y(0)} L${f1(x0 + L * 0.972)},${y(1.6)} L${f1(x0 + L * 0.02)},${y(1.6)} Z" fill="${boot}" opacity=".85"/>`);

  if (cv) {
    const fd = spec.flightDeckLength || L * 0.9;
    const xb = x0 + L * 0.995, xs = xb - fd;
    out.push(`<rect x="${f1(xs)}" y="${y(baseTop)}" width="${f1(fd)}" height="${f1(2.4 * VX)}" fill="${deckC}" stroke="${line}"/>`);
    const isl = sil.island;
    if (isl) {
      const cx = X(isl.fractionFromBow), ih = Math.max(6, isl.heightAboveDeckM);
      out.push(`<rect x="${f1(cx - isl.lengthM / 2)}" y="${y(baseTop + ih)}" width="${f1(isl.lengthM)}" height="${f1(ih * VX)}" fill="${supC}" stroke="${line}"/>`);
    }
    drawFunnels(out, spec, X, y, baseTop, supC, line, L);
    drawMasts(out, spec, X, y, baseTop, line);
  } else {
    // forward / main superstructure block around the first mast
    const masts = sil.masts || [];
    if (masts[0]) {
      const mh = masts[0].heightAboveWaterM, bw = Math.max(8, Math.min(24, L * 0.075)), bx = X(masts[0].fractionFromBow);
      const bh = Math.max(5, (mh - hullH) * 0.5);
      out.push(`<rect x="${f1(bx - bw * 0.6)}" y="${y(hullH + bh)}" width="${f1(bw)}" height="${f1(bh * VX)}" fill="${supC}" stroke="${line}"/>`);
      out.push(`<rect x="${f1(bx - bw * 0.35)}" y="${y(hullH + bh * 1.45)}" width="${f1(bw * 0.6)}" height="${f1(bh * 0.45 * VX)}" fill="${supC}" stroke="${line}"/>`);
    }
    drawFunnels(out, spec, X, y, hullH, supC, line, L);
    drawMasts(out, spec, X, y, hullH, line);
    // gun mounts
    const tw = Math.max(3.5, Math.min(13, L * 0.032));
    for (const m of spec.main.mounts) {
      const lift = m.level ? 3.6 : 0, tx = X(m.fractionFromBow), base = deckAt(1 - m.fractionFromBow);
      const hw = m.guns >= 3 ? tw * 1.15 : tw * 0.8;
      out.push(`<rect x="${f1(tx - hw / 2)}" y="${y(base + lift + 3.4)}" width="${f1(hw)}" height="${f1(3.4 * VX)}" fill="${supC}" stroke="${line}"/>`);
      const dirR = m.fractionFromBow < 0.5;           // forward mounts point to the bow (right), aft ones to the stern
      const bl = Math.max(3, tw * 0.9);
      out.push(`<line x1="${f1(tx + (dirR ? hw / 2 : -hw / 2))}" y1="${y(base + lift + 2.4)}" x2="${f1(tx + (dirR ? hw / 2 + bl : -hw / 2 - bl))}" y2="${y(base + lift + 2.8 + bl * 0.15)}" stroke="rgba(255,255,255,.7)" stroke-width="1.6"/>`);
    }
  }
  const style = opts.full ? 'width:100%' : `width:${f1(iconScale(spec) * 100)}%`;
  return `<svg xmlns="${NS}" viewBox="0 0 ${f1(W)} ${H}" class="prof" style="${style}" role="img" aria-label="Silhouette de profil">${out.join('')}<line x1="0" y1="${wl}" x2="${f1(W)}" y2="${wl}" stroke="#7fb4d9" stroke-opacity=".6" stroke-width="1.5"/></svg>`;
}

function drawFunnels(out, spec, X, y, base, c, line, L) {
  const fun = spec.silhouette && spec.silhouette.funnels;
  if (!fun) return;
  const w = Math.max(3.5, Math.min(11, L * 0.03));
  for (const fr of fun.fractionFromBow) {
    const x = X(fr), h = fun.heightAboveDeckM;
    out.push(`<rect x="${f1(x - w / 2)}" y="${y(base + h)}" width="${f1(w)}" height="${f1(h * VX)}" fill="${darken(c, 0.15)}" stroke="${line}" stroke-width="1"/>`);
    out.push(`<rect x="${f1(x - w / 2)}" y="${y(base + h)}" width="${f1(w)}" height="${f1(Math.min(3, h * 0.2) * VX)}" fill="#14181d"/>`);
  }
}

function drawMasts(out, spec, X, y, base, line) {
  for (const m of (spec.silhouette && spec.silhouette.masts) || []) {
    const x = X(m.fractionFromBow);
    out.push(`<line x1="${x}" y1="${y(base + 1)}" x2="${x}" y2="${y(m.heightAboveWaterM)}" stroke="${line}" stroke-width="1.4"/>`);
  }
}

// ---- aircraft (top view, nose up) ----
export function aircraftTop(spec) {
  const L = spec.L, S = spec.span, w = spec.wing, t = spec.tail, fr = spec.fus.r;
  const pad = 1.2, W = Math.max(S, t.span) + pad * 2, H = L + pad * 2;
  const heavy = !!spec.engines;                                  // a multi-engine bomber: the real fuselage stations and one nacelle and propeller per engine
  const nose = heavy ? spec.cg : L * 0.46, tailEnd = nose - L;   // model x of nose / tail (origin near the centre of gravity)
  const X = (mx) => f1(pad + (nose - mx));                         // model x -> svg y (nose at the top)
  const Z = (mz) => f1(W / 2 + mz);
  const body = [];
  // fuselage: widest around a third from the nose
  const N = 14, left = [], right = [];
  if (heavy) for (const [d, , rz] of spec.body) { left.push(`${Z(-rz)},${X(nose - d)}`); right.push(`${Z(rz)},${X(nose - d)}`); }
  else for (let i = 0; i <= N; i++) {
    const u = i / N, mx = nose - u * L;
    const r = fr * (u < 0.35 ? 0.55 + 0.45 * Math.sin((u / 0.35) * Math.PI / 2) : 1 - 0.8 * Math.pow((u - 0.35) / 0.65, 1.6));
    left.push(`${Z(-r)},${X(mx)}`); right.push(`${Z(r)},${X(mx)}`);
  }
  const fus = `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
  const wing = (cx, span, cr, ct, sweep, col) => {
    const mid = cx;                                                // mid-chord position
    const tipMid = cx - sweep;
    const pts = [[mid + cr / 2, 0], [tipMid + ct / 2, span / 2], [tipMid - ct / 2, span / 2], [mid - cr / 2, 0], [mid - cr / 2, 0], [tipMid - ct / 2, -span / 2], [tipMid + ct / 2, -span / 2], [mid + cr / 2, 0]];
    return `<path d="M${pts.map(([mx, mz]) => `${Z(mz)},${X(mx)}`).join(' L')} Z" fill="${col}" stroke="rgba(255,255,255,.5)" stroke-width=".08"/>`;
  };
  body.push(wing(t.x, t.span, t.chord, t.chord * 0.6, 0.2, '#6c7a8a'));
  body.push(wing(w.x, S, w.cr, w.ct, w.sweep || 0, '#8393a5'));
  if (heavy) for (const e of spec.engines) {
    if (e.nose) continue;
    const x0 = X(nose - e.d), len = (e.aft ?? e.d + e.len + 2.6) - e.d;
    body.push(`<rect x="${Z(e.z - e.r)}" y="${x0}" width="${f1(e.r * 2)}" height="${f1(len)}" rx="${f1(e.r * 0.9)}" fill="#a9b6c4" stroke="rgba(255,255,255,.6)" stroke-width=".08"/>`);
  }
  if (spec.kind === 'bi') body.push(wing(w.x + (w.stagger || 0.3), S * 0.92, w.cr * 0.9, w.ct * 0.9, w.sweep || 0, '#9aa8b8'));
  body.push(`<path d="${fus}" fill="#a9b6c4" stroke="rgba(255,255,255,.6)" stroke-width=".08"/>`);
  if (heavy) for (const e of spec.engines) body.push(`<ellipse cx="${Z(e.z)}" cy="${X(nose - e.d)}" rx="${f1(spec.prop.r)}" ry=".12" fill="rgba(255,255,255,.55)"/>`);
  else body.push(`<ellipse cx="${Z(0)}" cy="${X(nose + 0.05)}" rx="${f1(spec.prop ? spec.prop.r : 1.4)}" ry=".12" fill="rgba(255,255,255,.55)"/>`);
  // national marking
  const mark = { USA: '#3c5a9a', Japan: '#bc002d', UK: '#c8102e', Germany: '#111', France: '#0055a4', Italy: '#009246' }[spec.nation] || '#999';
  body.push(`<circle cx="${Z(S * 0.28)}" cy="${X(w.x)}" r="${f1(S * 0.05)}" fill="${mark}"/><circle cx="${Z(-S * 0.28)}" cy="${X(w.x)}" r="${f1(S * 0.05)}" fill="${mark}"/>`);
  return `<svg xmlns="${NS}" viewBox="0 0 ${f1(W)} ${f1(H)}" class="prof plane" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Vue de dessus">${body.join('')}</svg>`;
}

// ---- colours ----
function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c); const n = m ? parseInt(m[1], 16) : 0x808080; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex(a) { return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function lighten(c, k) { return toHex(hex(c).map((v) => v + (255 - v) * k)); }
export function darken(c, k) { return toHex(hex(c).map((v) => v * (1 - k))); }
