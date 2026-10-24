// The interface of a theatre with the names shown, hidden (L), the list of the fleets hidden (T) and the whole HUD hidden (G): node tools/labelshots.mjs <outDir> [scenario=war] [width] [height]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [out = 'out/labels', sc = 'war', W = '1600', H = '900'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: +W, height: +H } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto(`${process.env.BASE || 'http://localhost:8080'}/index.html?scenario=${sc}&start=1&seed=2&splash=0`);
for (let i = 0; i < 240; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 30 && (await p.evaluate(() => window.__game && window.__game.state)) === 'running') break; }
await p.evaluate(() => window.__game.setTimeScale(8));
await p.waitForTimeout(25000);
await p.evaluate(() => window.__game.setTimeScale(1));
await p.keyboard.press('1');
await p.waitForTimeout(2500);
const shot = async (name) => { await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
await shot('labels_on');
await p.keyboard.press('l');
await shot('labels_off');
await p.keyboard.press('t');
await shot('teams_off');
await p.keyboard.press('g');
await shot('hud_off');
await b.close();
