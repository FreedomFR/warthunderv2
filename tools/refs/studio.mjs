// A model seen from every side on a plain background, each view lit from behind the camera (the sun in the sky of the game is
// behind the ship from most angles, which hides the faults of a model):
//   node tools/refs/studio.mjs <shipId>[,<shipId>...] [outDir=out/studio] [--bg=1.5] [--w=1280] [--h=720] [--views=starboard,port,...]
// With the game served (node server.mjs 8080). On the GPU from WSL: GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/refs/studio.mjs iowa
// Writes <outDir>/<ship>/<view>.png, and a contact sheet <outDir>/<ship>.jpg when python3 + Pillow are reachable (not from the Windows Node: run tools/refs/sheet.py after).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { launchOptions } from '../browser.mjs';
import { BY_ID } from '../../js/game/data/ships.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const ids = (args[0] || '').split(',').filter(Boolean), outDir = args[1] || 'out/studio';
if (!ids.length) { console.log('usage: studio.mjs <shipId>[,...] [outDir]'); process.exit(1); }
const W = +(flags.w || 1280), H = +(flags.h || 720), bg = +(flags.bg || 1.1), base = flags.base || 'http://localhost:8080';
// az: 180 = starboard profile, 0 = port, 90 = from ahead, 270 = from astern (heading 90: the bow towards +x); [az, el, distance in lengths]
const VIEWS = {
  starboard: [180, 5, 1.2], port: [0, 5, 1.2],
  bow_starboard: [135, 20, 1.0], bow_port: [45, 20, 1.0], stern_starboard: [225, 20, 1.0], stern_port: [315, 20, 1.0],
  bow: [90, 8, 1.2], stern: [270, 8, 1.2], top: [180, 80, 1.2],
};
const want = (flags.views || 'starboard,port,bow_starboard,bow_port,stern_starboard,stern_port,bow,stern,top').split(',');
const b = await chromium.launch(launchOptions());
for (const id of ids) {
  const dir = `${outDir}/${id}`; fs.mkdirSync(dir, { recursive: true });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 400)));
  await p.goto(`${base}/index.html?preview=${id}&offscreen=1&w=${W}&h=${H}&parked=6&fov=36&ocean=0&flags=0&matte=1&bg=${bg},${bg},${bg * 1.02}&quality=high`);
  for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
  const len = BY_ID[id]?.loa || Number(flags.len) || 120;
  for (const name of want) {
    const [az, el, d] = VIEWS[name];
    await p.evaluate(({ az, el, d, len }) => {
      window.__engine.P.sunAzim = az + 28; window.__engine.P.sunElev = 42;
      window.__preview.set({ target: 0, heading: 90, az, el, dist: d * len * 1.0, lookY: len * 0.08 + 3, lookX: 0 });
    }, { az, el, d, len });
    await p.waitForTimeout(1200);
    fs.writeFileSync(`${dir}/${name}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  }
  await p.close();
  const r = spawnSync('python3', ['tools/refs/sheet.py', `${outDir}/${id}.jpg`, dir, '3'], { encoding: 'utf8' });
  console.log(id, r.error || r.status ? `pictures in ${dir}; contact sheet: python3 tools/refs/sheet.py ${outDir}/${id}.jpg ${dir} 3` : r.stdout.trim());
}
await b.close();
