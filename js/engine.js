// WebGPU ocean engine — derived from Noniv/web-ocean (MIT), restructured so a game can sit on top.
// FFT ocean (6 cascades) + CDLOD surface mesh + physically based sky + HDR post.
//
// What changed compared to the original single-file demo:
//   * everything lives in createEngine(); no input / UI code here (the game owns the camera)
//   * hooks: update -> prepare -> (ocean + drawOpaque + sky + drawOverlay) so a game can draw
//     its own geometry into the same HDR / MSAA / reverse-Z pass
//   * water.* : multi-point water height query (async GPU read-back) for buoyancy
//   * foam.*  : world-space foam "stamps" (ship wakes, shell splashes, torpedo tracks)
//   * offscreen mode + capture() for headless testing, render scale for slower GPUs
import { N, CASCADES, SKY_W, SKY_H, ENV_SIZE, ENV_MIPS } from './wgsl/common.js';
import { SIM_INIT, SIM_EVOLVE, FFT_ROWS, FFT_COLS, SIM_MIPS, FOAM_TEX, RGBA8_MIPS, FOAM_UPDATE, ARRAY16_MIPS, FOAM_RES } from './wgsl/sim.js';
import { TRANS_LUT, MS_LUT, SKYVIEW_LUT, ENV_CUBE, CUBE_MIPS, SUN_VIS } from './wgsl/sky.js';
import { OCEAN, SKY_BG, WATER_PROBE } from './wgsl/ocean.js';
import { BLOOM_DOWN, BLOOM_UP, COMPOSITE } from './wgsl/post.js';

const D2R = Math.PI / 180;
const GU = GPUBufferUsage;
const TU = GPUTextureUsage;

// ----------------------------------------------------------------------------------------
// Tunable parameters (the settings panel edits these)
// ----------------------------------------------------------------------------------------
export const P = {
  windSpeed: 7.0,      // m/s at 10 m
  windDir: 118,        // deg, direction waves travel (90 = towards +Z, i.e. towards the viewer)
  fetchKm: 90,
  swellHs: 1.8,        // m significant height
  swellDir: 94,
  swellLength: 120,    // m peak wavelength
  swellSpread: 48,     // cos^2s exponent
  choppy: 1.25,
  turbidity: 1.6,      // water body brightness (coastal sediment / plankton)
  foam: 1.0,
  sunElev: 2.6,        // deg
  sunAzim: 4,          // deg (0 = straight ahead of the start view)
  exposure: 1.35,
  haze: 3.0,
  clouds: 0.40,
  veil: 0.36,
  bloom: 0.10,
  // colour grade (not in the sliders; the trailer director changes them per scene)
  vignette: 0.10, saturation: 1.05, contrast: 1.06, warmth: -0.19,
};

// [key, label, min, max, step, dirty]  dirty: 'spec' = rebuild spectrum, 'lut' = rebuild atmosphere
export const SLIDERS = [
  ['windSpeed', 'Vent (m/s)', 2, 20, 0.1, 'spec'],
  ['windDir', 'Direction du vent (°)', 0, 360, 1, 'spec'],
  ['fetchKm', 'Fetch (km)', 5, 800, 1, 'spec'],
  ['swellHs', 'Houle (m)', 0, 4, 0.05, 'spec'],
  ['swellLength', 'Longueur de houle (m)', 30, 300, 1, 'spec'],
  ['swellDir', 'Direction de la houle (°)', 0, 360, 1, 'spec'],
  ['choppy', 'Clapot', 0, 1.6, 0.01, 'spec'],
  ['turbidity', 'Turbidité de l\'eau', 0.2, 3, 0.01, ''],
  ['foam', 'Écume', 0, 3, 0.01, ''],
  ['sunElev', 'Hauteur du soleil (°)', -2, 60, 0.1, ''],
  ['sunAzim', 'Azimut du soleil (°)', -180, 180, 0.5, ''],
  ['haze', 'Brume', 0.5, 15, 0.1, 'lut'],
  ['clouds', 'Nuages bas', 0, 1, 0.01, ''],
  ['veil', 'Voile nuageux', 0, 1, 0.01, ''],
  ['exposure', 'Exposition', 0.1, 4, 0.01, ''],
  ['bloom', 'Bloom', 0, 0.3, 0.001, ''],
];

const CASC_L = [1103.0, 211.3, 39.7, 7.43, 1.393, 0.2617];
export const MAX_PROBE = 2048;     // water height queries per frame (camera included)
export const MAX_STAMPS = 384;     // foam stamps per frame

