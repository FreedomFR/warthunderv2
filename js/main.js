// Entry point.
import { createEngine } from './engine.js';
import { Game } from './game/game.js';
import { PRESETS } from './game/scenarios.js';
import { TEAM_COLORS } from './game/sim/world.js';

const canvas = document.getElementById('c');
const qs = new URLSearchParams(location.search);
const engine = await createEngine(canvas);
window.__engine = engine;

if (qs.has('preview')) {
  const { runPreview } = await import('./preview.js');
  await runPreview(engine, qs.get('preview').split(','), qs);
} else {
  const game = new Game(engine, canvas, { seed: Number(qs.get('seed')) || (Math.random() * 1e6) | 0 });
  await game.init();
  window.__game = game;
  const { createUI } = await import('./game/ui/ui.js');
  game.ui = createUI(game);
  // quick start from the URL: ?scenario=duel&start=1&cam=orbit
  const preset = PRESETS.find((p) => p.id === qs.get('scenario'));
  if (preset) {
    game.config.teams = preset.teams.map((t, i) => ({ name: t.name, rgb: TEAM_COLORS[i].rgb, entries: t.entries.map((x) => ({ ...x })) }));
    game.config.sep = Number(qs.get('sep')) || 12000;
    game.spawn();
    if (qs.get('start') === '1') game.start();
    if (qs.has('mode')) game.camera.setMode(qs.get('mode'));
    if (qs.has('speed')) game.setTimeScale(Number(qs.get('speed')));
  }
}
engine.start();
