// The detail card (drawer) of a ship or an aircraft: embedded 3D viewer, key figures as bars, the statistic sections from the spec sheet,
// the estimated values and the sources. The 3D view is the viewer page in an iframe (created when the card opens, removed when it closes,
// so that only one GPU device is alive at a time).
import { h } from '../viewer/dom.js';
import { nationInfo, typeName, bars, shipSections, aircraftSections, sheetNotes, sourcesOf, SHIPS } from './data.js';
import { flagSVG, ACCENTS, slug } from './flags.js';
import { shipProfile, aircraftTop } from './profile.js';

const NB = ' ';

function section(sec, open) {
  return h('details', { class: 'sec', open }, h('summary', {}, sec.title),
    h('dl', {}, sec.rows.flatMap((r) => [h('dt', {}, r.k), h('dd', { class: r.est ? 'est' : '' }, r.v)])));
}

export function createCard({ onClose, onOpenShip, onStep }) {
  const scrim = h('div', { class: 'scrim', onclick: () => close() });
  const card = h('aside', { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fiche détaillée', tabindex: '-1' });
  document.body.append(scrim, card);
  let opener = null, current = null;

  function viewer(key) {
    // the wiki's own query parameters (?scale=0.5, ?offscreen=1 ...) are handed down to the viewer
    const q = new URLSearchParams(location.search);
    q.set('embed', '1'); q.set('m', key);
    const url = `viewer.html?${q}`;
    if (!navigator.gpu) {
      return [h('div', { class: 'viewer' }, h('div', { class: 'ph' }, 'Le modèle 3D demande WebGPU (un Chrome ou un Edge récent).')),
        h('div', { class: 'vhint' }, h('a', { href: `viewer.html?m=${encodeURIComponent(key)}`, target: '_blank', rel: 'noopener' }, 'Essayer dans le visualiseur ↗'))];
    }
    const box = h('div', { class: 'viewer' }, h('div', { class: 'ph' }, 'Chargement du modèle 3D…'));
    const frame = h('iframe', { title: 'Modèle 3D', src: url, allow: 'fullscreen; clipboard-write', loading: 'eager' });
    box.append(frame);
    // on a touch screen the page must stay scrollable: the 3D view is activated by a tap
    const tap = h('button', { class: 'tap btn pri', type: 'button', onclick: () => box.classList.add('live') }, 'Toucher pour manipuler le modèle 3D');
    box.append(tap);
    const live = () => box.classList.contains('live');
    const hint = h('div', { class: 'vhint' },
      h('span', {}, 'Glisser : tourner · molette ou pincement : zoom · clic droit : déplacer'),
      h('a', { href: `viewer.html?m=${encodeURIComponent(key)}`, target: '_blank', rel: 'noopener' }, 'Ouvrir dans le visualiseur ↗'),
      h('button', { class: 'btn', type: 'button', onclick: () => box.classList.remove('live') }, 'Reprendre le défilement'));
    hint.lastChild.style.display = 'none';
    new MutationObserver(() => { hint.lastChild.style.display = live() ? '' : 'none'; }).observe(box, { attributes: true, attributeFilter: ['class'] });
    return [box, hint];
  }

  function shipBody(rec) {
    const s = rec.spec;
    const secs = shipSections(rec);
    const notes = sheetNotes(rec);
    const est = s.estimated || [];
    const kids = [
      ...viewer(rec.id),
      h('div', { class: 'profile-big', html: shipProfile(s, { full: true }) }),
      h('div', { class: 'bars' }, bars(rec).map((b) => h('div', { class: 'bar' }, h('span', {}, b.label), h('i', { style: `--v:${Math.max(0.02, b.v).toFixed(3)}` }), h('b', {}, b.text)))),
      ...secs.map((sec) => section(sec, ['dim', 'main'].includes(sec.id))),
      h('div', { class: 'legend' }, 'valeur estimée dans la fiche technique (non relevée dans les sources)'),
    ];
    if (notes.length) {
      kids.push(h('details', { class: 'sec' }, h('summary', {}, 'Notes de la fiche technique (en anglais)'),
        h('div', { class: 'en' }, notes.map(([k, v]) => h('p', {}, h('b', {}, k), v)))));
    }
    if (est.length) kids.push(h('details', { class: 'sec' }, h('summary', {}, `Valeurs estimées (${est.length})`), h('ul', {}, est.map((e) => h('li', {}, e)))));
    const src = sourcesOf(rec);
    if (src.length) kids.push(h('details', { class: 'sec' }, h('summary', {}, `Sources (${src.length})`), h('ul', {}, src.map((x) => h('li', {}, x.href ? h('a', { href: x.href, target: '_blank', rel: 'noopener noreferrer' }, x.text) : x.text)))));
    // previous / next ship of the same nation, oldest first
    const order = SHIPS.filter((r) => r.nation === rec.nation).sort((a, b) => a.tier.n - b.tier.n || a.year - b.year || 'DD CL CA BB CV'.indexOf(a.type) - 'DD CL CA BB CV'.indexOf(b.type));
    const i = order.indexOf(rec);
    kids.push(h('div', { class: 'cardnav' },
      h('button', { class: 'btn', type: 'button', disabled: i <= 0, onclick: () => onStep(order[i - 1]) }, '← ' + (order[i - 1] ? order[i - 1].name : '')),
      h('button', { class: 'btn', type: 'button', disabled: i >= order.length - 1, onclick: () => onStep(order[i + 1]) }, (order[i + 1] ? order[i + 1].name : '') + ' →')));
    return kids;
  }

  function planeBody(a) {
    const kids = [
      ...viewer(a.key),
      h('div', { class: 'profile-big', html: aircraftTop(a.spec) }),
      ...aircraftSections(a).map((sec) => section(sec, true)),
    ];
    if (a.users.length) kids.push(h('div', { class: 'chips' }, a.users.map((r) => h('a', { class: 'chip', href: `#/${slug(r.nation)}/${r.id}`, onclick: (e) => { e.preventDefault(); onOpenShip(r); } }, '⚓ ' + r.name))));
    kids.push(h('div', { class: 'legend' }, 'les dimensions sont celles de l\'appareil réel ; masse et performances du jeu sont des estimations'));
    return kids;
  }

  function open(entry) {
    closeFrames();
    current = entry;
    const isShip = entry.kind === 'ship';
    const rec = entry.rec;
    const nat = nationInfo(rec.nation);
    card.style.setProperty('--acc', ACCENTS[rec.nation] || '#e2a04e');
    const sub = isShip ? `${nat.name} · ${typeName(rec.type)} · ${rec.yearLabel}` : `${nat.name} · ${rec.roleName}`;
    card.replaceChildren(
      h('div', { class: 'hd' }, h('span', { html: flagSVG(rec.nation, 36) }), h('div', {}, h('h2', {}, rec.name), h('small', {}, sub)),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Fermer', onclick: () => close() }, '✕')),
      h('div', { class: 'body' }, isShip ? shipBody(rec) : planeBody(rec)));
    if (!card.classList.contains('on')) opener = document.activeElement;
    card.classList.add('on'); scrim.classList.add('on');
    document.body.style.overflow = 'hidden';
    card.scrollTop = 0;
    card.focus({ preventScroll: true });
  }

  function closeFrames() { card.querySelectorAll('iframe').forEach((f) => { f.src = 'about:blank'; f.remove(); }); }

  function close(silent) {
    if (!card.classList.contains('on')) return;
    closeFrames();
    card.classList.remove('on'); scrim.classList.remove('on');
    document.body.style.overflow = '';
    current = null;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
    if (!silent) onClose && onClose();
  }

  addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.classList.contains('on')) close(); });
  return { open, close, get current() { return current; }, get isOpen() { return card.classList.contains('on'); } };
}

