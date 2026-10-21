// Entry point.
import { createEngine } from './engine.js';
import { Game } from './game/game.js';
import { PRESETS } from './game/scenarios.js';
import { TEAM_COLORS } from './game/sim/world.js';
import { isMobile, maxPixelRatio } from './game/device.js';
import { setBalanceFile, setBalance } from './game/data/balance.js';

const canvas = document.getElementById('c');
const qs = new URLSearchParams(location.search);
if (isMobile()) document.body.classList.add('mobile');
const engine = await createEngine(canvas, { maxDpr: maxPixelRatio() });
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
  // quick start from the URL: ?scenario=duel&start=1&cam=orbit
  const preset = PRESETS.find((p) => p.id === qs.get('scenario'));
  if (preset) {
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
engine.start();
