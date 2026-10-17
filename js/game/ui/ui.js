// DOM user interface (French): fleet setup, HUD, labels, kill feed, results, settings.
import { NATIONS, TYPES, ALL_SHIPS, BY_ID, shipsOf, typeName, nationName } from '../data/ships.js';
import { PRESETS } from '../scenarios.js';
import { TEAM_COLORS } from '../sim/world.js';
import { shipNames } from '../sim/shipdata.js';
import { CAMERA_MODES } from './cameras.js';
import { SLIDERS } from '../../engine.js';
import { clamp, R2D } from '../math.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const KN = 0.514444;

/** Short technical description of a ship class from its spec sheet. */
function describe(spec) {
  const m = spec.main;
  const sec = (spec.secondary || []).filter((s) => s.caliberMm >= 70).map((s) => `${s.mounts * s.gunsPerMount} × ${s.caliberMm} mm`).join(', ');
  const parts = [
    `${spec.className} — ${Math.round(spec.loa)} m × ${Math.round(spec.beam)} m, ${Math.round(spec.displacementFull).toLocaleString('fr-FR')} t, ${Math.round(spec.speedKn)} nœuds`,
    `${m.gunsTotal} × ${m.caliberMm} mm` + (sec ? ` · ${sec}` : ''),
  ];
  if (spec.torpedoes && spec.torpedoes.tubes) parts.push(`${spec.torpedoes.tubes} tubes lance-torpilles de ${spec.torpedoes.caliberMm} mm`);
  if (spec.type === 'CV' && spec.aircraft) parts.push(`Groupe aérien : environ ${spec.aircraft.capacity} appareils`);
  if (spec.armour && spec.armour.beltMm) parts.push(`Ceinture ${spec.armour.beltMm} mm · pont ${spec.armour.deckMm ?? '?'} mm`);
  return parts;
}

