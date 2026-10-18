// Chromium launch options shared by the tools (smoke test, shader check, trailer recorder, reference views).
//
//   CHROME=/path/to/chrome   which browser to start (default: the Chromium of the cloud image when present, else the installed Google Chrome)
//   GPU=hardware             render with the machine's GPU (default: software WebGPU through SwiftShader: works anywhere, but is slow)
//
// Headless Chromium cannot present to an on-screen WebGPU canvas, so the tools load the game with ?offscreen=1.
import fs from 'node:fs';

const CLOUD_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function launchOptions(extra = {}) {
  const hardware = process.env.GPU === 'hardware';
  const args = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-webgpu-developer-features'];
  if (!hardware) args.push('--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-features=Vulkan', '--no-sandbox');
  const exe = extra.executablePath || process.env.CHROME || (fs.existsSync(CLOUD_CHROME) ? CLOUD_CHROME : '');
  return { args, headless: true, ...extra, ...(exe ? { executablePath: exe } : { channel: 'chrome' }) };
}
