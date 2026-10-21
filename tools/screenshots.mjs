// Screenshots of the game for the README (docs/*.jpg): a real battle on the GPU, the page captured with its interface.
//   node server.mjs 8080 &
//   GPU=hardware node tools/screenshots.mjs <outDir>          (under WSL2: the Windows Node, see CLAUDE.md)
// Writes battle, fleet, action, tactical and damage-plan (.png). The other README pictures come from the trailer scenes (docs/README: see tools/trailer).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';

const out = process.argv[2] || 'out/readme';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));
await p.goto('http://localhost:8080/index.html?scenario=duel&seed=3&splash=0');
for (let i = 0; i < 120; i++) { await p.waitForTimeout(500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 10) break; }
const shot = async (name) => { await p.screenshot({ path: `${out}/${name}.png` }); console.log('saved', name); };
const G = (fn, ...a) => p.evaluate(fn, ...a);
// the composition screen: the fleets on the water, not started
await G(() => { const g = window.__game; const iowa = g.world.ships.find((s) => s.stats.id === 'iowa'); g.camera.setTarget(iowa); g.camera.setMode('orbit'); });
await p.waitForTimeout(2500);
await shot('fleet');
await G(() => { window.__game.start(); window.__game.setTimeScale(4); });
const until = async (cond, ms = 400000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await G(cond)) return true; await p.waitForTimeout(800); } return false; };
// a broadside of Iowa, the camera orbiting her at the moment the turrets fire
await until(() => window.__game.world.time > 70);
await G(() => { const g = window.__game; g.setTimeScale(1); const s = g.world.ships.find((x) => x.stats.id === 'iowa'); g.camera.setTarget(s); });
await p.keyboard.press('3');
await p.waitForFunction(() => window.__game.world.ships.find((x) => x.stats.id === 'iowa').mounts.some((m) => m.group === 'main' && m.flash > 0.9), null, { polling: 'raf', timeout: 120000 });
await shot('battle');
// an impact on Yamato
await G(() => { const g = window.__game; const y = g.world.ships.find((x) => x.stats.id === 'yamato'); g.camera.setTarget(y); });
await p.keyboard.press('3');
await p.waitForTimeout(2500);
await shot('action');
// the tactical view late in the battle, Yamato selected
await G(() => window.__game.setTimeScale(4));
await until(() => window.__game.world.time > 260);
await G(() => { const g = window.__game; g.setTimeScale(1); const y = g.world.ships.find((x) => x.stats.id === 'yamato'); g.camera.setTarget(y); });
await p.keyboard.press('6');
await p.waitForTimeout(2500);
await shot('tactical');
// the damage plan of a ship that has been hit
await G(() => { const g = window.__game; const w = g.world.ships.filter((s) => s.state === 'afloat').sort((a, c) => a.hpFrac - c.hpFrac)[0]; g.camera.setTarget(w); });
await p.keyboard.press('2');
await p.waitForTimeout(2500);
await shot('damage-plan');
await b.close();
