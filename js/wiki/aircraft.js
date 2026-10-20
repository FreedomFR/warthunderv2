// "Aviation": the carrier aircraft of every nation and the catapult floatplanes of cruisers and battleships.
import { h } from '../viewer/dom.js';
import { AIRCRAFT, NATIONS, ROLE_NAMES, fr } from './data.js';
import { flagSVG, ACCENTS } from './flags.js';
import { aircraftTop } from './profile.js';

const NB = ' ';

export function renderAircraft({ onOpen }) {
  const state = { nation: null, role: null };
  const wrap = h('div', {});
  const chipsN = h('div', { class: 'chips' }), chipsR = h('div', { class: 'chips' }), grid = h('div', { class: 'grid' });
  const mk = (box, label, key, id, extra) => {
    const b = h('button', { class: 'chip', type: 'button', onclick: () => { state[key] = state[key] === id ? null : id; refresh(); } }, extra, label);
    b.dataset.id = id; b.dataset.key = key;
    box.append(b);
  };
  NATIONS.forEach((n) => mk(chipsN, n.name, 'nation', n.id, h('span', { html: flagSVG(n.id, 18) })));
  Object.entries(ROLE_NAMES).forEach(([id, name]) => mk(chipsR, name, 'role', id));

  function refresh() {
    for (const c of [...chipsN.children, ...chipsR.children]) c.classList.toggle('on', state[c.dataset.key] === c.dataset.id);
    const list = AIRCRAFT.filter((a) => (!state.nation || a.nation === state.nation) && (!state.role || a.role === state.role));
    grid.replaceChildren(...list.map((a) => h('button', { class: 'acard', type: 'button', style: `--acc:${ACCENTS[a.nation]}`, onclick: () => onOpen(a) },
      h('span', { class: 'pic', html: aircraftTop(a.spec) }),
      h('b', {}, a.name),
      h('small', {}, h('span', { html: flagSVG(a.nation, 18) }), a.roleName),
      h('span', { class: 'st' }, `${fr(a.spec.L, 1)}${NB}m · envergure ${fr(a.spec.span, 1)}${NB}m`))));
    if (!list.length) grid.append(h('p', { class: 'legend' }, 'Aucun appareil pour ce filtre.'));
  }
  refresh();
  wrap.append(chipsN, chipsR, grid,
    h('p', { class: 'note' }, 'Les porte-avions embarquent les appareils de leur nation (bombardier en piqué, torpilleur, chasseur) ; les croiseurs et les cuirassés ont leur hydravion sur la catapulte. Les dimensions sont celles des appareils réels.'));
  return wrap;
}
