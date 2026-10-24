// DOM user interface (French): fleet setup, HUD, labels, kill feed, results, settings.
import { shipStatus, setMeters, LEVEL_COLOR, planeText, planeLevel } from './shipstate.js';
import { NATIONS, BY_ID, shipsOf, typeName, nationName } from '../data/ships.js';
import { PRESETS } from '../scenarios.js';
import { THEATRES } from '../data/theatre.js';
import { TEAM_COLORS } from '../sim/world.js';
import { shipNames } from '../sim/shipdata.js';
import { CAMERA_MODES, PLANE_VIEWS } from './cameras.js';
import { drawDamage } from './damageView.js';
import { captionOf } from './caption.js';
import { createMinimap } from './minimap.js';
import { createReloadHud } from './reloads.js';
import { SLIDERS } from '../../engine.js';
import { BALANCE, BALANCE_FIELDS, BALANCE_MAX, setBalance, balanceOfFile, balanceDiff, balanceNow } from '../data/balance.js';
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
  if (spec.missiles && spec.missiles.length) parts.push(spec.missiles.map((m) => `${m.count} ${m.name}`).join(' · '));
  if (spec.type === 'CV' && spec.aircraft) parts.push(`Groupe aérien : environ ${spec.aircraft.capacity} appareils`);
  if (spec.armour && spec.armour.beltMm) parts.push(`Ceinture ${spec.armour.beltMm} mm · pont ${spec.armour.deckMm ?? '?'} mm`);
  return parts;
}

/** how a lost ship is described in the ship panel */
const SINK_LABEL = {
  split: 'NAVIRE BRISÉ EN DEUX', roll: 'NAVIRE CHAVIRÉ', bow: 'COULE PAR L\'AVANT', stern: 'COULE PAR L\'ARRIÈRE', level: 'NAVIRE ENVAHI PAR LES EAUX',
  burn: 'NAVIRE CONSUMÉ PAR L\'INCENDIE', scuttle: 'NAVIRE ABANDONNÉ ET SABORDÉ', blast: 'NAVIRE DÉTRUIT PAR EXPLOSION',
};

