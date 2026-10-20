// Entry point of viewer.html: a 3D viewer for every ship and aircraft of the game (orbit, zoom, pan, light, debug link, screenshot).
//   viewer.html?m=iowa                       (m = ship id, plane:<type> or float:<nation>)
//   viewer.html?m=essex&az=250&el=20&d=300   camera; see js/viewer/state.js for the whole list (the "debug link" button builds them)
//   &embed=1 : minimal interface, for the wiki's inline viewer
import { createEngine } from './engine.js';
import { fromQuery, screen } from './viewer/state.js';
import { createScene } from './viewer/scene.js';
import { attachControls } from './viewer/controls.js';
import { createPanel } from './viewer/panel.js';

const qs = new URLSearchParams(location.search);
const embed = qs.get('embed') === '1';
const canvas = document.getElementById('c');
const status = document.getElementById('status');

try {
  const engine = await createEngine(canvas);
  window.__engine = engine;
  screen.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const st = fromQuery(qs, 'iowa');
  status.textContent = 'Construction du modèle…';
  await new Promise((r) => setTimeout(r, 30));
  const scene = await createScene(engine, st);
  window.__viewer = scene;
  if (st.scale !== 1) engine.setRenderScale(st.scale);
  const panel = createPanel(document.getElementById('ui'), scene, engine, { embed });
  window.__panel = panel;
  attachControls(canvas, scene, { onUserInput: () => scene.touch() });
  status.classList.remove('on');
  engine.start();
} catch (e) {
  console.error(e);
  const err = document.getElementById('err');
  err.style.display = 'block';
  if (!err.textContent) err.textContent = 'Le visualiseur n\'a pas pu démarrer : ' + (e && e.message ? e.message : e);
  status.classList.remove('on');
}