export function createUI(game) {
  const engine = game.engine, world = game.world;
  const root = document.getElementById('ui');
  const ui = {};
  const state = { labels: true, hudHidden: false, selectedShip: null, killFeed: [], dirty: false, firstSpawn: false };

  // =========================================================================================
  // Setup panel
  // =========================================================================================
  const teamsBox = h('div', { class: 'teams' });
  const infoCard = h('div', { class: 'card info' });
  const btnSpawn = h('button', { class: 'btn primary', onclick: () => doSpawn() }, 'Faire apparaître les flottes');
  const btnStart = h('button', { class: 'btn go', disabled: true, onclick: () => { game.start(); } }, 'Lancer le combat');
  const sepVal = h('output', {}, '12 km');
  const sepInput = h('input', { type: 'range', min: 4, max: 25, step: 0.5, value: 12, oninput: (e) => { game.config.sep = Number(e.target.value) * 1000; sepVal.textContent = e.target.value + ' km'; changed(); } });
  const seedInput = h('input', { type: 'number', value: game.config.seed, style: 'width:84px', onchange: (e) => { game.config.seed = Number(e.target.value) | 0; changed(); } });
  const presetSel = h('select', { onchange: () => {} }, h('option', { value: '' }, '— Choisir un scénario —'), PRESETS.map((p) => h('option', { value: p.id }, p.name)));
  const setup = h('div', { id: 'setup', class: 'panel' },
    h('div', { class: 'title' }, h('span', { class: 'big' }, 'Combat naval'), h('span', { class: 'sub' }, 'Simulation de la Seconde Guerre mondiale')),
    h('div', { class: 'row' }, presetSel, h('button', { class: 'btn', onclick: () => loadPreset(presetSel.value) }, 'Charger')),
    teamsBox,
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => addTeam() }, '+ Équipe'), h('button', { class: 'btn small', onclick: () => randomize() }, 'Flottes aléatoires'), h('button', { class: 'btn small', onclick: () => { game.config.seed = (Math.random() * 1e6) | 0; seedInput.value = game.config.seed; changed(); } }, 'Nouvelle graine')),
    h('label', { class: 'slider' }, h('span', {}, 'Distance entre les flottes'), sepInput, sepVal),
    h('label', { class: 'slider' }, h('span', {}, 'Graine du combat'), seedInput, h('span')),
    infoCard,
    h('div', { class: 'row' }, btnSpawn, btnStart),
    h('div', { class: 'hint' }, 'Faites apparaître les flottes pour les voir sur l\'eau, changez de caméra (1-7), puis lancez le combat : l\'IA pilote tous les navires.'),
  );

  function ensureTeams() {
    if (!game.config.teams.length) {
      const p = PRESETS[0];
      game.config.teams = p.teams.map((t, i) => ({ name: t.name, rgb: TEAM_COLORS[i].rgb, entries: t.entries.map((x) => ({ ...x })) }));
    }
  }

  function renderTeams() {
    ensureTeams();
    teamsBox.replaceChildren(...game.config.teams.map((t, ti) => {
      const nationSel = h('select', {}, NATIONS.map((n) => h('option', { value: n.id }, n.name)));
      const classSel = h('select', {});
      const countIn = h('input', { type: 'number', min: 1, max: 9, value: 1, style: 'width:46px' });
      const fillClasses = () => {
        classSel.replaceChildren(...shipsOf(nationSel.value).map((s) => h('option', { value: s.id }, `${typeName(s.type)} — ${s.className.replace(/ class$/i, '')}`)));
        showInfo(classSel.value);
      };
      nationSel.addEventListener('change', fillClasses);
      classSel.addEventListener('change', () => showInfo(classSel.value));
      fillClasses();
      const rows = t.entries.map((e, ei) => {
        const spec = BY_ID[e.id];
        return h('div', { class: 'entry', onmouseenter: () => showInfo(e.id) },
          h('span', { class: 'cnt' }, '×' + e.count),
          h('span', { class: 'nm' }, h('b', {}, spec.className.replace(/ class$/i, '')), h('small', {}, ` ${nationName(spec.nation)} · ${typeName(spec.type)}`)),
          h('button', { class: 'ico', title: 'Retirer un navire', onclick: () => { e.count--; if (e.count <= 0) t.entries.splice(ei, 1); changed(); renderTeams(); } }, '−'),
          h('button', { class: 'ico', title: 'Ajouter un navire', onclick: () => { e.count = Math.min(9, e.count + 1); changed(); renderTeams(); } }, '+'),
        );
      });
      const total = t.entries.reduce((a, e) => a + e.count, 0);
      return h('div', { class: 'team', style: `--tc:${css(t.rgb)}` },
        h('div', { class: 'thead' },
          h('span', { class: 'sw' }),
          h('input', { class: 'tname', value: t.name, onchange: (e) => { t.name = e.target.value; changed(); } }),
          h('span', { class: 'tcount' }, total + (total > 1 ? ' navires' : ' navire')),
          game.config.teams.length > 2 ? h('button', { class: 'ico', title: 'Supprimer l\'équipe', onclick: () => { game.config.teams.splice(ti, 1); changed(); renderTeams(); } }, '✕') : null),
        ...rows,
        h('div', { class: 'add' }, nationSel, classSel, countIn, h('button', { class: 'btn small', onclick: () => {
          const id = classSel.value, n = clamp(Number(countIn.value) || 1, 1, 9);
          const ex = t.entries.find((e) => e.id === id);
          if (ex) ex.count = Math.min(9, ex.count + n); else t.entries.push({ id, count: n });
          changed(); renderTeams();
        } }, 'Ajouter')),
      );
    }));
  }

  function showInfo(id) {
    const spec = BY_ID[id];
    if (!spec) return;
    const names = shipNames({ classShips: spec.classShips, refShip: spec.refShip, nation: spec.nation }).slice(0, 5).join(', ');
    infoCard.replaceChildren(
      h('div', { class: 'ititle' }, nationName(spec.nation) + ' — ' + typeName(spec.type)),
      ...describe(spec).map((l, i) => h('div', { class: i === 0 ? 'iline strong' : 'iline' }, l)),
      h('div', { class: 'iline dim' }, 'Navires de la classe : ' + names),
    );
  }

  function addTeam() {
    if (game.config.teams.length >= 4) return;
    const i = game.config.teams.length;
    game.config.teams.push({ name: TEAM_COLORS[i].name, rgb: TEAM_COLORS[i].rgb, entries: [{ id: 'fletcher', count: 2 }] });
    changed(); renderTeams();
  }
  function loadPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    game.config.teams = p.teams.map((t, i) => ({ name: t.name, rgb: TEAM_COLORS[i].rgb, entries: t.entries.map((x) => ({ ...x })) }));
    changed(); renderTeams();
    doSpawn();
  }
  function randomize() {
    const n = game.config.teams.length || 2;
    const nations = NATIONS.map((x) => x.id);
    game.config.teams = Array.from({ length: n }, (_, i) => {
      const nat = nations[Math.floor(Math.random() * nations.length)];
      const entries = [];
      const pool = shipsOf(nat);
      const bigs = pool.filter((s) => ['BB', 'CV'].includes(s.type));
      entries.push({ id: bigs[Math.floor(Math.random() * bigs.length)].id, count: 1 });
      for (const s of pool.filter((x) => ['CA', 'CL'].includes(x.type))) if (Math.random() < 0.6) entries.push({ id: s.id, count: 1 + Math.floor(Math.random() * 2) });
      entries.push({ id: pool.find((s) => s.type === 'DD').id, count: 1 + Math.floor(Math.random() * 3) });
      return { name: TEAM_COLORS[i].name, rgb: TEAM_COLORS[i].rgb, entries };
    });
    changed(); renderTeams();
  }

  let respawnTimer = 0;
  function changed() {
    // once the fleets are on the water, edits update them live
    if (game.state === 'ready') { clearTimeout(respawnTimer); respawnTimer = setTimeout(() => { game.spawn(true); }, 200); }
  }
  function doSpawn() {
    ensureTeams();
    game.spawn();
    camSetup();
  }
  function camSetup() { state.firstSpawn = true; }

  // =========================================================================================
  // HUD
  // =========================================================================================
  const clock = h('span', { class: 'clock' }, '00:00');
  const fpsEl = h('span', { class: 'fps' }, '');
  const speedBtns = [0, 0.5, 1, 2, 4, 8].map((s) => h('button', { class: 'btn tiny', 'data-s': s, onclick: () => { if (s === 0) game.togglePause(); else { game.paused = false; game.setTimeScale(s); } } }, s === 0 ? '⏸' : s + '×'));
  const topbar = h('div', { id: 'topbar', class: 'hud' }, clock, h('span', { class: 'sp' }, speedBtns), fpsEl,
    h('button', { class: 'btn tiny', title: 'Composer les flottes', onclick: () => setup.classList.toggle('collapsed') }, 'Flottes'),
    h('button', { class: 'btn tiny', id: 'btn-sound', title: 'Son (M)', onclick: () => toggleSound() }, 'Son'),
    h('button', { class: 'btn tiny', title: 'Plaques de nom (L)', onclick: () => { state.labels = !state.labels; } }, 'Noms'),
    h('button', { class: 'btn tiny', title: 'Réglages (H)', onclick: () => toggleSettings() }, 'Réglages'),
    h('button', { class: 'btn tiny', title: 'Aide (F1)', onclick: () => helpEl.classList.toggle('hidden') }, '?'));
  const teamsHud = h('div', { id: 'teamshud', class: 'hud' });
  const camBar = h('div', { id: 'cambar', class: 'hud' }, CAMERA_MODES.map((m) => h('button', { class: 'cam', 'data-id': m.id, title: m.hint, onclick: () => game.camera.setMode(m.id) }, h('b', {}, m.key), ' ' + m.name)),
    h('button', { class: 'cam', title: 'Navire précédent (B)', onclick: () => game.camera.pickTarget(-1) }, '◀'), h('button', { class: 'cam', title: 'Navire suivant (N / Tab)', onclick: () => game.camera.pickTarget(1) }, '▶'));
  const shipInfo = h('div', { id: 'shipinfo', class: 'hud' });
  const feed = h('div', { id: 'feed', class: 'hud' });
  const labelsBox = h('div', { id: 'labels' });
  const banner = h('div', { id: 'banner', class: 'hidden' });

  // ---- results ----
  const results = h('div', { id: 'results', class: 'hidden panel' });

  // ---- help ----
  const helpEl = h('div', { id: 'help', class: 'panel hidden', onclick: () => helpEl.classList.add('hidden') },
    h('div', { class: 'title' }, h('span', { class: 'big' }, 'Commandes')),
    h('div', { class: 'helpgrid' },
      h('b', {}, '1 – 7'), h('span', {}, 'Caméras : auto, poursuite, orbite, passerelle, obus, tactique, libre'),
      h('b', {}, 'N / B  ·  Tab'), h('span', {}, 'Navire suivant / précédent (clic sur un navire = le sélectionner)'),
      h('b', {}, 'Glisser / molette'), h('span', {}, 'Orbiter autour du navire, zoom (altitude en vue tactique, vitesse en caméra libre)'),
      h('b', {}, 'ZQSD / WASD, Espace, Ctrl, Maj'), h('span', {}, 'Déplacement en caméra libre (Maj = rapide)'),
      h('b', {}, 'Espace  ·  , .'), h('span', {}, 'Pause ; ralentir / accélérer le temps (0,5× à 8×)'),
      h('b', {}, 'L  ·  M  ·  H  ·  F1'), h('span', {}, 'Plaques de nom ; son ; réglages océan et ciel ; cette aide'),
      h('b', {}, 'Contrôle manuel'), h('span', {}, 'Prévu : tous les navires utilisent déjà les mêmes commandes que l\'IA (voir js/game/sim/controllers/manual.js).')),
    h('div', { class: 'hint' }, 'Cliquer pour fermer'));

  // ---- settings ----
  const settings = h('div', { id: 'settings', class: 'panel hidden' }, h('div', { class: 'title' }, h('span', { class: 'big' }, 'Réglages')));
  {
    const scaleVal = h('output', {}, Math.round(engine.getRenderScale() * 100) + '%');
    settings.append(h('label', { class: 'slider' }, h('span', {}, 'Ombres des navires'), h('input', { type: 'checkbox', checked: game.shadowsOn, onchange: (e) => { game.shadowsOn = e.target.checked; } }), h('span')));
    settings.append(h('label', { class: 'slider' }, h('span', {}, 'Résolution de rendu'), h('input', { type: 'range', min: 0.4, max: 1.5, step: 0.05, value: engine.getRenderScale(), oninput: (e) => { engine.setRenderScale(Number(e.target.value)); scaleVal.textContent = Math.round(e.target.value * 100) + '%'; } }), scaleVal));
    for (const [key, label, min, max, step, kind] of SLIDERS) {
      const val = h('output', {}, String(engine.P[key]));
      settings.append(h('label', { class: 'slider' }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: engine.P[key], oninput: (e) => { engine.P[key] = Number(e.target.value); val.textContent = e.target.value; engine.markDirty(kind); } }), val));
    }
  }
  function toggleSettings() { settings.classList.toggle('hidden'); }
  function toggleSound() {
    game.audio.unlock();
    const muted = game.audio.toggleMute();
    document.getElementById('btn-sound').textContent = muted ? 'Son coupé' : 'Son';
  }
  if (game.audio.muted) setTimeout(() => { const b = document.getElementById('btn-sound'); if (b) b.textContent = 'Son coupé'; }, 0);

  root.append(setup, topbar, teamsHud, camBar, shipInfo, feed, labelsBox, banner, results, helpEl, settings);
  setHudVisible(false);

  function setHudVisible(v) {
    for (const el of [topbar, teamsHud, camBar, shipInfo, feed]) el.classList.toggle('hidden', !v || state.hudHidden);
  }

  // =========================================================================================
  // events from the game
  // =========================================================================================
  ui.onSpawn = () => {
    btnStart.disabled = false;
    btnSpawn.textContent = 'Relancer le placement';
    results.classList.add('hidden'); banner.classList.add('hidden');
    setHudVisible(true);
    buildTeamsHud();
    camBar.classList.remove('hidden');
  };
  ui.onStart = () => {
    setup.classList.add('collapsed');
    btnStart.disabled = true;
    showBanner('Que le combat commence !');
    state.killFeed.length = 0;
  };
  ui.onReset = () => { setup.classList.remove('collapsed'); setHudVisible(false); btnStart.disabled = true; btnSpawn.textContent = 'Faire apparaître les flottes'; };
  ui.onFinished = () => {
    showResults();
  };
  ui.onTimeScale = () => refreshSpeed();
  ui.onPause = () => refreshSpeed();
  ui.onCameraMode = (id) => { for (const b of camBar.querySelectorAll('.cam[data-id]')) b.classList.toggle('on', b.dataset.id === id); };
  ui.onTarget = (s) => { state.selectedShip = s; };

  function refreshSpeed() {
    for (const b of speedBtns) {
      const s = Number(b.dataset.s);
      b.classList.toggle('on', s === 0 ? game.paused : !game.paused && game.timeScale === s);
    }
  }
  refreshSpeed();

  function showBanner(text, ms = 3200) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    clearTimeout(showBanner.t);
    showBanner.t = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  const verbs = { magazine: 'a fait exploser', torpedo: 'a torpillé', bomb: 'a bombardé', shell: 'a coulé', fire: 'a incendié', flood: 'a envoyé par le fond', turret: 'a détruit', collision: 'a éperonné', blast: 'a anéanti' };
  ui.onEvents = (events) => {
    for (const e of events) {
      if (e.type !== 'sinking') continue;
      const v = e.ship;
      const killer = v.killedBy;
      const tc = world.teams[v.team];
      const text = killer ? `${killer.name} ${verbs[v.cause] || 'a coulé'} ${v.name}` : `${v.name} sombre`;
      state.killFeed.push({ t: performance.now(), text, c1: killer && world.teams[killer.team] ? css(world.teams[killer.team].rgb) : '#ccc', c2: css(tc.rgb), v, killer });
      if (state.killFeed.length > 6) state.killFeed.shift();
    }
  };

  // ---- team panel ----
  let teamRows = [];
  function buildTeamsHud() {
    teamRows = [];
    const cols = [];
    world.teams.forEach((t, ti) => {
      if (!t) return;
      const ships = world.ships.filter((s) => s.team === ti);
      const head = h('div', { class: 'thud-head', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'sw' }), h('b', {}, t.name), h('span', { class: 'alive' }));
      const rows = ships.map((s) => {
        const bar = h('i', {});
        const row = h('div', { class: 'srow', onclick: () => { game.camera.setTarget(s); if (['free', 'tactical'].includes(game.camera.mode)) game.camera.setMode('follow'); } },
          h('span', { class: 'ty' }, s.stats.type), h('span', { class: 'sn' }, s.name), h('span', { class: 'hpbar' }, bar));
        return { s, row, bar };
      });
      cols.push(h('div', { class: 'tcol' }, head, ...rows.map((r) => r.row)));
      teamRows.push({ t, ti, head, rows });
    });
    teamsHud.replaceChildren(...cols);
  }

  // =========================================================================================
  // per-frame update
  // =========================================================================================
  let uiT = 0, labelEls = new Map();
  ui.update = (dt) => {
    uiT += dt;
    if (uiT < 0.1) { updateLabels(); return; }
    uiT = 0;
    if (game.state === 'running' || game.state === 'finished') clock.textContent = fmtTime(world.time);
    else clock.textContent = '00:00';
    const st = engine.stats;
    fpsEl.textContent = st.fps ? `${st.fps.toFixed(0)} i/s` : '';
    // team panel
    for (const tr of teamRows) {
      let alive = 0;
      for (const r of tr.rows) {
        const s = r.s;
        const f = s.alive ? s.hpFrac : 0;
        if (s.alive) alive++;
        r.bar.style.width = (f * 100).toFixed(0) + '%';
        r.bar.style.background = f > 0.55 ? '#5ec26a' : f > 0.25 ? '#e0b43a' : '#d9534f';
        r.row.classList.toggle('dead', !s.alive);
        r.row.classList.toggle('sel', s === game.camera.target);
      }
      tr.head.querySelector('.alive').textContent = `${alive}/${tr.rows.length}`;
    }
    // kill feed
    const now = performance.now();
    state.killFeed = state.killFeed.filter((k) => now - k.t < 9000);
    feed.replaceChildren(...state.killFeed.map((k) => h('div', { class: 'kline' }, h('span', { style: `color:${k.c1}` }, k.text.split(' ')[0] === k.v.name.split(' ')[0] ? '' : ''), h('span', {}, k.text), h('i', { style: `background:${k.c2}` }))));
    // selected ship
    updateShipInfo();
    for (const b of camBar.querySelectorAll('.cam[data-id]')) b.classList.toggle('on', b.dataset.id === game.camera.mode);
  };

  function updateShipInfo() {
    const s = game.camera.target;
    if (!s || game.state === 'setup') { shipInfo.replaceChildren(); return; }
    const t = world.teams[s.team];
    const mainMounts = s.mounts.filter((m) => m.group === 'main');
    const mainAlive = mainMounts.filter((m) => m.alive).length;
    const ready = mainMounts.filter((m) => m.alive && m.reload <= 0.01).length;
    const target = s.cmd.main.target;
    const acc = s.shotsFired ? Math.round(100 * s.shotsHit / s.shotsFired) : 0;
    const lines = [
      h('div', { class: 'si-head', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'sw' }), h('b', {}, s.name), h('small', {}, ` ${typeName(s.stats.type)} · ${s.stats.className}`)),
      h('div', { class: 'si-bar' }, h('i', { style: `width:${(s.hpFrac * 100).toFixed(0)}%;background:${s.hpFrac > 0.55 ? '#5ec26a' : s.hpFrac > 0.25 ? '#e0b43a' : '#d9534f'}` })),
      h('div', { class: 'si-grid' },
        h('span', {}, 'Structure'), h('b', {}, `${Math.round(s.hp)} / ${s.stats.maxHp}`),
        h('span', {}, 'Vitesse'), h('b', {}, `${(s.speed / KN).toFixed(0)} nœuds`),
        h('span', {}, 'Cap'), h('b', {}, `${((s.heading * R2D % 360 + 360) % 360).toFixed(0)}°`),
        h('span', {}, 'Artillerie'), h('b', {}, `${mainAlive}/${mainMounts.length} tourelles, ${ready} prêtes`),
        h('span', {}, 'Cible'), h('b', {}, target && target.alive ? `${target.name} (${(Math.hypot(target.x - s.x, target.z - s.z) / 1000).toFixed(1)} km)` : '—'),
        h('span', {}, 'Incendies'), h('b', {}, String(s.fires.length)),
        h('span', {}, 'Tirs / touches'), h('b', {}, `${s.shotsFired} / ${s.shotsHit} (${acc}%)`),
        h('span', {}, 'Coulés'), h('b', {}, String(s.kills)),
      ),
      s.state !== 'afloat' ? h('div', { class: 'si-state' }, 'NAVIRE COULÉ') : null,
    ];
    shipInfo.replaceChildren(...lines.filter(Boolean));
  }

  function updateLabels() {
    if (!state.labels || game.state === 'setup') { for (const el of labelEls.values()) el.style.display = 'none'; return; }
    const out = [0, 0, 0];
    const cam = engine.cam;
    const seen = new Set();
    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      let el = labelEls.get(s.id);
      if (!el) {
        const t = world.teams[s.team];
        el = h('div', { class: 'lab', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'dot' }), h('span', { class: 'ln' }), h('span', { class: 'ld' }), h('span', { class: 'lbar' }, h('i', {})));
        el.querySelector('.ln').textContent = s.name;
        labelsBox.append(el);
        labelEls.set(s.id, el);
      }
      seen.add(s.id);
      const p = engine.project(s.x, s.y + s.model.topY + 10, s.z, out);
      const dist = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
      if (!p || dist < 60 || out[0] < -50 || out[0] > innerWidth + 50 || out[1] < -30 || out[1] > innerHeight + 30) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${out[0].toFixed(0)}px, ${out[1].toFixed(0)}px) translate(-50%, -100%)`;
      const sel = s === game.camera.target;
      el.classList.toggle('sel', sel);
      el.classList.toggle('far', dist > 6000 && !sel);
      el.classList.toggle('dead', !s.alive);
      el.querySelector('.ld').textContent = dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
      const bar = el.querySelector('.lbar i');
      bar.style.width = (s.alive ? s.hpFrac * 100 : 0).toFixed(0) + '%';
    }
    for (const [id, el] of labelEls) if (!seen.has(id)) { el.remove(); labelEls.delete(id); }
  }

  // =========================================================================================
  // results
  // =========================================================================================
  function showResults() {
    const w = world;
    const wt = w.winner != null ? w.teams[w.winner] : null;
    const rows = w.ships.slice().sort((a, b) => b.damageDealt - a.damageDealt);
    results.replaceChildren(
      h('div', { class: 'title' }, h('span', { class: 'big' }, wt ? `Victoire : ${wt.name}` : 'Match nul'), h('span', { class: 'sub' }, `Durée du combat : ${fmtTime(w.time)}`)),
      h('table', {},
        h('thead', {}, h('tr', {}, ['Navire', 'Équipe', 'État', 'Dégâts', 'Tirs', 'Touches', 'Coulés'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((s) => h('tr', { class: s.alive ? '' : 'dead' },
          h('td', {}, s.name), h('td', { style: `color:${css(w.teams[s.team].rgb)}` }, w.teams[s.team].name),
          h('td', {}, s.alive ? `${Math.round(s.hpFrac * 100)} %` : 'coulé'), h('td', {}, Math.round(s.damageDealt)),
          h('td', {}, s.shotsFired), h('td', {}, s.shotsHit), h('td', {}, s.kills))))),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { results.classList.add('hidden'); game.spawn(); game.camera.setMode('orbit'); setup.classList.remove('collapsed'); btnStart.disabled = false; } }, 'Rejouer avec les mêmes flottes'),
        h('button', { class: 'btn', onclick: () => { results.classList.add('hidden'); } }, 'Continuer à observer'),
        h('button', { class: 'btn', onclick: () => { results.classList.add('hidden'); game.reset(); } }, 'Changer les flottes')),
    );
    results.classList.remove('hidden');
  }

  // =========================================================================================
  // keyboard
  // =========================================================================================
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space' && (game.state === 'running' || game.state === 'finished')) { game.togglePause(); e.preventDefault(); }
    else if (e.code === 'Period') { const steps = [0.5, 1, 2, 4, 8]; const i = steps.indexOf(game.timeScale); game.paused = false; game.setTimeScale(steps[Math.min(steps.length - 1, i + 1)] ?? 1); }
    else if (e.code === 'Comma') { const steps = [0.5, 1, 2, 4, 8]; const i = steps.indexOf(game.timeScale); game.paused = false; game.setTimeScale(steps[Math.max(0, i - 1)] ?? 1); }
    else if (e.code === 'KeyL') state.labels = !state.labels;
    else if (e.code === 'KeyM') toggleSound();
    else if (e.code === 'KeyH') toggleSettings();
    else if (e.code === 'F1') { helpEl.classList.toggle('hidden'); e.preventDefault(); }
    else if (e.code === 'KeyG') { state.hudHidden = !state.hudHidden; setHudVisible(game.state !== 'setup'); }
  });

  // buttons must not keep the keyboard focus (Space would activate them again)
  addEventListener('pointerup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  renderTeams();
  ui.doSpawn = doSpawn;
  return ui;
}
