// Offline recorder for the trailer: renders the scripted scenes of js/trailerScenes.js frame by frame with WebGPU in a headless
// Chromium (SwiftShader when there is no GPU) and writes one PNG per frame.
//
//   node server.mjs 8080 &                                  # the game must be served
//   node tools/trailer/record.mjs <scene> <outDir> [options]
//
// options: --w 1280 --h 720 --stride 1 (render every Nth frame: contact sheets) --url http://localhost:8080 --grid 8 --fft 128
//          --audio 1 (also render the game sounds of the scene to audio.wav)  --chrome /path/to/chrome  --seed ... (extra query parameters can be given as --q key=value)
// Frames land in <outDir>/<scene>/<shot>/00000.png. Chromium must support WebGPU (--enable-unsafe-webgpu); on machines without a
// GPU the software adapter is used: expect several seconds per frame.
import { chromium } from 'playwright-core';
import { launchOptions } from '../browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const scene = argv[0], outDir = argv[1];
if (!scene || !outDir) { console.error('usage: node tools/trailer/record.mjs <scene> <outDir> [--w N --h N --stride N]'); process.exit(1); }
const opt = { w: 1280, h: 720, stride: 1, url: 'http://localhost:8080', grid: 8, fft: 128, chrome: '', q: [] };
for (let i = 2; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'q') opt.q.push(argv[++i]); else opt[k] = isNaN(Number(argv[i + 1])) ? argv[++i] : Number(argv[++i]);
}
const query = new URLSearchParams({ offscreen: 1, manual: 1, trailer: 1, w: opt.w, h: opt.h, grid: opt.grid, fft: opt.fft, stride: opt.stride, seed: 7, audio: opt.audio ? 1 : 0 });
for (const kv of opt.q) { const [k, v] = kv.split('='); query.set(k, v); }

const browser = await chromium.launch(launchOptions(opt.chrome ? { executablePath: opt.chrome } : {}));
const page = await browser.newPage({ viewport: { width: opt.w, height: opt.h } });
let frames = 0, audioInfo = null;
const t0 = Date.now();
const shots = {};
await page.exposeFunction('__sink', (shot, index, b64) => {
  const dir = path.join(outDir, scene, shot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, String(index).padStart(5, '0') + '.png'), Buffer.from(b64, 'base64'));
  shots[shot] = (shots[shot] || 0) + 1;
  frames++;
  if (frames % 10 === 0) console.log(`  ${frames} frames, ${((Date.now() - t0) / frames / 1000).toFixed(1)} s/frame (${shot} #${index})`);
});
await page.exposeFunction('__sinkAudio', (name, b64, marks, seconds) => {
  const dir = name === 'music' ? outDir : path.join(outDir, scene);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name === 'music' ? 'music.wav' : 'audio.wav'), Buffer.from(b64, 'base64'));
  audioInfo = { marks, seconds };
  console.log(`audio ${name}: ${seconds.toFixed(1)} s`);
});
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 600)));
page.on('console', (m) => { if (m.type() === 'error' || /FATAL|GPU error|^\[T\]/.test(m.text())) console.log('[console] ' + m.text().slice(0, 400)); });
await page.goto(`${opt.url}/index.html?${query}`);
for (let i = 0; i < 900; i++) {
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!window.__trailer).catch(() => false)) break;
}
console.log('page ready, recording scene', scene);
await page.evaluate((s) => window.__trailer.run(s), scene);
fs.mkdirSync(path.join(outDir, scene), { recursive: true });
fs.writeFileSync(path.join(outDir, scene, 'manifest.json'), JSON.stringify({ scene, fps: 24, w: opt.w, h: opt.h, shots, audio: audioInfo, seconds: (Date.now() - t0) / 1000 }, null, 1));
console.log(`done: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
