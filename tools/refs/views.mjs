// Standard camera set for comparing a procedural model with photographs: starboard profile, bow and stern three-quarter views and a
// close look at the forecastle, with distances scaled to the length of each ship.
//   node tools/refs/views.mjs iowa,yamato,bismarck,essex > views.json
// The ships must be listed in the same order in the preview URL (?preview=iowa,yamato,...): "target" is the index in that list.
// Then:  node tools/refs/shots.mjs "http://localhost:8080/index.html?preview=iowa,yamato,bismarck,essex&offscreen=1&w=1280&h=720&parked=6&fov=38&ocean=0" out views.json 1280 720 900
import { BY_ID } from '../../js/game/data/ships.js';

const ids = (process.argv[2] || '').split(',').filter(Boolean);
if (!ids.length) { console.error('usage: node tools/refs/views.mjs id[,id...] > views.json'); process.exit(1); }
const r1 = (x) => Math.round(x * 10) / 10;
const out = [];
ids.forEach((id, target) => {
  const s = BY_ID[id];
  if (!s) { console.error('unknown ship id: ' + id); process.exit(1); }
  const L = s.loa;
  const view = (name, dist, az, el, lookY, lookX) => out.push({ name: `${id}_${name}`, wait: 500, set: { target, heading: 90, dist: r1(dist * L), az, el, lookY: r1(lookY * L), lookX: r1(lookX * L) } });
  //   heading 90 = bow towards +x; az 180 is the starboard side, bow to the right
  view('profile', 1.40, 180, 4, 0.07, 0);
  view('bow34', 1.05, 125, 10, 0.06, 0.05);
  view('aft34', 1.05, 232, 10, 0.06, -0.05);
  view('fore', 0.42, 150, 24, 0.05, 0.22);
});
console.log(JSON.stringify(out));
