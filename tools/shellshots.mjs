// Pictures from the cameras of the ships towards the enemy in a gun battle (the shells in flight, the hits): node tools/shellshots.mjs <outDir> [extra url parameters]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/shellshots.mjs out/shells
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [out, extra = ''] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto(`http://localhost:8080/index.html?offscreen=1&w=1280&h=720&scenario=duel&seed=3&start=1&sep=9000${extra}`);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(1000); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate(() => window.__game.setTimeScale(8));
await p.waitForFunction(() => window.__game.world.time > 150, null, { timeout: 200000 });
const views = [['bridge', 'iowa'], ['follow', 'iowa'], ['bridge', 'fletcher'], ['follow', 'yamato'], ['bridge', 'baltimore'], ['orbit', 'kagero']];
let n = 0;
for (const [mode, id] of views) {
  await p.evaluate(([mode, id]) => { const g = window.__game; g.setTimeScale(1); const s = g.world.ships.find((x) => x.stats.id === id && x.alive) || g.world.ships.find((x) => x.alive); g.camera.setTarget(s); g.camera.setMode(mode, true);
    // look at the enemy: the follow / bridge camera turned towards her target
    const t = s.cmd.main.target; if (t && mode !== 'orbit') { const brg = Math.atan2(t.x - s.x, -(t.z - s.z)); if (mode === 'bridge') g.camera.bridge.yaw = brg - s.heading; else g.camera.follow.yaw = brg - s.heading + Math.PI; } }, [mode, id]);
  await p.waitForTimeout(2500);
  for (let k = 0; k < 2; k++) { fs.writeFileSync(`${out}/s${n}_${k}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64')); await p.waitForTimeout(700); }
  n++;
}
await b.close();
