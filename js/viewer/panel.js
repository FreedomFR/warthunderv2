// The viewer's interface: subject menu, view / light / render / model options, and the action buttons (screenshot, debug link...).
import { h } from './dom.js';
import { subjectGroups, ALL_KEYS, kindOf, aircraftSpec, shipName, ROLE_NAMES } from './subjects.js';
import { BY_ID, nationName, typeName } from '../game/data/ships.js';
import { LIGHTS, DAMAGE, toQuery } from './state.js';

const VIEWS = [['trois_quarts', 'Trois-quarts'], ['tribord', 'Tribord'], ['babord', 'Babord'], ['proue', 'Proue'], ['poupe', 'Poupe'], ['dessus', 'Dessus'], ['dessous', 'Dessous']];

export function createPanel(root, scene, engine, { embed = false } = {}) {
  const st = scene.st;
  const groups = subjectGroups();
  let toastTimer = 0;

  const toast = h('div', { id: 'toast', role: 'status' });
  const say = (msg) => { toast.textContent = msg; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 2600); };

  // ---- link and screenshot ----
  const debugUrl = () => {
    const q = toQuery(st);
    if (embed) q.delete('embed');
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'viewer.html?' + q.toString();
  };
  async function copyLink() {
    const url = debugUrl();
    try { await navigator.clipboard.writeText(url); say('Lien de débogage copié : il rouvre exactement cette vue.'); return; } catch (e) { /* not allowed here: fall back */ }
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, url);
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    if (ok) say('Lien de débogage copié.'); else prompt('Copiez ce lien :', url);
  }
  async function shoot() {
    say('Capture…');
    try {
      const blob = await scene.screenshot();
      const a = h('a', { href: URL.createObjectURL(blob), download: `${st.subject.replace(':', '-')}_az${Math.round(st.az)}_el${Math.round(st.el)}.png` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say('Capture enregistrée.');
    } catch (e) { say('Capture impossible : ' + e.message); }
  }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // ---- controls ----
  // building a big ship takes a moment: let the "loading" label paint first
  const goto = async (key) => {
    const el = document.getElementById('status');
    if (el) { el.textContent = 'Construction du modèle…'; el.classList.add('on'); }
    await new Promise((r) => setTimeout(r, 40));
    try { scene.setSubject(key); } finally { if (el) el.classList.remove('on'); }
  };
  const select = h('select', { id: 'subject', 'aria-label': 'Navire ou avion', onchange: (e) => goto(e.target.value) },
    groups.map((g) => h('optgroup', { label: g.label }, g.items.map((i) => h('option', { value: i.key }, i.label)))));
  const step = (d) => { const i = ALL_KEYS.indexOf(st.subject); goto(ALL_KEYS[(i + d + ALL_KEYS.length) % ALL_KEYS.length]); };

  const infoBox = h('div', { id: 'info' });
  const checks = {}, ranges = {}, outs = {}, btns = {};
  const check = (key, label, onChange) => {
    const i = h('input', { type: 'checkbox', onchange: (e) => { scene.set({ [key]: e.target.checked }); onChange && onChange(e.target.checked); } });
    checks[key] = i;
    return h('label', { class: 'chk' }, i, ' ' + label);
  };
  const range = (key, label, min, max, stepv, fmt = (v) => v, conv = (v) => v) => {
    const out = h('output');
    const i = h('input', { type: 'range', min, max, step: stepv, oninput: (e) => { scene.set({ [key]: conv(Number(e.target.value)) }); out.textContent = fmt(conv(Number(e.target.value))); } });
    ranges[key] = i; outs[key] = { out, fmt };
    return h('label', { class: 'rng' }, h('span', {}, label), i, out);
  };

  const modelBox = h('div', { class: 'grp' });
  const viewButtons = VIEWS.map(([id, label]) => h('button', { class: 'btn small', onclick: () => scene.view(id) }, label));
  const lightButtons = Object.entries(LIGHTS).map(([id, L]) => { const b = h('button', { class: 'btn small', 'data-light': id, onclick: () => scene.set({ light: id, sunEl: null }) }, L.label); return b; });
  const resSel = h('select', { onchange: (e) => { engine.setRenderScale(Number(e.target.value)); scene.set({ scale: Number(e.target.value) }); } },
    [[0.5, 'Résolution 50 %'], [0.75, '75 %'], [1, '100 % (défaut)'], [1.5, '150 %'], [2, '200 %']].map(([v, l]) => h('option', { value: v }, l)));

  const rotBtn = h('button', { class: 'btn small', id: 'rot', title: 'Rotation automatique (espace)', onclick: () => scene.set({ auto: st.auto ? 0 : 12 }) }, 'Rotation auto');
  const side = h('aside', { id: 'side', class: 'panel' },
    h('details', { open: true }, h('summary', {}, 'Vue'),
      h('div', { class: 'grp wrap' }, viewButtons, rotBtn),
      range('fov', 'Champ de vision', 15, 80, 1, (v) => v + '°'),
      h('div', { class: 'hint' }, 'Glisser : tourner · clic droit ou Maj + glisser : déplacer · molette : zoom · double-clic : recadrer')),
    h('details', { open: true }, h('summary', {}, 'Lumière'),
      h('div', { class: 'grp wrap' }, lightButtons),
      check('sunFollow', 'Le soleil suit la caméra'),
      range('sunEl', 'Hauteur du soleil', -2, 60, 0.5, (v) => Math.round(v) + '°'),
      range('sunAz', 'Azimut du soleil', -180, 180, 1, (v) => Math.round(v) + '°')),
    h('details', { open: true }, h('summary', {}, 'Rendu'),
      check('ocean', 'Océan (O)'), check('shadows', 'Ombres portées (S)'), resSel),
    h('details', { open: true }, h('summary', {}, 'Modèle'), modelBox));

  const bar = h('div', { id: 'bar', class: 'hud' },
    h('button', { class: 'btn', title: 'Recadrer (R)', onclick: () => { scene.frame(); } }, 'Recadrer'),
    h('button', { class: 'btn', title: 'Enregistrer une image PNG (P)', onclick: shoot }, 'Capture'),
    h('button', { class: 'btn primary', title: 'Copier un lien qui rouvre exactement cette vue (C), à joindre à un rapport de bug', onclick: copyLink }, 'Lien de débogage'),
    embed ? null : h('button', { class: 'btn', title: 'Plein écran (F)', onclick: fullscreen }, 'Plein écran'),
    embed ? h('button', { class: 'btn', title: 'Océan (O)', onclick: () => scene.set({ ocean: !st.ocean }) }, 'Océan') : null,
    embed ? h('button', { class: 'btn', title: 'Lumière suivante', onclick: () => { const ids = Object.keys(LIGHTS); scene.set({ light: ids[(ids.indexOf(st.light) + 1) % ids.length], sunEl: null }); } }, 'Lumière') : null,
    embed ? h('a', { class: 'btn', target: '_blank', rel: 'noopener', href: 'viewer.html', onclick: (e) => { e.currentTarget.href = debugUrl(); }, title: 'Ouvrir dans le visualiseur complet' }, 'Agrandir ↗') : null,
    embed ? null : h('button', { class: 'btn', id: 'opt-toggle', onclick: () => side.classList.toggle('open') }, 'Options'),
    embed ? null : h('button', { class: 'btn', title: 'Aide (H)', onclick: () => help.classList.toggle('hidden') }, '?'));

  const help = h('div', { id: 'help', class: 'panel hidden', onclick: () => help.classList.add('hidden') },
    h('div', { class: 'title' }, 'Commandes du visualiseur'),
    h('div', { class: 'helpgrid' },
      h('b', {}, 'Glisser'), h('span', {}, 'Tourner autour du modèle (dans tous les sens, y compris par-dessous quand l\'océan est coupé)'),
      h('b', {}, 'Clic droit / Maj + glisser'), h('span', {}, 'Déplacer le point regardé'),
      h('b', {}, 'Molette / pincement'), h('span', {}, 'Zoom ; au doigt : un doigt tourne, deux doigts zooment et déplacent'),
      h('b', {}, 'Flèches, + / −'), h('span', {}, 'Tourner et zoomer au clavier (Maj + flèches : déplacer)'),
      h('b', {}, 'R  ·  double-clic'), h('span', {}, 'Recadrer sur le modèle'),
      h('b', {}, '1 – 7'), h('span', {}, 'Vues : trois-quarts, tribord, babord, proue, poupe, dessus, dessous'),
      h('b', {}, '[  ]'), h('span', {}, 'Modèle précédent / suivant'),
      h('b', {}, 'O  ·  S  ·  Espace'), h('span', {}, 'Océan ; ombres ; rotation automatique'),
      h('b', {}, 'P  ·  C  ·  F  ·  H'), h('span', {}, 'Capture PNG ; copier le lien de débogage ; plein écran ; cette aide')),
    h('div', { class: 'hint' }, 'Le lien de débogage contient le modèle, l\'angle, la distance, la lumière et les options d\'affichage : à joindre à un rapport de bug pour que l\'on voie exactement la même chose. L\'adresse de la page se met aussi à jour en continu.'));

  const top = h('header', { id: 'top', class: 'hud' },
    embed ? null : h('a', { class: 'back', href: 'wiki.html', title: 'Retour au wiki' }, '← Wiki'),
    embed ? null : h('button', { class: 'ico', title: 'Précédent ([)', onclick: () => step(-1) }, '‹'),
    select,
    embed ? null : h('button', { class: 'ico', title: 'Suivant (])', onclick: () => step(1) }, '›'));

  root.append(top, infoBox, side, bar, toast, help);
  if (embed) { document.body.classList.add('embed'); side.classList.add('hidden'); }
  else if (innerWidth > 1100) side.classList.add('open');

  // ---- keep the controls in step with the state ----
  function buildModelBox() {
    modelBox.replaceChildren();
    const kind = kindOf(st.subject);
    if (kind === 'ship') {
      const dmg = h('select', { onchange: (e) => scene.set({ damage: e.target.value }) }, Object.entries(DAMAGE).map(([k, v]) => h('option', { value: k }, 'État : ' + v.toLowerCase())));
      btns.damage = dmg;
      modelBox.append(dmg,
        range('train', 'Tourelles : rotation', -180, 180, 5, (v) => v + '°'),
        range('elev', 'Canons : élévation', 0, 60, 1, (v) => v + '°'));
      const slots = scene.subject.slots;
      if (slots) modelBox.append(range('parked', 'Avions sur le pont', 0, slots, 1, (v) => v, (v) => v));
    } else {
      modelBox.append(kind === 'plane' ? check('gear', 'Train sorti, crosse baissée') : null, kind === 'plane' ? check('ord', 'Bombe ou torpille') : null,
        kind === 'plane' ? range('fold', 'Ailes repliées', 0, 1, 0.05, (v) => Math.round(v * 100) + '%') : null,
        range('bank', 'Roulis', -90, 90, 1, (v) => v + '°'), range('pitch', 'Assiette', -60, 60, 1, (v) => v + '°'), range('alt', 'Altitude', 5, 120, 1, (v) => v + ' m'));
    }
  }
  let builtFor = null;
  function sync() {
    if (builtFor !== st.subject) { builtFor = st.subject; select.value = st.subject; buildModelBox(); fillInfo(); }
    for (const [k, i] of Object.entries(checks)) if (i.isConnected) i.checked = !!st[k];
    for (const [k, i] of Object.entries(ranges)) {
      if (!i.isConnected) continue;
      let v = st[k];
      if (k === 'sunEl') v = st.sunEl != null ? st.sunEl : engine.P.sunElev;
      if (k === 'sunAz') v = st.sunFollow ? engine.P.sunAzim : st.sunAz;
      if (k === 'parked' && v < 0) v = scene.subject.slots;
      i.value = v;
      const o = outs[k]; o.out.textContent = o.fmt(Number(i.value));
    }
    ranges.sunAz && (ranges.sunAz.disabled = st.sunFollow);
    if (btns.damage && btns.damage.isConnected) btns.damage.value = st.damage;
    lightButtons.forEach((b) => b.classList.toggle('on', b.dataset.light === st.light));
    rotBtn.classList.toggle('on', !!st.auto);
    resSel.value = String(st.scale);
  }
  function fillInfo() {
    const kind = kindOf(st.subject);
    if (kind === 'ship') {
      const s = BY_ID[st.subject];
      infoBox.replaceChildren(h('b', {}, shipName(st.subject)), h('span', {}, `${nationName(s.nation)} · ${typeName(s.type).toLowerCase()}`),
        h('span', {}, `${s.loa.toLocaleString('fr-FR')} m · ${s.displacementStd.toLocaleString('fr-FR')} t`),
        embed ? null : h('a', { href: `wiki.html#/${s.nation.toLowerCase()}/${s.id}` }, 'Fiche détaillée'));
    } else {
      const s = aircraftSpec(st.subject);
      infoBox.replaceChildren(h('b', {}, s.name), h('span', {}, `${nationName(s.nation)} · ${(ROLE_NAMES[s.role] || '').toLowerCase()}`), h('span', {}, `${s.L.toLocaleString('fr-FR')} m × ${s.span.toLocaleString('fr-FR')} m d'envergure`),
        embed ? null : h('a', { href: 'wiki.html#/aviation' }, 'Fiche détaillée'));
    }
    document.title = (kind === 'ship' ? shipName(st.subject) : aircraftSpec(st.subject).name) + ' — Visualiseur 3D';
  }
  scene.onChange(sync);
  sync();

  // keep the address bar a shareable link (debounced)
  if (!embed) {
    let t = 0;
    scene.onChange(() => { clearTimeout(t); t = setTimeout(() => history.replaceState(null, '', '?' + toQuery(st).toString()), 400); });
    setInterval(() => { if (st.auto) { clearTimeout(t); t = setTimeout(() => history.replaceState(null, '', '?' + toQuery(st).toString()), 400); } }, 1000);
  }

  // ---- keyboard ----
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input[type=text], textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.target.tagName === 'SELECT' && k !== 'escape') return;
    let used = true;
    if (k === 'r') scene.frame();
    else if (k === 'o') scene.set({ ocean: !st.ocean });
    else if (k === 's') scene.set({ shadows: !st.shadows });
    else if (k === ' ') scene.set({ auto: st.auto ? 0 : 12 });
    else if (k === 'p') shoot();
    else if (k === 'c') copyLink();
    else if (k === 'f') { if (!embed) fullscreen(); }
    else if (k === 'h' || k === '?') help.classList.toggle('hidden');
    else if (k === '[') step(-1);
    else if (k === ']') step(1);
    else if (k === 'escape') help.classList.add('hidden');
    else if (/^[1-7]$/.test(k)) scene.view(VIEWS[Number(k) - 1][0]);
    else used = false;
    if (used) e.preventDefault();
  });

  return { say, sync, copyLink, shoot, debugUrl };
}
