// Watches the automatic camera in a running battle and keeps a picture of each kind of shot: node tools/directorlog.mjs "<url>" <outDir> [seconds]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/directorlog.mjs "http://localhost:8080/index.html?offscreen=1&w=1280&h=720&scenario=duel&seed=3&islands=2&bases=2&start=1&speed=4" out 120
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { launchOptions } from './browser.mjs';
const [url, outDir, seconds = '120'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 600)));
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[console.error] ' + m.text().slice(0, 400)); });
await p.goto(url);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(1500); if ((await p.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 6) break; }
await p.evaluate(() => window.__game.camera.setMode('auto', true));
const t0 = Date.now(), shown = {}, log = [];
let last = '';
while (Date.now() - t0 < +seconds * 1000) {
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => { const c = window.__game.camera, a = c.auto; return { sub: a.sub, t: +a.t.toFixed(1), held: +(a.held || 0).toFixed(1), simt: +window.__game.world.time.toFixed(0), tgt: c.target && c.target.name }; });
  const key = st.sub + ':' + st.tgt;
  if (key !== last) { log.push(`${st.simt}s ${st.sub} ${st.tgt || ''}`); last = key; }
  // a picture a second into each kind of shot, the first two of each kind
  if (st.held > 1 && (shown[st.sub] || 0) < 2 && !shown['_' + st.sub + st.simt]) {
    shown['_' + st.sub + st.simt] = 1; shown[st.sub] = (shown[st.sub] || 0) + 1;
    fs.writeFileSync(`${outDir}/${st.sub}_${shown[st.sub]}.png`, Buffer.from(await p.evaluate(() => window.__engine.capture()), 'base64'));
  }
}
console.log(log.join('\n'));
console.log('kinds seen:', Object.keys(shown).filter((k) => k[0] !== '_').join(' '));
await b.close();