export function createUI(game) {
  const engine = game.engine, world = game.world;
  const root = document.getElementById('ui');
  const ui = {};
  const state = { shipMore: innerHeight > 860, tipShown: false, hitLog: true, hits: [], tags: [], labels: true, teams: true, reloads: true, hudHidden: false, selectedShip: null, killFeed: [], dirty: false, firstSpawn: false };

  // =========================================================================================
  // Setup panel
  // =========================================================================================
  const teamsBox = h('div', { class: 'teams' });
  const infoCard = h('div', { class: 'card info' });
  const btnSpawn = h('button', { class: 'btn primary', onclick: () => doSpawn() }, 'Faire apparaître les flottes');
  const btnStart = h('button', { class: 'btn go', disabled: true, onclick: () => { game.startWhenReady(); } }, 'Lancer le combat');
  const sepVal = h('output', {}, '12 km');
  const sepInput = h('input', { type: 'range', min: 4, max: 25, step: 0.5, value: 12, oninput: (e) => { game.config.sep = Number(e.target.value) * 1000; sepVal.textContent = e.target.value + ' km'; changed(); } });
  const seedInput = h('input', { type: 'number', value: game.config.seed, style: 'width:84px', onchange: (e) => { game.config.seed = Number(e.target.value) | 0; changed(); } });
  const islandSel = h('select', { onchange: (e) => { game.config.islands = Number(e.target.value); changed(); } }, [['0', 'Aucune'], ['1', 'Quelques-unes'], ['2', 'Archipel']].map(([v, t]) => h('option', { value: v, selected: Number(v) === game.config.islands }, t)));
  const baseSel = h('select', { title: 'Terrains d\'aviation et batteries côtières sur les îles (il faut des îles)', onchange: (e) => { game.config.bases = Number(e.target.value); changed(); } }, [['0', 'Aucune'], ['1', 'Quelques-unes'], ['2', 'Fortifiées']].map(([v, t]) => h('option', { value: v, selected: Number(v) === game.config.bases }, t)));
  const presetSel = h('select', { onchange: () => {} }, h('option', { value: '' }, '— Choisir un scénario —'), PRESETS.map((p) => h('option', { value: p.id }, p.name)));
  const theatreSel = h('select', {}, Object.values(THEATRES).map((t) => h('option', { value: t.id }, t.name)));
  const setup = h('div', { id: 'setup', class: 'panel' },
    h('div', { class: 'title' }, h('span', { class: 'big' }, 'Combat naval'), h('span', { class: 'sub' }, 'Simulation de la Seconde Guerre mondiale')),
    h('div', { class: 'row' }, h('a', { class: 'btn small', href: 'wiki.html', target: '_blank', title: 'Fiches techniques et arbres par nation' }, 'Wiki des navires'), h('a', { class: 'btn small', href: 'viewer.html', target: '_blank', title: 'Voir chaque navire et avion en 3D' }, 'Visualiseur 3D')),
    h('div', { class: 'row' }, h('button', { class: 'btn small', title: 'Une bataille filmée sous plusieurs angles, puis un rapport de performance à copier ou partager', onclick: () => startBench() }, 'Test de performance')),
    h('div', { class: 'step' }, h('b', {}, '1'), 'Un scénario tout prêt… '),
    h('div', { class: 'row' }, presetSel, h('button', { class: 'btn', onclick: () => loadPreset(presetSel.value) }, 'Charger')),
    h('div', { class: 'step' }, h('b', {}, '★'), 'Une guerre sur une très grande mer'),
    h('div', { class: 'row' }, theatreSel, h('button', { class: 'btn primary', title: 'Chaque nation a ses îles, un grand et un moyen aérodrome, ses ports et ses escadres ; personne ne voit ce que son camp ne voit pas ; les navires vont au port se ravitailler et se faire réparer', onclick: () => startTheatre() }, 'Lancer la guerre')),
    h('div', { class: 'step' }, h('b', {}, '2'), '… ou vos propres flottes'),
    teamsBox,
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => addTeam() }, '+ Équipe'), h('button', { class: 'btn small', onclick: () => randomize() }, 'Flottes aléatoires'), h('button', { class: 'btn small', onclick: () => { game.config.seed = (Math.random() * 1e6) | 0; seedInput.value = game.config.seed; changed(); } }, 'Nouvelle graine')),
    h('div', { class: 'step' }, h('b', {}, '3'), 'Le champ de bataille'),
    h('label', { class: 'slider' }, h('span', {}, 'Distance entre les flottes'), sepInput, sepVal),
    h('label', { class: 'slider' }, h('span', {}, 'Graine du combat'), seedInput, h('span')),
    h('label', { class: 'slider' }, h('span', {}, 'Îles'), islandSel, h('span')),
    h('label', { class: 'slider' }, h('span', {}, 'Bases militaires'), baseSel, h('span')),
    infoCard,
    h('div', { class: 'actions' },
      h('div', { class: 'row' }, btnSpawn, btnStart),
      h('div', { class: 'hint' }, 'Faites apparaître les flottes pour les voir sur l\'eau, puis lancez le combat : l\'IA pilote tous les navires et la caméra automatique suit l\'action.')),
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
  function startTheatre() {
    game.config.theatre = theatreSel.value || 'war';
    game.spawn();
    camSetup();
  }
  function loadPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    game.config.theatre = false;
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
    game.config.theatre = false;
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
  const scoreBtn = h('button', { class: 'btn tiny tg', title: 'Tableau de bord (Tab, maintenir)', onclick: () => { state.scoreSticky = !state.scoreSticky; refreshScore(true); refreshToggles(); } }, 'Tableau');
  // the buttons that show or hide something are lit while it is shown
  const toggleBtn = (label, title, get, set) => { const b = h('button', { class: 'btn tiny tg', title, onclick: () => { set(!get()); refreshToggles(); } }, label); b.get = get; return b; };
  const hitBtn = toggleBtn('Impacts', 'Journal des impacts (J)', () => state.hitLog, (v) => { state.hitLog = v; });
  const nameBtn = toggleBtn('Noms', 'Plaques de nom des navires (L)', () => state.labels, (v) => { state.labels = v; });
  const teamBtn = toggleBtn('Équipes', 'Liste des flottes à droite : les deux camps et leurs navires (T)', () => state.teams, (v) => { state.teams = v; setHudVisible(game.state !== 'setup'); });
  const reloadBtn = toggleBtn('Recharge', 'Jauges de rechargement des tourelles, des tubes et des missiles du navire suivi (R)', () => state.reloads, (v) => { state.reloads = v; });
  const mapBtn = toggleBtn('Carte', 'Carte : clic = suivre un navire, molette = zoom (K : petite, grande, cachée)', () => minimap.visible, () => minimap.cycle());
  const setupBtn = h('button', { class: 'btn tiny tg', title: 'Composer les flottes', onclick: () => { const open = setup.classList.toggle('collapsed') === false; if (open) settings.classList.add('hidden'); refreshToggles(); } }, 'Flottes');
  const setBtn = h('button', { class: 'btn tiny tg', title: 'Réglages (H)', onclick: () => toggleSettings() }, 'Réglages');
  const helpBtn = h('button', { class: 'btn tiny tg', title: 'Aide (F1)', onclick: () => toggleHelp() }, '?');
  function refreshToggles() {
    for (const b of [hitBtn, nameBtn, teamBtn, reloadBtn, mapBtn]) b.classList.toggle('on', !!b.get());
    scoreBtn.classList.toggle('on', !!state.scoreSticky);
    setupBtn.classList.toggle('on', !setup.classList.contains('collapsed'));
    setBtn.classList.toggle('on', !settings.classList.contains('hidden'));
    helpBtn.classList.toggle('on', !helpEl.classList.contains('hidden'));
  }
  const sep = () => h('span', { class: 'sep' });
  const topbar = h('div', { id: 'topbar', class: 'hud' }, clock, h('span', { class: 'sp' }, speedBtns), fpsEl, sep(),
    hitBtn, nameBtn, teamBtn, reloadBtn, mapBtn, scoreBtn, sep(),
    setupBtn,
    h('button', { class: 'btn tiny', id: 'btn-sound', title: 'Son (M)', onclick: () => toggleSound() }, 'Son'),
    setBtn, helpBtn);
  const teamsHud = h('div', { id: 'teamshud', class: 'hud' });
  // the cameras in groups (the whole battle, one ship, the aircraft) and the subject they follow, with the arrows to change it
  const camBtn = (id) => { const m = CAMERA_MODES.find((x) => x.id === id); return h('button', { class: 'cam', 'data-id': m.id, title: m.hint, onclick: () => game.camera.setMode(m.id, true) }, h('b', {}, m.key), ' ' + m.name); };
  const subjName = h('span', { class: 'subj-n' }, '—');
  // (with the automatic camera, the arrows mean "show me that one": the camera follows the ship picked)
  const pick = (d) => { const r = game.camera; if (inPlaneMode()) r.pickPlane(d); else { r.pickTarget(d); if (r.mode === 'auto') r.setMode('follow', true); } };
  const pickPrev = () => pick(-1), pickNext = () => pick(1);
  const subj = h('span', { class: 'subj' },
    h('button', { class: 'cam', title: 'Précédent (B)', onclick: pickPrev }, '◀'), subjName, h('button', { class: 'cam', title: 'Suivant (N)', onclick: pickNext }, '▶'));
  const camBar = h('div', { id: 'cambar', class: 'hud' },
    h('span', { class: 'cgrp', 'data-g': 'Bataille' }, camBtn('auto'), camBtn('tactical'), camBtn('free')),
    h('span', { class: 'cgrp', 'data-g': 'Navire' }, camBtn('follow'), camBtn('orbit'), camBtn('bridge'), camBtn('shell')),
    h('span', { class: 'cgrp', 'data-g': 'Avions' }, camBtn('plane')),
    subj);
  // what the camera shows, in words, above the camera bar
  const caption = h('div', { id: 'caption' });
  const tip = h('div', { id: 'tip', class: 'hud hidden' });
  const minimap = createMinimap(game, { onPick: (o) => pickFromMap(o) });
  const inPlaneMode = () => game.camera.mode === 'plane' || game.camera.mode === 'cockpit';
  const shipInfo = h('div', { id: 'shipinfo', class: 'hud' });
  const reloads = createReloadHud();                  // the reload gauges of the ship that is watched (ui/reloads.js)
  const dmgCanvas = h('canvas', { id: 'dmgview', width: 336, height: 62 });
  const planeInfo = h('div', { id: 'planeinfo', class: 'hud hidden' });
  const feed = h('div', { id: 'feed', class: 'hud' });
  const labelsBox = h('div', { id: 'labels' });
  const banner = h('div', { id: 'banner', class: 'hidden' });
  // the loading screen before a battle: the sounds are synthesised (there are no sample files), a few seconds the first time
  const loadBar = h('i'), loadText = h('span', {}, ''), loadBox = h('div', { id: 'loading', class: 'hidden' }, h('b', {}, 'Préparation des sons'), h('div', { class: 'bar' }, loadBar), loadText);

  // ---- results ----
  const results = h('div', { id: 'results', class: 'hidden panel' });

  // ---- hit log (J): what the shells did ----
  const hitlog = h('div', { id: 'hitlog', class: 'hud' });

  // ---- scoreboard (Tab) ----
  const score = h('div', { id: 'score', class: 'hidden panel' });

  // ---- help ----
  const closeX = (fn) => h('button', { class: 'pclose', title: 'Fermer (Échap)', 'aria-label': 'Fermer', onclick: (e) => { e.stopPropagation(); fn(); refreshToggles(); } }, '✕');
  const helpEl = h('div', { id: 'help', class: 'panel hidden', onclick: () => { helpEl.classList.add('hidden'); refreshToggles(); } },
    h('div', { class: 'title' }, h('span', { class: 'big' }, 'Commandes')),
    h('div', { class: 'helpgrid' },
      h('i', {}, 'Se repérer'),
      h('b', {}, 'Échap'), h('span', {}, 'Ferme le panneau ouvert ; sinon revient à la caméra automatique'),
      h('b', {}, 'K'), h('span', {}, 'Carte : petite, grande, cachée. Clic sur un navire ou un avion = le suivre ; clic sur l\'eau en vue tactique ou libre = y aller ; molette = zoom'),
      h('b', {}, 'Ligne sous l\'image'), h('span', {}, 'Ce que montre la caméra et qui est qui (couleur de l\'équipe)'),
      h('i', {}, 'Caméras'),
      h('b', {}, '1 · 6 · 7'), h('span', {}, 'La bataille : caméra automatique, vue tactique de dessus, caméra libre'),
      h('b', {}, '2 · 3 · 4 · 5'), h('span', {}, 'Un navire : poursuite, orbite, passerelle, obus'),
      h('b', {}, '8  ·  V'), h('span', {}, 'Un avion : poursuite (V change la vue : passage, depuis le navire visé)'),
      h('b', {}, 'N / B'), h('span', {}, 'Navire (ou avion) suivant / précédent ; un clic sur un navire, sur son nom à droite ou sur la carte le sélectionne'),
      h('b', {}, 'Glisser / molette'), h('span', {}, 'Tourner autour du navire, zoom (altitude en vue tactique, vitesse en caméra libre)'),
      h('b', {}, 'ZQSD / WASD, Espace, Ctrl, Maj'), h('span', {}, 'Déplacement en caméra libre (Maj = rapide) et en vue tactique'),
      h('i', {}, 'Le combat'),
      h('b', {}, 'Espace  ·  , .'), h('span', {}, 'Pause ; ralentir / accélérer le temps (0,5× à 8×)'),
      h('b', {}, 'Tab (maintenir)'), h('span', {}, 'Tableau de bord : coulés, obus tirés, touches, dégâts de chaque navire'),
      h('b', {}, 'R'), h('span', {}, 'Jauges de rechargement : un anneau par tourelle (secondes restantes, PRÊT), les tubes lance-torpilles et les missiles du navire suivi'),
      h('b', {}, 'J'), h('span', {}, 'Journal des impacts : obus, angle, blindage, pénétration et dégâts de chaque touche'),
      h('b', {}, 'L  ·  T  ·  M  ·  H  ·  G  ·  F1'), h('span', {}, 'Plaques de nom ; liste des flottes ; son ; réglages ; cacher toute l\'interface ; cette aide')),
    h('div', { class: 'hint' }, 'Cliquer pour fermer'));
  function toggleHelp(on) { helpEl.classList.toggle('hidden', on === undefined ? !helpEl.classList.contains('hidden') : !on); refreshToggles(); }

  // ---- settings ----
  const settings = h('div', { id: 'settings', class: 'panel hidden' }, closeX(() => settings.classList.add('hidden')), h('div', { class: 'title' }, h('span', { class: 'big' }, 'Réglages')));
  {
    const scaleVal = h('output', {}, Math.round(engine.getRenderScale() * 100) + '%');
    ui.onRenderScale = (v) => { scaleVal.textContent = Math.round(v * 100) + '%'; const inp = scaleVal.previousSibling; if (inp) inp.value = v; };
    const qsel = h('select', { onchange: (e) => game.setQuality(e.target.value) },
      ...[['auto', 'Automatique'], ['high', 'Haute'], ['medium', 'Moyenne'], ['low', 'Basse']].map(([v, l]) => h('option', { value: v, selected: game.qualityMode === v }, l)));
    settings.append(h('label', { class: 'slider' }, h('span', {}, 'Qualité graphique'), qsel, h('span')));
    settings.append(h('div', { class: 'row' }, h('button', { class: 'btn small', title: 'Une bataille filmée sous plusieurs angles, puis un rapport de performance à copier ou partager', onclick: () => { settings.classList.add('hidden'); startBench(); } }, 'Test de performance (rapport)')));
    settings.append(h('label', { class: 'slider' }, h('span', {}, 'Ombres des navires'), h('input', { type: 'checkbox', checked: game.shadowsOn, onchange: (e) => { game.userShadows = e.target.checked; game.applyQuality(); } }), h('span')));
    settings.append(h('label', { class: 'slider', title: 'Spatialisation binaurale des sons forts (canons, explosions) : à activer avec un casque.' },
      h('span', {}, 'Son binaural (casque)'), h('input', { type: 'checkbox', checked: game.audio.hrtf, onchange: (e) => game.audio.setHrtf(e.target.checked) }), h('span')));
    const pval = h('output', {}, game.particleMax / 1000 + ' k');
    settings.append(h('label', { class: 'slider', title: 'Plus de particules : flammes, fumées et gerbes ne disparaissent plus dans les grosses batailles, mais le processeur et la carte graphique travaillent plus.' },
      h('span', {}, 'Particules max'),
      h('input', { type: 'range', min: 10000, max: 200000, step: 5000, value: game.particleMax, onchange: (e) => game.setParticleMax(Number(e.target.value)), oninput: (e) => { pval.textContent = e.target.value / 1000 + ' k'; } }), pval));
    settings.append(h('label', { class: 'slider' }, h('span', {}, 'Résolution de rendu'), h('input', { type: 'range', min: 0.4, max: 1.5, step: 0.05, value: engine.getRenderScale(), oninput: (e) => { engine.setRenderScale(Number(e.target.value)); scaleVal.textContent = Math.round(e.target.value * 100) + '%'; } }), scaleVal));
    // the ocean and the sky: a fold of its own (they change the picture, not the game)
    const adv = h('details', { class: 'fold' }, h('summary', {}, 'Océan et ciel'));
    settings.append(adv);
    for (const [key, label, min, max, step, kind] of SLIDERS) {
      const val = h('output', {}, String(engine.P[key]));
      adv.append(h('label', { class: 'slider' }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: engine.P[key], oninput: (e) => { engine.P[key] = Number(e.target.value); val.textContent = e.target.value; engine.markDirty(kind); } }), val));
    }
  }
  // ---- the damage multipliers (data/balance.js): a fold of their own, kept in this browser, exported as config/balance.json ----
  {
    const fold = h('details', { class: 'fold', id: 'balance' }, h('summary', {}, 'Dégâts (équilibrage)'));
    const rows = [];
    const save = () => {
      const d = balanceDiff();
      try { if (Object.keys(d).length) localStorage.setItem('naval.balance', JSON.stringify(d)); else localStorage.removeItem('naval.balance'); } catch (e) { /* storage blocked: the values hold until the page is closed */ }
    };
    const refresh = () => {
      const base = balanceOfFile();
      for (const r of rows) {
        const v = BALANCE[r.g][r.k];
        r.range.value = v; if (document.activeElement !== r.num) r.num.value = v;
        r.row.classList.toggle('changed', v !== base[r.g][r.k]);
      }
    };
    fold.append(h('div', { class: 'hint' }, 'Multiplicateurs des dégâts reçus : 1 = normal, 2 = deux fois plus, 0 = aucun. Ils s\'appliquent tout de suite, dans le combat en cours. Les valeurs de départ viennent du fichier config/balance.json ; ce que vous changez ici est gardé dans ce navigateur.'));
    for (const [g, f] of Object.entries(BALANCE_FIELDS)) {
      fold.append(h('div', { class: 'bgroup' }, f.label));
      for (const [k, label, hint] of f.keys) {
        const set = (v) => { const n = Number(v); if (!Number.isFinite(n)) return; setBalance({ ...balanceNow(), [g]: { ...BALANCE[g], [k]: n } }); save(); refresh(); };
        const range = h('input', { type: 'range', min: 0, max: BALANCE_MAX, step: 0.05, oninput: (e) => set(e.target.value) });
        const num = h('input', { type: 'number', class: 'bnum', min: 0, max: BALANCE_MAX, step: 0.05, onchange: (e) => set(e.target.value) });
        const row = h('label', { class: 'slider brow', title: hint }, h('span', {}, label), range, num);
        rows.push({ g, k, range, num, row });
        fold.append(row);
      }
    }
    // export: the file to put in config/ (the values in force, with the help line); import: a file of the same shape
    const download = () => {
      const o = { _aide: 'Multiplicateurs des dégâts reçus (1 = normal, 2 = deux fois plus, 0.5 = moitié moins, 0 = aucun dégât ; de 0 à 5). Fichier exporté depuis le jeu : le mettre dans config/balance.json puis relancer npm run build.', ...balanceNow() };
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(o, null, 2) + '\n'], { type: 'application/json' })), download: 'balance.json' });
      document.body.append(a); a.click(); a.remove();
    };
    const picker = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: async (e) => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return;
      try { setBalance(JSON.parse(await file.text())); save(); refresh(); showBanner('Réglages de dégâts importés', 1800); } catch (err) { showBanner('Fichier illisible : ' + err.message, 3000); }
    } });
    fold.append(h('div', { class: 'row' },
      h('button', { class: 'btn small', title: 'Revenir aux valeurs du fichier config/balance.json', onclick: () => { setBalance(null); save(); refresh(); } }, 'Valeurs du fichier'),
      h('button', { class: 'btn small', title: 'Télécharger balance.json avec les valeurs actuelles (à mettre dans config/)', onclick: download }, 'Exporter'),
      h('button', { class: 'btn small', title: 'Charger un fichier balance.json', onclick: () => picker.click() }, 'Importer'), picker));
    settings.append(fold);
    refresh();
    ui.refreshBalance = refresh;
  }

  // the performance test (ui/bench.js): loaded when it is asked for
  async function startBench(auto) {
    const { Bench } = await import('./bench.js');
    ui.bench ||= new Bench(game, ui);
    if (auto) ui.bench.start(auto); else ui.bench.open();
  }
  ui.startBench = startBench;

  function toggleSettings() { const open = settings.classList.toggle('hidden') === false; if (open && game.state !== 'setup') setup.classList.add('collapsed'); refreshToggles(); }
  function toggleSound() {
    game.audio.unlock();
    const muted = game.audio.toggleMute();
    document.getElementById('btn-sound').textContent = muted ? 'Son coupé' : 'Son';
  }
  if (game.audio.muted) setTimeout(() => { const b = document.getElementById('btn-sound'); if (b) b.textContent = 'Son coupé'; }, 0);

  root.append(labelsBox, setup, topbar, teamsHud, camBar, caption, tip, minimap.el, shipInfo, reloads.el, planeInfo, feed, banner, loadBox, results, score, hitlog, helpEl, settings);
  // the right-hand column: the fleets, then the reload rings, then the ship's sheet, each in what the others leave (their sizes change with the number of ships, of mounts and of lines)
  const BOTTOM = 66, GAP = 8;
  const shown = (el) => el.getClientRects().length > 0;      // (offsetParent is null for a fixed element)
  function layoutRight() {
    if (document.body.classList.contains('mobile')) return;      // the phone's layout is in mobileStyle.js
    if (!shown(teamsHud) && !shown(reloads.el) && !shown(shipInfo)) return;
    const vh = window.innerHeight, top = (shown(teamsHud) ? teamsHud.getBoundingClientRect().bottom : 58) + GAP;
    const set = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
    const shipH = shown(shipInfo) ? Math.min(shipInfo.scrollHeight + 20, 300) : 0, avail = vh - top - BOTTOM;
    set(reloads.el, 'top', `${Math.round(top)}px`);
    set(reloads.el, 'maxHeight', `${Math.max(90, Math.round(avail - (shipH ? shipH + GAP : 0)))}px`);
    const rb = shown(reloads.el) ? reloads.el.getBoundingClientRect().bottom + GAP : top;
    set(shipInfo, 'maxHeight', `${Math.max(120, Math.round(vh - BOTTOM - rb))}px`);
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(layoutRight); for (const el of [teamsHud, reloads.el, shipInfo]) ro.observe(el); }
  window.addEventListener('resize', layoutRight);
  refreshToggles();
  setHudVisible(false);

  function setHudVisible(v) {
    for (const el of [topbar, teamsHud, camBar, caption, shipInfo, reloads.el, feed]) el.classList.toggle('hidden', !v || state.hudHidden || (el === teamsHud && !state.teams));
    layoutRight();
    minimap.el.style.display = !v || state.hudHidden ? 'none' : '';
    planeInfo.classList.toggle('hidden', true);
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
    minimap.reset();
  };
  ui.onStart = () => {
    setup.classList.add('collapsed');
    btnStart.disabled = true;
    showBanner('Que le combat commence !');
    state.killFeed.length = 0;
    refreshToggles();
    // the first battle: how not to get lost
    if (!state.tipShown) {
      state.tipShown = true;
      tip.replaceChildren(h('b', {}, 'Pour s\'y retrouver'),
        h('span', {}, 'La ligne sous l\'image dit ce que montre la caméra. La carte (K) montre tous les navires : un clic sur l\'un d\'eux le suit. Échap revient à la caméra automatique. F1 : toutes les commandes.'),
        h('button', { class: 'btn tiny', onclick: () => tip.classList.add('hidden') }, 'Compris'));
      tip.classList.remove('hidden');
      clearTimeout(state.tipT); state.tipT = setTimeout(() => tip.classList.add('hidden'), 16000);
    }
  };
  ui.onLoading = (done, total) => {
    const left = total - done > 0;
    loadBox.classList.toggle('hidden', !left);
    btnStart.disabled = left;
    if (left) { loadBar.style.width = (100 * done / Math.max(1, total)).toFixed(0) + '%'; loadText.textContent = `${done} / ${total}`; }
    else if (game.state === 'ready') btnStart.disabled = false;
  };
  ui.onReset = () => { setup.classList.remove('collapsed'); refreshToggles(); setHudVisible(false); btnStart.disabled = true; btnSpawn.textContent = 'Faire apparaître les flottes'; };
  ui.onFinished = () => {
    showResults();
  };
  ui.onTimeScale = () => refreshSpeed();
  ui.onPause = () => refreshSpeed();
  ui.onCameraMode = (id) => { for (const b of camBar.querySelectorAll('.cam[data-id]')) b.classList.toggle('on', b.dataset.id === id); };
  ui.onTarget = (s) => { state.selectedShip = s; };

  // a click on the map: follow that ship or that aircraft; on the water, the tactical or free camera goes there
  function pickFromMap(o) {
    const rig = game.camera;
    if (o.ship) { rig.setTarget(o.ship); if (!['follow', 'orbit', 'bridge', 'shell', 'tactical'].includes(rig.mode)) rig.setMode('follow', true); return; }
    if (o.plane) { rig.setMode('plane', true); rig.setPlane(o.plane); return; }
    if (!o.point) return;
    if (rig.mode === 'tactical') { rig.tactical.x = o.point.x; rig.tactical.z = o.point.z; }
    else if (rig.mode === 'free') {
      // from a little way back and above, looking at the spot
      const f = rig.free, y = Math.min(Math.max(f.y, 120), 900), back = y * 2.2, dx = o.point.x - f.x, dz = o.point.z - f.z, d = Math.hypot(dx, dz) || 1;
      Object.assign(f, { x: o.point.x - dx / d * back, z: o.point.z - dz / d * back, y, yaw: Math.atan2(dx, -dz), pitch: -Math.atan(y / back) });
    }
  }

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
      if (e.type === 'shellHit') { addHit(e); continue; }
      if (e.type === 'planeDown' && e.attacker && (e.cause === 'aa' || e.cause === 'gun' || e.cause === 'gunner')) {
        const pc = world.teams[e.plane.team];
        const who = e.cause === 'gun' ? `Les chasseurs de ${e.attacker.name} abattent` : e.cause === 'gunner' ? `Un mitrailleur de ${e.attacker.name} abat` : `${e.attacker.name} abat`;
        state.killFeed.push({ t: performance.now(), text: `${who} un ${e.plane.spec.name}`, c1: '#ccc', c2: pc ? css(pc.rgb) : '#ccc', v: { name: '' }, killer: e.attacker, plane: true });
        if (state.killFeed.length > 6) state.killFeed.shift();
        continue;
      }
      if (e.type === 'strikeAbort' || e.type === 'strikeMerged') {
        const tc = world.teams[e.ship.team];
        state.killFeed.push({ t: performance.now(), text: e.type === 'strikeAbort' ? `Le raid de ${e.ship.name} fait demi-tour (${e.left} appareils sur ${e.planned})` : `Le raid de ${e.ship.name} se resserre (${e.left} appareils sur ${e.planned})`, c1: '#ccc', c2: tc ? css(tc.rgb) : '#ccc', v: { name: '' }, killer: null, plane: true });
        if (state.killFeed.length > 6) state.killFeed.shift();
        continue;
      }
      if (e.type === 'baseDown') {
        const tc = world.teams[e.base.team];
        state.killFeed.push({ t: performance.now(), text: `${e.base.layout.kind === 'airfield' ? "L'aérodrome" : 'La batterie côtière'} de ${tc ? tc.name : e.base.nation} est hors de combat`, c1: '#ccc', c2: tc ? css(tc.rgb) : '#ccc', v: { name: '' }, killer: null, plane: true });
        if (state.killFeed.length > 6) state.killFeed.shift();
        continue;
      }
      if (e.type === 'resupply' || e.type === 'moored' || e.type === 'dockEnd') {
        const tc = world.teams[e.ship.team];
        const text = e.type === 'resupply' ? `${e.ship.name} fait route vers le port (${e.why === 'ammo' ? 'plus de munitions' : 'avaries'})` : e.type === 'moored' ? `${e.ship.name} est à quai` : `${e.ship.name} reprend la mer, réparé et ravitaillé`;
        state.killFeed.push({ t: performance.now(), text, c1: '#ccc', c2: tc ? css(tc.rgb) : '#ccc', v: { name: '' }, killer: null, plane: true });
        if (state.killFeed.length > 6) state.killFeed.shift();
        continue;
      }
      if (e.type === 'shipBreak') {
        state.killFeed.push({ t: performance.now(), text: `${e.ship.name} se brise en deux`, c1: '#ccc', c2: css(world.teams[e.ship.team].rgb), v: { name: '' }, killer: null });
        if (state.killFeed.length > 6) state.killFeed.shift();
        continue;
      }
      if (e.type !== 'sinking') continue;
      const v = e.ship;
      const killer = v.killedBy;
      const tc = world.teams[v.team];
      const text = killer ? `${killer.name} ${verbs[v.cause] || 'a coulé'} ${v.name}` : `${v.name} sombre`;
      state.killFeed.push({ t: performance.now(), text, c1: killer && world.teams[killer.team] ? css(world.teams[killer.team].rgb) : '#ccc', c2: css(tc.rgb), v, killer });
      if (state.killFeed.length > 6) state.killFeed.shift();
    }
  };

  // ---- hits: a floating tag where the shell struck and a log of the last ones --------------------------------------------------------------
  const RESULT = {
    pen: ['PERCE', '#ff7a45'], over: ['TRAVERSE SANS ÉCLATER', '#ffd24a'], glance: ['RICOCHET', '#9fd0ff'], bounce: ['NE PERCE PAS', '#9fd0ff'],
    dud: ['FUSÉE DÉFAILLANTE', '#c9b8ff'], burst: ['ÉCLATE', '#ffb347'], shatter: ['SE BRISE SUR LE BLINDAGE', '#b8c4cf'],
  };
  const why = (e) => {
    const a = Math.round(e.angle);
    if (e.result === 'glance') return `incidence ${a}° : l'obus ricoche`;
    if (e.result === 'bounce') return `plaque ${Math.round(e.armor)} mm à ${a}° = ${Math.round(e.eff)} mm effectifs > pénétration ${Math.round(e.pen)} mm`;
    if (e.result === 'dud') return `la fusée ne fonctionne pas : l'obus traverse sans éclater`;
    if (e.result === 'over') return `plaque trop mince (${Math.round(e.eff)} mm) : la fusée n'arme pas`;
    if (e.result === 'shatter') return `plaque ${Math.round(e.armor)} mm à ${a}° : l'obus explosif éclate en surface`;
    if (e.shell === 'HE') return `${a}° · ${e.result === 'pen' ? 'éclate derrière la tôle' : 'éclate au contact'}`;
    return `plaque ${Math.round(e.armor)} mm à ${a}° = ${Math.round(e.eff)} mm effectifs < pénétration ${Math.round(e.pen)} mm`;
  };
  function addHit(e) {
    const hit = { ...e, wall: performance.now() };
    state.hits.push(hit);
    if (state.hits.length > 60) state.hits.shift();
    // a floating tag (only for hits that matter to the picture: near the camera, or on / by the ship being followed)
    const sel = game.camera.target;
    const near = Math.hypot(e.ship.x - engine.cam.x, e.ship.z - engine.cam.z) < 3500;
    if (!(near || e.ship === sel || e.owner === sel) || e.cal < 100) return;
    const [word, col] = RESULT[e.result] || ['TOUCHE', '#fff'];
    const el = h('div', { class: 'hittag', style: `--hc:${col}` }, h('b', {}, word), h('span', {}, `${e.shell} ${Math.round(e.cal)} mm · ${Math.round(e.angle)}° · ${Math.round(e.dmg).toLocaleString('fr-FR')} dégâts`));
    labelsBox.append(el);
    state.tags.push({ el, ship: e.ship, lx: e.lx, ly: e.ly, lz: e.lz, t0: performance.now() });
    while (state.tags.length > 7) state.tags.shift().el.remove();
  }
  function updateHitTags() {
    const now = performance.now(), out = [0, 0, 0], w = [0, 0, 0];
    for (let i = state.tags.length - 1; i >= 0; i--) {
      const tg = state.tags[i], age = (now - tg.t0) / 1000;
      if (age > 3.6 || !state.hitLog) { tg.el.remove(); state.tags.splice(i, 1); continue; }
      tg.ship.toWorld(tg.lx, tg.ly, tg.lz, w);
      const pr = engine.project(w[0], w[1] + 3 + age * 2.5, w[2], out);
      if (!pr || out[0] < -80 || out[0] > innerWidth + 80 || out[1] < -40 || out[1] > innerHeight + 40) { tg.el.style.display = 'none'; continue; }
      tg.el.style.display = '';
      tg.el.style.opacity = String(clamp(1.6 - age / 2.2, 0, 1));
      tg.el.style.transform = `translate(${out[0].toFixed(0)}px, ${out[1].toFixed(0)}px) translate(-50%, -100%)`;
    }
  }
  let hitLogKey = '';
  function refreshHitLog() {
    const sel = game.camera.target;
    // the hits on the ship followed or by her, the last four, and only while they are fresh: the log does not stay on the screen when nothing happens
    const now = performance.now();
    const mine = state.hits.filter((e) => (!sel || e.ship === sel || e.owner === sel) && now - e.wall < 25000).slice(-4);
    const show = state.hitLog && mine.length > 0 && (game.state === 'running' || game.state === 'finished') && !state.hudHidden;
    hitlog.classList.toggle('hidden', !show);
    if (!show) return;
    const key = mine.map((e) => e.wall).join(',') + (sel ? sel.id : '');
    if (key === hitLogKey) return;
    hitLogKey = key;
    hitlog.replaceChildren(
      h('div', { class: 'hl-title' }, sel ? `Impacts — ${sel.name}` : 'Impacts'),
      ...mine.reverse().map((e) => {
        const [word, col] = RESULT[e.result] || ['TOUCHE', '#fff'];
        const tc = (s) => (s && world.teams[s.team] ? css(world.teams[s.team].rgb) : '#ccc');
        return h('div', { class: 'hl-row', style: `--hc:${col}` },
          h('div', {}, h('b', { style: `color:${tc(e.owner)}` }, e.owner ? e.owner.name : '—'), ' → ', h('b', { style: `color:${tc(e.ship)}` }, e.ship.name), h('span', { class: 'hl-part' }, ` · ${e.label}`)),
          h('div', {}, h('i', {}, `${e.shell} ${Math.round(e.cal)} mm`), ' · ', h('b', { class: 'hl-res' }, word), h('span', { class: 'hl-dmg' }, ` · ${Math.round(e.dmg).toLocaleString('fr-FR')} dégâts`)),
          h('div', { class: 'hl-why' }, why(e)));
      }),
    );
  }

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
        const bar = h('span', { class: 'hpbar' }, h('i', {}), h('i', {}));
        const row = h('div', { class: 'srow', onclick: () => { game.camera.setTarget(s); if (['free', 'tactical'].includes(game.camera.mode)) game.camera.setMode('follow'); } },
          h('span', { class: 'ty' }, s.stats.type), h('span', { class: 'sn' }, s.name), bar);
        return { s, row, bar };
      });
      cols.push(h('div', { class: 'tcol' }, head, ...rows.map((r) => r.row)));
      teamRows.push({ t, ti, head, rows });
    });
    teamsHud.replaceChildren(...cols);
  }

  // =========================================================================================
  // scoreboard (Tab held, or the "Tableau" button): who sank what, shells fired, hits, damage, in real time
  // =========================================================================================
  const SINK_WORD = { roll: 'chaviré', bow: 'coulé par l\'avant', stern: 'coulé par l\'arrière', level: 'envahi par les eaux', burn: 'consumé par l\'incendie', scuttle: 'abandonné et sabordé', blast: 'détruit par explosion', split: 'brisé en deux' };
  function refreshScore(force) {
    const on = (state.scoreHold || state.scoreSticky) && (game.state === 'running' || game.state === 'finished' || (force && game.state !== 'setup'));
    score.classList.toggle('hidden', !on);
    if (!on) return;
    const num = (n) => Math.round(n).toLocaleString('fr-FR');
    const head = ['Navire', 'Classe', 'Coulés', 'Avions', 'Obus', 'Touches', 'Préc.', 'Torpilles', 'Dégâts', 'État'];
    const blocks = [];
    world.teams.forEach((t, ti) => {
      if (!t) return;
      const ships = world.ships.filter((s) => s.team === ti);
      if (!ships.length) return;
      ships.sort((a, b) => (b.kills - a.kills) || (b.damageDealt - a.damageDealt));
      const sum = (f) => ships.reduce((a, s) => a + f(s), 0);
      const shells = (s) => s.shotsFired - (s.torpFired || 0), hits = (s) => s.shotsHit - s.torpHits;
      const alive = ships.filter((s) => s.alive).length;
      const row = (cells, cls) => h('tr', cls ? { class: cls } : {}, ...cells.map((c, i) => h('td', i >= 2 && i <= 8 ? { class: 'n' } : {}, c)));
      const tot = [`${t.name} — ${alive}/${ships.length} à flot`, '', num(sum((s) => s.kills)), num(sum((s) => s.planeKills || 0)), num(sum(shells)), num(sum(hits)), sum(shells) ? Math.round(sum(hits) / sum(shells) * 100) + ' %' : '–', `${num(sum((s) => s.torpHits))}/${num(sum((s) => s.torpFired || 0))}`, num(sum((s) => s.damageDealt)), ''];
      const rows = ships.map((s) => {
        const hp = s.alive ? shipStatus(s).text : (SINK_WORD[s.split ? 'split' : s.sinkMode] || 'coulé');
        const sel = game.camera.target === s ? 'sel' : '';
        return row([s.name, s.stats.type, s.kills || '·', s.planeKills || '·', num(shells(s)), num(hits(s)), shells(s) ? Math.round(hits(s) / shells(s) * 100) + ' %' : '–', s.torpFired ? `${s.torpHits}/${s.torpFired}` : '·', num(s.damageDealt), hp], (s.alive ? '' : 'dead ') + sel);
      });
      blocks.push(h('tbody', { style: `--tc:${css(t.rgb)}` }, row(tot, 'team'), ...rows));
    });
    const feedRows = world.kills.slice(-8).reverse().map((k) => {
      const kc = k.killer && world.teams[k.killer.team] ? css(world.teams[k.killer.team].rgb) : '#aaa', vc = css(world.teams[k.victim.team].rgb);
      const how = SINK_WORD[k.victim.split ? 'split' : k.victim.sinkMode] || 'coulé';
      return h('div', { class: 'kl' }, h('span', { class: 'kt' }, fmtTime(k.t)), h('b', { style: `color:${kc}` }, k.killer ? k.killer.name : '—'), h('span', {}, ` ${verbs[k.cause] || 'a coulé'} `), h('b', { style: `color:${vc}` }, k.victim.name), h('span', { class: 'kh' }, ` (${how})`));
    });
    score.replaceChildren(
      h('div', { class: 'title' }, h('span', { class: 'big' }, 'Tableau de bord'), h('span', { class: 'sub' }, `${fmtTime(world.time)} · ${game.state === 'finished' ? 'combat terminé' : 'en temps réel'}`)),
      h('table', {}, h('thead', {}, h('tr', {}, ...head.map((x, i) => h('th', i >= 2 && i <= 8 ? { class: 'n' } : {}, x)))), ...blocks),
      ...(feedRows.length ? [h('div', { class: 'klog' }, h('div', { class: 'kh2' }, 'Derniers naufrages'), ...feedRows)] : []),
    );
  }

  // =========================================================================================
  // per-frame update
  // =========================================================================================
  let uiT = 0, labelEls = new Map();
  let scoreT = 0;
  ui.update = (dt) => {
    updateHitTags();
    if (game.state !== 'setup' && !state.hudHidden) minimap.update(dt);
    scoreT += dt;
    if (scoreT > 0.25) refreshHitLog();
    if (scoreT > 0.25) { scoreT = 0; refreshScore(); }
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
        if (s.alive) alive++;
        setMeters(r.bar, s);
        r.row.classList.toggle('dead', !s.alive);
        r.row.classList.toggle('sel', s === game.camera.target);
      }
      let air = 0;
      for (const p of world.planes) if (p.team === tr.ti && !p.gone && !p.dying && !['queue', 'parked', 'holdshort', 'lineup', 'taxiOut', 'taxiIn', 'taxiBack'].includes(p.phase)) air++;
      tr.head.querySelector('.alive').textContent = `${air ? `✈ ${air} · ` : ''}${alive}/${tr.rows.length}`;
    }
    // kill feed
    const now = performance.now();
    state.killFeed = state.killFeed.filter((k) => now - k.t < 9000);
    // each line keeps its element: rebuilding them every frame replayed the fade-in animation (the lines flickered)
    const lines = state.killFeed.map((k) => k.el || (k.el = h('div', { class: 'kline' }, h('span', {}, (k.plane ? '✈ ' : '') + k.text), h('i', { style: `background:${k.c2}` }))));
    if (lines.length !== feed.children.length || lines.some((el, i) => feed.children[i] !== el)) feed.replaceChildren(...lines);
    // what the camera shows and who it follows
    updateCaption();
    // selected ship
    updateShipInfo();
    for (const b of camBar.querySelectorAll('.cam[data-id]')) b.classList.toggle('on', b.dataset.id === game.camera.mode);
  };

  let capKey = '';
  function updateCaption() {
    const rig = game.camera, c = captionOf(rig);
    const key = c.mode + c.shot + (c.hint || '') + c.parts.map((p) => p.text + p.team).join('|') + rig.mode;
    if (key !== capKey) {
      capKey = key;
      const tcol = (t) => (t != null && world.teams[t] ? css(world.teams[t].rgb) : null);
      caption.replaceChildren(
        h('span', { class: 'cm' }, c.mode + (c.shot ? ' · ' + c.shot : '')),
        ...c.parts.map((p) => (tcol(p.team) ? h('b', { style: `color:${tcol(p.team)}` }, p.text) : h('span', {}, p.text))),
        ...(c.hint ? [h('span', { class: 'back' }, c.hint)] : []),
        ...(rig.mode !== 'auto' ? [h('span', { class: 'back' }, 'Échap : caméra auto')] : []));
    }
    // the subject between the arrows of the camera bar
    const pm = inPlaneMode() || (rig.mode === 'auto' && ['plane', 'dogfight', 'formation'].includes(rig.auto.sub) && rig.plane), subjOn = pm ? rig.plane : rig.target;
    // the map sits where the fleet and settings panels open
    minimap.el.classList.toggle('under', !setup.classList.contains('collapsed') || !settings.classList.contains('hidden'));
    const nm = subjOn ? (pm ? subjOn.spec.name : subjOn.name) : '—', col = subjOn && world.teams[subjOn.team] ? css(world.teams[subjOn.team].rgb) : '';
    if (subjName.textContent !== nm) subjName.textContent = nm;
    subjName.style.color = col;
  }

  const PHASES = {
    queue: 'Au pont', takeoff: 'Décollage', cruise: 'En route', ip: 'Approche basse', run: 'Passe de torpillage', rollin: 'Mise en piqué', dive: 'En piqué',
    pullout: 'Ressource', break: 'Dégagement', egress: 'Retrait', return: 'Retour au porte-avions', pattern: 'Circuit d\'appontage', final: 'Approche finale',
    rollout: 'Appontage', waveoff: 'Remise de gaz', ditch: 'Amerrissage forcé', floating: 'Sur l\'eau',
    parked: 'Au parking', taxiOut: 'Roulage vers la piste', holdshort: 'Attente avant la piste', lineup: 'Alignement sur la piste', groundRun: 'Course au décollage',
    climb: 'Montée', assemble: 'Rassemblement', hold: 'Attente', escort: 'Escorte', cap: 'Patrouille', intercept: 'Interception', engage: 'Combat aérien', refuge: 'Repli',
    goaround: 'Remise de gaz', lfinal: 'Approche finale', lroll: 'Atterrissage', taxiIn: 'Roulage vers le parking', taxiBack: 'Roulage vers le parking',
  };
  const ROLES = { dive: 'Bombardier en piqué', torp: 'Torpilleur', level: 'Bombardier', fighter: 'Chasseur' };
  const DEATH = { spin: 'en vrille', dive: 'pilote touché, pique', wing: 'aile arrachée', glide: 'moteur coupé', explode: 'désintégré en vol', tumble: 'en chute libre' };
  function updatePlaneInfo() {
    const p = game.camera.plane;
    const mode = inPlaneMode() && game.state !== 'setup';
    const show = mode && p;
    planeInfo.classList.toggle('hidden', !mode);
    shipInfo.classList.toggle('hidden', !!mode || state.hudHidden);
    if (mode && !p) {
      planeInfo.replaceChildren(h('div', { class: 'ititle' }, 'Aucun avion en vol'), h('div', { class: 'iline dim' }, 'Les porte-avions lancent leurs vagues d\'attaque pendant le combat : la caméra suit alors un avion (N / B pour en changer).'));
      return;
    }
    if (!show) return;
    const t = world.teams[p.team];
    const alt = Math.max(0, Math.round(p.y)), kmh = Math.round(p.speed * 3.6);
    const role = p.interceptor ? 'Intercepteur' : ROLES[p.kind] || '';
    const phase = p.dying ? 'Abattu : ' + (DEATH[p.mode] || 'en chute') : PHASES[p.phase] || p.phase;
    const view = game.camera.mode === 'plane' ? PLANE_VIEWS.find((v) => v.id === game.camera.planeCam.view)?.name : 'pilote';
    planeInfo.replaceChildren(
      h('div', { class: 'si-head', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'sw' }), h('b', {}, p.spec.name), h('small', {}, ` ${role}`)),
      h('div', { class: 'si-grid' },
        h('span', {}, 'État'), h('b', { style: `color:${LEVEL_COLOR[planeLevel(p)]}` }, planeText(p)),
        h('span', {}, 'Phase'), h('b', {}, phase),
        h('span', {}, 'Altitude'), h('b', {}, `${alt} m`),
        h('span', {}, 'Vitesse'), h('b', {}, `${kmh} km/h`),
        h('span', {}, p.base ? 'Base' : 'Porte-avions'), h('b', {}, p.base ? `${p.base.name} (${t.name})` : p.owner ? p.owner.name : '—'),
        h('span', {}, 'Cible'), h('b', {}, p.target && p.target.alive ? p.target.name : '—'),
        h('span', {}, 'Armement'), h('b', {}, p.kind === 'fighter' ? armamentText(p) : p.ordnance ? (p.loadout ? p.loadout.label : p.kind === 'torp' ? 'torpille' : `bombe${p.kind === 'level' ? 's' : ''} de ${p.spec.bombKg} kg`) : 'largué'),
        h('span', {}, 'Vue (V)'), h('b', {}, view || '—')),
    );
  }

  /** The guns of a fighter and what is left in them: "6 x 12,7 mm (74 %)", the cannons of a Zero that have run dry are shown as such. */
  function armamentText(p) {
    if (!p.guns || !p.guns.length) return 'mitrailleuses et canons';
    return p.guns.map((g) => { const left = Math.max(0, Math.min(1, g.left / g.rpg)); return `${g.n} × ${String(g.cal).replace('.', ',')} mm ${left > 0 ? `(${Math.round(left * 100)} %)` : '(vide)'}`; }).join(' + ');
  }

  function updateShipInfo() {
    updatePlaneInfo();
    const s = game.camera.target;
    reloads.update(state.reloads && !inPlaneMode() && game.state !== 'setup' ? s : null, world);
    if (inPlaneMode()) return;
    if (!s || game.state === 'setup') { shipInfo.replaceChildren(); return; }
    const t = world.teams[s.team];
    const mainMounts = s.mounts.filter((m) => m.group === 'main');
    const mainAlive = mainMounts.filter((m) => m.alive).length;
    const ready = mainMounts.filter((m) => m.alive && m.reload <= 0.01).length;
    const target = s.cmd.main.target;
    const acc = s.shotsFired ? Math.round(100 * s.shotsHit / s.shotsFired) : 0;
    const mods = (kind) => s.modules.filter((m) => m.kind === kind);
    const okOf = (kind) => { const l = mods(kind); return l.length ? `${l.filter((m) => m.state < 2).length}/${l.length}` : null; };
    const aaAlive = s.aaMounts.filter((a) => a.alive).length;
    const jam = s.mounts.filter((m) => m.alive && m.jam > 0).length;
    const stt = shipStatus(s);
    const lines = [
      h('div', { class: 'si-head', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'sw' }), h('b', {}, s.name), h('small', {}, ` ${typeName(s.stats.type)} · ${s.stats.className}`)),
      h('div', { class: 'si-meters' }, h('span', {}, 'Flottabilité'), h('i', { class: 'm1' }, h('b', { style: `width:${(stt.reserve * 100).toFixed(0)}%` })), h('span', {}, 'Équipage'), h('i', { class: 'm2' }, h('b', { style: `width:${(stt.crew * 100).toFixed(0)}%` }))),
      dmgCanvas,
      // the essentials, then the rest on demand (a short screen has no room for all of it)
      h('div', { class: 'si-grid' },
        h('span', {}, 'État'), h('b', { style: `color:${LEVEL_COLOR[stt.level]}` }, stt.text),
        h('span', {}, 'Vitesse'), h('b', {}, `${(s.speed / KN).toFixed(0)} nœuds${s.propulsion < 0.95 ? ` (machines ${Math.round(s.propulsion * 100)} %)` : ''}`),
        h('span', {}, 'Artillerie'), h('b', {}, `${mainAlive}/${mainMounts.length} tourelles, ${ready} prêtes${jam ? `, ${jam} enrayée${jam > 1 ? 's' : ''}` : ''}`),
        h('span', {}, 'Cible'), h('b', {}, target && target.alive ? `${target.name} (${(Math.hypot(target.x - s.x, target.z - s.z) / 1000).toFixed(1)} km)` : '—'),
        h('span', {}, 'Incendies · eau'), h('b', {}, `${s.fires.length} · ${Math.round((s.waterFill || 0) * 100)} %${Math.abs(s.floodList || 0) > 0.03 ? (s.floodList > 0 ? ' · gîte tribord' : ' · gîte bâbord') : ''}`),
        ...(state.shipMore ? [
          h('span', {}, 'Cap'), h('b', {}, `${((s.heading * R2D % 360 + 360) % 360).toFixed(0)}°`),
          h('span', {}, 'Obus (principale)'), h('b', {}, (() => { const a = s.ammoLeft('main'); return `${a.AP} AP · ${a.HE} HE (${Math.round(a.frac * 100)} %)`; })()),
          h('span', {}, 'Machines'), h('b', {}, okOf('engine') || '—'),
          h('span', {}, 'Gouvernail'), h('b', {}, s.rudderDead ? 'détruit' : s.rudderJam ? 'bloqué' : 'normal'),
          h('span', {}, 'Direction de tir'), h('b', {}, s.fcMult > 1.05 ? `dégradée (×${s.fcMult.toFixed(1)})` : 'normale'),
          h('span', {}, 'DCA légère'), h('b', {}, `${aaAlive}/${s.aaMounts.length} · munitions ${Math.round(s.aaAmmo().frac * 100)} %`),
          h('span', {}, 'Tirs / touches'), h('b', {}, `${s.shotsFired} / ${s.shotsHit} (${acc}%)`),
          h('span', {}, 'Coulés / avions'), h('b', {}, `${s.kills} / ${s.planeKills || 0}`)] : []),
      ),
      // (pointerdown: the panel is rebuilt ten times a second, a click would be lost between the press and the release)
      h('button', { class: 'si-more', onpointerdown: () => { state.shipMore = !state.shipMore; updateShipInfo(); } }, state.shipMore ? '− moins de détails' : '+ plus de détails'),
      s.air ? h('div', { class: 'iline' }, `Groupe aérien : ${s.air.ready} bombardiers, ${s.air.fReady} chasseurs${s.air.servicing.length ? `, ${s.air.servicing.length} en révision` : ''}${s.deckWrecked ? ' — pont d\'envol détruit' : ''}`) : null,
      s.state !== 'afloat' ? h('div', { class: 'si-state' }, SINK_LABEL[s.split ? 'split' : s.sinkMode] || 'NAVIRE COULÉ') : null,
    ];
    shipInfo.replaceChildren(...lines.filter(Boolean));
    drawDamage(dmgCanvas, s);
  }

  function updateLabels() {
    if (!state.labels || game.state === 'setup') { for (const el of labelEls.values()) el.style.display = 'none'; for (const el of planeEls.values()) el.style.display = 'none'; return; }
    const out = [0, 0, 0];
    const cam = engine.cam;
    const seen = new Set();
    for (const s of world.ships) {
      if (s.state === 'sunk') continue;
      let el = labelEls.get(s.id);
      if (!el) {
        const t = world.teams[s.team];
        el = h('div', { class: 'lab', style: `--tc:${css(t.rgb)}` }, h('span', { class: 'dot' }), h('span', { class: 'ln' }), h('span', { class: 'ld' }), h('span', { class: 'lbar' }, h('i', {}), h('i', {})));
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
      el.classList.toggle('far', dist > 6000 && !sel && game.camera.mode !== 'tactical');
      el.classList.toggle('dead', !s.alive);
      el.querySelector('.ld').textContent = dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
      setMeters(el.querySelector('.lbar'), s);
    }
    for (const [id, el] of labelEls) if (!seen.has(id)) { el.remove(); labelEls.delete(id); }
    updatePlaneMarkers(out, cam);
  }

  // small markers on the aircraft: a click follows that aircraft
  const planeEls = new Map();
  function updatePlaneMarkers(out, cam) {
    const seen = new Set();
    for (const p of world.planes) {
      if (p.phase === 'queue' || p.phase === 'rollout' || p.phase === 'takeoff' || p.phase === 'taxiIn') continue;
      const dist = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const pr = engine.project(p.x, p.y + 6, p.z, out);
      if (!pr || dist > 16000 || dist < 25 || out[0] < -30 || out[0] > innerWidth + 30 || out[1] < -20 || out[1] > innerHeight + 20) continue;
      let el = planeEls.get(p.id);
      if (!el) {
        const t = world.teams[p.team];
        el = h('div', { class: 'lab plane', style: `--tc:${css(t.rgb)}`, title: p.spec.name, onclick: () => { game.camera.setMode('plane', true); game.camera.setPlane(p); } }, '✈');
        labelsBox.append(el);
        planeEls.set(p.id, el);
      }
      seen.add(p.id);
      el.style.display = '';
      el.style.transform = `translate(${out[0].toFixed(0)}px, ${out[1].toFixed(0)}px) translate(-50%, -120%)`;
      el.classList.toggle('hot', ['rollin', 'dive', 'run', 'pullout', 'break', 'engage'].includes(p.phase) || p.dying);
      el.classList.toggle('sel', game.camera.plane === p && (game.camera.mode === 'plane' || game.camera.mode === 'cockpit'));
      el.style.opacity = dist > 6000 ? '0.55' : '1';
    }
    for (const [id, el] of planeEls) if (!seen.has(id)) { el.remove(); planeEls.delete(id); }
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
        h('thead', {}, h('tr', {}, ['Navire', 'Équipe', 'État', 'Dégâts', 'Tirs', 'Touches', 'Coulés', 'Avions abattus'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((s) => h('tr', { class: s.alive ? '' : 'dead' },
          h('td', {}, s.name), h('td', { style: `color:${css(w.teams[s.team].rgb)}` }, w.teams[s.team].name),
          h('td', {}, s.alive ? shipStatus(s).text : (SINK_WORD[s.split ? 'split' : s.sinkMode] || 'coulé')), h('td', {}, Math.round(s.damageDealt)),
          h('td', {}, s.shotsFired), h('td', {}, s.shotsHit), h('td', {}, s.kills), h('td', {}, s.planeKills || 0))))),
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
    if (e.code === 'Tab') { e.preventDefault(); if (!state.scoreHold) { state.scoreHold = true; refreshScore(true); } return; }
    if (e.code === 'Space' && (game.state === 'running' || game.state === 'finished')) { game.togglePause(); e.preventDefault(); }
    else if (e.code === 'Period') { const steps = [0.5, 1, 2, 4, 8]; const i = steps.indexOf(game.timeScale); game.paused = false; game.setTimeScale(steps[Math.min(steps.length - 1, i + 1)] ?? 1); }
    else if (e.code === 'Comma') { const steps = [0.5, 1, 2, 4, 8]; const i = steps.indexOf(game.timeScale); game.paused = false; game.setTimeScale(steps[Math.max(0, i - 1)] ?? 1); }
    else if (e.code === 'KeyL') { state.labels = !state.labels; refreshToggles(); }
    else if (e.code === 'KeyT') { state.teams = !state.teams; setHudVisible(game.state !== 'setup'); refreshToggles(); }
    else if (e.code === 'KeyJ') { state.hitLog = !state.hitLog; refreshToggles(); }
    else if (e.code === 'KeyR') { state.reloads = !state.reloads; refreshToggles(); updateShipInfo(); }
    else if (e.code === 'KeyM') toggleSound();
    else if (e.code === 'KeyH') toggleSettings();
    else if (e.code === 'F1') { toggleHelp(); e.preventDefault(); }
    else if (e.code === 'KeyG') { state.hudHidden = !state.hudHidden; setHudVisible(game.state !== 'setup'); }
    else if (e.code === 'KeyK') { minimap.cycle(); refreshToggles(); }
    else if (e.code === 'Escape') {
      // close what is open, the last opened first; with nothing open, back to the automatic camera
      if (!helpEl.classList.contains('hidden')) helpEl.classList.add('hidden');
      else if (!settings.classList.contains('hidden')) settings.classList.add('hidden');
      else if (!tip.classList.contains('hidden')) tip.classList.add('hidden');
      else if (state.scoreSticky) { state.scoreSticky = false; refreshScore(); }
      else if (game.state !== 'setup' && game.state !== 'ready' && !setup.classList.contains('collapsed')) setup.classList.add('collapsed');
      else if (game.state !== 'setup' && game.camera.mode !== 'auto') game.camera.setMode('auto', true);
      refreshToggles();
    }
  });

  addEventListener('keyup', (e) => { if (e.code === 'Tab') { state.scoreHold = false; refreshScore(); } });
  addEventListener('blur', () => { state.scoreHold = false; refreshScore(); });

  // buttons must not keep the keyboard focus (Space would activate them again)
  addEventListener('pointerup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  renderTeams();
  ui.doSpawn = doSpawn;
  ui.minimap = minimap;
  ui.refreshToggles = refreshToggles;
  return ui;
}
