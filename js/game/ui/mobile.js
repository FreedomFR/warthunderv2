// The touch interface: a compact top bar and a menu in place of the desktop buttons, panels that open on demand, a virtual stick for the free camera and
// the map, full screen in landscape, and the screen kept awake. The desktop interface is not changed: this module presses its buttons and sets classes on <body>.
import { MOBILE_CSS } from './mobileStyle.js';

const SPEEDS = [0.5, 1, 2, 4, 8];
const KEY_CODES = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];

/** The keys of the free camera that a stick pushed by (dx, dy) (each -1..1, y down) holds down. */
export function joyKeys(dx, dy, dead = 0.28) {
  const k = [];
  if (dy < -dead) k.push('KeyW'); else if (dy > dead) k.push('KeyS');
  if (dx < -dead) k.push('KeyA'); else if (dx > dead) k.push('KeyD');
  return k;
}

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); }
  for (const c of kids) e.append(c);
  return e;
};

export function initMobile(game, ui) {
  const body = document.body;
  body.classList.add('mobile');
  document.head.append(el('style', { id: 'mobile-css' }, MOBILE_CSS));
  const rig = game.camera;
  const press = (label) => { for (const b of document.querySelectorAll('#topbar button')) if (b.textContent.trim().startsWith(label)) { b.click(); return; } };
  // the impact log starts hidden on a small screen (the menu brings it back)
  press('Impacts');
  // the map too (it would sit over the stick of the free camera): the menu shows it
  ui.minimap?.setSize(2);

  // ---- top bar ----
  const clockSrc = document.querySelector('#topbar .clock');
  const clock = el('span', { class: 'clock' }, '00:00');
  const pause = el('button', { class: 'mb', onclick: () => game.togglePause() }, '⏸');
  const speed = el('button', { class: 'mb', onclick: () => { const i = SPEEDS.indexOf(game.timeScale); game.paused = false; game.setTimeScale(SPEEDS[(i + 1) % SPEEDS.length]); } }, '1×');
  const menuBtn = el('button', { class: 'mb', onclick: () => toggleMenu() }, '☰');
  const bar = el('div', { id: 'mbar' }, pause, speed, clock, el('span', { class: 'grow' }), menuBtn);

  // ---- menu ----
  const menu = el('div', { id: 'mmenu', class: 'panel hidden' });
  const items = [];
  const item = (label, fn, o = {}) => {
    const b = el('button', { onclick: () => { fn(b); if (!o.keep) toggleMenu(false); } }, label);
    menu.append(b); items.push({ b, o }); return b;
  };
  const toggleClass = (cls) => (b) => b.classList.toggle('on', body.classList.toggle(cls));
  item('Flottes', () => press('Flottes'));
  item('Fiche du navire', toggleClass('m-info'), { keep: true });
  item('Équipes', toggleClass('m-teams'), { keep: true });
  item('Impacts', (b) => { press('Impacts'); b.classList.toggle('on'); }, { keep: true });
  item('Noms', () => press('Noms'));
  item('Carte', (b) => { const m = ui.minimap; if (m) { m.setSize(m.visible ? 2 : 0); b.classList.toggle('on', m.visible); } }, { keep: true });
  item('Tableau', () => press('Tableau'));
  const planeView = item('Vue de l\'avion', () => rig.nextPlaneView?.());
  item('Son', (b) => { press('Son'); b.textContent = document.getElementById('btn-sound')?.textContent || 'Son'; }, { keep: true });
  item('Réglages', () => press('Réglages'));
  item('Plein écran', () => fullscreen());
  item('Aide', () => press('?'));
  menu.append(el('a', { href: 'wiki.html' }, 'Wiki'), el('a', { href: 'viewer.html' }, 'Visualiseur 3D'));
  function toggleMenu(on) { const show = on === undefined ? menu.classList.contains('hidden') : on; menu.classList.toggle('hidden', !show); }

  // ---- virtual stick (free camera, map) ----
  const knob = el('i');
  const joy = el('div', { id: 'joy', class: 'hidden' }, knob);
  let held = new Set();
  const hold = (keys) => { for (const k of KEY_CODES) rig.keys[k] = keys.includes(k); held = new Set(keys); };
  const stick = (e) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    hold(joyKeys(dx, dy));
  };
  joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); stick(e); e.preventDefault(); });
  joy.addEventListener('pointermove', (e) => { if (joy.hasPointerCapture(e.pointerId)) stick(e); });
  const release = () => { knob.style.transform = ''; hold([]); };
  joy.addEventListener('pointerup', release); joy.addEventListener('pointercancel', release);
  const hb = (label, code, toggle = false) => {
    const b = el('button', {}, label);
    const set = (v) => { rig.keys[code] = v; b.classList.toggle('on', v); };
    if (toggle) b.addEventListener('click', () => set(!rig.keys[code]));
    else { b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); set(true); e.preventDefault(); }); b.addEventListener('pointerup', () => set(false)); b.addEventListener('pointercancel', () => set(false)); }
    return b;
  };
  const jbtns = el('div', { id: 'jbtns', class: 'hidden' }, hb('▲', 'Space'), hb('▼', 'ControlLeft'), hb('»', 'ShiftLeft', true));

  // ---- full screen, landscape, screen kept awake ----
  async function fullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape').catch(() => {});
    } catch (e) { /* refused: the page stays as it is */ }
  }
  let wake = null;
  async function keepAwake() { try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* not allowed here */ } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && game.state === 'running') keepAwake(); });
  // the browser menu and the system gestures should not scroll or zoom the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- a hint in portrait (once) ----
  let seen = false;
  try { seen = localStorage.getItem('naval.mobileHint') === '1'; } catch (e) { /* storage blocked */ }
  const hint = el('div', { id: 'mhint', class: 'panel hidden' }, 'Le jeu se joue mieux avec le téléphone en travers.',
    el('br'), el('button', { class: 'btn primary', onclick: () => { fullscreen(); closeHint(); } }, 'Plein écran en paysage'), el('button', { class: 'btn', onclick: () => closeHint() }, 'Plus tard'));
  function closeHint() { hint.classList.add('hidden'); try { localStorage.setItem('naval.mobileHint', '1'); } catch (e) { /* storage blocked */ } }
  if (!seen && innerHeight > innerWidth) hint.classList.remove('hidden');

  // ---- the panels that the desktop buttons open get a cross to close them ----
  const closer = (id, fn) => { const panel = document.getElementById(id); if (panel) panel.prepend(el('button', { class: 'mclose', 'aria-label': 'Fermer', onclick: fn }, '✕')); };
  closer('settings', () => document.getElementById('settings').classList.add('hidden'));
  closer('setup', () => document.getElementById('setup').classList.add('collapsed'));

  document.getElementById('ui').append(bar, menu, joy, jbtns, hint);

  // ---- every frame ----
  const base = ui.update;
  let t = 0;
  ui.update = (dt, now) => {
    base(dt, now);
    t += dt; if (t < 0.15) return; t = 0;
    if (clockSrc) clock.textContent = clockSrc.textContent;
    pause.textContent = game.paused ? '▶' : '⏸';
    speed.textContent = game.timeScale + '×';
    const ctl = rig.mode === 'free' || rig.mode === 'tactical';
    joy.classList.toggle('hidden', !ctl);
    jbtns.classList.toggle('hidden', rig.mode !== 'free');
    if (!ctl && held.size) release();
    planeView.style.display = rig.mode === 'plane' ? '' : 'none';
    if (game.state === 'running') keepAwake();
  };
}
