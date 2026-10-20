// "Comparatif": the 30 ships in one sortable, filterable table.
import { h } from '../viewer/dom.js';
import { SHIPS, NATIONS, TYPES, fr } from './data.js';
import { flagSVG, ACCENTS } from './flags.js';

const COLS = [
  { id: 'name', label: 'Navire', l: true, v: (r) => r.name, text: (r) => r.name },
  { id: 'type', label: 'Type', l: true, v: (r) => 'DD CL CA BB CV'.indexOf(r.type), text: (r) => r.type },
  { id: 'year', label: 'Année', v: (r) => r.year, text: (r) => r.yearLabel },
  { id: 'disp', label: 'Déplacement (t)', v: (r) => r.spec.displacementStd, text: (r) => fr(r.spec.displacementStd, 0) },
  { id: 'loa', label: 'Longueur (m)', v: (r) => r.spec.loa, text: (r) => fr(r.spec.loa, 1) },
  { id: 'beam', label: 'Largeur (m)', v: (r) => r.spec.beam, text: (r) => fr(r.spec.beam, 1) },
  { id: 'speed', label: 'Vitesse (nœuds)', v: (r) => r.spec.speedKn, text: (r) => fr(r.spec.speedKn, 1) },
  { id: 'cal', label: 'Calibre (mm)', v: (r) => r.spec.main.caliberMm, text: (r) => fr(r.spec.main.caliberMm, 0) },
  { id: 'guns', label: 'Canons', v: (r) => r.spec.main.gunsTotal, text: (r) => fr(r.spec.main.gunsTotal, 0) },
  { id: 'range', label: 'Portée (km)', v: (r) => r.spec.main.maxRangeM, text: (r) => fr(r.spec.main.maxRangeM / 1000, 1) },
  { id: 'belt', label: 'Ceinture (mm)', v: (r) => r.spec.armour.beltMm || 0, text: (r) => (r.spec.armour.beltMm ? fr(r.spec.armour.beltMm, 0) : '—') },
  { id: 'crew', label: 'Équipage', v: (r) => r.spec.crew, text: (r) => fr(r.spec.crew, 0) },
];

export function renderCompare({ onOpen }) {
  const state = { sort: 'disp', dir: -1, nations: new Set(), types: new Set() };
  const wrap = h('div', {});
  const chipsN = h('div', { class: 'chips' }), chipsT = h('div', { class: 'chips' });
  const tbody = h('tbody'), head = h('tr');
  const table = h('table', { class: 'cmp' }, h('thead', {}, head), tbody);

  const chip = (label, set, id, extra) => {
    const b = h('button', { class: 'chip', type: 'button', onclick: () => { set.has(id) ? set.delete(id) : set.add(id); refresh(); } }, extra, label);
    b.dataset.id = id;
    return b;
  };
  NATIONS.forEach((n) => chipsN.append(chip(n.name, state.nations, n.id, h('span', { html: flagSVG(n.id, 18) }))));
  TYPES.forEach((t) => chipsT.append(chip(t.name, state.types, t.id)));

  function refresh() {
    chipsN.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', state.nations.has(c.dataset.id)));
    chipsT.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', state.types.has(c.dataset.id)));
    head.replaceChildren(...COLS.map((c) => h('th', { class: (c.l ? 'l ' : '') + (state.sort === c.id ? 'sorted' : ''), onclick: () => { state.dir = state.sort === c.id ? -state.dir : (c.l ? 1 : -1); state.sort = c.id; refresh(); } },
      c.label + (state.sort === c.id ? (state.dir > 0 ? ' ▲' : ' ▼') : ''))));
    const col = COLS.find((c) => c.id === state.sort);
    const rows = SHIPS.filter((r) => (!state.nations.size || state.nations.has(r.nation)) && (!state.types.size || state.types.has(r.type)))
      .sort((a, b) => { const x = col.v(a), y = col.v(b); return (typeof x === 'string' ? x.localeCompare(y, 'fr') : x - y) * state.dir || a.name.localeCompare(b.name, 'fr'); });
    tbody.replaceChildren(...rows.map((r) => h('tr', { tabindex: '0', onclick: () => onOpen(r), onkeydown: (e) => { if (e.key === 'Enter') onOpen(r); }, style: `--acc:${ACCENTS[r.nation]}` },
      ...COLS.map((c) => (c.id === 'name'
        ? h('td', { class: 'nm' }, h('span', {}, h('span', { html: flagSVG(r.nation, 24) }), r.name))
        : h('td', { class: c.l ? 'l' : '' }, c.text(r)))))));
    count.textContent = `${rows.length} navire${rows.length > 1 ? 's' : ''} · cliquer sur une colonne pour trier, sur une ligne pour ouvrir la fiche`;
  }
  const count = h('p', { class: 'legend' });
  wrap.append(chipsN, chipsT, count, h('div', { class: 'tbl-wrap' }, table));
  refresh();
  return wrap;
}
