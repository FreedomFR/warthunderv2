// Viewer state and its short URL form (the "debug link": subject, camera, light and model options in the query string).
import { framing, isSubject, kindOf } from './subjects.js';

export const LIGHTS = {
  jour: { label: 'Plein jour', sunEl: 38, P: { exposure: 1.0, haze: 2.2, veil: 0.2, warmth: -0.05, contrast: 1.1, bloom: 0.04, clouds: 0.1, saturation: 1.05, vignette: 0.1 } },
  matin: { label: 'Matin', sunEl: 11, P: { exposure: 1.15, haze: 3.0, veil: 0.3, warmth: 0.0, contrast: 1.08, bloom: 0.06, clouds: 0.25, saturation: 1.05, vignette: 0.1 } },
  coucher: { label: 'Coucher de soleil', sunEl: 2.6, P: { exposure: 1.35, haze: 3.0, veil: 0.36, warmth: -0.19, contrast: 1.06, bloom: 0.1, clouds: 0.4, saturation: 1.05, vignette: 0.1 } },
  couvert: { label: 'Ciel couvert', sunEl: 32, P: { exposure: 1.1, haze: 2.4, veil: 0.5, warmth: 0.02, contrast: 1.04, bloom: 0.03, clouds: 0.95, saturation: 0.9, vignette: 0.08 } },
  nuit: { label: 'Crépuscule', sunEl: -1.5, P: { exposure: 4.5, haze: 3.0, veil: 0.3, warmth: -0.1, contrast: 1.06, bloom: 0.12, clouds: 0.3, saturation: 1.0, vignette: 0.15 } },
};

export const DAMAGE = { none: 'Intact', scars: 'Cicatrices', ruin: 'Épaves', split: 'Coque brisée' };

/** Aspect ratio of the view: a tall (phone) screen needs a larger distance to fit the model across its width. */
export const screen = { aspect: 16 / 9 };

/** Default state for a subject (camera framed on the whole model). */
export function defaults(subject) {
  const f = framing(subject);
  f.dist = Math.round(f.dist * Math.max(1, 1.7 / screen.aspect) * 10) / 10;
  return {
    subject, az: f.az, el: f.el, dist: f.dist, tx: 0, ty: f.ty, tz: 0, heading: 90, fov: 40,
    light: 'jour', sunFollow: true, sunOffset: 35, sunAz: 180, sunEl: null,
    ocean: true, shadows: true, auto: 0, scale: 1,
    damage: 'none', train: 0, elev: 0, parked: -1,
    alt: f.alt, gear: false, fold: 0, ord: true, bank: 0, pitch: 0,
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const KEYS = [
  // [state key, query key, type]
  ['az', 'az', 'n'], ['el', 'el', 'n'], ['dist', 'd', 'n'], ['tx', 'tx', 'n'], ['ty', 'ty', 'n'], ['tz', 'tz', 'n'], ['heading', 'hd', 'n'], ['fov', 'fov', 'n'],
  ['light', 'l', 's'], ['sunFollow', 'sf', 'b'], ['sunOffset', 'so', 'n'], ['sunAz', 'sa', 'n'], ['sunEl', 'se', 'n'],
  ['ocean', 'oc', 'b'], ['shadows', 'sh', 'b'], ['auto', 'rot', 'n'], ['scale', 'q', 'n'],
  ['damage', 'dm', 's'], ['train', 'tr', 'n'], ['elev', 'gu', 'n'], ['parked', 'pk', 'n'],
  ['alt', 'alt', 'n'], ['gear', 'gr', 'b'], ['fold', 'fo', 'n'], ['ord', 'ord', 'b'], ['bank', 'bk', 'n'], ['pitch', 'pt', 'n'],
];

/** Only what differs from the defaults, so that the link stays short. */
export function toQuery(st) {
  const base = defaults(st.subject);
  const q = new URLSearchParams();
  q.set('m', st.subject);
  for (const [k, qk, t] of KEYS) {
    const v = st[k], d = base[k];
    if (v === d || v == null) continue;
    if (t === 'b') q.set(qk, v ? '1' : '0');
    else if (t === 'n') { if (Math.abs(v - d) > 0.049 || d == null) q.set(qk, String(r1(v))); }
    else q.set(qk, v);
  }
  return q;
}

/** Inverse of toQuery; unknown or invalid values fall back to the defaults. */
export function fromQuery(qs, fallbackSubject = 'iowa') {
  let subject = qs.get('m') || qs.get('ship') || fallbackSubject;
  if (!isSubject(subject)) subject = fallbackSubject;
  const st = defaults(subject);
  for (const [k, qk, t] of KEYS) {
    if (!qs.has(qk)) continue;
    const raw = qs.get(qk);
    if (t === 'b') st[k] = raw === '1' || raw === 'true';
    else if (t === 'n') { const v = Number(raw); if (Number.isFinite(v)) st[k] = v; }
    else st[k] = raw;
  }
  if (!LIGHTS[st.light]) st.light = 'jour';
  if (!(st.damage in DAMAGE)) st.damage = 'none';
  if (kindOf(subject) !== 'ship') st.damage = 'none';
  st.dist = Math.max(1, st.dist);
  return st;
}
