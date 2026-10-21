// What is built while the first screen plays: node test/preload.mjs
import { preloadModels } from '../js/game/preload.js';
import { ALL_SHIPS } from '../js/game/data/ships.js';
import { getModel } from '../js/game/model/cache.js';
import { getPlaneModel } from '../js/game/model/planes.js';
import fs from 'node:fs';

let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) { fail++; process.exitCode = 1; } };

// the models are built one after the other, reported, and cached (the same object comes back)
{
  const ships = ALL_SHIPS.slice(0, 2), seen = [];
  let yielded = 0;
  const iv = setInterval(() => yielded++, 0);
  const n = await preloadModels((d, t, name) => seen.push([d, t, name]), ships, ['sbd', 'b17']);
  clearInterval(iv);
  ok(n === 4 && seen.length === 4 && seen[3][0] === 4 && seen[3][1] === 4, `preloadModels builds and reports every model (${seen.map((q) => q[2]).join(', ')})`);
  ok(getModel(ships[0]) === getModel(ships[0]) && getPlaneModel('sbd') === getPlaneModel('sbd'), 'what it built is what the game is handed later');
  ok(yielded >= 2, 'it pauses between models so that the page keeps moving');
}
// the first screen is in the page, skipped by the tools, and the files it shows exist
{
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  ok(html.includes('id="splash"') && html.includes('docs/loading.mp4') && html.includes('window.__splash'), 'index.html has the first screen: the trailer clip, a bar, window.__splash');
  ok(/splash=0\|offscreen=1/.test(html), 'the tools (?offscreen=1) and ?splash=0 skip it');
  ok(fs.existsSync(new URL('../docs/loading.mp4', import.meta.url)) && fs.statSync(new URL('../docs/loading.mp4', import.meta.url)).size < 6e6, 'the clip exists and is light (under 6 MB)');
  ok(fs.existsSync(new URL('../docs/loading-poster.jpg', import.meta.url)), 'and its poster');
}
process.exit(fail ? 1 : 0);
