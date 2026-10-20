// Entry point of wiki.html: tech trees by nation, comparison table, aircraft, and the detail card with the embedded 3D viewer.
// Routes (hash): #/usa  #/usa/iowa  #/comparatif  #/comparatif/iowa  #/aviation  #/aviation/sbd  #/aviation/float-UK
import { h, $ } from './viewer/dom.js';
import { NATIONS, SHIP, SHIPS, AIRCRAFT_BY_KEY, nationBySlug, nationShips } from './wiki/data.js';
import { flagSVG, ACCENTS, slug } from './wiki/flags.js';
import { renderTree } from './wiki/tree.js';
import { createCard } from './wiki/card.js';
import { renderCompare } from './wiki/compare.js';
import { renderAircraft } from './wiki/aircraft.js';
import { injectStyles } from './wiki/styles.js';

injectStyles();
const app = $('#app');
let lastNation = NATIONS[0].id;
let compact = true;
let base = '#/' + slug(lastNation);          // route behind the card (the card's close goes back to it)
let shown = null;                              // key of the page currently rendered

const card = createCard({
  onClose: () => { if (location.hash !== base) location.hash = base; },
  onOpenShip: (rec) => openShip(rec),
  onStep: (rec) => openShip(rec),
});

const openShip = (rec) => { location.hash = `${base.startsWith('#/aviation') ? '#/' + slug(rec.nation) : base}/${rec.id}`; };
const openAircraft = (a) => { location.hash = `#/aviation/${a.key.replace(':', '-')}`; };

function nav(active) {
  return h('nav', { class: 'nav', 'aria-label': 'Sections' },
    h('a', { href: '#/' + slug(lastNation), class: active === 'tree' ? 'on' : '' }, 'Arbres technologiques'),
    h('a', { href: '#/comparatif', class: active === 'cmp' ? 'on' : '' }, 'Comparatif'),
    h('a', { href: '#/aviation', class: active === 'air' ? 'on' : '' }, 'Aviation'));
}

function header(active) {
  return h('header', { class: 'top' },
    h('a', { class: 'brand', href: '#/' + slug(lastNation) }, '⚓ Combat naval', h('small', {}, 'Wiki')),
    nav(active),
    h('div', { class: 'ext' }, h('a', { href: 'viewer.html' }, 'Visualiseur 3D'), h('a', { href: 'index.html' }, 'Lancer le jeu')));
}

function footer() {
  return h('footer', {}, 'Les chiffres sont lus directement dans les fiches techniques du jeu (js/game/data/specs/) : cette page ne peut pas être en retard sur le jeu. ',
    'Les valeurs marquées « ≈ » sont des estimations de la fiche. Sources et crédits des plans et photographies : ', h('a', { href: 'https://github.com/FreedomFR/warthunderv2/blob/main/docs/CREDITS.md' }, 'docs/CREDITS.md'), '.');
}

function pageTree(nation) {
  const t = renderTree(nation, { onOpen: openShip, compact });
  const ships = nationShips(nation.id);
  const years = ships.map((r) => r.year);
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, NATIONS.map((n) => h('a', {
    class: 'tab' + (n.id === nation.id ? ' on' : ''), role: 'tab', 'aria-selected': n.id === nation.id ? 'true' : 'false', href: '#/' + slug(n.id), style: `--acc:${ACCENTS[n.id]}`, title: n.name,
  }, h('span', { html: flagSVG(n.id, 32) }), h('span', {}, h('b', {}, n.name), h('small', {}, n.adj)))));
  const opt = h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked: compact ? 'checked' : null, onchange: (e) => { compact = e.target.checked; route(true); } }), 'Masquer les ères vides');
  const tiersRow = h('div', { style: 'display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap' }, t.legend, opt);
  tiersRow.firstChild.style.flex = '1';
  return h('div', { style: `--acc:${ACCENTS[nation.id]}` },
    h('h1', {}, 'Arbres technologiques'),
    h('p', { class: 'lead' }, `Choisissez une nation : ses ${ships.length} navires sont rangés par ère (colonnes, de la plus ancienne à la plus récente, d'après l'année de mise en service) et par type (lignes). Cliquez sur un navire pour ouvrir sa fiche, avec son modèle 3D.`),
    tabs, tiersRow, t.tree, t.list,
    h('p', { class: 'note' }, `${nation.name} : ${ships.length} navires, de ${Math.min(...years)} à ${Math.max(...years)}. Chaque silhouette est dessinée à partir de la fiche technique (longueur, cheminées, mâts, tourelles) et toutes sont à la même échelle. Quand une nation aura plusieurs navires d'un même type, ils seront reliés de l'ancien au récent.`));
}

function render(route) {
  let main, active;
  if (route.view === 'cmp') {
    active = 'cmp';
    main = h('div', {}, h('h1', {}, 'Comparatif des navires'), h('p', { class: 'lead' }, 'Les 30 navires côte à côte : filtrez par nation et par type, triez par n\'importe quelle colonne.'), renderCompare({ onOpen: openShip }));
  } else if (route.view === 'air') {
    active = 'air';
    main = h('div', {}, h('h1', {}, 'Aviation embarquée'), h('p', { class: 'lead' }, 'Les avions des porte-avions et les hydravions des croiseurs et cuirassés, modélisés d\'après les appareils réels.'), renderAircraft({ onOpen: openAircraft }));
  } else {
    active = 'tree';
    main = pageTree(route.nation);
  }
  app.replaceChildren(header(active), h('main', {}, main), footer());
}

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const first = (parts[0] || '').toLowerCase();
  if (first === 'comparatif') return { view: 'cmp', id: parts[1], page: 'cmp' };
  if (first === 'aviation') {
    let id = parts[1];
    if (id) id = id.startsWith('float-') ? 'float:' + id.slice(6) : 'plane:' + id;
    return { view: 'air', id, page: 'air' };
  }
  const nation = nationBySlug(first) || NATIONS.find((n) => n.id === lastNation);
  return { view: 'tree', nation, id: parts[1], page: 'tree:' + nation.id + ':' + compact };
}

function route(force) {
  const r = parse();
  if (r.view === 'tree') lastNation = r.nation.id;
  if (force || shown !== r.page) { render(r); shown = r.page; }
  const baseHash = r.view === 'cmp' ? '#/comparatif' : r.view === 'air' ? '#/aviation' : '#/' + slug(r.nation.id);
  base = baseHash;
  let title = 'Wiki des navires — Combat naval';
  const cur = card.current && card.current.rec;
  if (r.id && r.view === 'air' && AIRCRAFT_BY_KEY[r.id]) {
    if (cur !== AIRCRAFT_BY_KEY[r.id]) card.open({ kind: 'plane', rec: AIRCRAFT_BY_KEY[r.id] });
    title = AIRCRAFT_BY_KEY[r.id].name + ' — ' + title;
  } else if (r.id && SHIP[r.id]) {
    if (cur !== SHIP[r.id]) card.open({ kind: 'ship', rec: SHIP[r.id] });
    title = SHIP[r.id].name + ' — ' + title;
    document.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === r.id));
  } else {
    card.close(true);
    document.querySelectorAll('.node.sel').forEach((n) => n.classList.remove('sel'));
  }
  document.title = title;
}

addEventListener('hashchange', () => route(false));
route(true);
window.__wiki = { route, card, SHIPS };
