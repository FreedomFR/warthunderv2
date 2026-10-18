// Compile the WGSL shaders with a real WebGPU device (headless Chromium) and print the compiler messages.
//   node server.mjs 8080 &        node tools/wgslcheck.mjs
// Needs playwright-core and a Chromium with WebGPU (software SwiftShader is fine).
import { chromium } from 'playwright-core';
import { launchOptions } from './browser.mjs';

const url = process.argv[2] || 'http://localhost:8080';
const LIST = [['/js/wgsl/ship.js', ['SHIP', 'SHIP_SHADOW']], ['/js/wgsl/ocean.js', ['OCEAN', 'SKY_BG']], ['/js/wgsl/particles.js', ['PARTICLES']], ['/js/wgsl/post.js', ['BLOOM_DOWN', 'BLOOM_UP', 'COMPOSITE']]];
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
await page.goto(`${url}/__none__.html`).catch(() => {});
const res = await page.evaluate(async (list) => {
  const dev = await (await navigator.gpu.requestAdapter()).requestDevice();
  const out = [];
  for (const [mod, names] of list) {
    const m = await import(mod);
    for (const n of names) {
      const info = await dev.createShaderModule({ code: m[n] }).getCompilationInfo();
      out.push({ name: n, errors: info.messages.filter((x) => x.type === 'error').map((x) => `${x.lineNum}:${x.linePos} ${x.message}`) });
    }
  }
  return out;
}, LIST);
let bad = 0;
for (const r of res) { console.log(r.errors.length ? 'FAIL' : 'ok  ', r.name, r.errors.join('\n      ')); bad += r.errors.length; }
await browser.close();
process.exit(bad ? 1 : 0);
