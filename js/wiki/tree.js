// Renders the tech tree of one nation: columns = tiers, rows = ship types, nodes = ships, lines = successions. A plain list of the same
// nodes is rendered too for narrow screens (the stylesheet shows one or the other).
import { h } from '../viewer/dom.js';
import { fr } from './data.js';
import { TIERS } from './tiers.js';
import { layoutNation, G } from './layout.js';
import { shipPicture } from './profile.js';
import { flagSVG } from './flags.js';

const NB = ' ';

/** One ship button. `pos`: absolute position (desktop tree) or null (list). */
export function shipNode(rec, onOpen, pos) {
  const s = rec.spec;
  const b = h('button', {
    class: 'node', type: 'button', 'data-id': rec.id, style: pos ? `left:${pos.x}px;top:${pos.y}px;width:${G.nodeW}px;height:${G.nodeH}px` : '',
    title: `${rec.name} — ${s.className}`, onclick: () => onOpen(rec),
  },
  h('span', { class: 'n-top' }, h('span', {}, h('span', { class: 'n-type' }, rec.type), rec.unfinished ? h('span', { class: 'n-flag' }, 'inachevé') : null), h('span', {}, rec.year, h('span', { class: 'tier-chip' }, 'Ère ' + rec.tier.roman))),
  h('span', { class: 'n-prof' }, shipPicture(s)),
  h('b', { class: 'n-name' }, rec.name),
  h('span', { class: 'n-sub' }, `${s.main.gunsTotal}${NB}×${NB}${fr(s.main.caliberMm, 0)}${NB}mm · ${fr(s.displacementStd, 0)}${NB}t`));
  return b;
}

const edgePath = (e) => {
  const { from: a, to: b } = e;
  if (e.kind === 'trunk') return `M${a.x},${a.y} V${b.y}`;
  if (a.y === b.y) return `M${a.x},${a.y} H${b.x}`;
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} H${mx} V${b.y} H${b.x}`;
};

export function renderTree(nation, { onOpen, compact = true }) {
  const L = layoutNation(nation.id, { compact });
  const used = new Set(L.nodes.map((n) => n.rec.tier.n));

  // desktop: positioned tree
  const tree = h('div', { class: 'tree', style: `width:${L.width}px;height:${L.height}px` });
  L.cols.forEach((c) => {
    tree.append(h('div', { class: 'col', style: `left:${c.x}px;width:${G.cellW}px` },
      h('div', { class: 'th' }, h('b', {}, c.tier.roman), h('span', {}, c.tier.years), h('em', {}, c.tier.name))));
  });
  L.lanes.forEach((lane, i) => {
    if (i) tree.append(h('div', { class: 'lane-band', style: `top:${lane.y}px` }));
    tree.append(h('div', { class: 'lane-label', style: `top:${lane.y + (lane.rows * G.cellH) / 2 - 14}px` }, lane.name));
  });
  const svg = h('svg:svg', { class: 'edges', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}` });
  for (const e of L.edges) {
    svg.append(h('svg:path', { d: edgePath(e), class: e.kind }));
    if (e.kind !== 'trunk') svg.append(h('svg:circle', { cx: e.from.x, cy: e.from.y, r: 3.2 }));
  }
  tree.append(svg);
  tree.append(h('div', { class: 'rootcard', style: `left:${L.root.x}px;top:${L.root.y}px;width:${L.root.w}px;height:${L.root.h}px` },
    h('span', { html: flagSVG(nation.id, 30) }), h('span', {}, nation.name, h('small', {}, nation.adj))));
  for (const n of L.nodes) tree.append(shipNode(n.rec, onOpen, n));

  // phones: lanes as lists
  const list = h('div', { class: 'lanes-list' });
  for (const lane of L.lanes) {
    if (!lane.ships.length) continue;
    list.append(h('div', { class: 'lane-h' }, lane.name), h('div', { class: 'lane-row' }, lane.ships.map((r) => shipNode(r, onOpen, null))));
  }

  const legend = h('div', { class: 'tiers', 'aria-label': 'Ères' }, TIERS.map((t) => h('div', { class: 'tier' + (used.has(t.n) ? ' used' : '') }, h('i', {}, t.roman), h('span', {}, h('b', {}, t.years), t.name))));
  return { legend, tree: h('div', { class: 'tree-wrap' }, tree), list, layout: L };
}

