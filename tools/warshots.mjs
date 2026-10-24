// Pictures of the interface of the great war: node tools/warshots.mjs <outDir> [width] [height] [seconds of war before the pictures]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/warshots.mjs out/war
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';

const [out = 'out/war', W = '1600', H = '900', secs = '600'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: +W, height: +H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto('http://localhost:8080/index.html?seed=3&splash=0');
for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 10) break; }
const shot = async (name) => { await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
const G = (fn, ...a) => p.evaluate(fn, ...a);
await shot('setup');
await p.getByText('Lancer la guerre').first().click();
await p.waitForTimeout(8000);
await shot('ready');
await G(() => window.__game.start());
await G(() => window.__game.setTimeScale(8));
const t0 = Date.now();
while (Date.now() - t0 < 900000 && await G((s) => window.__game.world.time < s, +secs)) await p.waitForTimeout(1500);
await G(() => window.__game.setTimeScale(1));
await p.keyboard.press('6'); await shot('tactical');
await p.keyboard.press('1'); await p.waitForTimeout(4000); await shot('auto');
await p.keyboard.press('2'); await shot('follow');
await p.keyboard.press('KeyK'); await shot('bigmap');
console.log(JSON.stringify(await G(() => { const w = window.__game.world; return { t: w.time, ships: w.ships.filter((s) => s.alive).length, fps: window.__game.fps }; })));
await b.close();
