// Pictures of a port in a theatre of war: node tools/portshots.mjs <outDir> [seed=1] [large|medium=large] [width=1280] [height=720]
// Runs tools/baseshots.mjs on the war scenario with a list of views: from the sea, from the air, along the pier, the quay cranes, the warehouses and the dockyard from the yard, the anchorage,
// two ships alongside the pier, then the same with half of the buildings damaged and destroyed. The server must be running (node server.mjs 8080); on the GPU of the PC:
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/portshots.mjs out/ports
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [outDir = 'out/ports', seed = '1', size = 'large', width = '1280', height = '720'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
// (`near(base, s, t, h)`: the point s metres out along the axis of the port, t to the right of it, h above the yard; look(x, y, z, tx, ty, tz, fov) puts the free camera)
const view = (name, from, to, fov = 60, extra = '', wait = 2000) => ({ name, eval: `${extra}; { const [x, y, z] = near(P0, ${from}); const [tx, ty, tz] = near(P0, ${to}); look(x, y, z, tx, ty, tz, ${fov}); }`, wait });
// (the parts of a kind, every other one from `k0`: set to 0 intact, 1 damaged, 2 destroyed)
const states = (kinds, v, k0 = 0) => `P0.layout.parts.filter((p) => ${JSON.stringify(kinds)}.includes(p.kind)).forEach((p) => { if ((p.id + ${k0}) % 2 === 0) P0.partState[p.id] = ${v}; })`;
const shots = [
  { name: 'setup', eval: `window.P0 = window.__game.world.bases.find((q) => q.layout.kind === 'port' && q.layout.size === '${size}'); window.__game.paused = true`, wait: 500 },
  view('sea', '900, 260, 60', '300, 0, 3', 55),
  view('air', '150, 150, 260', '250, 0, 0', 60),
  view('wharf', '340, -150, 14', '160, -20, 3'),
  view('yard', '230, 30, 120', '40, 0, 0', 65),
  view('pier', '190, 4, 12', '480, 0, 3'),
  view('cranes', '290, 60, 16', '340, -5, 10', 55),
  view('head', '690, -30, 14', '580, 0, 5', 55),
  view('waterline', '420, -75, 1.5', '300, -17, 2'),
  view('sheds', '130, -60, 9', '38, -75, 3'),
  view('dockyard', '120, -45, 14', '70, -20, 6'),
  view('tanks', '-50, 0, 25', '-120, 0, 5'),
  { name: 'anchorage', eval: 'const m = P0.layout.moorings[0], L = P0.layout; look(m.x + 80 * Math.cos(L.ang) + 30, 18, m.z + 80 * Math.sin(L.ang), m.x, 2, m.z, 55)', wait: 2000 },
  // two ships alongside: the biggest of the team of the port and a smaller one, each in the berth that `findBerth` gives
  view('berth', '330, -80, 22', '330, -20, 6', 60, `(async () => { const w = window.__game.world, P = await import('/js/game/sim/ports.js'); const ships = w.ships.filter((s) => s.team === P0.team).sort((a, b) => b.stats.L - a.stats.L); for (const s of [ships[0], ships[Math.min(5, ships.length - 1)]]) { const sl = P.findBerth(P0, s); s.x = sl.x; s.z = sl.z; s.heading = sl.heading; s.speed = 0; s.cmd.throttle = 0; P0.moored.push({ ship: s, slot: sl }); } })()`, 2500),
  view('berth_far', '200, -110, 30', '300, -20, 4', 50),
  view('ruins_air', '190, 10, 60', '60, 0, 0', 70, `${states(['warehouse', 'dockyard'], 2)}; ${states(['warehouse', 'dockyard'], 1, 1)}`),
  view('ruins_cranes', '300, 50, 22', '420, 0, 4', 60, `${states(['crane'], 2)}; ${states(['crane'], 1, 1)}`),
];
const file = path.join(outDir, 'shots.json');
fs.writeFileSync(file, JSON.stringify(shots, null, 1));
const hw = process.env.GPU === 'hardware';
const url = `http://localhost:8080/index.html?${hw ? 'offscreen=0' : `offscreen=1&w=${width}&h=${height}`}&scenario=war&seed=${seed}&start=1&splash=0`;
const r = spawnSync(process.execPath, [path.join(here, 'baseshots.mjs'), url, outDir, file, width, height, '600'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
