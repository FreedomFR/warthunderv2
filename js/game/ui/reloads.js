// The reload gauges of the ship that is watched, laid out as in the naval HUD of War Thunder: one ring per gun mount that fills while the mount reloads (with the seconds left
// inside, "PRÊT" when it can fire, a cross when it is destroyed, jammed, out of ammunition), the batteries grouped by calibre, then the torpedo tubes and the missile systems.
import { h } from '../../viewer/dom.js';

const fr1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

/** The state of one gun mount: { state: 'dead' | 'jam' | 'ammo' | 'reload' | 'ready', frac (0 empty .. 1 loaded), sec (s left) }. */
export function mountState(m) {
  if (!m.alive) return { state: 'dead', frac: 0, sec: 0 };
  if (m.jam > 0) return { state: 'jam', frac: 0, sec: m.jam };
  if (m.noAmmo) return { state: 'ammo', frac: 0, sec: 0 };
  const tot = Math.max(0.5, m.reloadMax || (m.gun && m.gun.reload) || 8);
  if (m.reload > 0.05) return { state: 'reload', frac: Math.max(0, Math.min(1, 1 - m.reload / tot)), sec: m.reload };
  return { state: 'ready', frac: 1, sec: 0 };
}

/**
 * The cells of the HUD for a ship: [{ title, cells: [{ label, state, frac, sec, sub }] }], the main battery first, then each secondary calibre, the torpedoes, the missiles.
 * `world` gives the clock of the missile systems.
 */
export function reloadGroups(ship, world) {
  const groups = [];
  const byKey = new Map();
  for (const m of ship.mounts) {
    const cal = Math.round(m.rec.cal || (m.gun && m.gun.cal) || 0), key = `${m.group}:${cal}`;
    let g = byKey.get(key);
    if (!g) { g = { title: `${m.group === 'main' ? 'Principale' : 'Secondaire'} ${cal} mm`, cells: [], kind: m.group }; byKey.set(key, g); groups.push(g); }
    const st = mountState(m);
    const n = g.cells.length + 1;
    g.cells.push({ label: m.rec.label || String(n), ...st, sub: m.loaded ? m.loaded : '', guns: m.n });
  }
  groups.sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1));
  const tp = ship.stats.torpedo;
  if (tp && !tp.bow && ship.tubes) {
    const reloading = ship.torpLeft <= 0 && ship.torpReload > 0;
    groups.push({ title: `Torpilles ${tp.cal} mm`, kind: 'torp', cells: [{
      label: 'T', state: ship.torpLeft > 0 ? 'ready' : reloading ? 'reload' : 'ammo', frac: ship.torpLeft > 0 ? 1 : reloading ? Math.max(0, 1 - ship.torpReload / tp.reloadS) : 0,
      sec: reloading ? ship.torpReload : 0, sub: `${ship.torpLeft}/${tp.tubes}`, guns: tp.tubes,
    }] });
  } else if (tp && tp.bow) {
    groups.push({ title: `Torpilles ${tp.cal} mm (tubes fixes)`, kind: 'torp', cells: [{ label: 'T', state: ship.torpLeft > 0 ? 'ready' : 'ammo', frac: ship.torpLeft > 0 ? 1 : 0, sec: 0, sub: `${ship.torpLeft}/${tp.tubes}`, guns: tp.tubes }] });
  }
  for (const sys of ship.msl || []) {
    const wait = Math.max(0, sys.nextT - world.time), tot = sys.def.cycleS;
    groups.push({ title: sys.def.name, kind: 'missile', cells: [{
      label: sys.def.kind === 'sam' ? 'M' : 'R', state: sys.left <= 0 ? 'ammo' : wait > 0.05 ? 'reload' : 'ready', frac: sys.left <= 0 ? 0 : wait > 0.05 ? Math.max(0, 1 - wait / tot) : 1, sec: wait, sub: `${sys.left}`, guns: sys.def.salvo,
    }] });
  }
  return groups;
}

const STATE_TEXT = { dead: '✖', jam: 'ENRAYÉE', ammo: 'VIDE', ready: 'PRÊT' };

/** The DOM of the HUD. update(ship, world) fills it; the element is empty (and hidden by the stylesheet) when there is nothing to show. */
export function createReloadHud() {
  const el = h('div', { id: 'reloads', class: 'hud' });
  let sig = '';
  const cell = (c) => {
    const txt = c.state === 'reload' ? fr1(c.sec) : STATE_TEXT[c.state] || '';
    return h('div', { class: `rl-cell st-${c.state}`, style: `--p:${Math.round(c.frac * 100)}`, title: `${c.label} — ${c.state === 'reload' ? `recharge, ${fr1(c.sec)} s` : c.state === 'ready' ? 'prête' : c.state === 'dead' ? 'détruite' : c.state === 'jam' ? 'enrayée' : 'sans munitions'}` },
      h('span', { class: 'rl-ring' }, h('b', {}, c.label)),
      h('small', {}, txt),
      c.sub ? h('i', {}, c.sub) : null);
  };
  function update(ship, world) {
    if (!ship || !ship.alive) { if (sig !== '') { el.replaceChildren(); sig = ''; } return; }
    const groups = reloadGroups(ship, world);
    // rebuild only when the text of a cell changes (ten times a second at most)
    const key = groups.map((g) => g.title + g.cells.map((c) => `${c.label}${c.state}${Math.round(c.frac * 50)}${c.state === 'reload' ? Math.round(c.sec * 10) : ''}${c.sub}`).join('')).join('|') + ship.id;
    if (key === sig) return;
    sig = key;
    el.replaceChildren(...groups.map((g) => h('div', { class: `rl-grp rl-${g.kind}` }, h('div', { class: 'rl-title' }, g.title), h('div', { class: 'rl-row' }, g.cells.map(cell)))));
  }
  return { el, update };
}
