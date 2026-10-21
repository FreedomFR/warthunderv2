// Runs the in-game performance test (ui/bench.js) in the browser of the tools and prints its report: node tools/benchrun.mjs [medium|large] [extra url parameters]
//   GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/benchrun.mjs medium "&w=1280&h=720"
import { chromium } from 'playwright-core';
import { launchOptions } from './browser.mjs';
const [size = 'medium', extra = '&offscreen=1&w=1280&h=720'] = process.argv.slice(2);
const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 400)));
await p.goto(`http://localhost:8080/index.html?bench=auto&size=${size}${extra}`);
const r = await p.waitForFunction(() => window.__benchReport, null, { timeout: 600000, polling: 1000 }).then((h) => h.jsonValue());
console.log(await p.evaluate(() => document.querySelector('#bench textarea')?.value.split('\n--- données ---')[0] || 'no report'));
await b.close();
