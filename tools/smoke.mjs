// Browser smoke test: start a battle in headless Chromium (software WebGPU when there is no GPU), switch through the cameras and the
// quality presets and fail on any page error or console error.
//   node server.mjs 8080 &
//   node tools/smoke.mjs [url] [seconds]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:8080/index.html?scenario=carriers&start=1&seed=3&speed=4&scale=0.4&shadows=1';
const seconds = Number(process.argv[3] || 60);
const chrome = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: chrome, headless: true,
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-webgpu-developer-features'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) problems.push('console.error: ' + m.text().slice(0, 400)); });
await page.goto(url);
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await page.waitForTimeout(1500);
  if ((await page.evaluate(() => (window.__engine ? window.__engine.frameIndex : -1)).catch(() => -1)) >= 8) break;
}
const state = () => page.evaluate(() => {
  const g = window.__game, w = g.world;
  return { frames: window.__engine.frameIndex, t: +w.time.toFixed(1), ships: w.ships.length, afloat: w.ships.filter((s) => s.state === 'afloat').length, shells: w.shells.length, planes: w.planes.length, mode: g.camera.mode, quality: g.qualityMode, qLevel: g.qLevel };
});
console.log('started', JSON.stringify(await state()));
const t1 = Date.now();
let key = 1;
while (Date.now() - t1 < seconds * 1000) {
  await page.keyboard.press(String(key)); // cameras 1..9 (the aircraft cameras need an aircraft: they fall back to another mode)
  key = key % 9 + 1;
  await page.waitForTimeout(3000);
  console.log(JSON.stringify(await state()));
}
for (const q of ['low', 'medium', 'high', 'auto']) {
  await page.evaluate((m) => window.__game.setQuality(m), q);
  await page.waitForTimeout(2500);
  console.log('quality', q, JSON.stringify(await state()));
}
await browser.close();
if (problems.length) { console.error('\nPROBLEMS:\n' + [...new Set(problems)].join('\n')); process.exit(1); }
console.log('smoke test ok');