function log(msg) {
  console.log(msg);
  // the dev server keeps a copy of the log; a published site has no such endpoint
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) try { fetch('/__log', { method: 'POST', body: String(msg) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ----------------------------------------------------------------------------------------
// Small math helpers writing into preallocated arrays
// ----------------------------------------------------------------------------------------
function mat4Mul(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

/**
 * Create the engine. `canvas` is the WebGPU canvas.
 * options: { offscreen, renderScale, fixedDt }
 */
export async function createEngine(canvas, options = {}) {
  const qs = new URLSearchParams(location.search);
  const DBG = Number(qs.get('dbg')) || 0;
  for (const k of Object.keys(P)) if (qs.has(k)) P[k] = Number(qs.get(k));

  const fail = (msg) => {
    const el = document.getElementById('err');
    if (el) { el.style.display = 'block'; el.textContent = msg; }
    log('FATAL ' + msg);
    throw new Error(msg);
  };
  if (!navigator.gpu) fail('WebGPU n\'est pas disponible dans ce navigateur (utilisez un Chrome récent).');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) fail('Aucun adaptateur WebGPU trouvé.');
  const hasTS = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({
    requiredFeatures: hasTS ? ['timestamp-query'] : [],
  });
  device.lost.then((i) => log('device lost: ' + i.message));
  device.onuncapturederror = (e) => log('GPU error: ' + e.error.message);

  const swapFormat = navigator.gpu.getPreferredCanvasFormat();
  // Offscreen mode renders into our own texture instead of the swap chain (used by the headless
  // test harness: software WebGPU cannot present to a canvas).
  const offscreen = options.offscreen ?? qs.get('offscreen') === '1';
  const ctx = offscreen ? null : canvas.getContext('webgpu');
  if (ctx) ctx.configure({ device, format: swapFormat, alphaMode: 'opaque', usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC });

  async function shader(code, label) {
    const m = device.createShaderModule({ code, label });
    const info = await m.getCompilationInfo();
    let bad = false;
    for (const msg of info.messages) {
      if (msg.type === 'error') bad = true;
      if (msg.type !== 'info') {
        const line = code.split('\n')[msg.lineNum - 1];
        log(`[${label}] ${msg.type} ${msg.lineNum}:${msg.linePos} ${msg.message}\n    ${line}`);
      }
    }
    if (bad) fail('Erreur de compilation du shader ' + label + ' (voir la console)');
    return m;
  }
  async function computePipe(code, label) {
    const module = await shader(code, label);
    return device.createComputePipelineAsync({ label, layout: 'auto', compute: { module, entryPoint: 'main' } });
  }

  // --------------------------------------------------------------------------------------
  // Simulation resources
  // --------------------------------------------------------------------------------------
  const C = CASCADES;
  const SIM_MIP_COUNT = Math.log2(N) + 1;
  const specBytes = N * N * C * 16;
  const mkBuf = (size, usage, label) => device.createBuffer({ size, usage, label });
  const simUBO = mkBuf(224, GU.UNIFORM | GU.COPY_DST, 'sim ubo');
  const h0Buf = mkBuf(specBytes, GU.STORAGE, 'h0');
  const specA = mkBuf(specBytes, GU.STORAGE, 'specA');
  const specB = mkBuf(specBytes, GU.STORAGE, 'specB');
  const tmpA = mkBuf(specBytes, GU.STORAGE, 'tmpA');
  const tmpB = mkBuf(specBytes, GU.STORAGE, 'tmpB');

  const mkSimTex = (label) => device.createTexture({
    label, size: [N, N, C], format: 'rgba16float', mipLevelCount: SIM_MIP_COUNT,
    usage: TU.TEXTURE_BINDING | TU.STORAGE_BINDING,
  });
  const dispTex = mkSimTex('disp');
  const derivTex = mkSimTex('deriv');
  const momTex = mkSimTex('moments');
  const lvl = (t, m, dim = '2d-array') => t.createView({ dimension: dim, baseMipLevel: m, mipLevelCount: 1 });
  const fullArr = (t) => t.createView({ dimension: '2d-array' });

  const [initPipe, evolvePipe, rowsPipe, colsPipe, simMipPipe, foamGenPipe, rgba8MipPipe,
    transPipe, msPipe, skyViewPipe, envPipe, cubeMipPipe, foamUpdPipe, arr16MipPipe, sunVisPipe, probePipe] = await Promise.all([
    computePipe(SIM_INIT, 'sim init'),
    computePipe(SIM_EVOLVE, 'sim evolve'),
    computePipe(FFT_ROWS, 'fft rows'),
    computePipe(FFT_COLS, 'fft cols'),
    computePipe(SIM_MIPS, 'sim mips'),
    computePipe(FOAM_TEX, 'foam tex'),
    computePipe(RGBA8_MIPS, 'rgba8 mips'),
    computePipe(TRANS_LUT, 'transmittance'),
    computePipe(MS_LUT, 'multiscatter'),
    computePipe(SKYVIEW_LUT, 'skyview'),
    computePipe(ENV_CUBE, 'env cube'),
    computePipe(CUBE_MIPS, 'cube mips'),
    computePipe(FOAM_UPDATE, 'foam update'),
    computePipe(ARRAY16_MIPS, 'array16 mips'),
    computePipe(SUN_VIS, 'sun visibility'),
    computePipe(WATER_PROBE, 'water probe'),
  ]);

  const bg = (pipe, entries, label) => device.createBindGroup({
    label, layout: pipe.getBindGroupLayout(0),
    entries: entries.map((r, i) => ({ binding: i, resource: r })),
  });
  const bgInit = bg(initPipe, [{ buffer: simUBO }, { buffer: h0Buf }], 'init');
  const bgEvolve = bg(evolvePipe, [{ buffer: simUBO }, { buffer: h0Buf }, { buffer: specA }, { buffer: specB }], 'evolve');
  const bgRows = bg(rowsPipe, [{ buffer: specA }, { buffer: specB }, { buffer: tmpA }, { buffer: tmpB }], 'rows');
  const bgCols = bg(colsPipe, [{ buffer: tmpA }, { buffer: tmpB },
    lvl(dispTex, 0), lvl(derivTex, 0), lvl(momTex, 0)], 'cols');
  const bgSimMips = [];
  for (let m = 1; m < SIM_MIP_COUNT; m++) {
    bgSimMips.push(bg(simMipPipe, [lvl(dispTex, m - 1), lvl(derivTex, m - 1), lvl(momTex, m - 1),
      lvl(dispTex, m), lvl(derivTex, m), lvl(momTex, m)], 'simmip' + m));
  }

  // Foam micro-structure texture (generated once)
  const FOAM_SIZE = 512, FOAM_MIPS = 10;
  const foamTex = device.createTexture({
    label: 'foam detail', size: [FOAM_SIZE, FOAM_SIZE], format: 'rgba8unorm', mipLevelCount: FOAM_MIPS,
    usage: TU.TEXTURE_BINDING | TU.STORAGE_BINDING,
  });
  {
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(foamGenPipe);
    cp.setBindGroup(0, bg(foamGenPipe, [lvl(foamTex, 0, '2d')]));
    cp.dispatchWorkgroups(FOAM_SIZE / 8, FOAM_SIZE / 8);
    cp.setPipeline(rgba8MipPipe);
    for (let m = 1; m < FOAM_MIPS; m++) {
      const s = FOAM_SIZE >> m;
      cp.setBindGroup(0, bg(rgba8MipPipe, [lvl(foamTex, m - 1, '2d'), lvl(foamTex, m, '2d')]));
      cp.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8));
    }
    cp.end();
    device.queue.submit([enc.finish()]);
  }

  // World-space foam clipmaps (ping-pong)
  const FOAM_LEVEL_SIZE = [128.0, 1024.0];
  const FOAMW_MIPS = Math.log2(FOAM_RES) + 1;
  const foamW = [0, 1].map((i) => device.createTexture({
    label: 'foam world ' + i, size: [FOAM_RES, FOAM_RES, 2], format: 'rgba16float', mipLevelCount: FOAMW_MIPS,
    usage: TU.TEXTURE_BINDING | TU.STORAGE_BINDING,
  }));
  const FOAM_UBO_BYTES = 160;
  const foamUBO = mkBuf(FOAM_UBO_BYTES, GU.UNIFORM | GU.COPY_DST, 'foam ubo');
  const foamUArr = new ArrayBuffer(FOAM_UBO_BYTES);
  const foamUI = new Int32Array(foamUArr);
  const foamUF = new Float32Array(foamUArr);
  const foamSnap = new Int32Array(4);  // previous camera texel per level
  let foamFirst = true;
  let foamCur = 0;
  const stampBuf = mkBuf(MAX_STAMPS * 32, GU.STORAGE | GU.COPY_DST, 'foam stamps');
  const stampSorted = new Float32Array(MAX_STAMPS * 8);
  const samplerSim = device.createSampler({
    magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat',
  });
  const bgFoamUpd = [0, 1].map((i) => bg(foamUpdPipe, [{ buffer: foamUBO }, lvl(foamW[1 - i], 0), lvl(foamW[i], 0),
    fullArr(dispTex), fullArr(derivTex), samplerSim, samplerSim, { buffer: stampBuf }], 'foamupd' + i));
  const bgFoamMips = [0, 1].map((i) => {
    const out = [];
    for (let m = 1; m < FOAMW_MIPS; m++) out.push(bg(arr16MipPipe, [lvl(foamW[i], m - 1), lvl(foamW[i], m)]));
    return out;
  });

  // --------------------------------------------------------------------------------------
  // Atmosphere resources
  // --------------------------------------------------------------------------------------
  const atmoUBO = mkBuf(16, GU.UNIFORM | GU.COPY_DST, 'atmo ubo');
  const mkLut = (w, h, label) => device.createTexture({
    label, size: [w, h], format: 'rgba16float', usage: TU.TEXTURE_BINDING | TU.STORAGE_BINDING,
  });
  const transLUT = mkLut(256, 64, 'transmittance');
  const msLUT = mkLut(32, 32, 'multiscatter');
  const skyLUT = mkLut(SKY_W, SKY_H, 'skyview');
  const envTex = device.createTexture({
    label: 'env cube', size: [ENV_SIZE, ENV_SIZE, 6], format: 'rgba16float', mipLevelCount: ENV_MIPS,
    usage: TU.TEXTURE_BINDING | TU.STORAGE_BINDING,
  });
  const envCubeView = envTex.createView({ dimension: 'cube' });
  const sampClamp = device.createSampler({
    magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge',
  });
  const sampRepeat = device.createSampler({
    magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 16,
  });
  // sun shadow map (filled by the game through hooks.preMain; cleared to "no occluder" until then)
  const SHADOW_SIZE = 2048;
  const shadowTex = device.createTexture({ label: 'shadow map', size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
  const shadowView = shadowTex.createView();
  const shadowSamp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  const shadowUBO = mkBuf(80, GU.UNIFORM | GU.COPY_DST, 'shadow ubo');
  const shadowU = new Float32Array(20);
  {
    const enc = device.createCommandEncoder();
    enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } }).end();
    device.queue.submit([enc.finish()]);
    device.queue.writeBuffer(shadowUBO, 0, shadowU);
  }
  const shadow = {
    size: SHADOW_SIZE, view: shadowView, sampler: shadowSamp, ubo: shadowUBO, enabled: false,
    /** vp: camera-relative light view-projection (column-major), texelUv = 1 / size, bias in clip depth */
    setLight(vp, bias, enabled) {
      shadowU.set(vp, 0);
      shadowU[16] = 1 / SHADOW_SIZE; shadowU[17] = bias; shadowU[18] = enabled ? 1 : 0; shadowU[19] = 0;
      device.queue.writeBuffer(shadowUBO, 0, shadowU);
      shadow.enabled = !!enabled;
    },
  };
  const frameUBO = mkBuf(384, GU.UNIFORM | GU.COPY_DST, 'frame ubo');
  const sunVisBuf = mkBuf(16, GU.STORAGE, 'sun visibility');
  const transView = transLUT.createView();
  const msView = msLUT.createView();
  const skyView = skyLUT.createView();

  const bgTrans = bg(transPipe, [{ buffer: atmoUBO }, transView], 'trans');
  const bgMS = bg(msPipe, [{ buffer: atmoUBO }, transView, sampClamp, msView], 'ms');
  const bgSkyView = bg(skyViewPipe, [{ buffer: frameUBO }, transView, msView, sampClamp, skyView], 'skyview');
  const bgEnv = bg(envPipe, [{ buffer: frameUBO }, transView, skyView, sampClamp, lvl(envTex, 0)], 'env');
  const bgSunVis = bg(sunVisPipe, [{ buffer: frameUBO }, transView, skyView, sampClamp, { buffer: sunVisBuf }], 'sunvis');
  const bgCubeMips = [];
  for (let m = 1; m < ENV_MIPS; m++) bgCubeMips.push(bg(cubeMipPipe, [lvl(envTex, m - 1), lvl(envTex, m)], 'cubemip' + m));

  // --------------------------------------------------------------------------------------
  // Render pipelines
  // --------------------------------------------------------------------------------------
  const MSAA = 4;
  const HDR = 'rgba16float';
  const DEPTH = 'depth32float';
  const [oceanMod, skyMod, downMod, upMod, compMod] = await Promise.all([
    shader(OCEAN, 'ocean'), shader(SKY_BG, 'sky'), shader(BLOOM_DOWN, 'bloom down'),
    shader(BLOOM_UP, 'bloom up'), shader(COMPOSITE, 'composite'),
  ]);
  const oceanPipe = await device.createRenderPipelineAsync({
    label: 'ocean', layout: 'auto',
    vertex: {
      module: oceanMod, entryPoint: 'vs',
      buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }],
    },
    fragment: { module: oceanMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' },
    multisample: { count: MSAA },
  });
  const skyPipe = await device.createRenderPipelineAsync({
    label: 'sky', layout: 'auto',
    vertex: { module: skyMod, entryPoint: 'vs' },
    fragment: { module: skyMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'equal' },
    multisample: { count: MSAA },
  });
  const downPipe = await device.createRenderPipelineAsync({
    label: 'bloom down', layout: 'auto',
    vertex: { module: downMod, entryPoint: 'vs' },
    fragment: { module: downMod, entryPoint: 'fs', targets: [{ format: HDR }] },
  });
  const upPipe = await device.createRenderPipelineAsync({
    label: 'bloom up', layout: 'auto',
    vertex: { module: upMod, entryPoint: 'vs' },
    fragment: {
      module: upMod, entryPoint: 'fs',
      targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }],
    },
  });
  const compPipe = await device.createRenderPipelineAsync({
    label: 'composite', layout: 'auto',
    vertex: { module: compMod, entryPoint: 'vs' },
    fragment: { module: compMod, entryPoint: 'fs', targets: [{ format: swapFormat }] },
  });

  const bgOcean = [0, 1].map((i) => bg(oceanPipe, [{ buffer: frameUBO }, transView, skyView, sampClamp,
    fullArr(dispTex), fullArr(derivTex), fullArr(momTex), foamTex.createView(), envCubeView, sampRepeat,
    fullArr(foamW[i]), { buffer: sunVisBuf }, shadowView, shadowSamp, { buffer: shadowUBO }], 'ocean' + i));
  const bgSky = bg(skyPipe, [{ buffer: frameUBO }, transView, skyView, sampClamp], 'sky');

  // --------------------------------------------------------------------------------------
  // Water height queries (async read-back, a few frames of latency). Point 0 is the camera so
  // it rides above passing crests; the game appends its own points (ships) after it.
  // --------------------------------------------------------------------------------------
  const probePtsBuf = mkBuf((MAX_PROBE + 1) * 8, GU.STORAGE | GU.COPY_DST, 'probe points');
  const probeOutBuf = mkBuf(MAX_PROBE * 4, GU.STORAGE | GU.COPY_SRC, 'probe out');
  const bgProbe = bg(probePipe, [{ buffer: frameUBO }, fullArr(dispTex), samplerSim, { buffer: probePtsBuf }, { buffer: probeOutBuf }], 'probe');
  const probeSlots = [0, 1, 2].map(() => ({ buf: mkBuf(MAX_PROBE * 4, GU.MAP_READ | GU.COPY_DST, 'probe read'), busy: false, tag: null, n: 0 }));
  const probeF = new Float32Array((MAX_PROBE + 1) * 2);
  const water = {
    /** number of game points (does not include the camera point) */
    count: 0,
    /** opaque object stored with the request and handed back with its results */
    tag: null,
    /** latest heights; heights[i] belongs to the game point i of the request that just completed */
    heights: new Float32Array(MAX_PROBE),
    /** displaced surface height under the camera (smoothed latest sample) */
    camH: 0,
    setPoint(i, x, z) { probeF[(i + 2) * 2] = x; probeF[(i + 2) * 2 + 1] = z; },
  };
  const maxGamePoints = MAX_PROBE - 1;

  // --------------------------------------------------------------------------------------
  // Foam stamps
  // --------------------------------------------------------------------------------------
  const foam = {
    stamps: new Float32Array(MAX_STAMPS * 8),
    count: 0,
    wakeDecay: 0.03,   // 1/s: how long ship wakes stay visible
    /** capsule from (x0,z0) to (x1,z1); wake = slow foam, fresh = dense bright foam, dense = ordinary foam */
    add(x0, z0, x1, z1, radius, wake, fresh, dense) {
      if (this.count >= MAX_STAMPS) return;
      const o = this.count++ * 8;
      const s = this.stamps;
      s[o] = x0; s[o + 1] = z0; s[o + 2] = x1; s[o + 3] = z1;
      s[o + 4] = Math.max(radius, 1.6); s[o + 5] = wake; s[o + 6] = fresh; s[o + 7] = dense;
    },
  };

  // CDLOD grid mesh
  // quads per node edge (?grid=16 / 8 thins the surface mesh for slow GPUs and software rasterisers)
  const GRID = [8, 16, 24, 32, 48, 64].includes(Number(qs.get('grid'))) ? Number(qs.get('grid')) : 32;
  const LEAF = 2.0;           // finest node size (m) -> 6.25 cm vertex spacing
  const R0 = 8 * LEAF;        // LOD 0 range
  const LODS = 17;
  const MAX_DIST = 160000;
  const MAX_NODES = 8192;
  const idx = new Uint16Array(GRID * GRID * 6);
  {
    let k = 0;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const a = i + j * (GRID + 1), b = a + 1, c = a + GRID + 1, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
        idx[k++] = a; idx[k++] = d; idx[k++] = b;
      }
    }
  }
  const idxBuf = mkBuf(idx.byteLength, GU.INDEX | GU.COPY_DST, 'grid idx');
  device.queue.writeBuffer(idxBuf, 0, idx);
  const instData = new Float32Array(MAX_NODES * 4);
  const instBuf = mkBuf(instData.byteLength, GU.VERTEX | GU.COPY_DST, 'instances');

  // --------------------------------------------------------------------------------------
  // Screen-size dependent targets
  // --------------------------------------------------------------------------------------
  const BLOOM_LEVELS = 8;
  const linSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const compUBO = mkBuf(32, GU.UNIFORM | GU.COPY_DST, 'composite ubo');
  const compData = new Float32Array(8);
  const bloomUBOs = [];
  for (let i = 0; i < BLOOM_LEVELS * 2; i++) bloomUBOs.push(mkBuf(16, GU.UNIFORM | GU.COPY_DST, 'bloom ubo'));

  let renderScale = options.renderScale ?? (Number(qs.get('scale')) || 1);
  // Test mode for software rasterisers: after the first frames the wave / sky / foam compute
  // only runs every `lite` frames (0 = always, the normal mode).
  let lite = options.lite ?? (Number(qs.get('lite')) || 0);
  const skipFoam = qs.get('skipfoam') === '1';
  let W = 0, H = 0;
  let colorMS, depthMS, hdrTex, bloomTex, offTex = null;
  const matte = qs.get('matte') === '1';
  const mainPass = {
    colorAttachments: [{ view: null, resolveTarget: null, clearValue: matte ? { r: 0, g: 0.5, b: 0, a: 1 } : { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
    depthStencilAttachment: { view: null, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  };
  const compPass = {
    colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    timestampWrites: undefined,
  };
  let downPasses = [], upPasses = [], downBGs = [], upBGs = [], bgComp = null;

  function resize() {
    const fw = Number(qs.get('w')) || 0, fh = Number(qs.get('h')) || 0;
    const dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr || Infinity);
    const w = fw || Math.max(1, Math.round(canvas.clientWidth * dpr * renderScale));
    const h = fh || Math.max(1, Math.round(canvas.clientHeight * dpr * renderScale));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    for (const t of [colorMS, depthMS, hdrTex, bloomTex, offTex]) t && t.destroy();
    colorMS = device.createTexture({ size: [W, H], format: HDR, sampleCount: MSAA, usage: TU.RENDER_ATTACHMENT });
    depthMS = device.createTexture({ size: [W, H], format: DEPTH, sampleCount: MSAA, usage: TU.RENDER_ATTACHMENT });
    hdrTex = device.createTexture({ size: [W, H], format: HDR, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
    offTex = offscreen ? device.createTexture({ size: [W, H], format: swapFormat, usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC }) : null;
    const bw = Math.max(1, W >> 1), bh = Math.max(1, H >> 1);
    bloomTex = device.createTexture({ size: [bw, bh], format: HDR, mipLevelCount: BLOOM_LEVELS, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
    mainPass.colorAttachments[0].view = colorMS.createView();
    mainPass.colorAttachments[0].resolveTarget = hdrTex.createView();
    mainPass.depthStencilAttachment.view = depthMS.createView();
    const hdrView = hdrTex.createView();
    const bv = [];
    for (let m = 0; m < BLOOM_LEVELS; m++) bv.push(bloomTex.createView({ baseMipLevel: m, mipLevelCount: 1 }));
    downPasses = []; upPasses = []; downBGs = []; upBGs = [];
    const tmp = new Float32Array(4);
    for (let m = 0; m < BLOOM_LEVELS; m++) {
      const srcW = m === 0 ? W : Math.max(1, bw >> (m - 1));
      const srcH = m === 0 ? H : Math.max(1, bh >> (m - 1));
      tmp[0] = 1 / srcW; tmp[1] = 1 / srcH; tmp[2] = m === 0 ? 1 : 0; tmp[3] = 0;
      device.queue.writeBuffer(bloomUBOs[m], 0, tmp);
      downBGs.push(bg(downPipe, [m === 0 ? hdrView : bv[m - 1], linSamp, { buffer: bloomUBOs[m] }]));
      downPasses.push({ colorAttachments: [{ view: bv[m], clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    }
    for (let m = BLOOM_LEVELS - 1; m > 0; m--) {
      const sw = Math.max(1, bw >> m), sh = Math.max(1, bh >> m);
      tmp[0] = 1 / sw; tmp[1] = 1 / sh; tmp[2] = 1.0; tmp[3] = 1.0;
      const ubo = bloomUBOs[BLOOM_LEVELS + m];
      device.queue.writeBuffer(ubo, 0, tmp);
      upBGs.push(bg(upPipe, [bv[m], linSamp, { buffer: ubo }]));
      upPasses.push({ colorAttachments: [{ view: bv[m - 1], loadOp: 'load', storeOp: 'store' }] });
    }
    bgComp = bg(compPipe, [hdrView, bv[0], linSamp, { buffer: compUBO }]);
  }

  // --------------------------------------------------------------------------------------
  // GPU timing
  // --------------------------------------------------------------------------------------
  let tsQuery = null, tsResolve = null, tsRead = null, tsPending = false, gpuMs = 0;
  let firstPassTS = undefined;
  if (hasTS) {
    tsQuery = device.createQuerySet({ type: 'timestamp', count: 2 });
    tsResolve = mkBuf(16, GU.QUERY_RESOLVE | GU.COPY_SRC, 'ts resolve');
    tsRead = mkBuf(16, GU.MAP_READ | GU.COPY_DST, 'ts read');
    firstPassTS = { querySet: tsQuery, beginningOfPassWriteIndex: 0 };
    compPass.timestampWrites = { querySet: tsQuery, endOfPassWriteIndex: 1 };
  }
  const computeDesc = { timestampWrites: firstPassTS };
  const onTsMapped = () => {
    const t = new BigUint64Array(tsRead.getMappedRange());
    const ms = Number(t[1] - t[0]) / 1e6;
    if (ms > 0 && ms < 1000) gpuMs = gpuMs ? gpuMs * 0.8 + ms * 0.2 : ms;
    tsRead.unmap();
    tsPending = false;
  };
  const onTsFail = () => { tsPending = false; };

  // --------------------------------------------------------------------------------------
  // Uniform data
  // --------------------------------------------------------------------------------------
  const simF = new Float32Array(56);
  const frameF = new Float32Array(96);
  const atmoF = new Float32Array(4);
  const proj = new Float32Array(16), view = new Float32Array(16), viewProj = new Float32Array(16);
  const LOOP = 600.0;  // s, spectrum time loop (frequencies quantised to it)
  let needSpectrum = true, needLUT = true, envFull = lite ? 1 : 2;

  function writeSimStatic() {
    for (let c = 0; c < C; c++) {
      const L = CASC_L[c];
      simF[c] = L;
      simF[8 + c] = c === 0 ? Math.PI / L : (2 * Math.PI * 6) / L;            // kMin
      simF[16 + c] = c < C - 1 ? (2 * Math.PI * 6) / CASC_L[c + 1] : (Math.PI * N / L) * 0.98; // kMax
    }
    for (let c = 1; c < C; c++) simF[8 + c] = simF[16 + c - 1];
    simF[40] = P.windSpeed; simF[41] = P.windDir * D2R; simF[42] = P.fetchKm * 1000; simF[43] = 3.3;
    const ks = 2 * Math.PI / P.swellLength;
    simF[44] = P.swellHs; simF[45] = P.swellDir * D2R; simF[46] = Math.sqrt(9.81 * ks); simF[47] = P.swellSpread;
    simF[48] = P.choppy; simF[49] = 0.0012; simF[50] = LOOP; simF[51] = 1;
    simF[54] = 2.2; simF[55] = 1.0;
  }

  // --------------------------------------------------------------------------------------
  // Camera (owned by the game; the engine only reads it)
  // --------------------------------------------------------------------------------------
  const cam = { x: 0, y: 2.4, z: 0, yaw: 0, pitch: -5.5 * D2R, fovY: 58 * D2R };
  if (qs.get('cam')) {
    const v = qs.get('cam').split(',').map(Number);
    cam.x = v[0]; cam.y = v[1]; cam.z = v[2]; cam.yaw = (v[3] || 0) * D2R; cam.pitch = (v[4] || 0) * D2R;
  }
  if (qs.get('fov')) cam.fovY = Number(qs.get('fov')) * D2R;

  // --------------------------------------------------------------------------------------
  // CDLOD node selection (CPU, allocation free)
  // --------------------------------------------------------------------------------------
  const ranges = new Float64Array(LODS);
  for (let l = 0; l < LODS; l++) ranges[l] = R0 * Math.pow(2, l);
  const planes = new Float64Array(16);
  const HB = 4.0;   // vertical bound of displaced surface
  const XB = 4.0;   // horizontal displacement margin for culling
  let nodeCount = 0, ccx = 0, ccy = 0, ccz = 0;

  function sphereHit(x0, z0, size, r) {
    const dx = Math.max(x0 - ccx, 0, ccx - (x0 + size));
    const dz = Math.max(z0 - ccz, 0, ccz - (z0 + size));
    const dy = Math.max(-HB - ccy, 0, ccy - HB);
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  function inFrustum(x0, z0, size) {
    const minx = x0 - XB - ccx, maxx = x0 + size + XB - ccx;
    const minz = z0 - XB - ccz, maxz = z0 + size + XB - ccz;
    const miny = -HB - ccy, maxy = HB - ccy;
    for (let p = 0; p < 16; p += 4) {
      const a = planes[p], b = planes[p + 1], c = planes[p + 2], d = planes[p + 3];
      const px = a > 0 ? maxx : minx, py = b > 0 ? maxy : miny, pz = c > 0 ? maxz : minz;
      if (a * px + b * py + c * pz + d < 0) return false;
    }
    return true;
  }
  function addNode(x0, z0, size, lod) {
    if (nodeCount >= MAX_NODES) return;
    const o = nodeCount * 4;
    instData[o] = x0; instData[o + 1] = z0; instData[o + 2] = size; instData[o + 3] = lod;
    nodeCount++;
  }
  function selectNode(x0, z0, size, lod) {
    if (!sphereHit(x0, z0, size, ranges[lod])) return false;
    if (!sphereHit(x0, z0, size, MAX_DIST) || !inFrustum(x0, z0, size)) return true;
    if (lod === 0 || !sphereHit(x0, z0, size, ranges[lod - 1])) { addNode(x0, z0, size, lod); return true; }
    const h = size * 0.5;
    for (let i = 0; i < 4; i++) {
      const nx = x0 + (i & 1) * h, nz = z0 + (i >> 1) * h;
      if (!selectNode(nx, nz, h, lod - 1)) {
        if (sphereHit(nx, nz, h, MAX_DIST) && inFrustum(nx, nz, h)) addNode(nx, nz, h, lod - 1);
      }
    }
    return true;
  }
  function selectAll() {
    nodeCount = 0;
    ccx = cam.x; ccy = cam.y; ccz = cam.z;
    // side planes from the camera-relative view-projection (rows 3±0, 3±1)
    const m = viewProj;
    for (let i = 0; i < 4; i++) {
      const r = i >> 1, s = (i & 1) ? -1 : 1;
      planes[i * 4] = m[3] + s * m[r];
      planes[i * 4 + 1] = m[7] + s * m[4 + r];
      planes[i * 4 + 2] = m[11] + s * m[8 + r];
      planes[i * 4 + 3] = m[15] + s * m[12 + r];
    }
    const top = LODS - 1;
    const ts = LEAF * Math.pow(2, top);
    const x0 = Math.floor((ccx - MAX_DIST) / ts), x1 = Math.floor((ccx + MAX_DIST) / ts);
    const z0 = Math.floor((ccz - MAX_DIST) / ts), z1 = Math.floor((ccz + MAX_DIST) / ts);
    for (let zi = z0; zi <= z1; zi++) {
      for (let xi = x0; xi <= x1; xi++) selectNode(xi * ts, zi * ts, ts, top);
    }
  }

  // --------------------------------------------------------------------------------------
  // Per-frame uniforms
  // --------------------------------------------------------------------------------------
  let simTime = Number(qs.get('t')) || 0;
  let frameIndex = 0;

  function writeFrame(time) {
    const aspect = W / H;
    const tanY = Math.tan(cam.fovY * 0.5), tanX = tanY * aspect;
    const near = 0.05;
    proj.fill(0);
    proj[0] = 1 / tanX; proj[5] = 1 / tanY; proj[11] = -1; proj[14] = near;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fx = cp * sy, fy = sp, fz = -cp * cy;            // forward
    const rx = cy, ry = 0, rz = sy;                          // right
    let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx; // up = right x fwd
    // camera roll (cockpit view): the right side dips by cam.roll
    let rxx = rx, ryy = ry, rzz = rz;
    if (cam.roll) {
      const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
      rxx = rx * cr - ux * sr; ryy = ry * cr - uy * sr; rzz = rz * cr - uz * sr;
      const nux = ux * cr + rx * sr, nuy = uy * cr + ry * sr, nuz = uz * cr + rz * sr;
      ux = nux; uy = nuy; uz = nuz;
    }
    view.fill(0);
    view[0] = rxx; view[4] = ryy; view[8] = rzz;
    view[1] = ux; view[5] = uy; view[9] = uz;
    view[2] = -fx; view[6] = -fy; view[10] = -fz;
    view[15] = 1;
    mat4Mul(viewProj, proj, view);
    const f = frameF;
    f.set(viewProj, 0);
    f[16] = cam.x; f[17] = cam.y; f[18] = cam.z; f[19] = time;
    f[20] = rxx * tanX; f[21] = ryy * tanX; f[22] = rzz * tanX; f[23] = 0;
    f[24] = ux * tanY; f[25] = uy * tanY; f[26] = uz * tanY; f[27] = 0;
    f[28] = fx; f[29] = fy; f[30] = fz; f[31] = 0;
    const se = P.sunElev * D2R, sa = P.sunAzim * D2R;
    f[32] = Math.sin(sa) * Math.cos(se); f[33] = Math.sin(se); f[34] = -Math.cos(sa) * Math.cos(se); f[35] = 14.0;
    f[36] = W; f[37] = H; f[38] = 1 / W; f[39] = 1 / H;
    for (let c = 0; c < C; c++) { f[40 + c] = CASC_L[c]; f[48 + c] = 1 / CASC_L[c]; }
    f[56] = Math.cos(P.windDir * D2R); f[57] = Math.sin(P.windDir * D2R); f[58] = P.windSpeed;
    f[64] = R0; f[65] = GRID; f[66] = FOAM_LEVEL_SIZE[0]; f[67] = FOAM_LEVEL_SIZE[1];
    f[68] = P.exposure; f[69] = P.bloom; f[70] = frameIndex; f[71] = DBG;
    f[72] = P.haze; f[73] = Math.max(cam.y, 10) * 0.001; f[74] = P.veil; f[75] = 0.9;
    // deep water body scatter colour (greenish coastal water), unresolved slope variance
    f[76] = 0.016 * P.turbidity; f[77] = 0.080 * P.turbidity; f[78] = 0.096 * P.turbidity; f[79] = 0.0024;
    f[80] = 0.035; f[81] = 0.120; f[82] = 0.085; f[83] = 2.6;
    f[84] = 0.36 + 0.12 * P.foam; f[85] = 2.5; f[86] = 1.0; f[87] = 1.0;
    f[88] = (5.802e-3 + 4.40e-3 * P.haze) * 1e-3;
    f[89] = (13.558e-3 + 4.40e-3 * P.haze) * 1e-3;
    f[90] = (33.1e-3 + 4.40e-3 * P.haze) * 1e-3;
    f[91] = 1.1e-4;
    f[92] = 1.5; f[93] = P.clouds; f[94] = 2.2; f[95] = time;
    device.queue.writeBuffer(frameUBO, 0, f);
  }

  // --------------------------------------------------------------------------------------
  // Frame
  // --------------------------------------------------------------------------------------
  const submitList = [null];
  const fixedDt = options.fixedDt ?? (Number(qs.get('fixedDt')) || 0);
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, fpsT = 0;
  let inflight = 0;
  const stats = { fps: 0, frameMs: 0, gpuMs: 0, nodes: 0, width: 0, height: 0 };
  let capturePending = null;

  const hooks = {
    /** (dtReal, now) — game logic + camera. Fill water.* / foam.* here. */
    update: null,
    /** (frame) — upload per-frame GPU data that depends on the final camera. */
    prepare: null,
    /** (commandEncoder) — extra passes before the main one (shadow map). */
    preMain: null,
    /** (renderPass) — opaque geometry, drawn before the ocean (ships). */
    drawOpaque: null,
    /** (renderPass) — blended geometry, drawn after the sky (particles). */
    drawOverlay: null,
    /** (tag, count) — water heights for `tag` just landed in water.heights. */
    onWater: null,
  };

  function encodeSim(cp) {
    cp.setPipeline(evolvePipe);
    cp.setBindGroup(0, bgEvolve);
    cp.dispatchWorkgroups(N / 16, N / 16, C);
    cp.setPipeline(rowsPipe);
    cp.setBindGroup(0, bgRows);
    cp.dispatchWorkgroups(N, 1, C);
    cp.setPipeline(colsPipe);
    cp.setBindGroup(0, bgCols);
    cp.dispatchWorkgroups(N, 1, C);
    cp.setPipeline(simMipPipe);
    for (let m = 1; m < SIM_MIP_COUNT; m++) {
      const s = N >> m;
      cp.setBindGroup(0, bgSimMips[m - 1]);
      cp.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8), C);
    }
    // foam clipmaps
    if (skipFoam) return;
    foamCur = 1 - foamCur;
    cp.setPipeline(foamUpdPipe);
    cp.setBindGroup(0, bgFoamUpd[foamCur]);
    cp.dispatchWorkgroups(FOAM_RES / 8, FOAM_RES / 8, 2);
    cp.setPipeline(arr16MipPipe);
    const fm = bgFoamMips[foamCur];
    for (let m = 1; m < FOAMW_MIPS; m++) {
      const s = Math.max(1, FOAM_RES >> m);
      cp.setBindGroup(0, fm[m - 1]);
      cp.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8), 2);
    }
  }

  function writeFoamUniforms(dt) {
    for (let l = 0; l < 2; l++) {
      const ts = FOAM_LEVEL_SIZE[l] / FOAM_RES;
      const cx = Math.floor(cam.x / ts), cz = Math.floor(cam.z / ts);
      foamUI[l * 4] = cx; foamUI[l * 4 + 1] = cz;
      // first frame: pretend the previous window was far away so everything is reset
      foamUI[l * 4 + 2] = foamFirst ? cx + 100000 : foamSnap[l * 2];
      foamUI[l * 4 + 3] = foamFirst ? cz + 100000 : foamSnap[l * 2 + 1];
      foamSnap[l * 2] = cx; foamSnap[l * 2 + 1] = cz;
      foamUF[8 + l] = ts;
    }
    foamFirst = false;
    foamUF[10] = dt; foamUF[11] = 0.22;          // decay 1/s
    foamUF[12] = 0.52 + 0.16 * P.foam; foamUF[13] = 2.0; foamUF[14] = 1.0; foamUF[15] = 0;
    for (let c = 0; c < C; c++) { foamUF[16 + c] = CASC_L[c]; foamUF[24 + c] = 1 / CASC_L[c]; }
    const drift = 0.03 * P.windSpeed;
    foamUF[32] = Math.cos(P.windDir * D2R) * drift; foamUF[33] = Math.sin(P.windDir * D2R) * drift;
    // order the stamps: those touching the fine (level 0) window first, so that level 0 only loops over them
    let nNear = 0;
    if (foam.count) {
      const src = foam.stamps, dst = stampSorted;
      const half = FOAM_LEVEL_SIZE[0] * 0.5 + 6;
      let a = 0, bIdx = foam.count;
      for (let i = 0; i < foam.count; i++) {
        const o = i * 8, r = src[o + 4];
        const minx = Math.min(src[o], src[o + 2]) - r, maxx = Math.max(src[o], src[o + 2]) + r;
        const minz = Math.min(src[o + 1], src[o + 3]) - r, maxz = Math.max(src[o + 1], src[o + 3]) + r;
        const near = maxx > cam.x - half && minx < cam.x + half && maxz > cam.z - half && minz < cam.z + half;
        const d = near ? a++ : --bIdx;
        dst.set(src.subarray(o, o + 8), d * 8);
      }
      nNear = a;
      device.queue.writeBuffer(stampBuf, 0, dst, 0, foam.count * 8);
    }
    foamUF[36] = foam.count; foamUF[37] = foam.wakeDecay; foamUF[38] = nNear; foamUF[39] = 0;
    device.queue.writeBuffer(foamUBO, 0, foamUArr);
  }

  // Manual mode (?manual=1): no free-running loop. engine.step(dt) renders exactly one frame of `dt` seconds, which is what the
  // offline video recorder (tools/trailer) needs to be deterministic.
  const manual = qs.get('manual') === '1';
  let forcedDt = 0;
  let computeOnly = false;      // manual mode: run the simulation / probe passes but draw nothing (pre-roll of a recorded scene)
  function frame(now) {
    requestAnimationFrame(frame);
    if (manual) return;
    renderFrame(now);
  }
  function renderFrame(now) {
    // Back-pressure: never let the CPU run more than 2 frames ahead of the GPU (software
    // rasterisers in particular would otherwise queue up work without bound).
    if (inflight >= 2) return;
    resize();
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++; fpsT += dt;
    if (fpsT > 0.5) {
      stats.fps = fpsN / fpsAcc;
      stats.frameMs = 1000 / stats.fps;
      fpsAcc = 0; fpsN = 0; fpsT = 0;
    }
    stats.gpuMs = gpuMs; stats.nodes = nodeCount; stats.width = W; stats.height = H;
    if (fixedDt) dt = fixedDt;
    if (forcedDt) dt = forcedDt;

    water.count = 0;
    foam.count = 0;
    if (hooks.update) hooks.update(dt, now);
    simTime += dt;
    if (simTime > LOOP) simTime -= LOOP;
    frameIndex++;

    writeFrame(simTime);
    writeSimStatic();
    simF[52] = simTime; simF[53] = dt;
    device.queue.writeBuffer(simUBO, 0, simF);
    writeFoamUniforms(dt);
    selectAll();
    if (nodeCount) device.queue.writeBuffer(instBuf, 0, instData, 0, nodeCount * 4);
    if (hooks.prepare) hooks.prepare(frameIndex);

    // water height queries: point 0 = camera, then the game's points
    const nProbe = Math.min(water.count, maxGamePoints) + 1;
    probeF[0] = nProbe; probeF[1] = 0;
    probeF[2] = cam.x; probeF[3] = cam.z;
    device.queue.writeBuffer(probePtsBuf, 0, probeF, 0, (nProbe + 1) * 2);
    let slot = null;
    for (const s of probeSlots) if (!s.busy) { slot = s; break; }

    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass(computeDesc);
    if (needSpectrum) {
      cp.setPipeline(initPipe);
      cp.setBindGroup(0, bgInit);
      cp.dispatchWorkgroups(N / 16, N / 16, C);
      needSpectrum = false;
    }
    if (needLUT) {
      atmoF[0] = P.haze;
      device.queue.writeBuffer(atmoUBO, 0, atmoF);
      cp.setPipeline(transPipe);
      cp.setBindGroup(0, bgTrans);
      cp.dispatchWorkgroups(256 / 8, 64 / 8);
      cp.setPipeline(msPipe);
      cp.setBindGroup(0, bgMS);
      cp.dispatchWorkgroups(32 / 8, 32 / 8);
      needLUT = false;
    }
    const heavy = !lite || frameIndex <= 2 || envFull > 0 || frameIndex % lite === 0;
    if (heavy) encodeSim(cp);
    cp.setPipeline(probePipe);
    cp.setBindGroup(0, bgProbe);
    cp.dispatchWorkgroups(Math.ceil(nProbe / 64));
    if (heavy) {
      cp.setPipeline(skyViewPipe);
      cp.setBindGroup(0, bgSkyView);
      cp.dispatchWorkgroups(Math.ceil(SKY_W / 8), Math.ceil(SKY_H / 8));
      cp.setPipeline(sunVisPipe);
      cp.setBindGroup(0, bgSunVis);
      cp.dispatchWorkgroups(1);
      cp.setPipeline(envPipe);
      cp.setBindGroup(0, bgEnv);
      // one cube face per frame (all six on start-up / after parameter changes)
      cp.dispatchWorkgroups(ENV_SIZE / 8, ENV_SIZE / 8, envFull > 0 ? 6 : 1);
      if (envFull > 0) envFull--;
      cp.setPipeline(cubeMipPipe);
      for (let m = 1; m < ENV_MIPS; m++) {
        const s = Math.max(1, ENV_SIZE >> m);
        cp.setBindGroup(0, bgCubeMips[m - 1]);
        cp.dispatchWorkgroups(Math.ceil(s / 8), Math.ceil(s / 8), 6);
      }
    }
    cp.end();

    let outTex = null;
    if (!computeOnly) {
      if (hooks.preMain) hooks.preMain(enc);
      const rp = enc.beginRenderPass(mainPass);
      if (hooks.drawOpaque) hooks.drawOpaque(rp);
      if (nodeCount && engine.showOcean) {      // ?ocean=0: model previews without the sea (much faster on a software rasteriser); the 3D viewer toggles it
        rp.setPipeline(oceanPipe);
        rp.setBindGroup(0, bgOcean[foamCur]);
        rp.setVertexBuffer(0, instBuf);
        rp.setIndexBuffer(idxBuf, 'uint16');
        rp.drawIndexed(GRID * GRID * 6, nodeCount);
      }
      // ?matte=1: no sky, a flat green background (the model silhouette can then be cut out exactly: tools/refs/silhouette.py)
      if (!matte) {
        rp.setPipeline(skyPipe);
        rp.setBindGroup(0, bgSky);
        rp.draw(3);
      }
      if (hooks.drawOverlay) hooks.drawOverlay(rp);
      rp.end();

      for (let m = 0; m < BLOOM_LEVELS; m++) {
        const p = enc.beginRenderPass(downPasses[m]);
        p.setPipeline(downPipe);
        p.setBindGroup(0, downBGs[m]);
        p.draw(3);
        p.end();
      }
      for (let i = 0; i < upPasses.length; i++) {
        const p = enc.beginRenderPass(upPasses[i]);
        p.setPipeline(upPipe);
        p.setBindGroup(0, upBGs[i]);
        p.draw(3);
        p.end();
      }

      compData[0] = P.exposure; compData[1] = P.bloom; compData[2] = frameIndex % 64; compData[3] = P.vignette;
      compData[4] = P.saturation; compData[5] = P.contrast; compData[6] = P.warmth; compData[7] = 0;
      device.queue.writeBuffer(compUBO, 0, compData);
      outTex = offscreen ? offTex : ctx.getCurrentTexture();
      compPass.colorAttachments[0].view = outTex.createView();
      const pc = enc.beginRenderPass(compPass);
      pc.setPipeline(compPipe);
      pc.setBindGroup(0, bgComp);
      pc.draw(3);
      pc.end();
    }

    if (slot) {
      const bytes = nProbe * 4;
      enc.copyBufferToBuffer(probeOutBuf, 0, slot.buf, 0, bytes);
      slot.busy = true; slot.tag = water.tag; slot.n = nProbe;
    }
    let doTs = false;
    if (hasTS && !tsPending && (frameIndex & 7) === 0) {
      enc.resolveQuerySet(tsQuery, 0, 2, tsResolve, 0);
      enc.copyBufferToBuffer(tsResolve, 0, tsRead, 0, 16);
      doTs = true;
    }
    let capture = null;
    if (capturePending && outTex) {
      capture = capturePending; capturePending = null;
      const bpr = Math.ceil(W * 4 / 256) * 256;
      capture.buf = device.createBuffer({ size: bpr * H, usage: GU.MAP_READ | GU.COPY_DST });
      capture.bpr = bpr;
      enc.copyTextureToBuffer({ texture: outTex }, { buffer: capture.buf, bytesPerRow: bpr }, [W, H]);
    }
    submitList[0] = enc.finish();
    device.queue.submit(submitList);
    inflight++;
    device.queue.onSubmittedWorkDone().then(() => { inflight--; });
    if (slot) {
      slot.buf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Float32Array(slot.buf.getMappedRange(0, slot.n * 4));
        water.camH = src[0];
        water.heights.set(src.subarray(1, slot.n), 0);
        slot.buf.unmap();
        slot.busy = false;
        if (hooks.onWater) hooks.onWater(slot.tag, slot.n - 1);
      }, () => { slot.busy = false; });
    }
    if (doTs) { tsPending = true; tsRead.mapAsync(GPUMapMode.READ).then(onTsMapped, onTsFail); }
    if (capture) readCapture(capture);
  }

  async function readCapture(c) {
    try {
      await c.buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(c.buf.getMappedRange());
      const img = new ImageData(W, H);
      const bgra = swapFormat === 'bgra8unorm';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const s = y * c.bpr + x * 4, d = (y * W + x) * 4;
          img.data[d] = src[s + (bgra ? 2 : 0)];
          img.data[d + 1] = src[s + 1];
          img.data[d + 2] = src[s + (bgra ? 0 : 2)];
          img.data[d + 3] = 255;
        }
      }
      c.buf.unmap();
      c.buf.destroy();
      const oc = new OffscreenCanvas(W, H);
      oc.getContext('2d').putImageData(img, 0, 0);
      const blob = await oc.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      c.res(btoa(s));
    } catch (e) { c.rej(e); }
  }

  // current camera -> CSS pixel coordinates (for labels). out = [x, y, depth]; returns false behind the camera.
  const projOut = [0, 0, 0];
  function project(wx, wy, wz, out = projOut) {
    const rx = wx - cam.x, ry = wy - cam.y, rz = wz - cam.z;
    const m = viewProj;
    const cw = m[3] * rx + m[7] * ry + m[11] * rz + m[15];
    if (cw <= 0.01) return false;
    const cx = m[0] * rx + m[4] * ry + m[8] * rz + m[12];
    const cy = m[1] * rx + m[5] * ry + m[9] * rz + m[13];
    out[0] = (cx / cw * 0.5 + 0.5) * canvas.clientWidth;
    out[1] = (1 - (cy / cw * 0.5 + 0.5)) * canvas.clientHeight;
    out[2] = cw;
    return out;
  }

  resize();
  addEventListener('resize', resize);

  const engine = {
    device, canvas, P, qs, cam, hooks, water, foam, shadow, stats, hasTS, offscreen,
    /** draw the ocean surface (off: sky only) */
    showOcean: qs.get('ocean') !== '0',
    /** shared GPU resources for game pipelines (same pass layout as the ocean) */
    gpu: {
      device, HDR, DEPTH, MSAA, swapFormat, frameUBO, transView, skyView, sampClamp, sampRepeat, envCubeView, sunVisBuf,
      mkBuf, shader, ocean: { FOAM_LEVEL_SIZE },
    },
    get width() { return W; },
    get height() { return H; },
    get viewProj() { return viewProj; },
    get simTime() { return simTime; },
    get frameIndex() { return frameIndex; },
    project,
    /** Is a sphere (camera-relative centre, radius) inside the side planes of the view frustum? (reverse-Z: no far plane) */
    sphereVisible(rx, ry, rz, r) {
      const m = viewProj;
      // planes = row3 +/- row0, row3 +/- row1 of the column-major view-projection matrix
      for (let k = 0; k < 4; k++) {
        const sgn = (k & 1) ? -1 : 1, row = k < 2 ? 0 : 1;
        const a = m[3] + sgn * m[row], b = m[7] + sgn * m[4 + row], c = m[11] + sgn * m[8 + row], d = m[15] + sgn * m[12 + row];
        if (a * rx + b * ry + c * rz + d < -r * Math.hypot(a, b, c)) return false;
      }
      return true;
    },
    setRenderScale(s) { renderScale = Math.max(0.25, Math.min(2, s)); W = H = 0; },
    getRenderScale() { return renderScale; },
    /** flag a parameter change: 'spec' rebuilds the wave spectrum, 'lut' the atmosphere, anything refreshes the env map */
    markDirty(kind) {
      if (kind === 'spec') needSpectrum = true;
      if (kind === 'lut') needLUT = true;
      envFull = 2;
    },
    /** PNG of the next rendered frame, as a base64 string */
    capture() { return new Promise((res, rej) => { capturePending = { res, rej }; }); },
    start() { requestAnimationFrame(frame); },
    manual,
    /** Change the 'lite' interval (heavy compute every Nth frame, 0 = every frame): the recorder pre-rolls cheaply and films at full rate. */
    setLite(n) { lite = n; },
    /** Manual mode: render one frame of `dt` seconds, wait for the GPU, and resolve with the PNG (base64) when `capture` is set. */
    async step(dt, capture = false, render = true) {
      forcedDt = dt;
      computeOnly = !render;
      inflight = 0;
      const cap = capture && render ? this.capture() : null;
      renderFrame(performance.now());
      forcedDt = 0;
      computeOnly = false;
      await device.queue.onSubmittedWorkDone();
      // let the asynchronous water-height read-back of this frame land before the simulation moves on
      for (let i = 0; i < 200 && probeSlots.some((p) => p.busy); i++) await new Promise((r) => setTimeout(r, 2));
      return cap ? await cap : null;
    },
  };
  return engine;
}
