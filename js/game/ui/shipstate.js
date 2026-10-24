// What the interface says of a ship's state, in place of a health bar (a ship has no hit points: see sim/hull.js): the reserve of buoyancy she has left, the share of her crew
// still aboard, and a word for what is wrong with her (flooding, list, fires, a crew too small, no way on, no gun that works).
import { clamp } from '../math.js';
import { SINK_FILL } from '../sim/hull.js';

/** { reserve, crew, text, level } of a ship afloat: reserve and crew are 0..1, `level` 0 (well) .. 3 (lost cause), `text` the French word. */
export function shipStatus(s) {
  const reserve = clamp(1 - s.waterFill / SINK_FILL[s.stats.type], 0, 1), crew = clamp(s.crewFrac, 0, 1);
  let text = 'à flot', level = 0;
  const say = (t, l) => { if (l > level || (l === level && level === 0)) { text = t; level = l; } };
  if (s.state !== 'afloat') return { reserve: 0, crew, text: 'coule', level: 3 };
  if (s.abandonT != null) say('abandonné', 3);
  if (reserve < 0.35) say('envahi par les eaux', 3);
  else if (reserve < 0.7) say('voie d\'eau', 1);
  if (Math.abs(s.listCur) > 0.12) say('forte gîte', 2);
  else if (Math.abs(s.listCur) > 0.05) say('gîte', 1);
  if (s.fires.length >= 3) say('en feu', 2);
  else if (s.fires.length >= 1) say('incendie', 1);
  if (crew < 0.4) say('équipage décimé', 2);
  else if (crew < 0.75) say('équipage réduit', 1);
  if (s.engine * s.propulsion < 0.2) say('immobilisé', 2);
  if (!s.canStrike() && !s.mission && !s.dock) say('désarmé', 2);
  // the port: she is on her way, or alongside, or being taken in or out
  if (s.dock) say(s.dock.phase === 'moored' ? 'à quai : ravitaillement et réparations' : s.dock.phase === 'in' ? 'entre au port' : 'quitte le port', level >= 2 ? level : 1);
  else if (s.mission) say(s.mission.why === 'ammo' ? 'fait route vers le port : plus de munitions' : 'fait route vers le port : avaries', level >= 2 ? level : 1);
  return { reserve, crew, text, level };
}

/** The colour of a level (0 well, 1 hurt, 2 badly hurt, 3 lost). */
export const LEVEL_COLOR = ['#5ec26a', '#e0b43a', '#e0803a', '#d9534f'];

/** Fill the two thin meters of a team row or a label (reserve of buoyancy above, crew below). */
export function setMeters(el, s) {
  const st = shipStatus(s), a = el.children[0], b = el.children[1];
  a.style.width = (st.reserve * 100).toFixed(0) + '%';
  b.style.width = (st.crew * 100).toFixed(0) + '%';
  a.style.background = st.reserve > 0.55 ? '#4fb3d9' : st.reserve > 0.3 ? '#e0b43a' : '#d9534f';
  b.style.background = st.crew > 0.55 ? '#d9a35a' : st.crew > 0.3 ? '#e0803a' : '#d9534f';
  el.title = `${st.text} · flottabilité ${(st.reserve * 100).toFixed(0)} % · équipage ${(st.crew * 100).toFixed(0)} %`;
  return st;
}

/** What is wrong with an aircraft, in words (its parts: wings, tail, engines, fuel, pilot, controls). */
export function planeText(p) {
  const P = p.parts;
  if (p.dying) return 'abattu';
  if (!P) return 'intact';
  const bad = [];
  const part = (q) => (q.hp <= 0 ? 2 : q.hp < q.max * 0.6 ? 1 : 0);
  if (p.fire > 0) bad.push('en feu');
  if (p.lost && (p.lost.engine || (p.lost.engines && p.lost.engines.some(Boolean)))) bad.push(p.lost.engine ? 'moteur détruit' : 'moteur en panne');
  const w = Math.max(part(P.wingL), part(P.wingR)); if (w) bad.push('aile touchée');
  if (part(P.tail)) bad.push('empennage touché');
  if (part(P.ctl)) bad.push('commandes touchées');
  if (part(P.fuel)) bad.push('fuite de carburant');
  if (part(P.body)) bad.push('fuselage touché');
  return bad.length ? bad.join(', ') : p.smoke > 0 ? 'touché' : 'intact';
}
export function planeLevel(p) { const c = p.cond ?? 1; return p.dying ? 3 : c > 0.8 ? 0 : c > 0.55 ? 1 : c > 0.3 ? 2 : 3; }
