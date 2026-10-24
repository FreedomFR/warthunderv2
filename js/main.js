// Entry point.
import { createEngine } from './engine.js';
import { Game } from './game/game.js';
import { PRESETS } from './game/scenarios.js';
import { THEATRES } from './game/data/theatre.js';
import { TEAM_COLORS } from './game/sim/world.js';
import { isMobile, maxPixelRatio } from './game/device.js';
import { setBalanceFile, setBalance } from './game/data/balance.js';
import { preloadModels } from './game/preload.js';

const canvas = document.getElementById('c');
const qs = new URLSearchParams(location.search);
if (isMobile()) document.body.classList.add('mobile');
const S = window.__splash || { set() {}, hide() {}, off: true };
// (the first screen plays the trailer while this loads; the tools and the preview skip it, and then skip the preloading too)
const quick = !!S.off || qs.get('start') === '1';
S.set('Moteur graphique…', 0.05);
const engine = await createEngine(canvas, { maxDpr: maxPixelRatio() });
S.set('Navires et effets…', 0.3);
window.__engine = engine;

if (qs.has('preview')) {
  const { runPreview } = await import('./preview.js');
  await runPreview(engine, qs.get('preview').split(','), qs);
} else {
  // the damage multipliers: config/balance.json (built into naval.html), then what was set in this browser (Réglages -> Dégâts)
  const file = window.__BALANCE_FILE ?? await fetch('config/balance.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  setBalanceFile(file);
  try { const saved = JSON.parse(localStorage.getItem('naval.balance') || 'null'); if (saved) setBalance(saved); } catch (e) { /* storage blocked or bad data: the file's values */ }
  const game = new Game(engine, canvas, { seed: Number(qs.get('seed')) || (Math.random() * 1e6) | 0, islands: qs.has('islands') ? Number(qs.get('islands')) : 1, bases: qs.has('bases') ? Number(qs.get('bases')) : 1 });
  await game.init();
  S.set('Interface…', 0.42);
  window.__game = game;
  const { createUI } = await import('./game/ui/ui.js');
  game.ui = createUI(game);
  if (isMobile()) (await import('./game/ui/mobile.js')).initMobile(game, game.ui);
  // ?bench=1: the performance test dialog; ?bench=auto[&size=large]: the test at once (for the tools)
  if (qs.has('bench')) game.ui.startBench(qs.get('bench') === 'auto' ? (qs.get('size') === 'large' ? 'large' : 'medium') : undefined);
  if (qs.has('trailer')) {
    // offline trailer recorder (tools/trailer): scripted scenes, see js/trailer.js
    const { Trailer } = await import('./trailer.js');
    const { SCENES } = await import('./trailerScenes.js');
    Object.assign(SCENES, (await import('./trailerScenes020.js')).SCENES_020);
    const T = new Trailer(game);
    T.sink = (...a) => window.__sink(...a);
    window.__trailer = { T, scenes: Object.keys(SCENES), run: async (name) => { await SCENES[name](T); await T.finish(name); }, music: (spec) => T.music(spec) };
  }
  // everything that can be built before the first click is built now, while the first screen plays: the sounds (on workers) and the models
  if (!quick) {
    const prog = { sounds: 0, models: 0 };
    const show = (label) => S.set(label, 0.45 + 0.27 * prog.sounds + 0.27 * prog.models);
    game.audio.early();
    const lib = game.audio.lib;
    // (muted: nothing to wait for, the library builds itself in the background if the sound is switched on later)
    const sounds = !lib ? Promise.resolve() : game.audio.muted ? (lib.warm(), Promise.resolve()) : lib.ready((d, t) => { prog.sounds = d / Math.max(1, t); show(`Sons ${d} / ${t}`); });
    const models = preloadModels((d, t, name) => { prog.models = d / t; show(`Navires et avions : ${name}`); });
    // (after a few seconds a button lets the player in while the rest goes on)
    let iv = 0;
    await Promise.race([Promise.all([sounds, models]), new Promise((r) => { iv = setInterval(() => { if (S.skipped) r(); }, 200); })]);
    clearInterval(iv);
    S.set('Prêt', 1);
  }
  // quick start from the URL: ?scenario=duel&start=1&cam=orbit
  const preset = PRESETS.find((p) => p.id === qs.get('scenario'));
  if (THEATRES[qs.get('scenario')]) {
    // a war on a very large sea: ?scenario=war (or pacific, atlantic, med)&start=1&mode=tactical
    game.config.theatre = qs.get('scenario');
    game.spawn();
    if (qs.get('start') === '1') game.start();
    if (qs.has('mode')) game.camera.setMode(qs.get('mode'));
    if (qs.has('speed')) game.setTimeScale(Number(qs.get('speed')));
  } else if (preset) {
    game.config.teams = preset.teams.map((t, i) => ({ name: t.name, rgb: TEAM_COLORS[i].rgb, entries: t.entries.map((x) => ({ ...x })) }));
    game.config.sep = Number(qs.get('sep')) || 12000;
    game.spawn();
    if (qs.get('start') === '1') game.start();
    if (qs.has('mode')) game.camera.setMode(qs.get('mode'));
    if (qs.has('speed')) game.setTimeScale(Number(qs.get('speed')));
  } else {
    // start with the default fleets already on the water so there is something to look at
    game.ui.doSpawn();
  }
}
S.hide();
engine.start();
