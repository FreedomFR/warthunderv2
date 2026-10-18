// Render the trailer score to <out>/music.wav with the browser's OfflineAudioContext.
//   node tools/trailer/music.mjs <out dir> tools/trailer/score.json
// score.json: { "dur": 60, "bpm": 92, "intro": 6, "riseAt": 36, "climaxAt": 40, "titleAt": 53, "hits": [..s], "cuts": [..s] } (see js/trailerMusic.js)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [outDir, scoreFile] = process.argv.slice(2);
if (!outDir || !scoreFile) { console.error('usage: node tools/trailer/music.mjs <outDir> <score.json>'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(scoreFile, 'utf8'));
const chrome = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: chrome, args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-webgpu-developer-features'], headless: true });
const page = await browser.newPage();
await page.exposeFunction('__sinkAudio', (name, b64, marks, seconds) => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'music.wav'), Buffer.from(b64, 'base64'));
  console.log(`music: ${seconds.toFixed(1)} s`);
});
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 500)));
await page.goto(`http://localhost:8080/index.html?offscreen=1&manual=1&trailer=1&w=320&h=180`);
for (let i = 0; i < 600; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => !!window.__trailer).catch(() => false)) break; }
await page.evaluate((s) => window.__trailer.music(s), spec);
await browser.close();
