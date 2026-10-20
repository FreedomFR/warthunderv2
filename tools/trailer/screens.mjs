// Records the interfaces for the trailer (the wiki, the 3D viewer, the phone interface) as image sequences that tools/trailer/assemble.mjs reads like any other shot.
//   node tools/trailer/screens.mjs <outDir> [wiki|viewer|phone ...] [--url http://localhost:8080] [--fps 60]
// The page is recorded with the screencast of the browser (full-size JPEG frames, written when the picture changes: encoding a PNG for every frame is too slow to keep up with the page), then resampled to a constant frame rate.
// Frames land in <outDir>/screens/<shot>/00000.png. Run it on the GPU (see CLAUDE.md): the pages draw with WebGPU.
import { chromium } from 'playwright-core';
import { launchOptions } from '../browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const outDir = argv[0];
if (!outDir) { console.error('usage: node tools/trailer/screens.mjs <outDir> [wiki viewer phone] [--url ...] [--fps 60]'); process.exit(1); }
const opt = { url: 'http://localhost:8080', fps: 60 };
const names = [];
for (let i = 1; i < argv.length; i++) { if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else names.push(argv[i]); }
const which = names.length ? names : ['wiki', 'viewer', 'phone'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(shot, ctxOpts, run) {
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const bad = [];
  page.on('pageerror', (e) => bad.push(e.message.slice(0, 200)));
  const raw = path.join(outDir, 'screens', '_raw_' + shot);
  fs.rmSync(raw, { recursive: true, force: true }); fs.mkdirSync(raw, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const n = frames.length;
    fs.writeFileSync(path.join(raw, String(n).padStart(5, '0') + '.jpg'), Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await run(page, async (on) => {
    if (on) await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
    else await cdp.send('Page.stopScreencast');
  });
  await browser.close();
  if (bad.length) console.log(shot, 'page errors:', bad.join(' | '));
  // resample to a constant frame rate: each frame lasts until the next one
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1] - frames[i] : 1 / opt.fps;
    list.push(`file '${path.resolve(raw, String(i).padStart(5, '0') + '.jpg')}'`, `duration ${Math.max(d, 1 / 240).toFixed(5)}`);
  }
  list.push(`file '${path.resolve(raw, String(frames.length - 1).padStart(5, '0') + '.jpg')}'`);
  fs.writeFileSync(path.join(raw, 'list.txt'), list.join('\n'));
  const dest = path.join(outDir, 'screens', shot);
  fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(raw, 'list.txt'), '-vf', `fps=${opt.fps}`, path.join(dest, '%05d.png')], { encoding: 'utf8' });
  if (r.status !== 0) console.log(r.stderr);
  fs.rmSync(raw, { recursive: true, force: true });
  console.log(shot, frames.length, 'frames ->', fs.readdirSync(dest).length, 'at', opt.fps, 'fps, span', (frames[frames.length - 1] - frames[0]).toFixed(1), 's');
}

/** move the mouse in small steps (a drag that looks like a hand) */
async function drag(page, x0, y0, x1, y1, ms = 1200) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  const n = Math.round(ms / 16);
  for (let i = 1; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k); await page.mouse.move(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e); await sleep(16); }
  await page.mouse.up();
}

const SEQ = {
  // the tech tree of a nation, a ship card with its 3D model, the comparison table
  async wiki(page, cast) {
    await page.goto(opt.url + '/wiki.html#/japan');
    await sleep(3500);
    await cast(true);
    await sleep(1500);
    await page.mouse.move(900, 500, { steps: 12 });
    await sleep(900);
    await page.evaluate(() => { location.hash = '#/japan/yamato'; });
    await sleep(3200);
    await drag(page, 1000, 360, 1180, 330, 1400);
    await sleep(900);
    await page.evaluate(() => { location.hash = '#/usa'; });
    await sleep(1800);
    await cast(false);
  },
  // a ship turned in every direction, another light
  async viewer(page, cast) {
    await page.goto(opt.url + '/viewer.html?m=iowa&az=40&el=12&d=330');
    await sleep(5000);
    await cast(true);
    await sleep(800);
    await drag(page, 700, 500, 1100, 470, 1800);
    await sleep(300);
    await drag(page, 1000, 520, 700, 380, 1500);
    await sleep(500);
    const light = page.getByRole('button', { name: 'Coucher de soleil' });
    if (await light.count()) await light.first().click();
    await sleep(900);
    await drag(page, 900, 450, 1200, 500, 1700);
    await sleep(1200);
    await cast(false);
  },
  // the touch interface of a phone: menu, camera row, joystick of the free camera
  async phone(page, cast) {
    await page.goto(opt.url + '/index.html?scenario=duel&seed=3&start=1&mobile=1');
    await page.waitForFunction(() => window.__game && window.__engine.frameIndex > 200, null, { timeout: 120000 });
    await sleep(2000);
    await cast(true);
    const tap = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
    await sleep(1500);
    await tap('#mbar .mb:last-child'); await sleep(1400);
    await tap('#mmenu button:has-text("Fiche du navire")'); await sleep(1200);
    await tap('#mbar .mb:last-child'); await sleep(1200);
    await tap('#cambar .cam:has-text("Orbite")'); await sleep(1500);
    await page.evaluate(() => { const cdp = 1; });
    await tap('#cambar .cam:has-text("Libre")'); await sleep(1200);
    await cast(false);
  },
};

for (const name of which) {
  const ctx = name === 'phone'
    ? { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.1, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' }
    : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
  await record(name, ctx, SEQ[name]);
}
