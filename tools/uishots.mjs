// Pictures of the interface in a running battle, to judge it: node tools/uishots.mjs <outDir> [width] [height]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/uishots.mjs out/ui
// Writes setup, ready, start, auto, follow, plane, tactical, free, bigmap, settings, help (.png). A fourth argument adds to the URL ("&mobile=1": the touch interface).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';

const [out = 'out/ui', W = '1600', H = '900', q = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: +W, height: +H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto(`http://localhost:8080/index.html?seed=3&islands=2&bases=1&splash=0${q}`);
for (let i = 0; i < 120; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 10) break; }
const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
const G = (fn, ...a) => p.evaluate(fn, ...a);
const until = async (cond, ms = 300000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await G(cond)) return true; await p.waitForTimeout(800); } return false; };
await p.waitForTimeout(1500);
await shot('setup');
await G(() => window.__game.ui.doSpawn?.());
await p.waitForTimeout(3000);
await shot('ready');
await G(() => window.__game.start());
await shot('start');
await G(() => window.__game.setTimeScale(8));
await until(() => window.__game.world.time > 150);
await G(() => window.__game.setTimeScale(1));
await p.keyboard.press('1');
await p.waitForTimeout(3000);
await shot('auto');
await p.keyboard.press('2');
await shot('follow');
await p.keyboard.press('8');
await p.waitForTimeout(1500);
await shot('plane');
await p.keyboard.press('6');
await shot('tactical');
await p.keyboard.press('7');
await shot('free');
await p.keyboard.press('KeyK');
await shot('bigmap');
await p.keyboard.press('KeyK');
await p.keyboard.press('KeyK');
await p.keyboard.press('KeyH');
await shot('settings');
await p.keyboard.press('KeyH');
await p.keyboard.press('F1');
await shot('help');
await p.keyboard.press('F1');
await b.close();
